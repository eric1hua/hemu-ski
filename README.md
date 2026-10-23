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

Hidden in the trees about 145 m behind the East Service Centre is a hot spring,
after the snowy mountain springs of Zao in Japan: a ring of snow-capped boulders
full of milky jade water, with steam rising off it and a wooden spout pouring
into it out of a snowy cave rock. You can hear it from 30 m off. Walk or ride up
to its rocks and press **E** to get in: you slide down into the water and sit
back against the rocks across from the spout, shoulders just out of it. A and D
turn the camera round the pool, and E gets you out at the gap in the rocks, on
foot if you walked up. On a touch screen the button says **Soak**, then **Get
out**, and the stick turns the camera. The female rider walks in instead: she
changes into her swimsuit in a puff of steam on the snow by the gap, steps up
onto the flat stone across it and down into the water, wades over to her
seat, turns round, stretches and sits down, the camera following from her
side; about 15 s, and E gets her out at any point. Getting out, she changes
back into her ski gear. The male and classic riders have no swimsuit yet, so
they slide in as they are.

The summit round the two top stations, 6号 and 7号, has its landmarks, as
stand-ins until their models are made: a white yurt on a snow knoll behind
7号, the timber signpost whose arrows point to the four countries in sight,
three sets of seven prayer wheels on the path out along the ridge to the ovoo
and its prayer flags, a small hut at the foot of the telecoms mast, a giant
wooden photo frame you can walk through, the coffee cabin out on the shoulder,
a two-seat swing, and three orange dome pods further out on their own pads. The
ground up there is shaped for them: one terrace for both stations, the knoll,
the ridge path and the shoulder out to the pods. `?labels` shows each one's
number, as in the photos they were placed from.

The prayer wheels (转经轮) are the real thing: three racks of seven gilded
wheels, each turning on its own axle. Walk past them on foot, close alongside,
and your hand reaches out and brushes each wheel you pass, setting it turning
as fast as you walk by; it slows to a stop over about nine seconds. It's your
right hand if they're on your right, as they are going round them clockwise,
and your left if not. Stand beside one and press **E** to give it a push, your
hand sweeping across its face. They always turn clockwise, as prayer wheels
are turned. While they turn you hear the six-syllable mantra they carry, **Om
Mani Padme Hum**, chanted low by a few voices in unison, louder the more of
them turn and the nearer you are, fading as they slow. On a touch screen the
button says **Turn**.

East of the summit, in the hollow just north of the ridge 可可托海道 follows,
lies **Cloud Lake** (云湖), about 270 m by 115 m: open jade water between snowy
banks, rippling in the breeze, foam lapping at its edge. You can't ride or walk
onto it, but a **rowing boat** is drawn up at the shore nearest 可可托海道, stern
to the bank. Get in beside it and you sit facing the stern, as rowers do, an oar
in each hand: **W** rows, the boat surging on each stroke and gliding between,
and leaving rings where the blades dip and a trail of them behind; **S** backs
water; **A** and **D** turn it, on the spot if you're not rowing; **Space** holds
the oars in the water to stop. Let go and it glides on for a dozen seconds and
then drifts, rocking gently on the waves. Step out once you're at the shore (it
stays where you left it), and **R** takes it back to its spot. The run name says
云湖 while you're on the lake. It's on the mini-map, the big map and the diorama
too. The boat is a stand-in, built in code, until its Tripo model is made.

Up at the top lives **Mantou** (馒头), the resort's Old English Sheepdog, on
the snow a few metres off to the side of where you start. On its own it
potters about its spot: looks round, sniffs the snow, shakes it off its coat.
When nobody comes by for a while it sits, lies down with a yawn and curls up
asleep, nose to tail. Come within about 30 m (or 10 m, once it's asleep) and
it wakes, watches you, and trots over, tail going, to say hello with a play
bow, a bounce or a bark. Then it keeps you company: it sits by you while you
stand, follows you about at your pace, and chases after you when you ride
off, barking, until you're too fast or too far from home, when it pulls up,
barks after you and trots back to its spot. Stand beside it and press **E**
to pet it: it sits in front of you and leans up into your hand while you bend
down to it, tail sweeping the snow, and if you keep at it, it rolls over for
a belly rub. **Q** throws a snowball, the way the camera looks, overarm like
a baseball: on foot you draw your right arm back as your right foot steps back
and you turn away, then turn through and let go high out in front, following
through as the right foot comes forward (on the board, feet strapped in, only
the arm and trunk throw). It's off at the wind-up, bounding after it, leaping
to snap it out of the air if it gets under it in time, or
pouncing where it lands and digging for it, then cocking its head, puzzled,
when it's gone, and coming back to you. Take a fall nearby and it runs over
to check you're all right. You hear it bark and whine, and pant after a run.
On a touch screen the button says **Pet**, or **Throw** when it's near.

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
do where you are: **Ride up** at a lift, **Drive**, **Ride**, **Fly** or **Row**
beside a vehicle, then **Get out**, **Get off** or **Step out**, and **Skip** on the lift; the prompt
card says the same and does it when tapped. A rider who can walk gets an **On
foot** button: on foot the stick walks, all the way out runs, and **Board** takes
Ollie's place. In the pickup and on the snowmobile the stick drives, brakes and
reverses and the big button is the **Handbrake**; in the Jetson ONE the stick
flies and turns, and **Up** and **Down** climb and land; in the rowing boat the
stick rows, backs water and turns, and **Hold water** stops it. A tap skips the flight
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

## Controls

| Key | Action |
| --- | --- |
| A / D (← / →) | carve heelside / toeside |
| W (↑) | tuck; push along on the flat |
| S (↓) | skid / brake |
| Space | hold and release to ollie, steer in the air to spin |
| E | board a lift at its bottom station or a service centre (Space skips the ride); get in or out of the pickup, the Jetson ONE or the rowing boat, or on or off the snowmobile, beside it; get in or out of the hot spring; pet the dog beside it; turn a prayer wheel beside it |
| Q | throw a snowball for the dog |
| In the hot spring | A / D look around, E get out |
| R | back to where you started (the top of Yunxiaofeng, or wherever the diorama sent you) |
| In the pickup or on the snowmobile | W drive, S brake / reverse, A / D steer, Space handbrake, R back to the hall |
| In the Jetson ONE | Space take off / climb, Shift come down / land, W / S fly forward / back, A / D turn, E get out once it's down (or hovering just above the snow), R back to the hall |
| In the rowing boat | W row, S back water, A / D turn, Space hold water (stop), E step out at the shore, R back to its spot |
| M | the whole map, with you on it (or click the mini-map); click it to set a GPS destination, Delete clears it, scroll / + / − zoom, drag or arrows move it |

## What's in this repo

The game and the diorama are what ships: `index.html`, `diorama.html`, their
code in `src/` and their data and models in `public/`. GitHub Pages builds only
those two pages. Everything else makes or checks what's in them, and runs only
under `npm run dev` or Node:

- `tools/map-editor/`: the map editor, at `/tools/map-editor/`
  ([how to use it](tools/map-editor/README.md)). Its saves in
  `public/data/edits/` are the map the game ships.
- `tools/terrain/fetch-data.mjs`: bakes the real terrain, runs and lifts into
  `public/data/` (`npm run fetch-data`; see below).
- `tools/review/`: close-up review pages for the riders
  (`/tools/review/rider.html`) and the dog (`/tools/review/dog.html`), and
  one for the summit (`/tools/review/summit.html`): its landmarks seen from
  cameras fitted to the four photos they were placed from, with each photo
  laid over (from the Cowart canvas in `canvas/`, where it's there) and the
  arrows drawn on them marked, and from straight above.
- `tests/`: `npm test` checks the female rider's animation.

The 3D models in `public/models/` are made in a separate, local-only asset lab
(Tripo and Blender); the README in each model's folder says where it came from.

## How it's built

- `tools/terrain/fetch-data.mjs` bakes the world into `public/data/`:
  elevation from AWS Terrain Tiles (Terrarium, z14 for the 7.2 km play area,
  z11 for the 40 km horizon), plus pistes, lifts and lakes from OpenStreetMap
  via Overpass (OSM leaves Cloud Lake unnamed; the baker names it). Re-run
  with `npm run fetch-data` (it caches into `.cache/`).
  The play area is off-centre (it reaches down to the service centres), but
  coordinates stay relative to Gondola No. 6.
- `src/world/banks.js` banks the snow up beside the runs, as a groomer leaves
  it: the runs keep their height and the snow either side rises 1.4–2.5 m over
  6–10 m, then eases back to the ground's own height. Banks die away at a run's
  loose ends and around the lift stations, halls and hot spring. The bank is
  narrower than the bake's 8 m cells, so the game's ground is the bake
  resampled at 4 m with the banks added; the snow is painted cool in the
  hollow at a bank's foot and bright along its crest, which flat toon light
  wouldn't show.
- The terrain is cut into tiles that are frustum-culled: 4 m within 300 m of
  the camera (built as you come near), 8 m out to 1.2 km and 16 m beyond. Far
  forest chunks are batched 4 × 4, and lift towers and cars are instanced.
- `src/render/toon.js` adds three flat tones, a wobbly terminator, shadow
  hatching and snow-surface strokes to `MeshLambertMaterial`, so shadows,
  fog and instancing still work. On the runs it draws corduroy: ribs 18 cm
  apart down the run, in groomer-wide lanes with a seam between them, worn
  away in patches and ragged where the grooming stops. Each vertex carries
  where it lies on its run (across and along it, from `PisteField.coordsAt`),
  so the ribs follow the run's bends.
- `src/render/post.js` draws ink lines from depth (silhouettes) and normals
  (creases), with jittered offsets for a hand-drawn line, plus paper grain.
- `src/player/rider.js` builds the snowboarder from primitives after a
  character turnaround sheet (kept in the local asset lab). The face is a painted
  canvas texture, and the legs use two-bone IK.
- `src/gps/route.js` builds the GPS's graph from the runs (resampled every
  25 m and ridden downhill, crossing onto other runs where they meet) and the
  lifts, and finds the quickest way with Dijkstra, costed in seconds by
  difficulty and lift time. `src/gps/navigator.js` follows you along it and
  reroutes, and `src/gps/marks.js` paints it on the snow.
- `src/player/physics.js` handles slope gravity, edge grip that turns sideways
  slip back into forward speed, drag, ollies, natural take-offs on rollovers,
  tree crashes, and walls (the map edge, lift stations and service centres).
  Off the runs the snow is powder (less on the steep, rocky faces): it drags
  most at walking pace and less as the board planes up, and the edge holds a
  little less. The board rides sunk in it, to just over the ankles at speed and
  the lower calf slowing down, with snow heaped round it (`SnowCollar` in
  `src/player/fx.js`), and leaves a furrow and a plume rather than a carved line.
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
- `src/vehicle/rowboat.js` builds the rowing boat, for now a stand-in from
  simple shapes at the size and layout the Tripo model will have: a 3.4 m skiff,
  its hull lofted from sections, with thwarts, floorboards and two oars on
  pivots at the oarlocks. `waterline()` traces where the hull meets the water,
  as it sits that frame, in the middle of the planking, for the lake to cut
  out. The rider sits through the same seated pose, turned to
  face the stern, the hands on the oars' handles as the oars swing and the torso
  reaching for the catch. Its header says what swapping in the Tripo model
  takes. `src/vehicle/rowing.js` rows it: each stroke a drive (the blades in the
  water, pulling) and a recovery, each oar asked to row, ease or back water by
  W/S and A/D, with drag along the hull, the keel's grip across it, and points
  round the hull kept off the shore. It rocks on springs toward the plane of the
  lake's waves under it, the bow lifting as the rower reaches forward.

- `src/world/summit.js` builds the summit's landmarks; the prayer wheels' rack
  (`public/models/prayer-wheels/`) is shown 5.5 times its size, which puts the
  wheels' middles at the walking rider's shoulders and the eaves just over her
  head, and each wheel is re-centred on its axle as it loads.
  `src/world/prayer-wheels.js` turns them: which wheel a hand can reach and
  where on its face, each wheel's spin slowing by a share of its speed and a
  little more, and how loud that makes the mantra where you are. `main.js` puts
  the hand on them, by two-bone IK as for petting the dog, either hand.
  `src/mantra.js` chants the mantra in code, like the rest of the sound: four
  voices in unison (one an octave under) with harmonics falling away as the
  vocal folds' do, through four mouth resonances side by side that glide from
  sound to sound, a nasal one for the m's and n's, and breath for the h and the
  p's release, with a short reverb.

- `src/world/lakes.js` sets each lake's surface at the middle height of the
  ground round its edge and shapes the ground to it: a bed shelving away from
  the edge and a low bank rising from it, one straight slope across the
  waterline, so even the terrain's coarse triangles cross the surface where the
  outline says. The water is a flat sheet reaching under the bank, so the bank
  draws the shore, and each frame the boat's waterline is cut out of it, so the
  boat stays dry inside however it rocks. It's painted in the fragment shader: jade in the shallows and
  bluer in the middle, paler toward the far shore, the crests of the same waves
  the boat rocks on (`waveHeight()`) as broken lines, glints of sun, and foam
  lapping at the edge, measured from the outline itself. The shore is a wall for
  the rider, the pickup and the snowmobile; the Jetson reads the water as
  ground. `Ripples` are the rings spreading from the oars and the boat's wake.
- `src/world/onsen.js` builds the hot spring from two Tripo models
  (`public/models/onsen/`): the ring of boulders and the cave rock. It draws the
  water, the stream and the steam in code. The water is a disc out to where the
  rocks stand above its surface, found from the ring's own shape at load. It
  has the toon material's flat tones and shadows, and pale streaks that drift
  away from where the stream lands, crossfaded between two phases so they never
  stretch out. Rings spread from the landing and round a soaking rider, and
  foam rims the shore. It's opaque, as Zao's milky sulphur water is, so the ink
  pass outlines its shore against the rocks. The stream is a tube along the
  trough and off its lip, falling as a thrown thing does, with white streaks
  racing down it. The steam is camera-facing quads with no normals, so the ink
  pass leaves them out. They rise, drift on the wind and fade in the vertex
  shader, and thin out close to the camera so they never white out the view.
  Soaking reuses the snowmobile's seated pose: hips on the pool floor, legs out
  along it, hands just under the surface.
- A rider can have other sets of clothes (`outfits` in `RIDER_MODELS`,
  `src/player/rider-model.js`); the hot spring uses `swim`. Tripo can't take
  clothes off a model, so each outfit is a whole second model on the same
  Mixamo skeleton, posed by the same rig. Changing only swaps which model is
  shown. An outfit is sized by its skeleton, not its height: its trunk (Hips
  joint to Head joint) is matched to the rider's own, because the female
  rider's 1.8 m includes her cat-ear beanie and boots. It loads when you come
  near the pool. Getting in or out, a puff of steam goes up round the rider,
  following them for half a second as they slide. They change 0.15 s in, once
  it's thick.
- The female rider's swimsuit comes with three Tripo clips for getting in,
  named by role in `RIDER_MODELS` (`clips`): `ledge` (step up and down again),
  `wade` (a walk) and `sitDown` (stretch, squat, sit with legs out). The rider
  plays them in an `act` mode, at a time main.js sets each frame rather than
  one the mixer runs on, so the change of clothes in the puff carries on from
  the same frame; any model on the Mixamo skeleton can play any of them. The
  clips were made in place on flat ground, so main.js moves the root along the
  way in, measured off the ring (`onsen.way`): from the snow, onto the flat
  stone (0.7 m up) and down onto the pool floor. It lifts or lowers the root by
  however much the real steps differ from the clip's, in step with how far the
  clip has raised her hips, and leaves the stone before the clip's first step
  down. Wading follows the pool floor under her (`onsen.floorAt`). She sits
  where she stands, sinking until her shoulders are just out of the water,
  then fades into the seated soaking pose. There's no clip for undressing; the
  puff of steam covers the change.

- `src/dog/` is the dog. The asset lab exports it from Blender
  (`public/models/dog/`, see its README): the Tripo mesh on a plain 35-bone
  skeleton built from its Rigify rig's deform bones. It has no clips: it's
  posed in code every frame. `rig.js` turns the bones to a pose: the hips
  placed and turned, the spine's bend shared out along it, the neck and head
  sharing a turn toward where it looks, kept upright, the jaw, tongue and a
  tail that lifts and wags with each bone lagging the last, and each leg
  reaching its paw with two-bone IK, the joint bending the way it does at
  rest. `body.js` blends postures (standing, sitting, lying down, curled up
  asleep, flopped on its side, belly up, the play bow, rearing up), a gait
  whose stride, timing and footfalls follow its speed and turning (a walk,
  then a trot from about 1.4 m/s, a gallop from about 4.5, its spine bunching
  and stretching), with each paw sliding back under the body as fast as the
  body goes over it while it's down, so it doesn't skate, and what plays over
  the top: breathing, panting, sniffing, digging, leaning into a hand,
  squirming, a cocked head, barking, yawning, sneezing, shaking off snow and
  leaping. Paws stand on the snow under them, and the body pitches with
  most of the slope. `dog.js` decides what it does (a state for each of the
  above) and steers it round trees, buildings and holes; the rider's hand
  reaches its head by two-bone IK, on the board (crouched) or on foot (bent
  over, the walk clip giving way to it).
- `src/player/throw.js` is the overarm throw, as key poses eased from one to
  the next: on foot (RiderModel) the hips sink, shift and turn, the spine turns
  on round and leans, the head turns back to keep its eyes on the target, the
  legs step by IK (the right foot back and turned out, then through), and both
  hands go where the keys put them from their shoulders by IK, the throwing
  hand closed on the ball until it lets go; on the board (Rider) the trunk
  twists and the arm throws over the carving pose. The snowball sits in the
  hand and leaves from wherever the hand is at the release.

## What's approximate

- The DEM comes from ~30 m source data and is smoothed, so small bumps and
  terrain-park features aren't there.
- Forest cover is procedural, thinned to match the resort's 2023–24 trail map:
  open snowfields up high, scattered stands below a ~2,350 m treeline, cleared
  along pistes, lift lines and around the lodges. Pistes are assumed to be
  about 34 m wide, all of them groomed, and the banks beside them are made up,
  not measured.
- The two service centres are placed from OpenStreetMap (East) and the trail
  map (West, beside 3号's bottom station); the buildings are stylised.
- Lift rides are sped up to 10–22 s.
- The dog's moves are made in code, not keyframed, so they're simpler than
  an animator's: its ears, eyelids and lips don't move (they have no weights
  in the rig), and its fur stretches a little at the hips when it sits or lies
  down. It's 0.6 m at the shoulder, about right for its breed.
- The Jetson ONE is scaled to 3.1 m (a real one is about 2.5 m) so the riders'
  big heads fit under its roll cage. It's much faster than the real one
  (180 km/h against 102, and it climbs at 15 m/s), flies as long as you like, and its
  rotors turn at a speed the eye can follow rather than thousands of rpm.

Data © OpenStreetMap contributors (ODbL). Elevation: Mapzen / AWS Terrain Tiles.
