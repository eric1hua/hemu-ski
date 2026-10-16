// The forest in the editor: every tree as a small cone (planted ones a lighter
// green) and, while the Trees tool is up, the removed spots as red stubs, so
// they can be picked and restored. Placement is the game's own (forestSpots),
// redone where the ground or a run changed (all of it for holes or a new
// density); removing and planting only re-apply the edits.
import * as THREE from 'three';
import { PisteField } from '../world/data.js';
import { forestSpots, applyTreeEdits, GAME_FOREST } from '../world/trees.js';

const COLORS = {
  tree: new THREE.Color('#3f6b55'),
  planted: new THREE.Color('#6fae78'),
  removed: new THREE.Color('#c4524a'),
  selected: new THREE.Color('#f0c24a'),
  hover: new THREE.Color('#ffffff'),
};
const CELL = 20; // m, picking hash
export const TREE_HEIGHT = 11.8; // m, top of a size-1 tree in the game

export class TreesView {
  constructor(hf, map, lifts) {
    this.hf = hf;
    this.map = map;
    this.lifts = lifts;
    this.group = new THREE.Group();
    this.geo = new THREE.ConeGeometry(3, TREE_HEIGHT, 6, 1).translate(0, TREE_HEIGHT / 2, 0);
    this.mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.mesh = null;
    this.items = []; // standing trees, then removed spots ({ ..., removed: true })
    this.byId = new Map(); // id → index in items
    // Picking grid: the items of cell c are cellItems[cellStart[c] .. cellStart[c + 1]).
    this.gridN = Math.ceil(hf.size / CELL);
    this.cellStart = new Int32Array(this.gridN * this.gridN + 1);
    this.cellItems = new Int32Array(0);
    this.selection = new Set();
    this.hover = null;
    this.showRemoved = false;
    this.dirty = 'all';
    this.refresh();
  }

  // Place the forest again on the next refresh: everywhere, or in `area`
  // ([x0, z0, x1, z1], metres) when only part of the map changed.
  invalidate(area) {
    if (!area || this.dirty === 'all') this.dirty = 'all';
    else if (!this.dirty) this.dirty = [...area];
    else this.dirty = [Math.min(this.dirty[0], area[0]), Math.min(this.dirty[1], area[1]), Math.max(this.dirty[2], area[2]), Math.max(this.dirty[3], area[3])];
  }
  // A run moved: redo the ground it cleared before and the ground it clears now.
  invalidateRun(ri) {
    this.piste = null;
    const [a, b] = [this.runBoxes[ri], runBox(this.map.runs[ri])];
    this.invalidate([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  }

  refresh() {
    const { hf, map } = this;
    if (map.trees.density !== this.density) this.dirty = 'all';
    if (this.dirty) {
      const piste = (this.piste ??= new PisteField(map.runs, hf.size, 4, 60, hf.center));
      const opts = { ...GAME_FOREST, density: map.trees.density };
      if (this.dirty === 'all') this.spots = forestSpots(hf, piste, this.lifts, opts);
      else {
        // Swap the spots whose grid corner is in the area (forestSpots' own rule).
        const [x0, z0, x1, z1] = this.dirty, sp = GAME_FOREST.spacing, cols = Math.ceil(hf.size / sp);
        const inside = (id) => {
          const x = hf.x0 + (id % cols) * sp, z = hf.z0 + Math.floor(id / cols) * sp;
          return x >= x0 && x <= x1 && z >= z0 && z <= z1;
        };
        this.spots = this.spots.filter((t) => !inside(t.id)).concat(forestSpots(hf, piste, this.lifts, { ...opts, area: this.dirty }));
      }
      this.density = map.trees.density;
      this.runBoxes = map.runs.map(runBox);
      this.dirty = null;
    }
    const { trees, removed } = applyTreeEdits(this.spots, hf, map.trees);
    this.standing = trees.length;
    this.planted = trees.filter((t) => t.id < 0).length;
    this.items = trees.concat(removed.map((t) => ({ ...t, removed: true })));
    this.byId.clear();
    const start = this.cellStart.fill(0), cellOf = new Int32Array(this.items.length);
    this.items.forEach((t, k) => {
      this.byId.set(t.id, k);
      cellOf[k] = this.#cell(t.x, t.z);
      start[cellOf[k] + 1]++;
    });
    for (let c = 1; c < start.length; c++) start[c] += start[c - 1];
    const fill = start.slice(0, -1);
    this.cellItems = new Int32Array(this.items.length);
    cellOf.forEach((c, k) => (this.cellItems[fill[c]++] = k));
    for (const id of this.selection) if (!this.byId.has(id)) this.selection.delete(id);
    if (this.hover !== null && !this.byId.has(this.hover)) this.hover = null;
    this.#build();
  }

  #build() {
    const n = this.items.length;
    if (!this.mesh || this.mesh.instanceMatrix.count < n) {
      if (this.mesh) { this.group.remove(this.mesh); this.mesh.dispose(); }
      this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.ceil(n * 1.25) + 64);
      this.mesh.frustumCulled = false; // one mesh over the whole map
      this.group.add(this.mesh);
    }
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    this.items.forEach((t, k) => {
      const k2 = t.removed ? 0.55 : 1;
      p.set(t.x, this.hf.heightAt(t.x, t.z) - 0.3, t.z);
      s.set(t.s * k2, t.sy * k2, t.s * k2);
      this.mesh.setMatrixAt(k, m.compose(p, q, s));
      this.#paint(k);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.#count();
  }

  #count() {
    this.mesh.count = this.showRemoved ? this.items.length : this.standing;
  }

  #paint(k) {
    const t = this.items[k];
    const c = t.id === this.hover ? COLORS.hover : this.selection.has(t.id) ? COLORS.selected : t.removed ? COLORS.removed : t.id < 0 ? COLORS.planted : COLORS.tree;
    this.mesh.setColorAt(k, c);
  }
  #repaint(ids) {
    for (const id of ids) {
      const k = this.byId.get(id);
      if (k !== undefined) this.#paint(k);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  setShowRemoved(on) {
    this.showRemoved = on;
    this.#count();
  }
  setHover(id) {
    if (id === this.hover) return;
    const old = this.hover;
    this.hover = id;
    this.#repaint([old, id]);
  }
  setSelection(ids) {
    const old = [...this.selection];
    this.selection = new Set(ids);
    this.#repaint([...old, ...this.selection]);
  }
  get(id) { return this.items[this.byId.get(id)]; }

  #cell(x, z) {
    const n = this.gridN, clamp = (v) => Math.min(n - 1, Math.max(0, Math.floor(v / CELL)));
    return clamp(z - this.hf.z0) * n + clamp(x - this.hf.x0);
  }

  // Trees (and, with removed spots showing, the spots) within r metres of (x, z).
  *near(x, z, r) {
    const n = this.gridN, { cellStart, cellItems } = this;
    const c0 = this.#cell(x - r, z - r), c1 = this.#cell(x + r, z + r);
    for (let j = Math.floor(c0 / n); j <= Math.floor(c1 / n); j++)
      for (let i = c0 % n; i <= c1 % n; i++)
        for (let q = cellStart[j * n + i]; q < cellStart[j * n + i + 1]; q++) {
          const t = this.items[cellItems[q]];
          if (!t.removed || this.showRemoved) yield t;
        }
  }

  // The tree drawn nearest the mouse (CSS px), within `radius` px of its trunk-to-tip
  // line. `ground` is the point under the mouse; a tall tree in front of it can
  // cover it, so the search reaches `reach` metres around it.
  pickScreen(mouse, camera, w, h, ground, reach, radius = 10) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    let best = null, bestD = radius;
    for (const t of this.near(ground.x, ground.z, reach)) {
      const y = this.hf.heightAt(t.x, t.z), k = t.removed ? 0.55 : 1;
      a.set(t.x, y, t.z).project(camera);
      b.set(t.x, y + TREE_HEIGHT * t.sy * k * 0.85, t.z).project(camera);
      if (a.z > 1 || b.z > 1) continue;
      const ax = (a.x + 1) * 0.5 * w, ay = (1 - a.y) * 0.5 * h, bx = (b.x + 1) * 0.5 * w, by = (1 - b.y) * 0.5 * h;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((mouse.x - ax) * dx + (mouse.y - ay) * dy) / len2));
      const d = Math.hypot(ax + dx * u - mouse.x, ay + dy * u - mouse.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  // Ids of the trees drawn inside a screen rectangle (CSS px).
  inScreenRect(camera, w, h, { x0, y0, x1, y1 }) {
    const v = new THREE.Vector3(), out = [];
    const n = this.showRemoved ? this.items.length : this.standing;
    for (let k = 0; k < n; k++) {
      const t = this.items[k];
      v.set(t.x, this.hf.heightAt(t.x, t.z) + 4, t.z).project(camera);
      if (v.z > 1) continue;
      const sx = (v.x + 1) * 0.5 * w, sy = (1 - v.y) * 0.5 * h;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) out.push(t.id);
    }
    return out;
  }
}

// A run's bounding box, padded by the most a run clears trees (half-width,
// margin, jitter) plus a tree's own wobble about its grid corner.
function runBox(run) {
  const pad = 40;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of run.points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}
