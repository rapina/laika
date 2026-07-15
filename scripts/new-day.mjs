#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [date, slug, ...titleParts] = process.argv.slice(2);

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

if (!isValidDate(date) || !/^[a-z][a-z0-9]*$/.test(slug ?? '')) {
  console.error('Usage: node scripts/new-day.mjs YYYY-MM-DD slug [title]');
  process.exit(1);
}

const year = date.slice(0, 4);
const destination = join(root, 'games', year, `${date}-${slug}`);
if (existsSync(destination)) {
  console.error(`Already exists: ${destination}`);
  process.exit(1);
}

const launchpad = join(root, 'launchpad');
mkdirSync(dirname(destination), { recursive: true });
execFileSync('git', ['clone', '--no-hardlinks', launchpad, destination], { stdio: 'inherit' });
execFileSync('git', ['remote', 'rename', 'origin', 'launchpad'], { cwd: destination });

try {
  const upstream = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: launchpad,
    encoding: 'utf8',
  }).trim();
  execFileSync('git', ['remote', 'set-url', 'launchpad', upstream], { cwd: destination });
} catch {
  // A local-only launchpad is still a valid source for a new day.
}

const title = titleParts.join(' ') || slug;
const template = readFileSync(join(root, 'templates', 'DAY.md'), 'utf8')
  .replaceAll('{{DATE}}', date)
  .replaceAll('{{TITLE}}', title);
writeFileSync(join(destination, 'DAY.md'), template);
const artTemplate = readFileSync(join(root, 'templates', 'ART.md'), 'utf8')
  .replaceAll('{{DATE}}', date)
  .replaceAll('{{SLUG}}', slug);
writeFileSync(join(destination, 'ART.md'), artTemplate);
writeFileSync(
  join(destination, 'AGENTS.md'),
  readFileSync(join(root, 'templates', 'GAME_AGENTS.md'), 'utf8'),
);
writeFileSync(
  join(destination, 'CLAUDE.md'),
  readFileSync(join(root, 'templates', 'GAME_CLAUDE.md'), 'utf8'),
);
mkdirSync(join(destination, 'art', 'source'), { recursive: true });
mkdirSync(join(destination, 'art', 'prompts'), { recursive: true });
mkdirSync(join(destination, 'art', 'provenance'), { recursive: true });
mkdirSync(join(destination, 'public', 'art'), { recursive: true });
writeFileSync(
  join(destination, '.studio.json'),
  `${JSON.stringify({
    defaultLocales: ['ko', 'en'],
    date,
    slug,
    title,
    publishState: 'draft',
    editorialState: 'pending',
  }, null, 2)}\n`,
);

console.log(destination);
