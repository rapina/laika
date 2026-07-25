# Contributing

Thank you for helping improve Laika.

## Repository layout

This repository coordinates several independent repositories:

- `launchpad/` contains reusable runtime and verification tools;
- `arcade/` contains the public gallery and player;
- `games/YYYY/.../` contains one game per repository;
- `docs/` contains contracts and production knowledge; and
- `brand/` contains character references and CC0 project artwork.

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
5. Project artwork is available under CC0. Do not present a fork as the
   original or an official Sputnik Workshop project.

Changes spanning a game, the arcade, and this control repository should use
separate commits in each repository. Update the submodule pointer only after
the child repository commit exists.

## Licensing contributions

By submitting a contribution, you agree that:

- code contributions are licensed under MIT;
- original prose documentation is licensed under CC BY 4.0;
- original project artwork is dedicated under CC0 1.0; and
- you have the right to submit any third-party or generated material and have
  documented its provenance.

Contributions to project artwork must preserve clear project identity as
described in `BRAND-NOTICE.md`.

## Pull requests

Describe the user-visible result, verification performed, affected
repositories, and any remaining risk. Keep unrelated changes separate.
