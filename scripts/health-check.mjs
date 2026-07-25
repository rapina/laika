#!/usr/bin/env node
/**
 * 검증층 건강 검사.
 *
 * 제작을 시작하기 전에 "검사하는 쪽"이 성한지 먼저 본다. 게이트가 깨진 채로
 * 게임을 만들면 통과 여부가 아무 의미가 없고, 그 상태가 며칠씩 이어져도
 * 아무도 모른다(2026-07-18: 잠금 스크립트 테스트가 하루 동안 6/6 실패인 채로
 * 게임 두 편이 그 위를 지나갔다).
 *
 *   node scripts/health-check.mjs [--json]
 *
 * 종료 코드 0이면 제작을 시작해도 된다. 1이면 검증층을 먼저 고쳐야 한다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const json = process.argv.includes('--json')
const checks = []

function record(name, ok, detail, blocking = true) {
  checks.push({ name, ok, blocking, detail })
}

function run(command, args, cwd = root) {
  try {
    const stdout = execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, stdout }
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    return { ok: false, stdout: output.split('\n').slice(-6).join('\n') }
  }
}

function run_(command, args, cwd) {
  return run(command, args, cwd)
}

function scriptsIn(directory, extensions) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => join(directory, entry.name))
}

// 1. 게이트 스크립트가 문법적으로 살아 있는가.
const parseTargets = [
  ...scriptsIn(join(root, 'scripts'), ['.mjs']),
  ...scriptsIn(join(root, 'arcade/scripts'), ['.mjs']),
  ...scriptsIn(join(root, 'arcade/public/assets'), ['.js']),
  ...scriptsIn(join(root, 'launchpad/scripts'), ['.mjs', '.js']),
]
const parseFailures = parseTargets.filter((file) => !run(process.execPath, ['--check', file]).ok)
record('스크립트 문법', parseFailures.length === 0,
  parseFailures.length ? parseFailures.map((file) => file.replace(`${root}/`, '')) : `${parseTargets.length}개 통과`)

// 2. 잠금·공개 계약 테스트. 이 층이 빨가면 잠금 게이트의 동작이 미검증 상태다.
for (const test of scriptsIn(join(root, 'scripts'), ['.test.mjs'])) {
  const relative = test.replace(`${root}/`, '')
  const result = run(process.execPath, ['--test', test])
  record(`테스트 ${relative}`, result.ok, result.ok ? '통과' : result.stdout)
}

// 3. 공개 카탈로그 스키마. 다음 게임이 등록될 자리다.
const validate = run(process.execPath, ['arcade/scripts/validate.mjs'])
record('아케이드 카탈로그 검증', validate.ok, validate.ok ? validate.stdout.trim() : validate.stdout)

// 4. 스킬 트리 미러 무결성. 두 경로가 갈라지면 한쪽만 고친 규칙이 생긴다.
const mirrors = [
  ['.agents/skills/make-daily-game', '.claude/skills/make-daily-game'],
  ['.agents/skills/run-studio-cycle', '.claude/skills/run-studio-cycle'],
]
const split = []
for (const [a, b] of mirrors) {
  const left = join(root, a)
  const right = join(root, b)
  if (!existsSync(left) || !existsSync(right)) { split.push(`${a} 또는 ${b} 없음`); continue }
  for (const file of readdirSync(left, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue
    const relative = join(file.parentPath ?? file.path, file.name).replace(`${left}/`, '')
    const leftPath = join(left, relative)
    const rightPath = join(right, relative)
    if (!existsSync(rightPath) || lstatSync(leftPath).ino !== lstatSync(rightPath).ino) {
      split.push(`${a}/${relative}`)
    }
  }
}
// 미러가 로컬에서 일치해도 git에 없으면 새로 받은 저장소에는 스킬이 없다.
// run-studio-cycle이 실제로 그랬다: 하드링크는 멀쩡해 위 검사를 통과했지만
// 커밋된 적이 없어 이 관제 스킬 자체가 저장소 밖에만 존재했다.
for (const [, b] of mirrors) {
  const tracked = run('git', ['ls-files', '--error-unmatch', b]).ok
  if (!tracked) split.push(`${b} 가 git에 없음 (새 클론에서 사라진다)`)
}

record('스킬 트리 미러', split.length === 0, split.length ? split : '하드링크 일치, git 추적됨')

// 5. 런치패드 템플릿이 공개 계약과 같은 필드를 갖고 있는가. 어긋나면 게임마다
//    같은 손수정이 반복된다(세 사이클 연속 발생한 뒤 템플릿을 만들었다).
const templatePath = join(root, 'launchpad/game.manifest.json')
if (!existsSync(templatePath)) {
  record('런치패드 manifest 템플릿', false, 'launchpad/game.manifest.json 없음')
} else {
  try {
    const template = JSON.parse(readFileSync(templatePath, 'utf8'))
    const required = ['schemaVersion', 'slug', 'appId', 'version', 'releaseDate', 'title', 'supportedLocales', 'arcade', 'source']
    const missing = required.filter((key) => template[key] === undefined)
    const fonts = (template.arcade?.assets ?? []).filter((asset) => /fonts\//.test(asset.source ?? ''))
    record('런치패드 manifest 템플릿', missing.length === 0 && fonts.length > 0,
      missing.length ? `누락 필드: ${missing.join(', ')}` : fonts.length ? '계약 필드와 폰트 자산 포함' : '릴리스 폰트 자산 없음')
  } catch (error) {
    record('런치패드 manifest 템플릿', false, `JSON 파싱 실패: ${error.message}`)
  }
}

// 6. 공정 로그가 주장하는 강제 위치가 실재하는가. 사라진 경로는 그 규칙이
//    기계가 아니라 산문으로만 남았다는 뜻이다(경고, 차단하지 않음).
const logPath = join(root, 'docs/knowledge/PROCESS_LOG.md')
// 선언 줄만 본다. "강제 위치"를 본문에서 언급한 문장까지 세면, 그 규칙을
// 설명하려고 인용한 파일명이 스스로를 위양성으로 만든다.
const enforcementDeclaration = /^\s*-\s*강제 위치\s*[:：]/
if (existsSync(logPath)) {
  const claimed = new Set()
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    if (!enforcementDeclaration.test(line)) continue
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const candidate = match[1].split(/[\s(]/)[0].replace(/[,.]$/, '')
      if (/\.(mjs|js|json|md)$/.test(candidate) && !candidate.startsWith('http')) claimed.add(candidate)
    }
  }
  // 로그는 경로를 생략하고 파일명만 적기도 한다. 흔한 위치에서 같은 이름을
  // 찾아보고, 그래도 없으면 그 규칙은 강제되는 곳이 사라진 것이다.
  const searchRoots = [
    '', 'scripts', 'arcade/scripts', 'launchpad/scripts', 'docs', 'docs/knowledge', 'docs/contracts',
    '.agents/skills/make-daily-game', '.agents/skills/make-daily-game/references',
    '.agents/skills/make-daily-game/scripts', 'arcade/public/assets',
  ]
  const missing = [...claimed].filter((relative) =>
    !searchRoots.some((prefix) => existsSync(join(root, prefix, relative))))
  record('공정 로그의 강제 위치 실재', missing.length === 0, missing.length ? missing : `${claimed.size}개 확인`, false)

  // 6-1. 그 강제 위치가 정말 기계인가.
  //
  // 위 검사는 경로가 실재하는지만 본다. `.md` 경로도 실재하므로 통과한다.
  // 그래서 "강제 위치: <문서>.md"라고 적은 규칙이 세 사이클 동안 강제되는
  // 것처럼 보였다. 실제로는 읽어 주는 에이전트에게만 성립하는 산문이었고,
  // 등급 사다리(연번 11 → 13)와 무입력 검출(연번 14)이 그렇게 새어 나갔다.
  // 문서만 가리키는 강제 위치는 강제가 아니라 예정이다. 세어서 드러낸다.
  // 위 검사와 같은 이유로 선언 줄만 본다. 한 번 울리는 거짓 경보가
  // 다음 사이클에 게이트를 꺼뜨린다.
  const declaration = enforcementDeclaration
  const proseOnly = []
  let heading = '(제목 없음)'
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    if (line.startsWith('## ')) heading = line.slice(3).trim()
    if (!declaration.test(line)) continue
    const cited = [...line.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1].split(/[\s(]/)[0].replace(/[,.]$/, ''))
      .filter((candidate) => /\.(mjs|js|json|md)$/.test(candidate) && !candidate.startsWith('http'))
    if (cited.length > 0 && cited.every((candidate) => candidate.endsWith('.md'))) {
      proseOnly.push(heading)
    }
  }
  record('강제 위치가 기계인가', proseOnly.length === 0,
    proseOnly.length ? [`문서만 가리키는 규칙 ${proseOnly.length}건`, ...proseOnly] : `${claimed.size}개 중 산문 전용 0건`,
    false)
}

// 6-3. 공정이 요구하는 하네스가 launchpad에 다 있는가.
//
// 같은 사고가 세 번 났다. viewport-smoke(연번 13), play-harness(연번 14),
// csp-portal-check(연번 15) 모두 게임 저장소 안에서 태어나 launchpad로 돌아오지
// 않았다. new-day.mjs가 launchpad를 clone하므로 거기 없는 것은 다음 게임에
// 전파되지 않고, 다음 게임은 같은 것을 처음부터 다시 짠다. 다시 짜지 않는
// 게임이 하나 생기면 그 게임은 그 검사 없이 공개된다.
//
// 검사 대상은 "모든 게임이 반드시 돌려야 하는 것"만이다. 게임 고유 스크립트는
// 세지 않는다.
const requiredHarnesses = [
  'smoke.mjs', 'viewport-smoke.mjs', 'play-harness.mjs',
  'csp-portal-check.mjs', 'playability-sim.mjs',
  // 공개된 포털 빌드를 사람 모델로 sandbox iframe 안에서 실제 플레이하는 지구 평가
  // 하네스. 임시 도구가 매번 새로 짜여 페이지 스크립트로 iframe에 접근하다 불투명
  // 출처에 막혀 44종 중 2종에서 멈춘 사고(연번 16)의 재발 방지. CDP Frame으로
  // __gameState를 읽고 page.mouse 절대좌표로 포인터를 넣는다.
  'earth-review-harness.mjs',
]
const launchpadScripts = join(root, 'launchpad/scripts')
if (existsSync(launchpadScripts)) {
  const missing = requiredHarnesses.filter((name) => !existsSync(join(launchpadScripts, name)))
  record('공용 하네스가 launchpad에 있는가', missing.length === 0,
    missing.length
      ? [`launchpad에 없는 필수 하네스 ${missing.length}건`, ...missing,
        '게임마다 다시 짜게 되고, 언젠가 안 짜는 게임이 나온다']
      : `${requiredHarnesses.length}개 모두 있음`, false)
}

// 6-2. 쉬운 말 빚이 줄고 있는가.
//
// 게이트를 켜면서 이미 공개된 위반은 얼렸다. 얼린 목록은 게이트를 끄지 않기
// 위한 장치지 면제가 아니다. 아무도 안 보면 영구 면제가 된다. 그래서 매번
// 세어서 보여 준다. 이 수는 내려가기만 해야 한다.
const ledgerPath = join(root, 'arcade/scripts/plain-language-legacy.json')
if (existsSync(ledgerPath)) {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  const screen = ledger.quotingScreen?.entries ?? []
  const total = (ledger.entries ?? []).length + screen.length
  record('쉬운 말 빚', total === 0,
    total === 0 ? '남은 빚 없음' : [
      `공개 문장에 남은 내부 용어 ${total}건`,
      ...(screen.length ? [`그중 ${screen.length}건은 화면 문구를 옮긴 것이라 게임을 고쳐야 갚는다(${ledger.quotingScreen.owner})`] : []),
    ], false)
}

// 7. 사이클 지표가 최신 공개까지 따라와 있는가. 빠지면 개선 곡선이 끊긴다.
const metricsPath = join(root, 'docs/knowledge/cycle-metrics.json')
const catalogPath = join(root, 'arcade/public/catalog/games.json')
if (existsSync(metricsPath) && existsSync(catalogPath)) {
  const recorded = new Set(JSON.parse(readFileSync(metricsPath, 'utf8')).cycles.map((cycle) => cycle.sequence))
  const published = JSON.parse(readFileSync(catalogPath, 'utf8')).games
    .filter((game) => game.designProcess)
    .map((game) => game.sequence)
  const unrecorded = published.filter((sequence) => !recorded.has(sequence))
  record('사이클 지표 기록', unrecorded.length === 0,
    unrecorded.length ? `미기록 sequence: ${unrecorded.join(', ')}` : `${recorded.size}회 기록`, false)
}

// 8. 로컬과 원격이 갈라져 있지 않은가. sequence 12는 수정 커밋 세 개가 로컬에만
//    있는 채로 잠금과 검토가 모두 통과했고, 공개된 빌드는 세 사이클 낡은 것이었다.
//    게시 게이트가 배포 직전에야 잡았다. 시작 전에 드러나야 한다.
for (const repository of ['.', 'arcade', 'launchpad']) {
  const path = join(root, repository)
  if (!existsSync(join(path, '.git'))) continue
  const local = run('git', ['rev-parse', 'HEAD'], path)
  const remote = run('git', ['rev-parse', '@{u}'], path)
  if (!local.ok || !remote.ok) continue
  const ahead = run('git', ['rev-list', '--count', '@{u}..HEAD'], path)
  const count = Number((ahead.stdout ?? '0').trim())
  record(`저장소 ${repository} 원격 동기화`, count === 0,
    count > 0 ? `push하지 않은 커밋 ${count}개` : '동기화됨', false)
}

// 9. 다른 저장소의 CI가 빨간 채로 방치돼 있지 않은가. 게이트를 조이면서 그
//    게이트가 검사할 대상을 안 고치면 CI만 조용히 죽는다. 런치패드 CI는
//    스모크 계약을 조인 뒤 나흘 동안 빨간 채였고 아무도 몰랐다.
for (const repository of ['launchpad', 'arcade']) {
  const path = join(root, repository)
  if (!existsSync(join(path, '.github/workflows'))) continue
  const run = run_('gh', ['run', 'list', '--limit', '1', '--json', 'conclusion,status,displayTitle'], path)
  if (!run.ok) {
    record(`${repository} CI 상태`, true, 'gh로 확인하지 못했습니다(인증 없음)', false)
    continue
  }
  try {
    const [latest] = JSON.parse(run.stdout || '[]')
    if (!latest) continue
    const green = latest.status !== 'completed' || latest.conclusion === 'success'
    record(`${repository} CI 상태`, green,
      green ? (latest.conclusion ?? latest.status) : `실패: ${latest.displayTitle}`, false)
  } catch {
    record(`${repository} CI 상태`, true, '응답을 읽지 못했습니다', false)
  }
}

// 10. 공개된 빌드와 저장소가 같은가. 게이트는 로컬을 보고 초록을 내므로 이건
//    따로 봐야 한다. 공개 뒤 기록만 쌓인 것은 어긋남이 아니다.
const drift = run(process.execPath, ['scripts/release-drift.mjs', '--all', '--json'])
try {
  const report = JSON.parse(drift.stdout || '{}')
  const bad = (report.rows ?? []).filter((row) => !row.aligned)
  record('공개 빌드와 저장소 일치', bad.length === 0,
    bad.length ? bad.map((row) => `${row.slug}: ${row.unpushed ? 'push 안 됨' : '재공개 안 된 빌드 변경'}`) : `${(report.rows ?? []).length}편 확인`, false)
} catch {
  record('공개 빌드와 저장소 일치', false, 'release-drift를 읽지 못했습니다', false)
}

// 11. 저장소 상태. 진행 중인 작업이 남아 있으면 새 사이클이 그 위에 쌓인다.
for (const repository of ['.', 'arcade', 'launchpad']) {
  const path = join(root, repository)
  if (!existsSync(join(path, '.git'))) continue
  const status = run('git', ['status', '--short'], path)
  const lines = (status.stdout ?? '').split('\n').filter((line) => line.trim() && !line.includes('games/'))
  record(`저장소 ${repository} 정리 상태`, lines.length === 0, lines.length ? lines.slice(0, 5) : '깨끗함', false)
}

// 11.5. 끝난 게임이 관제 저장소에 등록돼 있는가. 위 정리 상태 검사는 진행 중
// 게임 때문에 `games/` 줄을 통째로 걸러낸다. 그래서 공개된 게임이 서브모듈로
// 등록되지 않아 untracked로 떠 있어도 보이지 않았다. 연번 8과 15가 그렇게
// 빠져 있었고, 관제 저장소를 새로 클론하면 두 게임의 소스가 딸려오지 않는
// 상태였다. 소스 자체는 각자의 원격에 안전하지만, 어느 커밋이 공개본인지
// 관제 저장소가 못 박아 두지 못한다. 이건 정리 문제가 아니라 무결성 문제다.
try {
  const catalog = JSON.parse(readFileSync(join(root, 'arcade/public/catalog/games.json'), 'utf8'))
  const finished = catalog.games.filter((game) => game.status === 'published' || game.status === 'retired')
  const registered = readFileSync(join(root, '.gitmodules'), 'utf8')
  const unregistered = finished.filter((game) => !registered.includes(`-${game.slug}"`) && !registered.includes(`-${game.slug}\n`))
  record('끝난 게임 소스 등록', unregistered.length === 0,
    unregistered.length ? `관제 저장소에 서브모듈로 등록되지 않았습니다: ${unregistered.map((g) => g.slug).join(', ')}` : '전부 등록됨')
} catch (error) {
  record('끝난 게임 소스 등록', false, `확인하지 못했습니다: ${error.message}`, false)
}

// 12. 끝난 게임의 작업공간. 게임 한 편이 재설치 가능한 파일로 1GB를 쓴다.
// 정리 스크립트는 오래전부터 있었지만 "정리할 수 있다"고 문서에만 적혀 있었고,
// 아무도 실행하지 않아 열 편이 9.6GB를 붙들고 있었다. 산문은 강제가 아니다.
// 사이클을 막지는 않는다. 디스크가 찬 것은 게이트가 깨진 것과 다르다.
try {
  const dry = run('node', ['scripts/clean-game-workspaces.mjs', '--dry-run'], root)
  const line = (dry.stdout ?? '').split('\n').find((text) => text.startsWith('정리 예정:'))
  const megabytes = Number(line?.match(/정리 예정:\s*(\d+)MB/)?.[1] ?? 0)
  record('끝난 게임 작업공간', megabytes < 2048,
    megabytes ? `${megabytes}MB를 회수할 수 있습니다. node scripts/clean-game-workspaces.mjs` : '정리할 것 없음',
    false)
} catch {
  record('끝난 게임 작업공간', true, '정리 상태를 읽지 못했습니다', false)
}

const blockingFailures = checks.filter((check) => !check.ok && check.blocking)
const warnings = checks.filter((check) => !check.ok && !check.blocking)
const summary = {
  healthy: blockingFailures.length === 0,
  blocking: blockingFailures.map((check) => check.name),
  warnings: warnings.map((check) => check.name),
  checks,
}

if (json) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
} else {
  for (const check of checks) {
    const mark = check.ok ? 'OK  ' : check.blocking ? 'FAIL' : 'WARN'
    process.stdout.write(`${mark} ${check.name}\n`)
    if (!check.ok) {
      const detail = Array.isArray(check.detail) ? check.detail.join('\n') : String(check.detail)
      process.stdout.write(`${detail.split('\n').map((line) => `       ${line}`).join('\n')}\n`)
    }
  }
  process.stdout.write(summary.healthy
    ? `\n검증층 정상. 제작을 시작해도 됩니다.${warnings.length ? ` (경고 ${warnings.length}건)` : ''}\n`
    : `\n검증층에 문제가 있습니다. 제작 전에 먼저 고치세요: ${summary.blocking.join(', ')}\n`)
}

process.exit(summary.healthy ? 0 : 1)
