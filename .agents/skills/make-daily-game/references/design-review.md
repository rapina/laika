# 체르파 설계 일치 출고 검사

sequence 23부터 체르파는 최종 설계 문서와 실제 빌드를 나란히 놓고 같은 게임인지
확인한다. 재미, 난이도와 설계의 좋고 나쁨은 심사하지 않는다.

## 검사

최종 GDD에서 플레이와 결과에 관한 구체적 약속을 찾고 실제 프로덕션 빌드에서
각 약속이 구현됐는지 관찰한다. 제작자가 남긴 게임별 테스트 명령이 실행됐고
통과했는지 확인한다. 마지막으로 그 빌드가 배포 가능한 상태인지 확인한다.

GDD의 기준 게임, 유지할 핵심 루프, 변경 축과 기능 범위표를 실제 빌드와
대조한다. 첫 실행부터 `인트로 → 타이틀 → 게임 → 게임 결과`를 순서대로 직접
거치고 결과의 다시 시작 경로를 확인한다. 네 상태 중 하나가 없거나, `FULL`·
`ADAPTED` 시스템이 임시 상태거나, `OUT` 기능을 빈 메뉴로 약속하면 blocked다.

검사 항목 수와 게임별 테스트 내용은 체르파가 미리 정하지 않는다. 결정론,
자동 완주, 공통 포인터 시나리오와 특정 상태 노출을 요구하지 않는다.

## 산출물

게임 저장소 루트의 `design-review.json`:

```json
{
  "schemaVersion": 3,
  "reviewedAt": "YYYY-MM-DD",
  "sourceHash": "<smoke-result.json과 같은 해시>",
  "verdict": "pass",
  "method": {
    "build": "<플레이한 빌드>",
    "viewport": { "width": 390, "height": 844 }
  },
  "designConformance": [
    {
      "id": "<stable-id>",
      "designClaim": "<GDD의 구체적 약속>",
      "status": "implemented",
      "observed": "<실제 빌드에서 본 것>"
    }
  ],
  "creatorTests": [
    {
      "command": "npm test",
      "covers": "<제작자가 이 명령으로 확인한 설계 규칙>",
      "status": "pass"
    }
  ],
  "deployable": {
    "status": "pass",
    "observed": "<빌드·필수 자산·런타임 확인>"
  },
  "notes": [],
  "summary": { "ko": "…", "en": "…" }
}
```

설계 약속 하나라도 `missing`이거나 제작자 테스트가 실패했거나 빌드가 배포
불가능하면 `verdict: "blocked"`다. 설계의 재미와 완성도를 이유로 막지 않는다.
무르는 배포가 끝난 뒤 실제 플레이 경험을 피드백한다.
