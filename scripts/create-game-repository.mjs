#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const gameIndex = args.indexOf('--game')
const gameDirectory = resolve(gameIndex >= 0 ? args[gameIndex + 1] ?? '' : '')

if (gameIndex < 0 || !existsSync(`${gameDirectory}/.studio.json`)) {
  console.error('Usage: node scripts/create-game-repository.mjs --game <game-directory>')
  process.exit(1)
}

const studio = JSON.parse(readFileSync(`${gameDirectory}/.studio.json`, 'utf8'))
if (!/^[a-z][a-z0-9]*$/.test(studio.slug ?? '')) {
  throw new Error(`Invalid game slug: ${studio.slug}`)
}

const repository = `rapina/laika-game-${studio.slug}`
const url = `https://github.com/${repository}.git`
let exists = true
let visibility = ''

try {
  visibility = execFileSync(
    'gh',
    ['repo', 'view', repository, '--json', 'visibility', '--jq', '.visibility'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim()
} catch {
  exists = false
}

if (!exists) {
  execFileSync(
    'gh',
    ['repo', 'create', repository, '--public', '--description', `Laika game: ${studio.title ?? studio.slug}`],
    { stdio: 'inherit' },
  )
} else if (visibility !== 'PUBLIC') {
  throw new Error(`${repository} already exists but is not public`)
}

const remotes = execFileSync('git', ['remote'], { cwd: gameDirectory, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)

if (remotes.includes('origin')) {
  execFileSync('git', ['remote', 'set-url', 'origin', url], { cwd: gameDirectory })
} else {
  execFileSync('git', ['remote', 'add', 'origin', url], { cwd: gameDirectory })
}

console.log(JSON.stringify({ repository, visibility: 'PUBLIC', origin: url }, null, 2))
