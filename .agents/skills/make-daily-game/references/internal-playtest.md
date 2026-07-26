# Internal production playtest

첫 구현을 릴리스 후보로 취급하지 않는다.

## 플레이

이전 대화를 받지 않는 새 맥락에 실제 플레이 빌드와 플레이어가 화면에서 얻을 수
있는 정보만 전달한다. GDD, 소스, 테스트, 제작 의도, 브랜드와 과거 작품은 주지
않는다.

플레이어는 판정하거나 해결책을 지시하지 않고 다음 관찰을 돌려준다.

- 무엇을 하는 게임으로 이해했는가
- 어떤 입력을 실제로 시도했는가
- 어디까지 도달했는가
- 어디에서 의미나 반응을 읽지 못했는가

완주와 성공은 의무가 아니다.

## 재제작

제작자는 관찰 가운데 작품에 유효한 것을 선택해 게임을 다시 만든다. 기능을
추가하는 것만이 개선은 아니다. 조작, 피드백, 리듬, 콘텐츠, 아트, 사운드 또는
불필요한 요소 제거 중 작품에 필요한 변경을 한다.

변경 뒤 게임별 테스트, 빌드와 배포 스모크를 다시 실행한다. 새 빌드가 출시할
완성작이라고 판단될 때만 체르파 검토로 넘긴다.

## 증거

게임 루트에 `production-playtest.json`을 남긴다.

```json
{
  "schemaVersion": 1,
  "initialBuildHash": "<첫 구현 sourceHash>",
  "finalBuildHash": "<재제작 뒤 sourceHash>",
  "sessions": [{
    "playerContext": "build-only",
    "observation": {
      "understood": "화면에서 이해한 목표",
      "attempted": "실제로 시도한 입력",
      "reached": "도달한 상태",
      "friction": "의미나 반응을 읽지 못한 곳"
    }
  }],
  "makerResponse": {
    "changes": [{
      "observation": "반영한 관찰",
      "change": "다시 제작한 내용"
    }],
    "releaseCandidateReason": "이 빌드를 릴리스 후보로 판단한 이유"
  }
}
```
