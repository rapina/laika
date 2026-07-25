export const FATAL_REVIEW_FROM_SEQUENCE = 22

export const FATAL_CHECK_IDS = [
  'boot',
  'portrait',
  'touch',
  'runtime',
  'assets',
  'build-identity',
]

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function verifyFatalOnlyReview(review, smokeHash) {
  if (review?.schemaVersion !== 2) throw new Error('fatal-only review는 schemaVersion 2여야 합니다.')
  if (review.verdict !== 'pass') throw new Error('fatal-only review verdict가 pass가 아닙니다.')
  if (review.sourceHash !== smokeHash) throw new Error('fatal-only review의 sourceHash가 현재 smoke 증거와 다릅니다.')
  if (review.method?.inputPath !== 'pointer-events') {
    throw new Error('fatal-only review는 실제 pointer-events 입력을 포함해야 합니다.')
  }
  if (!Array.isArray(review.fatalChecks)) throw new Error('fatal-only review에 fatalChecks가 없습니다.')

  const byId = new Map()
  for (const check of review.fatalChecks) {
    if (!FATAL_CHECK_IDS.includes(check?.id) || byId.has(check.id)) {
      throw new Error(`fatal-only review check id가 잘못되었거나 중복됐습니다: ${check?.id}`)
    }
    if (!['pass', 'fatal'].includes(check.status)) {
      throw new Error(`${check.id}: status는 pass 또는 fatal이어야 합니다.`)
    }
    if (!nonEmpty(check.observed)) throw new Error(`${check.id}: observed가 비었습니다.`)
    byId.set(check.id, check)
  }
  const missing = FATAL_CHECK_IDS.filter((id) => !byId.has(id))
  if (missing.length) throw new Error(`fatal-only review check가 빠졌습니다: ${missing.join(', ')}`)
  const fatal = [...byId.values()].filter((check) => check.status === 'fatal')
  if (fatal.length) throw new Error(`치명적 결함이 남아 있습니다: ${fatal.map((check) => check.id).join(', ')}`)
}
