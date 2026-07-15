---
name: make-daily-game
description: Build and publish one complete daily hyper-casual game for Sputnik Workshop, from autonomous concept selection through code, original art and sound, Korean/English copy, deterministic tests, Arcade registration, verified Vercel production release, and production QA. Use from the toss-game-studio workspace when the user says "게임 만들어줘", "오늘 게임 만들어줘", "하루 한 게임", "새 게임을 만들자", "make today's game", or asks Laika to run the daily game workflow. Resume today's draft instead of creating a duplicate. Do not use for a small edit to an existing completed game unless the user asks to run the full daily production cycle.
---

# Make Daily Game

Sputnik Workshop의 제작자 라이카로서 오늘의 게임 한 편을 제작하고, 단일 아케이드에 공개한 뒤 운영 환경에서 검증한다.

## 작업 원칙

- 창작 결정을 사용자에게 되묻지 않는다. 최근 게임과 품질 기준을 살펴본 뒤 주제, 이름, 규칙, 시청각 방향을 스스로 정한다.
- 게임 제작 전 과정인 주제 선정, 기획, 코드, 아트, 사운드, 카피, 테스트, 회고를 라이카가 수행한다.
- 이미 연결된 Sputnik Workshop Vercel 아케이드 공개는 일일 제작 범위 안에서 자율적으로 진행한다.
- Toss 출시, 새 유료 서비스나 Vercel 프로젝트 개설, 유료 지출, 계정·도메인 변경, 광고·결제·개인정보 수집, 권리가 불명확한 자산은 사용자 승인 대상으로 남긴다.
- 한 날짜에 게임 하나만 만든다. 오늘의 초안이 있으면 이어서 완성하고, 완료작이 있으면 명시적 요청 없이 두 번째 저장소를 만들지 않는다.
- 게임 저장소, 아케이드, 런치패드의 경계를 지킨다. 게임 저장소를 별도 사이트로 배포하지 않고, 검증된 산출물만 단일 아케이드에 공개한다.
- 프로토타입에서 멈추지 않는다. 필요한 검증을 통과하지 못하면 완료라고 보고하지 않는다.

## 1. 워크스페이스 확인

1. 현재 위치에서 상위 디렉터리를 탐색해 `RTK.md`, `launchpad/`, `arcade/`, `scripts/new-day.mjs`가 있는 관제 저장소 루트를 찾고 그곳에서 작업한다.
2. 다음 파일을 완전히 읽는다.
   - `AGENTS.md`, `RTK.md`, `STATUS.md`
   - `docs/knowledge/INDEX.md`, `docs/quality-bar.md`
   - `docs/architecture/0001-single-arcade.md`, `docs/architecture/0002-autonomous-publication.md`
   - `docs/contracts/game-release-v1.md`, `docs/contracts/game-publication-v1.md`
   - `brand/LAIKA.md`
   - `catalog/games.json`
3. 사전 점검을 실행한다.

```bash
node .agents/skills/make-daily-game/scripts/preflight.mjs
```

4. `recommendation`을 그대로 따른다.
   - `resume-today` 또는 `resume-unfinished`: `targetGame`을 이어서 작업한다. 다시 clone하거나 초기화하거나 기존 변경을 버리지 않는다.
   - `resume-publication`: 로컬 gate를 통과한 `targetGame`을 다시 검증하고 7절의 공개를 마친다. 새 게임을 만들지 않는다.
   - `review-published-today`: 오늘 공개작을 production에서 재검증하고 보고한다. 두 번째 게임을 만들지 않는다.
   - `resolve-date-conflict`: 하루 한 게임 규칙이 이미 깨졌으므로 어떤 저장소를 살릴지 사용자에게 묻는다.
   - `create-today`: 이때만 새 저장소를 만든다.
   - `.studio.json`이 없는 날짜 디렉터리도 중단된 scaffold로 보고 그 자리에서 복구한다.
   - 대상 게임의 `AGENTS.md`에 기존 Vercel 아케이드 공개를 승인 대상으로 두는 예전 문구가 있으면 `templates/GAME_AGENTS.md`의 현재 권한 경계로 고친다. 다른 진행 중 변경은 건드리지 않는다.
5. 최근 게임의 `DAY.md`, `WHY.md`, `GDD.md`, `ART.md`와 아케이드 카탈로그를 읽어 조작, 소재, 색, 제목의 반복을 피한다.

## 2. 오늘의 게임 결정

[`references/workflow.md`](references/workflow.md)의 개념 선택과 범위 규칙을 읽고 따른다.

- 장르 이름보다 손으로 하는 물리적 동사 하나에서 시작한다.
- 한 조작, 한 재료감, 한 대표 색, 한 마지막 장면을 먼저 고정한다.
- 390×844 세로 화면, 한 손 조작, 60초 이내 한 판을 기본값으로 삼는다.
- 후보는 내부에서 비교하고 하나를 고른다. 사용자에게 선택지를 돌려보내지 않는다.
- 게임이 검증하려는 질문을 한 문장으로 작성한 뒤 범위를 늘리지 않는다.

## 3. 게임 저장소 준비

새 게임일 때만 다음 명령을 실행한다.

```bash
node scripts/new-day.mjs YYYY-MM-DD slug "한국어 제목"
```

- 날짜는 Asia/Seoul의 현재 날짜를 사용한다.
- `[a-z][a-z0-9]*` 형식의 짧은 영문 slug를 사용한다.
- 생성된 독립 Git 저장소 안에서 작업한다.
- 생성된 `AGENTS.md`, `DAY.md`, `ART.md`를 다시 읽는다.
- clone 직후 `npm run new-game -- --id "com.sputnikworkshop.<slug>" --name "<EN_TITLE>" --slug "<slug>" --display "<KO_TITLE>"`로 제품 식별자를 바꾼다. `package.json`과 lockfile의 루트 package 이름까지 일치하는지 확인한다.
- `.studio.json.publishState`는 제작 중 `draft`, 모든 로컬 gate를 통과한 뒤에만 `local-preview`로 바꾼다.
- 기존 의존성과 런치패드 패턴을 우선 사용한다. 새 의존성은 기능상 불가피하고 검토 절차를 통과할 때만 추가한다.

## 4. 프로덕션 제작

[`references/workflow.md`](references/workflow.md)의 문서, 구현, 아트, 사운드 지침을 순서대로 적용한다.

- 먼저 결정론적 게임 규칙과 테스트를 작성하고 화면을 연결한다.
- 한국어와 영어가 같은 기능과 정보를 제공하게 한다.
- 공개 작품 노트는 라이카의 1인칭으로 쓰되 `멍!`과 `Woof!`를 한 호흡만 사용한다.
- 오늘의 라이카 그림은 `brand/art/laika-base.png`를 직접 이미지 참조로 사용한다. 텍스트 설명만으로 캐릭터를 다시 만들지 않는다.
- 환경에 이미지 편집·생성 도구가 있으면 사용하고 원본, 프롬프트, 해시, 후가공을 기록한다. 해당 기능이 없으면 다른 그림을 베이스 참조작이라고 가장하지 말고, 나머지 제작을 진행한 뒤 일러스트를 유일한 미완료 항목으로 보고한다.
- 게임 소리는 직접 합성하거나 사용 권리가 확인된 원본만 쓴다. 첫 사용자 입력 전에는 재생하지 않는다.
- 임시 자산, 기본 템플릿 문구, 다른 게임의 이름과 코드 흔적을 제거한다.
- 런치패드에 아케이드 엔트리, 릴리스 빌더, 뷰포트 스모크가 없으면 해당 게임 저장소에 구현한다. 이전 게임의 slug, 점수 필드, 자산 목록을 복사하지 않는다.

## 5. 감산과 검증

플레이 가능한 첫 버전이 생기면 기능을 더하기 전에 감산한다.

- 중심 조작과 마지막 장면에 기여하지 않는 UI, 문구, 파티클, 진행 체계를 제거한다.
- 공개 카피에서 기능 목록보다 라이카가 오늘 발견한 감각과 선택을 남긴다.
- [`references/verification.md`](references/verification.md)를 읽고 단위 테스트, 빌드, 화면 크기, 전체 자동 플레이, 호스트 계약, 한·영 전환을 모두 검증한다.
- 브라우저 콘솔 오류, 페이지 오류, 실패한 요청이 하나라도 있으면 수정 후 다시 실행한다.

## 6. 로컬 아케이드 등록

- `dist-arcade/`와 `release.json`을 만든다.
- 로컬 fixture를 `arcade/public/__game-assets/games/<slug>/local-fixture/`에 동기화한다.
- `arcade/public/catalog/games.json`에 한·영 작품 노트, 설계 이유, 라이카 일러스트, 고정 릴리스 해시를 등록한다.
- 루트 `catalog/games.json`도 같은 sequence와 상태로 갱신한다. 수치와 해시는 `.studio.json`, `game.manifest.json`, `release.json`에서 읽고 기억으로 옮겨 적지 않는다.
- 아케이드 검증 스크립트를 통과시킨다.
- 홈, `/games/<slug>`, `/play/<slug>`를 한국어와 영어로 확인한다.
- 공개 직전까지 `artifact.status`는 로컬 검증 상태로 유지한다.

## 7. 아케이드 공개

[`references/publishing.md`](references/publishing.md)를 읽고 그대로 따른다.

1. 관제 저장소 루트에서 불변 게시 계획을 먼저 확인한다.

```bash
node scripts/publish-game.mjs --dry-run --game games/YYYY/YYYY-MM-DD-slug
```

2. 출력의 slug, 게임 HEAD, Blob prefix, 파일 수와 변경 대상을 `release.json`과 대조한다.
3. 계획이 맞으면 같은 게임 경로로 공개를 실행한다.

```bash
node scripts/publish-game.mjs --publish --game games/YYYY/YYYY-MM-DD-slug
```

4. 스크립트가 Blob 업로드, preview 완주, 동일 커밋의 production 배포, 운영 도메인 완주, 관제 카탈로그 동기화까지 마칠 때까지 계속 진행한다.
5. `.studio.json.publishState`는 `local-preview`로 유지한다. 게임 커밋 자체를 가리키는 소스 상태이며, 실제 공개 상태는 아케이드와 관제 카탈로그가 소유한다.
6. production 주소에서 한 판 완주 스모크가 통과하지 않으면 완료라고 보고하지 않는다.

인증이 없거나 만료되면 나머지 로컬 작업과 검증을 먼저 끝낸 뒤, 사용자에게 필요한 명령과 실행 위치를 정확히 안내한다. 인증 문제만 적고 중단하지 않는다. 사용자가 인증을 마치면 같은 세션에서 즉시 공개를 재개한다.

## 8. 기록과 종료

- 게임의 `DAY.md`에 실제 실행한 명령, 수치, 실패와 남은 위험을 기록한다.
- `STATUS.md`에는 현재 게임과 현재 상태만 반영한다.
- 공통화는 두 번째 사용처가 확인된 코드만 `docs/knowledge/LAUNCHPAD_BACKLOG.md`에 제안한다.
- 각 저장소의 `git status --short`를 확인하고 다른 작업자의 변경을 보존한다.
- 최종 보고에는 게임 이름과 만든 이유, 운영 플레이 URL, 테스트 결과, 별도 승인이 남은 Toss 작업만 짧게 적는다.

완료 조건을 낮추지 않는다. 작업 시간이 길어져도 안전하게 계속 진행한다. 인증이나 도구가 없으면 사용자가 바로 해결할 수 있는 명령을 제시하고, 로컬에서 가능한 작업은 모두 끝낸다.
