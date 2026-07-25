export const DESIGN_CONFORMANCE_FROM_SEQUENCE = 23

function text(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function verifyDesignConformanceReview(review, smokeHash) {
  if (review?.schemaVersion !== 3) throw new Error('design conformance review는 schemaVersion 3이어야 합니다.')
  if (review.verdict !== 'pass') throw new Error('design conformance review verdict가 pass가 아닙니다.')
  if (review.sourceHash !== smokeHash) throw new Error('design conformance review의 sourceHash가 현재 빌드와 다릅니다.')
  if (!text(review.method?.build)) throw new Error('실제로 확인한 build 기록이 없습니다.')

  if (!Array.isArray(review.designConformance) || review.designConformance.length === 0) {
    throw new Error('designConformance가 비었습니다.')
  }
  const ids = new Set()
  for (const item of review.designConformance) {
    if (!text(item?.id) || ids.has(item.id)) throw new Error(`designConformance id가 없거나 중복됐습니다: ${item?.id}`)
    ids.add(item.id)
    if (!text(item.designClaim) || !text(item.observed)) throw new Error(`${item.id}: 문서 약속 또는 실제 관찰이 비었습니다.`)
    if (!['implemented', 'missing'].includes(item.status)) throw new Error(`${item.id}: status가 올바르지 않습니다.`)
    if (item.status === 'missing') throw new Error(`디자인 문서와 빌드가 다릅니다: ${item.id}`)
  }

  if (!Array.isArray(review.creatorTests) || review.creatorTests.length === 0) {
    throw new Error('라이카가 실행한 게임별 테스트 기록이 없습니다.')
  }
  for (const [index, result] of review.creatorTests.entries()) {
    if (!text(result?.command) || !text(result?.covers) || result.status !== 'pass') {
      throw new Error(`creatorTests[${index}]가 비었거나 통과 상태가 아닙니다.`)
    }
  }
  if (review.deployable?.status !== 'pass' || !text(review.deployable?.observed)) {
    throw new Error('배포 가능한 빌드라는 확인이 없습니다.')
  }
}
