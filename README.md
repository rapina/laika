# Laika

## 한국어

Laika는 Sputnik Workshop의 오픈소스 게임 스튜디오다. 브랜드를 모르는 독립
제작 에이전트가 한 손 세로 게임을 설계·구현·검증하고, 게임이 잠긴 뒤 라이카의
제작 기록과 함께 하나의 아케이드에 공개한다.

- 아케이드: <https://laika365.vercel.app>
- 게임: `games/YYYY/YYYY-MM-DD-slug/`
- 공용 런타임과 검증 도구: `launchpad/`
- 전시·플레이 사이트: `arcade/`
- 제작 계약과 학습 기록: `docs/`

### 받기

```bash
git clone --recurse-submodules https://github.com/rapina/laika.git
cd laika
```

### 로컬 아케이드

```bash
cd arcade
node scripts/serve.mjs
```

<http://127.0.0.1:4173>에서 게임을 선택해 플레이할 수 있다.

### 새 게임 제작

Codex 또는 Claude Code를 저장소 루트에서 실행하고 `오늘 게임 만들어줘`라고
요청한다. 제작 사이클은 콘셉트 격리, 결정론 테스트, 설계 검토, 한·영 카피,
아케이드 공개와 운영 완주를 포함한다. 새 게임 저장소는
`rapina/laika-game-<slug>` 이름으로 public 생성한다.

## English

Laika is Sputnik Workshop's open-source game studio. A context-isolated
production agent designs, builds, and verifies one-handed portrait games.
After the game is locked, its maker record is added and the game is published
to a single arcade.

- Arcade: <https://laika365.vercel.app>
- Games: `games/YYYY/YYYY-MM-DD-slug/`
- Shared runtime and verification: `launchpad/`
- Gallery and player: `arcade/`
- Production contracts and learnings: `docs/`

### Clone

```bash
git clone --recurse-submodules https://github.com/rapina/laika.git
cd laika
```

### Run the arcade locally

```bash
cd arcade
node scripts/serve.mjs
```

Open <http://127.0.0.1:4173> and choose a game.

### Produce a new game

Start Codex or Claude Code at the repository root and ask it to make today's
game. The production cycle includes context-isolated concept work,
deterministic tests, independent design review, Korean and English copy,
Arcade publication, and a production playthrough. New game repositories use
the public `rapina/laika-game-<slug>` naming scheme.

## 라이선스 / License

- 코드와 자동화 / Code and automation: [MIT](LICENSE)
- 문서와 비브랜드 원본 아트 / Documentation and original non-brand artwork:
  [CC BY 4.0](CONTENT-LICENSE.md)
- 캐릭터·로고·브랜드 아트 / Characters, logos, and brand artwork:
  [별도 조건 / separate terms](BRAND-LICENSE.md)
- 기여 / Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- 보안 / Security: [SECURITY.md](SECURITY.md)
