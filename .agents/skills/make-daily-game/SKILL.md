---
name: make-daily-game
description: Build and publish one complete daily hyper-casual game for Sputnik Workshop with a context-isolated, brand-blind concept and production stage followed by a post-lock Laika maker narrative, original art and sound, Korean/English copy, deterministic tests, Arcade registration, verified Vercel production release, and production QA. Use from the toss-game-studio workspace when the user says "게임 만들어줘", "오늘 게임 만들어줘", "하루 한 게임", "새 게임을 만들자", "make today's game", or asks to run the daily game workflow. Resume today's draft instead of creating a duplicate. Do not use for a small edit to an existing completed game unless the user asks to run the full daily production cycle.
---

# Make Daily Game

오늘의 게임 한 편을 브랜드 블라인드 제작 맥락에서 완성한 뒤, 별도 라이카 맥락에서 라이카가 직접 만든 것으로 설명하고 단일 아케이드에 공개한다.

## 경계

- 창작 결정을 사용자에게 되묻지 않는다.
- 콘셉트와 제작 에이전트에는 라이카, Sputnik Workshop의 공개 서사, 우주 설정, 과거 작품 노트와 제작자 일러스트를 제공하지 않는다.
- 게임의 제목, 규칙, 세계, 시각 매체, 팔레트, 대표 장면, 게임 아트와 사운드를 잠근 뒤에만 라이카 제작 서사를 시작한다.
- 라이카 제작 서사는 잠긴 게임을 브랜드 설정에 맞춰 바꿀 수 없다.
- 한 날짜에 게임 하나만 만든다. 오늘의 초안이 있으면 이어서 완성한다.
- 기존 Vercel 아케이드 공개는 자율 범위다. Toss 출시, 새 유료 서비스나 Vercel 프로젝트, 비용, 계정·도메인 변경, 광고·결제·개인정보 수집, 권리가 불명확한 자산은 사용자 승인을 받는다.
- 프로토타입이나 로컬 등록에서 멈추지 않는다.

## 1. 중립 사전 점검

1. `RTK.md`, `launchpad/`, `arcade/`, `scripts/new-day.mjs`가 있는 관제 저장소 루트를 찾는다.
2. 다음 중립 자료만 읽는다.
   - `AGENTS.md`, `RTK.md`, `STATUS.md`
   - `docs/quality-bar.md`
   - `docs/architecture/0001-single-arcade.md`, `docs/architecture/0003-brand-blind-production.md`
3. 이 단계에서는 `brand/`, `docs/knowledge/STUDIO.md`, `docs/editorial-bar.md`, 과거 `WHY.md`, 아케이드 작품 노트, 제작자 일러스트를 열지 않는다.
4. 사전 점검을 실행한다.

```bash
node .agents/skills/make-daily-game/scripts/preflight.mjs
```

5. `recommendation`을 따른다.
   - `resume-today` 또는 `resume-unfinished`: `targetGame`을 이어서 작업한다.
   - `resume-publication`: 새 게임을 만들지 않고 잠금과 로컬 gate를 확인한 뒤 공개를 재개한다.
   - `review-published-today`: 운영 환경을 재검증한다.
   - `resolve-date-conflict`: 어떤 저장소를 살릴지 사용자에게 묻는다.
   - `create-today`: 이때만 새 게임을 만든다.
   - `.studio.json`이 없는 날짜 디렉터리도 중단된 scaffold로 보고 복구한다.

## 2. 브랜드 블라인드 콘셉트 잠금

[`references/creator-workflow.md`](references/creator-workflow.md)를 읽는다.

최근 게임에서는 실제 제목, 서사, 공개 카피를 제외하고 다음 반복 지문만 추린다.

```text
핵심 입력 / 시스템 반응 / 재료 / 시각 매체 / 대표 색 / 세션 구조
```

이전 대화를 물려받지 않는 새 에이전트 맥락을 만든다. Codex에서는 `fork_turns: "none"`인 하위 에이전트를 사용하고, 다른 환경에서는 동등한 새 맥락을 사용한다. 에이전트에는 아래 항목만 전달한다.

- 390×844 기준의 한 손 세로 게임, 60초 이내 한 판
- 한국어·영어와 접근성, 결정론 요구
- 최근 게임의 중립 반복 지문
- 서로 다른 후보를 비교해 하나를 스스로 고르라는 요청

작업공간, 루트 문서, 브랜드 파일, 공개 카탈로그를 읽지 못하게 한다. 선택 결과는 다음 콘셉트 잠금으로 받는다.

```text
제목 / 질문 / 핵심 입력 / 시스템 반응과 긴장 변화 / 재료 / 시각 매체
대표 색 / 세계 / 마지막 장면 / 한 판 길이 / 제외할 요소
```

## 3. 중립 저장소와 제작

새 게임일 때 관제 에이전트가 저장소를 만든다.

```bash
node scripts/new-day.mjs YYYY-MM-DD slug "한국어 제목"
```

- 날짜는 Asia/Seoul의 현재 날짜를 사용한다.
- slug는 `[a-z][a-z0-9]*` 형식으로 정한다.
- 제품 식별자는 저장소 생성 직후 관제 에이전트가 바꾼다.

```bash
npm run new-game -- --id "com.sputnikworkshop.<slug>" --name "<EN_TITLE>" --slug "<slug>" --display "<KO_TITLE>"
```

이전 대화를 받지 않는 제작 에이전트 맥락을 만들고, 게임 저장소를 유일한 작업 경로로 지정한다. 콘셉트 잠금, 게임 저장소 경로, [`references/creator-workflow.md`](references/creator-workflow.md), [`references/creator-verification.md`](references/creator-verification.md)만 전달한다. 루트 경로와 공개 자료의 위치는 전달하지 않는다. 제작 에이전트는 다음을 수행한다.

- `DAY.md`, `GDD.md`, `ART.md`를 중립 문체로 작성
- `game.manifest.json`의 제목, 소개, 조작, 세션과 게임 미디어를 중립 정보로 작성
- 결정론 규칙과 테스트를 먼저 작성한 뒤 화면 연결
- 게임 아트와 사운드를 콘셉트의 시각 매체에 맞춰 제작
- 한국어와 영어의 기능과 정보 일치
- 임시 자산, 템플릿 문구, 이전 게임 흔적 제거
- 웹 빌드, 전체 자동 플레이, 세 뷰포트, 일시정지·복귀·음소거·언어 전환 검증

`WHY.md`, 라이카 그림, 공개 카피와 크레딧은 만들지 않는다.

## 4. 제작 잠금

관제 에이전트가 결과를 콘셉트 잠금과 대조한다. 플레이 가능한 첫 버전에서 감산 패스를 두 번 적용하고, 대표 조작과 장면을 강화한다. 새 기능으로 빈자리를 채우지 않는다.

제작 검증이 통과하면 다음 명령으로 제작 소유 파일을 잠그고 라이카 제작 서사 경로를 연다.

```bash
node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug
```

이 명령 전에는 라이카 관련 자료를 읽지 않는다. `.creator-lock.json`이 만들어지고 `.studio.json.editorialState`가 `ready`가 되었는지 확인한다.

잠금 파일과 제작 결과를 라이카 제작 서사 전 기준 커밋으로 남긴다. `.creator-lock.json`은 이후 수정하지 않는다.

```bash
git -C games/YYYY/YYYY-MM-DD-slug add -A
git -C games/YYYY/YYYY-MM-DD-slug commit -m "Lock game before Laika narrative"
```

## 5. 라이카 제작 서사와 공개

이제 다음 자료를 읽는다.

- `docs/knowledge/STUDIO.md`, `docs/editorial-bar.md`
- `brand/LAIKA.md`, `brand/prompts/laika-style.md`
- `docs/architecture/0002-autonomous-publication.md`
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

라이카 제작 서사를 마친 뒤 잠금을 검증한다.

```bash
node scripts/prepare-editorial.mjs --game games/YYYY/YYYY-MM-DD-slug --verify
git -C games/YYYY/YYYY-MM-DD-slug diff --exit-code HEAD -- .creator-lock.json
```

## 6. 릴리스와 로컬 아케이드

- `dist-arcade/`와 `release.json`을 만든다.
- 로컬 fixture를 `arcade/public/__game-assets/games/<slug>/local-fixture/`에 동기화한다.
- 아케이드와 관제 카탈로그에 한·영 작품 노트, 설계 이유, 제작자 일러스트, 고정 릴리스 해시를 등록한다.
- 수치와 해시는 `.studio.json`, `game.manifest.json`, `release.json`에서 읽는다.
- 홈, `/games/<slug>`, `/play/<slug>`를 한국어와 영어로 확인한다.
- [`references/publication-verification.md`](references/publication-verification.md)의 로컬 gate를 모두 통과한다.

## 7. 아케이드 공개

[`references/publishing.md`](references/publishing.md)를 읽고 따른다.

```bash
node scripts/publish-game.mjs --dry-run --game games/YYYY/YYYY-MM-DD-slug
node scripts/publish-game.mjs --publish --game games/YYYY/YYYY-MM-DD-slug
```

스크립트가 Blob 업로드, preview 완주, 같은 커밋의 production 배포, 운영 도메인 완주와 관제 카탈로그 동기화를 마칠 때까지 진행한다. 인증이 막히면 로컬 작업을 끝낸 뒤 필요한 명령과 위치를 안내하고, 인증 직후 같은 게임의 공개를 재개한다.

## 8. 기록과 종료

- `DAY.md`에 실제 명령, 수치, 실패와 남은 위험을 기록한다.
- `STATUS.md`에는 현재 상태만 반영한다.
- 두 번째 사용처가 확인된 공통화 후보만 `docs/knowledge/LAUNCHPAD_BACKLOG.md`에 적는다.
- 각 저장소의 상태를 확인하고 다른 작업자의 변경을 보존한다.
- 최종 보고에는 게임 이름과 만든 이유, 운영 플레이 URL, 테스트 결과, 별도 승인이 남은 Toss 작업만 짧게 적는다.

production에서 한 판을 완주하지 못하면 완료라고 보고하지 않는다.
