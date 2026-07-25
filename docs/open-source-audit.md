# Laika 오픈소스 공개 감사

감사 및 공개일: 2026-07-25  
범위: 루트, 런치패드, 아케이드, 게임 저장소 19개

## 결과

Laika를 구성하는 저장소 22개를 모두 public으로 공개했다.

- 각 저장소의 이전 브랜치와 태그를 제거했다.
- 각 저장소는 `Initial public release` 단일 커밋으로 시작한다.
- 게임 저장소는 `rapina/laika-game-<slug>` 이름을 사용한다.
- 루트에서 21개 public 서브모듈을 고정한다.
- 모든 README는 한국어와 영어를 동등하게 제공한다.

## 라이선스

- 코드와 제작 자동화: MIT
- 원본 문서: CC BY 4.0
- Laika, Murr, Cherpa, Enos 캐릭터·로고·프로젝트 아트: CC0 1.0
- Galmuri 폰트: SIL Open Font License 1.1
- 제3자 자료: 각 자료의 원래 라이선스와 provenance 기록

루트에는 `LICENSE`, `CONTENT-LICENSE.md`, `BRAND-NOTICE.md`,
`CONTRIBUTING.md`, `SECURITY.md`를 둔다. 모든 독립 저장소에는 MIT와 콘텐츠
라이선스를 명시했으며, Galmuri 파일이 있는 저장소에는 `OFL-GALMURI.md`를
동봉했다.

## 보안과 개인정보

- 공개 스냅샷의 텍스트 파일 2,359개에서 개인키, GitHub 토큰, Vercel 토큰,
  Supabase 서비스 키 패턴을 찾지 못했다.
- `.env*`, `.vercel/`, 빌드 캐시는 Git에서 제외된다.
- 절대 로컬 사용자 경로를 제거하거나 저장소 상대 경로로 바꿨다.
- 브라우저에는 Supabase publishable key만 포함된다.
- publishable key로 `cycle_events` 읽기는 가능하지만 익명 INSERT는 RLS가
  PostgreSQL `42501`로 거부하는 것을 비파괴 요청으로 확인했다.
- 서비스 역할 키는 로컬 환경 변수로만 읽는다.

## 재현 검증

인증 정보를 사용하지 않고 다음 공개 URL을 새 임시 디렉터리에 shallow clone했다.

```bash
git clone --depth 1 --recurse-submodules --shallow-submodules \
  https://github.com/rapina/laika.git
```

검증 결과:

- 저장소 22개 모두 접근 가능
- 저장소마다 커밋 1개, `main` 브랜치 1개, 태그 0개
- 저장소마다 MIT `LICENSE` 존재
- README 22개 모두 한국어·영어 섹션 존재
- 아케이드 카탈로그, sandbox, 게임 19개 검증 통과
- 루트 및 아케이드 카탈로그 JSON 파싱 통과

## 앞으로의 공개 규칙

`scripts/create-game-repository.mjs`가 새 게임 저장소를
`rapina/laika-game-<slug>` 이름의 public 저장소로 만든다. 제작 스킬은 scaffold
직후 이 스크립트를 실행하며, 게임 README에 한·영 제목·설명·조작·로컬 실행·검증·
라이선스를 포함해야 한다.

GitHub visibility 변경, 새 유료 서비스, Toss 출시는 계속 운영자 승인 대상이다.
