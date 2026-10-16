import * as THREE from 'three';
import { makeToon } from '../render/toon.js';
import { PISTE_HALF_WIDTH } from './data.js';

const C = {
  snow: new THREE.Color('#fbfaf4'),
  snowShade: new THREE.Color('#eef1ec'),
  groomed: new THREE.Color('#e6eef0'),
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
      const a = j * verts + i, b = a + 1, c = a + verts, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// Returns a group: the grid cut into `tiles` × `tiles` meshes (so the parts
// out of view get frustum-culled), plus the edge skirt. With `lodDistance`, tiles
// further than that use a half-resolution mesh; call `group.update(cameraPos)`.
export function createDetailTerrain(hf, piste, treeline, { skirt = true, tiles = 1, lodDistance = 0 } = {}) {
  const g = gridGeometry(hf);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const ny = nrm.getY(k);
    const slopeDeg = (Math.acos(Math.min(1, ny)) * 180) / Math.PI;
    const n = vnoise(x * 0.02, z * 0.02);
    c.copy(C.snow).lerp(C.snowShade, n * 0.6);
    // Groomed pistes read as a slightly cooler, smoother band.
    const pd = piste.distAt(x, z);
    const groom = 1 - THREE.MathUtils.smoothstep(pd, PISTE_HALF_WIDTH - 3, PISTE_HALF_WIDTH + 1);
    c.lerp(C.groomed, groom * 0.9);
    // Wind-scoured rock on steep faces.
    const rockT = THREE.MathUtils.smoothstep(slopeDeg + (n - 0.5) * 12, 34, 40) * (1 - groom);
    if (rockT > 0) c.lerp(vnoise(x * 0.08, z * 0.08) > 0.5 ? C.rock : C.rockDark, rockT);
    // Under the forest canopy the snow is a touch greyer.
    if (y < treeline && pd > PISTE_HALF_WIDTH + 4) c.lerp(C.snowShade, 0.5);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = makeToon({ vertexColors: true }, { hatch: 1, snow: 1 });
  const group = new THREE.Group();
  const mesh = (geo) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const his = (tiles > 1 ? splitGrid(g, hf, tiles) : [g]).map(mesh);
  const los = lodDistance ? splitGrid(g, hf, tiles, 2).map(mesh) : [];
  if (skirt) group.add(new THREE.Mesh(skirtGeometry(g, hf), mat));
  group.update = (camPos) => {
    his.forEach((hi, k) => {
      const s = hi.geometry.boundingSphere;
      const far = s.center.distanceTo(camPos) - s.radius > lodDistance;
      hi.visible = !far;
      los[k].visible = far;
    });
  };
  if (lodDistance) group.update(new THREE.Vector3(Infinity, 0, 0));
  return group;
}

// Cuts the grid geometry into tiles that share edge vertices (and normals).
// `stride` 2 keeps every other vertex, with a short skirt hanging off the tile's
// edges to hide the cracks where it meets a full-resolution neighbour.
function splitGrid(g, hf, tiles, stride = 1) {
  const v = hf.verts, per = Math.ceil(hf.cells / tiles), out = [];
  for (let tj = 0; tj < tiles; tj++)
    for (let ti = 0; ti < tiles; ti++) {
      const i0 = ti * per, i1 = Math.min(hf.cells, i0 + per);
      const j0 = tj * per, j1 = Math.min(hf.cells, j0 + per);
      if (i0 >= i1 || j0 >= j1) continue;
      const w = Math.floor((i1 - i0) / stride) + 1, h = Math.floor((j1 - j0) / stride) + 1;
      // Grid vertices first, then (low-res only) a dropped copy of the edge ring.
      const ring = [];
      if (stride > 1) {
        for (let i = 0; i < w - 1; i++) ring.push(i);
        for (let j = 0; j < h - 1; j++) ring.push(j * w + w - 1);
        for (let i = w - 1; i > 0; i--) ring.push((h - 1) * w + i);
        for (let j = h - 1; j > 0; j--) ring.push(j * w);
      }
      const n = w * h + ring.length;
      const geo = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'color']) {
        const src = g.attributes[name].array, arr = new Float32Array(n * 3);
        for (let j = 0; j < h; j++)
          for (let i = 0; i < w; i++) {
            const k = (j0 + j * stride) * v + i0 + i * stride;
            arr.set(src.subarray(k * 3, k * 3 + 3), (j * w + i) * 3);
          }
        ring.forEach((k, r) => arr.set(arr.subarray(k * 3, k * 3 + 3), (w * h + r) * 3));
        if (name === 'position') ring.forEach((_, r) => (arr[(w * h + r) * 3 + 1] -= 6));
        geo.setAttribute(name, new THREE.BufferAttribute(arr, 3));
      }
      const idx = [];
      for (let j = 0; j < h - 1; j++)
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      ring.forEach((k, r) => {
        const r2 = (r + 1) % ring.length;
        idx.push(k, ring[r2], w * h + r, ring[r2], w * h + r2, w * h + r);
      });
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      out.push(geo);
    }
  return out;
}

// Vertical strip around the edge so the backdrop seam never shows a gap.
function skirtGeometry(g, hf) {
  const pos = g.attributes.position.array, col = g.attributes.color.array, nrm = g.attributes.normal.array;
  const v = hf.verts;
  const ring = [];
  for (let i = 0; i < v; i++) ring.push(i);
  for (let j = 1; j < v; j++) ring.push(j * v + v - 1);
  for (let i = v - 2; i >= 0; i--) ring.push((v - 1) * v + i);
  for (let j = v - 2; j >= 0; j--) ring.push(j * v);
  const P = [], Cc = [], N = [], idx = [];
  ring.forEach((k, r) => {
    P.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], pos[k * 3], pos[k * 3 + 1] - 120, pos[k * 3 + 2]);
    Cc.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2], col[k * 3] * 0.9, col[k * 3 + 1] * 0.9, col[k * 3 + 2] * 0.9);
    N.push(nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2], nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]);
    if (r) idx.push(2 * r - 2, 2 * r, 2 * r - 1, 2 * r, 2 * r + 1, 2 * r - 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
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
