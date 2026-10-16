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
  const { verts, size, half } = hf;
  const pos = new Float32Array(verts * verts * 3);
  for (let j = 0; j < verts; j++)
    for (let i = 0; i < verts; i++) {
      const k = j * verts + i;
      const x = -half + (i / hf.cells) * size, z = -half + (j / hf.cells) * size;
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

export function createDetailTerrain(hf, piste, treeline, { skirt = true } = {}) {
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
  if (skirt) addSkirt(g, hf);
  const mesh = new THREE.Mesh(g, makeToon({ vertexColors: true }, { hatch: 1, snow: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

// Vertical strip around the edge so the backdrop seam never shows a gap.
function addSkirt(g, hf) {
  const pos = g.attributes.position.array, col = g.attributes.color.array, nrm = g.attributes.normal.array;
  const v = hf.verts;
  const ring = [];
  for (let i = 0; i < v; i++) ring.push(i);
  for (let j = 1; j < v; j++) ring.push(j * v + v - 1);
  for (let i = v - 2; i >= 0; i--) ring.push((v - 1) * v + i);
  for (let j = v - 2; j >= 0; j--) ring.push(j * v);
  const base = pos.length / 3;
  const P = Array.from(pos), Cc = Array.from(col), N = Array.from(nrm);
  for (const k of ring) {
    P.push(pos[k * 3], pos[k * 3 + 1] - 120, pos[k * 3 + 2]);
    Cc.push(col[k * 3] * 0.9, col[k * 3 + 1] * 0.9, col[k * 3 + 2] * 0.9);
    N.push(nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]);
  }
  const idx = Array.from(g.index.array);
  for (let r = 0; r < ring.length - 1; r++) {
    const a = ring[r], b = ring[r + 1], c2 = base + r, d = base + r + 1;
    idx.push(a, b, c2, b, d, c2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(idx);
}

export function createBackdrop(hf, detailHalf, treeline) {
  // Sink the part that sits under the detailed terrain.
  const g = gridGeometry(hf, (x, z) => (Math.abs(x) < detailHalf - 20 && Math.abs(z) < detailHalf - 20 ? -80 : 0));
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const slope = (Math.acos(Math.min(1, nrm.getY(k))) * 180) / Math.PI;
    const n = vnoise(x * 0.0015, z * 0.0015);
    c.copy(C.snow).lerp(C.snowShade, n);
    // Taiga covers the valleys and lower slopes of the Altai.
    const forest = THREE.MathUtils.smoothstep(treeline + 120 - y + (n - 0.5) * 250, 0, 150) *
      (1 - THREE.MathUtils.smoothstep(slope, 30, 40));
    c.lerp(n > 0.5 ? C.forest : C.forestDark, forest * 0.85);
    const rockT = THREE.MathUtils.smoothstep(slope, 33, 42);
    c.lerp(C.rockDark, rockT * 0.8);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, makeToon({ vertexColors: true }, { hatch: 0 }));
}
