import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
  writeSmokeEvidence(directory);
  writeCspEvidence(directory);
  return { container, directory };
}

// 잠금 게이트는 커밋된 smoke 증거와 그 sourceHash를 요구한다. 픽스처도 실제
// 사양대로 증거를 만들어야 게이트 자체를 시험할 수 있다.
function writeSmokeEvidence(directory) {
  writeJson(join(directory, 'smoke-result.json'), {
    seed: '1',
    sourceHash: computeSourceHash(directory),
    mounted: true,
    interactionVerified: true,
    finished: true,
    // 현행 launchpad 스모크가 쓰는 안정 필드. 예전 gameResult 객체도 계속 받는다.
    resultDelivered: true,
    restartVerified: true,
    consoleErrors: [],
    pageErrors: [],
  });
}

// 잠금은 포털 CSP 아래 실기 확인도 요구한다. 검토보다 앞에서 막아야 CSP
// 결함을 안은 빌드가 검토자에게 도달하지 않는다(연번 15에서 검토 한 바퀴가
// 그렇게 버려졌다).
function writeCspEvidence(directory, overrides = {}) {
  mkdirSync(join(directory, 'verification'), { recursive: true });
  writeJson(join(directory, 'verification/csp-portal-result.json'), {
    pass: true,
    cspViolations: [],
    checks: { pass: { stylesheetLoaded: true, styleRulesApplied: true, noStyleCspViolation: true } },
    ...overrides,
  });
}

// launchpad/scripts/smoke.mjs, scripts/prepare-editorial.mjs와 같은 사양.
function computeSourceHash(directory) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  for (const dir of ['src', 'public']) if (existsSync(join(directory, dir))) walk(join(directory, dir));
  for (const file of ['index.html', 'package.json', 'vite.config.ts']) {
    if (existsSync(join(directory, file))) files.push(join(directory, file));
  }
  const hash = createHash('sha256');
  const relativePaths = files.map((full) => relative(directory, full));
  const selected = relativePaths.filter((path) => !/^public\/art\/laika-[^/]*$/.test(path.split(sep).join('/')));
  for (const file of selected.sort()) {
    hash.update(file);
    hash.update('\n');
    hash.update(readFileSync(join(directory, file)));
    hash.update('\n');
  }
  return hash.digest('hex');
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

// 설계 검토는 공개 서사보다 먼저다. 잠금 명령이 WHY 초안이나 라이카 아트
// 부록을 미리 쓰면 브랜드를 모르는 검토자가 공개 서사를 보게 되고, 서사
// 전담 단계가 아닌 곳에서 공개 문장이 생긴다.
test('lock prepares independent review without writing public narrative', () => {
  const { container, directory } = fixture();
  try {
    const artBefore = readFileSync(join(directory, 'ART.md'));
    assert.equal(run(directory).status, 0);
    assert.equal(existsSync(join(directory, 'WHY.md')), false);
    assert.deepEqual(readFileSync(join(directory, 'ART.md')), artBefore);
    assert.equal(run(directory, '--verify').status, 0);
  } finally {
    rmSync(container, { recursive: true, force: true });
  }
});

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
    // 포털 CSP 확인을 아예 안 돌린 경우. 연번 15 이전에는 이 상태로 잠기고
    // 검토까지 통과했다.
    ['missing CSP evidence', (directory) => {
      rmSync(join(directory, 'verification/csp-portal-result.json'));
    }, /csp-portal-result\.json이 없습니다/],
    // 돌렸는데 실패한 채로 잠그려는 경우.
    ['failing CSP evidence', (directory) => {
      writeCspEvidence(directory, {
        pass: false,
        checks: { pass: { stylesheetLoaded: true, styleRulesApplied: false } },
      });
    }, /포털 CSP 확인이 실패한 상태입니다.*styleRulesApplied/],
    // 통과라고 적었지만 위반 로그가 남아 있는 경우.
    ['CSP violations recorded', (directory) => {
      writeCspEvidence(directory, { cspViolations: ['Refused to apply inline style'] });
    }, /포털 CSP 위반이 1건/],
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

// 연번 15에서 서사 단계가 publishState와 sequence를 채우지 않고 끝냈고,
// publish-game이 거부했고, 손으로 채운 그 한 줄이 HEAD를 옮겨 릴리스를 통째로
// 다시 빌드하게 만들었다. 소유자 없는 필드는 결국 손이 채운다. 잠금이 채운다.
test('lock assigns the publication fields nobody owned', () => {
  const { container, directory } = fixture();
  try {
    assert.equal(run(directory).status, 0);
    const studio = JSON.parse(readFileSync(join(directory, '.studio.json'), 'utf8'));
    assert.equal(studio.publishState, 'local-preview');
    assert.equal(Number.isInteger(studio.sequence), true);
    assert.ok(studio.sequence > 0);
    // 다시 잠가도 이미 받은 번호를 지킨다.
    const first = studio.sequence;
    writeFileSync(join(directory, 'src/game.js'), 'export const score = 3;\n');
    writeSmokeEvidence(directory);
    assert.equal(run(directory, '--relock', '--reason', '번호 유지 확인').status, 0);
    const after = JSON.parse(readFileSync(join(directory, '.studio.json'), 'utf8'));
    assert.equal(after.sequence, first);
  } finally {
    rmSync(container, { recursive: true, force: true });
  }
});

// 서사 단계가 추가하는 라이카 일러스트는 게임 소스가 아니므로 잠금 증거를
// 무효로 만들면 안 된다. 무효화되면 설계 검토까지 통째로 다시 해야 한다.
test('narrative artwork does not invalidate locked smoke evidence', () => {
  const { container, directory } = fixture();
  try {
    assert.equal(run(directory).status, 0);
    mkdirSync(join(directory, 'public/art'), { recursive: true });
    writeFileSync(join(directory, 'public/art/laika-locktest-640.jpg'), 'narrative artwork bytes');
    assert.equal(run(directory, '--verify').status, 0);
  } finally {
    rmSync(container, { recursive: true, force: true });
  }
});

// 잠금 뒤 결함 수정 사이클은 잠금 해시 갱신을 요구한다. 손으로 편집하면 변조
// 방지가 무의미해지므로 명령으로만 갱신하고, 이유와 변경 목록을 남긴다.
test('relock refreshes the lock with a recorded reason', () => {
  const { container, directory } = fixture();
  try {
    assert.equal(run(directory).status, 0);

    writeFileSync(join(directory, 'src/game.js'), 'export const score = 2;\n');
    writeSmokeEvidence(directory);
    expectFailure(run(directory, '--verify'), /creator-owned file changed/);

    expectFailure(run(directory, '--relock'), /--reason/);
    assert.equal(run(directory, '--relock', '--reason', '깊이 게이트 보완').status, 0);
    assert.equal(run(directory, '--verify').status, 0);

    const lock = JSON.parse(readFileSync(join(directory, '.creator-lock.json'), 'utf8'));
    assert.equal(lock.relocks.length, 1);
    assert.equal(lock.relocks[0].reason, '깊이 게이트 보완');
    assert.deepEqual(lock.relocks[0].changed, ['smoke-result.json', 'src/game.js']);

    expectFailure(run(directory, '--relock', '--reason', '바뀐 것 없음'), /그대로/);
  } finally {
    rmSync(container, { recursive: true, force: true });
  }
});
