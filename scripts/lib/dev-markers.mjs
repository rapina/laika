/**
 * 개발용 표시 스캐너.
 *
 * 계기: sequence 12 「세 번의 파문」이 개발용 표시 다섯 종을 운영까지 그대로
 * 내보냈다. 표적 위 배열 번호, 판정 영역을 드러낸 불투명 원반, 실패 지점의
 * 디버그 사각 마커, 픽셀 좌표 덤프 교정 문구, 라벨 없는 기호 HUD. 다섯 개
 * 모두 `__DEV_BUILD__` 가드 없이 운영 렌더 경로에 있었다.
 *
 * 이 규칙은 `docs/quality-bar.md`에 산문으로 이미 있었다. 산문이라 지켜지지
 * 않았다. 여기서 기계가 거부한다.
 *
 * 게임 저장소마다 복사되는 smoke.mjs가 아니라 관제 저장소에 정본을 둔다.
 * 사본은 갈라진다. 게임 하나가 낡은 사본을 들고 있으면 그 게임만 조용히
 * 검사에서 빠져나간다.
 */

// 템플릿이 모든 게임에 심어 두는 토큰. 개발 어휘로 보이지만 제거 대상이 아니다.
// 화이트리스트가 없으면 네 게임 전부가 위양성으로 막혀 게이트가 곧 꺼진다.
const ALLOWED = [
  'TODO_TOSS_',
  'TODO_GPLAY_',
  '__gameState', // 스모크 하네스가 폴링하는 계약. 의도된 노출이다.
  'getDebugState', // 하네스가 읽는 상태 접근자. 화면에 그리지 않는다.
  'Placeholder adapter', // 템플릿 defaultIap.ts
  'placeholder adapter',
]

const DEV_WORDS = /\b(debug|DEBUG|FIXME|XXX|WIP|hitbox|bbox|aabb|dummy|lorem|테스트용|디버그)\b/

// 글자가 실제로 화면으로 나가는 호출. 이 목록 밖의 문자열은 사람이 읽지 않는다.
const DISPLAY_SINK = /\b(fillText|strokeText|textContent|innerText|innerHTML|setText)\b/

// 문구 사전 파일은 줄마다 표시 경로가 적혀 있지 않다. 파일 단위로 표시 경로 취급한다.
const COPY_FILE = /(^|\/)(i18n|locales?|copy|strings)(\/|\.)|\.(ko|en)\.(ts|json)$/

// 문자열 리터럴만 뽑는다. 식별자에 섞인 단어는 화면에 나오지 않는다.
const STRING_LITERAL = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g

function literalsIn(line) {
  const out = []
  for (const m of line.matchAll(STRING_LITERAL)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return out
}

function allowed(line) {
  return ALLOWED.some((token) => line.includes(token))
}

/**
 * 그 stroke 사각형이 디버그 마커가 아니라 UI 크롬인지 본다.
 *
 * 디버그 바운딩 박스는 맨 윤곽선이다. 판정 좌표에 대고 선만 긋는다.
 * HUD 크롬은 둘 중 하나의 모양을 갖는다.
 *   1. 같은 좌표를 fillRect로 먼저 채우고 그 위에 테두리를 얹는다(패널).
 *   2. 그 사각형을 탭 영역 목록에 등록한다(버튼).
 * 둘 다 디버그 마커에는 없는 신호다.
 *
 * 두 신호 모두 **네 인자가 전부 일치할 때만** 인정한다. sequence 14의 첫 판은
 * 좌상단 두 개만 봤고 탭 영역은 곁에 있기만 하면 통과시켰는데, 그러면
 * 배경 `fillRect(0,0,…)` 하나가 원점의 디버그 상자를 사면하고,
 * `boxes[` 를 도는 디버그 오버레이가 통째로 빠져나간다(감독 검수에서 실증).
 * 면제는 좁아야 한다. 게이트를 좁히는 쪽이 채점받는 쪽일 때는 특히 그렇다.
 */
function isChromeRect(line, nearby = '') {
  const rect = firstArgs(line, 'strokeRect')
  if (!rect || rect.length < 4) return false
  const same = (other) => other.length >= 4 && [0, 1, 2, 3].every((i) => other[i] === rect[i])

  // 1. 같은 자리에 같은 크기로 깔린 패널 배경.
  if (allArgs(nearby, 'fillRect').some(same)) return true

  // 2. 같은 좌표가 탭 영역으로 등록된 버튼. 이름이 곁에 있는 것만으로는 안 되고,
  //    등록된 상자가 그린 상자와 같은 자리여야 한다.
  const [x, y, w, h] = rect
  const registered = new RegExp(
    `\\b(?:uiBoxes|hitAreas|tapAreas|boxes)\\s*\\.push\\(`,
  ).test(nearby)
  if (!registered) return false
  const flat = nearby.replace(/\s+/g, '')
  return [`x:${x}`, `y:${y}`, `w:${w}`, `h:${h}`].every((pair) => flat.includes(pair))
}

function normalizeArgs(args) {
  return args.split(',').map((a) => a.replace(/\s+/g, ''))
}

function firstArgs(code, fnName) {
  const [args] = callArgs(code, fnName)
  return args === undefined ? null : normalizeArgs(args)
}

function allArgs(code, fnName) {
  return callArgs(code, fnName).map(normalizeArgs)
}

/**
 * `fn(` 뒤의 균형 잡힌 인자 구간만 잘라낸다.
 *
 * 줄 단위로 리터럴을 훑으면 안 된다. 제작 코드가 한 줄에 여러 문장을 붙여 쓰기
 * 때문에 같은 줄의 `c.font='12px Galmuri11'`이 픽셀 덤프로 걸린다. 폰트 지정은
 * 정상이다. 실제로 위양성 8건이 이렇게 나왔다. 그리는 함수에 넘어간 인자만 본다.
 */
function callArgs(code, fnName) {
  const out = []
  const needle = `${fnName}(`
  let from = 0
  for (;;) {
    const start = code.indexOf(needle, from)
    if (start === -1) break
    let depth = 0
    let i = start + needle.length - 1
    for (; i < code.length; i += 1) {
      if (code[i] === '(') depth += 1
      else if (code[i] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    out.push(code.slice(start + needle.length, i))
    from = start + needle.length
  }
  return out
}

// 화면으로 나가는 글자만 모은다.
function displayLiterals(code) {
  const literals = []
  for (const sink of ['fillText', 'strokeText', 'setText']) {
    for (const args of callArgs(code, sink)) literals.push(...literalsIn(args))
  }
  for (const m of code.matchAll(/\b(?:textContent|innerText|innerHTML)\s*=\s*([^;]+)/g)) {
    literals.push(...literalsIn(m[1]))
  }
  return literals
}

/**
 * 규칙 하나하나가 실제로 새어 나간 결함에서 나왔다.
 * 추측으로 규칙을 늘리지 않는다. 위양성이 한 번 나면 다음 사이클이 게이트를 끈다.
 */
const RULES = [
  {
    id: 'render-array-index',
    // fillText(String(i+1), …) — 표적 위에 찍힌 배열 번호.
    why: '게임 대상 위에 배열 번호를 그린다',
    test: (line) => /fillText\(\s*(?:String\()?\(?\s*[ijkn]\s*[+)]/.test(line),
  },
  {
    id: 'render-bounding-box',
    // strokeRect — 판정 상자를 그대로 드러낸 디버그 마커.
    //
    // 맨 윤곽선만 그리는 것이 디버그 마커의 모양이다. HUD 테두리는 다르게 생겼다.
    // 채워진 패널 위에 같은 좌표로 얹은 테두리이거나, 탭 영역으로 등록되는 상자다.
    // sequence 14에서 안내 패널 테두리와 재시작 버튼 테두리가 이 규칙에 걸렸다.
    // 게이트의 첫 위양성이었고, 위양성이 나오는 게이트는 다음 사이클에 꺼진다.
    why: '판정 상자(strokeRect)를 화면에 그린다',
    test: (line, ctx) => /\bstrokeRect\(/.test(line) && !isChromeRect(line, ctx.nearby),
  },
  {
    id: 'render-unit-dump',
    // fillText 인자에 px·rad·deg 단위 수치가 들어간다.
    why: '화면 문구에 픽셀·라디안 등 내부 단위 수치를 적는다',
    test: (line) =>
      displayLiterals(line).some(
        (s) => /\d\s*(px|rad|deg)\b/.test(s) || /\$\{[^}]*\}\s*(px|rad|deg)\b/.test(s),
      ),
  },
  {
    id: 'dev-vocabulary',
    // 화면 문자열에 남은 개발 어휘.
    // 반드시 표시 경로(화면에 글자를 내보내는 호출)나 문구 사전 파일로 좁힌다.
    // 좁히지 않으면 CSS 클래스명('dummy-ad-overlay')과 쿼리 파라미터 조회
    // (`has('debug')`)가 걸린다 — 실제로 걸렸다. 위양성이 나오는 게이트는 꺼진다.
    why: '화면에 나가는 문자열에 개발 어휘가 남아 있다',
    test: (line, ctx) => {
      if (allowed(line)) return false
      const shown = ctx.isCopyFile ? literalsIn(line) : displayLiterals(line)
      return shown.some((s) => DEV_WORDS.test(s))
    },
  },
  {
    id: 'unguarded-dev-global',
    // globalThis.__game = … 가 __DEV_BUILD__ 가드 밖에 있다.
    why: '개발용 전역을 가드 없이 운영 빌드에 노출한다',
    test: (line, ctx) =>
      /globalThis\.__(?!gameState)\w+\s*=/.test(line) && !ctx.devGuarded,
  },
]

/**
 * @param {{path: string, text: string}[]} files
 * @returns {{path: string, line: number, rule: string, why: string, source: string}[]}
 */
export function scanDevMarkers(files) {
  const findings = []
  for (const file of files) {
    const lines = file.text.split('\n')
    // __DEV_BUILD__ 블록 안인지 대략 추적한다. 정확한 파서는 과하다 —
    // 이 게이트는 "가드를 아예 안 썼다"를 잡는 것이 목적이고, 실제 사고가 그 모양이었다.
    let guardDepth = 0
    let braceAtGuard = 0
    let depth = 0
    lines.forEach((raw, index) => {
      const line = raw.trim()
      const code = line.replace(/\/\/.*$/, '')
      if (/__DEV_BUILD__/.test(code) && /\bif\b/.test(code)) {
        guardDepth = 1
        braceAtGuard = depth
      }
      // 앞뒤 몇 줄. 패널 배경과 탭 영역 등록은 테두리 바로 곁에 붙어 있다.
      const nearby = lines
        .slice(Math.max(0, index - 4), index + 5)
        .map((l) => l.replace(/\/\/.*$/, '').trim())
        .join('\n')
      const ctx = {
        devGuarded: guardDepth > 0,
        isCopyFile: COPY_FILE.test(file.path),
        nearby,
      }
      if (!line.startsWith('*') && !line.startsWith('//')) {
        for (const rule of RULES) {
          if (rule.test(code, ctx)) {
            findings.push({
              path: file.path,
              line: index + 1,
              rule: rule.id,
              why: rule.why,
              source: line.slice(0, 120),
            })
          }
        }
      }
      depth += (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length
      if (guardDepth > 0 && depth <= braceAtGuard) guardDepth = 0
    })
  }
  return findings
}

export function formatDevMarkerReport(findings) {
  return findings.map((f) => `${f.path}:${f.line} [${f.rule}] ${f.why}\n    ${f.source}`)
}
