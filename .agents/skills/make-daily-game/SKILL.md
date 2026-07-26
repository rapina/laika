---
name: make-daily-game
description: Build and publish the next numbered full-production Sputnik Workshop game with brand-blind creative freedom, creator-owned tests, design-conformance review, immutable Arcade release, deployment verification, and post-publication Earth notes. Direct requests enter through run-studio-cycle.
---

# Make Daily Game

다음 연번 게임을 완성해 단일 아케이드에 공개한다.

> 세로형 모바일 디바이스에서 플레이할 수 있는 풀 프로덕션급 웹 게임을 만든다.
> 프로토타입, 기술 데모, 게임잼 출품작처럼 축약하지 않는다. 출시할 완성작이라고
> 판단할 때까지 필요한 시간과 자원을 사용한다.

## 경계

- 콘셉트, 장르, 규칙, 기술, 자원 규모와 기존 게임의 모방·변형·재창작 여부를
  사용자에게 묻지 않는다.
- 제작 에이전트는 브랜드·과거 공개 서사를 받지 않는다.
- 제목, 규칙, 세계, 게임 아트와 사운드를 잠근 뒤에만 라이카 서사를 연다.
- 게임 저장소는 public `rapina/laika-game-<slug>`로 만들고 별도 Vercel
  프로젝트를 만들지 않는다.
- 기존 Vercel 아케이드 공개는 자율 범위다. Toss 출시, 새 유료 리소스, 비용,
  계정·도메인 변경, 광고·결제·개인정보 수집은 사용자 승인을 받는다.
- 루트에서 `git add -A`를 쓰지 않는다.
- 대기로 턴을 끝내지 않는다. 명령과 하위 에이전트 산출물을 직접 판정한다.

## 1. 사전 점검

브랜드 파일을 열기 전에 다음만 읽는다.

- `AGENTS.md`, `STATUS.md`
- `docs/quality-bar.md`
- ADR 0001, 0003, 0008, 0009

```bash
node .agents/skills/make-daily-game/scripts/preflight.mjs
```

`resume-unfinished`와 `resume-publication`이면 기존 게임을 이어서 끝낸다.
`create-next`일 때만 새 게임을 만든다.

## 2. 자유 콘셉트

이전 대화를 받지 않는 `fork_turns: "none"` 제작 맥락에 다음만 전달한다.

- 세로형 모바일 디바이스와 실제 터치를 고려한다.
- 프로토타입이나 작은 실험에서 멈추지 않고 출시할 완성작을 만든다.
- 완성작이라고 판단할 때까지 필요한 시간과 자원을 사용한다.
- 무엇을 얼마나 크게 만들지는 자유다.
- DOM, Canvas, WebGL, WebGPU, 셰이더, 물리, 영상, 생성 이미지와 외부 자산을
  자유롭게 사용할 수 있다.
- 기존 게임을 모방·변형·재창작하거나 최근 작품과 비슷하게 만들어도 된다.
- 결정론, 자동 완주, 깊이, 하나의 조작·재료·색, 목표 화면과 감산은 의무가
  아니다.
- 자신의 게임 로직에 필요한 테스트의 범위와 방법은 제작자가 정한다.
- [`references/creator-workflow.md`](references/creator-workflow.md)를 따른다.

후보 수를 강제하지 않는다. 제작자가 원하는 게임 하나를 고르고 다음을 관제에
돌려준다.

```text
제목 / slug / 무엇을 하는 게임인가 / 주 입력 / 기술·매체 / 세션 구조
```

## 3. 저장소와 제작

```bash
node scripts/new-day.mjs YYYY-MM-DD slug "한국어 제목" # slug: ^[a-z][a-z0-9]*$
node scripts/create-game-repository.mjs --game games/YYYY/YYYY-MM-DD-slug
npm --prefix games/YYYY/YYYY-MM-DD-slug run new-game -- --id "com.sputnikworkshop.<slug>" --name "<EN_TITLE>" --slug "<slug>" --display "<KO_TITLE>"
```

게임 저장소만 볼 수 있는 새 제작 맥락에 콘셉트, creator-workflow와
[`references/creator-verification.md`](references/creator-verification.md)를
전달한다. 제작자는 다음을 수행한다.

- `DAY.md`, `GDD.md`, `ART.md`, manifest 작성
- 원하는 기술·아트·사운드와 자원으로 게임 구현
- 프로덕션 빌드
- 설계 문서에 적은 규칙과 로직을 확인할 게임별 테스트 작성·실행
- 세로 모바일 부팅과 필수 자산 확인
- 현재 sourceHash의 `smoke-result.json` 기록
- 테스트 명령, 확인한 결과와 미확인 항목을 `DAY.md`에 기록

게임이 제공하지 않는 종료, 결과, 재시작, 점수, 키보드, 양언어와 자동 플레이를
검증 편의를 위해 추가하지 않는다.

## 4. 제작 잠금

제작자는 GDD에 적은 게임을 구현하고 자신이 정한 게임별 테스트를 통과시킨다.
GDD는 구현 뒤 게이트를 피하기 위한 문서가 아니라, 실제로 출시하려는 규칙과
경험을 설명하는 기준 문서다. 제작 중 설계가 바뀌면 그 결정을 GDD와 테스트에
함께 반영한다.

공통 자동화는 빌드가 열리고 필수 자산이 존재하는지만 확인한다. 결정론,
자동 완주, 특정 입력 뒤 상태 변화와 특정 테스트 항목 수를 요구하지 않는다.

```bash
node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug
git -C games/YYYY/YYYY-MM-DD-slug add <명시적 경로들>
git -C games/YYYY/YYYY-MM-DD-slug commit -m "Lock game before Laika narrative"
git -C games/YYYY/YYYY-MM-DD-slug push origin main
```

잠금 뒤 소스가 바뀌면 부팅 스모크, 빌드와 픽스처를 갱신하고 `--relock`한 뒤
새 검토자를 사용한다.

## 5. 체르파 출고 검사

이전 대화를 받지 않는 검토자에게 게임 저장소, 빌드 방법과
[`references/design-review.md`](references/design-review.md)만 전달한다.

검토자는 최종 GDD, 실제 프로덕션 빌드와 제작자가 남긴 테스트 결과를 대조하고
schemaVersion 3 `design-review.json`을 커밋한다. 문서의 구체적 약속이 빌드에
구현됐고 제작자 테스트가 통과했으며 빌드가 배포 가능하면 `verdict: "pass"`다.
불일치는 제작자가 설계나 구현 중 의도한 쪽을 분명히 한 뒤 함께 고치고
재검토한다.

## 6. 라이카 서사와 공개 준비

이제 다음을 읽는다.

- `docs/knowledge/STUDIO.md`, `docs/editorial-bar.md`
- `brand/LAIKA.md`, `brand/CHERPA.md`
- ADR 0002, 0006, 0008, 0009
- 릴리스·공개 계약
- [`references/editorial-workflow.md`](references/editorial-workflow.md)
- [`references/publication-verification.md`](references/publication-verification.md)

잠긴 기록만 근거로 `WHY.md`, 아케이드 한·영 카피, 크레딧과 라이카 제작자
일러스트를 만든다. 체르파 공개 기록은 설계 문서와 실제 빌드의 대조 결과를
그대로 옮긴다.

```bash
node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug --verify
```

릴리스 파일의 해시와 크기는 기록하되 창작 예산으로 차단하지 않는다.
목표 화면과 `designProcess.scenes`는 존재할 때만 등록한다.

## 7. 아케이드 공개

게임별 포털 스모크 드라이버는 `reviewMode: "deployment-only"`를 사용한다.
아케이드는 포털, 불변 자산, 세로 런타임과 오류 여부만 확인한다. 게임 규칙이나
완주 여부는 다시 심사하지 않는다.

공개 전에 `arcade/scripts/smoke-drivers/<slug>.mjs`를 만들고, 로컬 아케이드와
루트 카탈로그에 같은 sequence의 초안 항목을 각각 한 개 등록한다. 드라이버는
`waitForReady`와 `screenshotLocator`를 제공한다.

```bash
node scripts/publish-game.mjs --dry-run --game games/YYYY/YYYY-MM-DD-slug
node scripts/publish-game.mjs --publish --game games/YYYY/YYYY-MM-DD-slug
```

Blob 업로드, preview, production, 운영 도메인 검증이 끝날 때까지 진행한다.

## 8. 공개 후 기록

별도 평가자가 운영 URL에서 실제로 플레이한다. 완주를 의무화하지 않고 경험한
범위, 좋았던 점과 걸린 점만 한·영 기록에 남긴다. 깊이·재도전 분석은 선택이다.

- `DAY.md`, `STATUS.md`, `PLAYER_FEEDBACK.md`를 실제 결과로 갱신한다.
- 공정을 바꿨으면 `PROCESS_LOG.md`와 아케이드 `/history`를 함께 갱신한다.
- `record-cycle.mjs`와 cycle done 이벤트를 남긴다.
- 게임·아케이드·루트 저장소를 명시적 경로로 커밋·푸시한다.

최종 보고에는 게임 이름, 운영 URL, 설계 일치 판정, 제작자 테스트와 production
배포 확인, 공정 변경과 승인 대기 중인 Toss 작업만 적는다.
