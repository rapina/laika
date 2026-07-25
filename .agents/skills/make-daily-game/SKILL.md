---
name: make-daily-game
description: Build and publish the next numbered hyper-casual game for Sputnik Workshop with a context-isolated, brand-blind concept and production stage followed by a post-lock Laika maker narrative, original art and sound, Korean/English copy, deterministic tests, Arcade registration, verified Vercel production release, and production QA. This is the production workflow, normally invoked by an orchestrator that the run-studio-cycle skill delegates to; when a user asks for a new game directly, run-studio-cycle is the entry point because it checks the verification layer first and repairs the process afterwards. Resume the pending draft instead of creating a duplicate. Do not use for a small edit to an existing completed game unless the user asks to run the full production cycle.
---

# Make Daily Game

다음 연번 게임 한 편을 브랜드 블라인드 제작 맥락에서 완성한 뒤, 별도 라이카 맥락에서 라이카가 직접 만든 것으로 설명하고 단일 아케이드에 공개한다. 게임은 하루 단위가 아니라 연번(sequence)으로 이어진다.

## 경계

- 창작 결정을 사용자에게 되묻지 않는다.
- 콘셉트, 제작, 서사, 평가 에이전트는 풀 모델에서 실행한다. 축약 티어(mini, nano, lite, flash, haiku 류)로는 시작하지 않는다. 관제 에이전트는 시작 시 자신의 모델 ID를 확인해 축약 티어면 작업을 중단하고 사용자에게 알린다. 하위 에이전트를 만들 때 모델 티어를 낮추지 않는다(명시적 다운그레이드 금지, 세션 모델 상속). 실제 제작 모델 ID를 `credits.model`에 그대로 기록한다 — 아케이드 카탈로그 검증이 축약 티어 ID를 거부한다.
- 콘셉트와 제작 에이전트에는 라이카, Sputnik Workshop의 공개 서사, 우주 설정, 과거 작품 노트와 제작자 일러스트를 제공하지 않는다.
- 게임의 제목, 규칙, 세계, 시각 매체, 팔레트, 대표 장면, 게임 아트와 사운드를 잠근 뒤에만 라이카 제작 서사를 시작한다.
- 라이카 제작 서사는 잠긴 게임을 브랜드 설정에 맞춰 바꿀 수 없다.
- 진행 중(미완성 또는 미공개) 게임은 한 번에 하나만 둔다. 초안이 있으면 이어서 완성하고, 공개가 끝나면 곧바로 다음 번호를 시작할 수 있다. 하루에 여러 편을 만들어도 된다.
- 기존 Vercel 아케이드 공개는 자율 범위다. Toss 출시, 새 유료 서비스나 Vercel 프로젝트, 비용, 계정·도메인 변경, 광고·결제·개인정보 수집, 권리가 불명확한 자산은 사용자 승인을 받는다.
- 프로토타입이나 로컬 등록에서 멈추지 않는다.
- 관제 저장소 루트에서 `git add -A`를 쓰지 않는다. 다른 세션이 만들고 있는 게임 디렉터리를 임베디드 저장소로 삼켜 버린다(두 번 발생). 바꾼 파일을 이름으로 지정해 담고, 게임은 공개 시점에 `git submodule add`로만 편입한다.
- 관제는 대기 상태로 턴을 끝내지 않는다. 오래 걸리는 명령(테스트, 스모크, 빌드, 공개 스크립트)은 foreground로 실행해 결과를 직접 받고, 하위 에이전트의 완료 통지를 기다리는 대신 그 산출물(`design-review.json`, `smoke-result.json`, 카탈로그, 운영 URL 응답)을 직접 읽어 상태를 판정한다. 하위 에이전트가 대기로 멈췄으면 산출물을 확인한 뒤 이어받을 새 맥락을 만들어 남은 작업을 끝낸다. 이 경계는 2회 연속 제작에서 관제와 검토자가 각각 대기 중 정지해 사람이 다섯 번 재개시켜야 했던 사건 뒤에 추가됐다.

## 1. 중립 사전 점검

1. `RTK.md`, `launchpad/`, `arcade/`, `scripts/new-day.mjs`가 있는 관제 저장소 루트를 찾는다.
2. 다음 중립 자료만 읽는다.
   - `AGENTS.md`, `RTK.md`, `STATUS.md`
   - `docs/quality-bar.md`
   - `docs/knowledge/CRAFT.md`
   - `docs/architecture/0001-single-arcade.md`, `docs/architecture/0003-brand-blind-production.md`
   - `docs/knowledge/PLAYER_FEEDBACK.md`의 최근 중립 학습
3. 이 단계에서는 `brand/`, `docs/knowledge/STUDIO.md`, `docs/editorial-bar.md`, 과거 `WHY.md`, 아케이드 작품 노트, 제작자 일러스트를 열지 않는다.
4. 사전 점검을 실행한다.

```bash
node .agents/skills/make-daily-game/scripts/preflight.mjs
```

이 스킬 트리는 `.agents/skills/make-daily-game/`(git 정본)과 `.claude/skills/make-daily-game/`(Claude Code가 읽는 경로)에 하드링크로 미러링되어 있다. 같은 파일이므로 어느 쪽을 고쳐도 함께 바뀌지만, 문서에 적는 경로는 정본인 `.agents/`를 쓴다.

5. `recommendation`을 따른다.
   - `resume-unfinished`: `targetGame`을 이어서 완성한다.
   - `resume-publication`: 새 게임을 만들지 않고 잠금과 로컬 gate를 확인한 뒤 공개를 재개한다.
   - `create-next`: `nextSequence` 번호로 새 게임을 만든다.
   - `.studio.json`이 없는 게임 디렉터리도 중단된 scaffold로 보고 복구한다.

## 2. 브랜드 블라인드 콘셉트 잠금

[`references/creator-workflow.md`](references/creator-workflow.md)를 읽는다.

최근 게임에서는 실제 제목, 서사, 공개 카피를 제외하고 다음 반복 지문만 추린다.

```text
핵심 입력 / 시스템 반응 / 재료 / 시각 매체 / 대표 색 / 세션 구조 / 깊이 구조(난이도 단계 수, 판정 단계 수)
```

이전 대화를 물려받지 않는 새 에이전트 맥락을 만든다. Codex에서는 `fork_turns: "none"`인 하위 에이전트를 사용하고, 다른 환경에서는 동등한 새 맥락을 사용한다. 에이전트에는 아래 항목만 전달한다.

- 390×844 기준의 한 손 세로 게임. 한 판 길이는 콘셉트가 정한다(기본 30초~3분). 짧은 세션은 선택지이지 목표가 아니며, 규칙을 배우고 교정할 시간을 세션이 담아야 한다.
- 한국어·영어와 접근성, 결정론 요구
- 최근 게임의 중립 반복 지문과 깊이 구조 기준선. 새 콘셉트의 깊이는 이 기준선 이상이어야 한다.
- 깊이 축은 콘셉트에 내장되어야 한다는 요구. 규칙의 자연 변수(속도, 판정 폭, 목표 배치, 리듬)를 조이는 것만으로 긴장이 상승해야 하며, 별도 기능을 접붙여야 깊이가 생기는 후보는 제출할 수 없다.
- 시각·물리 매체의 자유: WebGL 셰이더, 실시간 물리, 유체, 파티클 같은 동적 매체도 동등한 후보이며, 후보 중 최소 하나는 동적 매체를 핵심 표현으로 써야 한다는 요구. 판정에 관여하는 시뮬레이션만 결정론을 유지하면 된다.
- `docs/knowledge/CRAFT.md`의 깊이 구조 절
- 최근 플레이 피드백의 중립 학습. 과거 제목, 세계, 제작자 서사와 공개 카피는 제외한다.
- 서로 다른 후보를 비교해 하나를 스스로 고르라는 요청

작업공간, 루트 문서, 브랜드 파일, 공개 카탈로그를 읽지 못하게 한다. 선택 결과는 다음 콘셉트 잠금으로 받는다.

```text
제목 / 질문 / 노리는 재미와 감각 / 핵심 입력 / 시스템 반응과 긴장 변화 / 재료 / 시각 매체
대표 색 / 세계 / 마지막 장면 / 한 판 길이 / 제외할 요소
```

## 3. 중립 저장소와 제작

새 게임일 때 관제 에이전트가 저장소를 만든다.

```bash
node scripts/new-day.mjs YYYY-MM-DD slug "한국어 제목"
```

scaffold 직후 GitHub 저장소와 `origin`을 만든다. 모든 새 게임 저장소는
`rapina/laika-game-<slug>` 이름을 사용하고 처음부터 public으로 공개한다.

```bash
node scripts/create-game-repository.mjs --game games/YYYY/YYYY-MM-DD-slug
```

- 날짜는 Asia/Seoul의 실제 제작일을 사용한다. 같은 날짜에 여러 게임이 있어도 되며, 게임의 정체성은 카탈로그 `sequence`다.
- `sequence`는 카탈로그가 부여하는 공개 번호이므로 제작 소유가 아니다. 잠금 전에 넣어도 되고 공개 단계에서 넣어도 되며, 잠금 검증은 양쪽에서 이 값을 걷어내고 비교한다. 잠금 뒤에 번호를 적었다고 잠금이 깨지지 않는다.
- slug는 `[a-z][a-z0-9]*` 형식으로 정한다.
- 제품 식별자는 저장소 생성 직후 관제 에이전트가 바꾼다.
- `README.md`는 한국어와 영어로 제목, 설명, 조작, 로컬 실행, 검증,
  라이선스를 동등하게 제공한다.

```bash
npm run new-game -- --id "com.sputnikworkshop.<slug>" --name "<EN_TITLE>" --slug "<slug>" --display "<KO_TITLE>"
```

이전 대화를 받지 않는 제작 에이전트 맥락을 만들고, 게임 저장소를 유일한 작업 경로로 지정한다. 콘셉트 잠금, 게임 저장소 경로, `docs/knowledge/CRAFT.md` 사본, [`references/creator-workflow.md`](references/creator-workflow.md), [`references/creator-verification.md`](references/creator-verification.md)만 전달한다. 루트 경로와 공개 자료의 위치는 전달하지 않는다. 제작 에이전트는 다음을 수행한다.

- `DAY.md`, `GDD.md`, `ART.md`를 중립 문체로 작성
- 최근 플레이 학습에서 최대 두 개를 선택하고 `DAY.md`에 반영 여부와 화면 정보만 사용하는 검증 방법을 기록
- `game.manifest.json`의 제목, 소개, 조작, 세션과 게임 미디어를 중립 정보로 작성
- GDD 작성 뒤 코드 시작 전에 목표 화면(첫 판, 핵심 동사 직후, 게임 오버)을 이미지 생성 도구로 만들어 `design/targets/`에 표준 이름(first-play, verb-<grade>, game-over)으로 커밋하고 구현 기준으로 삼음. 이 화면들은 공개 대상 산출물이다
- 결정론 규칙과 테스트를 먼저 작성한 뒤 화면 연결
- 첫 판 가이드를 세 질문(입력이 무엇을 하는지 · 언제 행동하는지 · 목표와 종료 조건)에 화면에서 답하게 구현
- 게임 아트와 사운드를 콘셉트의 시각 매체에 맞춰 제작. 타이틀 키 이미지와 필요한 원재료 질감은 이미지 생성 도구로 만들어 실제 게임에 사용하고 출처를 `ART.md`에 기록
- 한국어와 영어의 기능과 정보 일치
- 임시 자산, 템플릿 문구, 이전 게임 흔적 제거
- 웹 빌드, 전체 자동 플레이, 사람 모델 플레이 가능성 시뮬레이션, 세 뷰포트, 일시정지·복귀·음소거·언어 전환 검증
- Canvas/WebGL 게임은 실제 표시 크기와 backing-store 크기를 함께 측정한다. 내부 렌더 해상도를 `1` 미만으로 고정하거나 기기 DPR을 무시해 흐릿해지는 구현은 금지한다. 각 검증 뷰포트에서 `canvas.width / CSS width`와 `canvas.height / CSS height`가 `max(1, devicePixelRatio)` 이상인지 확인하고, 성능 최적화가 필요하면 해상도가 아니라 파티클·후처리·갱신 빈도를 먼저 줄인다.

`WHY.md`, 라이카 그림, 공개 카피와 크레딧은 만들지 않는다.

## 4. 제작 잠금

관제 에이전트가 결과를 콘셉트 잠금과 대조한다. 플레이 가능한 첫 버전에서 감산 패스를 두 번 적용하고, 대표 조작과 장면을 강화한다. 새 기능으로 빈자리를 채우지 않는다.

감산 뒤 잠금 전에 깊이 게이트를 확인한다.

- 진행 중 목표·위험·공간·리듬·판정 중 하나 이상이 변해 숙련 판단이 생기는가
- 그 변화가 GDD 수치와 테스트로 검증되는가
- 한 판이 끝난 뒤 점수 차이를 만드는 지표가 실제 플레이어 실력 차이를 반영하는가
- 사람 모델 플레이 가능성 게이트(직관·숙련 두 정책 시뮬레이션)를 수치로 통과했고 그 수치가 `DAY.md`에 있는가
- 첫 판 화면 캡처만 보고 세 질문(입력이 무엇을 하는지 · 언제 행동하는지 · 목표와 종료 조건)에 답할 수 있는가
- 게임 오버 화면 캡처만 보고 두 질문(판이 끝났는가 · 어떻게 다시 시작하는가)에 답할 수 있는가
- 판정 등급별 핵심 동사 직후 캡처만 보고 재료의 반응과 판정 등급을 답할 수 있는가
- 검증 캡처가 GDD 뒤에 만든 목표 화면 수준에 도달했는가(의도적 차이는 `DAY.md` 기록으로만 인정)
- 대표 모바일 뷰포트에서 Canvas backing-store가 CSS 표시 크기보다 작지 않고 DPR을 반영하는가. 확대 캡처에서 글자·대각선·원형 테두리가 흐릿하거나 픽셀 보간된 흔적이 있으면 자동 플레이 통과와 무관하게 잠금·공개를 중단한다.

깊이 게이트 미달은 감산이 만든 여백이 아니라 결함이다. 새 기능을 붙이는 대신 핵심 입력의 변주(단계, 가속, 판정 폭, 목표 배치)로 보강하고, 보강 뒤 콘셉트 잠금과 다시 대조한다.

제작 검증이 통과하면 다음 명령으로 제작 소유 파일을 잠그고 라이카 제작 서사 경로를 연다.

```bash
node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug
```

이 명령 전에는 라이카 관련 자료를 읽지 않는다. `.creator-lock.json`이 만들어지고 `.studio.json.editorialState`가 `ready`가 되었는지 확인한다.

잠금 파일과 제작 결과를 라이카 제작 서사 전 기준 커밋으로 남긴다. `.creator-lock.json`은 손으로 편집하지 않는다. 서사 단계에서는 이 파일이 바뀌면 안 되고, 제작 결함을 고칠 때만 아래 `--relock` 명령으로 갱신한다.

잠금 뒤에 게임 소스를 수정하는 모든 경우(결함 수정 포함)는 같은 변경 사이클 안에서 다음을 모두 마친다: 결정론 테스트와 `npm run smoke` 재실행(sourceHash 갱신, 재시작 확인 포함) → 재빌드 → `dist-arcade/`와 아케이드 local-fixture 재동기화 → 잠금 갱신 → `DAY.md` 검증 기록 추가. 빌드나 픽스처가 소스보다 오래된 채로 남기지 않는다.

```bash
node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug --relock --reason "무엇을 왜 고쳤는지"
```

`--relock`은 현재 smoke 증거를 다시 검사하고, 바뀐 파일 목록과 이유를 잠금 파일의 `relocks` 이력에 남긴 뒤 `--verify`를 통과시킨다. 설계 검토를 이미 받았다면 소스가 바뀐 것이므로 새 검토자 맥락으로 재검토한다.

**수정 사이클의 커밋은 만드는 즉시 push한다.** push는 배포가 아니다. 사람들이 하는 빌드는 카탈로그의 `releaseSha`와 Blob이 고정하므로, 게임 저장소에 push해도 운영은 바뀌지 않는다. 반대로 push를 미루면 잠금도 검토도 로컬 HEAD를 보고 초록을 내는데 공개된 빌드는 낡은 채로 남는다. sequence 12는 이걸로 사이클 하나를 통째로 날렸다. 게시 게이트가 어차피 `origin/main == HEAD`를 요구하므로 미루는 것에 이득도 없다.

```bash
node scripts/release-drift.mjs --game games/YYYY/YYYY-MM-DD-slug
```

로컬·원격·공개된 빌드 셋을 나란히 보여 준다. 공개 뒤 기록만 쌓인 것은 어긋남으로 세지 않는다.

```bash
git -C games/YYYY/YYYY-MM-DD-slug add -A
git -C games/YYYY/YYYY-MM-DD-slug commit -m "Lock game before Laika narrative"
```

## 5. 설계 검토 게이트 (공개 차단)

[`references/design-review.md`](references/design-review.md)를 따른다. 제작 잠금 커밋 뒤, 라이카 서사 전에 실행한다.

- 이전 대화를 받지 않는 검토자 맥락을 만들고 게임 저장소, 빌드 실행 방법, `references/design-review.md`만 전달한다. 브랜드 문서와 제작 에이전트의 자기 평가는 전달하지 않는다.
- 검토자는 GDD 약속 대조표를 만들고, 실제 빌드를 실제 입력 경로(포인터·키 이벤트)의 사람 모델 세 프로필(직관·숙련·자연 제스처)로 플레이한 뒤 `design-review.json`을 게임 저장소에 커밋한다.
- `verdict: "blocked"`면 라이카 서사·릴리스·공개를 진행하지 않는다. findings를 제작 사이클로 되돌리고, 잠금 뒤 수정 사이클을 마친 뒤 새 검토자 맥락으로 재검토한다.
- `verdict: "pass"`이고 `sourceHash`가 현재 `smoke-result.json`과 일치할 때만 다음 단계로 간다.

## 6. 라이카 제작 서사와 공개

이제 다음 자료를 읽는다.

- `docs/knowledge/STUDIO.md`, `docs/editorial-bar.md`
- `brand/LAIKA.md`, `brand/prompts/laika-style.md`, `brand/CHERPA.md`
- `docs/architecture/0002-autonomous-publication.md`, `docs/architecture/0006-transparent-design-process.md`
- `docs/contracts/game-release-v1.md`, `docs/contracts/game-publication-v1.md`
- [`references/editorial-workflow.md`](references/editorial-workflow.md)
- [`references/publication-verification.md`](references/publication-verification.md)

완성된 게임을 플레이한 뒤 `WHY.md`, 한·영 공개 카피, 크레딧과 라이카 일러스트를 작성한다. `game.manifest.json`에는 `credits`, `whyCreated`, `media.makerIllustration`만 추가한다. 공개 기록에서는 라이카가 게임을 직접 만든 제작자로 주제와 선택을 설명한다. 잠긴 `DAY.md`, `GDD.md`, `ART.md`와 검증 결과에 없는 동기나 결정을 덧붙이지 않는다.

라이카 제작 서사 단계에서 수정 가능한 게임 저장소 경로는 다음뿐이다.

- `.studio.json`, `WHY.md`
- `game.manifest.json`의 `credits`, `whyCreated`, `media.makerIllustration`
- `ART.md`의 공개 일러스트 부록과 `DAY.md`의 검증 결과는 뒤에만 추가
- `art/source/laika-<slug>.png`, `art/prompts/laika-<slug>.md`, `art/provenance/laika-<slug>.json`
- `public/art/laika-<slug>-640.jpg`, `public/art/laika-<slug>-1280.jpg`

`design-review.json`은 설계 검토자의 산출물이므로 서사 단계에서 수정하지 않는다. 서사 단계는 그 `summary`와 주요 promises를 관제소의 거북이 체르파의 공개 문장(ko·en, `brand/CHERPA.md`의 기록체)으로 옮겨 적어 카탈로그 `designProcess.review`에 등록할 준비만 한다. 어조 변환만 허용하고 판정은 바꿀 수 없다.

라이카 제작 서사를 마친 뒤 잠금을 검증한다.

```bash
node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug --verify
git -C games/YYYY/YYYY-MM-DD-slug diff --exit-code HEAD -- .creator-lock.json
```

## 7. 릴리스와 로컬 아케이드

- `dist-arcade/`와 `release.json`을 만든다.
- 로컬 fixture를 `arcade/public/__game-assets/games/<slug>/local-fixture/`에 동기화한다.
- 아케이드와 관제 카탈로그에 한·영 작품 노트, 설계 이유, 제작자 일러스트, 고정 릴리스 해시, 실제 제작 모델 ID(`credits.model`)를 등록한다.
- 제작 과정을 카탈로그 `designProcess`에 등록한다: 설계 요약(질문·코어 루프), 장면별 목표 화면 vs 실제 캡처(이미지는 `arcade/public/art/design/<slug>/`에 복사), 체르파 설계 검토(verdict, 대조표 요약, ko·en, reviewer `Cherpa`). sequence 009부터 필수이며 아케이드 카탈로그 검증이 누락을 거부한다.
- 수치와 해시는 `.studio.json`, `game.manifest.json`, `release.json`에서 읽는다.
- 홈, `/games/<slug>`, `/play/<slug>`를 한국어와 영어로 확인한다.
- [`references/publication-verification.md`](references/publication-verification.md)의 로컬 gate를 모두 통과한다.

## 8. 아케이드 공개

[`references/publishing.md`](references/publishing.md)를 읽고 따른다. `design-review.json`의 `verdict`가 `pass`가 아니거나 `sourceHash`가 낡았으면 공개 스크립트가 거부한다.

```bash
node scripts/publish-game.mjs --dry-run --game games/YYYY/YYYY-MM-DD-slug
node scripts/publish-game.mjs --publish --game games/YYYY/YYYY-MM-DD-slug
```

스크립트가 Blob 업로드, preview 완주, 같은 커밋의 production 배포, 운영 도메인 완주와 관제 카탈로그 동기화를 마칠 때까지 진행한다. 인증이 막히면 로컬 작업을 끝낸 뒤 필요한 명령과 위치를 안내하고, 인증 직후 같은 게임의 공개를 재개한다.

## 9. 기록과 종료

공개 뒤 이전 대화를 받지 않는 평가 에이전트가 **운영 URL에서** 게임을 검토한다. 지구 기록은 공개 전에 만들지 않는다. 아케이드 카탈로그는 `earthReview` 없이 등록할 수 있으며, 공개 후 평가로 채운 뒤 다시 배포한다. 카탈로그 검증은 평가 미기록을 최신 한 편까지만 허용하므로, 다음 게임을 시작하기 전에 반드시 채운다. 평가에는 게임 저장소와 플레이 경로만 제공하고 브랜드 문서는 제공하지 않는다. 평가는 게임을 플레이한 사람의 언어로만 쓴다 — 화면에서 보이고 손으로 느껴진 것, 재미있던 순간과 걸린 순간. 시뮬레이션 정책, 완주율·공명 횟수 같은 검증 수치, 내부 상태, 검증 방법론은 평가가 아니라 제작 검증 기록이므로 평가문에 등장하면 반려한다. 콘셉트가 노린 재미와 감각이 실제 플레이에서 느껴졌는지를 반드시 답한다. 플레이하지 못한 경로는 확인한 것처럼 쓰지 않는다. 한 줄 인상, 강점, 마찰, 깊이 평가, 다음 게임에 넘길 중립 학습과 근거 범위를 받아 작품 노트의 지구 플레이 기록과 `docs/knowledge/PLAYER_FEEDBACK.md`를 갱신한다. 깊이 평가는 두 질문에 답한다: 한 판 안에서 숙련 차이가 실제로 드러났는가, 한 판이 끝난 뒤 더 잘할 방법이 보여 재도전 이유가 생겼는가. 중립 학습에는 깊이·재도전에 관한 항목을 최소 한 개 포함한다. 자동 플레이가 내부 정답 상태를 읽는 경우 화면 정보만 사용하는 사람 관점 검증과 구분한다.

- `DAY.md`에 실제 명령, 수치, 실패와 남은 위험을 기록한다.
- 오늘 게임에서 검증된 기법이 `docs/knowledge/CRAFT.md`의 기존 패턴보다 낫거나 새로우면 제목과 세계를 제외한 기법과 수치만 반영한다.
- `STATUS.md`에는 현재 상태만 반영한다.
- 게임이 아니라 공정 자체(게이트, 워크플로, 페르소나, 공개 형식)를 바꿨다면 `docs/knowledge/PROCESS_LOG.md`와 아케이드 `public/catalog/process.json`(공개 /history)을 함께 갱신한다.
- 두 번째 사용처가 확인된 공통화 후보만 `docs/knowledge/LAUNCHPAD_BACKLOG.md`에 적는다.
- 각 저장소의 상태를 확인하고 다른 작업자의 변경을 보존한다.
- 끝난 게임의 작업공간 정리는 사이클을 여는 쪽(`run-studio-cycle` §1)이 `node scripts/clean-game-workspaces.mjs`로 한다. 제작 중에는 실행하지 않는다. 지금 만드는 게임의 `node_modules`가 필요하기 때문이다.
- 최종 보고에는 게임 이름과 만든 이유, 운영 플레이 URL, 테스트 결과, 별도 승인이 남은 Toss 작업만 짧게 적는다.

production에서 한 판을 완주하지 못하면 완료라고 보고하지 않는다.
