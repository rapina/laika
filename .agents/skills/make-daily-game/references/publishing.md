# Arcade publishing

공개 대상은 게임 저장소가 아니라 `rapina/laika-arcade` 하나다. 게임의 검증된 `dist-arcade/`를 Vercel Public Blob의 불변 경로에 올리고, 아케이드 카탈로그가 그 SHA를 가리키게 한다.

## 공개 전 조건

- 게임 저장소의 HEAD가 `release.json.releaseSha`와 같다.
- 게임 저장소, 아케이드, 관제 저장소의 공개 대상 파일이 커밋되어 있고 각 `main`이 `origin/main`과 같다.
- `.studio.json.publishState`가 `local-preview`다.
- `npm test`, 게임 스모크, 뷰포트 스모크, `build:arcade`, `verify:arcade`가 통과한다.
- 아케이드 로컬 카탈로그와 포털 전체 스모크가 통과한다.

## 자동 공개 명령

관제 저장소 루트에서 실행한다.

```bash
node scripts/publish-game.mjs --dry-run --game games/YYYY/YYYY-MM-DD-slug
node scripts/publish-game.mjs --publish --game games/YYYY/YYYY-MM-DD-slug
```

이미 공개된 게임을 승인받아 새 불변 artifact로 교체할 때만 두 명령에 `--replace-published`를 추가한다. 기본 경로는 다른 SHA로 공개된 slug를 계속 차단한다. 교체는 기존 Blob 객체를 삭제하거나 덮어쓰지 않고 카탈로그 포인터만 새 SHA로 바꾼다.

`--dry-run`은 파일, 네트워크, Git 상태를 바꾸지 않는다. 같은 입력이면 출력도 같아야 한다.

`--publish`는 다음 순서로만 진행한다.

1. 저장소 HEAD와 공개 대상 파일 상태를 다시 검사한다.
2. 게임의 모든 gate를 재실행하고 게시 계획이 바뀌지 않았는지 확인한다.
3. `games/<slug>/<releaseSha>/`에 자산을 올리고 `release.json`을 마지막에 올린다.
4. 기존 객체는 바이트, SHA-256, Content-Type이 모두 같을 때만 건너뛴다. 같은 경로의 내용이 다르면 덮어쓰지 않고 실패한다.
5. 공개 카탈로그와 Blob rewrite를 release 브랜치에 커밋한다.
6. Vercel preview에서 카탈로그를 확인하고 한 판을 완주한다.
7. 검증한 같은 커밋을 `main`에 올린다.
8. production deployment URL과 `https://laika365.vercel.app`에서 다시 한 판씩 완주한다.
9. 관제 카탈로그와 Arcade submodule 포인터를 동기화한다.

production 검증이 실패하면 아케이드 공개 커밋을 자동으로 되돌린다. Blob 객체는 불변 감사 기록이므로 삭제하지 않는다.

## 상태 소유권

- 게임 `.studio.json`: 빌드 소스가 로컬 gate를 통과했다는 `local-preview` 상태
- 아케이드 `public/catalog/games.json`: 실제 실행 artifact와 `published` 상태
- 관제 `catalog/games.json`: 공개 여부를 보여 주는 비권위 미러

게임 `.studio.json`을 공개 뒤 다시 커밋하면 `releaseSha === HEAD`가 깨지는 순환이 생긴다. 따라서 공개 상태로 바꾸지 않는다.

이미 공개된 게임의 논리 날짜만 바로잡은 후속 커밋은 보존 예외다. 이때 관제 카탈로그의 `sourceHead`, `publishedReleaseSha`, `metadataAmendedAfterRelease`를 함께 기록하고 기존 Blob 경로와 실제 생성·배포 시각은 바꾸지 않는다. 해당 소스 HEAD로 일반 `--dry-run`이나 재공개를 실행하지 않으며, artifact 교체가 필요하면 별도 교체 절차를 먼저 승인받는다.

## 인증 복구

Vercel 인증이 없거나 프로젝트 연결이 사라졌으면 아케이드 디렉터리에서 다음을 안내한다.

```bash
cd arcade
vercel login
vercel link --project laika --scope rapinas-projects
vercel env pull .env.local --yes
vercel whoami
```

GitHub 인증은 관제 저장소에서 확인한다.

```bash
gh auth status
```

토큰 값은 출력, 로그, 명령 인자, Git 커밋에 남기지 않는다. `.env.local`의 값을 사용자에게 복사해 달라고 요청하지 않는다.

Toss `.ait` 제출과 출시는 이 절차에 포함하지 않는다.
