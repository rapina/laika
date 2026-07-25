#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  buildPublicationPlan,
  normalizeBlobOrigin,
  redactSecrets,
  selectLatestVercelStatus,
  selectVercelDeployments,
  sha256,
  stableJson,
  validateVercelDeploymentUrl,
  verifyGradeLegibility,
  verifyIdleRun,
  verifyPlayabilityResult,
  verifyPublishedScreenshotFreshness,
  verifyReleaseDirectory,
} from './lib/publication.mjs'
import { scanDevMarkers, formatDevMarkerReport } from './lib/dev-markers.mjs'
import { scanCaptureTiming, formatCaptureTimingReport } from './lib/capture-timing.mjs'

const SECRET_ENV_PATTERN = /(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY)/i
const BLOB_FETCH_TIMEOUT_MS = 10_000
const REMOTE_RETRY_DELAYS_MS = [0, 500, 1_500, 3_000]
const UPLOAD_VERIFY_DELAYS_MS = [0, 500, 1_000, 2_000, 4_000, 8_000]
const BLOB_CLI_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'CI',
  'NO_COLOR',
  'USER',
  'LOGNAME',
]
const DEPLOYMENT_PRIVATE_ENV_KEYS = new Set([
  'BLOB_READ_WRITE_TOKEN',
  'BLOB_STORE_ID',
  'VERCEL_OIDC_TOKEN',
  'VERCEL_TOKEN',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
  'GH_TOKEN',
  'GITHUB_TOKEN',
])

class ProductionSmokeError extends Error {
  constructor(origin, cause) {
    super(`production smoke가 실패했습니다 (${origin}): ${cause.message}`)
    this.name = 'ProductionSmokeError'
  }
}

function parseArgs(argv) {
  const options = {
    mode: 'dry-run',
    game: null,
    blobOrigin: null,
    productionUrl: 'https://laika365.vercel.app',
    timeoutSeconds: 420,
    replacePublished: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--game') options.game = argv[++index]
    else if (argument === '--blob-origin') options.blobOrigin = argv[++index]
    else if (argument === '--production-url') options.productionUrl = argv[++index]
    else if (argument === '--timeout-seconds') options.timeoutSeconds = Number(argv[++index])
    else if (argument === '--replace-published') options.replacePublished = true
    else if (argument === '--dry-run') options.mode = 'dry-run'
    else if (argument === '--publish') options.mode = 'publish'
    else throw new Error(`알 수 없는 인자입니다: ${argument}`)
  }
  if (!options.game) throw new Error('--game 경로를 명시해야 합니다.')
  if (!Number.isSafeInteger(options.timeoutSeconds) || options.timeoutSeconds < 60 || options.timeoutSeconds > 1800) {
    throw new Error('--timeout-seconds는 60~1800 사이 정수여야 합니다.')
  }
  options.productionUrl = validateVercelDeploymentUrl(options.productionUrl)
  return options
}

function findWorkspace(start) {
  let current = resolve(start)
  const filesystemRoot = parse(current).root
  while (true) {
    if (
      existsSync(join(current, 'AGENTS.md')) &&
      existsSync(join(current, 'arcade')) &&
      existsSync(join(current, 'catalog/games.json'))
    ) return current
    if (current === filesystemRoot) break
    current = dirname(current)
  }
  throw new Error('Sputnik Workshop 루트를 찾지 못했습니다.')
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function configuredBlobOrigin(vercelConfig) {
  const rewrite = vercelConfig.rewrites?.find((candidate) =>
    candidate.source === '/__game-assets/:path*')
  if (typeof rewrite?.destination !== 'string' || !rewrite.destination.endsWith('/:path*')) return null
  return rewrite.destination.slice(0, -'/:path*'.length)
}

function secretValues(...environments) {
  return [...new Set(environments.flatMap((environment) =>
    Object.entries(environment ?? {})
      .filter(([key, value]) => SECRET_ENV_PATTERN.test(key) && typeof value === 'string' && value)
      .map(([, value]) => value)))]
}

function environmentWithoutSecrets(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) =>
    !SECRET_ENV_PATTERN.test(key) && !DEPLOYMENT_PRIVATE_ENV_KEYS.has(key)))
}

function blobCliEnvironment(token) {
  const environment = Object.fromEntries(BLOB_CLI_ENV_ALLOWLIST
    .filter((key) => typeof process.env[key] === 'string')
    .map((key) => [key, process.env[key]]))
  environment.BLOB_READ_WRITE_TOKEN = token
  return environment
}

function subprocessError(executable, args, error, secrets) {
  const output = [error?.stdout, error?.stderr]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join('\n')
  const detail = error?.message && !output ? `\n${error.message}` : output ? `\n${output}` : ''
  return new Error(redactSecrets(`${executable} ${args.join(' ')} 실패${detail}`, secrets))
}

function git(cwd, args, options = {}) {
  return command(cwd, 'git', args, { capture: options.capture !== false })
}

function command(cwd, executable, args, options = {}) {
  const environment = options.replaceEnv
    ? { ...(options.env ?? {}) }
    : { ...process.env, ...(options.env ?? {}) }
  const secrets = secretValues(process.env, options.env)
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) {
    throw subprocessError(executable, args, {
      message: result.error.message,
      stdout: result.stdout,
      stderr: result.stderr,
    }, secrets)
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(redactSecrets(
      `${executable} ${args.join(' ')} 실패${output ? `\n${output}` : ''}`,
      secrets,
    ))
  }
  const stdout = redactSecrets(String(result.stdout ?? ''), secrets)
  const stderr = redactSecrets(String(result.stderr ?? ''), secrets)
  if (options.capture) return stdout.trim()
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
  return ''
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return values
}

function atomicWriteJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, stableJson(value), { mode: 0o644 })
  renameSync(temporary, path)
}

// 개발용 표시 게이트: sequence 12가 배열 번호·판정 상자·픽셀 좌표 덤프를
// 운영까지 그대로 내보냈다. `docs/quality-bar.md`가 이미 금지하고 있었지만
// 산문이라 아무도 막지 못했다. 여기서 게시를 거부한다.
//
// 한계: 글자로 드러나는 것만 잡는다. 판정 영역을 그대로 드러낸 불투명 도형처럼
// 그림으로만 보이는 개발 표시는 여전히 사람이 캡처를 봐야 한다.
function verifyDevMarkers(gameDirectory) {
  const sourceRoot = join(gameDirectory, 'src')
  if (!existsSync(sourceRoot)) return
  const files = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push({ path: relative(gameDirectory, full), text: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(sourceRoot)
  const findings = scanDevMarkers(files)
  if (findings.length > 0) {
    throw new Error(
      `개발용 표시가 화면 경로에 남아 있습니다. 재료 표현으로 바꾸거나 __DEV_BUILD__ 가드 안으로 옮기세요.\n${formatDevMarkerReport(findings).join('\n')}`,
    )
  }
}

// 캡처 타이밍 게이트: sequence 13이 핵심 동사의 재료 반응 미달을 공개까지
// 내보냈다. 설계 검토 두 번이 통과시켰는데, 검증 캡처가 고정 지연으로 셔터를
// 눌러 1100ms짜리 해소를 지나쳐 **다음 판**을 찍고 있었기 때문이다. 증거가
// 결함을 담은 적이 없으니 검토는 결함을 볼 수 없었다.
//
// 검토를 한 번 더 돌리는 것으로는 고쳐지지 않는다. 눈먼 지점이 증거 생성에
// 있으면 그 증거를 보는 검토는 몇 번을 돌려도 같은 곳을 지난다. 여기서 막는다.
const captureTimingGateFromSequence = 14

function verifyCaptureTiming(gameDirectory) {
  const sequence = readJson(join(gameDirectory, '.studio.json')).sequence
  if (Number.isInteger(sequence) && sequence < captureTimingGateFromSequence) return
  const scriptRoot = join(gameDirectory, 'scripts')
  if (!existsSync(scriptRoot)) return
  const files = []
  for (const entry of readdirSync(scriptRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(mjs|js|ts)$/.test(entry.name)) continue
    const full = join(scriptRoot, entry.name)
    files.push({ path: relative(gameDirectory, full), text: readFileSync(full, 'utf8') })
  }
  const findings = scanCaptureTiming(files)
  if (findings.length > 0) {
    throw new Error(
      '핵심 동사 캡처를 고정 지연으로 찍고 있습니다. 드라이버 왕복은 수백 ms라 지연은 해소 순간을 지나치고, ' +
        '그렇게 찍힌 증거는 틀렸다고 알리지 않은 채 엉뚱한 순간을 담습니다. 렌더 상태를 관측해서 셔터를 누르세요.\n' +
        `${formatCaptureTimingReport(findings).join('\n')}`,
    )
  }
}

// 설계 검토 게이트(ADR 0006): sequence 009부터 독립 검토의 pass verdict와
// 현재 smoke 증거에 결속된 sourceHash 없이는 게시 계획 자체를 만들지 않는다.
const designReviewRequiredFromSequence = 9

function verifyDesignReviewGate(gameDirectory) {
  const sequence = readJson(join(gameDirectory, '.studio.json')).sequence
  const reviewPath = join(gameDirectory, 'design-review.json')
  if (!existsSync(reviewPath)) {
    if (Number.isInteger(sequence) && sequence < designReviewRequiredFromSequence) return
    throw new Error('design-review.json이 없습니다. 설계 검토 게이트를 먼저 통과하세요.')
  }
  const review = readJson(reviewPath)
  if (review.verdict !== 'pass') {
    throw new Error(`설계 검토 verdict가 pass가 아닙니다: "${review.verdict}". 공개를 진행할 수 없습니다.`)
  }
  const smokePath = join(gameDirectory, 'smoke-result.json')
  if (!existsSync(smokePath)) throw new Error('smoke-result.json이 없어 설계 검토의 sourceHash를 대조할 수 없습니다.')
  const smokeHash = readJson(smokePath).sourceHash
  if (typeof review.sourceHash !== 'string' || review.sourceHash !== smokeHash) {
    throw new Error('설계 검토의 sourceHash가 현재 smoke 증거와 다릅니다. 소스 변경 뒤 재검토가 필요합니다.')
  }
  if (review.method?.inputPath !== 'pointer-events') {
    throw new Error('설계 검토가 실제 입력 경로(pointer-events) 플레이를 포함하지 않았습니다.')
  }
  verifyPromiseTable(review)
  verifyStrategyLegibility(review, sequence)
  verifyGradeLegibility(review, sequence)
  const playabilityPath = join(gameDirectory, 'verification', 'playability-result.json')
  const playabilityProfile = existsSync(playabilityPath) ? readJson(playabilityPath).profile : undefined
  verifyIdleRun(review, sequence, playabilityProfile)
  verifyInputCoverage(review, gameDirectory)
  verifyPublishedScreenshotFreshness(gameDirectory, smokeHash, readJson)
  verifyPlayabilityResult(gameDirectory, smokeHash, sequence, readJson)
}

// 이기는 방법이 화면에서 배워지는가.
//
// sequence 13은 판정에 들어가는 모든 값이 화면에서 읽혔고 독립 검토 두 번이
// 그것을 옳게 인증했다. 그런데 이 게임의 깊이 축(띠 근처에서는 일부러 비껴 쳐
// 전진을 아낀다)은 화면 어디에도 없었고, 화면 안내는 오히려 지는 조언을 했다.
// 값이 읽히는 것과 전략이 배워지는 것은 다른 질문이라 검사도 따로 있어야 한다.
//
// 기계가 답의 진위를 판정할 수는 없다. 대신 검토자가 이기는 방법을 한 줄로
// 적고 그것을 가르치는 화면 요소를 짚도록 강제한다. 짚을 것이 없다고 스스로
// 적으면 그때는 기계가 막는다.
const strategyGateFromSequence = 14

function verifyStrategyLegibility(review, sequence) {
  if (Number.isInteger(sequence) && sequence < strategyGateFromSequence) return
  const block = review.strategyLegibility
  if (!block || typeof block !== 'object') {
    throw new Error('design-review.json에 strategyLegibility가 없습니다. 이기는 방법이 화면에서 배워지는지 검토해야 합니다.')
  }
  if (typeof block.winningStrategy !== 'string' || block.winningStrategy.trim().length < 10) {
    throw new Error('strategyLegibility.winningStrategy가 비었습니다. 이기는 방법을 한 줄로 적어야 합니다.')
  }
  if (block.taughtOnScreen !== true) {
    throw new Error('이기는 방법을 화면이 가르치지 않습니다(taughtOnScreen이 true가 아님). 깊이 축이 규칙 안에만 있으면 대부분의 플레이어에게는 없는 것과 같습니다.')
  }
  if (typeof block.taughtBy !== 'string' || block.taughtBy.trim().length === 0) {
    throw new Error('strategyLegibility.taughtBy가 비었습니다. 이기는 방법을 가르치는 화면 요소를 짚어야 합니다.')
  }
}

// 문서화한 조작은 전부 검토에서 실제로 눌러 봐야 한다. sequence 12는 manifest에
// 적힌 키보드 조작이 런타임의 정답 벡터를 그대로 실행하는 자동 조준이었는데,
// 검토가 포인터만 플레이해서 그 경로가 검사된 적이 없었다.
function verifyInputCoverage(review, gameDirectory) {
  const manifestPath = join(gameDirectory, 'game.manifest.json')
  if (!existsSync(manifestPath)) return
  const controls = readJson(manifestPath).controls ?? {}
  const documented = new Set()
  for (const locale of Object.keys(controls)) {
    for (const key of Object.keys(controls[locale] ?? {})) documented.add(key)
  }
  if (documented.size === 0) return

  // 검토자는 "keyboard: 방향키가 3°씩 움직였다"처럼 관측을 함께 적는 편이 낫다.
  // 정확히 일치하는 키만 세면 그런 기록이 통째로 무시돼, 검토자가 맨 키를
  // 따로 덧붙이게 된다(sequence 12에서 실제로 그랬다). 앞부분만 맞으면 센다.
  const entries = review.method?.inputPathsExercised ?? []
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('design-review.json의 method.inputPathsExercised가 없습니다. manifest에 적은 조작을 각각 실제로 플레이했는지 기록해야 합니다.')
  }
  // 구분자는 `:`과 공백만이 아니다. sequence 13 유지보수의 검토자는
  // `primary-tap-anywhere (ko: …)`처럼 하이픈으로 이어 적었고, 여덟 조작을
  // 전부 실제로 눌렀는데도 게이트는 "하나도 누르지 않았다"고 읽었다. 같은
  // 마찰이 sequence 12에서도 났다(그때는 사람이 키를 손으로 덧붙여 넘겼다).
  // 두 번 났으면 형식이 아니라 검사를 고친다. 키 뒤에 영숫자가 아닌 무엇이
  // 오면 경계로 본다. `keyboardless` 같은 다른 낱말은 여전히 세지 않는다.
  const covers = (control, entry) => {
    if (typeof entry !== 'string') return false
    const normalized = entry.trim().toLowerCase()
    const key = control.toLowerCase()
    if (normalized === key) return true
    return normalized.startsWith(key) && /[^a-z0-9]/.test(normalized.charAt(key.length))
  }
  const uncovered = [...documented].filter((control) => !entries.some((entry) => covers(control, entry)))
  if (uncovered.length > 0) {
    throw new Error(`검토가 플레이하지 않은 조작이 있습니다: ${uncovered.join(', ')}. manifest에 적힌 조작은 전부 눌러 보고 결과를 대조표에 남깁니다.`)
  }
}

// 설계 검토의 핵심은 약속 대조표다. 약속(claim)과 관측(observed)을 나란히 적어야
// GDD가 말한 것과 화면에 있는 것의 차이가 드러난다. sequence 12에서 검토자가
// 자기 스키마를 지어내 claim을 통째로 빼고 관측만 적었고, 그 결과 "표적이 물결로
// 보이는가" 같은 약속은 검사 대상이 된 적조차 없었다.
function verifyPromiseTable(review) {
  const promises = review.promises
  if (!Array.isArray(promises) || promises.length === 0) {
    throw new Error('design-review.json에 promises 대조표가 없습니다.')
  }
  const statuses = new Set(['met', 'gap', 'fatal'])
  const text = (value) => (typeof value === 'string' ? value.trim() : '')
  promises.forEach((promise, index) => {
    const label = `promises[${index}]${promise.id ? ` (${promise.id})` : ''}`
    if (!text(promise.id)) throw new Error(`${label}: id가 필요합니다.`)
    if (!statuses.has(promise.status)) throw new Error(`${label}: status는 met, gap, fatal 중 하나여야 합니다.`)
    if (!text(promise.source)) throw new Error(`${label}: source가 필요합니다. 어느 문서의 어느 절을 약속으로 삼았는지 적습니다.`)
    if (!text(promise.claim)) throw new Error(`${label}: claim이 비어 있습니다. GDD가 약속한 내용을 그대로 적어야 대조가 성립합니다.`)
    if (!text(promise.observed)) throw new Error(`${label}: observed가 비어 있습니다. 실제 빌드에서 확인한 것을 적습니다.`)
  })
  const fatal = promises.filter((promise) => promise.status === 'fatal')
  if (fatal.length > 0) {
    throw new Error(`치명 간극이 남아 있습니다: ${fatal.map((promise) => promise.id).join(', ')}`)
  }
}

function loadContext(workspace, gameInput, blobOriginInput, allowPublishedReplacement = false) {
  const gameDirectory = resolve(workspace, gameInput)
  if (!existsSync(join(gameDirectory, '.git'))) throw new Error('게임 경로가 독립 Git 저장소가 아닙니다.')
  const arcadeDirectory = join(workspace, 'arcade')
  const env = {
    ...parseEnvFile(join(arcadeDirectory, '.env.local')),
    ...process.env,
  }
  const vercelConfig = readJson(join(arcadeDirectory, 'vercel.json'))
  const blobOriginValue = blobOriginInput ?? env.BLOB_PUBLIC_ORIGIN ?? configuredBlobOrigin(vercelConfig)
  if (!blobOriginValue) {
    throw new Error('BLOB_PUBLIC_ORIGIN 또는 --blob-origin이 필요합니다. Blob token에서 origin을 추측하지 않습니다.')
  }
  const blobOrigin = normalizeBlobOrigin(blobOriginValue)
  const releasePath = join(gameDirectory, 'dist-arcade/release.json')
  if (!existsSync(releasePath)) throw new Error('dist-arcade/release.json이 없습니다.')
  const releaseJsonBytes = readFileSync(releasePath)
  const release = JSON.parse(releaseJsonBytes.toString('utf8'))
  verifyReleaseDirectory(join(gameDirectory, 'dist-arcade'), release)
  verifyDevMarkers(gameDirectory)
  verifyCaptureTiming(gameDirectory)
  verifyDesignReviewGate(gameDirectory)
  const gitHead = git(gameDirectory, ['rev-parse', 'HEAD'])
  const plan = buildPublicationPlan({
    studio: readJson(join(gameDirectory, '.studio.json')),
    manifest: readJson(join(gameDirectory, 'game.manifest.json')),
    release,
    releaseJsonBytes,
    arcadeCatalog: readJson(join(arcadeDirectory, 'public/catalog/games.json')),
    rootCatalog: readJson(join(workspace, 'catalog/games.json')),
    vercelConfig,
    blobOrigin,
    gitHead,
    allowPublishedReplacement,
  })
  return {
    workspace,
    gameDirectory,
    arcadeDirectory,
    env,
    release,
    releasePath,
    plan,
  }
}

function vercelAuthPaths() {
  const paths = []
  if (process.env.XDG_DATA_HOME) paths.push(join(process.env.XDG_DATA_HOME, 'com.vercel.cli', 'auth.json'))
  if (process.env.APPDATA) paths.push(join(process.env.APPDATA, 'com.vercel.cli', 'auth.json'))
  if (process.platform === 'darwin') {
    paths.push(join(homedir(), 'Library', 'Application Support', 'com.vercel.cli', 'auth.json'))
  }
  paths.push(join(homedir(), '.local', 'share', 'com.vercel.cli', 'auth.json'))
  paths.push(join(homedir(), '.vercel', 'auth.json'))
  return [...new Set(paths)]
}

function vercelAuthToken() {
  for (const path of vercelAuthPaths()) {
    if (!existsSync(path)) continue
    const auth = readJson(path)
    if (typeof auth.token === 'string' && auth.token) return auth.token
  }
  throw new Error('Vercel CLI 인증을 찾지 못했습니다. arcade에서 vercel login과 vercel whoami를 실행하세요.')
}

function linkedVercelProject(arcadeDirectory) {
  const path = join(arcadeDirectory, '.vercel/repo.json')
  if (!existsSync(path)) {
    throw new Error('Vercel 프로젝트 연결이 없습니다. arcade에서 vercel link --project laika --scope rapinas-projects를 실행하세요.')
  }
  const linked = readJson(path)
  const project = linked.projects?.find((candidate) => candidate.directory === '.') ?? linked.projects?.[0]
  if (typeof project?.id !== 'string' || typeof project?.orgId !== 'string') {
    throw new Error('arcade/.vercel/repo.json에서 연결된 프로젝트를 찾지 못했습니다.')
  }
  return project
}

function automationBypass(protectionBypass) {
  if (!protectionBypass || typeof protectionBypass !== 'object') return null
  return Object.entries(protectionBypass)
    .find(([, metadata]) => metadata?.scope === 'automation-bypass')?.[0] ?? null
}

async function readVercelProject(project, token) {
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(project.id)}`)
  url.searchParams.set('teamId', project.orgId)
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(BLOB_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Vercel project 확인 실패 (${response.status})`)
  return response.json()
}

async function resolveAutomationBypass(context, productionUrl) {
  if (context.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    return context.env.VERCEL_AUTOMATION_BYPASS_SECRET
  }

  const cliEnvironment = environmentWithoutSecrets()
  command(context.arcadeDirectory, 'vercel', ['whoami', '--no-color'], {
    capture: true,
    env: cliEnvironment,
    replaceEnv: true,
  })
  const project = linkedVercelProject(context.arcadeDirectory)
  const token = vercelAuthToken()
  let bypass = automationBypass((await readVercelProject(project, token)).protectionBypass)
  if (!bypass) {
    command(context.arcadeDirectory, 'vercel', [
      'curl',
      '/',
      '--deployment',
      productionUrl,
      '--yes',
    ], { capture: true, env: cliEnvironment, replaceEnv: true })
    bypass = automationBypass((await readVercelProject(project, token)).protectionBypass)
  }
  if (!bypass) {
    throw new Error('Vercel preview 자동 검증용 protection bypass를 만들지 못했습니다.')
  }
  return bypass
}

function ensureTargetClean(cwd, paths, label) {
  const status = git(cwd, ['status', '--porcelain', '--', ...paths])
  if (status) throw new Error(`${label}의 게시 대상 파일에 기존 변경이 있습니다.\n${status}`)
}

function ensureRemoteMain(cwd, label) {
  git(cwd, ['fetch', 'origin', 'main'])
  const head = git(cwd, ['rev-parse', 'HEAD'])
  const remote = git(cwd, ['rev-parse', 'origin/main'])
  if (head !== remote) throw new Error(`${label} HEAD가 origin/main과 다릅니다.`)
  const branch = git(cwd, ['branch', '--show-current'])
  if (branch !== 'main') throw new Error(`${label}는 main 브랜치에서 시작해야 합니다.`)
  return head
}

function ensureRemoteMainUnchanged(cwd, label, expectedCommit) {
  git(cwd, ['fetch', 'origin', 'main'])
  const branch = git(cwd, ['branch', '--show-current'])
  const head = git(cwd, ['rev-parse', 'HEAD'])
  const remote = git(cwd, ['rev-parse', 'origin/main'])
  if (branch !== 'main' || head !== expectedCommit || remote !== expectedCommit) {
    throw new Error(`${label} main이 게시 시작 뒤 바뀌었습니다. 자동 동기화를 중단합니다.`)
  }
}

function githubRepository(cwd) {
  const remote = git(cwd, ['remote', 'get-url', 'origin'])
  const match = /github\.com(?::|\/)([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote)
  if (!match) throw new Error(`GitHub origin을 해석하지 못했습니다: ${remote}`)
  return match[1]
}

function immutableReleaseError(message) {
  const error = new Error(message)
  error.code = 'IMMUTABLE_RELEASE_CORRUPT'
  return error
}

async function remoteObjectState(blobOrigin, upload) {
  const url = new URL(upload.pathname.split('/').map(encodeURIComponent).join('/'), `${blobOrigin}/`)
  let response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(BLOB_FETCH_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new Error(`${upload.pathname}: 원격 확인 요청 실패 (${cause.name ?? 'network error'})`)
  }
  if (response.status === 404) return { state: 'missing', url: url.href }
  if (!response.ok) throw new Error(`${upload.pathname}: 원격 확인 실패 (${response.status})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (bytes.byteLength !== upload.bytes || sha256(bytes) !== upload.sha256) {
    throw immutableReleaseError(`${upload.pathname}: 같은 불변 경로에 다른 파일이 있습니다.`)
  }
  if (!upload.contentTypes.includes(contentType)) {
    throw immutableReleaseError(
      `${upload.pathname}: Content-Type이 올바르지 않습니다 (${contentType || 'missing'}).`,
    )
  }
  return { state: 'verified', url: url.href }
}

async function remoteObjectStateWithRetry(blobOrigin, upload, {
  delays = REMOTE_RETRY_DELAYS_MS,
  retryMissing = false,
} = {}) {
  let lastError = null
  let lastState = null
  for (const wait of delays) {
    if (wait) await delay(wait)
    try {
      const state = await remoteObjectState(blobOrigin, upload)
      lastState = state
      lastError = null
      if (state.state === 'verified' || !retryMissing) return state
    } catch (error) {
      if (error.code === 'IMMUTABLE_RELEASE_CORRUPT') throw error
      lastError = error
    }
  }
  if (lastError) throw lastError
  return lastState
}

async function uploadRelease(context) {
  if (!context.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN이 없습니다. arcade에서 vercel env pull .env.local --yes를 실행하세요.')
  }
  const cliEnvironment = blobCliEnvironment(context.env.BLOB_READ_WRITE_TOKEN)
  const cliOptions = { capture: true, env: cliEnvironment, replaceEnv: true }
  command(context.workspace, 'vercel', ['--version'], cliOptions)

  const completionMarker = context.plan.uploads.at(-1)
  if (!completionMarker?.completionMarker) throw new Error('release.json completion marker가 업로드 계획의 마지막이 아닙니다.')
  const assets = context.plan.uploads.slice(0, -1)
  const markerState = await remoteObjectStateWithRetry(context.plan.blobOrigin, completionMarker)
  if (markerState.state === 'verified') {
    for (const upload of assets) {
      const state = await remoteObjectStateWithRetry(context.plan.blobOrigin, upload, {
        retryMissing: true,
      })
      if (state?.state !== 'verified') {
        throw immutableReleaseError(
          `${completionMarker.pathname}은 있지만 ${upload.pathname}이 없습니다. 불변 릴리스가 손상되어 자동 복구하지 않습니다.`,
        )
      }
      process.stdout.write(`skip ${upload.pathname}\n`)
    }
    process.stdout.write(`skip ${completionMarker.pathname}\n`)
    return
  }

  for (const upload of [...assets, completionMarker]) {
    const before = await remoteObjectStateWithRetry(context.plan.blobOrigin, upload)
    if (before.state === 'verified') {
      process.stdout.write(`skip ${upload.pathname}\n`)
      continue
    }

    const localPath = join(context.gameDirectory, 'dist-arcade', upload.relativePath)
    process.stdout.write(`upload ${upload.pathname}\n`)
    command(context.workspace, 'vercel', [
      'blob',
      'put',
      localPath,
      '--pathname',
      upload.pathname,
      '--cache-control-max-age',
      '31536000',
      '--access',
      'public',
      '--content-type',
      upload.contentTypes[0],
      '--non-interactive',
      '--no-color',
    ], cliOptions)

    const verified = await remoteObjectStateWithRetry(context.plan.blobOrigin, upload, {
      delays: UPLOAD_VERIFY_DELAYS_MS,
      retryMissing: true,
    })
    if (verified?.state !== 'verified') throw new Error(`${upload.pathname}: 업로드 뒤 검증하지 못했습니다.`)
  }
}

function applyArcadePlan(context) {
  atomicWriteJson(join(context.arcadeDirectory, 'public/catalog/games.json'), context.plan.arcadeCatalog)
  atomicWriteJson(join(context.arcadeDirectory, 'vercel.json'), context.plan.vercelConfig)
  command(context.arcadeDirectory, process.execPath, ['scripts/validate.mjs'], {
    env: environmentWithoutSecrets(),
    replaceEnv: true,
  })
}

function runGameGates(context) {
  const packageJson = readJson(join(context.gameDirectory, 'package.json'))
  const scripts = packageJson.scripts ?? {}
  const gateOptions = { env: environmentWithoutSecrets(), replaceEnv: true }
  command(context.gameDirectory, 'npm', ['test'], gateOptions)
  if (scripts.smoke) command(context.gameDirectory, 'npm', ['run', 'smoke'], gateOptions)
  if (existsSync(join(context.gameDirectory, 'scripts/viewport-smoke.mjs'))) {
    command(context.gameDirectory, process.execPath, ['scripts/viewport-smoke.mjs'], gateOptions)
  }
  if (!scripts['build:arcade'] || !scripts['verify:arcade']) {
    throw new Error('게임에 build:arcade와 verify:arcade 스크립트가 필요합니다.')
  }
  if (scripts['build:web']) command(context.gameDirectory, 'npm', ['run', 'build:web'], gateOptions)
  if (scripts['toss:build']) command(context.gameDirectory, 'npm', ['run', 'toss:build'], gateOptions)
  command(context.gameDirectory, 'npm', ['run', 'build:arcade'], gateOptions)
  command(context.gameDirectory, 'npm', ['run', 'verify:arcade'], gateOptions)
}

async function waitForDeployment(repository, sha, environment, pushedAt, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    const deployments = JSON.parse(command(process.cwd(), 'gh', [
      'api',
      '--method',
      'GET',
      `repos/${repository}/deployments`,
      '-f',
      `sha=${sha}`,
      '-f',
      'per_page=100',
    ], { capture: true }))
    const deployment = selectVercelDeployments(deployments, { sha, environment, pushedAt })[0]
    if (deployment) {
      const statuses = JSON.parse(command(process.cwd(), 'gh', [
        'api',
        `repos/${repository}/deployments/${deployment.id}/statuses`,
      ], { capture: true }))
      const latest = selectLatestVercelStatus(statuses, environment)
      if (latest?.state === 'success' && latest.environment_url) {
        return {
          deployment,
          status: latest,
          url: validateVercelDeploymentUrl(latest.environment_url),
        }
      }
      if (['error', 'failure'].includes(latest?.state)) {
        throw new Error(`${environment} 배포가 실패했습니다: ${latest.description ?? latest.state}`)
      }
    }
    await delay(5000)
  }
  throw new Error(`${environment} 배포를 기다리다 시간이 초과됐습니다.`)
}

async function waitForCatalog(origin, slug, releaseSha, timeoutSeconds, bypassSecret = null) {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin.replace(/\/$/, '')}/catalog/games.json?release=${Date.now()}`, {
        cache: 'no-store',
        headers: bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(BLOB_FETCH_TIMEOUT_MS),
      })
      if (response.ok) {
        const catalog = await response.json()
        const game = catalog.games?.find((candidate) => candidate.slug === slug)
        if (game?.status === 'published' && game.artifact?.version === releaseSha) return
      }
    } catch {
      // The deployment can be ready before its alias and CDN path settle.
    }
    await delay(3000)
  }
  throw new Error(`${origin}에서 게시된 catalog를 확인하지 못했습니다.`)
}

function runArcadeSmoke(context, origin) {
  const packageJson = readJson(join(context.gameDirectory, 'package.json'))
  const smokeEnvironment = {
    ...environmentWithoutSecrets(),
    ARCADE_URL: origin,
    ARCADE_SLUG: context.plan.slug,
    GAME_DIR: context.gameDirectory,
  }
  if (context.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    smokeEnvironment.VERCEL_AUTOMATION_BYPASS_SECRET = context.env.VERCEL_AUTOMATION_BYPASS_SECRET
  }
  const smokeOptions = { env: smokeEnvironment, replaceEnv: true }
  if (packageJson.scripts?.['smoke:arcade']) {
    command(context.gameDirectory, 'npm', ['run', 'smoke:arcade'], smokeOptions)
    return
  }
  command(
    context.arcadeDirectory,
    process.execPath,
    ['scripts/smoke-player.mjs', context.plan.slug],
    smokeOptions,
  )
}

function revertProduction(arcadeDirectory, releaseCommit) {
  try {
    git(arcadeDirectory, ['switch', 'main'], { capture: false })
    git(arcadeDirectory, ['fetch', 'origin', 'main'], { capture: false })
    const remoteMain = git(arcadeDirectory, ['rev-parse', 'origin/main'])
    if (remoteMain !== releaseCommit) {
      throw new Error('origin/main이 게시 커밋과 달라 자동 revert를 중단합니다.')
    }
    git(arcadeDirectory, ['merge', '--ff-only', 'origin/main'], { capture: false })
    if (git(arcadeDirectory, ['rev-parse', 'HEAD']) !== releaseCommit) {
      throw new Error('로컬 main이 게시 커밋과 달라 자동 revert를 중단합니다.')
    }
    git(arcadeDirectory, ['revert', '--no-edit', releaseCommit], { capture: false })
    git(arcadeDirectory, ['push', 'origin', 'HEAD:main'], { capture: false })
  } catch (error) {
    throw new Error(`production 검증 실패 후 자동 revert도 실패했습니다: ${error.message}`)
  }
}

function restoreArcadeMain(arcadeDirectory) {
  try {
    git(arcadeDirectory, ['switch', 'main'], { capture: false })
    git(arcadeDirectory, ['pull', '--ff-only', 'origin', 'main'], { capture: false })
    return null
  } catch (error) {
    return error
  }
}

function productionSmoke(context, origin) {
  try {
    runArcadeSmoke(context, origin)
  } catch (error) {
    throw new ProductionSmokeError(origin, error)
  }
}

async function publish(initialContext, options) {
  ensureTargetClean(initialContext.arcadeDirectory, ['public/catalog/games.json', 'vercel.json'], 'Arcade')
  ensureTargetClean(initialContext.workspace, ['catalog/games.json', 'arcade'], '관제 저장소')
  ensureRemoteMain(initialContext.arcadeDirectory, 'Arcade')
  const rootBaseCommit = ensureRemoteMain(initialContext.workspace, '관제 저장소')
  ensureRemoteMain(initialContext.gameDirectory, '게임 저장소')
  if (git(initialContext.gameDirectory, ['status', '--porcelain'])) {
    throw new Error('게임 저장소가 깨끗하지 않습니다. 릴리스 소스 커밋을 먼저 확정하세요.')
  }

  runGameGates(initialContext)
  if (git(initialContext.gameDirectory, ['status', '--porcelain'])) {
    throw new Error('게임 gate가 저장소를 변경했습니다. 생성물을 정리하거나 커밋한 뒤 다시 게시하세요.')
  }
  const context = loadContext(
    initialContext.workspace,
    initialContext.gameDirectory,
    initialContext.plan.blobOrigin,
    options.replacePublished,
  )
  if (context.plan.planSha256 !== initialContext.plan.planSha256) {
    throw new Error('게임 gate 실행 뒤 publication plan이 바뀌었습니다. dry-run부터 다시 확인하세요.')
  }
  const bypassSecret = await resolveAutomationBypass(context, options.productionUrl)
  context.env.VERCEL_AUTOMATION_BYPASS_SECRET = bypassSecret
  await uploadRelease(context)

  const repository = githubRepository(context.arcadeDirectory)
  const branchBase = `release/${context.plan.slug}-${context.plan.releaseSha.slice(0, 12)}-${context.plan.planSha256.slice(0, 8)}`
  let branch = branchBase
  for (let attempt = 2; git(context.arcadeDirectory, ['branch', '--list', branch])
    || git(context.arcadeDirectory, ['ls-remote', '--heads', 'origin', branch]); attempt += 1) {
    branch = `${branchBase}-${attempt}`
  }
  git(context.arcadeDirectory, ['switch', '-c', branch], { capture: false })
  let releaseCommit = null
  let productionPushed = false
  let preview = null
  let production = null
  try {
    applyArcadePlan(context)
    git(context.arcadeDirectory, ['add', 'public/catalog/games.json', 'vercel.json'])
    git(context.arcadeDirectory, [
      'commit',
      '--only',
      '-m',
      `Publish ${context.plan.slug} ${context.plan.releaseSha.slice(0, 12)}`,
      '--',
      'public/catalog/games.json',
      'vercel.json',
    ], { capture: false })
    releaseCommit = git(context.arcadeDirectory, ['rev-parse', 'HEAD'])
    const previewPushedAt = new Date().toISOString()
    git(context.arcadeDirectory, ['push', '--set-upstream', 'origin', branch], { capture: false })

    preview = await waitForDeployment(
      repository,
      releaseCommit,
      'Preview',
      previewPushedAt,
      options.timeoutSeconds,
    )
    await waitForCatalog(
      preview.url,
      context.plan.slug,
      context.plan.releaseSha,
      options.timeoutSeconds,
      bypassSecret,
    )
    runArcadeSmoke(context, preview.url)

    const productionPushedAt = new Date().toISOString()
    git(context.arcadeDirectory, ['push', 'origin', `${releaseCommit}:main`], { capture: false })
    productionPushed = true
    production = await waitForDeployment(
      repository,
      releaseCommit,
      'Production',
      productionPushedAt,
      options.timeoutSeconds,
    )
    await waitForCatalog(
      production.url,
      context.plan.slug,
      context.plan.releaseSha,
      options.timeoutSeconds,
      bypassSecret,
    )
    productionSmoke(context, production.url)
    await waitForCatalog(
      options.productionUrl,
      context.plan.slug,
      context.plan.releaseSha,
      options.timeoutSeconds,
      bypassSecret,
    )
    productionSmoke(context, options.productionUrl)
  } catch (error) {
    if (error instanceof ProductionSmokeError && productionPushed && releaseCommit) {
      try {
        revertProduction(context.arcadeDirectory, releaseCommit)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'production smoke와 자동 revert가 모두 실패했습니다.',
        )
      }
    } else {
      restoreArcadeMain(context.arcadeDirectory)
    }
    throw error
  }

  const warnings = []
  const restoreError = restoreArcadeMain(context.arcadeDirectory)
  if (restoreError) warnings.push(`Arcade 로컬 main 동기화 실패: ${restoreError.message}`)

  let rootSynced = false
  if (!restoreError) {
    try {
      ensureTargetClean(context.workspace, ['catalog/games.json'], '관제 저장소')
      ensureRemoteMainUnchanged(context.workspace, '관제 저장소', rootBaseCommit)
      atomicWriteJson(join(context.workspace, 'catalog/games.json'), context.plan.rootCatalog)
      git(context.workspace, ['add', 'catalog/games.json', 'arcade'])
      git(context.workspace, [
        'commit',
        '--only',
        '-m',
        `Record ${context.plan.slug} Arcade publication`,
        '--',
        'catalog/games.json',
        'arcade',
      ], { capture: false })
      git(context.workspace, ['push', 'origin', 'main'], { capture: false })
      rootSynced = true
    } catch (error) {
      warnings.push(`관제 저장소 동기화 실패: ${error.message}`)
    }
  }

  try {
    git(context.arcadeDirectory, ['push', 'origin', '--delete', branch], { capture: false })
  } catch (error) {
    warnings.push(`원격 release 브랜치 정리 실패: ${error.message}`)
  }
  try {
    git(context.arcadeDirectory, ['branch', '-d', branch], { capture: false })
  } catch (error) {
    warnings.push(`로컬 release 브랜치 정리 실패: ${error.message}`)
  }

  process.stdout.write(stableJson({
    status: rootSynced ? 'published' : 'published-root-sync-pending',
    slug: context.plan.slug,
    releaseSha: context.plan.releaseSha,
    manifestSha256: context.plan.manifestSha256,
    previewUrl: preview.url,
    productionDeploymentUrl: production.url,
    productionUrl: options.productionUrl,
    arcadeCommit: releaseCommit,
    ...(warnings.length ? { warnings: warnings.map((warning) =>
      redactSecrets(warning, secretValues(context.env, process.env))) } : {}),
  }))
  if (!rootSynced) process.exitCode = 1
}

const options = parseArgs(process.argv.slice(2))
const workspace = findWorkspace(process.cwd())
const context = loadContext(workspace, options.game, options.blobOrigin, options.replacePublished)

if (options.mode === 'dry-run') {
  const report = {
    mode: 'dry-run',
    game: relative(workspace, context.gameDirectory),
    slug: context.plan.slug,
    releaseSha: context.plan.releaseSha,
    manifestSha256: context.plan.manifestSha256,
    blobOrigin: context.plan.blobOrigin,
    blobPrefix: context.plan.blobPrefix,
    uploads: context.plan.uploads,
    filesToChange: [
      'arcade/public/catalog/games.json',
      'arcade/vercel.json',
      'catalog/games.json',
    ],
    planSha256: context.plan.planSha256,
    replacePublished: options.replacePublished,
  }
  process.stdout.write(stableJson(report))
} else {
  await publish(context, options)
}
