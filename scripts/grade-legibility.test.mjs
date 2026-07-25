import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyGradeLegibility, verifyIdleRun } from './lib/publication.mjs'

const ok = {
  present: true,
  names: ['빗나감', '물림', '정타', '결'],
  lowestObserved: '빗나감',
  bestObserved: '정타',
  shownDuringPlay: true,
  shownBy: '타격 순간 쐐기 위에 등급 이름이 뜨고 색이 바뀐다',
}
const check = (block, sequence = 14) => verifyGradeLegibility({ gradeLadder: block }, sequence)
const throws = (block, pattern, sequence = 14) =>
  assert.throws(() => check(block, sequence), pattern)

test('sequence 14 미만에서는 검사하지 않는다', () => {
  assert.doesNotThrow(() => verifyGradeLegibility({}, 13))
  assert.doesNotThrow(() => verifyGradeLegibility({}, 9))
})

test('블록이 없으면 막는다', () => {
  assert.throws(() => verifyGradeLegibility({}, 14), /gradeLadder가 없습니다/)
})

test('등급이 없는 게임은 명시하면 통과한다', () => {
  assert.doesNotThrow(() => check({ present: false }))
  throws({ present: 'no' }, /true\/false가 아닙니다/)
})

// sequence 11: 실기 41판 전부 최저 등급이었다. 사다리가 죽은 채로 공개됐다.
test('관측이 전부 최저 등급이면 죽은 사다리로 막는다', () => {
  throws({ ...ok, lowestObserved: '빗나감', bestObserved: '빗나감' }, /등급 사다리가 죽었습니다/)
})

// sequence 11·13: 결과 화면에서만 세어지고 플레이 중에는 이름이 없었다.
test('플레이 중에 등급이 없으면 막는다', () => {
  throws({ ...ok, shownDuringPlay: false }, /플레이 중 화면에 없습니다/)
  throws({ ...ok, shownDuringPlay: undefined }, /플레이 중 화면에 없습니다/)
})

test('플레이 중 요소로 결과 화면을 짚으면 막는다', () => {
  for (const label of ['결과 화면', '게임 오버', 'result screen', '점수', 'Game Over']) {
    throws({ ...ok, shownBy: label }, /결과 화면.*가리킵니다/)
  }
  throws({ ...ok, shownBy: '   ' }, /shownBy가 비었습니다/)
})

test('사다리는 오를 칸이 둘 이상이어야 한다', () => {
  throws({ ...ok, names: ['정타'] }, /둘 이상 필요합니다/)
})

test('관측 등급은 names의 어휘를 써야 한다', () => {
  throws({ ...ok, bestObserved: 'S' }, /names에 없는 등급입니다/)
  throws({ ...ok, lowestObserved: '' }, /lowestObserved가 비었습니다/)
})

// 위양성이 한 번 나오면 다음 사이클이 게이트를 꺼 버린다.
test('정상 보고를 막지 않는다', () => {
  assert.doesNotThrow(() => check(ok))
  // 결과 화면을 함께 언급해도, 플레이 중 요소를 짚었으면 통과한다.
  assert.doesNotThrow(() =>
    check({ ...ok, shownBy: '연타 게이지 옆 등급 라벨. 결과 화면에도 같은 이름으로 집계된다' }),
  )
  // 영문 등급 어휘도 통과한다.
  assert.doesNotThrow(() =>
    check({
      present: true,
      names: ['Miss', 'Good', 'Perfect'],
      lowestObserved: 'Miss',
      bestObserved: 'Perfect',
      shownDuringPlay: true,
      shownBy: 'HUD ring label pulses with the tier name on each hit',
    }),
  )
})

// 무입력 검출. sequence 14가 손을 대지 않고 문 7/26을 통과한 채 공개됐고,
// 발견 당시 검토 기준 산문으로만 적혔다. 산문은 두 번 재발했다.
test('무입력 판을 돌리지 않으면 막는다', () => {
  const idle = (block, sequence = 15) => verifyIdleRun({ idleRun: block }, sequence)
  assert.doesNotThrow(() => verifyIdleRun({}, 14), '연번 15부터 걸린다')
  assert.throws(() => verifyIdleRun({}, 15), /idleRun이 없습니다/)
  assert.throws(() => idle({ ran: false }), /ran이 true가 아닙니다/)
  assert.throws(() => idle({ ran: true }), /survivedFraction이 0~1/)
  assert.throws(() => idle({ ran: true, survivedFraction: 1.4 }), /survivedFraction이 0~1/)
})

test('무입력으로 판의 3분의 1을 넘기면 막고, 그 아래는 gap으로 통과시킨다', () => {
  const idle = (fraction) => () => verifyIdleRun({ idleRun: { ran: true, survivedFraction: fraction } }, 15)
  // sequence 14의 실측(문 7/26). 화면보호기였지만 fatal 문턱 아래라 gap이다.
  assert.doesNotThrow(idle(7 / 26))
  assert.doesNotThrow(idle(0))
  assert.throws(idle(0.5), /화면보호기/)
  assert.throws(idle(1), /화면보호기/)
})
