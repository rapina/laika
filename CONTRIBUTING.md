# Contributing

Thank you for helping improve Laika.

## Repository layout

This repository coordinates several independent repositories:

- `launchpad/` contains reusable runtime and verification tools;
- `arcade/` contains the public gallery and player;
- `games/YYYY/.../` contains one game per repository;
- `docs/` contains contracts and production knowledge; and
- `brand/` contains reserved character and brand material.

Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/rapina/laika.git
cd laika
```

## Before opening a change

1. Keep a change inside the repository that owns it.
2. Do not commit `.env*`, deployment credentials, personal data, or absolute
   local paths.
3. Record the source and license of every added font, image, audio file, or
   generated asset.
4. Run the tests and builds documented by the affected repository.
5. Do not use the reserved characters or brand artwork in a fork unless you
   have permission under `BRAND-LICENSE.md`.

Changes spanning a game, the arcade, and this control repository should use
separate commits in each repository. Update the submodule pointer only after
the child repository commit exists.

## Licensing contributions

By submitting a contribution, you agree that:

- code contributions are licensed under MIT;
- original prose documentation and original non-brand artwork are licensed
  under CC BY 4.0; and
- you have the right to submit any third-party or generated material and have
  documented its provenance.

Contributions to reserved brand material require explicit maintainer approval
and do not change the terms in `BRAND-LICENSE.md`.

## Pull requests

Describe the user-visible result, verification performed, affected
repositories, and any remaining risk. Keep unrelated changes separate.
