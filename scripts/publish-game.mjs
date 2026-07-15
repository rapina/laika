#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
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
  verifyReleaseDirectory,
} from './lib/publication.mjs'

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
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--game') options.game = argv[++index]
    else if (argument === '--blob-origin') options.blobOrigin = argv[++index]
    else if (argument === '--production-url') options.productionUrl = argv[++index]
    else if (argument === '--timeout-seconds') options.timeoutSeconds = Number(argv[++index])
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
      existsSync(join(current, 'RTK.md')) &&
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

function loadContext(workspace, gameInput, blobOriginInput) {
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
      '--allow-overwrite',
      'false',
      '--add-random-suffix',
      'false',
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
  const context = loadContext(initialContext.workspace, initialContext.gameDirectory, initialContext.plan.blobOrigin)
  if (context.plan.planSha256 !== initialContext.plan.planSha256) {
    throw new Error('게임 gate 실행 뒤 publication plan이 바뀌었습니다. dry-run부터 다시 확인하세요.')
  }
  const bypassSecret = await resolveAutomationBypass(context, options.productionUrl)
  context.env.VERCEL_AUTOMATION_BYPASS_SECRET = bypassSecret
  await uploadRelease(context)

  const repository = githubRepository(context.arcadeDirectory)
  const branch = `release/${context.plan.slug}-${context.plan.releaseSha.slice(0, 12)}-${context.plan.planSha256.slice(0, 8)}`
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
const context = loadContext(workspace, options.game, options.blobOrigin)

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
  }
  process.stdout.write(stableJson(report))
} else {
  await publish(context, options)
}
