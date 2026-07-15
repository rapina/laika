#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [date, slug, ...titleParts] = process.argv.slice(2);

if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^[a-z0-9-]+$/.test(slug ?? '')) {
  console.error('Usage: node scripts/new-day.mjs YYYY-MM-DD slug [title]');
  process.exit(1);
}

const year = date.slice(0, 4);
const destination = join(root, 'games', year, `${date}-${slug}`);
const laikaBase = JSON.parse(readFileSync(join(root, 'brand', 'art', 'laika-base.json'), 'utf8'));
const laikaBaseSha256 = createHash('sha256')
  .update(readFileSync(join(root, 'brand', 'art', 'laika-base.png')))
  .digest('hex');
if (laikaBaseSha256 !== laikaBase.sha256) {
  console.error('Laika base image does not match brand/art/laika-base.json');
  process.exit(1);
}
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
  .replaceAll('{{TITLE}}', title)
  .replaceAll('{{SLUG}}', slug)
  .replaceAll('{{BASE_ID}}', laikaBase.id)
  .replaceAll('{{BASE_SHA}}', laikaBase.sha256);
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
    studio: 'Sputnik Workshop',
    maker: 'Laika',
    defaultLocales: ['ko', 'en'],
    laikaBaseId: laikaBase.id,
    laikaBaseSha256: laikaBase.sha256,
    date,
    slug,
    title,
    publishState: 'draft',
  }, null, 2)}\n`,
);

console.log(destination);
