import { createHash } from 'node:crypto'
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const FULL_SHA = /^[a-f0-9]{40}$/
const SLUG = /^[a-z][a-z0-9]*$/
const SHA256 = /^[a-f0-9]{64}$/
const REQUIRED_LOCALES = ['ko', 'en']

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function normalizeBlobOrigin(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Blob origin이 올바른 URL이 아닙니다.')
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.public.blob.vercel-storage.com') ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('Blob origin은 Vercel Public Blob의 HTTPS origin이어야 합니다.')
  }
  return url.origin
}

export function validateVercelDeploymentUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Vercel deployment URL이 올바르지 않습니다.')
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.vercel.app') ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('Vercel deployment URL은 HTTPS *.vercel.app origin이어야 합니다.')
  }
  return url.origin
}

function timestamp(value, label) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} 시각이 올바르지 않습니다.`)
  return parsed
}

function sameEnvironment(value, expected) {
  return typeof value === 'string' && value.toLowerCase() === expected.toLowerCase()
}

export function selectVercelDeployments(deployments, { sha, environment, pushedAt }) {
  if (!Array.isArray(deployments)) throw new Error('GitHub deployments 응답이 배열이 아닙니다.')
  const pushedAtMs = timestamp(pushedAt, 'push 시작')
  // GitHub timestamps have second precision and the local clock can differ slightly.
  const earliestCreatedAt = pushedAtMs - 5_000
  return deployments
    .filter((deployment) => {
      const createdAt = Date.parse(deployment?.created_at)
      return deployment?.sha === sha &&
        sameEnvironment(deployment?.environment, environment) &&
        deployment?.creator?.login === 'vercel[bot]' &&
        Number.isFinite(createdAt) &&
        createdAt >= earliestCreatedAt
    })
    .sort((left, right) => {
      const timeDifference = Date.parse(right.created_at) - Date.parse(left.created_at)
      if (timeDifference) return timeDifference
      return Number(right.id ?? 0) - Number(left.id ?? 0)
    })
}

export function selectLatestVercelStatus(statuses, environment) {
  if (!Array.isArray(statuses)) throw new Error('GitHub deployment statuses 응답이 배열이 아닙니다.')
  return statuses
    .filter((status) =>
      sameEnvironment(status?.environment, environment) && status?.creator?.login === 'vercel[bot]')
    .sort((left, right) => {
      const timeDifference = Date.parse(right.created_at) - Date.parse(left.created_at)
      if (Number.isFinite(timeDifference) && timeDifference) return timeDifference
      return Number(right.id ?? 0) - Number(left.id ?? 0)
    })[0] ?? null
}

export function redactSecrets(value, secrets = []) {
  let output = String(value ?? '')
  const candidates = [...new Set(secrets)]
    .filter((secret) => typeof secret === 'string' && secret.length > 0)
    .sort((left, right) => right.length - left.length)
  for (const secret of candidates) {
    output = output.replaceAll(secret, '[REDACTED]')
    const encoded = encodeURIComponent(secret)
    if (encoded !== secret) output = output.replaceAll(encoded, '[REDACTED]')
  }
  return output
}

export function validateReleasePath(value, label = 'release path') {
  if (typeof value !== 'string' || !value) throw new Error(`${label}가 비어 있습니다.`)
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('%') ||
    value.includes('?') ||
    value.includes('#') ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label}가 안전한 상대 경로가 아닙니다: ${value}`)
  }
  const segments = value.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label}가 안전한 상대 경로가 아닙니다: ${value}`)
  }
  return value
}

function requireLocalized(value, label) {
  for (const locale of REQUIRED_LOCALES) {
    if (typeof value?.[locale] !== 'string' || !value[locale].trim()) {
      throw new Error(`${label}.${locale}가 필요합니다.`)
    }
  }
}

function canonicalManifestHash(release) {
  const { manifestSha256, ...payload } = release
  return sha256(JSON.stringify(payload))
}

function contentTypesFor(path) {
  const extension = path.toLowerCase().split('.').at(-1)
  const types = {
    css: ['text/css'],
    html: ['text/html'],
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    js: ['application/javascript', 'text/javascript'],
    json: ['application/json'],
    mjs: ['application/javascript', 'text/javascript'],
    mp3: ['audio/mpeg'],
    ogg: ['audio/ogg'],
    png: ['image/png'],
    svg: ['image/svg+xml'],
    wav: ['audio/wav', 'audio/x-wav'],
    webp: ['image/webp'],
  }
  return types[extension] ?? ['application/octet-stream']
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

export function verifyReleaseDirectory(distDirectory, release) {
  const dist = realpathSync(resolve(distDirectory))
  if (!Array.isArray(release.assets) || release.assets.length === 0) {
    throw new Error('release.assets가 비어 있습니다.')
  }

  const paths = release.assets.map((asset) => validateReleasePath(asset.path, 'asset.path'))
  if (new Set(paths).size !== paths.length) throw new Error('release.assets에 중복 경로가 있습니다.')
  if (paths.includes('release.json')) throw new Error('release.json은 assets 배열에 넣지 않습니다.')

  const actual = listFiles(dist)
    .map((path) => relative(dist, path).split(sep).join('/'))
    .filter((path) => path !== 'release.json')
    .sort()
  const declared = [...paths].sort()
  if (stableJson(actual) !== stableJson(declared)) {
    throw new Error('dist-arcade 실제 파일과 release.assets 목록이 다릅니다.')
  }

  let bytes = 0
  for (const asset of release.assets) {
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 0 || !SHA256.test(asset.sha256 ?? '')) {
      throw new Error(`${asset.path}: bytes 또는 sha256이 올바르지 않습니다.`)
    }
    const path = resolve(dist, asset.path)
    const real = realpathSync(path)
    if (!real.startsWith(`${dist}${sep}`) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) {
      throw new Error(`${asset.path}: dist-arcade 밖의 파일은 게시할 수 없습니다.`)
    }
    const content = readFileSync(real)
    if (content.byteLength !== asset.bytes || sha256(content) !== asset.sha256) {
      throw new Error(`${asset.path}: 로컬 파일이 release.json과 다릅니다.`)
    }
    if (asset.path.endsWith('.map')) throw new Error(`${asset.path}: source map은 게시하지 않습니다.`)
    bytes += asset.bytes
  }

  if (release.files !== release.assets.length || release.bytes !== bytes) {
    throw new Error('release 파일 수 또는 전체 바이트가 assets와 다릅니다.')
  }
  if (release.bytes > 8 * 1024 * 1024) throw new Error('release 전체 크기가 8MB를 넘습니다.')
  if (release.assets.some((asset) => asset.bytes > 4 * 1024 * 1024)) {
    throw new Error('release의 단일 파일이 4MB를 넘습니다.')
  }
  if (!Number.isSafeInteger(release.codeGzipBytes) || release.codeGzipBytes > 520 * 1024) {
    throw new Error('release 코드 gzip 예산이 올바르지 않습니다.')
  }

  return { dist, assets: release.assets.map((asset) => ({ ...asset })) }
}

function validateIdentity({ studio, manifest, release, gitHead }) {
  if (!SLUG.test(studio.slug ?? '')) throw new Error('studio slug 형식이 올바르지 않습니다.')
  if (manifest.slug !== studio.slug || release.slug !== studio.slug || release.gameId !== studio.slug) {
    throw new Error('studio, manifest, release의 slug/gameId가 다릅니다.')
  }
  if (manifest.releaseDate !== studio.date) throw new Error('studio date와 manifest releaseDate가 다릅니다.')
  if (manifest.version !== release.version) throw new Error('manifest와 release 버전이 다릅니다.')
  if (!FULL_SHA.test(release.releaseSha ?? '')) throw new Error('releaseSha는 소문자 40자리 Git SHA여야 합니다.')
  if (gitHead && release.releaseSha !== gitHead) throw new Error('releaseSha가 게임 저장소 HEAD와 다릅니다.')
  if (!SHA256.test(release.manifestSha256 ?? '') || canonicalManifestHash(release) !== release.manifestSha256) {
    throw new Error('release manifestSha256이 올바르지 않습니다.')
  }
  if (studio.publishState !== 'local-preview' && studio.publishState !== 'published') {
    throw new Error('local-preview 검증을 마친 게임만 게시할 수 있습니다.')
  }
  if (!REQUIRED_LOCALES.every((locale) => manifest.supportedLocales?.includes(locale))) {
    throw new Error('게임 manifest는 한국어와 영어를 지원해야 합니다.')
  }
  if (
    manifest.credits?.studio !== 'Sputnik Workshop' ||
    manifest.credits?.creator !== 'Laika' ||
    manifest.credits?.role !== 'autonomous game-making agent'
  ) {
    throw new Error('게임 manifest는 라이카를 자율 제작 에이전트로 표기해야 합니다.')
  }
  if (manifest.source?.launchpadCommit !== release.launchpadSha) {
    throw new Error('manifest와 release의 launchpad commit이 다릅니다.')
  }

  const artwork = release.media?.makerIllustration
  if (!artwork || artwork.baseId !== studio.laikaBaseId) throw new Error('라이카 baseId가 다릅니다.')
  requireLocalized(artwork.alt, 'release.media.makerIllustration.alt')
  if (![artwork.focalPoint?.x, artwork.focalPoint?.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('라이카 focalPoint가 올바르지 않습니다.')
  }
  if (!Array.isArray(artwork.sources) || artwork.sources.length !== 2) {
    throw new Error('라이카 일러스트는 640px와 1280px 소스가 필요합니다.')
  }

  const assets = new Map(release.assets.map((asset) => [asset.path, asset]))
  if (!assets.has(release.entry)) throw new Error('release.entry가 assets에 없습니다.')
  if (release.style && !assets.has(release.style)) throw new Error('release.style이 assets에 없습니다.')
  for (const source of artwork.sources) {
    validateReleasePath(source.path, 'maker illustration path')
    const asset = assets.get(source.path)
    if (
      !asset ||
      source.sha256 !== asset.sha256 ||
      source.type !== 'image/jpeg' ||
      !Number.isSafeInteger(source.width) ||
      !Number.isSafeInteger(source.height)
    ) {
      throw new Error(`${source.path}: 라이카 일러스트 메타데이터가 release asset과 다릅니다.`)
    }
  }
  if (release.assets.some((asset) => /(?:^|\/)laika[^/]*\.png$/i.test(asset.path))) {
    throw new Error('라이카 생성 원본 PNG는 공개 릴리스에 넣지 않습니다.')
  }

  const manifestArtwork = manifest.media?.makerIllustration
  if (
    !manifestArtwork ||
    manifestArtwork.baseId !== artwork.baseId ||
    JSON.stringify(manifestArtwork.focalPoint) !== JSON.stringify(artwork.focalPoint) ||
    JSON.stringify(manifestArtwork.alt) !== JSON.stringify(artwork.alt)
  ) {
    throw new Error('game manifest와 release의 라이카 일러스트 메타데이터가 다릅니다.')
  }
}

function catalogEntry(catalog, slug, label) {
  const matches = catalog.games?.filter((game) => game.slug === slug) ?? []
  if (matches.length !== 1) throw new Error(`${label} catalog에서 ${slug} 항목을 하나 찾지 못했습니다.`)
  return matches[0]
}

function assertCatalogUniqueness(catalog, label) {
  const slugs = catalog.games.map((game) => game.slug)
  const sequences = catalog.games.map((game) => game.sequence)
  if (new Set(slugs).size !== slugs.length) throw new Error(`${label} catalog에 중복 slug가 있습니다.`)
  if (new Set(sequences).size !== sequences.length) throw new Error(`${label} catalog에 중복 sequence가 있습니다.`)
}

function withBlobRewrite(vercelConfig, blobOrigin) {
  const source = '/__game-assets/:path*'
  const destination = `${blobOrigin}/:path*`
  const rewrites = Array.isArray(vercelConfig.rewrites) ? [...vercelConfig.rewrites] : []
  const existing = rewrites.filter((rewrite) => rewrite.source === source)
  if (existing.length > 1) throw new Error('게임 자산 rewrite가 중복되어 있습니다.')
  if (existing[0] && existing[0].destination !== destination) {
    throw new Error('게임 자산 rewrite가 다른 Blob origin을 가리킵니다.')
  }
  return {
    ...vercelConfig,
    rewrites: [
      { source, destination },
      ...rewrites.filter((rewrite) => rewrite.source !== source),
    ],
  }
}

export function buildPublicationPlan({
  studio,
  manifest,
  release,
  releaseJsonBytes,
  arcadeCatalog,
  rootCatalog,
  vercelConfig,
  blobOrigin,
  gitHead = null,
}) {
  validateIdentity({ studio, manifest, release, gitHead })
  assertCatalogUniqueness(arcadeCatalog, 'arcade')
  assertCatalogUniqueness(rootCatalog, 'root')
  const origin = normalizeBlobOrigin(blobOrigin)
  const arcadeGame = catalogEntry(arcadeCatalog, studio.slug, 'arcade')
  const rootGame = catalogEntry(rootCatalog, studio.slug, 'root')
  if (arcadeGame.sequence !== studio.sequence || rootGame.sequence !== studio.sequence) {
    throw new Error('studio와 catalog의 sequence가 다릅니다.')
  }
  for (const locale of REQUIRED_LOCALES) {
    if (!arcadeGame.content?.[locale]) throw new Error(`arcade catalog의 ${locale} 작품 노트가 없습니다.`)
  }
  if (
    arcadeGame.status === 'published' &&
    (arcadeGame.artifact?.version !== release.releaseSha ||
      arcadeGame.artifact?.release?.manifestSha256 !== release.manifestSha256)
  ) {
    throw new Error('이미 다른 SHA로 게시된 게임입니다. 롤백 또는 교체 절차를 사용하세요.')
  }

  const blobPrefix = `games/${studio.slug}/${release.releaseSha}/`
  const publicPrefix = `/__game-assets/${blobPrefix}`
  const artwork = release.media.makerIllustration
  const publishedGame = structuredClone(arcadeGame)
  publishedGame.status = 'published'
  publishedGame.artwork = {
    baseId: artwork.baseId,
    focalPoint: artwork.focalPoint,
    alt: artwork.alt,
    sources: artwork.sources.map((source) => ({
      url: `${publicPrefix}${validateReleasePath(source.path, 'maker illustration path')}`,
      width: source.width,
      height: source.height,
      type: source.type,
    })),
  }
  publishedGame.artifact = {
    status: 'published',
    runnerVersion: arcadeGame.artifact.runnerVersion,
    ...(arcadeGame.artifact.bridgeMode ? { bridgeMode: arcadeGame.artifact.bridgeMode } : {}),
    version: release.releaseSha,
    entryUrl: `${publicPrefix}${validateReleasePath(release.entry, 'release.entry')}`,
    styleUrls: release.style ? [`${publicPrefix}${validateReleasePath(release.style, 'release.style')}`] : [],
    assetBaseUrl: publicPrefix,
    source: {
      kind: 'vercel-blob',
      repo: manifest.source?.repository ?? arcadeGame.artifact.source?.repo,
      dist: 'dist-arcade',
    },
    release: {
      releaseSha: release.releaseSha,
      manifestSha256: release.manifestSha256,
      files: release.files,
      bytes: release.bytes,
      codeGzipBytes: release.codeGzipBytes,
    },
  }

  const updatedArcadeCatalog = structuredClone(arcadeCatalog)
  updatedArcadeCatalog.updatedAt = `${manifest.releaseDate}T00:00:00+09:00`
  updatedArcadeCatalog.games = updatedArcadeCatalog.games.map((game) =>
    game.slug === studio.slug ? publishedGame : game)

  const updatedRootCatalog = structuredClone(rootCatalog)
  updatedRootCatalog.games = updatedRootCatalog.games.map((game) =>
    game.slug === studio.slug ? { ...game, arcadeState: 'published' } : game)

  const uploads = release.assets
    .map((asset) => ({
      relativePath: asset.path,
      pathname: `${blobPrefix}${asset.path}`,
      bytes: asset.bytes,
      sha256: asset.sha256,
      contentTypes: contentTypesFor(asset.path),
    }))
    .sort((left, right) => left.pathname.localeCompare(right.pathname))
  uploads.push({
    relativePath: 'release.json',
    pathname: `${blobPrefix}release.json`,
    bytes: releaseJsonBytes.byteLength,
    sha256: sha256(releaseJsonBytes),
    contentTypes: ['application/json'],
    completionMarker: true,
  })

  const plan = {
    schemaVersion: 1,
    slug: studio.slug,
    releaseSha: release.releaseSha,
    manifestSha256: release.manifestSha256,
    blobOrigin: origin,
    blobPrefix,
    publicPrefix,
    uploads,
    arcadeCatalog: updatedArcadeCatalog,
    rootCatalog: updatedRootCatalog,
    vercelConfig: withBlobRewrite(vercelConfig, origin),
  }
  return { ...plan, planSha256: sha256(JSON.stringify(plan)) }
}
