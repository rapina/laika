# Game Publication Contract v1

이 계약은 검증된 게임 릴리스를 단일 Sputnik Workshop Arcade에 공개하는 순서와 실패 원칙을 정의한다. 대상 게임은 `game-release-v1` 계약을 먼저 통과해야 한다.

## 공개 단위

- Blob 경로: `games/<slug>/<releaseSha>/<release-relative-path>`
- 공개 자산 경로: `/__game-assets/games/<slug>/<releaseSha>/...`
- 완료 표식: 같은 prefix의 `release.json`
- 공개 포인터: `arcade/public/catalog/games.json`

`releaseSha`는 소문자 40자리 Git SHA다. 이미 존재하는 경로는 내용, 크기, SHA-256, Content-Type이 모두 같을 때만 재사용한다. 내용이 다르면 덮어쓰지 않는다.

## 순서

1. 게임 저장소 HEAD, `release.json.releaseSha`, manifest의 정체성이 같은지 확인한다.
2. 테스트, 빌드, 뷰포트와 전체 게임 스모크를 다시 실행한다.
3. 자산을 정렬된 순서로 업로드하고 각 객체를 다시 읽어 검증한다.
4. 모든 자산 검증 뒤 `release.json`을 마지막에 올린다.
5. 아케이드 카탈로그를 `published`로 바꾸고 Blob rewrite를 같은 커밋에 넣는다.
6. release 브랜치의 Vercel preview에서 카탈로그와 전체 플레이를 검증한다.
7. 같은 아케이드 커밋을 `main`에 fast-forward한다.
8. production deployment URL과 운영 도메인에서 다시 검증한다.
9. 관제 카탈로그와 Arcade submodule 포인터를 기록한다.

preview가 실패하면 production을 바꾸지 않는다. production 검증이 실패하면 공개 커밋을 revert하고 이전 카탈로그 포인터로 복구한다. 업로드한 불변 Blob 객체는 삭제하지 않는다.

## 카탈로그 조건

공개된 게임 항목은 다음을 만족해야 한다.

- `status`와 `artifact.status`가 `published`
- `artifact.version`과 `artifact.release.releaseSha`가 같은 full SHA
- entry, style, asset base, 라이카 일러스트가 모두 같은 slug와 SHA prefix 아래에 있음
- `artifact.source.kind`가 `vercel-blob`
- `release.json`과 파일 수, 전체 바이트, 코드 gzip, manifest SHA-256이 같음
- 한국어와 영어 작품 노트, 조작 안내, 결과 표시 규칙이 모두 있음

루트 카탈로그의 `arcadeState`는 공개 상태를 보여 주는 미러다. 실제 실행 경로의 권위는 아케이드 카탈로그가 가진다.

## 비밀과 권한

- Blob 토큰은 환경 변수로만 전달한다.
- 토큰 값은 로그, CLI 인자, JSON 보고서, Git에 남기지 않는다.
- 공개 자동화는 기존 `laika` Vercel 프로젝트와 기존 Public Blob store만 사용한다.
- 새 프로젝트, 새 유료 리소스, 계정·도메인 변경은 자동으로 만들지 않는다.

## 완료 판정

운영 주소의 카탈로그가 요청한 release SHA를 가리키고, 브라우저 전체 스모크가 한 판을 완주하며, 콘솔 오류와 실패 요청이 0건일 때만 공개 완료다.
