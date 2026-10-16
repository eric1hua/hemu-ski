# Hemu Ski

A small Three.js snowboarding experiment: the art style is inspired by
[Messenger](https://messenger.abeto.co/) (flat cel shading, ink outlines,
hatched shadows, teal painted sky), set on the real terrain under
**Gondola No. 6 (6号索道)** at Hemu Jikepulin, Altay, Xinjiang
([OpenSkiMap](https://openskimap.org/?obj=0b7b6181d7f003a429f97c18559e0c6fbe08a8a5)).

The course is **云霄峰道 Yunxiaofeng** (advanced, ~1.06 km, ~460 m drop), the
run that goes from the gondola's top station (2,763 m) to its bottom station
(2,299 m). The 38 other runs and 4 lifts in the 4 × 4 km area are there too, so you
can ride off onto them.

```bash
npm install
npm run dev
```

## Diorama

`npm run dev`, then open `/diorama.html`: the whole resort as a tabletop model.
All 87 runs and 10 lifts in a 6.4 km block, cut out of the real terrain and set
on a walnut plinth. Drag to spin it, scroll to zoom, and hover a run or lift to
see its name, length and drop. Gondolas and chairs run on their cables, and
little riders carve down the runs and chain from one run onto the next.

It reuses the game's modules at toy proportions (oversized trees, lifts and
riders). Its data is a separate, larger bake in `public/data/diorama/`, made
with `npm run fetch-data -- diorama`.

## Controls

| Key | Action |
| --- | --- |
| A / D (← / →) | carve heelside / toeside |
| W (↑) | tuck |
| S (↓) | skid / brake |
| Space | hold and release to ollie, steer in the air to spin |
| R | back to the top |

## How it's built

- `scripts/fetch-data.mjs` bakes the world into `public/data/`:
  elevation from AWS Terrain Tiles (Terrarium, z14 for the 4 km play area,
  z11 for the 40 km horizon), plus pistes and lifts from OpenStreetMap via
  Overpass. Re-run with `npm run fetch-data` (it caches into `.cache/`).
- `src/render/toon.js` adds three flat tones, a wobbly terminator, shadow
  hatching and snow-surface strokes to `MeshLambertMaterial`, so shadows,
  fog and instancing still work.
- `src/render/post.js` draws ink lines from depth (silhouettes) and normals
  (creases), with jittered offsets for a hand-drawn line, plus paper grain.
- `src/player/rider.js` builds the snowboarder from primitives after the
  character sheet in `refs/player-turnaround.webp`. The face is a painted
  canvas texture, and the legs use two-bone IK.
- `src/player/physics.js` handles slope gravity, edge grip that turns sideways
  slip back into forward speed, drag, ollies, natural take-offs on rollovers,
  and tree crashes.

## What's approximate

- The DEM comes from ~30 m source data and is smoothed, so small bumps and
  terrain-park features aren't there.
- Forest cover is procedural: trees grow below a ~2,480 m treeline and are
  cleared along pistes and lift lines. Pistes are assumed to be about 34 m wide.

Data © OpenStreetMap contributors (ODbL). Elevation: Mapzen / AWS Terrain Tiles.
