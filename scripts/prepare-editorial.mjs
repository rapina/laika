#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesRoot = join(root, 'games');
const editorialStudioKeys = new Set([
  'editorialState',
  'laikaBaseId',
  'laikaBaseSha256',
  'maker',
  'publishState',
  'studio',
]);

function parseArgs(argv) {
  const options = { game: null, verify: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--game') options.game = argv[++index];
    else if (argv[index] === '--verify') options.verify = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.game) {
    throw new Error('Usage: node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug [--verify]');
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, value);
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function gameDirectory(input) {
  const directory = realpathSync(resolve(root, input));
  const pathFromGames = relative(gamesRoot, directory);
  if (!pathFromGames || pathFromGames.startsWith('..') || isAbsolute(pathFromGames)) {
    throw new Error('Game directory must be inside games/.');
  }
  if (!existsSync(join(directory, '.git'))) throw new Error('Game directory is not a Git repository.');
  return directory;
}

function editorialPaths(slug) {
  return new Set([
    '.creator-lock.json',
    '.studio.json',
    'ART.md',
    'DAY.md',
    'WHY.md',
    'game.manifest.json',
    ...laikaAssetPaths(slug),
  ]);
}

function laikaAssetPaths(slug) {
  return [
    `art/source/laika-${slug}.png`,
    `art/prompts/laika-${slug}.md`,
    `art/provenance/laika-${slug}.json`,
    `public/art/laika-${slug}-640.jpg`,
    `public/art/laika-${slug}-1280.jpg`,
  ];
}

function repositoryFiles(directory, slug) {
  const excluded = editorialPaths(slug);
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: directory,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((path) => !excluded.has(path))
    .sort();
}

function creatorStudioFields(studio) {
  return Object.fromEntries(
    Object.entries(studio)
      .filter(([key]) => !editorialStudioKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function creatorManifestFields(manifest) {
  const { credits: _credits, whyCreated: _whyCreated, media, ...creator } = manifest;
  const creatorMedia = Object.fromEntries(
    Object.entries(media ?? {}).filter(([key]) => key !== 'makerIllustration'),
  );
  return Object.keys(creatorMedia).length > 0 ? { ...creator, media: creatorMedia } : creator;
}

function creatorSnapshot(directory, studio) {
  const files = {};
  for (const path of repositoryFiles(directory, studio.slug)) {
    const absolute = join(directory, path);
    if (!lstatSync(absolute).isFile()) throw new Error(`${path}: creator lock only accepts files.`);
    files[path] = sha256(readFileSync(absolute));
  }
  const art = readFileSync(join(directory, 'ART.md'));
  const day = readFileSync(join(directory, 'DAY.md'));
  const manifest = readJson(join(directory, 'game.manifest.json'));
  return {
    schemaVersion: 2,
    slug: studio.slug,
    date: studio.date,
    studio: creatorStudioFields(studio),
    manifest: creatorManifestFields(manifest),
    files,
    artPrefix: { bytes: art.byteLength, sha256: sha256(art) },
    dayPrefix: { bytes: day.byteLength, sha256: sha256(day) },
  };
}

function verifyLock(directory, studio) {
  const lock = readJson(join(directory, '.creator-lock.json'));
  if (
    lock.schemaVersion !== 2 ||
    lock.slug !== studio.slug ||
    lock.date !== studio.date ||
    canonicalJson(lock.studio) !== canonicalJson(creatorStudioFields(studio))
  ) {
    throw new Error('Creator lock metadata does not match .studio.json.');
  }
  if (
    studio.editorialState !== 'ready' ||
    studio.studio !== lock.publicIdentity?.studio ||
    studio.maker !== lock.publicIdentity?.maker ||
    studio.laikaBaseId !== lock.publicIdentity?.laikaBaseId ||
    studio.laikaBaseSha256 !== lock.publicIdentity?.laikaBaseSha256
  ) {
    throw new Error('Editorial identity is incomplete.');
  }
  const manifest = readJson(join(directory, 'game.manifest.json'));
  if (canonicalJson(lock.manifest) !== canonicalJson(creatorManifestFields(manifest))) {
    throw new Error('Creator-owned game manifest fields changed after game lock.');
  }
  const currentFiles = repositoryFiles(directory, studio.slug);
  const lockedFiles = Object.keys(lock.files).sort();
  if (JSON.stringify(currentFiles) !== JSON.stringify(lockedFiles)) {
    const added = currentFiles.filter((path) => !lockedFiles.includes(path));
    const removed = lockedFiles.filter((path) => !currentFiles.includes(path));
    throw new Error(`Creator-owned paths changed (added: ${added.join(', ') || '-'}; removed: ${removed.join(', ') || '-'}).`);
  }
  for (const path of lockedFiles) {
    if (sha256(readFileSync(join(directory, path))) !== lock.files[path]) {
      throw new Error(`${path}: creator-owned file changed after game lock.`);
    }
  }
  const art = readFileSync(join(directory, 'ART.md'));
  const prefix = art.subarray(0, lock.artPrefix.bytes);
  if (art.byteLength < lock.artPrefix.bytes || sha256(prefix) !== lock.artPrefix.sha256) {
    throw new Error('ART.md game provenance changed after game lock.');
  }
  const day = readFileSync(join(directory, 'DAY.md'));
  const dayPrefix = day.subarray(0, lock.dayPrefix.bytes);
  if (day.byteLength < lock.dayPrefix.bytes || sha256(dayPrefix) !== lock.dayPrefix.sha256) {
    throw new Error('DAY.md concept and creator results changed after game lock.');
  }
  process.stdout.write(`${JSON.stringify({ status: 'verified', files: lockedFiles.length }, null, 2)}\n`);
}

function prepare(directory, studio) {
  if (studio.editorialState !== 'pending') {
    throw new Error('Only an editorialState of pending can be prepared.');
  }
  for (const required of ['DAY.md', 'GDD.md', 'ART.md', 'game.manifest.json']) {
    if (!existsSync(join(directory, required))) throw new Error(`${required} is required before game lock.`);
  }
  if (existsSync(join(directory, 'WHY.md'))) throw new Error('WHY.md must not exist before game lock.');
  if (existsSync(join(directory, '.creator-lock.json'))) {
    throw new Error('.creator-lock.json already exists. Use --verify or restore the pre-editorial state.');
  }
  if (basename(directory) !== `${studio.date}-${studio.slug}`) {
    throw new Error('Game directory must match the date and slug in .studio.json.');
  }
  if (!isValidDate(studio.date) || !/^[a-z][a-z0-9]*$/.test(studio.slug ?? '')) {
    throw new Error('Invalid game date or slug in .studio.json.');
  }
  if (typeof studio.title !== 'string' || !studio.title.trim()) {
    throw new Error('A locked game title is required in .studio.json.');
  }
  for (const key of ['studio', 'maker', 'laikaBaseId', 'laikaBaseSha256']) {
    if (studio[key] !== undefined) throw new Error(`.studio.json.${key} must not exist before game lock.`);
  }
  for (const path of laikaAssetPaths(studio.slug)) {
    if (existsSync(join(directory, path))) throw new Error(`${path} must not exist before game lock.`);
  }

  if (!Array.isArray(studio.defaultLocales) || !['ko', 'en'].every((locale) => studio.defaultLocales.includes(locale))) {
    throw new Error('.studio.json must include Korean and English default locales.');
  }

  const manifest = readJson(join(directory, 'game.manifest.json'));
  if (
    manifest.slug !== studio.slug ||
    manifest.releaseDate !== studio.date ||
    manifest.title?.ko !== studio.title ||
    typeof manifest.title?.en !== 'string' ||
    !manifest.title.en.trim()
  ) {
    throw new Error('Game manifest identity must match the locked studio metadata.');
  }
  if (
    manifest.credits !== undefined ||
    manifest.whyCreated !== undefined ||
    manifest.media?.makerIllustration !== undefined
  ) {
    throw new Error('Credits, whyCreated, and makerIllustration must not exist before game lock.');
  }

  const base = readJson(join(root, 'brand/art/laika-base.json'));
  const baseBytes = readFileSync(join(root, 'brand/art/laika-base.png'));
  if (sha256(baseBytes) !== base.sha256) throw new Error('Laika base image does not match its metadata.');

  const why = readFileSync(join(root, 'templates/WHY.md'), 'utf8')
    .replaceAll('{{TITLE}}', studio.title);

  const artAppendix = readFileSync(join(root, 'templates/LAIKA_ART.md'), 'utf8')
    .replaceAll('{{BASE_ID}}', base.id)
    .replaceAll('{{BASE_SHA}}', base.sha256)
    .replaceAll('{{SLUG}}', studio.slug);
  const artPath = join(directory, 'ART.md');
  const art = readFileSync(artPath);
  const updatedArt = Buffer.concat([art, Buffer.from(artAppendix)]);

  const updatedStudio = {
    ...studio,
    studio: 'Sputnik Workshop',
    maker: 'Laika',
    laikaBaseId: base.id,
    laikaBaseSha256: base.sha256,
    editorialState: 'ready',
  };
  const lock = {
    ...creatorSnapshot(directory, studio),
    publicIdentity: {
      studio: 'Sputnik Workshop',
      maker: 'Laika',
      laikaBaseId: base.id,
      laikaBaseSha256: base.sha256,
    },
  };
  const lockPath = join(directory, '.creator-lock.json');
  const whyPath = join(directory, 'WHY.md');
  const studioPath = join(directory, '.studio.json');
  const originalStudio = readFileSync(studioPath);

  try {
    atomicWrite(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    atomicWrite(whyPath, why);
    atomicWrite(artPath, updatedArt);
    atomicWrite(studioPath, `${JSON.stringify(updatedStudio, null, 2)}\n`);
    verifyLock(directory, updatedStudio);
  } catch (error) {
    if (existsSync(lockPath)) unlinkSync(lockPath);
    if (existsSync(whyPath)) unlinkSync(whyPath);
    atomicWrite(artPath, art);
    atomicWrite(studioPath, originalStudio);
    throw error;
  }
}

const options = parseArgs(process.argv.slice(2));
const directory = gameDirectory(options.game);
const studio = readJson(join(directory, '.studio.json'));

if (options.verify) verifyLock(directory, studio);
else prepare(directory, studio);
