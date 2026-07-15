# Verification and local release

프로젝트의 `package.json`과 게임별 스크립트를 먼저 읽고 실제 명령 이름을 사용한다. 없는 명령을 통과한 것처럼 기록하지 않는다.

## 게임 검증

최소 검증 항목:

```bash
npm test
npx tsc -b
npm run build:web
npm run build:arcade
```

게임 저장소에 smoke와 viewport 검증이 있으면 함께 실행하고 산출물을 직접 연다.

```bash
npm run smoke
node scripts/viewport-smoke.mjs
npm run verify:arcade
```

Toss 빌드 스크립트가 있으면 실행한다.

```bash
npm run toss:build
```

다음 동작을 실제 브라우저나 자동 플레이로 확인한다.

- 첫 화면에서 규칙 이해
- 성공과 실패 판정
- 한 판 전체 완주와 90초 이내 종료
- 일시정지 중 시뮬레이션 정지
- 복귀 뒤 시간 점프 없음
- 음소거와 다시 켜기
- 재시작 뒤 초기 상태 복원
- 한국어와 영어의 기능·정보 일치
- 플레이 중 언어 변경 시 게임 상태 유지
- 360×800, 390×844, 430×932 화면
- 콘솔 오류, 페이지 오류, 실패 요청 0건

`smoke.png`, `smoke-result.json`, 세 화면 크기의 캡처와 결과 JSON, `dist-arcade/release.json`을 생성만 하지 말고 실제로 검사한다.

자동 플레이는 게임 상태를 직접 읽는 테스트 훅을 개발 빌드에만 노출해도 된다. 문구나 화면 좌표만으로 완료 여부를 추측하지 않는다.

## 릴리스 검증

`release.json`에서 다음을 확인한다.

- `contractVersion`, `gameId`, `slug`, `releaseSha`
- 엔트리와 CSS의 불변 경로
- 모든 파일의 SHA-256
- 코드 gzip 520KB 이하
- 전체 릴리스 8MB 이하
- 개별 파일 4MB 이하
- 라이카 일러스트의 `baseId`, 한·영 대체 문구, 초점 좌표, 두 JPEG 소스
- 생성 원본 PNG 제외

게임 저장소의 검증 스크립트가 있으면 수동 계산보다 우선한다.

## 로컬 아케이드 등록

게임의 `dist-arcade/`를 다음 위치에 동기화한다.

```text
arcade/public/__game-assets/games/<slug>/local-fixture/
```

`arcade/public/catalog/games.json`에 기존 스키마와 동일한 항목을 추가한다.

- 연속된 `sequence`
- `releaseDate`, `supportedLocales`, `credits`
- `artwork.baseId`, `focalPoint`, `alt.ko/en`, 640px·1280px 소스
- `content.ko/en`의 제목, 한 줄 소개, 조작, 플레이 시간, 제작 노트, 설계 이유
- `artifact.status: local`, `runnerVersion`, `version`, 엔트리·스타일·자산 경로
- `release.json`과 같은 해시, 파일 수, 바이트, 코드 gzip

카탈로그를 수정한 뒤 실행한다.

```bash
cd arcade
node scripts/validate.mjs
node scripts/serve.mjs
```

이미 서버가 실행 중이면 중복으로 띄우지 않는다. 홈, 작품 노트, 플레이 페이지와 두 일러스트 URL이 200을 반환하는지 확인한다. 포털 전체 스모크가 있으면 한 판을 완주한다.

포털 스크립트가 이전 게임의 slug, 상태 필드, 목표 횟수, 결과 단위를 하드코딩했는지 먼저 검색한다. 새 slug를 인자로 받지 못하는 스모크는 새 게임을 검증한 것으로 인정하지 않는다. runner가 새 게임의 prefix와 `gameId`를 검증하면서도 다른 등록 게임을 깨뜨리지 않는지 확인한다.

## 완료 판정

다음 중 하나라도 남으면 `local-preview` 완료로 보고하지 않는다.

- 임시 자산이나 기본 템플릿 문구
- 한국어·영어 누락
- 출처나 해시가 없는 생성 자산
- 결정론 테스트 실패
- 화면 넘침
- 브라우저 오류나 실패 요청
- 릴리스와 카탈로그 해시 불일치
- 실행하지 않은 검증을 통과로 표시한 기록

외부 Vercel·Blob·Toss 공개는 별도 승인 전까지 미완료 외부 작업으로 남긴다.
