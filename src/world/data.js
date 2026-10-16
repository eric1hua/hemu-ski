// Loads the baked world (see scripts/fetch-data.mjs) and provides sampling helpers.
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL + 'data/';

function decode(buf, { min, max }) {
  const q = new Uint16Array(buf);
  const out = new Float32Array(q.length);
  const s = (max - min) / 65535;
  for (let i = 0; i < q.length; i++) out[i] = min + q[i] * s;
  return out;
}

// `dir` picks a sub-folder of public/data (e.g. 'diorama/'); the backdrop is optional.
export async function loadWorld(dir = '') {
  const base = BASE + dir;
  const meta = await (await fetch(base + 'world.json')).json();
  const [d, b] = await Promise.all(
    [meta.detail, meta.backdrop].map((f) => f && fetch(base + f.file).then((r) => r.arrayBuffer())),
  );
  return {
    meta,
    detail: new Heightfield(meta.detail.size, meta.detail.cells, decode(d, meta.detail), meta.detail.center),
    backdrop: b && new Heightfield(meta.backdrop.size, meta.backdrop.cells, decode(b, meta.backdrop)),
  };
}

// A square grid of `size` metres centred on `center` ([x, z]; the game's block is
// off-centre so it reaches down to the service centres).
export class Heightfield {
  constructor(size, cells, heights, center = [0, 0]) {
    this.size = size;
    this.cells = cells;
    this.verts = cells + 1;
    this.step = size / cells;
    this.half = size / 2;
    this.center = center;
    this.x0 = center[0] - this.half; // west edge
    this.z0 = center[1] - this.half; // north edge
    this.h = heights;
  }
  inside(x, z, margin = 0) {
    return Math.abs(x - this.center[0]) < this.half - margin && Math.abs(z - this.center[1]) < this.half - margin;
  }
  heightAt(x, z) {
    const v = this.verts;
    let fx = (x - this.x0) / this.step, fz = (z - this.z0) / this.step;
    fx = Math.min(Math.max(fx, 0), this.cells - 1e-6);
    fz = Math.min(Math.max(fz, 0), this.cells - 1e-6);
    const i = Math.floor(fx), j = Math.floor(fz);
    const ax = fx - i, az = fz - j;
    const k = j * v + i;
    const h = this.h;
    return (h[k] * (1 - ax) + h[k + 1] * ax) * (1 - az) + (h[k + v] * (1 - ax) + h[k + v + 1] * ax) * az;
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 2.0;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }
}

// Distance (m) from every point to the nearest piste centreline, rasterised on a
// grid. Used for snow coloring, tree clearing, friction and the HUD run name.
export class PisteField {
  constructor(runs, size, cell = 4, maxDist = 60, center = [0, 0]) {
    this.size = size;
    this.cell = cell;
    this.half = size / 2;
    this.x0 = center[0] - this.half;
    this.z0 = center[1] - this.half;
    this.n = Math.round(size / cell) + 1;
    this.maxDist = maxDist;
    this.dist = new Float32Array(this.n * this.n).fill(maxDist);
    this.run = new Int16Array(this.n * this.n).fill(-1);
    runs.forEach((run, ri) => {
      const p = run.points;
      for (let s = 0; s < p.length - 1; s++) this.#raster(p[s], p[s + 1], ri);
    });
  }
  #raster(a, b, ri) {
    const { cell, n, maxDist } = this;
    const x0 = Math.min(a[0], b[0]) - maxDist - this.x0, x1 = Math.max(a[0], b[0]) + maxDist - this.x0;
    const z0 = Math.min(a[1], b[1]) - maxDist - this.z0, z1 = Math.max(a[1], b[1]) + maxDist - this.z0;
    const i0 = Math.max(0, Math.floor(x0 / cell)), i1 = Math.min(n - 1, Math.ceil(x1 / cell));
    const j0 = Math.max(0, Math.floor(z0 / cell)), j1 = Math.min(n - 1, Math.ceil(z1 / cell));
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) {
      const z = j * cell + this.z0;
      for (let i = i0; i <= i1; i++) {
        const x = i * cell + this.x0;
        let t = ((x - a[0]) * dx + (z - a[1]) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const ex = a[0] + dx * t - x, ez = a[1] + dz * t - z;
        const d = Math.sqrt(ex * ex + ez * ez);
        const k = j * n + i;
        if (d < this.dist[k]) { this.dist[k] = d; this.run[k] = ri; }
      }
    }
  }
  distAt(x, z) {
    const { cell, n } = this;
    let fx = (x - this.x0) / cell, fz = (z - this.z0) / cell;
    fx = Math.min(Math.max(fx, 0), n - 1.0001);
    fz = Math.min(Math.max(fz, 0), n - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const ax = fx - i, az = fz - j, k = j * n + i, d = this.dist;
    return (d[k] * (1 - ax) + d[k + 1] * ax) * (1 - az) + (d[k + n] * (1 - ax) + d[k + n + 1] * ax) * az;
  }
  runAt(x, z) {
    const { cell, n } = this;
    const i = Math.round((x - this.x0) / cell), j = Math.round((z - this.z0) / cell);
    if (i < 0 || j < 0 || i >= n || j >= n) return -1;
    return this.run[j * n + i];
  }
}

export const PISTE_HALF_WIDTH = 17;

// The two base lodges at the foot of the resort, in the game's local metres
// (relative to Gondola No. 6; the diorama subtracts its block centre). East sits
// on its OpenStreetMap node beside 1号索道's bottom station, West beside 3号索道's.
// Elevations are the ones printed on the resort's 2023–24 trail map. `lift` is the
// gondola you board from the hall in the game.
export const SERVICE_CENTRES = [
  { id: 'east', zh: '东区服务大厅', en: 'East Service Centre', ele: 1439, x: 710, z: 4410, faceTo: [610, 4280], roof: '#5f8064', lift: '1号索道' },
  { id: 'west', zh: '西区服务大厅', en: 'West Service Centre', ele: 1383, x: -1240, z: 4640, faceTo: [-1183, 4512], roof: '#4a5661', lift: '3号索道' },
];
