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
    detail: new Heightfield(meta.detail.size, meta.detail.cells, decode(d, meta.detail)),
    backdrop: b && new Heightfield(meta.backdrop.size, meta.backdrop.cells, decode(b, meta.backdrop)),
  };
}

export class Heightfield {
  constructor(size, cells, heights) {
    this.size = size;
    this.cells = cells;
    this.verts = cells + 1;
    this.step = size / cells;
    this.half = size / 2;
    this.h = heights;
  }
  inside(x, z, margin = 0) {
    return Math.abs(x) < this.half - margin && Math.abs(z) < this.half - margin;
  }
  heightAt(x, z) {
    const v = this.verts;
    let fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
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
  constructor(runs, size, cell = 4, maxDist = 60) {
    this.size = size;
    this.cell = cell;
    this.half = size / 2;
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
    const { cell, half, n, maxDist } = this;
    const x0 = Math.min(a[0], b[0]) - maxDist, x1 = Math.max(a[0], b[0]) + maxDist;
    const z0 = Math.min(a[1], b[1]) - maxDist, z1 = Math.max(a[1], b[1]) + maxDist;
    const i0 = Math.max(0, Math.floor((x0 + half) / cell)), i1 = Math.min(n - 1, Math.ceil((x1 + half) / cell));
    const j0 = Math.max(0, Math.floor((z0 + half) / cell)), j1 = Math.min(n - 1, Math.ceil((z1 + half) / cell));
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) {
      const z = j * cell - half;
      for (let i = i0; i <= i1; i++) {
        const x = i * cell - half;
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
    const { cell, half, n } = this;
    let fx = (x + half) / cell, fz = (z + half) / cell;
    fx = Math.min(Math.max(fx, 0), n - 1.0001);
    fz = Math.min(Math.max(fz, 0), n - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const ax = fx - i, az = fz - j, k = j * n + i, d = this.dist;
    return (d[k] * (1 - ax) + d[k + 1] * ax) * (1 - az) + (d[k + n] * (1 - ax) + d[k + n + 1] * ax) * az;
  }
  runAt(x, z) {
    const { cell, half, n } = this;
    const i = Math.round((x + half) / cell), j = Math.round((z + half) / cell);
    if (i < 0 || j < 0 || i >= n || j >= n) return -1;
    return this.run[j * n + i];
  }
}

export const PISTE_HALF_WIDTH = 17;

// The two base lodges at the foot of the resort, in the game's local metres
// (relative to Gondola No. 6; the diorama subtracts its block centre). East sits
// on its OpenStreetMap node beside 1号索道's bottom station, West beside 3号索道's.
// Elevations are the ones printed on the resort's 2023–24 trail map.
export const SERVICE_CENTRES = [
  { id: 'east', zh: '东区服务大厅', en: 'East Service Centre', ele: 1439, x: 710, z: 4410, faceTo: [610, 4280], roof: '#5f8064' },
  { id: 'west', zh: '西区服务大厅', en: 'West Service Centre', ele: 1383, x: -1240, z: 4640, faceTo: [-1183, 4512], roof: '#4a5661' },
];
