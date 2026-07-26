export const CREATOR_PLAYTEST_FROM_SEQUENCE = 25

function text(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function verifyCreatorPlaytest(report, currentSourceHash) {
  if (report?.schemaVersion !== 1) throw new Error('production-playtest.json은 schemaVersion 1이어야 합니다.')
  if (!/^[a-f0-9]{64}$/.test(report.initialBuildHash ?? '')) {
    throw new Error('첫 구현의 sourceHash가 없습니다.')
  }
  if (report.initialBuildHash === currentSourceHash) {
    throw new Error('첫 구현 뒤 플레이 관찰을 반영한 소스 변경이 없습니다.')
  }
  if (report.finalBuildHash !== currentSourceHash) {
    throw new Error('내부 플레이테스트의 최종 해시가 현재 릴리스 후보와 다릅니다.')
  }
  if (!Array.isArray(report.sessions) || report.sessions.length === 0) {
    throw new Error('제작 맥락을 모르는 내부 플레이 기록이 없습니다.')
  }
  for (const [index, session] of report.sessions.entries()) {
    if (session?.playerContext !== 'build-only') {
      throw new Error(`sessions[${index}]가 빌드만 받은 독립 플레이가 아닙니다.`)
    }
    for (const field of ['understood', 'attempted', 'reached', 'friction']) {
      if (!text(session.observation?.[field])) {
        throw new Error(`sessions[${index}].observation.${field}가 비었습니다.`)
      }
    }
  }
  if (!Array.isArray(report.makerResponse?.changes) || report.makerResponse.changes.length === 0) {
    throw new Error('내부 플레이 관찰을 반영한 재제작 기록이 없습니다.')
  }
  for (const [index, change] of report.makerResponse.changes.entries()) {
    if (!text(change?.observation) || !text(change?.change)) {
      throw new Error(`makerResponse.changes[${index}]가 비었습니다.`)
    }
  }
  if (!text(report.makerResponse.releaseCandidateReason)) {
    throw new Error('라이카가 이 빌드를 릴리스 후보로 판단한 이유가 없습니다.')
  }
}
