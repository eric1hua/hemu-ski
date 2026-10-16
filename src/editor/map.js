// The map being edited: the detail heightfield (changed in place), its deleted
// tiles, the run centrelines and the changes to the forest, with undo/redo and
// saving. The view listens
// through `onChange` and redraws whatever a change touched.
import { encodeHeights, EDITS_DIR } from '../world/data.js';
import { GAME_FOREST } from '../world/trees.js';

const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class EditMap {
  constructor(world) {
    this.hf = world.detail;
    this.meta = world.meta;
    this.runs = world.meta.runs;
    // Forest changes, as the game reads them (see applyTreeEdits in world/trees.js).
    const t = world.edits?.trees;
    this.trees = { density: t?.density ?? GAME_FOREST.density, removed: new Set(t?.removed || []), added: (t?.added || []).map((a) => [...a]) };
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  #emit(change) {
    for (const fn of this.listeners) fn(change);
  }

  // ---------- Undo ----------
  #push(cmd) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
    this.dirty = true;
    this.#emit({ ...cmd.change, label: cmd.label });
  }
  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.undo();
    this.redoStack.push(cmd);
    this.dirty = true;
    this.#emit({ ...cmd.change, label: `Undo ${cmd.label}` });
    return cmd.label;
  }
  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.redo();
    this.undoStack.push(cmd);
    this.dirty = true;
    this.#emit({ ...cmd.change, label: `Redo ${cmd.label}` });
    return cmd.label;
  }

  // ---------- Tiles ----------
  // Vertex range [i0..i1] × [j0..j1] that a tile covers.
  tileVerts(t) {
    const { tiles, tileCells, cells } = this.hf;
    const ti = t % tiles, tj = Math.floor(t / tiles);
    return { i0: ti * tileCells, j0: tj * tileCells, i1: Math.min(cells, (ti + 1) * tileCells), j1: Math.min(cells, (tj + 1) * tileCells) };
  }
  tileHeight(t) {
    const { i0, j0, i1, j1 } = this.tileVerts(t);
    const { h, verts } = this.hf;
    let s = 0, n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { s += h[j * verts + i]; n++; }
    return s / n;
  }

  setHoles(tiles, value) {
    const holes = this.hf.holes;
    const list = [...tiles].filter((t) => holes[t] !== value);
    if (!list.length) return 0;
    const apply = (v) => {
      for (const t of list) holes[t] = v;
      this.hf.hasHoles = holes.includes(1);
    };
    apply(value);
    this.#push({
      label: value ? `Delete ${list.length} tile${list.length > 1 ? 's' : ''}` : `Restore ${list.length} tile${list.length > 1 ? 's' : ''}`,
      change: { holes: true },
      undo: () => apply(value ? 0 : 1),
      redo: () => apply(value),
    });
    return list.length;
  }

  // Per-vertex weights: 1 on the selected tiles, easing to 0 over `blend` metres
  // around them, so a raised tile becomes a mound rather than a box.
  tileWeights(tiles, blend) {
    const hf = this.hf;
    const pad = Math.ceil(blend / hf.step);
    let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
    const rects = [...tiles].map((t) => {
      const r = this.tileVerts(t);
      i0 = Math.min(i0, r.i0); j0 = Math.min(j0, r.j0); i1 = Math.max(i1, r.i1); j1 = Math.max(j1, r.j1);
      return r;
    });
    const R = this.#region(i0 - pad, j0 - pad, i1 + pad, j1 + pad);
    // Each rect stamps its own neighbourhood; a vertex keeps its best weight.
    for (const r of rects) {
      const a0 = Math.max(R.i0, r.i0 - pad), a1 = Math.min(R.i1, r.i1 + pad);
      const b0 = Math.max(R.j0, r.j0 - pad), b1 = Math.min(R.j1, r.j1 + pad);
      for (let j = b0; j <= b1; j++) {
        const dz = Math.max(r.j0 - j, 0, j - r.j1);
        for (let i = a0; i <= a1; i++) {
          const dx = Math.max(r.i0 - i, 0, i - r.i1);
          const d = Math.hypot(dx, dz) * hf.step;
          const w = d === 0 ? 1 : blend > 0 ? smoothstep(1 - d / blend) : 0;
          const k = (j - R.j0) * R.w + (i - R.i0);
          if (w > R.weight[k]) R.weight[k] = w;
        }
      }
    }
    return R;
  }

  #region(i0, j0, i1, j1) {
    const c = this.hf.cells;
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(c, i1); j1 = Math.min(c, j1);
    const w = i1 - i0 + 1, h = j1 - j0 + 1;
    return { i0, j0, i1, j1, w, h, weight: new Float32Array(w * h) };
  }

  // Runs `target(i, j, h, k)` for every weighted vertex of region R and eases each
  // height toward it by its weight; one undo step.
  #editHeights(R, label, target) {
    const { h, verts } = this.hf;
    const before = new Float32Array(R.w * R.h);
    const after = new Float32Array(R.w * R.h);
    for (let j = 0; j < R.h; j++)
      for (let i = 0; i < R.w; i++) {
        const k = j * R.w + i, v = (R.j0 + j) * verts + R.i0 + i;
        before[k] = h[v];
        const w = R.weight[k];
        after[k] = w > 0 ? h[v] + (target(R.i0 + i, R.j0 + j, h[v], k) - h[v]) * w : h[v];
      }
    const write = (src) => {
      for (let j = 0; j < R.h; j++) h.set(src.subarray(j * R.w, (j + 1) * R.w), (R.j0 + j) * verts + R.i0);
    };
    write(after);
    const region = { i0: R.i0, j0: R.j0, i1: R.i1, j1: R.j1 };
    this.#push({ label, change: { heights: region }, undo: () => write(before), redo: () => write(after) });
  }

  raiseTiles(tiles, dh, blend) {
    if (!tiles.size) return;
    this.#editHeights(this.tileWeights(tiles, blend), `${dh > 0 ? 'Raise' : 'Lower'} ${Math.abs(dh)} m`, (i, j, h) => h + dh);
  }

  // Flatten to the average height of the selection.
  levelTiles(tiles, blend) {
    if (!tiles.size) return;
    let s = 0;
    for (const t of tiles) s += this.tileHeight(t);
    const level = s / tiles.size;
    this.#editHeights(this.tileWeights(tiles, blend), `Level to ${Math.round(level)} m`, () => level);
  }

  smoothTiles(tiles, blend) {
    if (!tiles.size) return;
    const R = this.tileWeights(tiles, blend);
    this.#editHeights(R, 'Smooth', this.#blurred(R, 3));
  }

  // Box-blurred heights over region R (radius in cells), as a target function.
  #blurred(R, radius) {
    const { h, verts, cells } = this.hf;
    const out = new Float32Array(R.w * R.h);
    for (let j = 0; j < R.h; j++)
      for (let i = 0; i < R.w; i++) {
        let s = 0, n = 0;
        const ci = R.i0 + i, cj = R.j0 + j;
        for (let b = Math.max(0, cj - radius); b <= Math.min(cells, cj + radius); b++)
          for (let a = Math.max(0, ci - radius); a <= Math.min(cells, ci + radius); a++) { s += h[b * verts + a]; n++; }
        out[j * R.w + i] = s / n;
      }
    return (i, j, hh, k) => out[k];
  }

  // ---------- Runs ----------
  // Weights along a run's corridor (its piste half-width, then `blend` metres of
  // easing), plus the nearest centreline point of each vertex.
  #runCorridor(run, halfWidth, blend) {
    const hf = this.hf, p = run.points, reach = halfWidth + blend;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of p) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const toI = (x) => (x - hf.x0) / hf.step, toJ = (z) => (z - hf.z0) / hf.step;
    const R = this.#region(Math.floor(toI(x0 - reach)), Math.floor(toJ(z0 - reach)), Math.ceil(toI(x1 + reach)), Math.ceil(toJ(z1 + reach)));
    const dist = new Float32Array(R.w * R.h).fill(Infinity);
    const near = new Float32Array(R.w * R.h * 2);
    for (let s = 0; s < p.length - 1; s++) {
      const a = p[s], b = p[s + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz || 1;
      const a0 = Math.max(R.i0, Math.floor(toI(Math.min(a[0], b[0]) - reach))), a1 = Math.min(R.i1, Math.ceil(toI(Math.max(a[0], b[0]) + reach)));
      const b0 = Math.max(R.j0, Math.floor(toJ(Math.min(a[1], b[1]) - reach))), b1 = Math.min(R.j1, Math.ceil(toJ(Math.max(a[1], b[1]) + reach)));
      for (let j = b0; j <= b1; j++) {
        const z = hf.z0 + j * hf.step;
        for (let i = a0; i <= a1; i++) {
          const x = hf.x0 + i * hf.step;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
          const cx = a[0] + dx * t, cz = a[1] + dz * t;
          const d = Math.hypot(cx - x, cz - z);
          const k = (j - R.j0) * R.w + (i - R.i0);
          if (d < dist[k]) { dist[k] = d; near[k * 2] = cx; near[k * 2 + 1] = cz; }
        }
      }
    }
    for (let k = 0; k < dist.length; k++)
      R.weight[k] = dist[k] <= halfWidth ? 1 : blend > 0 ? smoothstep(1 - (dist[k] - halfWidth) / blend) : 0;
    R.near = near;
    return R;
  }

  // Reshape the ground under a run. `mode`: 'smooth' takes out bumps, 'bench'
  // levels it side to side (to its centreline height), 'raise' shifts it by dh.
  groomRun(ri, mode, { halfWidth, blend, dh = 0 }) {
    const run = this.runs[ri];
    const R = this.#runCorridor(run, halfWidth, blend);
    const name = run.name || 'run';
    if (mode === 'smooth') return this.#editHeights(R, `Smooth ${name}`, this.#blurred(R, 3));
    if (mode === 'raise') return this.#editHeights(R, `${dh > 0 ? 'Raise' : 'Lower'} ${name} ${Math.abs(dh)} m`, (i, j, h) => h + dh);
    // Centreline heights come from the ground before this edit.
    const centre = new Float32Array(R.w * R.h);
    for (let k = 0; k < centre.length; k++) if (R.weight[k] > 0) centre[k] = this.hf.heightAt(R.near[k * 2], R.near[k * 2 + 1]);
    this.#editHeights(R, `Bench ${name}`, (i, j, h, k) => centre[k]);
  }

  // Run point edits happen live (dragging); commit one undo step afterwards with
  // the points as they were before.
  commitRun(ri, before, label) {
    const run = this.runs[ri];
    const after = run.points.map((p) => [...p]);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const set = (pts) => { run.points = pts.map((p) => [...p]); };
    this.#push({ label, change: { run: ri }, undo: () => set(before), redo: () => set(after) });
  }

  // ---------- Trees ----------
  #treeState() {
    const t = this.trees;
    return { density: t.density, removed: [...t.removed], added: t.added.map((a) => [...a]) };
  }
  #setTrees(snap) {
    const t = this.trees;
    t.density = snap.density;
    t.removed = new Set(snap.removed);
    t.added = snap.added.map((a) => [...a]);
  }
  // One undo step for `edit(trees)`; `before` is passed when the change already
  // happened live (planting by dragging).
  editTrees(label, edit, before = this.#treeState()) {
    edit?.(this.trees);
    const after = this.#treeState();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.#push({ label, change: { trees: true }, undo: () => this.#setTrees(before), redo: () => this.#setTrees(after) });
  }
  treeSnapshot() { return this.#treeState(); }

  // Take trees out by id: forest spots are marked removed, planted ones go away.
  removeTrees(ids) {
    const spots = ids.filter((id) => id >= 0 && !this.trees.removed.has(id));
    const planted = new Set(ids.filter((id) => id < 0).map((id) => -1 - id));
    const n = spots.length + planted.size;
    if (!n) return 0;
    this.editTrees(`Remove ${n} tree${n > 1 ? 's' : ''}`, (t) => {
      for (const id of spots) t.removed.add(id);
      t.added = t.added.filter((_, k) => !planted.has(k));
    });
    return n;
  }
  restoreTrees(ids) {
    const list = ids.filter((id) => this.trees.removed.has(id));
    if (!list.length) return 0;
    this.editTrees(`Restore ${list.length} tree${list.length > 1 ? 's' : ''}`, (t) => list.forEach((id) => t.removed.delete(id)));
    return list.length;
  }
  setTreeDensity(d) {
    d = Math.max(0, Math.min(1, d));
    if (d === this.trees.density) return;
    this.editTrees(`Forest density ${Math.round(d * 100)}%`, (t) => (t.density = d));
  }

  // ---------- Saving ----------
  async save() {
    const hf = this.hf;
    const { data, min, max } = encodeHeights(hf.h);
    const holes = [];
    hf.holes.forEach((v, t) => v && holes.push(t));
    const edits = {
      version: 1,
      savedAt: new Date().toISOString(),
      detail: { file: 'detail.u16', size: hf.size, cells: hf.cells, center: hf.center, min, max },
      tileCells: hf.tileCells,
      holes,
      runs: this.runs.map((r) => ({ ...r, points: r.points.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]) })),
      trees: {
        density: this.trees.density,
        removed: [...this.trees.removed].sort((a, b) => a - b),
        added: this.trees.added.map(([x, z, s]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(s * 100) / 100]),
      },
    };
    // Heights first: edits.json is what tells the game to use them.
    await put('detail.u16', data.buffer);
    await put('edits.json', JSON.stringify(edits));
    this.dirty = false;
    return edits;
  }

  static async discardSaved() {
    const r = await fetch('/__editor/' + EDITS_DIR.slice(0, -1), { method: 'DELETE' });
    if (!r.ok) throw new Error(`Couldn't remove the saved edits (${r.status})`);
  }
}

async function put(name, body) {
  const r = await fetch('/__editor/' + EDITS_DIR + name, { method: 'PUT', body });
  if (!r.ok) throw new Error(`Saving ${name} failed (${r.status}). Is this the Vite dev server?`);
}
