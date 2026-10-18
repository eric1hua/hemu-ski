# Hemu Ski

A small Three.js snowboarding experiment: the art style is inspired by
[Messenger](https://messenger.abeto.co/) (flat cel shading, ink outlines,
hatched shadows, teal painted sky), set on the real terrain under
**Gondola No. 6 (6号索道)** at Hemu Jikepulin, Altay, Xinjiang
([OpenSkiMap](https://openskimap.org/?obj=0b7b6181d7f003a429f97c18559e0c6fbe08a8a5)).

You start at the head of **云霄峰道 Yunxiaofeng** (advanced, ~1.06 km, ~460 m
drop), below the gondola's top station (2,763 m). There is no finish: the whole
7.2 km block is open, with all 87 runs and 10 lifts, down the valley to the
**East and West Service Centres** (东区/西区服务大厅) about 1,300 m below. At a
service centre, or at any lift's bottom station, press **E** to ride the gondola up
to its top station: from the East hall, 1号 takes you up to 7号, which goes on to
the summit. If you hit a tree or land badly, you get back up where you fell.
The edge of the map is a wall.

```bash
npm install
npm run dev
```

The game opens on a title screen in the style of Messenger: the resort floats in
the sky as a small island behind block letters. **Begin** (or Enter) flies the
camera down through a cloud to the top station; Space skips the flight, and
`?notitle` in the URL skips the title altogether.

Click the mini-map in the top right (or press **M**) for the whole map, north up,
with an arrow where you are, the lifts by number and the service centres. Each
lift's dashed line has a dot at its bottom station, where you board, and a ring
at its top, where you get off. The
ride waits while it's open; Escape, M or **Back to riding** closes it. **See it on
the diorama** opens the diorama on the same spot. Scroll (or pinch, on a
trackpad or touch screen) to zoom, down to 500 m across, and drag to move it;
zoomed in, the runs are named. The buttons down its right edge zoom in and out,
centre on you and show the whole map again (+, − and 0 on the keyboard too, and
the arrow keys move it).

The big map is also a GPS, as in GTA. Hover it to see what's under the pointer,
and click or tap a run, a lift station or a service centre to make it your destination.
The quickest way there, over runs ridden downhill and lifts ridden up, is drawn
in purple on both maps: solid where you ride the snow, dashed up a lift, with a
ring where you board and where you get off, and a pin at the end (held on the mini-map's rim when
it's further off). A card under the mini-map says what to do next ("Ride 云霄峰道
830 m", "Board 5号索道") and how far and how long the rest is. On the snow,
chevrons mark the next 300 m and a column of light stands over the destination.
Wander off the route and it finds a new one from where you are; ride a different
lift and it plans on from that lift's top. It clears when you get there. Click or
tap the pin again, press Delete or **Clear route** on the big map to drop it. The
destination lasts through a reload or a trip to the diorama in the same tab.

A menu rail on the left edge links to the diorama, picks your rider (**Rider**:
male, female or the classic one; the female rider can also walk and run off the
board with F) and switches music and sound effects on and off. The game
remembers your rider and those settings between visits, so you keep the same
rider after a trip to the diorama; `?rider=male|female|classic` in the URL picks
one too. Its **Outfit & gear** and **Settings** panels are placeholders for now,
and nothing plays on the music bus yet.

Or double-click `scripts/Hemu Ski.command` (a symlink to it on the Desktop works
too). It starts the server on port 5190 and opens the game. Close the Terminal
window to stop the server.

## Diorama

`npm run dev`, then open `/diorama.html`: the whole resort as a tabletop model.
All 87 runs and 10 lifts in a 6.4 km block, cut out of the real terrain and set
on a walnut plinth. Drag to spin it, scroll to zoom, and hover a run or lift to
see its name, length and drop. The East and West service centres
(东区/西区服务大厅) stand at the foot of 1号 and 3号 gondolas; hover them too. Gondolas and chairs run on their cables, and
little riders carve down the runs and chain from one run onto the next.

Click a run, a lift, one of its stations or a service centre to pick it: it stays
highlighted, and a card says what you can do there. **Look closer** flies the
camera to it, and the main button takes you into the game there. The camera dives
at the spot through a cloud, and the game opens in that cloud and drops you out
of it:

- a **run**: at its top, pointing downhill, ready to ride it;
- a **bottom station**: beside it, to board with E (or **Board and ride up**
  to go straight up); a **top station**: on the snow beside it, facing downhill;
- a **service centre**: outside the hall, facing the gondola it boards.

The place is written into the address as `?at=<key>` (`run:<OSM id>`,
`lift:<OSM id>:bottom|top|ride` or `lodge:east|west`; see `src/destinations.js`).
It works on both pages: `/?at=run:1127891878` opens the game at the top of
Yunxiaofeng. In the game, R takes you back to that spot. The menu's diorama
button opens the diorama on it again, pulling back out of the cloud, and so does
the browser's Back button.

Opened from the game (the map's button or the menu), the diorama puts a yellow
**You** pin where you are, on an arrow pointing the way you were heading. Hover or
click it like any other place; opened from the game in the same tab, its card has
**Back to riding**, which goes back to the game where you left off. With the game
and the diorama open side by side in two windows, the pin follows you as you ride
(the game saves where you are to `localStorage` a few times a second).

It reuses the game's modules at toy proportions (oversized trees, lifts and
riders). Its data is a separate, larger bake in `public/data/diorama/`, made
with `npm run fetch-data -- diorama`.

## Map editor

`npm run dev`, then open `/editor.html`: a working view of the game's map for
reshaping it. The map is cut into 80 m tiles (10 × 10 heightfield cells).

- **Tiles** (T): click a tile or drag a box (Shift adds, Alt takes away), then
  Raise / Lower by the step (`]` / `[`), Level, Smooth, Delete (Del) or Restore.
  Height edits ease out over the Blend distance around the selection. Deleted
  tiles are holes in the game, and you can't ride into them.
- **Runs** (R): click a run, drag its points, double-click the line to add a
  point, Alt-click a point to remove it. Smooth, Bench (level side to side),
  Raise and Lower reshape the ground under the run, over its width.
- **Trees** (G): click a tree or drag a box (Shift adds, Alt takes away), then
  Remove (Del). Removed trees stay as red stubs while the tool is up; select
  them and Restore (Shift+Del) to bring them back. **Plant** (P toggles) puts a
  tree where you click, or a row where you drag, even on a run. **Forest
  density** sets the share of the forest's spots that grow a tree. The forest
  is still placed by the game's rules (clear of runs, lifts and cliffs, thinning
  toward the treeline), so it follows height and run edits; removals and
  plantings are kept on top of that.
- **Getting around**: right-drag orbits, middle-drag or Space-drag pans, the wheel
  zooms to the cursor, WASD pans, F frames the selection, Home shows the whole map.
  The Hand tool (H) pans with the left button.

⌘Z / ⇧⌘Z undo and redo. **Save** (⌘S) writes `public/data/edits/` through the dev
server, and the game loads those edits from then on (add `?original` to the URL
to ride the baked map). **Ride ▸** saves and opens the game. **Reset** deletes the
saved edits. The editor only works under `npm run dev`; a build ships whatever
edits were saved.

## Controls

| Key | Action |
| --- | --- |
| A / D (← / →) | carve heelside / toeside |
| W (↑) | tuck; push along on the flat |
| S (↓) | skid / brake |
| Space | hold and release to ollie, steer in the air to spin |
| E | board a lift at its bottom station or a service centre (Space skips the ride) |
| R | back to where you started (the top of Yunxiaofeng, or wherever the diorama sent you) |
| M | the whole map, with you on it (or click the mini-map); click it to set a GPS destination, Delete clears it, scroll / + / − zoom, drag or arrows move it |

## How it's built

- `scripts/fetch-data.mjs` bakes the world into `public/data/`:
  elevation from AWS Terrain Tiles (Terrarium, z14 for the 7.2 km play area,
  z11 for the 40 km horizon), plus pistes and lifts from OpenStreetMap via
  Overpass. Re-run with `npm run fetch-data` (it caches into `.cache/`).
  The play area is off-centre (it reaches down to the service centres), but
  coordinates stay relative to Gondola No. 6.
- The terrain is cut into tiles that are frustum-culled and drop to half
  resolution past 1.2 km. Far forest chunks are batched 4 × 4, and lift towers
  and cars are instanced.
- `src/render/toon.js` adds three flat tones, a wobbly terminator, shadow
  hatching and snow-surface strokes to `MeshLambertMaterial`, so shadows,
  fog and instancing still work.
- `src/render/post.js` draws ink lines from depth (silhouettes) and normals
  (creases), with jittered offsets for a hand-drawn line, plus paper grain.
- `src/player/rider.js` builds the snowboarder from primitives after the
  character sheet in `refs/player-turnaround.webp`. The face is a painted
  canvas texture, and the legs use two-bone IK.
- `src/gps/route.js` builds the GPS's graph from the runs (resampled every
  25 m and ridden downhill, crossing onto other runs where they meet) and the
  lifts, and finds the quickest way with Dijkstra, costed in seconds by
  difficulty and lift time. `src/gps/navigator.js` follows you along it and
  reroutes, and `src/gps/marks.js` paints it on the snow.
- `src/player/physics.js` handles slope gravity, edge grip that turns sideways
  slip back into forward speed, drag, ollies, natural take-offs on rollovers,
  tree crashes, and walls (the map edge, lift stations and service centres).

## What's approximate

- The DEM comes from ~30 m source data and is smoothed, so small bumps and
  terrain-park features aren't there.
- Forest cover is procedural, thinned to match the resort's 2023–24 trail map:
  open snowfields up high, scattered stands below a ~2,350 m treeline, cleared
  along pistes, lift lines and around the lodges. Pistes are assumed to be
  about 34 m wide.
- The two service centres are placed from OpenStreetMap (East) and the trail
  map (West, beside 3号's bottom station); the buildings are stylised.
- Lift rides are sped up to 10–22 s.

Data © OpenStreetMap contributors (ODbL). Elevation: Mapzen / AWS Terrain Tiles.
