<p align="center">
  <img src="brand/logo/laika-github-logo.png" width="180" alt="Laika logo">
</p>

<h1 align="center">Laika</h1>

<p align="center">
  An open-source game studio that designs, verifies, and transmits one small game at a time
</p>

<p align="center">
  <a href="https://laika365.vercel.app">Arcade</a> ·
  <a href="README.md">한국어</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="SECURITY.md">Security</a>
</p>

## What is Laika?

Laika is an open-source game production system operated by Sputnik Workshop.
A context-isolated production agent chooses the idea for a one-handed portrait
game and completes its implementation, art, sound, and tests. Only after the
rules and representative scene are locked does the public Laika narrative enter
the process. The finished game is then published, with its maker notes, as the
next numbered work in a single arcade.

This separation keeps the creative stage from unconsciously reproducing the
brand or earlier games. The publication stage still gives every game a
consistent production record and verifiable evidence. The project values
finishing and play-testing one small game over producing a large number of
unfinished concepts.

> The historical space dog Laika and this project's fictional maker narrative
> are distinct. In this project, Laika is an autonomous game-making agent that
> transmits finished games to Earth.

## Play now

You can play every published game in the
[Laika Arcade](https://laika365.vercel.app) without installing anything. The
games share a compact set of constraints:

- A portrait layout, playable with one hand and one core interaction
- A complete run that lasts roughly 60 seconds or less
- Equivalent features and information in Korean and English
- Feedback that remains understandable without sound
- Deterministic judgment tests and verification at multiple mobile sizes
- Recorded production decisions, asset provenance, and play results

The arcade currently presents 19 games, each maintained in an independent
repository.

## Repository layout

This is the studio control repository. The runtime, arcade, and games are
independent repositories connected through Git submodules.

```text
laika/
├── arcade/                 Public gallery, player, and sandbox runner
├── launchpad/              Shared runtime, platform adapters, and verification
├── games/YYYY/             Independent game repositories organized by date
├── brand/                  Narrative, character standards, and brand sources
├── catalog/                Game and publication-state catalogs
├── docs/                   Architecture decisions and production contracts
├── scripts/                Production-cycle and publication automation
└── templates/              Templates for new game records and configuration
```

Game repositories are created as public `rapina/laika-game-<slug>`
repositories. The arcade does not copy their source; it points to verified
releases and commits.

## Run locally

### Requirements

- Git 2.30 or newer
- Node.js 20 or newer
- A current desktop browser

### Clone the complete workspace

```bash
git clone --recurse-submodules https://github.com/rapina/laika.git
cd laika
```

If you cloned without submodules, initialize them afterward:

```bash
git submodule update --init --recursive
```

### Start the arcade

```bash
cd arcade
node scripts/serve.mjs
```

Open <http://127.0.0.1:4173> and choose a game. Press `Ctrl+C` in the running
terminal to stop the local server.

### Validate the catalog

```bash
node arcade/scripts/validate.mjs
```

This checks the arcade catalog, sandbox contract, and registered game entries.
Build and test commands for an individual game are documented in that game's
README and `DAY.md`.

## How a new game is made

Start Codex or Claude Code at the repository root and ask it to make today's
game. The daily production cycle then:

1. Shares only neutral repetition fingerprints while hiding brand and past
   narrative context.
2. Lets the production agent independently choose the question, rules, title,
   and visual material.
3. Builds a playable vertical slice and tests judgment, scoring, and pause
   behavior.
4. Verifies mobile layouts, Korean and English, silent play, and a complete run.
5. Locks the title, rules, game art, and sound.
6. Writes Laika's maker notes and public illustration from the locked record.
7. Creates an independent public repository and registers an immutable release
   with the arcade.
8. Completes a real playthrough on the public URL to verify production.

See [RTK.md](RTK.md) for completion criteria and role boundaries, and
[`docs/contracts/`](docs/contracts/) for detailed publication contracts.

## Design principles

- **Context isolation:** creative decisions finish before the production agent
  sees the brand narrative.
- **Finish small:** one interaction, one material quality, and one
  representative scene take priority.
- **Verifiable records:** tests and actual play results matter more than
  invented design rationale.
- **Immutable releases:** a public game is deployed under a path containing its
  Git SHA, and the catalog pins that version.
- **Accessible defaults:** Korean and English, portrait mobile layouts, and
  silent play are baseline contracts.
- **Open code, separate brand:** the production system and code can be reused,
  while the Laika characters, logos, and brand art have separate terms.

## Contributing

Bug fixes, accessibility improvements, verification tooling, and documentation
work are welcome. Changes to locked creative decisions or reuse of brand assets
require a different review from ordinary code contributions. Read
[CONTRIBUTING.md](CONTRIBUTING.md) before starting. Report security issues
through [SECURITY.md](SECURITY.md), not a public issue.

## License

- Code and production automation: [MIT](LICENSE)
- Documentation and original non-brand artwork:
  [CC BY 4.0](CONTENT-LICENSE.md)
- Laika, Murr, Cherpa, and Enos characters, logos, and brand artwork:
  [separate brand terms](BRAND-LICENSE.md)
- Galmuri fonts and third-party material: their original licenses and
  provenance records included in the relevant repository

The new Laika logo is a project brand asset and is governed by
[`BRAND-LICENSE.md`](BRAND-LICENSE.md).
