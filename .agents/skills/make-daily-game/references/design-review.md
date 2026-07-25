# 체르파 치명 결함 출고 검사

sequence 22부터 체르파는 게임 디자인을 심사하지 않는다. 제작과 이전 대화를
공유하지 않는 새 맥락에서 실제 빌드가 출고 가능한지만 확인한다.

## 검사

대표 세로 모바일 화면에서 빌드를 열고 화면에 보이는 주 입력을 실제 포인터로
한 번 이상 수행한다. 다음 여섯 항목만 `pass | fatal`로 기록한다.

1. `boot`: 빌드와 필수 자산이 떠서 플레이 화면을 사용할 수 있다.
2. `portrait`: 세로 모바일에서 핵심 플레이 영역이 잘리거나 가려지지 않는다.
3. `touch`: 화면에 보이는 주 입력이 실제 포인터 입력에 반응한다.
4. `runtime`: 첫 상호작용 뒤 반복 충돌·입력 잠김·복귀 불능이 없다.
5. `assets`: 필요한 로컬·포털 자산 요청이 성공한다.
6. `build-identity`: `sourceHash`가 현재 `smoke-result.json`과 같다.

게임이 제공하는 종료, 결과, 재시작, 언어, 음향과 일시정지는 확인할 수 있지만
없다는 이유로 fatal을 주지 않는다.

다음은 비차단 관찰이다.

- 사용법이 난해하거나 검토자가 완주하지 못함
- 규칙·전략·판정 값이 화면에서 잘 읽히지 않음
- GDD, 목표 화면이나 제작 의도와 실제 화면의 차이
- 깊이·난이도·완성도·취향 문제
- 기존 게임과의 유사성
- 자동 플레이·결정론 테스트 불가

## 산출물

게임 저장소 루트의 `design-review.json`:

```json
{
  "schemaVersion": 2,
  "reviewedAt": "YYYY-MM-DD",
  "sourceHash": "<smoke-result.json과 같은 해시>",
  "verdict": "pass",
  "method": {
    "build": "<플레이한 빌드>",
    "inputPath": "pointer-events",
    "viewport": { "width": 390, "height": 844 }
  },
  "fatalChecks": [
    { "id": "boot", "status": "pass", "observed": "…" },
    { "id": "portrait", "status": "pass", "observed": "…" },
    { "id": "touch", "status": "pass", "observed": "…" },
    { "id": "runtime", "status": "pass", "observed": "…" },
    { "id": "assets", "status": "pass", "observed": "…" },
    { "id": "build-identity", "status": "pass", "observed": "…" }
  ],
  "notes": ["비차단 관찰"],
  "summary": { "ko": "…", "en": "…" }
}
```

필수 검사 중 하나가 `fatal`이면 `verdict: "blocked"`다. 그 결함만 고친 뒤
sourceHash를 갱신하고 새 맥락에서 재검토한다. 모든 fatal 검사가 pass면 난해하거나
미완주여도 공개한다.
