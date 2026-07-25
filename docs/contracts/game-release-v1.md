# Game Release Contract v1

게임 저장소는 다음 파일을 만든다.

```text
dist-arcade/
├── entry.mjs
├── assets/<content-hash>.<ext>
└── release.json
```

`release.json`의 최소 스키마:

```json
{
  "contractVersion": 1,
  "gameId": "stitch",
  "slug": "stitch",
  "releaseSha": "git-commit-sha",
  "launchpadSha": "template-commit-sha",
  "entry": "entry.mjs",
  "manifestSha256": "sha256-hex",
  "files": 0,
  "bytes": 0,
  "capabilities": ["audio", "pointer"],
  "viewport": { "orientation": "portrait", "aspectMin": 0.42, "aspectMax": 0.58 },
  "media": {
    "makerIllustration": {
      "baseId": "laika-base-v1",
      "focalPoint": { "x": 0.5, "y": 0.5 },
      "alt": { "ko": "...", "en": "..." },
      "sources": [
        {
          "path": "art/laika-game-640.jpg",
          "width": 640,
          "height": 426,
          "type": "image/jpeg",
          "sha256": "sha256-hex"
        }
      ]
    }
  }
}
```

`makerIllustration`은 `brand/art/laika-base.png`를 직접 참조해 만든 그날의 라이카 그림이다. `path`는 릴리스 내부 상대 경로여야 하고, 한국어·영어 대체 문구와 `0~1` 범위의 초점 좌표를 함께 둔다. 생성 원본 PNG와 프롬프트는 게임 저장소에만 보관하며 릴리스에는 포함하지 않는다.

## 모듈 API

`entry.mjs`는 `mountGame(options)`를 export한다.

```ts
type GameOptions = {
  root: HTMLElement;
  assetBaseUrl: string;
  locale: "ko" | "en";
  seed: string;
  host: {
    emit(event: GameEvent): void;
    request<T>(command: HostCommand): Promise<T>;
  };
};

type GameHandle = {
  pause(): void;
  resume(): void;
  mute(value: boolean): void;
  setLocale(locale: "ko" | "en"): void;
  restart(seed?: string): void;
  destroy(): void;
};
```

게임은 부모 문서, 쿠키, localStorage, 분석 SDK에 직접 접근하지 않는다. 필요한 기능은 host contract를 사용한다.

## 이벤트

- 게임 → 호스트: `ready`, `started`, `score`, `ended`, `error`, `exit`
- 호스트 → 게임: `start`, `pause`, `resume`, `mute`, `locale`, `restart`, `destroy`

모든 메시지는 `contractVersion`, `gameId`, 단조 증가하는 `sequence`를 포함한다. 호스트는 알 수 없는 필드가 아니라 알 수 없는 타입, 과대 payload, 순서가 뒤집힌 메시지를 거부한다.

## 예산

- 엔트리와 코드 청크 합계: gzip 1.5 MB 이하 — 렌더러·물리 엔진(wasm 포함)을 배제하지 않는 크기
- 첫 화면 필수 자산: 1.5 MB 이하
- 전체 릴리스: 16 MB 이하
- 한 파일: 4 MB 이하
- 첫 상호작용 가능 시점: 기준 Android 기기, 보통 4G에서 3초 이내 목표. 바이트 예산은 이 지표의 대리값이다 — 첫 상호작용 전에 필요하지 않은 코드와 자산(대형 엔진 모듈, 후반 오디오)은 지연 로드로 크리티컬 패스에서 분리한다.
