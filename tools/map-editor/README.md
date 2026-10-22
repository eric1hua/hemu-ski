# Map editor

`npm run dev`, then open `/tools/map-editor/`: a working view of the game's map for
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

## What's here

The editor is a production tool: it stays out of the build, and what it hands
the game is its saves in `public/data/edits/` (`edits.json` and `detail.u16`),
which are part of the map the game ships. It reads the game's own world code
from `src/world/`, so the map it shows is the game's.

- `index.html`, `editor.css`: the page and its paper-and-ink chrome.
- `main.js`: the editor itself: tools, selection, camera and the toolbar.
- `map.js`: the map being edited (heights, deleted tiles, runs, forest changes),
  with undo, redo and saving.
- `terrain-view.js`, `runs-view.js`, `trees-view.js`: how the terrain, the runs
  and lifts, and the forest are drawn and picked.
- `vite-plugin.js`: the dev server's side of saving, added in `vite.config.js`.
  `PUT /__editor/edits/<file>` writes a file, `DELETE /__editor/edits` resets,
  and `/data/edits/` is served fresh from disk, left out of file watching so a
  save doesn't reload the open pages.
