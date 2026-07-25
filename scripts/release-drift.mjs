#!/usr/bin/env node
/**
 * 지금 사람들이 하는 빌드는 무엇인가.
 *
 * 게이트는 전부 로컬 HEAD를 기준으로 초록을 낸다. 그래서 수정 커밋이 로컬에만
 * 있으면 잠금도 검토도 통과인데 공개된 빌드는 낡은 채로 남는다(sequence 12는
 * 이걸로 사이클 하나를 통째로 날렸고, 13에서도 배포 직전에야 발견했다).
 *
 * 세 값을 나란히 보여 준다.
 *   local     로컬 HEAD
 *   origin    원격 main
 *   published 카탈로그가 가리키는 릴리스 SHA (= 사람들이 지금 하는 빌드)
 *
 *   node scripts/release-drift.mjs --game games/YYYY/YYYY-MM-DD-slug [--json]
 *   node scripts/release-drift.mjs --all
 *
 * 종료 코드 0이면 셋이 같다. 1이면 어긋나 있다. 어긋남 자체가 오류는 아니다.
 * 고치는 중이면 당연히 어긋난다. 다만 그 사실이 보여야 한다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const all = argv.includes('--all')
const gameArg = argv[argv.indexOf('--game') + 1]

if (!all && (!gameArg || gameArg.startsWith('--'))) {
  throw new Error('사용법: node scripts/release-drift.mjs --game <경로> | --all')
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

const catalog = JSON.parse(readFileSync(join(root, 'arcade/public/catalog/games.json'), 'utf8'))

// 공개 뒤에도 기록은 계속 쌓인다. DAY.md 검증 기록, 작품 노트 손질, 지구 플레이
// 기록. 그런 커밋은 빌드를 바꾸지 않으므로 재공개할 것이 없다. 빌드를 실제로
// 바꾸는 경로(smoke sourceHash가 보는 것과 같은 집합)만 어긋남으로 센다.
const BUILD_PATHS = ['src/', 'public/', 'index.html', 'package.json', 'vite.config.ts']

function touchesBuild(directory, from, to) {
  const changed = git(directory, ['diff', '--name-only', `${from}..${to}`])
  if (changed === null) return null
  return changed
    .split('\n')
    .filter(Boolean)
    .filter((path) => BUILD_PATHS.some((prefix) => path === prefix || path.startsWith(prefix)))
}

function inspect(relative) {
  const directory = resolve(root, relative)
  const slug = relative.split('/').pop().slice(11)
  const entry = catalog.games.find((game) => game.slug === slug)
  const local = git(directory, ['rev-parse', 'HEAD'])
  const origin = git(directory, ['rev-parse', 'origin/main'])
  const published = entry?.artifact?.version ?? null
  const dirty = (git(directory, ['status', '--porcelain']) ?? '').length > 0

  const unpushed = Boolean(local) && Boolean(origin) && local !== origin
  const buildFiles = published && origin && origin !== published
    ? touchesBuild(directory, published, origin)
    : []
  const unshippedBuild = Array.isArray(buildFiles) && buildFiles.length > 0
  const recordsOnly = Boolean(published) && Boolean(origin) && origin !== published && !unshippedBuild

  return {
    slug, local, origin, published, dirty,
    unpushed, unshippedBuild, recordsOnly,
    buildFiles: Array.isArray(buildFiles) ? buildFiles.slice(0, 5) : [],
    aligned: !unpushed && !unshippedBuild,
  }
}

const targets = all
  ? catalog.games
    .map((game) => game.repositoryPath ?? null)
    .filter(Boolean)
  : [gameArg]

// 루트 카탈로그가 저장소 경로를 갖고 있으면 그것을 쓰고, 없으면 games/ 아래를 훑는다.
function resolveAll() {
  const rootCatalogPath = join(root, 'catalog/games.json')
  if (!existsSync(rootCatalogPath)) return targets
  const rootCatalog = JSON.parse(readFileSync(rootCatalogPath, 'utf8'))
  const games = Array.isArray(rootCatalog) ? rootCatalog : rootCatalog.games
  return games
    .map((game) => game.repositoryPath)
    .filter((path) => path && existsSync(join(root, path, '.git')))
}

const rows = (all ? resolveAll() : targets).map(inspect)
const drifted = rows.filter((row) => !row.aligned)

if (asJson) {
  process.stdout.write(`${JSON.stringify({ aligned: drifted.length === 0, rows }, null, 2)}\n`)
} else {
  const short = (value) => (value ? value.slice(0, 12) : '-'.repeat(12))
  process.stdout.write(`${'slug'.padEnd(14)}${'local'.padEnd(14)}${'origin'.padEnd(14)}${'published'.padEnd(14)}상태\n`)
  for (const row of rows) {
    const mark = row.aligned ? '  ' : '! '
    const note = row.unpushed ? 'push 안 됨'
      : row.unshippedBuild ? `재공개 안 된 빌드 변경 (${row.buildFiles.join(', ')})`
      : row.recordsOnly ? '기록만 추가됨'
      : '같음'
    process.stdout.write(`${mark}${row.slug.padEnd(12)}${short(row.local).padEnd(14)}${short(row.origin).padEnd(14)}${short(row.published).padEnd(14)}${note}${row.dirty ? ' · 작업 트리 변경 있음' : ''}\n`)
  }
  if (drifted.length > 0) {
    process.stdout.write('\n손볼 것이 있습니다.\n')
    process.stdout.write('push 안 됨: 게이트는 로컬을 보고 초록을 내지만 사람들은 옛 빌드를 합니다. push는 배포가 아닙니다.\n')
    process.stdout.write('재공개 안 된 빌드 변경: 고친 것이 아직 나가지 않았습니다.\n')
  } else {
    process.stdout.write('\n공개된 빌드와 저장소가 같습니다. 기록만 더 쌓인 것은 어긋남이 아닙니다.\n')
  }
}

process.exit(drifted.length === 0 ? 0 : 1)
