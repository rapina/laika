// 쉬운 말 게이트 회귀 시험.
//
// 이 게이트는 연번 15에서 생겼다. 규칙 자체는 연번 12부터 문서에 있었지만
// 강제하는 코드가 없어서, 연번 15의 공개 문장에 내부 용어가 다섯 번 들어가고도
// 아무 데서도 걸리지 않았다. 여기서 고정하는 것은 "규칙이 문서에 있다"가 아니라
// "규칙을 어긴 문장을 거부한다"이다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlainLanguage, scanPlainLanguage } from '../arcade/scripts/plain-language.mjs'

test('내부 용어를 찾아낸다', () => {
  const hits = scanPlainLanguage({ ko: '공정을 다시 짰다' }, 'x')
  assert.deepEqual(hits, ['x.ko :: 공정'])
})

test('중첩된 구조를 끝까지 훑는다', () => {
  const hits = scanPlainLanguage({ a: { b: [{ ko: '밴드 3' }] } }, 'x')
  assert.deepEqual(hits, ['x.a.b.0.ko :: 밴드'])
})

test('긴 줄표를 거부한다', () => {
  assert.deepEqual(scanPlainLanguage({ ko: '이것 — 저것' }, 'x'), ['x.ko :: 긴 줄표'])
  assert.deepEqual(scanPlainLanguage({ ko: '이것, 저것' }, 'x'), [])
})

test('쉬운 말은 통과시킨다', () => {
  const clean = { ko: '공개를 한 번 멈췄다. 화면에 겨냥할 물건이 없었다.', en: 'I stopped the release once.' }
  assert.deepEqual(scanPlainLanguage(clean, 'x'), [])
})

// 게이트를 끄지 않고 기존 빚만 얼린다. 얼린 것은 통과, 새것은 거부.
test('얼린 빚은 통과하고 새 위반은 걸린다', () => {
  const hits = ['a.ko :: 밴드', 'b.ko :: 공정']
  const { fresh } = checkPlainLanguage(hits, ['a.ko :: 밴드'], () => true)
  assert.deepEqual(fresh, ['b.ko :: 공정'])
})

// 빚을 갚았으면 목록에서 지우게 만든다. 안 그러면 얼린 목록이 영원히 남아
// 다음에 같은 자리에서 같은 위반이 나도 통과한다.
test('갚은 빚은 목록에서 지우라고 알려 준다', () => {
  const { fresh, cleared } = checkPlainLanguage([], ['a.ko :: 밴드'], () => true)
  assert.deepEqual(fresh, [])
  assert.deepEqual(cleared, ['a.ko :: 밴드'])
})

// 은퇴해서 카탈로그에서 빠진 게임의 빚까지 "갚았다"고 요구하면 안 된다.
test('판정 범위 밖의 빚은 지우라고 하지 않는다', () => {
  const { cleared } = checkPlainLanguage([], ['gone.ko :: 밴드'], (hit) => hit.startsWith('here.'))
  assert.deepEqual(cleared, [])
})

// 실제 카탈로그가 지금 이 게이트를 통과하는지도 함께 본다. 통과하지 않으면
// 게이트가 아니라 카탈로그가 틀린 것이고, 어느 쪽이든 여기서 드러나야 한다.
test('현재 카탈로그가 게이트를 통과한다', async () => {
  const { execFileSync } = await import('node:child_process')
  const { dirname, join, resolve } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  execFileSync(process.execPath, ['scripts/validate.mjs'], { cwd: join(root, 'arcade'), stdio: 'pipe' })
})
