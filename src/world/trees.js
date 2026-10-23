// Conifer forest: jittered-grid placement, cleared along pistes, lift lines and
// around buildings, thinning out toward the treeline, plus whatever the map
// editor removed or planted. Like the resort's trail map it is open country with
// clumps of trees, not a solid canopy. Instanced per 250 m chunk so frustum and
// shadow culling work, with a cheaper mesh for far chunks; far away, 4 × 4
// chunks share one mesh to keep the draw calls down. The diorama's toy forest
// is drawn from the game's trees (toyForest).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeToon } from '../render/toon.js';
import { vnoise } from './terrain.js';
import { PISTE_HALF_WIDTH, SERVICE_CENTRES, ONSEN } from './data.js';

const GREEN = new THREE.Color('#4d7560');
const GREEN_DARK = new THREE.Color('#3d6352');
const SNOW = new THREE.Color('#f6f7f2');
const TRUNK = new THREE.Color('#6b5248');
const TREE_HEIGHT = 11.8; // the near tree's tip, before scaling

function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < pos.count / 3; f++) {
    const cy = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
    fn(c, cy, f);
    for (let v = 0; v < 3; v++) c.toArray(col, (f * 3 + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function tierGeometry(radius, height, y, segs, rot, hsegs) {
  const g = new THREE.ConeGeometry(radius, height, segs, hsegs, true);
  // Jag the hem so the silhouette looks like drooping branches.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -height / 2 + 0.01) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const s = 1 + 0.12 * Math.sin(a * 5 + rot * 3);
      pos.setX(i, pos.getX(i) * s);
      pos.setZ(i, pos.getZ(i) * s);
      pos.setY(i, pos.getY(i) - 0.25 * Math.abs(Math.sin(a * 2.5 + rot)));
    }
  }
  g.rotateY(rot);
  g.translate(0, y, 0);
  return paint(g, (c, cy, f) => {
    const t = (cy - (y - height / 2)) / height; // 0 bottom … 1 top of tier
    const snowy = t > 0.6 || (t > 0.3 && f % 3 === 0);
    c.copy(snowy ? SNOW : f % 2 ? GREEN : GREEN_DARK);
  });
}

function buildTreeGeometry(lod) {
  const parts = [];
  if (!lod) {
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 3, 5, 1, true).translate(0, 1.5, 0);
    parts.push(paint(trunk, (c) => c.copy(TRUNK)));
  }
  // Far trees: two plain tiers (~12 triangles). Near trees: three jagged tiers.
  const tiers = lod ? [[2.7, 7.0, 4.6], [1.7, 5.8, 8.8]] : [[2.8, 4.6, 3.8], [2.1, 4.4, 7.0], [1.3, 3.8, 9.9]];
  tiers.forEach(([r, h, y], i) => parts.push(tierGeometry(r, h, y, lod ? 6 : 7, i * 1.3, lod ? 1 : 2)));
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  g.computeBoundingSphere();
  return g;
}

// The game's forest settings, shared with the map editor so it shows the same trees.
// The clearings are read when the forest is placed, so they follow the map
// editor's moves (see Places in data.js).
export const GAME_FOREST = {
  treeline: 2350,
  spacing: 10,
  density: 0.5,
  get clearings() {
    return [...SERVICE_CENTRES.map((c) => ({ x: c.x, z: c.z, r: 110 })), { x: ONSEN.x, z: ONSEN.z, r: ONSEN.clearing }];
  },
};

// Distance from (x, z) to the nearest lift's line, station to station.
function liftDistance(lifts) {
  const liftSegs = lifts.map((l) => [l.points[0], l.points[l.points.length - 1]]);
  return (x, z) => {
    let best = Infinity;
    for (const [a, b] of liftSegs) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz);
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
    }
    return best;
  };
}
// A tree's room: how far off a run's centreline and a lift's line it stands,
// with `clear` more for a bigger canopy.
const PISTE_ROOM = PISTE_HALF_WIDTH + 2, LIFT_ROOM = 9;

// Every spot the forest would put a tree: one jittered candidate per `spacing`
// grid cell, kept unless it's above the treeline, on a run, under a lift, on a
// cliff, in a glade or a clearing. A spot's `id` is its grid cell (row-major from
// the north-west corner), so it stays the same when other trees come and go;
// the map editor's removals refer to it. `density` is the share of grid spots
// that get a tree; `clearings` are [{ x, z, r }] circles kept free (e.g. around
// base lodges). `area` ([x0, z0, x1, z1]) limits it to the grid cells whose
// corner falls inside, for redoing part of the forest.
export function forestSpots(hf, piste, lifts, { treeline, spacing = 10, density = 0.5, clearings = [], area = null }) {
  const liftDist = liftDistance(lifts);
  const nrm = new THREE.Vector3();
  const cols = Math.ceil(hf.size / spacing);
  const lo = (v, v0) => Math.max(0, Math.ceil((v - v0) / spacing));
  const hi = (v, v0) => Math.min(cols - 1, Math.floor((v - v0) / spacing));
  const [gi0, gj0, gi1, gj1] = area ? [lo(area[0], hf.x0), lo(area[1], hf.z0), hi(area[2], hf.x0), hi(area[3], hf.z0)] : [0, 0, cols - 1, cols - 1];
  const spots = [];
  for (let gj = gj0; gj <= gj1; gj++) {
    const z = hf.z0 + gj * spacing;
    for (let gi = gi0; gi <= gi1; gi++) {
      const x = hf.x0 + gi * spacing;
      const jx = x + (hash(x, z) - 0.5) * spacing * 0.9;
      const jz = z + (hash(z + 3.3, x) - 0.5) * spacing * 0.9;
      if (!hf.inside(jx, jz, 30) || hf.holeAt(jx, jz)) continue;
      const y = hf.heightAt(jx, jz);
      const tl = treeline + (vnoise(jx * 0.006, jz * 0.006) - 0.5) * 160;
      if (y > tl) continue;
      // Sparse, stunted trees just under the line.
      const nearLine = THREE.MathUtils.smoothstep(y, tl - 120, tl);
      if (hash(jx * 1.7, jz) < nearLine * 0.85) continue;
      const pd = piste.distAt(jx, jz);
      if (pd < PISTE_ROOM + hash(jx, jz * 1.3) * 6) continue;
      if (liftDist(jx, jz) < LIFT_ROOM) continue;
      hf.normalAt(jx, jz, nrm);
      if (nrm.y < 0.78) continue; // cliffs
      if (vnoise(jx * 0.012 + 40, jz * 0.012) < 0.42) continue; // glades
      if (hash(jx + 5.1, jz * 0.7) > density) continue;
      if (clearings.some((c) => Math.hypot(jx - c.x, jz - c.z) < c.r)) continue;
      spots.push(tree(gj * cols + gi, jx, jz, (0.75 + hash(jz, jx * 2.1) * 0.55) * (1 - nearLine * 0.4)));
    }
  }
  return spots;
}

// The map editor's changes to the forest (all optional):
//   density  replaces the forest's `density`
//   removed  spot ids with no tree
//   added    planted trees, [x, z, size] (size 1 is an average tree)
// Planted trees get negative ids (-1 for added[0], -2 for added[1], ...). Returns
// the trees that stand, and the removed spots (which the editor shows, to restore).
export function applyTreeEdits(spots, hf, edits) {
  if (!edits) return { trees: spots, removed: [] };
  const gone = edits.removed instanceof Set ? edits.removed : new Set(edits.removed || []);
  const trees = [], removed = [];
  for (const t of spots) (gone.has(t.id) ? removed : trees).push(t);
  (edits.added || []).forEach(([x, z, size], k) => {
    if (hf.inside(x, z) && !hf.holeAt(x, z)) trees.push(tree(-1 - k, x, z, size));
  });
  return { trees, removed };
}

function tree(id, x, z, s) {
  return { id, x, z, s, sy: s * (0.9 + hash(x + 2, z) * 0.3), rot: hash(x, z + 9) * Math.PI * 2 };
}

// The game's trees: GAME_FOREST's spots with the map editor's `edits` (see
// applyTreeEdits), which can change its density too.
export function gameTrees(hf, piste, lifts, edits = null) {
  const spots = forestSpots(hf, piste, lifts, { ...GAME_FOREST, density: edits?.density ?? GAME_FOREST.density });
  return applyTreeEdits(spots, hf, edits).trees;
}

// The diorama's toy forest, drawn from the game's `trees`: grown `scale` times
// and thinned to at most one per `cell` metres. A toy tree stands for `per` of
// the game's (its canopy alone would cover scale² of them; more keeps the toy
// forest open), so a cell gets one as often as the game's trees in it make
// that up, and it stands on one of them: the one nearest a jittered point in
// the cell, of those its bigger canopy leaves clear of the runs, the lift lines
// and the `keepOff` boxes ({ x, z, yaw, hw, hd }, as the physics' obstacles:
// the diorama's oversized stations and halls, and whatever stands among the
// trees), with `room` metres to spare round those.
export function toyForest(trees, hf, piste, lifts, { scale, cell, per = scale * scale, keepOff = [], room = 12 }) {
  const clear = 2.8 * (scale - 1); // the canopy's reach past a normal tree's
  const liftDist = liftDistance(lifts);
  const cols = Math.ceil(hf.size / cell);
  const byCell = new Map();
  for (const t of trees) {
    const k = Math.floor((t.z - hf.z0) / cell) * cols + Math.floor((t.x - hf.x0) / cell);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(t);
  }
  const blocked = (b, x, z, r) => {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
    return Math.abs(dx * c - dz * s) < b.hw + r && Math.abs(dx * s + dz * c) < b.hd + r;
  };
  const toy = [];
  for (const [k, list] of byCell) {
    const x = hf.x0 + (k % cols) * cell, z = hf.z0 + Math.floor(k / cols) * cell;
    if (hash(x + 1.7, z + 4.1) * per >= list.length) continue;
    const jx = x + hash(x, z) * cell, jz = z + hash(z + 3.3, x) * cell;
    let best = null, bestD = Infinity;
    for (const t of list) {
      const d = Math.hypot(t.x - jx, t.z - jz);
      if (d >= bestD) continue;
      if (piste.distAt(t.x, t.z) < PISTE_ROOM + clear || liftDist(t.x, t.z) < LIFT_ROOM + clear) continue;
      const r = 2.8 * t.s * scale + room;
      if (keepOff.some((b) => blocked(b, t.x, t.z, r))) continue;
      best = t;
      bestD = d;
    }
    if (best) toy.push(tree(best.id, best.x, best.z, best.s * scale));
  }
  return toy;
}

// `trees` as gameTrees() or toyForest() give them; `chunk` and `lodDistance`
// tune batching and LOD.
export function createForest(hf, trees, { chunk = 250, lodDistance = 450 } = {}) {
  const near = buildTreeGeometry(0);
  const far = buildTreeGeometry(1);
  const mat = makeToon({ vertexColors: true }, { hatch: 1 });

  const CH = chunk;
  const chunks = new Map();
  const colliders = new Map(); // 10 m spatial hash of trunks
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  for (const t of trees) {
    q.setFromAxisAngle(up, t.rot);
    s.set(t.s, t.sy, t.s);
    p.set(t.x, hf.heightAt(t.x, t.z) - 0.3, t.z);
    m.compose(p, q, s);

    const key = `${Math.floor(t.x / CH)},${Math.floor(t.z / CH)}`;
    let list = chunks.get(key);
    if (!list) chunks.set(key, (list = []));
    list.push(m.clone());
    const ck = `${Math.floor(t.x / 10)},${Math.floor(t.z / 10)}`;
    let cl = colliders.get(ck);
    if (!cl) colliders.set(ck, (cl = []));
    cl.push({ x: t.x, z: t.z, r: 0.45 * t.s + 0.15, top: p.y + TREE_HEIGHT * t.sy });
  }
  const count = trees.length;

  const group = new THREE.Group();
  const make = (geo, mats, shadow) => {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = shadow;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  };
  const SUPER = 4; // chunks per side of a far batch
  const batches = new Map();
  for (const [key, mats] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    const center = new THREE.Vector3((cx + 0.5) * CH, 0, (cz + 0.5) * CH);
    center.y = hf.heightAt(center.x, center.z);
    const bk = `${Math.floor(cx / SUPER)},${Math.floor(cz / SUPER)}`;
    let b = batches.get(bk);
    if (!b) batches.set(bk, (b = { chunks: [], mats: [] }));
    b.chunks.push({ center, hi: make(near, mats, true), lo: make(far, mats, false) });
    b.mats.push(...mats);
  }
  for (const [bk, b] of batches) {
    const [bx, bz] = bk.split(',').map(Number);
    b.center = new THREE.Vector3((bx + 0.5) * CH * SUPER, 0, (bz + 0.5) * CH * SUPER);
    b.center.y = hf.heightAt(b.center.x, b.center.z);
    b.lo = make(far, b.mats, false);
  }
  // A batch takes over once all of its chunks are past the near-tree range.
  const batchDistance = lodDistance + CH * SUPER * 0.75;
  console.log(`forest: ${count} trees in ${chunks.size} chunks, ${batches.size} far batches`);

  return {
    group,
    count,
    farMeshes: [...batches.values()].flatMap((b) => [b.lo, ...b.chunks.map((c) => c.lo)]),
    update(camPos) {
      for (const b of batches.values()) {
        const far = b.center.distanceTo(camPos) > batchDistance;
        b.lo.visible = far;
        for (const c of b.chunks) {
          c.hi.visible = !far && c.center.distanceTo(camPos) < lodDistance;
          c.lo.visible = !far && !c.hi.visible;
        }
      }
    },
    // Nearest trunk overlap with a circle at (x, z), or null: { x, z, r, top },
    // `top` the height of its tip.
    hit(x, z, r) {
      const i0 = Math.floor(x / 10), j0 = Math.floor(z / 10);
      for (let j = j0 - 1; j <= j0 + 1; j++)
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const cl = colliders.get(`${i},${j}`);
          if (!cl) continue;
          for (const t of cl) {
            const dx = x - t.x, dz = z - t.z;
            const rr = r + t.r;
            if (dx * dx + dz * dz < rr * rr) return t;
          }
        }
      return null;
    },
  };
}

function hash(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
