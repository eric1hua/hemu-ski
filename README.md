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

A red pickup and an orange snowmobile are parked in front of the East Service
Centre, for now: the pickup to the left of the entrance, the snowmobile to the
right. Any rider can take either: skate or walk up to one and press **E** to get
in (or on), and E again to get out at the driver's side (on foot, if you walked
up). W drives, S brakes and then reverses, A and D steer, and Space is the
handbrake, which lets the tail out. R takes it back to its spot by the hall.
The pickup is a 4×4 on snow, so it won't climb what's too steep, slides on a
slope too steep to hold, runs wide in a fast turn and bounces off trees and
buildings. The snowmobile has a far bigger engine: it pulls away as hard as its
track can grip, reaches 180 km/h in about 10 s on the flat and tops out at
200 km/h. It climbs steeper snow on its track, floats on the powder and brakes
poorly, so it takes about 200 m to stop from flat out. In the pickup you're out of sight
in the cab; on the snowmobile you sit on it, feet on the running boards and
hands on the grips, and lean into the turns. Both leave tracks (the snowmobile
its track and two ski lines), and the mini-map shows where you left them. A
reload parks them by the hall again.

A Jetson ONE, a one-person electric aircraft, stands out on the snow in front of
the hall, beyond the other two. Skate or walk up to it and press **E** to climb
in: you sit in its seat, in sight inside the roll cage with a hand on each
stick, while its eight rotors spin up. **Space** lifts off and climbs at
15 m/s, and **Shift** comes down at 10 m/s; in between it holds its height.
It's far more powerful than the real one, which is held to 102 km/h: W tilts it
forward and it reaches 100 km/h in about 3 s and its 180 km/h limit in about 7,
S brakes hard and then backs it off, and when you let go it levels out and
comes to a hover within about 3 s, even from flat out. A and D turn it: on the
spot at a hover, and banking into wider turns at speed, coming round in about
150 m flat out. Low over the snow it climbs by itself to clear the ground over
the next three seconds ahead (by more the faster it goes: over the treetops
flat out) unless you're coming down, but slower and below their tops the trees,
lift stations and halls are in the way, and it bounces off them. Hold Shift to land:
it slows in the last few metres and settles on its skids. E gets you out once it's
down, or hovering just above the snow at a crawl (it sets down first); any
higher and it tells you to land first. R takes it back to its spot by the hall.
At a hover the camera hangs off to its left, where you can see the pilot past
the seat back, and it swings in behind as you speed up, keeping close even at
full speed. The sticks move with
the controls: the right one with W, S, A and D, the left one forward to climb
and back to come down, and the pilot's hands go with them.

A menu rail on the left edge links to the diorama, takes you back to the start
(R), picks your rider (**Rider**:
male, female or the classic one; the female rider can also walk and run off the
board with F) and switches music and sound effects on and off. The game
remembers your rider and those settings between visits, so you keep the same
rider after a trip to the diorama; `?rider=male|female|classic` in the URL picks
one too. Its **Outfit & gear** and **Settings** panels are placeholders for now,
and nothing plays on the music bus yet.

On a phone or tablet the game plays by touch (`src/touch.js`). Put a thumb down
anywhere low on the left and drag: a stick appears under it, and sideways
carves (by how far you push), up tucks and down skids. Hold **Ollie**, bottom
right, and let go to jump. A button above it appears when there's something to
do where you are: **Ride up** at a lift, **Drive**, **Ride** or **Fly** beside a
vehicle, then **Get out** or **Get off**, and **Skip** on the lift; the prompt
card says the same and does it when tapped. A rider who can walk gets an **On
foot** button: on foot the stick walks, all the way out runs, and **Board** takes
Ollie's place. In the pickup and on the snowmobile the stick drives, brakes and
reverses and the big button is the **Handbrake**; in the Jetson ONE the stick
flies and turns, and **Up** and **Down** climb and land. A tap skips the flight
down from the title and the drop out of the cloud. The HUD gathers at the top,
clear of the notch and the thumbs, and the menu folds behind one button in the
corner. Held upright, the camera sits further back and higher, with a wider
lens, so you see the run ahead above you. Touch mode starts on a touch screen or
at the first touch, and a key press or a mouse click goes back to the keys.

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

On a touch screen, one finger spins the table, a pinch zooms and two fingers
move it about (WASD flying's job). A tap picks a place straight away, with twice
a mouse's reach, and a double tap flies closer to that spot. On a phone the key
sits at the top and the buttons along the bottom, and the first visit shows a
card with these gestures.

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
| E | board a lift at its bottom station or a service centre (Space skips the ride); get in or out of the pickup or the Jetson ONE, or on or off the snowmobile, beside it |
| R | back to where you started (the top of Yunxiaofeng, or wherever the diorama sent you) |
| In the pickup or on the snowmobile | W drive, S brake / reverse, A / D steer, Space handbrake, R back to the hall |
| In the Jetson ONE | Space take off / climb, Shift come down / land, W / S fly forward / back, A / D turn, E get out once it's down (or hovering just above the snow), R back to the hall |
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
- `src/vehicle/truck.js` loads the pickup (`public/models/truck/`, one Tripo
  mesh) and splits its tyres and rims out of it by connected piece, so the
  wheels roll and the front ones steer. `src/vehicle/snowmobile.js` loads the
  snowmobile (`public/models/snowmobile/`, also one Tripo mesh, in one piece) and
  cuts its skis out by place, so they steer. `src/vehicle/physics.js` drives
  both: a bicycle model whose engine, brakes and turning all share the grip on
  snow, with the body set on the plane under its four corners, and a handling
  preset for each.
- `src/vehicle/jetson.js` loads the Jetson ONE (`public/models/jetson/`, a Tripo
  model in 37 parts). Its eight propellers and two sticks are parts of their
  own: each propeller spins about its hub, the two at a corner turning opposite
  ways, with a faint blur disc that thickens as they spool up, and the sticks
  lean about their feet; the rest is merged into one mesh.
  `src/vehicle/flight.js` flies it: its flight controller leans it toward the
  speed you ask for (the lean is its thrust sideways), banks it against any
  slide, holds its height, keeps it clear of the snow ahead and sets it on the
  plane under its skids when it lands. The trees, halls, stations and parked
  vehicles carry their height (`top`), so it flies over what it clears.
- On the snowmobile the rider sits through the same rig as on the board: the
  hips go on the seat, and the torso folds forward until the hands can reach
  the grips. Two-bone IK puts the feet on the running boards (knees out round the
  seat) and the hands on the grips (elbows out and down), and the fingers curl
  round them. Getting on or off, the rider slides from where they stood while
  the pose blends from standing to sitting. In the Jetson the same pose puts the
  hips on its cushion, the legs down the footwell under the nose and the hands on
  the sticks' handles, which follow the sticks as they lean.

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
- The Jetson ONE is scaled to 3.1 m (a real one is about 2.5 m) so the riders'
  big heads fit under its roll cage. It's much faster than the real one
  (180 km/h against 102, and it climbs at 15 m/s), flies as long as you like, and its
  rotors turn at a speed the eye can follow rather than thousands of rpm.

Data © OpenStreetMap contributors (ODbL). Elevation: Mapzen / AWS Terrain Tiles.
