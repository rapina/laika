import assert from 'node:assert/strict'
import test from 'node:test'
import { scanCaptureTiming } from './lib/capture-timing.mjs'

const scan = (text, path = 'scripts/capture-verbs.mjs') => scanCaptureTiming([{ path, text }])
const rules = (text) => scan(text).map((f) => f.rule)

// sequence 13이 실제로 공개까지 내보낸 코드다. 축약하지 않았다.
// delay(50) 뒤의 셔터가 1100ms짜리 해소를 통째로 지나쳤다.
test('sequence 13의 고정 지연 캡처를 잡는다', () => {
  const text = `
            const after = await strikeWhen(src, 12000)
            if (!after) { log('no strike'); continue }
            const landed = after.lastTapTier
            if (landed && !got[landed]) {
                await delay(50)
                await shot(\`verb-\${landed}\`)
                got[landed] = after
            }
`
  assert.deepEqual(rules(text), ['verb-capture-fixed-delay'])
})

// 같은 결함의 다른 게임 표현. 판정 직후 고정 지연으로 세 등급을 찍었다.
test('등급별 고정 지연 캡처를 등급 수만큼 잡는다', () => {
  const text = `
                ev = await strikeAndGrade(pickForResidual(-0.02, 0.02))
                if (ev?.grade === 'precise') {
                    await delay(120)
                    await page.screenshot({ path: 'verify/verb-precise.png' })
                }
                ev = await strikeAndGrade(pickForResidual(0.05, 0.1))
                if (ev?.grade === 'success') {
                    await delay(120)
                    await page.screenshot({ path: 'verify/verb-success.png' })
                }
`
  assert.deepEqual(rules(text), ['verb-capture-fixed-delay', 'verb-capture-fixed-delay'])
})

// 수정본. 렌더 상태를 관측해서 셔터를 누르면 통과해야 한다.
test('렌더 상태를 기다린 캡처는 통과시킨다', () => {
  const text = `
            const after = await strikeWhen(src, 12000)
            const landed = after.lastTapTier
            if (landed && !got[landed] && usable) {
                const at = after.outcome === 'split'
                    ? await waitFor('s => s.splitOpen >= 0.8', 2500)
                    : await waitFor(\`s => s.crackDrawnP >= \${after.crackP - 0.002}\`, 1200)
                await shot(\`verb-\${landed}\`)
            }
`
  assert.deepEqual(rules(text), [])
})

// 위양성이 한 번이라도 나오면 다음 사이클이 게이트를 꺼 버린다.
// 아래는 이미 공개된 게임들의 실제 캡처 코드 모양이다.
test('정상 패턴을 잡지 않는다', () => {
  // 입력 자체가 지속 시간을 갖는 게임. 입력과 셔터 사이에 지연이 없다.
  assert.deepEqual(
    rules(`
        let s = await state(page)
        await wind(page, s.target, 5200)
        await page.screenshot({ path: \`\${OUT}/verb-precise.png\` })
`),
    [],
  )
  // 핵심 동사 프레임이 아닌 캡처는 이 규칙의 대상이 아니다.
  assert.deepEqual(
    rules(`
        await tap()
        await delay(1000)
        await shot('game-over')
        await delay(400)
        await page.screenshot({ path: 'verify/first-play.png' })
`),
    [],
  )
  // 입력보다 앞선 지연은 이번 동사의 셔터 타이밍과 무관하다.
  assert.deepEqual(
    rules(`
        await delay(1400)
        await strikeWhen(src)
        await waitForState('s => s.resolved')
        await shot('verb-bite')
`),
    [],
  )
})

test('보고서가 지연 줄을 짚어 준다', () => {
  const findings = scan(`
        await tap()
        await delay(50)
        await shot('verb-precise')
`)
  assert.equal(findings.length, 1)
  assert.match(findings[0].evidence, /delay\(50\)/)
  assert.equal(findings[0].name, 'verb-precise')
})

// 연번 16의 캡처. waitFor*를 쓰지 않고 30ms 폴링으로 상태를 다시 읽어,
// 게임이 판정 프레임에서 멈춘 것을 관측한 뒤에만 찍는다. 근처의 delay(1300)은
// 다른 함수(재시작)의 것이다. 이것을 막으면 위양성이다.
test('상태를 다시 읽어 분기로 셔터를 거는 폴링 캡처는 통과시킨다', () => {
  const text = `
    const restart = async () => {
        await page.mouse.click(start.x, start.y)
        await delay(1300)
    }
    for (const grade of ['precise', 'hold', 'spill']) {
        await armShutter(grade)
        while (!held.has(grade)) {
            const s = await state()
            if (!s) break
            if (s.paused) {
                await page.screenshot({ path: \`\${OUT}/verb-\${grade}-\${LOCALE}.png\` })
                break
            }
            await delay(30)
        }
    }
`
  assert.deepEqual(rules(text), [])
})

// 관측 없이 분기만 있는 캡처는 여전히 막는다. 분기가 면허가 되면 안 된다.
test('분기만 있고 상태를 읽지 않으면 여전히 잡는다', () => {
  const text = `
        await tap()
        if (wanted) {
            await delay(200)
            await page.screenshot({ path: 'verify/verb-precise.png' })
        }
`
  assert.deepEqual(rules(text), ['verb-capture-fixed-delay'])
})
