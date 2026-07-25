import { createHash } from 'node:crypto'
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { dirname, join, parse, relative, resolve, sep } from 'node:path'
import { existsSync } from 'node:fs'

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

export function verifyReleaseDirectory(distDirectory, release, { enforceBudgets = true } = {}) {
  const dist = realpathSync(resolve(distDirectory))
  if (!Array.isArray(release.assets) || release.assets.length === 0) {
    throw new Error('release.assets가 비어 있습니다.')
  }

  const paths = release.assets.map((asset) => validateReleasePath(asset.path, 'asset.path'))
  if (new Set(paths).size !== paths.length) throw new Error('release.assets에 중복 경로가 있습니다.')
  if (paths.includes('release.json')) throw new Error('release.json은 assets 배열에 넣지 않습니다.')

  const actual = listFiles(dist)
    .map((path) => relative(dist, path).split(sep).join('/'))
    .filter((path) => path !== 'release.json' && !path.split('/').includes('.DS_Store'))
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
  if (enforceBudgets && release.bytes > 8 * 1024 * 1024) throw new Error('release 전체 크기가 8MB를 넘습니다.')
  if (enforceBudgets && release.assets.some((asset) => asset.bytes > 4 * 1024 * 1024)) {
    throw new Error('release의 단일 파일이 4MB를 넘습니다.')
  }
  if (!Number.isSafeInteger(release.codeGzipBytes) || (enforceBudgets && release.codeGzipBytes > 520 * 1024)) {
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
  const fatalOnly = Number.isInteger(studio.sequence) && studio.sequence >= 22
  if (
    !Array.isArray(manifest.supportedLocales) ||
    manifest.supportedLocales.length === 0 ||
    (!fatalOnly && !REQUIRED_LOCALES.every((locale) => manifest.supportedLocales.includes(locale)))
  ) {
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
  allowPublishedReplacement = false,
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
    if (!allowPublishedReplacement) {
      throw new Error('이미 다른 SHA로 게시된 게임입니다. --replace-published로 승인된 교체 절차를 사용하세요.')
    }
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
    game.slug === studio.slug ? {
      ...game,
      sourceHead: release.releaseSha,
      publishedReleaseSha: release.releaseSha,
      metadataAmendedAfterRelease: false,
      arcadeState: 'published',
    } : game)

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

// 게시되는 이미지는 현재 빌드에서 나온 것이어야 한다. sequence 12는 캡처 하네스가
// evidence의 sourceHash 비교로 재촬영을 건너뛰도록 게이트돼 있어서, 소스를 고쳤는데도
// 캡처가 다시 돌지 않았고 아무 경고 없이 수정 전 이미지(표적 위 인덱스 번호, 픽셀 단위
// 보정 문구, 단색 원반)가 그대로 게시됐다. 증거 캐싱이 조용히 낡은 증거를 살려 두는
// 결함이라, 캐시가 스스로 최신이라고 말하는 것을 믿지 않고 게시 시점에 다시 대조한다.
export function verifyPublishedScreenshotFreshness(gameDirectory, smokeHash, readJson) {
  const manifestPath = join(gameDirectory, 'game.manifest.json')
  if (!existsSync(manifestPath)) return
  const screenshots = readJson(manifestPath).media?.screenshots
  if (!Array.isArray(screenshots) || screenshots.length === 0) return

  const newestSourceMtime = newestMtime(join(gameDirectory, 'src'))
  for (const relativePath of screenshots) {
    const absolute = join(gameDirectory, relativePath)
    if (!existsSync(absolute)) {
      throw new Error(`게시할 스크린샷이 없습니다: ${relativePath}`)
    }
    const evidence = findCaptureEvidence(dirname(absolute), readJson)
    if (evidence) {
      const name = parse(absolute).base
      if (!evidence.value.captures.includes(name)) {
        throw new Error(
          `${relativePath}이 캡처 증거(${evidence.name})의 captures 목록에 없습니다. 하네스가 찍지 않는 이미지는 소스를 고쳐도 갱신되지 않으므로 게시할 수 없습니다.`,
        )
      }
      if (evidence.value.sourceHash !== smokeHash) {
        throw new Error(
          `캡처 증거(${evidence.name})의 sourceHash가 현재 smoke 증거와 다릅니다. 게시되는 이미지가 수정 전 빌드입니다. 캡처 하네스를 다시 돌리세요.`,
        )
      }
      continue
    }
    // 현행 제작 순서의 design/targets는 GDD 뒤, 코드 전에 만든 목표 화면이다.
    // 실제 빌드 캡처가 아니므로 소스보다 오래된 것이 정상이다. 예전 게임은
    // 이 경로에 실제 캡처와 *-evidence.json을 함께 두기도 했으므로, 증거가
    // 있는 경우에는 위의 sourceHash 대조를 그대로 적용한다.
    if (relativePath.split(sep).join('/').startsWith('design/targets/')) continue
    // 캡처 증거가 없는 이미지는 내용으로 대조할 수 없으니 수정 시각으로라도 막는다.
    if (newestSourceMtime !== null && statSync(absolute).mtimeMs < newestSourceMtime) {
      throw new Error(
        `${relativePath}이 현재 소스보다 오래됐습니다. 수정 뒤 다시 찍지 않은 이미지는 게시할 수 없습니다.`,
      )
    }
  }
}

function findCaptureEvidence(directory, readJson) {
  if (!existsSync(directory)) return null
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('-evidence.json')) continue
    const value = readJson(join(directory, name))
    if (Array.isArray(value?.captures) && typeof value?.sourceHash === 'string') {
      return { name, value }
    }
  }
  return null
}

// 렌더된 프레임을 바꿀 수 있는 파일만 센다. 테스트 파일은 앱 번들에 들어가지
// 않으므로 화면을 한 픽셀도 바꾸지 못하고, 편집기와 운영체제가 남기는 부산물도
// 마찬가지다. 연번 16이 여기 걸렸다. 캡처를 찍은 뒤 단위 테스트 한 벌을 고쳤을
// 뿐인데, 시각만 보는 이 대조가 "캡처가 소스보다 오래됐다"고 막았다. 캡처를 다시
// 찍으려면 잠긴 파일을 건드려야 하므로, 막을 수 없는 것을 막고 있었다.
function affectsRenderedFrame(name) {
  if (name.startsWith('.')) return false
  return !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name)
}

function newestMtime(directory) {
  if (!existsSync(directory)) return null
  let newest = null
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name.startsWith('.')) continue
        walk(absolute)
        continue
      }
      if (!affectsRenderedFrame(entry.name)) continue
      const { mtimeMs } = statSync(absolute)
      if (newest === null || mtimeMs > newest) newest = mtimeMs
    }
  }
  walk(directory)
  return newest
}

// 등급·칭호가 플레이 중에 화면에 있는가.
//
// 같은 계열 결함이 sequence 11과 13에서 두 번 나왔다. 등급 사다리는 결과
// 화면에서만 세어지고, 플레이 중에는 이름도 반응도 없었다. 플레이어는 무엇을
// 잘해야 등급이 오르는지 화면에서 배울 수 없었다. sequence 11에서 학습이
// 기록됐는데도 13에서 그대로 재발했다 — 그 학습이 `design-review.md`의 산문으로만
// 있었고 기계가 하나도 없었기 때문이다. 산문 규칙은 읽어 주는 에이전트에게만
// 성립한다. 그래서 검사를 여기로 옮긴다.
//
// 두 가지를 본다. 사다리가 살아 있는가(최고 관측 등급이 최저 등급과 다른가,
// sequence 11의 "관측 41판 전부 최저 등급"), 그리고 그 등급이 플레이 중에
// 화면에 있는가(sequence 11·13의 재발분).
export const gradeGateFromSequence = 14

const resultScreenOnly =
  /^(결과|점수|게임\s*오버|정산|종료|리절트|result|score|game\s*over|summary|end)\s*(화면|screen)?$/i

export function verifyGradeLegibility(review, sequence) {
  if (Number.isInteger(sequence) && sequence < gradeGateFromSequence) return
  const block = review?.gradeLadder
  if (!block || typeof block !== 'object') {
    throw new Error(
      'design-review.json에 gradeLadder가 없습니다. 등급·칭호·정밀 카운터가 있는지, 있다면 플레이 중 화면에 있는지 검토해야 합니다. 없으면 {"present": false}로 명시하십시오.',
    )
  }
  if (block.present === false) return
  if (block.present !== true) {
    throw new Error('gradeLadder.present가 true/false가 아닙니다. 등급 사다리의 유무를 명시해야 합니다.')
  }

  const names = block.names
  if (!Array.isArray(names) || names.filter((n) => typeof n === 'string' && n.trim()).length < 2) {
    throw new Error('gradeLadder.names에 등급 이름이 둘 이상 필요합니다. 사다리라면 오를 칸이 있어야 합니다.')
  }

  // 죽은 사다리. 관측한 판이 전부 최저 등급이면 그 축은 게임에 없는 것과 같다.
  const { lowestObserved, bestObserved } = block
  for (const [key, value] of [['lowestObserved', lowestObserved], ['bestObserved', bestObserved]]) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`gradeLadder.${key}가 비었습니다. 실기에서 관측한 최저·최고 등급을 적어야 합니다.`)
    }
  }
  if (lowestObserved.trim() === bestObserved.trim()) {
    throw new Error(
      `등급 사다리가 죽었습니다: 관측한 모든 판이 "${bestObserved}"에 머물렀습니다. 임계값이 실기가 아니라 자체 시뮬에 맞춰졌는지 확인하고, 실기로 보정한 뒤 다시 검토하십시오.`,
    )
  }
  const known = new Set(names.map((n) => String(n).trim()))
  for (const [key, value] of [['lowestObserved', lowestObserved], ['bestObserved', bestObserved]]) {
    if (!known.has(value.trim())) {
      throw new Error(`gradeLadder.${key}("${value}")가 names에 없는 등급입니다. 같은 어휘를 써야 대조가 됩니다.`)
    }
  }

  // 재발분. 결과 화면에서만 세어지면 배울 수 없다.
  if (block.shownDuringPlay !== true) {
    throw new Error(
      '등급이 플레이 중 화면에 없습니다(shownDuringPlay가 true가 아님). 결과 화면에서만 세어지는 등급은 무엇을 잘해야 오르는지 가르치지 못합니다. sequence 11·13에서 같은 결함이 두 번 나왔습니다.',
    )
  }
  const shownBy = block.shownBy
  if (typeof shownBy !== 'string' || !shownBy.trim()) {
    throw new Error('gradeLadder.shownBy가 비었습니다. 플레이 중 등급을 보여 주는 화면 요소를 짚어야 합니다.')
  }
  if (resultScreenOnly.test(shownBy.trim())) {
    throw new Error(
      `gradeLadder.shownBy가 결과 화면("${shownBy}")을 가리킵니다. 플레이 중에 보이는 요소를 짚어야 합니다. 이것이 sequence 11·13에서 재발한 결함 그 자체입니다.`,
    )
  }
}

// 손을 아예 대지 않으면 어떻게 되는가.
//
// sequence 14는 화면을 한 번도 건드리지 않고 문 7개(26개 중)를 통과하고 정밀
// 판정 2회를 얻은 채 공개됐다. 판의 앞 4분의 1이 사실상 화면보호기였다.
// 500판짜리 정책 시뮬 두 번과 독립 설계 검토 두 번이 나란히 놓쳤는데, 이유가
// 구조적이다 — 사람 모델 프로필 셋이 전부 "누르는" 프로필이라 정확도만 다르고,
// "아무도 안 누르면?"은 어느 프로필도 묻지 않는다. 포화 천장은 판 전체를
// 평균 내므로 앞 구간만 저절로 굴러가는 것을 볼 수 없다.
//
// 파이프라인에서 가장 싼 검사이면서 시뮬 천 판보다 많이 잡았다. 발견 당시
// 검토 기준 산문으로만 적혔는데, 산문으로 적힌 학습이 두 사이클 연속
// 재발한 것이 이 사이클의 출발점이었다. 그래서 여기로 옮긴다.
export const idleGateFromSequence = 15

const IDLE_FATAL_FRACTION = 1 / 3

export function verifyIdleRun(review, sequence, profile) {
  if (Number.isInteger(sequence) && sequence < idleGateFromSequence) return
  const block = review?.idleRun
  if (!block || typeof block !== 'object') {
    throw new Error(
      'design-review.json에 idleRun이 없습니다. 손을 아예 대지 않은 판을 한 번 이상 실기로 돌리고 결과를 적어야 합니다. 가장 싼 검사입니다.',
    )
  }
  if (block.ran !== true) {
    throw new Error('idleRun.ran이 true가 아닙니다. 무입력 판을 실제로 돌려야 합니다.')
  }
  const fraction = block.survivedFraction
  if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new Error(
      'idleRun.survivedFraction이 0~1 사이의 수가 아닙니다. 무입력으로 판의 어디까지 살아남았는지 비율로 적어야 합니다.',
    )
  }
  // 무입력 진행을 약속하지 않는 퍼즐·전략·건설·탐색·장난감은 가만히
  // 안전하게 기다리는 것이 정상이다. 이 프로필들에 challenge용 생존 비율
  // 문턱을 적용하면 입력 전에는 진행하지 않는 퍼즐을 화면보호기로 오인한다.
  if (['puzzle', 'strategy', 'construction', 'exploration', 'toy'].includes(profile)) return
  if (fraction > IDLE_FATAL_FRACTION) {
    throw new Error(
      `무입력으로 판의 ${Math.round(fraction * 100)}%를 넘겼습니다. 그 구간은 플레이가 아니라 화면보호기입니다. 앞 구간이 저절로 굴러가지 않도록 난도 곡선을 고친 뒤 다시 검토하십시오.`,
    )
  }
}

// 플레이 가능성 시뮬의 "결과"를 빌드에 결속한다.
//
// 지금까지 검증층은 사람 모델 시뮬을 요구하되(creator-workflow), 그 시뮬이
// 실제로 돌았는지·통과했는지·지금 빌드에 맞는지는 아무 데서도 게이트하지
// 않았다. 확인해 보니 최근 여섯 편의 결과 파일이 저마다 다른 경로에 있거나
// (repose: verification/playability-result.json, grainsplit:
// verification/playability-sim.json) 아예 커밋되지 않았고(ironbloom·ripples·
// flock·violet), 어느 스크립트도 그 파일을 읽지 않았다. 그래서 시뮬은
// design-review.json의 사람이 옮겨 적은 숫자로만 존재했다 — sequence 14의
// 무입력 구멍이 시뮬 천 판을 통과한 것과 같은 계열의 사각지대다.
//
// design-review.sourceHash를 smoke에 결속하듯, 시뮬 결과도 같은 smoke
// sourceHash에 결속한다. 결과가 없거나, pass가 아니거나, 지금 빌드가 아닌
// 소스에서 나온 것이면 게시하지 않는다. sequence 17부터. 그 아래는 결과
// 파일 규약이 생기기 전이라 소급하지 않는다(verifyIdleRun과 같은 방식).
export const playabilityResultFromSequence = 17

export const PLAYABILITY_RESULT_PATH = 'verification/playability-result.json'

export function verifyPlayabilityResult(gameDirectory, smokeHash, sequence, readJson) {
  if (Number.isInteger(sequence) && sequence < playabilityResultFromSequence) return
  const path = join(gameDirectory, PLAYABILITY_RESULT_PATH)
  if (!existsSync(path)) {
    throw new Error(
      `${PLAYABILITY_RESULT_PATH}이 없습니다. 플레이 가능성 시뮬(scripts/playability-sim.mjs)이 결과를 이 고정 경로에 써야 게이트가 읽습니다. 게임마다 다른 경로에 쓰면 아무도 읽지 못합니다.`,
    )
  }
  const result = readJson(path)
  if (result.pass !== true) {
    throw new Error(
      `${PLAYABILITY_RESULT_PATH}의 pass가 true가 아닙니다(${JSON.stringify(result.failedGates ?? result.pass)}). 플레이 가능성 게이트를 통과하지 못한 빌드는 게시하지 않습니다.`,
    )
  }
  if (typeof result.sourceHash !== 'string' || result.sourceHash !== smokeHash) {
    throw new Error(
      `${PLAYABILITY_RESULT_PATH}의 sourceHash가 현재 smoke 증거와 다릅니다. 소스를 바꾼 뒤 시뮬을 다시 돌려야 합니다(design-review와 같은 결속).`,
    )
  }
}
