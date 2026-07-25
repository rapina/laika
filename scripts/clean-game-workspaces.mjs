// 공개가 끝난 게임 작업공간에서 재생성 가능한 대용량 산출물을 정리한다.
// 기본 대상: 아케이드 카탈로그에 published로 등록된 게임의
//   node_modules/, dist/, *.tsbuildinfo, android 빌드 캐시, .vite
// 소스, 문서, 잠금 파일, dist-arcade/(릴리스 사본), .ait는 남긴다.
//
// 사용법:
//   node scripts/clean-game-workspaces.mjs             # published 게임 정리
//   node scripts/clean-game-workspaces.mjs --dry-run   # 지울 목록과 크기만 출력
//   node scripts/clean-game-workspaces.mjs --game games/2026/2026-07-17-slug  # 특정 게임 강제 정리
//   node scripts/clean-game-workspaces.mjs --deep      # dist-arcade/, *.ait까지 정리 (재빌드로 복원)
//
// 복원: 게임 디렉터리에서 `npm ci`, 필요 시 `npm run build:web` / `npm run build:arcade`.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const deep = args.includes('--deep')
const forcedGame = args.includes('--game') ? args[args.indexOf('--game') + 1] : null

const CLEAN_PATHS = ['node_modules', 'dist', '.vite', 'android/.gradle', 'android/app/build', 'android/build']
const CLEAN_SUFFIXES = ['.tsbuildinfo']
const DEEP_PATHS = ['dist-arcade']
const DEEP_SUFFIXES = ['.ait']

// 끝난 게임만 정리한다. 공개된 것과 내려둔 것 둘 다 끝났다. 내려둔 게임은
// 다시 손대지 않기로 한 것이므로 오히려 공개된 것보다 확실하게 끝나 있다.
// 처음에는 published만 봤고, 그래서 자속 대장간 한 편이 1.2GB를 붙든 채
// "개발 중"으로 잘못 분류돼 있었다.
const FINISHED = new Set(['published', 'retired'])

function finishedSlugs() {
  const catalogPath = join(root, 'arcade/public/catalog/games.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  return new Set(catalog.games.filter((game) => FINISHED.has(game.status)).map((game) => game.slug))
}

function gameDirectories() {
  const out = []
  const yearsDir = join(root, 'games')
  if (!existsSync(yearsDir)) return out
  for (const year of readdirSync(yearsDir)) {
    const yearDir = join(yearsDir, year)
    if (!statSync(yearDir).isDirectory()) continue
    for (const name of readdirSync(yearDir)) {
      const dir = join(yearDir, name)
      if (statSync(dir).isDirectory() && existsSync(join(dir, '.studio.json'))) out.push(dir)
    }
  }
  return out
}

function directoryBytes(path) {
  let total = 0
  const stack = [path]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) { try { total += statSync(full).size } catch {} }
    }
  }
  return total
}

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(0)}MB`

const finished = finishedSlugs()
let reclaimed = 0
for (const dir of gameDirectories()) {
  const studio = JSON.parse(readFileSync(join(dir, '.studio.json'), 'utf8'))
  const forced = forcedGame && resolve(root, forcedGame) === dir
  if (!forced && !finished.has(studio.slug)) {
    console.log(`skip  ${studio.slug.padEnd(14)} 아직 끝나지 않았다 (제작 중이거나 미공개)`)
    continue
  }
  const targets = [
    ...CLEAN_PATHS.map((p) => join(dir, p)),
    ...(deep ? DEEP_PATHS.map((p) => join(dir, p)) : []),
    ...readdirSync(dir)
      .filter((name) => [...CLEAN_SUFFIXES, ...(deep ? DEEP_SUFFIXES : [])].some((suffix) => name.endsWith(suffix)))
      .map((name) => join(dir, name)),
  ].filter((path) => existsSync(path))
  if (!targets.length) { console.log(`clean ${studio.slug.padEnd(14)} 정리할 것 없음`); continue }
  let gameBytes = 0
  for (const target of targets) {
    const bytes = statSync(target).isDirectory() ? directoryBytes(target) : statSync(target).size
    gameBytes += bytes
    // 삭제 도중 생기는 항목(.DS_Store 등) 때문에 마지막 rmdir이 ENOTEMPTY로
    // 실패할 수 있어 전체 삭제를 재시도한다.
    if (!dryRun) {
      for (let attempt = 1; ; attempt++) {
        try { rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); break }
        catch (error) {
          if (attempt >= 5 || !['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error
        }
      }
    }
  }
  reclaimed += gameBytes
  console.log(`${dryRun ? 'plan ' : 'freed'} ${studio.slug.padEnd(14)} ${megabytes(gameBytes).padStart(8)}  (${targets.length}개 경로)`)
}
console.log(`\n${dryRun ? '정리 예정' : '정리 완료'}: ${megabytes(reclaimed)}${dryRun ? ' — 실행하려면 --dry-run 없이 다시 실행' : ''}`)
if (!dryRun && reclaimed > 0) console.log('복원: 해당 게임 디렉터리에서 npm ci (필요 시 npm run build:web / build:arcade)')
