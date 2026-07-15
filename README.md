# Sputnik Workshop

Sputnik Workshop은 운영자가 이끄는 1인 제작 스튜디오다. 상주 멍멍이 에이전트 라이카가 궤도에서 매일 하이퍼캐주얼 게임의 주제를 고르고, 기획부터 검증까지 맡아 한 작품을 완성한다. 워크숍의 가상 기록은 실제 라이카의 Sputnik 2 비행 뒤에도 신호가 남았다는 데서 시작한다.

게임 소스 저장소는 서로 분리하고, 공개된 게임은 하나의 Vercel 아케이드에서 찾고 플레이한다. 두 번째 게임에서도 유효한 개선만 런치패드로 돌려보낸다.

한국어와 영어를 기본 지원한다. 작품 노트와 게임 디자인 설명은 라이카의 1인칭으로 쓰며, 한국어의 `멍!`과 영어의 `Woof!`를 한 호흡만 사용한다. 캐릭터와 매일의 파생 일러스트는 [라이카 캐릭터 바이블](brand/LAIKA.md)을 따른다.

```text
toss-game-studio/                 운영 지식 저장소
├── launchpad/                    공통 런타임 저장소
├── arcade/                       단일 Vercel 사이트 저장소
├── brand/                        라이카 베이스 일러스트와 캐릭터 바이블
├── games/2026/2026-07-15-stitch/ 게임별 독립 저장소
├── docs/                         결정, 계약, 품질 기준
└── scripts/new-day.mjs           새 게임 저장소 생성기
```

제품 디렉터리는 각각 독립 Git 저장소이며, 이 관제 저장소에서는 submodule로 고정한다. 새 환경은 다음처럼 받는다.

```bash
git clone --recurse-submodules https://github.com/rapina/laika.git
cd laika
```

## 오늘의 게임 만들기

Codex나 Claude Code를 이 디렉터리에서 시작한 뒤 `오늘 게임 만들어줘`라고 요청한다. 라이카는 오늘의 초안이 있는지 먼저 확인하고, 주제 선택부터 기획·코드·아트·사운드·한영 카피·검증·로컬 아케이드 등록까지 자율적으로 진행한다.

직접 호출할 때는 Codex에서 `$make-daily-game`, Claude Code에서 `/make-daily-game`을 사용한다. 새 저장소가 필요한지는 스킬이 판단하므로 `scripts/new-day.mjs`를 먼저 실행하지 않는다. Vercel·Toss 공개와 유료 작업은 운영자 승인 뒤에만 진행한다.

각 게임은 자체 테스트와 릴리스 산출물을 가지며, 아케이드 공개는 별도 승인 단계로 남긴다.

첫 게임은 라이카가 만든 `한 땀 (STITCH)`이다.

## 현재 결과 실행

```bash
cd arcade
node scripts/serve.mjs
# http://127.0.0.1:4173
```

로컬 fixture는 현재 워크스페이스에 연결되어 있다. 새 환경에서는 게임 저장소에서 `npm run build:arcade`를 실행한 뒤 `dist-arcade/`를 아케이드의 `public/__game-assets/games/stitch/local-fixture/`로 복사한다. 이 디렉터리는 아케이드 Git에서 제외하며, 운영 배포에서는 Vercel Blob의 커밋 SHA 경로로 대체한다.

외부 배포는 아직 하지 않았다. [현재 상태](STATUS.md)와 [단일 아케이드 결정](docs/architecture/0001-single-arcade.md)을 확인한 뒤 원격 저장소와 Vercel·Blob을 연결한다.

Vercel에는 `rapina/laika-arcade`만 연결한다. 최초 사이트 배포와 Blob 게임 자산 연결은 [Vercel 배포 가이드](arcade/DEPLOY.md)를 따른다.
