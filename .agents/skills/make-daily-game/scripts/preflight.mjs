#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, parse, resolve } from 'node:path'

function parseArgs(argv) {
  const options = { start: process.cwd(), date: null }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') options.start = resolve(argv[++index])
    else if (argv[index] === '--date') options.date = argv[++index]
    else throw new Error(`Unknown argument: ${argv[index]}`)
  }
  return options
}

function findWorkspace(start) {
  let current = resolve(start)
  const filesystemRoot = parse(current).root
  while (true) {
    const required = [
      'AGENTS.md',
      'scripts/new-day.mjs',
      'launchpad',
      'arcade',
    ]
    if (required.every((path) => existsSync(join(current, path)))) return current
    if (current === filesystemRoot) break
    current = dirname(current)
  }
  throw new Error(`Sputnik Workshop root not found above ${start}`)
}

function seoulDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function gameDirectories(root) {
  const gamesRoot = join(root, 'games')
  if (!existsSync(gamesRoot)) return []
  return readdirSync(gamesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .flatMap((year) => {
      const yearPath = join(gamesRoot, year.name)
      return readdirSync(yearPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}-/.test(entry.name))
        .map((entry) => join(yearPath, entry.name))
    })
    .sort()
}

function gameSummary(path) {
  const studioPath = join(path, '.studio.json')
  const studio = existsSync(studioPath) ? readJson(studioPath) : {}
  const directory = basename(path)
  return {
    path,
    directory,
    date: studio.date ?? directory.slice(0, 10),
    slug: studio.slug ?? directory.slice(11),
    title: studio.title ?? null,
    publishState: studio.publishState ?? 'unknown',
  }
}

function publicationSummary(game, arcadeCatalog) {
  const entry = arcadeCatalog.games?.find((candidate) => candidate.slug === game.slug)
  const published = entry?.status === 'published' &&
    entry?.artifact?.status === 'published' &&
    /^[a-f0-9]{40}$/.test(entry?.artifact?.version ?? '') &&
    entry.artifact.version === entry.artifact.release?.releaseSha
  return {
    ...game,
    arcadeState: published ? 'published' : entry?.status ?? 'unregistered',
    releaseSha: published ? entry.artifact.version : null,
  }
}

function gitSummary(path) {
  if (!existsSync(join(path, '.git'))) return { repository: false }
  try {
    const lines = execFileSync('git', ['status', '--short'], {
      cwd: path,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().split('\n').filter(Boolean)
    return { repository: true, dirty: lines.length > 0, changedPaths: lines.length }
  } catch (error) {
    return { repository: true, error: error.message }
  }
}

const options = parseArgs(process.argv.slice(2))
const root = findWorkspace(options.start)
const date = options.date ?? seoulDate()
if (!isValidDate(date)) throw new Error(`Invalid date: ${date}`)

// Numbered production: games are identified by their catalog sequence, and
// any number of games may share a date. One game is in flight at a time —
// finish (or publish) the pending one before starting the next sequence.
const arcadeCatalog = readJson(join(root, 'arcade/public/catalog/games.json'))
const games = gameDirectories(root)
  .map(gameSummary)
  .map((game) => publicationSummary(game, arcadeCatalog))
  .map((game) => ({
    ...game,
    sequence: arcadeCatalog.games?.find((candidate) => candidate.slug === game.slug)?.sequence ?? null,
  }))
const completedStates = new Set(['local-preview', 'published'])
// retired: 공개 이력이 있고 카탈로그에서 은퇴로 전시 중인 종결 상태.
// 재공개 대상이 아니므로 pending으로 세지 않는다.
const terminalArcadeStates = new Set(['published', 'retired'])
const pendingGames = games.filter((game) =>
  !completedStates.has(game.publishState) || !terminalArcadeStates.has(game.arcadeState))
const unfinished = pendingGames.find((game) => !completedStates.has(game.publishState)) ?? null
const unpublished = pendingGames.find((game) => completedStates.has(game.publishState)) ?? null
const highestSequence = Math.max(0, ...(arcadeCatalog.games ?? []).map((game) => game.sequence ?? 0))

const recommendation = unfinished
  ? 'resume-unfinished'
  : unpublished
    ? 'resume-publication'
    : 'create-next'
const targetGame = unfinished ?? unpublished ?? null

const report = {
  workspace: root,
  date,
  recommendation,
  targetGame,
  nextSequence: highestSequence + 1,
  pendingGames,
  recentGames: games.slice(-5).reverse(),
  repositories: {
    root: gitSummary(root),
    launchpad: gitSummary(join(root, 'launchpad')),
    arcade: gitSummary(join(root, 'arcade')),
    pending: pendingGames.map((game) => ({ path: game.path, ...gitSummary(game.path) })),
  },
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
