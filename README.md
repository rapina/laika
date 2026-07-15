# Sputnik Workshop

Sputnik Workshop은 운영자가 이끄는 1인 제작 스튜디오다. 내부에서는 브랜드를 모르는 제작 에이전트가 게임을 자유롭게 완성한다. 게임이 잠긴 뒤 공개 기록에서는 라이카가 오늘의 게임을 직접 만든 제작자로 설명하고 궤도에서 지구로 보낸다. 워크숍의 가상 기록은 실제 라이카의 Sputnik 2 비행 뒤에도 신호가 남았다는 데서 시작한다.

게임 소스 저장소는 서로 분리하고, 공개된 게임은 하나의 Vercel 아케이드에서 찾고 플레이한다. 두 번째 게임에서도 유효한 개선만 런치패드로 돌려보낸다.

한국어와 영어를 기본 지원한다. 게임 디자인 문서는 중립적으로 작성하고, 게임 잠금 뒤 작품 노트는 라이카가 직접 만든 게임을 설명하는 1인칭으로 쓴다. 캐릭터와 매일의 파생 일러스트는 [라이카 캐릭터 바이블](brand/LAIKA.md)을 따른다.

```text
toss-game-studio/                 운영 지식 저장소
├── launchpad/                    공통 런타임 저장소
├── arcade/                       단일 Vercel 사이트 저장소
├── brand/                        라이카 베이스 일러스트와 캐릭터 바이블
├── games/2026/2026-07-14-stitch/ 게임별 독립 저장소
├── docs/                         결정, 계약, 품질 기준
└── scripts/new-day.mjs           새 게임 저장소 생성기
```

제품 디렉터리는 각각 독립 Git 저장소이며, 이 관제 저장소에서는 submodule로 고정한다. 새 환경은 다음처럼 받는다.

```bash
git clone --recurse-submodules https://github.com/rapina/laika.git
cd laika
```

## 오늘의 게임 만들기

Codex나 Claude Code를 이 디렉터리에서 시작한 뒤 `오늘 게임 만들어줘`라고 요청한다. 작업기는 오늘의 초안을 먼저 확인한 뒤, 독립 제작 맥락에서 주제 선택부터 게임 검증까지 진행한다. 게임을 잠근 다음 라이카가 제작자로 말하는 작품 노트와 일러스트를 만들고, 단일 아케이드 공개와 운영 환경 완주까지 마친다.

직접 호출할 때는 Codex에서 `$make-daily-game`, Claude Code에서 `/make-daily-game`을 사용한다. 새 저장소가 필요한지는 스킬이 판단하므로 `scripts/new-day.mjs`를 먼저 실행하지 않는다. 이미 연결된 Vercel 아케이드 공개는 기본 작업이다. Toss 출시, 새 유료 서비스, 계정·도메인 변경은 운영자 승인 뒤에만 진행한다.

운영자는 스튜디오의 장기 방향과 승인 경계를 맡는다. 내부 제작 에이전트의 브랜드 분리는 공개 세계관을 게임 안으로 역수입하지 않기 위한 제작 규칙이다.

첫 게임은 라이카가 만든 `한 땀 (STITCH)`이다.

## 현재 결과 실행

```bash
cd arcade
node scripts/serve.mjs
# http://127.0.0.1:4173
```

로컬 fixture는 현재 워크스페이스에 연결되어 있다. 새 환경에서는 게임 저장소에서 `npm run build:arcade`를 실행한 뒤 `dist-arcade/`를 아케이드의 `public/__game-assets/games/stitch/local-fixture/`로 복사한다. 이 디렉터리는 아케이드 Git에서 제외하며, 운영 배포에서는 Vercel Blob의 커밋 SHA 경로로 대체한다.

Vercel에는 `rapina/laika-arcade`만 연결한다. 최초 인증과 매일의 자동 공개 절차는 [Vercel 배포 가이드](arcade/DEPLOY.md)를 따른다.
