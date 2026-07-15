#!/usr/bin/env node

import { createHash } from 'node:crypto'
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
      'RTK.md',
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
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`)

const baseMetadata = readJson(join(root, 'brand/art/laika-base.json'))
const baseSha256 = createHash('sha256')
  .update(readFileSync(join(root, 'brand/art/laika-base.png')))
  .digest('hex')
if (baseSha256 !== baseMetadata.sha256) {
  throw new Error('brand/art/laika-base.png does not match its metadata')
}

const arcadeCatalog = readJson(join(root, 'arcade/public/catalog/games.json'))
const games = gameDirectories(root)
  .map(gameSummary)
  .map((game) => publicationSummary(game, arcadeCatalog))
const todayGames = games.filter((game) => game.date === date)
const completedStates = new Set(['local-preview', 'published'])
const pendingGames = games.filter((game) =>
  !completedStates.has(game.publishState) || game.arcadeState !== 'published')
const todayGame = todayGames[0] ?? null
const previousPending = pendingGames.filter((game) => game.date !== date).at(-1) ?? null
const recommendation = todayGames.length > 1
  ? 'resolve-date-conflict'
  : todayGame && !completedStates.has(todayGame.publishState)
    ? 'resume-today'
    : todayGame && todayGame.arcadeState !== 'published'
      ? 'resume-publication'
      : todayGame
        ? 'review-published-today'
      : previousPending
        ? completedStates.has(previousPending.publishState)
          ? 'resume-publication'
          : 'resume-unfinished'
        : 'create-today'
const targetGame = recommendation === 'resume-today' || recommendation === 'review-published-today' ||
  (recommendation === 'resume-publication' && todayGame)
  ? todayGame
  : recommendation === 'resume-unfinished' || recommendation === 'resume-publication'
      ? previousPending
    : null

const report = {
  workspace: root,
  date,
  recommendation,
  targetGame,
  todayGames,
  recentGames: games.slice(-5).reverse(),
  laikaBase: {
    id: baseMetadata.id,
    sha256: baseSha256,
    verified: true,
  },
  repositories: {
    root: gitSummary(root),
    launchpad: gitSummary(join(root, 'launchpad')),
    arcade: gitSummary(join(root, 'arcade')),
    today: todayGames.map((game) => ({ path: game.path, ...gitSummary(game.path) })),
  },
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
