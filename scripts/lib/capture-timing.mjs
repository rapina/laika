/**
 * 핵심 동사 캡처 타이밍 스캐너.
 *
 * 계기: sequence 13 「결 가르기」가 핵심 동사의 재료 반응이 미달인 채로 공개됐다.
 * 균열은 흰 선이었고 마지막 타격에서 통나무는 26px 미끄러질 뿐 갈라지지 않았다.
 * 설계 검토가 두 번 통과시켰다. 검토자가 게을렀던 것이 아니다. 증거가 결함을
 * 담고 있지 않았다.
 *
 * 원인은 캡처 타이밍이었다. 검증 스크립트가 고정 지연으로 셔터를 눌렀는데
 * Playwright 왕복이 ~400ms다. 560ms 지연은 1100ms짜리 쪼개짐 해소를 지나쳐
 * **다음 통나무**를 찍고 있었다. 그래서 verb-* 넉 장 중 어느 것도 반응 순간을
 * 담은 적이 없다. 검토는 자기가 받은 프레임 안에서는 옳게 판단했다.
 *
 * 일반화: 고정 지연으로 찍은 캡처는 조용히 엉뚱한 순간을 담는다. 틀렸다고
 * 소리치지 않고, 그럴듯한 프레임을 내놓는다. 그 증거를 보는 검토는 결함을
 * 볼 수 없고, 검토를 두 번 돌려도 같은 눈먼 지점을 두 번 지난다. 사람을 더
 * 부르는 것으로는 고쳐지지 않는다.
 *
 * 그래서 규칙은 이것이다: 핵심 동사가 무엇을 했는지 보여 주기로 한 프레임은
 * 렌더된 상태를 관측해서 찍어야 한다. 입력과 셔터 사이에 시계밖에 없으면 거부한다.
 *
 * 한계: 상태를 기다렸는지만 본다. 기다린 그 상태가 옳은 상태인지는 판단하지
 * 못한다. 캡처가 담은 순간이 판정과 맞는지는 여전히 사람이 봐야 한다.
 */

// 핵심 동사 증거 프레임. 템플릿과 설계 검토가 함께 쓰는 이름 규약이다.
// 이 규약 밖의 이름으로 찍은 캡처는 검사에서 빠진다. 규약을 좁게 잡는 편이
// 위양성으로 게이트가 꺼지는 것보다 낫다.
const VERB_SHOT = /\b(?:screenshot|shot)\s*\(/
const VERB_NAME = /verb[-_]/

// 시계로만 기다리는 호출. 인자가 숫자 리터럴이어야 한다. 상태를 받는
// delay(untilSomething)는 여기 걸리지 않는다.
const FIXED_DELAY = /\b(?:delay|sleep|pause|waitForTimeout)\s*\(\s*\d/

// 관측해서 기다리는 호출. waitForTimeout은 이름이 겹치므로 제외한다.
const STATE_WAIT =
  /\b(?:waitFor(?!Timeout)\w*|waitUntil\w*|pollUntil\w*|untilState|untilRendered|settleTo|waitForFunction)\s*\(/

// 렌더 상태를 직접 읽는 호출. 폴링 루프로 해소를 기다리는 캡처는
// waitFor*를 쓰지 않고 이 읽기 + 분기로 셔터를 건다. 연번 16의 캡처가 그렇다:
// 30ms마다 상태를 다시 읽고, 게임이 판정 프레임에서 멈춘 것을 관측한 뒤에만
// 찍는다. 시계로 기다린 것이 아니므로 거부하면 위양성이다. 다만 읽기만으로는
// 부족하다. 읽은 값이 셔터를 실제로 막고 있어야 하므로 분기를 함께 요구한다.
const OBSERVE =
  /\bawait\s+(?:\w+\.)?(?:state|readState|renderState|getDebugState|debugState)\s*\(|\.evaluate\s*\(/
const GUARD = /\b(?:if|while)\s*\(/

// 핵심 동사를 실제로 넣는 호출. 여기까지 거슬러 올라가면 창을 닫는다.
// 이 앞의 지연은 이번 동사의 셔터 타이밍과 무관하다.
const INPUT = /\b(?:tap|strike\w*|swipe|wind|drag|fling|click|press|hold|dispatchEvent|mouse\.(?:down|up|move))\s*\(/

const WINDOW_LINES = 30

/**
 * @param {{path: string, text: string}[]} files 게임 저장소의 캡처 스크립트들
 * @returns {{path: string, line: number, name: string, rule: string, evidence: string}[]}
 */
export function scanCaptureTiming(files) {
  const findings = []
  for (const file of files) {
    const lines = file.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!VERB_SHOT.test(line) || !VERB_NAME.test(line)) continue

      let sawFixedDelay = null
      let sawStateWait = false
      let sawGuard = false
      const stop = Math.max(0, i - WINDOW_LINES)
      for (let j = i; j >= stop; j--) {
        const back = lines[j]
        if (STATE_WAIT.test(back)) { sawStateWait = true; break }
        if (sawGuard && OBSERVE.test(back)) { sawStateWait = true; break }
        if (GUARD.test(back)) sawGuard = true
        if (sawFixedDelay === null && FIXED_DELAY.test(back)) sawFixedDelay = { line: j + 1, text: back.trim() }
        // 입력까지 거슬러 올라갔으면 이번 동사의 창은 여기서 끝난다.
        if (j < i && INPUT.test(back)) break
      }
      if (sawStateWait || !sawFixedDelay) continue

      findings.push({
        path: file.path,
        line: i + 1,
        name: (line.match(/[\w-]*verb[-_][\w${}.-]*/) || ['verb-*'])[0],
        rule: 'verb-capture-fixed-delay',
        evidence: `${sawFixedDelay.text}  (line ${sawFixedDelay.line})`,
      })
    }
  }
  return findings
}

export function formatCaptureTimingReport(findings) {
  return findings.map(
    (f) =>
      `  ${f.path}:${f.line} ${f.name} — 입력과 셔터 사이가 고정 지연뿐입니다: ${f.evidence}`,
  )
}
