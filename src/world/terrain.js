import * as THREE from 'three';
import { makeToon } from '../render/toon.js';
import { PISTE_HALF_WIDTH } from './data.js';

const C = {
  snow: new THREE.Color('#fbfaf4'),
  snowShade: new THREE.Color('#eef1ec'),
  groomed: new THREE.Color('#e6eef0'),
  hollow: new THREE.Color('#cbdce2'),
  crest: new THREE.Color('#ffffff'),
  rock: new THREE.Color('#8f8c86'),
  rockDark: new THREE.Color('#6f7472'),
  forest: new THREE.Color('#4f6f5e'),
  forestDark: new THREE.Color('#3e5a4f'),
};

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a * (1 - ux) + b * ux) * (1 - uz) + (c * (1 - ux) + d * ux) * uz;
}
export { vnoise };

function gridGeometry(hf, yOffset) {
  const { verts, size } = hf;
  const pos = new Float32Array(verts * verts * 3);
  for (let j = 0; j < verts; j++)
    for (let i = 0; i < verts; i++) {
      const k = j * verts + i;
      const x = hf.x0 + (i / hf.cells) * size, z = hf.z0 + (j / hf.cells) * size;
      pos[k * 3] = x;
      pos[k * 3 + 1] = hf.h[k] + (yOffset ? yOffset(x, z) : 0);
      pos[k * 3 + 2] = z;
    }
  const idx = new Uint32Array(hf.cells * hf.cells * 6);
  let t = 0;
  for (let j = 0; j < hf.cells; j++)
    for (let i = 0; i < hf.cells; i++) {
      if (hf.cellIsHole(i, j)) continue; // tiles deleted in the map editor
      const a = j * verts + i, b = a + 1, c = a + verts, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, t), 1));
  g.computeVertexNormals();
  return g;
}

// Returns a group: the grid cut into `tiles` × `tiles` meshes (so the parts
// out of view get frustum-culled), plus the edge skirt. With `lodDistance`, tiles
// further than that use a mesh at half resolution. With `nearDistance` as well,
// only the tiles within it get the grid's full resolution, built as you come
// near and dropped once you're well past (the rest are at half resolution, and a
// quarter past lodDistance). Call `group.update(cameraPos)`. With `corduroy`, the
// vertices carry where they lie on the runs (aPiste) for the groomed ribs.
export function createDetailTerrain(hf, piste, treeline, { skirt = true, tiles = 1, lodDistance = 0, nearDistance = 0, corduroy = false } = {}) {
  const strides = nearDistance ? [1, 2, 4] : lodDistance ? [1, 2] : [1];
  const sample = vertexSampler(hf, piste, treeline, corduroy);
  const mat = makeToon({ vertexColors: true }, { hatch: 1, snow: 1, piste: corduroy ? 1 : 0 });
  const group = new THREE.Group();
  const mesh = (geo) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // Coarser meshes hang a short skirt off their edges, to hide the cracks where
  // they meet a finer neighbour.
  const build = (tile, lv) => mesh(tileGeometry(hf, sample, tile.range, strides[lv], lv > 0));
  const per = Math.ceil(hf.cells / tiles), list = [];
  for (let tj = 0; tj < tiles; tj++)
    for (let ti = 0; ti < tiles; ti++) {
      const i0 = ti * per, i1 = Math.min(hf.cells, i0 + per);
      const j0 = tj * per, j1 = Math.min(hf.cells, j0 + per);
      if (i0 >= i1 || j0 >= j1) continue;
      const tile = { range: [i0, j0, i1, j1], meshes: [] };
      strides.forEach((_, lv) => { if (!(lv === 0 && nearDistance)) tile.meshes[lv] = build(tile, lv); });
      const geo = tile.meshes.find(Boolean).geometry;
      geo.computeBoundingBox();
      tile.box = geo.boundingBox;
      list.push(tile);
    }
  if (skirt) group.add(new THREE.Mesh(skirtGeometry(hf, sample), mat));
  const levelAt = (d) => (strides.length === 1 ? 0 : d > lodDistance ? strides.length - 1 : nearDistance && d > nearDistance ? 1 : 0);
  group.update = (camPos) => {
    // One full-resolution tile is built per update, the nearest one wanted.
    let want = null, wantD = Infinity;
    for (const t of list) {
      const d = t.box.distanceToPoint(camPos);
      let lv = levelAt(d);
      if (!t.meshes[lv]) {
        if (d < wantD) { want = t; wantD = d; }
        lv = 1;
      }
      t.meshes.forEach((m, k) => m && (m.visible = k === lv));
      if (nearDistance && t.meshes[0] && d > nearDistance * 1.5) {
        group.remove(t.meshes[0]);
        t.meshes[0].geometry.dispose();
        t.meshes[0] = undefined;
      }
    }
    if (want) {
      want.meshes[0] = build(want, 0);
      want.meshes[1].visible = false;
    }
  };
  if (lodDistance) group.update(new THREE.Vector3(Infinity, 0, 0));
  return group;
}

// Writes grid vertex (i, j) of `hf` into slot k of a tile's arrays: its place,
// its normal (from the heights `s` vertices either side, the tile's own spacing),
// the snow's color, and with `corduroy` where it lies on the runs.
function vertexSampler(hf, piste, treeline, corduroy) {
  const { h, verts: v, cells, step } = hf;
  const c = new THREE.Color(), at = {};
  const sample = (i, j, s, k, pos, nrm, col, pst) => {
    const x = hf.x0 + i * step, y = h[j * v + i], z = hf.z0 + j * step;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const il = Math.max(0, i - s), ir = Math.min(cells, i + s), jd = Math.max(0, j - s), ju = Math.min(cells, j + s);
    const gx = (h[j * v + il] - h[j * v + ir]) / ((ir - il) * step), gz = (h[jd * v + i] - h[ju * v + i]) / ((ju - jd) * step);
    const ny = 1 / Math.hypot(gx, 1, gz);
    nrm[k * 3] = gx * ny; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = gz * ny;
    const groom = snowColor(x, y, z, ny, piste.distAt(x, z), treeline, c);
    // Flat toon light barely tells a bank from the run, so paint it: the snow
    // shades cool in a hollow (the foot of a bank) and bright along a crest.
    // Measured over 8 m whatever the tile's spacing, so it doesn't change with it.
    const e = Math.max(1, Math.round(8 / step));
    const curve = (h[j * v + Math.max(0, i - e)] + h[j * v + Math.min(cells, i + e)] + h[Math.max(0, j - e) * v + i]
      + h[Math.min(cells, j + e) * v + i] - 4 * y) / (e * step) ** 2;
    if (curve > 0) c.lerp(C.hollow, THREE.MathUtils.smoothstep(curve, 0.005, 0.03) * 0.8);
    else c.lerp(C.crest, THREE.MathUtils.smoothstep(-curve, 0.005, 0.03) * 0.9);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    if (pst) {
      // The ribs only where the vertex and its neighbours share a run, so they
      // fade out where two runs' lines meet rather than cross.
      piste.coordsAt(x, z, at);
      const e = s * step, r = at.run;
      const same = r >= 0 && piste.runAt(x - e, z) === r && piste.runAt(x + e, z) === r && piste.runAt(x, z - e) === r && piste.runAt(x, z + e) === r;
      pst[k * 3] = same ? at.off : 0; pst[k * 3 + 1] = same ? at.along : 0; pst[k * 3 + 2] = same ? groom : 0;
    }
  };
  sample.corduroy = corduroy;
  return sample;
}

// The snow's color at a point, into `c`; returns how groomed it is (0–1).
function snowColor(x, y, z, ny, pd, treeline, c) {
  const slopeDeg = (Math.acos(Math.min(1, ny)) * 180) / Math.PI;
  const n = vnoise(x * 0.02, z * 0.02);
  c.copy(C.snow).lerp(C.snowShade, n * 0.6);
  // Groomed pistes read as a slightly cooler, smoother band.
  const groom = 1 - THREE.MathUtils.smoothstep(pd, PISTE_HALF_WIDTH - 3, PISTE_HALF_WIDTH + 1);
  c.lerp(C.groomed, groom * 0.9);
  // Wind-scoured rock on steep faces.
  const rockT = THREE.MathUtils.smoothstep(slopeDeg + (n - 0.5) * 12, 34, 40) * (1 - groom);
  if (rockT > 0) c.lerp(vnoise(x * 0.08, z * 0.08) > 0.5 ? C.rock : C.rockDark, rockT);
  // Under the forest canopy the snow is a touch greyer.
  if (y < treeline && pd > PISTE_HALF_WIDTH + 4) c.lerp(C.snowShade, 0.5);
  return groom;
}

// Grid indices from a to b every `stride`, always ending on b (so neighbouring
// tiles share their edge vertices whatever their spacing).
function steps(a, b, stride) {
  const out = [];
  for (let i = a; i < b; i += stride) out.push(i);
  out.push(b);
  return out;
}

// One tile ([i0, j0, i1, j1] in grid cells) every `stride` vertices. With `ring`,
// a copy of its edge dropped 6 m hangs off it as a short skirt.
function tileGeometry(hf, sample, [i0, j0, i1, j1], stride, ring) {
  const cols = steps(i0, i1, stride), rows = steps(j0, j1, stride);
  const w = cols.length, h = rows.length;
  const edge = [];
  if (ring) {
    for (let i = 0; i < w - 1; i++) edge.push(i);
    for (let j = 0; j < h - 1; j++) edge.push(j * w + w - 1);
    for (let i = w - 1; i > 0; i--) edge.push((h - 1) * w + i);
    for (let j = h - 1; j > 0; j--) edge.push(j * w);
  }
  const n = w * h + edge.length;
  const arrays = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3), color: new Float32Array(n * 3) };
  if (sample.corduroy) arrays.aPiste = new Float32Array(n * 3);
  const { position, normal, color, aPiste } = arrays;
  for (let b = 0; b < h; b++)
    for (let a = 0; a < w; a++) sample(cols[a], rows[b], stride, b * w + a, position, normal, color, aPiste);
  for (const arr of Object.values(arrays)) edge.forEach((k, r) => arr.set(arr.subarray(k * 3, k * 3 + 3), (w * h + r) * 3));
  edge.forEach((_, r) => (position[(w * h + r) * 3 + 1] -= 6));
  const geo = new THREE.BufferGeometry();
  for (const [name, arr] of Object.entries(arrays)) geo.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  const idx = [];
  for (let b = 0; b < h - 1; b++)
    for (let a = 0; a < w - 1; a++) {
      if (hf.cellIsHole(cols[a], rows[b])) continue;
      const p = b * w + a, q = p + 1, r = p + w, s = r + 1;
      idx.push(p, r, q, q, r, s);
    }
  edge.forEach((k, r) => {
    const r2 = (r + 1) % edge.length;
    idx.push(k, edge[r2], w * h + r, edge[r2], w * h + r2, w * h + r);
  });
  geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  return geo;
}

// Vertical strip around the edge so the backdrop seam never shows a gap.
function skirtGeometry(hf, sample) {
  const c = hf.cells;
  const ring = [];
  for (let i = 0; i <= c; i++) ring.push([i, 0]);
  for (let j = 1; j <= c; j++) ring.push([c, j]);
  for (let i = c - 1; i >= 0; i--) ring.push([i, c]);
  for (let j = c - 1; j >= 0; j--) ring.push([0, j]);
  const n = ring.length * 2;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3), idx = [];
  ring.forEach(([i, j], r) => {
    sample(i, j, 1, 2 * r, P, N, Cc, null);
    for (let e = 0; e < 3; e++) {
      P[(2 * r + 1) * 3 + e] = P[2 * r * 3 + e] - (e === 1 ? 120 : 0);
      N[(2 * r + 1) * 3 + e] = N[2 * r * 3 + e];
      Cc[(2 * r + 1) * 3 + e] = Cc[2 * r * 3 + e] * 0.9;
    }
    if (r) idx.push(2 * r - 2, 2 * r, 2 * r - 1, 2 * r, 2 * r + 1, 2 * r - 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setIndex(idx);
  return geo;
}

// `clearings` ([{ x, z, r }]) open the taiga up around buildings.
export function createBackdrop(hf, detail, treeline, clearings = []) {
  // Sink the part that sits under the detailed terrain.
  const g = gridGeometry(hf, (x, z) => (detail.inside(x, z, 20) ? -80 : 0));
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const slope = (Math.acos(Math.min(1, nrm.getY(k))) * 180) / Math.PI;
    const n = vnoise(x * 0.0015, z * 0.0015);
    c.copy(C.snow).lerp(C.snowShade, n);
    // Taiga covers the valleys and lower slopes of the Altai.
    let forest = THREE.MathUtils.smoothstep(treeline + 120 - y + (n - 0.5) * 250, 0, 150) *
      (1 - THREE.MathUtils.smoothstep(slope, 30, 40));
    // Stands of trees with snowy meadows between them, as on the trail map.
    forest *= 0.3 + 0.7 * THREE.MathUtils.smoothstep(vnoise(x * 0.0011 + 7, z * 0.0011), 0.38, 0.62);
    for (const cl of clearings) forest *= 0.3 + 0.7 * THREE.MathUtils.smoothstep(Math.hypot(x - cl.x, z - cl.z), cl.r, cl.r * 3);
    c.lerp(n > 0.5 ? C.forest : C.forestDark, forest * 0.85);
    const rockT = THREE.MathUtils.smoothstep(slope, 33, 42);
    c.lerp(C.rockDark, rockT * 0.8);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, makeToon({ vertexColors: true }, { hatch: 0 }));
}
