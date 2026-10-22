# Working in this repo

Hemu Ski is a Three.js snowboarding game and a tabletop diorama of the same
resort. README.md says what they do; this file says where things go.

## Product and production

The repo holds two lines of work. Keep them apart.

- **Product**: what ships to GitHub Pages. Only `index.html` (the game) and
  `diorama.html` (the diorama) are built, from `src/` and `public/`.
- **Production**: the tools that make or check the product's content. They
  live in `tools/` and `tests/`, run under `npm run dev` or Node, and are never
  built. The Tripo asset lab, which makes the 3D models, is a separate local
  project outside this repo (see below).

| Path | What it is | Ships |
| --- | --- | --- |
| `index.html`, `diorama.html` | the game and the diorama | yes |
| `src/` | their code: the game at the top level, `diorama/`, and the engine they share (`world/`, `render/`, `player/`, …) | yes |
| `public/data/` | the baked terrain (from `tools/terrain/`) and the map edits in `edits/` (from `tools/map-editor/`) | yes |
| `public/models/<name>/` | finished GLBs from the asset lab, each with a README: source, SHA-256, size, facing | yes |
| `tools/map-editor/` | the map editor (`/tools/map-editor/`) and its dev-server save plugin | no |
| `tools/terrain/` | the terrain baker (`npm run fetch-data`; `-- diorama` for the diorama's block) | no |
| `tools/review/` | review pages for the riders, the dog and the summit's landmarks (`/tools/review/rider.html`, `dog.html`, `summit.html`) | no |
| `tests/` | `npm test` | no |
| `scripts/` | double-click launchers for the game (`Hemu Ski.command`) and the map editor (`Hemu Map Editor.command`), sharing one dev server on port 5190 | no |
| `output/`, `.cache/` | local screenshots and videos, and the baker's download cache (both ignored) | no |

Rules:

- Code that ships goes in `src/`, and nothing in `src/` imports from `tools/`
  or `tests/`. Tools may import from `src/`, so they show what the game shows.
- A new tool gets its own folder in `tools/`. Don't add pages at the top level,
  and don't add to the build inputs in `vite.config.js` unless it should ship.
- What a tool hands the game goes in `public/`, as the map edits do; the game
  never reaches into `tools/`.
- Docs follow the same line: README.md covers the game and the diorama, and a
  tool's manual goes in its own folder (as `tools/map-editor/README.md`).

## The asset lab

The Tripo asset lab is `~/Developer/hemu-ski-asset-lab`, beside this repo. It
holds the references, Tripo inputs and exports, the .blend files, the Cowart
boards and the dog exporter. It has its own local git and is never pushed.

- **Handover**: a finished GLB is copied into `public/models/<name>/` with a
  README entry, and committed here. That is all that comes over: no
  references, inputs or .blend files. The game never reads a lab path; the
  model READMEs may name one, as a record of where a model came from.
- **The lab reads this repo**: its preview page imports `src/render/toon.js`
  (`makeToon`, `toonUniforms`), `src/render/post.js` (`InkPost`) and
  `src/player/face-decal.js` (`FaceDecal`) through `@game/`, and one review
  script imports `src/player/rider.js` (`Rider`). Moving or renaming those
  breaks the lab; check its preview (`npm run dev` there, port 5191).
- **Same three**: the lab pins `three` to the version installed here. After
  upgrading `three`, set the lab's `package.json` to match and run
  `npm install` there.

## Git and publishing

- One branch, `main`, tracking `origin/main` on GitHub (eric1hua/hemu-ski).
  Every push to `main` deploys the game and the diorama to GitHub Pages.
- Commit on `main` and run `git push`. Never force-push.
- `refs/archive/local-with-tripo` keeps the old local history, from when the
  lab was committed here. Never push it, or any old local branch
  (`map-editor`, `backup/*`) that still exists.

## Running

- `npm run dev`: the game at `/`, the diorama at `/diorama.html`, the tools at
  the paths above. `.claude/launch.json` has `hemu-ski` (port 5179) and
  `hemu-diorama` (5183); the launcher uses 5190 and the lab 5191.
- `npm run build` writes `dist/`, which should hold only the two pages.
- `npm test` runs the rider animation test.
