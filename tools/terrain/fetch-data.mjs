// Bakes real-world data for the Hemu (Jikepulin) ski area into game-ready files.
//   - Elevation: AWS Terrain Tiles (Terrarium encoding), public, no key.
//   - Pistes, lifts and lakes: OpenStreetMap via Overpass (the same data OpenSkiMap renders).
// Output goes to public/data/. Run with `npm run fetch-data`. The game and the
// diorama both read it (see src/world/resort.js).
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public/data');
const UA = 'hemu-ski-experiment/0.1 (personal game prototype)';

// Gondola #6 (6号索道) — the OpenSkiMap object the user linked.
const LIFT_BOTTOM = [87.5451301, 48.6223632];
const LIFT_TOP = [87.5540669, 48.6295045];
const ORIGIN = [(LIFT_BOTTOM[0] + LIFT_TOP[0]) / 2, (LIFT_BOTTOM[1] + LIFT_TOP[1]) / 2];

// 8 m grid, playable area: the whole upper mountain plus the valley floor down to
// the East and West service centres. Off-centre, but coordinates stay relative to
// Gondola No. 6 (the block's centre is written to world.json).
const DETAIL = { size: 7200, cells: 900, zoom: 14, center: [300, 1500] };
const BACKDROP = { size: 40000, cells: 320, zoom: 11 }; // 125 m grid, horizon mountains

// Names OpenStreetMap doesn't have, by way id. The lake in the hollow north of
// the ridge 可可托海道 follows east from the summit is Cloud Lake.
const LAKE_NAMES = { 1153227323: '云湖' };

const R = 6378137;
const lat0 = (ORIGIN[1] * Math.PI) / 180;

function localToLonLat(x, z) {
  // x = east, z = south (three.js convention: -z is north)
  const lat = ORIGIN[1] + (-z / R) * (180 / Math.PI);
  const lon = ORIGIN[0] + (x / (R * Math.cos(lat0))) * (180 / Math.PI);
  return [lon, lat];
}
function lonLatToLocal(lon, lat) {
  const x = ((lon - ORIGIN[0]) * Math.PI) / 180 * R * Math.cos(lat0);
  const z = -((lat - ORIGIN[1]) * Math.PI) / 180 * R;
  return [x, z];
}
function lonLatToTileFloat(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return [x, y];
}

async function cached(name, fetcher) {
  const file = path.join(CACHE, name);
  try {
    return await fs.readFile(file);
  } catch {
    const buf = await fetcher();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buf);
    return buf;
  }
}

async function getTile(z, x, y) {
  const buf = await cached(`terrarium/${z}/${x}/${y}.png`, async () => {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
  const png = PNG.sync.read(buf);
  const h = new Float32Array(256 * 256);
  for (let i = 0; i < h.length; i++) {
    const r = png.data[i * 4], g = png.data[i * 4 + 1], b = png.data[i * 4 + 2];
    h[i] = r * 256 + g + b / 256 - 32768;
  }
  return h;
}

async function sampleGrid({ size, cells, zoom, center = [0, 0] }) {
  const half = size / 2;
  const [cx, cz] = center;
  const [w, n] = localToLonLat(cx - half, cz - half);
  const [e, s] = localToLonLat(cx + half, cz + half);
  const [tx0f, ty0f] = lonLatToTileFloat(w, n, zoom);
  const [tx1f, ty1f] = lonLatToTileFloat(e, s, zoom);
  const tx0 = Math.floor(tx0f), ty0 = Math.floor(ty0f);
  const tx1 = Math.floor(tx1f), ty1 = Math.floor(ty1f);
  const tiles = new Map();
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) tiles.set(`${tx},${ty}`, await getTile(zoom, tx, ty));
  console.log(`  z${zoom}: ${tiles.size} tiles`);

  const px = (gx, gy) => {
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
    const t = tiles.get(`${tx},${ty}`);
    return t[(gy - ty * 256) * 256 + (gx - tx * 256)];
  };
  const verts = cells + 1;
  const out = new Float32Array(verts * verts);
  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const x = cx - half + (i / cells) * size;
      const z = cz - half + (j / cells) * size;
      const [lon, lat] = localToLonLat(x, z);
      const [fx, fy] = lonLatToTileFloat(lon, lat, zoom);
      const gx = fx * 256 - 0.5, gy = fy * 256 - 0.5;
      const ix = Math.max(tx0 * 256, Math.min((tx1 + 1) * 256 - 2, Math.floor(gx)));
      const iy = Math.max(ty0 * 256, Math.min((ty1 + 1) * 256 - 2, Math.floor(gy)));
      const ax = gx - ix, ay = gy - iy;
      out[j * verts + i] =
        px(ix, iy) * (1 - ax) * (1 - ay) + px(ix + 1, iy) * ax * (1 - ay) +
        px(ix, iy + 1) * (1 - ax) * ay + px(ix + 1, iy + 1) * ax * ay;
    }
  }
  return out;
}

function blur(h, verts, radius, passes) {
  let a = h, b = new Float32Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < verts; j++)
      for (let i = 0; i < verts; i++) {
        let s = 0, c = 0;
        for (let k = -radius; k <= radius; k++) {
          const ii = i + k;
          if (ii < 0 || ii >= verts) continue;
          s += a[j * verts + ii]; c++;
        }
        b[j * verts + i] = s / c;
      }
    [a, b] = [b, a];
    for (let j = 0; j < verts; j++)
      for (let i = 0; i < verts; i++) {
        let s = 0, c = 0;
        for (let k = -radius; k <= radius; k++) {
          const jj = j + k;
          if (jj < 0 || jj >= verts) continue;
          s += a[jj * verts + i]; c++;
        }
        b[j * verts + i] = s / c;
      }
    [a, b] = [b, a];
  }
  return a;
}

function quantize(h) {
  let min = Infinity, max = -Infinity;
  for (const v of h) { if (v < min) min = v; if (v > max) max = v; }
  const scale = 65535 / (max - min);
  const q = new Uint16Array(h.length);
  for (let i = 0; i < h.length; i++) q[i] = Math.round((h[i] - min) * scale);
  return { q, min, max };
}

async function overpass({ size, center: [cx, cz] = [0, 0] }, cacheName) {
  const half = size / 2;
  const [w, n] = localToLonLat(cx - half, cz - half);
  const [e, s] = localToLonLat(cx + half, cz + half);
  const bbox = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:90];(way["piste:type"="downhill"](${bbox});way["aerialway"](${bbox});way["natural"="water"](${bbox}););out geom tags;`;
  const buf = await cached(cacheName, async () => {
    // The public Overpass instances are often busy; retry a few times.
    for (let attempt = 1; ; attempt++) {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (attempt >= 5) throw new Error(`overpass -> ${res.status}`);
      console.log(`  overpass ${res.status}, retrying…`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  });
  return JSON.parse(buf.toString()).elements;
}

const round1 = (v) => Math.round(v * 10) / 10;

function parseWays(els, [cx, cz] = [0, 0]) {
  const runs = [], lifts = [], lakes = [];
  for (const e of els) {
    if (!e.geometry) continue;
    const t = e.tags || {};
    const pts = e.geometry.map((g) => lonLatToLocal(g.lon, g.lat)).map(([x, z]) => [round1(x - cx), round1(z - cz)]);
    if (t['piste:type'] === 'downhill') {
      runs.push({ id: e.id, name: t.name || null, difficulty: t['piste:difficulty'] || 'intermediate', points: pts });
    } else if (t.aerialway) {
      lifts.push({ id: e.id, name: t.name || null, type: t.aerialway, points: pts });
    } else if (t.natural === 'water' && e.geometry.at(-1).lat === e.geometry[0].lat && e.geometry.at(-1).lon === e.geometry[0].lon) {
      // A closed outline, its last point (the first again) dropped.
      lakes.push({ id: e.id, name: t.name || LAKE_NAMES[e.id] || null, points: pts.slice(0, -1) });
    }
  }
  return { runs, lifts, lakes };
}

async function main() {
  console.log('Elevation (detail)…');
  const detailRaw = await sampleGrid(DETAIL);
  // DEM upsampled from ~30 m source data is terraced; soften it so skiing feels smooth.
  const detail = blur(detailRaw, DETAIL.cells + 1, 2, 2);
  console.log('Elevation (backdrop)…');
  const backdrop = blur(await sampleGrid(BACKDROP), BACKDROP.cells + 1, 1, 1);

  const d = quantize(detail);
  const b = quantize(backdrop);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'detail.u16'), Buffer.from(d.q.buffer));
  await fs.writeFile(path.join(OUT, 'backdrop.u16'), Buffer.from(b.q.buffer));

  console.log('Pistes, lifts + lakes…');
  const { runs, lifts, lakes } = parseWays(await overpass(DETAIL, 'osm-game.json'));

  const meta = {
    source: {
      elevation: 'AWS Terrain Tiles (Terrarium), Mapzen/SRTM et al.',
      pistes: '© OpenStreetMap contributors (ODbL), via Overpass; see openskimap.org',
    },
    origin: { lon: ORIGIN[0], lat: ORIGIN[1] },
    liftLink: { name: '6号索道', osmWay: 1127891899 },
    detail: { file: 'detail.u16', size: DETAIL.size, cells: DETAIL.cells, center: DETAIL.center, min: d.min, max: d.max },
    backdrop: { file: 'backdrop.u16', size: BACKDROP.size, cells: BACKDROP.cells, min: b.min, max: b.max },
    runs,
    lifts,
    lakes,
  };
  await fs.writeFile(path.join(OUT, 'world.json'), JSON.stringify(meta));
  console.log(`Done. detail ${d.min.toFixed(0)}–${d.max.toFixed(0)} m, backdrop ${b.min.toFixed(0)}–${b.max.toFixed(0)} m, ${runs.length} runs, ${lifts.length} lifts, ${lakes.length} lakes`);
}

main().catch((e) => { console.error(e); process.exit(1); });
