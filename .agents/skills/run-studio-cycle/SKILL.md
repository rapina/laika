---
name: run-studio-cycle
description: Run one full studio cycle for Sputnik Workshop: check the verification layer is healthy, delegate game production to an isolated orchestrator, independently verify what it reports, then repair the process with what the cycle exposed and record it. Use from the toss-game-studio workspace when the user asks for a new game ("게임 만들어줘", "다음 게임 만들어줘", "새 게임을 만들자", "make the next game") or asks to run a studio cycle. This is the entry point; it delegates make-daily-game to a sub-agent rather than running it directly.
---

# Run Studio Cycle

한 사이클은 게임 한 편이 아니라 **개선 한 바퀴**다. 목표는 1000편이 아니라 1000번의 개선이고, 게임은 그 바퀴를 돌리는 수단이다. 그래서 이 스킬의 성공 조건은 "게임이 나왔다"가 아니라 **"이번 바퀴가 다음 바퀴를 더 낫게 만들었다"**이다.

당신은 감독자다. 게임을 직접 만들지 않는다. 만드는 일은 맥락이 분리된 하위 에이전트에게 맡기고, 당신은 그 앞뒤를 맡는다.

## 왜 이 역할이 따로 있는가

제작 에이전트는 자기 작업을 스스로 평가할 수 없다. 지금까지 네 번, 채점받는 쪽이 채점기를 만들어 게이트가 무너졌다(`docs/knowledge/PROCESS_LOG.md`). 그래서 검사는 바깥에 있어야 하고, 그 검사층 자체를 점검하는 일도 또 바깥에 있어야 한다. 그게 이 자리다.

## 경계

- 게임의 창작 결정을 직접 내리지 않는다. 콘셉트, 규칙, 아트는 하위 에이전트의 몫이다.
- 하위 에이전트의 보고를 그대로 믿지 않는다. 주장은 산출물로 대조한다.
- 사용자에게 창작 결정을 되묻지 않는다. 파괴적이거나 승인이 필요한 일(Toss 출시, 계정·비용·도메인 변경)만 물어본다.
- 대기 상태로 턴을 끝내지 않는다. 하위 에이전트가 멈추면 산출물을 읽어 상태를 판정하고, 이어받을 새 맥락을 만들어 끝낸다.
- 관제 저장소 루트에서 `git add -A`를 쓰지 않는다. 다른 세션의 진행 중 게임을 삼킨다.

## 0. 사이클을 여는 기록

단계가 넘어갈 때마다 한 줄씩 남긴다. 사이트의 "지금 하고 있는 일"이 이 기록으로 그려진다.

```bash
node scripts/log-cycle-event.mjs --actor enos --stage cycle --status started \
  --sequence <N> --ko "사이클을 열었다" --en "Opened the cycle"
```

**단계마다 양쪽 끝을 남긴다.** 하위 에이전트에게 넘기기 **직전에** `started`를, 결과를 받은 **직후에** `passed`·`blocked`·`done`을 남긴다. 시작을 빠뜨리면 그 단계가 도는 몇 시간 동안 사이트가 멈춰 보인다. 기록하는 쪽이 바로 그 시간 동안 하위 에이전트를 기다리느라 막혀 있기 때문이다.

한 사이클에서 최소한 이만큼은 남는다.

| 언제 | actor · stage · status |
|---|---|
| 사이클을 열 때 | `enos · cycle · started` |
| 검증층 점검 뒤 | `enos · health-check · passed` |
| 제작을 넘기기 직전 | `laika · production · started` |
| 제작 결과를 받고 | `laika · production · done` |
| 검토를 넘기기 직전 | `cherpa · design-review · started` |
| 검토 판정을 받고 | `cherpa · design-review · passed` 또는 `blocked` |
| 보완을 넘길 때 | `laika · production · started` (다시) |
| 공개 직전·직후 | `laika · release · started`, `laika · publish · done` |
| 공개 후 평가를 넘길 때 | `murr · earth-play · started` → `done` |
| 공정을 고쳤으면 | `enos · process-fix · done` |
| 사이클을 닫을 때 | `enos · cycle · done` |

- 남기는 것은 **감독자와 관제뿐이다.** 콘셉트·제작 에이전트는 브랜드 블라인드라 아케이드도 라이카도 몰라야 한다. 그들에게 이 명령을 알려주지 않는다. 단계 보고를 받는 쪽이 대신 남긴다.
- `actor`는 그 단계를 실제로 하는 인물이다: 장비 확인·공정 손질은 `enos`, 콘셉트·제작·서사는 `laika`, 점검은 `cherpa`, 공개 후 플레이는 `murr`.
- `stage`: `cycle` `health-check` `concept` `production` `lock` `design-review` `narrative` `release` `publish` `earth-play` `process-fix`
- `status`: `started` `passed` `blocked` `failed` `done` `noted`
- 메모는 방문자가 읽는 문장이다. 내부 용어를 쓰지 않고 300자를 넘기지 않는다.
- **기록이 실패해도 사이클을 멈추지 않는다.** 키가 없거나 네트워크가 죽으면 조용히 건너뛴다. 이건 관찰이지 게이트가 아니다.
- 사이클이 끝나면 반드시 닫는다. 닫지 않으면 사이트가 계속 "작업 중"으로 보인다.

```bash
node scripts/log-cycle-event.mjs --actor enos --stage cycle --status done \
  --sequence <N> --ko "<한 줄 결과>" --en "<one line>"
```

## 1. 검증층 점검

```bash
node scripts/health-check.mjs
```

점검 결과를 기록한다(`--actor enos --stage health-check`). 종료 코드가 0이 아니면 **제작을 시작하지 않는다.** 게이트가 깨진 상태에서 만든 게임은 통과 여부가 아무 의미가 없다. 먼저 검증층을 고치고, 고친 내용을 이번 사이클의 개선 항목으로 기록한 뒤 다시 실행한다.

경고(WARN)는 차단하지 않지만 읽는다. 특히 "공정 로그의 강제 위치 실재" 경고는 문서에만 남고 기계에서 사라진 규칙을 가리킨다.

이어서 끝난 게임의 작업공간을 정리한다. **제작을 시작하기 전에 한다.**

```bash
node scripts/clean-game-workspaces.mjs
```

게임 한 편이 재설치 가능한 파일로 1GB를 쓴다. 공개됐거나 내려둔 게임만 지우고, 제작 중인 게임은 건드리지 않는다. 지우는 것은 `node_modules`, `dist`, 빌드 캐시뿐이고 소스와 잠금 파일과 릴리스 사본은 남는다. 필요하면 그 디렉터리에서 `npm ci`로 되돌아온다.

이 명령은 오래전부터 있었지만 "정리할 수 있다"고 문서에만 적혀 있었다. 2026-07-21에 세어 보니 끝난 게임 열 편이 9.6GB를 붙들고 있었다. 읽고 실행해 주기를 기다리는 규칙은 실행되지 않는다. 그래서 여기에 명령으로 박아 둔다.

이어서 다음 번호와 대기 상태를 확인한다.

```bash
node .agents/skills/make-daily-game/scripts/preflight.mjs
```

## 2. 제작 위임

이전 대화를 받지 않는 새 맥락의 하위 에이전트에게 맡긴다. 전달할 것은 다음뿐이다.

- 작업 루트 경로
- `make-daily-game` 스킬을 호출해 그 지침을 정확히 따르라는 지시
- 스킬이 요구하는 맥락 격리를 다시 하위 에이전트로 구현하라는 지시
- 최종 보고 형식(아래)

이번 사이클에서 새로 도입한 규칙이 있으면 **그것을 프롬프트에 넣지 않는다.** 스킬 문서만 읽고도 지켜지는지가 그 규칙이 실제로 자리 잡았는지의 시험이다. 프롬프트로 보강하면 그 시험이 사라진다.

요구할 최종 보고:

- 게임 이름(한/영), sequence, slug, 콘셉트 잠금 요약
- 단계별 하위 에이전트 목록과 각각에게 전달한 자료 범위
- 설계 검토 결과(verdict, 주요 promises, 실기 플레이 관측 수치, blocked였다면 보완 내역)
- 검증 수치(테스트, 플레이 가능성 시뮬, 스모크, 뷰포트)
- 공개 결과(운영 URL, designProcess 등록, 지구 기록 시점) 또는 막힌 지점
- 실패했거나 건너뛴 항목의 정직한 목록
- **공정이 거추장스러웠거나 모호했던 지점, 문서와 실제가 어긋난 지점.** 특히 스킬 문서를 읽고 따르며 헷갈린 부분을 구체적으로.

마지막 항목이 이 사이클의 주 수확이다. 빠뜨리고 보고하면 다시 요구한다.

## 3. 독립 검수

보고를 받으면 주장을 산출물로 확인한다. 자기 보고는 증거가 아니다.

```bash
node scripts/release-drift.mjs --game games/YYYY/YYYY-MM-DD-slug
curl -s https://laika365.vercel.app/catalog/games.json   # 등록·상태·designProcess·verdict
curl -s -o /dev/null -w "%{http_code}" https://laika365.vercel.app/play/<slug>
```

`release-drift`가 로컬·원격·공개된 빌드를 나란히 보여 준다. 게이트는 전부 로컬을 보고 초록을 내므로, 사람들이 하는 빌드가 그것과 같은지는 따로 확인해야 한다.

- `design-review.json`의 `verdict`가 `pass`이고 `sourceHash`가 현재 `smoke-result.json`과 같은가
- `method.inputPath`가 `pointer-events`인가(판정 함수 직접 호출은 실기 플레이가 아니다)
- 카탈로그의 `designProcess`와 목표/실제 이미지가 실제로 200으로 응답하는가
- 보고한 수치와 커밋된 파일의 수치가 같은가

어긋나면 그 자체가 이번 사이클의 가장 중요한 발견이다. 보고를 고치지 말고 어긋남을 기록한다.

검토 판정과 공개 결과도 사건으로 남긴다. 특히 `--stage design-review --status blocked`는 이 데모에서 가장 값어치 있는 한 줄이다.

## 4. 공정 개선

보고의 마찰 목록과 당신의 검수 결과를 합쳐 고친다. 원칙은 하나다.

**고칠 수 있으면 스크립트에 넣고, 넣을 수 없을 때만 문서에 쓴다.** 산문 규칙은 에이전트가 읽고 지켜 줘야 성립하지만 스크립트는 누가 돌리든 거부한다. 1000 사이클은 몇 년짜리라 지금 모델도 이 대화도 그때 없다. 남는 것은 실행되는 코드다.

우선순위:

1. **재발 항목**. 같은 손수정이 두 사이클 연속 나오면 그 즉시 기계화한다. manifest 필드는 세 사이클을 낭비한 뒤에야 템플릿이 됐다.
2. **검증층 결함**. 게이트가 놓친 것, 게이트 자신이 깨진 것.
3. **문서 모순과 미문서화**. 스킬이 같은 절에서 서로 다른 것을 요구하거나, 스키마가 검증 실패로만 발견되는 경우.
4. **새 결함 유형**. 이번에 처음 본 실패는 검사 항목으로 만든다.

고친 뒤 `node scripts/health-check.mjs`를 다시 돌려 스스로 통과시킨다.

## 5. 기록

세 곳에 남긴다. 빠뜨리면 다음 사이클이 같은 것을 다시 발견한다.

- `docs/knowledge/PROCESS_LOG.md`: 계기, 변경, **강제 위치**. 강제 위치가 비어 있으면 그 규칙은 아직 산문이다.
- `arcade/public/catalog/process.json`: 공개할 만한 변화를 쉬운 말로(ko·en). `/history`에 실린다. 내부 용어를 쓰지 않는다. **새 항목은 배열 맨 앞에 넣는다** — 뒤에 붙이면 최신 기록이 첫날 아래로 내려가고, 카탈로그 검증이 거부한다.
- `STATUS.md`: 현재 상태만.

사이클 지표도 함께 남긴다.

```bash
node scripts/record-cycle.mjs --sequence <N> --slug <slug> \
  --interventions <사람이 개입한 횟수> --escaped <운영까지 새어 나간 결함 수> \
  --held <보류 여부 true|false> --note "한 줄"
```

이 두 수치가 이 프로젝트의 성적표다. **사람 개입 횟수**는 자율성 곡선이고, **새어 나간 결함**은 게이트의 실효다. 발견한 결함 수는 지표가 아니다. 더 깊이 들여다봐서 늘어난 것일 수 있다.

사이클을 닫는 기록(`--stage cycle --status done`)을 빠뜨리지 않는다.

## 6. 보고

사용자에게는 짧게 적는다. 게임 이름과 운영 URL, 설계 검토 결과, 이번에 고친 공정 항목, 그리고 정직한 미완 목록. 사이클 지표 두 개를 직전 사이클과 나란히 보여 준다.
