# Narrative, release, and publication verification

## 설계 검토 게이트 확인

라이카 서사 전에 [`design-review.md`](design-review.md)의 게이트가 끝나 있어야 한다.

- `design-review.json`이 게임 저장소에 있고 `verdict: "pass"`다.
- `sourceHash`가 현재 `smoke-result.json`의 값과 같다. 다르면 검토 뒤 소스가 바뀐 것이므로 재검토 전에는 진행하지 않는다.
- `design/targets/`의 목표 화면과 잠금 검증 캡처가 커밋되어 있다.
- 검토가 실제 입력 경로(포인터·키 이벤트) 플레이를 포함했는지 `method.inputPath`로 확인한다.

## 제작 서사 검증

- `WHY.md`의 한국어와 영어가 같은 선택을 설명한다.
- 작품 노트가 노리는 재미와 감각을 앞에 두고 말한다. 판정 수치·시뮬레이션 정책·내부 상태가 등장하면 서사 미달이다.
- 공개 카피가 라이카 제작자 1인칭을 유지하고 잠긴 제작 기록에 없는 판단을 덧붙이지 않는다.
- manifest와 아케이드 크레딧이 라이카를 `autonomous game-making agent`로 표기한다.
- `credits.model`이 실제 제작 모델의 풀 모델 ID다. 축약 티어(mini·nano·lite·flash·haiku 류)는 카탈로그 검증(`arcade/scripts/validate.mjs`)에서 거부된다.
- manifest의 제목, 소개, 조작, 세션과 게임 미디어가 제작 잠금과 같다.
- 제작자 일러스트가 `laika-base-v1`, 한·영 대체 문구, 초점 좌표, 640px·1280px JPEG를 갖춘다.
- `node scripts/prepare-editorial.mjs --game <path> --verify`가 통과한다.
- `.creator-lock.json`이 라이카 제작 서사 전 기준 커밋과 같다.

## 릴리스 검증

```bash
npm run build:arcade
npm run verify:arcade
npm run toss:build
```

실제 존재하는 스크립트만 실행한다. `release.json`에서 다음을 확인한다.

- `contractVersion`, `gameId`, `slug`, `releaseSha`
- 엔트리와 CSS의 불변 경로
- 모든 파일의 SHA-256
- 코드 gzip 1.5MB 이하
- 전체 릴리스 16MB 이하, 개별 파일 4MB 이하
- 첫 상호작용 3초 목표(기준 Android, 4G): 코드가 커지면 지연 로드로 크리티컬 패스를 분리했는지 확인
- 제작자 일러스트의 baseId, 한·영 대체 문구, 초점 좌표, 두 JPEG 소스
- 생성 원본 PNG 제외

## 로컬 아케이드

`dist-arcade/`를 `arcade/public/__game-assets/games/<slug>/local-fixture/`에 동기화한다. 소스를 수정했으면 재빌드와 재동기화 전의 픽스처 플레이는 검증으로 인정하지 않는다 — 낡은 빌드에서 통과한 확인은 현재 게임에 대한 증거가 아니다. 아케이드 카탈로그에 연속된 sequence, 날짜, 언어, 크레딧, 작품 노트, 일러스트와 릴리스 해시를 등록한다.

```bash
cd arcade
node scripts/validate.mjs
node scripts/serve.mjs
```

홈, 작품 노트, 플레이 페이지와 모든 자산 요청을 확인한다. 포털 스모크로 한 판을 완주하고 기존 등록 게임도 회귀 검증한다.

### 포털 스모크 드라이버 (게임마다 필수)

포털 스모크와 `publish-game`의 preview·production 완주 검증은 **게임별 드라이버** `arcade/scripts/smoke-drivers/<slug>.mjs`를 호출한다. 없으면 "driver not found"로 공개가 막힌다. 이 파일은 공개 선행 작업이다. 두 사이클 연속(연번 17·18) 이 계약을 매번 역설계했기에 여기 박아 둔다.

드라이버는 sandbox 러너 iframe을 Playwright Frame(`context.runner`)으로 받아, **화면에서 읽을 수 있는 상태만** 보고 **실제 포인터/키 입력**을 캔버스 절대좌표로 넣는다. 판정 함수 직접 호출·정답 벡터 주입은 금지. 기존 드라이버(예: `smoke-drivers/repose.mjs`, `grainsplit.mjs`)를 템플릿으로 복제하는 것이 가장 빠르다.

`smoke-player.mjs`가 호출하는 계약(export default 객체):

- `viewport`, `timeoutMs` — 판 크기와 상한.
- `waitForReady({runner})` — 캔버스와 `__gameState`가 뜰 때까지 대기.
- `readState({runner})` — `runner.evaluate(() => globalThis.__gameState)`. CDP 접근이라 sandbox 불투명 출처를 통과한다.
- `hasProgressed(state)` / `progressValue(state)` — 진행 여부·진행량(언어 검증과 캡처 타이밍에 쓰임).
- `step({runner, page, delay}, state)` — 한 번의 입력. `page.mouse`로 캔버스 절대좌표에 넣는다. 첫 호출에서 `start`를 부른다.
- `start({runner, page})` — 타이틀에서 게임 시작(탭/Space).
- `isFinished(state)` — 종료 판정.
- `shouldCapture(state)` / `screenshotLocator` — 스크린샷 시점·대상.
- `assertLocale({...}, locale)` / `localeControlSelector` — 언어 전환 확인.
- `assertFinal(state)` / `assertPortalResult(result)` — 완주·포털 결과 불변식.

상태 노출은 드라이버가 필요로 한다. 게임이 `__gameState`에 판정에 필요한 값(진행·간극·종료)을 내지 않으면 드라이버가 완주할 수 없다. 간극의 방향을 숨기는 설계라면 드라이버가 힐클라임을 해야 하므로, 상태에 최소한 진행량과 종료 여부는 노출한다.

## 독립 플레이 가능성 교차 검증

제작 에이전트와 맥락을 공유하지 않는 검증자가 다음을 수행한다. 제작 에이전트의 자기 채점(커밋된 시뮬레이션의 통과 출력)만으로 이 절을 대체할 수 없다.

1. `scripts/playability-sim.mjs`가 게임 런타임과 같은 스텝 함수를 틱 단위로 호출하는지 코드를 직접 읽어 확인한다. 판정·시간의 닫힌 공식 재유도는 게이트 무효.
2. 실제 빌드를 브라우저에서 구동하고, 시뮬레이션과 같은 사람 모델(반응 지연 ~N(200ms, 40ms), 화면에서 읽을 수 있는 정보만으로 판단)으로 여러 판을 플레이한다. 입력은 실제 입력 경로(렌더된 화면 좌표에 대한 포인터·키 이벤트)로 주입한다. 판정 함수 직접 호출이나 내부 상태 기반 입력 합성은 실기 플레이가 아니다. 내부 상태는 측정에만 쓰고 판단에 쓰지 않는다.
3. 시뮬레이션이 주장한 수치(완주율, 종료 경로 분포, 숙련 성공률)가 실기에서 재현되는지 대조한다. 뚜렷이 어긋나면 시뮬레이션 조작 또는 규칙 회귀로 보고 공개를 중단한다.

## 지구 플레이 기록 순서

- 첫 공개 시점의 카탈로그에는 `earthReview`가 없어도 된다. ADR 0004대로 평가는 공개 뒤 운영 URL에서 수행한다.
- 평가를 마치면 `earthReview`와 무르 일러스트를 등록하고 카탈로그를 다시 배포한다.
- 카탈로그 검증은 평가 미기록을 최신 한 편까지만 허용한다. 다음 게임이 등록되기 전에 채워야 한다.

## 운영 환경

preview, production deployment URL, 운영 도메인에서 같은 slug와 release SHA를 확인한다. 다음 요청은 모두 200이어야 한다.

- `/`, `/games/<slug>`, `/play/<slug>`
- `entryUrl`, `styleUrls`, 제작자 일러스트, 게임 이미지와 오디오
- `/catalog/games.json`

콘솔 오류, 페이지 오류, 실패 요청은 0건이어야 한다. Vercel Blob과 단일 아케이드 공개가 끝나지 않았으면 해당 게임의 제작 완료로 보고하지 않는다. Toss `.ait` 제출과 출시는 별도 승인 작업이다.
