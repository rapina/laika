# ADR 0001: 하나의 아케이드, 분리된 게임 저장소

- 상태: 채택
- 날짜: 2026-07-15

## 결정

아케이드만 하나의 Vercel 프로젝트로 운영한다. 각 게임은 독립 Git 저장소에서 빌드한 뒤, 불변 경로의 자산 묶음과 `release.json`을 발행한다. 아케이드 카탈로그는 승인한 릴리스의 커밋과 해시만 고정한다.

관제 저장소는 런치패드, 아케이드, 각 게임 저장소를 Git submodule로 고정한다. 제품의 커밋 이력과 배포 권한은 서로 섞지 않는다.

```text
game repo ── test/build/hash ──> immutable asset store
     │                                 │
     └── catalog metadata PR ──> arcade repo ──> one Vercel project
                                      │
                                      └─ /play/:slug
                                           └─ sandboxed /runner/v1 iframe
                                                └─ /__game-assets/*
```

러너 HTML은 아케이드가 제공한다. 게임의 JS, CSS, 이미지, 오디오는 `/__game-assets/*`라는 고정 경로 뒤에서 제공한다. 운영에서는 이 경로를 Vercel Blob의 불변 접두사로 외부 rewrite한다. 로컬 개발에서는 같은 경로 아래의 fixture를 사용한다.

## 이유

게임마다 Vercel 프로젝트를 만들면 저장소 분리는 쉽지만, 365개 규모에서 프로젝트 수와 비용이 구조 자체의 병목이 된다. 모든 게임 산출물을 아케이드 빌드에 합치면 시간이 갈수록 전체 재빌드와 배포 크기가 커진다.

Vercel Blob은 HTML 호스팅 용도가 아니며 보안 헤더 때문에 Blob의 `index.html`을 iframe으로 쓰지 않는다. 대신 포털이 통제하는 단일 러너가 카탈로그에 고정된 모듈만 불러온다.

## 격리

- iframe은 기본적으로 `allow-scripts`만 허용하고 `allow-same-origin`은 주지 않는다.
- 러너와 포털은 초기 핸드셰이크 뒤 `MessageChannel`로만 통신한다.
- 저장, 점수, 분석, 음소거, 일시정지, 종료는 호스트가 소유한다.
- 카탈로그에 없는 경로, 다른 릴리스의 상대 경로, 허용하지 않은 capability는 거부한다.
- 릴리스는 덮어쓰지 않는다. 롤백은 카탈로그 포인터만 바꾼다.

## 배포 흐름

1. 게임 CI가 테스트, 결정론 빌드, 예산, 헤드리스 스모크를 검사한다.
2. 승인된 릴리스 잡이 `games/<gameId>/<gitSha>/`에 파일을 올린다.
3. 제안된 릴리스를 실제 러너로 스모크 테스트한다.
4. 아케이드에 메타데이터 PR을 연다.
5. 병합하면 유일한 Vercel 사이트가 배포된다.

Toss `.ait`는 같은 게임 저장소에서 별도 타깃으로 만들며 아케이드 공개와 묶지 않는다.

## 보류

Blob 스토어를 만들기 전 첫 게임은 Git에서 제외한 로컬 fixture로 통합 검증한다. 카탈로그의 `artifact.status: local`은 localhost에서만 실행되어 fixture가 없는 Vercel 배포에서는 초안으로 남는다. 운영 origin이 정해지면 `/__game-assets/*` rewrite를 연결하고 상태를 `published`로 바꾼다. 게임 계약과 공개 URL은 바꾸지 않는다.

## 공식 근거

- [Vercel Microfrontends](https://vercel.com/docs/microfrontends)
- [Vercel Limits](https://vercel.com/docs/limits)
- [Blob public storage](https://vercel.com/docs/vercel-blob/public-storage)
- [Blob security](https://vercel.com/docs/vercel-blob/security)
- [External rewrites](https://vercel.com/docs/routing/rewrites)
