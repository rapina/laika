# Launchpad Backlog

| 후보 | 근거 | 두 번째 사용처 | 상태 |
|---|---|---|---|
| 아케이드 `MessageChannel` 브리지 | STITCH 포털 완주·pause/mute/restart 통과 | RIME 언어·pause·mute·restart·결과 전달 | 공통화 완료 |
| 결정론적 입력 판정 하네스 | STITCH 48땀 스모크 통과 | RIME 367셀 중 338셀·92.1% 완주 | 공통 패턴 검증 완료 |
| 세로형 반응형 캔버스 | STITCH 모바일 뷰포트 검증 | RIME 360×800, 390×844, 430×932 검증 | 공통 검증 완료 |
| 광고 중 오디오 중단 계약 | 기존 Toss 어댑터에 생명주기 없음 | 모든 광고 사용 게임 | P0 조사 |
| 게임 인스턴스 안정화 | `Date.now()` 키가 재마운트 유발 가능 | RIME locale 변경 중 run 유지 검증 | `runId` 패턴 확정 |
| 스모크 증거 재현성(안정 필드만 기록, 내용 동일 시 미기록) | 게시 게이트가 gate 재실행 뒤 저장소 청결을 요구하는데 템플릿 smoke.mjs·viewport-smoke.mjs는 실행마다 다른 바이트를 기록해 sequence 9 공개가 반복 차단됨 | publish-game.mjs가 모든 sequence 9+ 게임에서 gate를 재실행하므로 다음 게임부터 전부 해당 | 템플릿 이식 완료(launchpad `10561d4`, 연속 2회 실행 바이트 동일 확인) |
| manifest `supportedLocales` 계약 필드 | 게시 게이트(game-publication-v1)가 `supportedLocales`를 요구하나 launchpad 템플릿 manifest는 `locales`를 생성해 게임마다 잠금 뒤 개명 사이클 발생 | drizzle(eddbcb3)·maejil 두 게임에서 동일 수정 반복 | 템플릿 필드명 교체 대기 |
| 아케이드 릴리스 자산 기본 목록(HUD 폰트·CSS 참조 자산) | 템플릿 `arcade.assets`가 빈 배열이라 index.css가 참조하는 폰트가 릴리스에서 누락, 포털 스모크에서야 발견 | maejil에서 발생, CSS 참조 자산 자동 수집이 근본 해법(추가 사용처 확인 전) | 후보 관찰 |
| Pixi 게임의 아케이드 CSP 대응(`pixi.js/unsafe-eval` import) | 아케이드 운영 CSP에 unsafe-eval이 없어 Pixi 8이 preview에서야 부팅 실패 | maejil·violet에 이어 grainsplit에서 세 번째 재발. 포털 스모크 전까지 드러나지 않아 잠금 뒤 수정 사이클을 강제 | 템플릿 이식 필요(주석이 아니라 arcadeEntry 기본 import) |
| dev 포트 4173 회피 | 게임 vite dev와 아케이드 로컬 서버가 같은 포트를 써 게이트 스모크가 남의 서버에 붙어 위양성 실패(maejil 2회) | 모든 게임이 아케이드와 함께 검증되므로 공통 | 템플릿 이식 완료(4183) |
| 서사 자산의 sourceHash 제외 | 라이카 일러스트 추가가 검증 증거·설계 검토를 통째로 무효화(maejil 재검토 1회) | 모든 게임의 서사 단계 공통 | 템플릿+prepare-editorial 이식 완료, 회귀 테스트 추가 |
| 뷰포트 증거 재현성(결과 JSON이 바뀔 때만 캡처 기록) | 스모크 증거 재현성은 템플릿에 이식됐으나 `viewport-smoke.mjs`는 여전히 실행마다 PNG를 덮어써, 게시 게이트가 gate를 재실행할 때마다 저장소가 더러워져 공개가 무한 반복 차단됨 | drizzle에 있던 해법이 grainsplit 템플릿에 없어 동일 수정을 다시 작성 | 템플릿 이식 필요(drizzle `viewport-smoke.mjs` 패턴) |
| 아케이드 자산 URL을 모듈 URL 기준으로 해석 | 템플릿이 `document.baseURI` 기준으로 자산을 풀면 아케이드 러너가 자기 오리진에서 페이지를 서빙하므로 릴리스 자산이 404. 게임 자체 스모크는 standalone 빌드라 통과 | violet은 `import.meta.url` 기준 헬퍼를 자체 작성, grainsplit은 같은 결함을 포털 스모크에서 발견 | 템플릿 `artUrl()` 헬퍼 이식 필요 |
| 무입력 기준선 정책 | 세 사람 모델 정책이 전부 입력하는 정책이라 "손을 안 대면 어떻게 되는가"를 아무도 묻지 않는다. 연번 14가 무입력으로 문 7개 통과·정밀 2회를 얻은 채 공개됐다 | 모든 게임의 플레이 가능성 게이트가 같은 구조라 공통 | 템플릿 `playability-sim.mjs`에 null 정책 기본 포함 필요 |
| 캡처 셔터의 렌더 상태 관측 | 템플릿 캡처 스크립트가 입력 뒤 고정 지연으로 촬영해 판정 연출을 지나칠 수 있다. 게시 게이트가 이미 이 패턴을 거부한다 | 연번 13 캡처 결함에 이어 연번 14에서 게시 게이트가 차단 | 판정 정지 중 규칙 시계가 멈추는 성질을 쓰는 관측 패턴을 템플릿에 이식 |
| 포털 CSP 아래 실기 플레이 검사 | 게임의 로컬 단독 실행에는 CSP가 없어, 주입 스타일시트가 막혀 오버레이가 포인터를 전부 삼키는 결함이 로컬에서 초록으로 남는다. 포털에서만 플레이 불가(성과 0·실패 3)가 되고 게임 자체 게이트는 전부 통과한다 | 두 번째 사례. 이전에 Pixi `unsafe-eval` CSP 문제로 maejil·violet·grainsplit가 잠금 뒤 수정 사이클을 겪었고(별도 항목), 연번 15는 같은 CSP 축에서 스타일 방향으로 재발했다. 축이 같고 증상만 다르므로 검사 하나로 덮인다 | 템플릿 이식 필요. `csp-portal-check.mjs` 패턴(CSP를 `arcade/vercel.json`에서 읽어 적용, 러너와 같은 sandbox iframe, 진짜 포인터로 성과 확인, 계산된 스타일이 기본값이 아님까지 검사)을 launchpad 공용 게이트로 승격 |
