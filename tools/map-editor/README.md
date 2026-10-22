# Map editor

`npm run dev`, then open `/tools/map-editor/`: a working view of the game's map for
reshaping it. The map is cut into 80 m tiles (10 × 10 heightfield cells).

Or double-click `scripts/Hemu Map Editor.command` (a symlink to it on the
Desktop works too). It opens the editor on port 5190, starting the dev server
there first if it isn't running; `scripts/Hemu Ski.command` uses the same server,
so the game and the editor can be open side by side. Close the Terminal window
that started the server to stop it.

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
- **Objects** (O): move the things placed on the map: the two service centres,
  the hot spring, the parked pickup, snowmobile and Jetson ONE, and the lift
  stations. Click one to select it and drag it to move it. Drag the round
  handle off a place's front corner to turn it (Shift snaps to 15°), or use
  Turn left / Turn right (Q / E, Shift for 1°) or type its Facing as a compass
  bearing. Dragging a lift station moves that end of the lift, so the cable and
  its towers follow; where one lift's top is the next one's bottom (1号 and 7号)
  the two move together, and Alt-drag pulls one away. **Put back** returns the
  selection to where the game first had it. The vehicles park in front of the
  East Service Centre and move with it until you move them yourself. The
  forest clears around a hall, the pool and under a lift wherever they go.
  The summit's landmarks (red, numbered as in their layout, 1 to 9 and the
  mast) are laid out round the top stations of 6号 and 7号 and move with
  those stations until you move them yourself. The game shapes the ground up
  there for them after your heights (see `src/world/summit-layout.js`), so the
  editor shows the ground before that, and the level pad under a landmark goes
  wherever you put it.
- **Widths** (L, in the top bar): a layer showing each run as wide as the game
  makes it, from the same piste field the game uses: the groomed run in its
  difficulty's colour, edged where the grooming stops (17 m each side of the
  line); a thin line 2 m further out, as far as the board rides it as piste; and
  hatched beyond that, the margin where the first trees can stand. With the
  layer up, the status bar says which run the cursor is on and how far from its
  line. Use it to shape the ground beside a run with the Runs tool. The game
  then banks the snow up beside each run, from the run's edge out to about
  27 m (`src/world/banks.js`); the editor shows the ground under the banks,
  which is what it edits.
- **Getting around**: right-drag orbits, middle-drag or Space-drag pans, the wheel
  zooms to the cursor, WASD pans, F frames the selection, Home shows the whole map.
  The Hand tool (H) pans with the left button.

⌘Z / ⇧⌘Z undo and redo. **Save** (⌘S) writes `public/data/edits/` through the dev
server, and the game loads those edits from then on (add `?original` to the URL
to ride the baked map). **Ride ▸** saves and opens the game. **Reset** deletes the
saved edits. The editor only works under `npm run dev`; a build ships whatever
edits were saved.

## What's here

The editor is a production tool: it stays out of the build, and what it hands
the game is its saves in `public/data/edits/` (`edits.json` and `detail.u16`),
which are part of the map the game ships. It reads the game's own world code
from `src/world/`, so the map it shows is the game's.

- `index.html`, `editor.css`: the page and its paper-and-ink chrome.
- `main.js`: the editor itself: tools, selection, camera and the toolbar.
- `map.js`: the map being edited (heights, deleted tiles, runs, forest changes,
  lifts and moved places), with undo, redo and saving.
- `terrain-view.js`, `runs-view.js`, `trees-view.js`, `objects-view.js`: how the
  terrain (and the widths layer), the runs and lifts, the forest, and the
  movable objects are drawn and picked.

A save writes the whole list of lifts, as it does the runs, and only the places
that moved, as `places` (id → `{ x, z, yaw }`). The places and their ids live in
`src/world/data.js` (Places), which the game and the editor share; a new kind
of building would be added there and drawn in `objects-view.js`.
- `vite-plugin.js`: the dev server's side of saving, added in `vite.config.js`.
  `PUT /__editor/edits/<file>` writes a file, `DELETE /__editor/edits` resets,
  and `/data/edits/` is served fresh from disk, left out of file watching so a
  save doesn't reload the open pages.
