import assert from 'node:assert/strict'
import test from 'node:test'
import { scanDevMarkers } from './lib/dev-markers.mjs'

const scan = (text, path = 'src/game/Game.ts') => scanDevMarkers([{ path, text }])
const rules = (text, path) => scan(text, path).map((f) => f.rule).sort()

// sequence 12가 운영까지 내보낸 실제 코드 모양이다. 축약하지 않았다.
test('운영으로 새어 나간 sequence 12의 개발용 표시를 잡는다', () => {
  // 표적 위 배열 번호.
  assert.deepEqual(rules("c.fillText(String(i+1),x-4,y+5)"), ['render-array-index'])
  // 판정 상자를 드러낸 디버그 사각 마커.
  assert.deepEqual(rules("c.strokeRect(p.x*390-4,p.y*844-4,8,8)"), ['render-bounding-box'])
  // 픽셀 좌표 덤프 교정 문구.
  assert.deepEqual(rules('c.fillText(`X ${ex}px 왼쪽 · Y ${ey}px`,195,700)'), ['render-unit-dump'])
})

test('개발 어휘가 화면 문구에 남으면 잡는다', () => {
  assert.deepEqual(rules("c.fillText('DEBUG mode',10,10)"), ['dev-vocabulary'])
  assert.deepEqual(rules("el.textContent = 'hitbox on'"), ['dev-vocabulary'])
})

test('개발용 전역을 가드 없이 노출하면 잡되, 가드가 있으면 통과한다', () => {
  assert.deepEqual(rules('globalThis.__game = game'), ['unguarded-dev-global'])
  assert.deepEqual(rules('if (__DEV_BUILD__) {\n  globalThis.__game = game\n}'), [])
})

// 위양성이 한 번이라도 나오면 다음 사이클이 게이트를 꺼 버린다.
// 아래는 전부 이미 공개된 네 게임의 실제 코드에서 가져온 정상 패턴이다.
test('정상 패턴을 잡지 않는다', () => {
  // 폰트 지정의 px는 정상이다. 같은 줄에 fillText가 있어도 인자가 아니다.
  assert.deepEqual(rules("c.font='bold 16px Galmuri11';c.fillText(label,16,53)"), [])
  // CSS 클래스명은 화면 글자가 아니다. (maejil src/ads/webAd.ts)
  assert.deepEqual(rules("overlay.className = 'dummy-ad-overlay'"), [])
  // 쿼리 파라미터 조회도 화면 글자가 아니다. (maejil src/game/MaejilGame.ts)
  assert.deepEqual(rules("if (new URLSearchParams(location.search).has('debug')) {"), [])
  // 스모크 하네스 계약은 의도된 노출이다.
  assert.deepEqual(rules('globalThis.__gameState = state'), [])
  // 템플릿이 모든 게임에 심는 토큰.
  assert.deepEqual(rules("const unit = 'TODO_TOSS_PRODUCT_ID'"), [])
  // 주석은 화면에 나가지 않는다.
  assert.deepEqual(rules('// TODO: debug this later'), [])
})

test('문구 사전 파일은 줄 단위 표시 경로 없이도 검사한다', () => {
  assert.deepEqual(rules("export default { title: 'debug build' }", 'src/i18n/ko.ts'), ['dev-vocabulary'])
  // 같은 문자열이라도 표시 경로가 아닌 일반 파일에서는 통과한다.
  assert.deepEqual(rules("const mode = 'debug build'", 'src/game/Game.ts'), [])
})

// sequence 14의 첫 위양성. 안내 패널 테두리와 재시작 버튼 테두리가 걸렸다.
// 맨 윤곽선(디버그 마커)과 크롬 테두리를 가르는 신호는 두 가지다:
// 같은 좌표를 먼저 채운 패널 배경이 있거나, 탭 영역으로 등록되거나.
test('HUD 크롬 테두리는 판정 상자로 잡지 않는다', () => {
  // 패널: 같은 좌표를 fillRect로 깔고 그 위에 테두리.
  assert.deepEqual(
    rules(
      "ctx.fillRect(20, 74, DESIGN_W - 40, panelHeight)\n" +
        "ctx.strokeStyle = 'rgba(232, 238, 246, 0.28)'\n" +
        'ctx.strokeRect(20, 74, DESIGN_W - 40, panelHeight)',
    ),
    [],
  )
  // Canvas 1px 테두리를 선명하게 만드는 대칭 0.5px inset도 같은 패널이다.
  assert.deepEqual(
    rules('ctx.fillRect(28, 30, 334, 74)\nctx.strokeRect(28.5, 30.5, 333, 73)'),
    [],
  )
  // 두꺼운 결과판의 대칭 1px inset도 같은 패널이다.
  assert.deepEqual(
    rules('ctx.fillRect(34, 646, 322, 137)\nctx.strokeRect(35, 647, 320, 135)'),
    [],
  )
  // 버튼: 테두리를 그리고 그 사각형을 탭 영역으로 등록한다.
  assert.deepEqual(
    rules(
      'ctx.strokeRect(60, 574, DESIGN_W - 120, 34)\n' +
        "boxes.push({ name: 'restart', x: 60, y: 574, w: DESIGN_W - 120, h: 34 })",
    ),
    [],
  )
})

test('맨 윤곽선 디버그 마커는 여전히 잡는다', () => {
  // 채운 배경도, 탭 영역 등록도 없다. 판정 좌표에 선만 긋는다.
  assert.deepEqual(rules('c.strokeRect(p.x*390-4,p.y*844-4,8,8)'), ['render-bounding-box'])
  // 좌표가 다른 곳을 채웠다고 해서 면제되지 않는다.
  assert.deepEqual(
    rules('ctx.fillRect(0, 0, 390, 844)\nctx.strokeRect(gate.x - 6, gate.y - 6, 12, 12)'),
    ['render-bounding-box'],
  )
})

// 아래 셋은 sequence 14의 첫 면제 구현이 전부 통과시켰다. 감독 검수에서 실증했다.
// 면제를 좁힐 때 되돌아오기 쉬운 구멍이라 고정해 둔다.
test('크롬 면제가 디버그 마커의 도피처가 되지 않는다', () => {
  // 배경 세로 채움이 원점의 디버그 상자를 사면하면 안 된다.
  // (좌상단 두 개만 비교하던 첫 구현의 구멍)
  assert.deepEqual(rules('c.fillRect(0,0,390,844)\nc.strokeRect(0,0,12,12)'), [
    'render-bounding-box',
  ])
  // 일부 변만 우연히 가까운 상자는 패널 inset이 아니다.
  assert.deepEqual(
    rules('ctx.fillRect(28,30,334,74)\nctx.strokeRect(28.5,30.5,332,73)'),
    ['render-bounding-box'],
  )
  // 탭 영역 등록이 곁에 있다는 것만으로 사면되면 안 된다. 같은 자리여야 한다.
  assert.deepEqual(
    rules('hitAreas.push(restart)\nc.strokeRect(hit.x-2,hit.y-2,hit.w+4,hit.h+4)'),
    ['render-bounding-box'],
  )
  // `boxes[` 를 도는 디버그 오버레이가 이름만으로 빠져나가면 안 된다.
  assert.deepEqual(
    rules('for(const b of boxes){\n  c.strokeRect(b.x,b.y,b.w,b.h)\n}\nconst z=boxes[0]'),
    ['render-bounding-box'],
  )
})
