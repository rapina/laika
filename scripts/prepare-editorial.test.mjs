import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts/prepare-editorial.mjs');

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const container = mkdtempSync(join(root, 'games/.prepare-editorial-test-'));
  const directory = join(container, '2099-12-31-locktest');
  mkdirSync(join(directory, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: directory });
  writeFileSync(join(directory, 'DAY.md'), '# PRODUCTION LOG\n\nLocked concept.\n');
  writeFileSync(join(directory, 'GDD.md'), '# GDD\n\nLocked rules.\n');
  writeFileSync(join(directory, 'ART.md'), '# PROVENANCE\n\nCreator records.\n\n');
  writeFileSync(join(directory, 'src/game.js'), 'export const score = 1;\n');
  writeJson(join(directory, '.studio.json'), {
    defaultLocales: ['ko', 'en'],
    date: '2099-12-31',
    slug: 'locktest',
    title: '잠금 시험',
    publishState: 'draft',
    editorialState: 'pending',
  });
  writeJson(join(directory, 'game.manifest.json'), {
    schemaVersion: 1,
    slug: 'locktest',
    version: '0.0.1',
    releaseDate: '2099-12-31',
    defaultLocale: 'ko',
    supportedLocales: ['ko', 'en'],
    title: { ko: '잠금 시험', en: 'LOCK TEST' },
    tagline: { ko: '잠금 경계 시험', en: 'A lock boundary test' },
    controls: ['tap'],
    orientation: 'portrait',
    sessionSeconds: { target: 30, maximum: 60 },
    media: { cover: 'press/gameplay.png', screenshots: ['press/gameplay.png'] },
    arcade: { entry: 'entry.mjs', bridgeVersion: 1 },
    source: { repository: 'test/locktest', launchpadCommit: 'test' },
  });
  return { container, directory };
}

function run(directory, ...args) {
  return spawnSync(
    process.execPath,
    [script, '--game', relative(root, directory), ...args],
    { cwd: root, encoding: 'utf8' },
  );
}

function expectFailure(result, pattern) {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, pattern);
}

test('creator lock permits narrative fields and blocks creator-owned changes', () => {
  const { container, directory } = fixture();
  try {
    assert.equal(run(directory).status, 0);

    const studioPath = join(directory, '.studio.json');
    const studio = JSON.parse(readFileSync(studioPath, 'utf8'));
    assert.equal(studio.maker, 'Laika');
    assert.equal(studio.editorialState, 'ready');

    const manifestPath = join(directory, 'game.manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.credits = {
      studio: 'Sputnik Workshop',
      creator: 'Laika',
      role: 'autonomous game-making agent',
    };
    manifest.whyCreated = { ko: '만든 이유', en: 'Why I made it' };
    manifest.media.makerIllustration = { baseId: 'laika-base-v1' };
    writeJson(manifestPath, manifest);
    appendFileSync(join(directory, 'ART.md'), '\nPublic illustration.\n');
    appendFileSync(join(directory, 'DAY.md'), '\nProduction QA.\n');
    assert.equal(run(directory, '--verify').status, 0);

    const gamePath = join(directory, 'src/game.js');
    const game = readFileSync(gamePath);
    writeFileSync(gamePath, 'export const score = 2;\n');
    expectFailure(run(directory, '--verify'), /creator-owned file changed/);
    writeFileSync(gamePath, game);

    manifest.title.en = 'ALTERED';
    writeJson(manifestPath, manifest);
    expectFailure(run(directory, '--verify'), /manifest fields changed/);
    manifest.title.en = 'LOCK TEST';
    writeJson(manifestPath, manifest);

    const artPath = join(directory, 'ART.md');
    const art = readFileSync(artPath);
    writeFileSync(artPath, art.toString('utf8').replace('# PROVENANCE', '# ALTERED'));
    expectFailure(run(directory, '--verify'), /ART.md game provenance changed/);
    writeFileSync(artPath, art);

    const dayPath = join(directory, 'DAY.md');
    writeFileSync(dayPath, readFileSync(dayPath, 'utf8').replace('# PRODUCTION LOG', '# ALTERED'));
    expectFailure(run(directory, '--verify'), /DAY.md concept and creator results changed/);
  } finally {
    rmSync(container, { recursive: true, force: true });
  }
});

test('prepare rejects Laika identity and assets before game lock', async (context) => {
  const cases = [
    ['studio identity', (directory) => {
      const path = join(directory, '.studio.json');
      const studio = JSON.parse(readFileSync(path, 'utf8'));
      studio.maker = 'Laika';
      writeJson(path, studio);
    }, /studio\.json\.maker must not exist/],
    ['Laika asset', (directory) => {
      const path = join(directory, 'art/source/laika-locktest.png');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'not-an-image');
    }, /must not exist before game lock/],
    ['manifest credits', (directory) => {
      const path = join(directory, 'game.manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.credits = { creator: 'Laika' };
      writeJson(path, manifest);
    }, /Credits, whyCreated, and makerIllustration/],
    ['WHY.md', (directory) => writeFileSync(join(directory, 'WHY.md'), '# WHY\n'), /WHY.md must not exist/],
  ];

  for (const [name, contaminate, pattern] of cases) {
    await context.test(name, () => {
      const { container, directory } = fixture();
      try {
        contaminate(directory);
        expectFailure(run(directory), pattern);
      } finally {
        rmSync(container, { recursive: true, force: true });
      }
    });
  }
});
