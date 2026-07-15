import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPublicationPlan,
  normalizeBlobOrigin,
  redactSecrets,
  selectLatestVercelStatus,
  selectVercelDeployments,
  sha256,
  stableJson,
  validateReleasePath,
  validateVercelDeploymentUrl,
} from './lib/publication.mjs'

const releaseSha = 'a'.repeat(40)
const asset = (path, bytes, hash = sha256(path)) => ({ path, bytes, sha256: hash })

function fixture() {
  const assets = [
    asset('entry.mjs', 10),
    asset('art/laika-signal-640.jpg', 20),
    asset('art/laika-signal-1280.jpg', 30),
  ]
  const payload = {
    contractVersion: 1,
    gameId: 'signal',
    slug: 'signal',
    version: '1.0.0',
    releaseSha,
    launchpadSha: '1234567',
    entry: 'entry.mjs',
    style: null,
    files: assets.length,
    bytes: 60,
    codeGzipBytes: 5,
    capabilities: ['pointer'],
    viewport: { orientation: 'portrait', aspectMin: 0.42, aspectMax: 0.58 },
    media: {
      makerIllustration: {
        baseId: 'laika-base-v1',
        focalPoint: { x: 0.5, y: 0.5 },
        alt: { ko: '신호를 듣는 라이카', en: 'Laika listening for a signal' },
        sources: [
          {
            path: assets[1].path,
            width: 640,
            height: 426,
            type: 'image/jpeg',
            sha256: assets[1].sha256,
          },
          {
            path: assets[2].path,
            width: 1280,
            height: 853,
            type: 'image/jpeg',
            sha256: assets[2].sha256,
          },
        ],
      },
    },
    assets,
  }
  const release = { ...payload, manifestSha256: sha256(JSON.stringify(payload)) }
  const studio = {
    date: '2026-07-16',
    sequence: 2,
    slug: 'signal',
    publishState: 'local-preview',
    laikaBaseId: 'laika-base-v1',
  }
  const manifest = {
    slug: 'signal',
    version: '1.0.0',
    releaseDate: studio.date,
    supportedLocales: ['ko', 'en'],
    credits: {
      studio: 'Sputnik Workshop',
      creator: 'Laika',
      role: 'autonomous game-making agent',
    },
    source: { repository: 'rapina/toss-game-signal', launchpadCommit: '1234567' },
    media: {
      makerIllustration: {
        baseId: payload.media.makerIllustration.baseId,
        focalPoint: payload.media.makerIllustration.focalPoint,
        alt: payload.media.makerIllustration.alt,
      },
    },
  }
  const arcadeGame = {
    slug: 'signal',
    sequence: 2,
    releaseDate: studio.date,
    status: 'local-preview',
    supportedLocales: ['ko', 'en'],
    content: {
      ko: { title: '신호' },
      en: { title: 'SIGNAL' },
    },
    artwork: {},
    artifact: {
      status: 'local',
      runnerVersion: 'v1',
      version: 'local-fixture',
      source: { repo: '../games/2026/2026-07-16-signal', dist: 'dist-arcade' },
    },
  }
  return {
    studio,
    manifest,
    release,
    releaseJsonBytes: Buffer.from(stableJson(release)),
    arcadeCatalog: { schemaVersion: 2, games: [arcadeGame] },
    rootCatalog: {
      schemaVersion: 1,
      games: [{ slug: 'signal', sequence: 2, arcadeState: 'local-preview' }],
    },
    vercelConfig: {
      outputDirectory: 'public',
      rewrites: [{ source: '/games/:slug', destination: '/game.html?slug=:slug' }],
    },
    blobOrigin: 'https://store123.public.blob.vercel-storage.com',
    gitHead: releaseSha,
  }
}

test('publication plan pins an immutable release and completion marker', () => {
  const plan = buildPublicationPlan(fixture())
  assert.equal(plan.publicPrefix, `/__game-assets/games/signal/${releaseSha}/`)
  assert.equal(plan.arcadeCatalog.games[0].status, 'published')
  assert.equal(plan.arcadeCatalog.games[0].artifact.status, 'published')
  assert.equal(plan.arcadeCatalog.games[0].artifact.version, releaseSha)
  assert.equal(plan.rootCatalog.games[0].arcadeState, 'published')
  assert.equal(plan.uploads.at(-1).relativePath, 'release.json')
  assert.equal(plan.uploads.at(-1).completionMarker, true)
  assert.deepEqual(plan.vercelConfig.rewrites[0], {
    source: '/__game-assets/:path*',
    destination: 'https://store123.public.blob.vercel-storage.com/:path*',
  })
})

test('publication rejects a non-maker Laika credit', () => {
  const input = fixture()
  input.manifest.credits.role = 'game editor and transmitter'
  assert.throws(() => buildPublicationPlan(input), /라이카를 자율 제작 에이전트로/)
})

test('publication plan is byte-identical for the same verified inputs', () => {
  const first = stableJson(buildPublicationPlan(fixture()))
  const second = stableJson(buildPublicationPlan(fixture()))
  assert.equal(first, second)
})

test('upload plan is sorted while release.json remains last', () => {
  const plan = buildPublicationPlan(fixture())
  assert.deepEqual(
    plan.uploads.slice(0, -1).map((upload) => upload.relativePath),
    ['art/laika-signal-1280.jpg', 'art/laika-signal-640.jpg', 'entry.mjs'],
  )
})

test('published different SHA cannot be silently replaced', () => {
  const input = fixture()
  input.arcadeCatalog.games[0].status = 'published'
  input.arcadeCatalog.games[0].artifact = {
    ...input.arcadeCatalog.games[0].artifact,
    version: 'b'.repeat(40),
    release: { manifestSha256: 'c'.repeat(64) },
  }
  assert.throws(() => buildPublicationPlan(input), /이미 다른 SHA로 게시/)
})

test('unsafe paths and non-public origins are rejected', () => {
  for (const path of ['/entry.mjs', '../entry.mjs', 'a//b', 'a\\b', 'a%2fb']) {
    assert.throws(() => validateReleasePath(path))
  }
  assert.throws(() => normalizeBlobOrigin('http://store.public.blob.vercel-storage.com'))
  assert.throws(() => normalizeBlobOrigin('https://example.com'))
})

test('Vercel deployments are matched by environment, sha, bot, and push time', () => {
  const deployments = [
    {
      id: 10,
      created_at: '2026-07-16T03:00:09Z',
      environment: 'Production',
      production_environment: false,
      sha: releaseSha,
      creator: { login: 'vercel[bot]' },
    },
    {
      id: 11,
      created_at: '2026-07-16T03:00:10Z',
      environment: 'Production',
      production_environment: false,
      sha: releaseSha,
      creator: { login: 'vercel[bot]' },
    },
    {
      id: 12,
      created_at: '2026-07-16T03:00:11Z',
      environment: 'Preview',
      sha: releaseSha,
      creator: { login: 'vercel[bot]' },
    },
    {
      id: 13,
      created_at: '2026-07-16T03:00:12Z',
      environment: 'Production',
      sha: 'b'.repeat(40),
      creator: { login: 'vercel[bot]' },
    },
    {
      id: 14,
      created_at: '2026-07-16T03:00:13Z',
      environment: 'Production',
      sha: releaseSha,
      creator: { login: 'someone-else' },
    },
    {
      id: 15,
      created_at: '2026-07-16T02:59:30Z',
      environment: 'Production',
      sha: releaseSha,
      creator: { login: 'vercel[bot]' },
    },
  ]
  const selected = selectVercelDeployments(deployments, {
    sha: releaseSha,
    environment: 'Production',
    pushedAt: '2026-07-16T03:00:05Z',
  })
  assert.deepEqual(selected.map(({ id }) => id), [11, 10])
})

test('latest matching Vercel bot status is selected', () => {
  const statuses = [
    {
      id: 20,
      created_at: '2026-07-16T03:00:20Z',
      environment: 'Production',
      creator: { login: 'vercel[bot]' },
      state: 'pending',
    },
    {
      id: 21,
      created_at: '2026-07-16T03:00:21Z',
      environment: 'Preview',
      creator: { login: 'vercel[bot]' },
      state: 'success',
    },
    {
      id: 22,
      created_at: '2026-07-16T03:00:22Z',
      environment: 'Production',
      creator: { login: 'someone-else' },
      state: 'success',
    },
    {
      id: 23,
      created_at: '2026-07-16T03:00:23Z',
      environment: 'Production',
      creator: { login: 'vercel[bot]' },
      state: 'success',
    },
  ]
  assert.equal(selectLatestVercelStatus(statuses, 'Production').id, 23)
})

test('Vercel deployment URLs must be bare HTTPS vercel.app origins', () => {
  assert.equal(
    validateVercelDeploymentUrl('https://laika-preview.vercel.app/'),
    'https://laika-preview.vercel.app',
  )
  for (const url of [
    'http://laika-preview.vercel.app',
    'https://example.com',
    'https://user:pass@laika-preview.vercel.app',
    'https://laika-preview.vercel.app/path',
    'https://laika-preview.vercel.app?secret=value',
  ]) {
    assert.throws(() => validateVercelDeploymentUrl(url))
  }
})

test('subprocess output redacts raw and URL-encoded secrets', () => {
  const secret = 'token/with special?value'
  const output = redactSecrets(`raw=${secret} encoded=${encodeURIComponent(secret)}`, [secret])
  assert.equal(output.includes(secret), false)
  assert.equal(output.includes(encodeURIComponent(secret)), false)
  assert.equal(output, 'raw=[REDACTED] encoded=[REDACTED]')
})

test('stale game HEAD is rejected', () => {
  const input = fixture()
  input.gitHead = 'b'.repeat(40)
  assert.throws(() => buildPublicationPlan(input), /HEAD와 다릅니다/)
})
