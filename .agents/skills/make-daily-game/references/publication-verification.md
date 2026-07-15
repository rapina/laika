# Narrative, release, and publication verification

## 제작 서사 검증

- `WHY.md`의 한국어와 영어가 같은 선택을 설명한다.
- 공개 카피가 라이카 제작자 1인칭을 유지하고 잠긴 제작 기록에 없는 판단을 덧붙이지 않는다.
- manifest와 아케이드 크레딧이 라이카를 `autonomous game-making agent`로 표기한다.
- manifest의 제목, 소개, 조작, 세션과 게임 미디어가 제작 잠금과 같다.
- 제작자 일러스트가 `laika-base-v1`, 한·영 대체 문구, 초점 좌표, 640px·1280px JPEG를 갖춘다.
- `node scripts/prepare-editorial.mjs --game <path> --verify`가 통과한다.
- `.creator-lock.json`이 라이카 제작 서사 전 기준 커밋과 같다.

## 릴리스 검증

```bash
npm run build:arcade
npm run verify:arcade
npm run toss:build
```

실제 존재하는 스크립트만 실행한다. `release.json`에서 다음을 확인한다.

- `contractVersion`, `gameId`, `slug`, `releaseSha`
- 엔트리와 CSS의 불변 경로
- 모든 파일의 SHA-256
- 코드 gzip 520KB 이하
- 전체 릴리스 8MB 이하, 개별 파일 4MB 이하
- 제작자 일러스트의 baseId, 한·영 대체 문구, 초점 좌표, 두 JPEG 소스
- 생성 원본 PNG 제외

## 로컬 아케이드

`dist-arcade/`를 `arcade/public/__game-assets/games/<slug>/local-fixture/`에 동기화한다. 아케이드 카탈로그에 연속된 sequence, 날짜, 언어, 크레딧, 작품 노트, 일러스트와 릴리스 해시를 등록한다.

```bash
cd arcade
node scripts/validate.mjs
node scripts/serve.mjs
```

홈, 작품 노트, 플레이 페이지와 모든 자산 요청을 확인한다. 포털 스모크로 한 판을 완주하고 기존 등록 게임도 회귀 검증한다.

## 운영 환경

preview, production deployment URL, 운영 도메인에서 같은 slug와 release SHA를 확인한다. 다음 요청은 모두 200이어야 한다.

- `/`, `/games/<slug>`, `/play/<slug>`
- `entryUrl`, `styleUrls`, 제작자 일러스트, 게임 이미지와 오디오
- `/catalog/games.json`

콘솔 오류, 페이지 오류, 실패 요청은 0건이어야 한다. Vercel Blob과 단일 아케이드 공개가 끝나지 않았으면 일일 제작 완료로 보고하지 않는다. Toss `.ait` 제출과 출시는 별도 승인 작업이다.
