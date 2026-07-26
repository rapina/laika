#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CREATOR_PLAYTEST_FROM_SEQUENCE,
  verifyCreatorPlaytest,
} from './lib/creator-playtest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesRoot = join(root, 'games');
// 잠금은 제작이 소유한 결정만 고정한다. 아래 키는 제작 잠금 뒤 공개 단계가
// 채우는 값이다. sequence는 게임의 설계가 아니라 카탈로그가 부여하는 공개 번호이고,
// 잠금 전에 정해질 수도 잠금 뒤에 정해질 수도 있어 제작 소유로 보지 않는다.
const editorialStudioKeys = new Set([
  'edition',
  'editorialState',
  'laikaBaseId',
  'laikaBaseSha256',
  'maker',
  'publishState',
  'sequence',
  'studio',
]);

function parseArgs(argv) {
  const options = { game: null, verify: false, relock: false, reason: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--game') options.game = argv[++index];
    else if (argv[index] === '--verify') options.verify = true;
    else if (argv[index] === '--relock') options.relock = true;
    else if (argv[index] === '--reason') options.reason = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.game) {
    throw new Error('Usage: node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug [--verify | --relock --reason "왜 고쳤는지"]');
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

// launchpad/scripts/smoke.mjs의 sourceHash()와 같은 사양. smoke 증거가
// 현재 소스 상태에서 나온 것인지 잠금 시점에 대조한다.
//
// 서사 소유 자산(라이카 일러스트)은 게임 소스가 아니므로 현재 사양에서 제외한다.
// 포함하던 구 사양으로 증거를 남긴 게임도 있으므로 두 값을 모두 계산해 대조한다.
function isNarrativeAsset(relativePath) {
  return /^public\/art\/laika-[^/]*$/.test(relativePath.split(sep).join('/'));
}

function sourceHash(directory, { includeNarrativeAssets = false } = {}) {
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
  // git이 추적하지 않는 파일은 게임 소스가 아니다. 빼지 않으면 Finder가 만든
  // `.DS_Store` 하나가 증거 해시를 바꿔, 추적 파일이 한 바이트도 안 바뀐 채로
  // 통과한 설계 검토가 무효가 되고 게시가 막힌다(연번 16에서 실제로 발생).
  // git 저장소가 아니면(시험 픽스처 등) 걸러낼 근거가 없으므로 전부 포함한다.
  let tracked = null;
  try {
    const listed = execFileSync('git', ['ls-files', '-z'], { cwd: directory, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
      .map((path) => path.split('/').join(sep));
    if (listed.length > 0) tracked = new Set(listed);
  } catch {
    // 추적 목록을 못 얻으면 예전처럼 디스크 목록을 그대로 쓴다.
  }
  const relativePaths = files
    .map((full) => relative(directory, full))
    .filter((path) => tracked === null || tracked.has(path));
  const selected = includeNarrativeAssets ? relativePaths : relativePaths.filter((path) => !isNarrativeAsset(path));
  for (const file of selected.sort()) {
    hash.update(file);
    hash.update('\n');
    hash.update(readFileSync(join(directory, file)));
    hash.update('\n');
  }
  return hash.digest('hex');
}

// 브라우저 검증 주장은 커밋된 smoke 증거로만 인정한다. 증거가 없거나,
// 실패 상태이거나, 소스 변경 뒤 재실행되지 않았으면 잠금을 거부한다.
// 포털 CSP 아래에서 실제로 뜨는가. 로컬 개발 서버에는 CSP가 없어서, CSP에서만
// 죽는 결함은 검토자가 개발 서버로 아무리 오래 플레이해도 보이지 않는다. 두 번
// 그렇게 새어 나갔다 — 메질은 eval이 script-src에 막혀 아예 뜨지 않았고, 쇳물
// 가시는 주입 <style>이 막혀 스타일 없는 오버레이가 포인터를 전부 삼켰다.
// 후자는 설계 검토를 통과한 빌드였다. 검토 한 바퀴가 통째로 버려졌다.
//
// 그래서 검토보다 앞인 잠금에서 요구한다. 잠금은 검토 앞에 있으므로, 여기서
// 막으면 CSP 결함을 안은 빌드가 검토자에게 도달할 수 없다.
function verifyCspEvidence(directory) {
  const path = join(directory, 'verification', 'csp-portal-result.json');
  if (!existsSync(path)) {
    throw new Error('verification/csp-portal-result.json이 없습니다. npm run csp를 실행하고 결과를 커밋해야 잠글 수 있습니다. 포털 CSP는 로컬 개발 서버에 없어서, 이 검사를 건너뛰면 검토가 포털에서 뜨지도 않는 빌드를 통과시킵니다.');
  }
  const report = readJson(path);
  if (report.pass !== true) {
    const failed = Object.entries(report.checks?.pass ?? {})
      .filter(([, ok]) => !ok).map(([name]) => name);
    throw new Error(`포털 CSP 확인이 실패한 상태입니다${failed.length ? ` (${failed.join(', ')})` : ''}. 포털에서 뜨지 않는 빌드는 잠글 수 없습니다.`);
  }
  if ((report.cspViolations ?? []).length > 0) {
    throw new Error(`포털 CSP 위반이 ${report.cspViolations.length}건 기록돼 있습니다.`);
  }
}

function verifySmokeEvidence(directory, sequence) {
  const smokePath = join(directory, 'smoke-result.json');
  if (!existsSync(smokePath)) {
    throw new Error('smoke-result.json이 없습니다. npm run smoke를 실행하고 결과를 커밋해야 잠글 수 있습니다.');
  }
  const smoke = readJson(smokePath);
  const fatalOnly = Number.isInteger(sequence) && sequence >= 22;
  if (smoke.mounted !== true || (!fatalOnly && smoke.finished !== true)) {
    throw new Error('smoke 증거가 완주 상태가 아닙니다. 게임이 마운트되고 한 판이 끝나야 합니다.');
  }
  if ((smoke.consoleErrors ?? []).length || (smoke.pageErrors ?? []).length) {
    throw new Error('smoke 증거에 콘솔/페이지 오류가 있습니다.');
  }
  if (sequence === 22 && smoke.interactionVerified !== true) {
    throw new Error('smoke 증거에 터치 상호작용 확인이 없습니다.');
  }
  // 결과 전달 증거는 두 형태를 모두 받는다. 예전 스모크는 결과 객체(gameResult)를
  // 통째로 적었지만, 블라인드 드라이버의 점수·최종 상태는 실행마다 달라져 게시 게이트의
  // 저장소 청결 검사를 깨뜨렸다. 그래서 launchpad 스모크는 안정 필드(resultDelivered)만
  // 남기도록 바뀌었다. 확인하려는 사실은 어느 쪽이든 같다 — 게임 오버가 결과를
  // 호스트로 전달했는가.
  const resultDelivered =
    smoke.resultDelivered === true ||
    (Boolean(smoke.gameResult) && typeof smoke.gameResult === 'object');
  if (!fatalOnly && !resultDelivered) {
    throw new Error('smoke 증거에 결과 전달 기록이 없습니다. 게임 오버가 결과를 호스트로 전달해야 합니다.');
  }
  if (!fatalOnly && smoke.restartVerified !== true) {
    throw new Error('smoke 증거에 재시작 확인이 없습니다. 종료 화면에서 화면 탭으로 새 판이 시작되어야 합니다.');
  }
  if (typeof smoke.sourceHash !== 'string') {
    throw new Error('smoke-result.json에 sourceHash가 없습니다. 최신 launchpad smoke.mjs로 다시 실행하세요.');
  }
  const acceptedHashes = [
    sourceHash(directory),
    sourceHash(directory, { includeNarrativeAssets: true }),
  ];
  if (!acceptedHashes.includes(smoke.sourceHash)) {
    throw new Error('smoke 증거의 sourceHash가 현재 소스와 다릅니다. 소스나 자산을 바꾼 뒤에는 npm run smoke를 다시 실행해야 합니다.');
  }
  return smoke;
}

function verifyCreatorPlaytestEvidence(directory, sequence, currentSourceHash) {
  if (!Number.isInteger(sequence) || sequence < CREATOR_PLAYTEST_FROM_SEQUENCE) return;
  const path = join(directory, 'production-playtest.json');
  if (!existsSync(path)) {
    throw new Error('production-playtest.json이 없습니다. 첫 구현을 새 맥락에서 플레이하고 관찰을 반영해 다시 제작해야 잠글 수 있습니다.');
  }
  verifyCreatorPlaytest(readJson(path), currentSourceHash);
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
    // 독립 설계 검토(ADR 0006)는 제작 잠금 뒤에 산출물을 커밋하므로
    // 제작자 잠금 파일 목록에서 제외한다. 검토 자체는 읽기 전용이다.
    'design-review.json',
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
    // `new-game` relocates the Android MainActivity before the first game
    // commit. `git ls-files --cached` still lists the deleted template path;
    // a lock snapshots the working tree, so deleted index entries are absent.
    .filter((path) => existsSync(join(directory, path)))
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
    // 양쪽에서 공개 단계 키를 함께 걷어내고 비교한다. 그래야 잠금 전에 번호가
    // 정해진 게임과 잠금 뒤에 정해진 게임이 같은 규칙으로 검증된다.
    canonicalJson(creatorStudioFields(lock.studio)) !== canonicalJson(creatorStudioFields(studio))
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

// 잠금 뒤 결함 수정 사이클: 소스를 고쳤으면 잠금 해시도 갱신해야 한다. 이 갱신을
// 손으로 하면 변조 방지 파일을 사람이 편집하는 셈이라 게이트가 무의미해진다.
// 여기서 갱신하면 게이트가 요구하는 증거(현재 smoke)를 다시 검사하고, 무엇이
// 바뀌었는지와 이유를 잠금 파일의 이력에 남긴다.
function relock(directory, studio, reason) {
  if (!reason || !reason.trim()) {
    throw new Error('--relock에는 --reason "왜 고쳤는지"가 필요합니다. 잠금 갱신은 이력에 이유를 남깁니다.');
  }
  const lockPath = join(directory, '.creator-lock.json');
  if (!existsSync(lockPath)) throw new Error('.creator-lock.json이 없습니다. 먼저 잠금을 만드세요.');
  if (studio.editorialState !== 'ready') throw new Error('editorialState가 ready인 게임만 다시 잠글 수 있습니다.');

  // 갱신본도 최초 잠금과 같은 증거를 요구한다. 낡은 smoke로는 다시 잠글 수 없다.
  const smoke = verifySmokeEvidence(directory, studio.sequence);
  verifyCreatorPlaytestEvidence(directory, studio.sequence, smoke.sourceHash);

  const previous = readJson(lockPath);
  const snapshot = creatorSnapshot(directory, studio);
  const changed = [
    ...Object.keys(snapshot.files).filter((path) => previous.files?.[path] !== snapshot.files[path]),
    ...Object.keys(previous.files ?? {}).filter((path) => !(path in snapshot.files)),
  ].sort();
  if (changed.length === 0 && canonicalJson(previous.manifest) === canonicalJson(snapshot.manifest)) {
    throw new Error('잠긴 내용이 그대로입니다. 다시 잠글 이유가 없습니다.');
  }

  const lock = {
    ...snapshot,
    publicIdentity: previous.publicIdentity,
    relocks: [
      ...(previous.relocks ?? []),
      { at: new Date().toISOString().slice(0, 10), reason: reason.trim(), changed },
    ],
  };
  atomicWrite(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  verifyLock(directory, studio);
  process.stdout.write(`${JSON.stringify({ status: 'relocked', changed }, null, 2)}\n`);
}

// 카탈로그가 부여하는 다음 공개 번호. 잠금 전에는 아무도 이 값을 소유하지
// 않았다. 연번 15에서 서사 단계가 publishState와 sequence를 draft/없음으로
// 두고 끝냈고, publish-game이 거부했고, 손으로 채운 그 한 줄이 HEAD를 옮겨
// 릴리스 전체를 다시 빌드하게 만들었다. 소유자가 없는 필드는 결국 손이
// 채운다. 잠금이 소유한다.
function nextSequence(slug) {
  const catalogPath = join(root, 'arcade', 'public', 'catalog', 'games.json');
  const ledgerPath = join(root, 'docs', 'knowledge', 'GENRE_LEDGER.json');
  const archiveThroughSequence = existsSync(ledgerPath)
    ? Number(readJson(ledgerPath).archiveThroughSequence ?? 0)
    : 0;
  let highest = 0;
  if (existsSync(catalogPath)) {
    for (const game of readJson(catalogPath).games ?? []) {
      // 이미 번호를 받은 게임을 다시 잠그는 경우 그 번호를 지킨다.
      if (game.slug === slug && Number.isInteger(game.sequence)) return game.sequence;
      if (Number.isInteger(game.sequence)) highest = Math.max(highest, game.sequence);
    }
  }
  // 아직 공개되지 않았지만 이미 번호를 쥔 채 잠긴 게임과 부딪히지 않게 한다.
  for (const year of readdirSync(gamesRoot, { withFileTypes: true })) {
    if (!year.isDirectory()) continue;
    for (const entry of readdirSync(join(gamesRoot, year.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(gamesRoot, year.name, entry.name, '.studio.json');
      if (!existsSync(path)) continue;
      const other = readJson(path);
      if (other.slug === slug) continue;
      if (Number.isInteger(other.sequence) && other.sequence <= archiveThroughSequence) continue;
      if (Number.isInteger(other.sequence)) highest = Math.max(highest, other.sequence);
    }
  }
  return highest + 1;
}

function prepare(directory, studio) {
  if (studio.editorialState !== 'pending') {
    throw new Error('Only an editorialState of pending can be prepared.');
  }
  for (const required of ['DAY.md', 'GDD.md', 'ART.md', 'game.manifest.json']) {
    if (!existsSync(join(directory, required))) throw new Error(`${required} is required before game lock.`);
  }
  const sequence = Number.isInteger(studio.sequence) ? studio.sequence : nextSequence(studio.slug);
  const smoke = verifySmokeEvidence(directory, sequence);
  verifyCreatorPlaytestEvidence(directory, sequence, smoke.sourceHash);
  verifyCspEvidence(directory);
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

  if (sequence < 22 && (!Array.isArray(studio.defaultLocales) || !['ko', 'en'].every((locale) => studio.defaultLocales.includes(locale)))) {
    throw new Error('.studio.json must include Korean and English default locales.');
  }

  const manifest = readJson(join(directory, 'game.manifest.json'));
  if (
    manifest.slug !== studio.slug ||
    manifest.releaseDate !== studio.date ||
    manifest.title?.ko !== studio.title ||
    (sequence < 22 && (typeof manifest.title?.en !== 'string' || !manifest.title.en.trim()))
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

  const updatedStudio = {
    ...studio,
    studio: 'Sputnik Workshop',
    maker: 'Laika',
    laikaBaseId: base.id,
    laikaBaseSha256: base.sha256,
    editorialState: 'ready',
    // 잠긴 게임은 게시 후보다. publish-game이 요구하는 두 값을 여기서 채운다.
    publishState: studio.publishState === 'published' ? 'published' : 'local-preview',
    sequence,
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
  const studioPath = join(directory, '.studio.json');
  const originalStudio = readFileSync(studioPath);

  try {
    atomicWrite(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    atomicWrite(studioPath, `${JSON.stringify(updatedStudio, null, 2)}\n`);
    verifyLock(directory, updatedStudio);
  } catch (error) {
    if (existsSync(lockPath)) unlinkSync(lockPath);
    atomicWrite(studioPath, originalStudio);
    throw error;
  }
}

const options = parseArgs(process.argv.slice(2));
const directory = gameDirectory(options.game);
const studio = readJson(join(directory, '.studio.json'));

if (options.verify) verifyLock(directory, studio);
else if (options.relock) relock(directory, studio, options.reason);
else prepare(directory, studio);
