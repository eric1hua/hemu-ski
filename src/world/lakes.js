// The lakes in the bake (world.json's `lakes`, from OpenStreetMap's outlines):
// for now Cloud Lake (云湖), about 270 × 115 m in the hollow just north of the
// ridge 可可托海道 follows east from the summit, at about 2,640 m. Its outline
// was traced from aerial imagery, and the DEM has a basin under it.
//
// The lakes are open water, snow on their banks. shapeLakes() sets each one's
// surface at the middle height of the ground round its edge and shapes the
// ground to it: a bed that shelves away from the edge, a low bank rising from
// it, and beyond, the ground eased back to its own height. Near the edge both
// are one straight slope across the waterline, so the heightfield's coarse
// triangles still cross the surface where the outline says.
// createLakes() draws the water over the bed: a flat sheet reaching a little
// under the bank, so the bank draws the shore, with what's dry inside a boat's
// hull cut out of it as the boat goes. You can't ride or walk onto it
// (shoreAt() is the wall; see BoardPhysics), but you can row on it (see
// vehicle/rowing.js), the boat rocking on the waves the water is painted with
// (waveHeight()). Ripples are the rings oars and a hull leave on it.
import * as THREE from 'three';
import { makeToon } from '../render/toon.js';

export const LAKE = {
  smooth: 3, // rounds of corner cutting on OSM's outline (9 points → 72)
  slope: 0.12, // how steeply the bed falls and the bank rises, near the edge (m per m)
  straight: 12, // m either side of the edge that slope holds: one cell's diagonal and more
  depth: 3, // m, the bed in the middle
  bank: 0.02, // how the bank rises past `straight` to the margin (m per m), gently
  shore: 50, // m past the margin over which the ground eases back to its own height (gently, or the snow paints a ring)
  pad: 5, // m the water's sheet reaches past the edge, under the bank
};

// The waves: a breeze from the west-north-west (the way the wind blows the
// snow elsewhere) raises short ripples on longer swells, a few centimetres
// high. Each is [heading off the wind (rad), wavelength (m), height (m), phase];
// they run at a deep-water wave's speed.
const WAVES = [
  [0, 9, 0.03, 0],
  [0.45, 5.5, 0.02, 1.7],
  [-0.55, 3.7, 0.012, 4.1],
  [0.18, 14, 0.022, 2.6],
];
const WIND = Math.atan2(0.38, 0.92); // toward the east-south-east
const WAVE_TERMS = WAVES.map(([turn, length, a, p]) => {
  const k = (2 * Math.PI) / length, dir = WIND + turn;
  return { kx: Math.cos(dir) * k, kz: Math.sin(dir) * k, w: Math.sqrt(9.81 * k), a, p };
});
const WAVE_SUM = WAVES.reduce((s, w) => s + w[2], 0);

// The water's height above its level at (x, z), `t` s in.
export function waveHeight(x, z, t) {
  let h = 0;
  for (const w of WAVE_TERMS) h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.p);
  return h;
}

const COLORS = { shallow: '#86cfc9', deep: '#3f8ea6', sky: '#c4e4ea', ripple: '#e6f5f2', foam: '#fbfaf4', ink: '#3d6f7a' };

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Chaikin's corner cutting on a closed outline, `rounds` times.
function chaikin(points, rounds) {
  let p = points;
  for (let r = 0; r < rounds; r++)
    p = p.flatMap(([ax, az], i) => {
      const [bx, bz] = p[(i + 1) % p.length];
      return [[0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz]];
    });
  return p;
}

function inside(outline, x, z) {
  let c = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i], [xj, zj] = outline[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// The edge nearest (x, z), into `out`: how far it is (`d`, negative on the
// water) and which way the land lies from there (`nx`, `nz`).
function nearestEdge(outline, x, z, out) {
  let best = Infinity, qx = 0, qz = 0, sx = 1, sz = 0;
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % outline.length];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < best) { best = d; qx = px; qz = pz; sx = dx; sz = dz; }
  }
  const wet = inside(outline, x, z);
  let nx = x - qx, nz = z - qz;
  const n = Math.hypot(nx, nz);
  if (n > 1e-6) {
    nx /= n * (wet ? -1 : 1);
    nz /= n * (wet ? -1 : 1);
  } else {
    // On the edge itself: square to it, toward whichever side is dry.
    const s = Math.hypot(sx, sz) || 1;
    nx = sz / s; nz = -sx / s;
    if (inside(outline, x + nx * 0.1, z + nz * 0.1)) { nx = -nx; nz = -nz; }
  }
  out.d = wet ? -best : best;
  out.nx = nx;
  out.nz = nz;
  return out;
}

// Shapes the ground for each lake, in place, on the final heightfield (after
// the banks and the summit). The bed and the bank reach two grid steps past
// the edge before easing off, so the coarser tiles' triangles near the edge
// cross the water where the fine ones do. Returns the lakes, each with its
// smoothed `outline`, its `level` and its bounds.
export function shapeLakes(hf, lakes = []) {
  const margin = Math.max(2 * hf.step, LAKE.straight), reach = margin + LAKE.shore;
  const near = { d: 0, nx: 0, nz: 0 };
  // The ground's height `d` m from the edge (negative on the water), near it.
  const profile = (level, d) => {
    if (d < 0) {
      const s = -d, steep = Math.min(s, LAKE.straight) * LAKE.slope;
      return level - steep - (LAKE.depth - LAKE.straight * LAKE.slope) * smooth(LAKE.straight, LAKE.straight * 3.5, s);
    }
    return level + Math.min(d, LAKE.straight) * LAKE.slope + Math.max(0, d - LAKE.straight) * LAKE.bank;
  };
  return lakes.map((lake) => {
    const outline = chaikin(lake.points, LAKE.smooth);
    const rim = [];
    outline.forEach(([ax, az], i) => {
      const [bx, bz] = outline[(i + 1) % outline.length];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2));
      for (let s = 0; s < n; s++) rim.push(hf.heightAt(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n));
    });
    rim.sort((a, b) => a - b);
    const level = rim[rim.length >> 1];
    const xs = outline.map((p) => p[0]), zs = outline.map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    const v = hf.verts, step = hf.step;
    const i0 = Math.max(0, Math.floor((box[0] - reach - hf.x0) / step)), i1 = Math.min(hf.cells, Math.ceil((box[2] + reach - hf.x0) / step));
    const j0 = Math.max(0, Math.floor((box[1] - reach - hf.z0) / step)), j1 = Math.min(hf.cells, Math.ceil((box[3] + reach - hf.z0) / step));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const { d } = nearestEdge(outline, hf.x0 + i * step, hf.z0 + j * step, near), k = j * v + i;
        if (d >= reach) continue;
        const shaped = profile(level, d);
        hf.h[k] = shaped + (hf.h[k] - shaped) * smooth(margin, reach, d);
      }
    return { id: lake.id, name: lake.name, outline, level, box };
  });
}

// The lake at (x, z), or null.
export function lakeAt(lakes, x, z) {
  for (const l of lakes) if (x > l.box[0] && x < l.box[2] && z > l.box[1] && z < l.box[3] && inside(l.outline, x, z)) return l;
  return null;
}

// The heightfield `hf` with the lakes' surfaces read as ground, for what flies
// over them and comes down.
export function overWater(hf, lakes) {
  return Object.create(hf, {
    heightAt: { value: (x, z) => { const h = hf.heightAt(x, z), l = lakeAt(lakes, x, z); return l ? Math.max(h, l.level) : h; } },
  });
}

// The water's edge nearest (x, z) on a lake within `within` m of it, as
// { lake, d, nx, nz }: `d` negative on the water, (nx, nz) toward the land.
// Null when there's no lake that near. The result is reused: copy what you keep.
const _shore = { lake: null, d: 0, nx: 0, nz: 0 };
export function shoreAt(lakes, x, z, within = 20) {
  for (const l of lakes) {
    const b = l.box;
    if (x < b[0] - within || x > b[2] + within || z < b[1] - within || z > b[3] + within) continue;
    nearestEdge(l.outline, x, z, _shore);
    if (_shore.d < within) { _shore.lake = l; return _shore; }
  }
  return null;
}

// The water: a flat sheet over each lake's outline, padded out under the bank,
// at its level. `update(time, holes)` moves its ripples and its foam, and cuts
// `holes` out of it: rings of world (x, z) (Vector2s), the inside of each boat
// on it at its waterline (see Rowboat.waterline). The cut is in the sheet
// itself, not just its paint, so the ink pass sees the boat dry inside too.
const MAX_HOLE = 64; // points in a hole
export function createLakes(lakes) {
  const group = new THREE.Group();
  group.name = 'Lakes';
  const sheets = [];
  for (const lake of lakes) {
    const outline = padded(lake.outline, LAKE.pad).map(([x, z]) => new THREE.Vector2(x, z));
    const geo = sheetGeometry(outline.length + MAX_HOLE);
    cutSheet(geo, outline, [], lake.level);
    geo.computeBoundingSphere(); // the holes are all inside it
    const mat = waterMaterial(lake.outline);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `lake:${lake.id}`;
    mesh.receiveShadow = true;
    group.add(mesh);
    const b = lake.box, pad = LAKE.pad;
    const on = (h) => h[0].x > b[0] - pad && h[0].x < b[2] + pad && h[0].y > b[1] - pad && h[0].y < b[3] + pad;
    sheets.push({ lake, geo, outline, mat, on, cut: false });
  }
  return {
    group,
    update(time, holes = []) {
      for (const s of sheets) {
        s.mat.userData.uniforms.uTime.value = time;
        let room = MAX_HOLE;
        const mine = holes.filter((h) => h.length > 2 && h.length <= room && s.on(h) && (room -= h.length) >= 0);
        if (!mine.length && !s.cut) continue;
        cutSheet(s.geo, s.outline, mine, s.lake.level);
        s.cut = mine.length > 0;
      }
    },
  };
}

// A sheet's buffers, room for `n` points: flat, facing up.
function sheetGeometry(n) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) normal[i * 3 + 1] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(n * 3 + 12), 1).setUsage(THREE.DynamicDrawUsage));
  return geo;
}

// Triangulates `outline` less `holes` into the sheet at height `level`, every
// triangle wound to face up.
function cutSheet(geo, outline, holes, level) {
  const faces = THREE.ShapeUtils.triangulateShape(outline, holes);
  const pts = outline.concat(...holes), pos = geo.attributes.position, index = geo.index, ix = index.array;
  pts.forEach((p, i) => pos.setXYZ(i, p.x, level, p.y));
  faces.forEach(([a, b, c], i) => {
    const up = (pts[b].y - pts[a].y) * (pts[c].x - pts[a].x) - (pts[b].x - pts[a].x) * (pts[c].y - pts[a].y) > 0;
    ix[i * 3] = a;
    ix[i * 3 + 1] = up ? b : c;
    ix[i * 3 + 2] = up ? c : b;
  });
  geo.setDrawRange(0, faces.length * 3); // the buffers are a fixed size
  pos.needsUpdate = true;
  index.needsUpdate = true;
}

// The outline pushed out `by` m from each corner.
function padded(outline, by) {
  const n = outline.length;
  return outline.map(([x, z], i) => {
    const [ax, az] = outline[(i + n - 1) % n], [bx, bz] = outline[(i + 1) % n];
    let nx = bz - az, nz = -(bx - ax);
    const len = Math.hypot(nx, nz) || 1;
    nx /= len; nz /= len;
    if (inside(outline, x + nx * 0.5, z + nz * 0.5)) { nx = -nx; nz = -nz; }
    return [x + nx * by, z + nz * by];
  });
}

const NOISE = /* glsl */ `
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
}
float waves(vec2 p, float t) {
  return ${WAVE_TERMS.map((w) => `${w.a.toFixed(4)} * sin(dot(vec2(${w.kx.toFixed(5)}, ${w.kz.toFixed(5)}), p) - ${w.w.toFixed(5)} * t + ${w.p.toFixed(3)})`).join('\n    + ')};
}
`;

// The toon material's tones and shadows over painted water: shallow jade by
// the shore and deeper blue toward the middle, mottled; paler toward the far
// shore, where it holds the sky; the crests of the waves drawn as broken pale
// lines, with glints of sun among them; and at the edge a band of foam that
// laps in and out, an ink line along it and a fainter line following it in.
// The edge's distance comes from the outline itself, so the foam follows the
// shore the bank draws.
function waterMaterial(outline) {
  const mat = makeToon({ color: '#ffffff' }, { hatch: 0 });
  const toon = mat.onBeforeCompile;
  const closed = [...outline, outline[0]].map(([x, z]) => new THREE.Vector2(x, z));
  const uniforms = {
    uTime: { value: 0 },
    uOutline: { value: closed },
    uShallow: { value: new THREE.Color(COLORS.shallow) },
    uDeep: { value: new THREE.Color(COLORS.deep) },
    uSky: { value: new THREE.Color(COLORS.sky) },
    uRipple: { value: new THREE.Color(COLORS.ripple) },
    uFoam: { value: new THREE.Color(COLORS.foam) },
    uInk: { value: new THREE.Color(COLORS.ink) },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader, renderer) => {
    toon(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        #define LAKE_N ${closed.length}
        uniform vec2 uOutline[LAKE_N];
        uniform float uTime;
        uniform vec3 uShallow, uDeep, uSky, uRipple, uFoam, uInk;
        ${NOISE}
        float shoreDist(vec2 p) {
          float d = 1e9;
          for (int i = 0; i < LAKE_N - 1; i++) {
            vec2 a = uOutline[i], ba = uOutline[i + 1] - a, pa = p - a;
            d = min(d, length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)));
          }
          return d;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vTWorld.xz;
          float d = shoreDist(p), t = uTime;
          float far = smoothstep(120.0, 600.0, length(vViewPosition));
          // Deeper toward the middle, mottled by slow drifting noise.
          float m = wNoise(p * 0.035 + t * 0.01) * 0.6 + wNoise(p * 0.12 - t * 0.02) * 0.4;
          vec3 col = mix(uShallow, uDeep, clamp(smoothstep(2.0, 32.0, d) * 0.85 + (m - 0.5) * 0.35, 0.0, 1.0));
          // The sky in it, toward the far shore: two flat steps, as the toon tones are.
          vec3 V = normalize(cameraPosition - vTWorld);
          float graze = 1.0 - clamp(V.y, 0.0, 1.0);
          float gw = max(fwidth(graze), 1e-4);
          col = mix(col, uSky, (smoothstep(0.82 - gw, 0.82 + gw, graze) * 0.35 + smoothstep(0.93 - gw, 0.93 + gw, graze) * 0.3));
          // The crests, where the waves the boat rocks on rise highest, broken up.
          float w = waves(p, t) * ${(1 / WAVE_SUM).toFixed(4)} + (wNoise(p * 0.22 + vec2(t * 0.12, -t * 0.05)) - 0.5) * 0.9;
          float ww = max(fwidth(w), 1e-4);
          float crest = 1.0 - smoothstep(ww * 0.6, ww * 1.8, abs(w - 0.62));
          crest *= smoothstep(0.35, 0.6, wNoise(p * 0.6 + t * 0.07));
          col = mix(col, uRipple, crest * 0.8 * (1.0 - far));
          // Glints of sun among them, small, and more toward the far shore.
          float g = wNoise(p * 5.0 + vec2(t * 1.1, t * 0.5)) * wNoise(p * 1.3 - vec2(t * 0.4, -t * 0.3));
          float gl = max(fwidth(g), 1e-4);
          col = mix(col, vec3(1.0), smoothstep(0.7 - gl, 0.7 + gl, g) * smoothstep(0.45, 0.85, graze) * (1.0 - far));
          // Lapping at the shore: foam that breathes in and out, an ink line at
          // its edge, and a fainter line following it in.
          float wob = wNoise(p * 0.3) * 6.0;
          float lap = 0.9 + 0.5 * sin(t * 1.1 + wob), lap2 = 2.6 + 0.9 * sin(t * 1.1 - 1.3 + wob);
          float fw = max(fwidth(d), 1e-3);
          float foam = 1.0 - smoothstep(lap - fw, lap + fw, d);
          float line2 = (1.0 - smoothstep(fw * 0.5, fw * 1.6, abs(d - lap2))) * (0.45 + 0.35 * sin(t * 1.1 - 1.3 + wob));
          col = mix(col, uFoam, max(foam, line2) * (1.0 - far * 0.5));
          float ink = 1.0 - smoothstep(fw * 0.5, fw * 1.8, abs(d - lap));
          col = mix(col, uInk, ink * 0.5 * (1.0 - far * 0.7));
          diffuseColor.rgb = col;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `lake-water-${closed.length}`;
  return mat;
}

// Rings spreading on the water and fading: where an oar dips in and comes out,
// and in a trail behind a moving hull; not inside the hull (`update`'s `holes`,
// as the water's).
export class Ripples {
  constructor(max = 40) {
    this.group = new THREE.Group();
    this.group.name = 'Ripples';
    const geo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    this.hole = { uHole: { value: Array.from({ length: MAX_HOLE }, () => new THREE.Vector2()) }, uHoleN: { value: 0 } };
    this.rings = Array.from({ length: max }, () => {
      const mesh = new THREE.Mesh(geo, this.#material());
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      return { mesh, t: 0, life: 1, r0: 0, r1: 0, alpha: 0 };
    });
    this.next = 0;
  }

  // A ring at (x, y, z) spreading from r0 to r1 m over `life` s.
  emit(x, y, z, r0 = 0.15, r1 = 1.6, life = 1.8, alpha = 0.7) {
    const r = this.rings[this.next];
    this.next = (this.next + 1) % this.rings.length;
    Object.assign(r, { t: 0, life, r0, r1, alpha });
    r.mesh.position.set(x, y + 0.02, z);
    r.mesh.visible = true;
  }

  // A ring's own material (for its own fading), left out inside the hole.
  #material() {
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.ripple, transparent: true, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.hole);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRipple;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRipple = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
        varying vec2 vRipple;
        uniform vec2 uHole[${MAX_HOLE}];
        uniform int uHoleN;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          bool inHole = false;
          for (int i = 0, j = uHoleN - 1; i < ${MAX_HOLE}; j = i++) {
            if (i >= uHoleN) break;
            vec2 a = uHole[i], b = uHole[j];
            if ((a.y > vRipple.y) != (b.y > vRipple.y) && vRipple.x < (b.x - a.x) * (vRipple.y - a.y) / (b.y - a.y) + a.x) inHole = !inHole;
          }
          if (inHole) discard;
        }`);
    };
    mat.customProgramCacheKey = () => 'ripple-holed';
    return mat;
  }

  // `holes`: as the water's; the first is kept clear (the boat's inside).
  update(dt, holes = []) {
    const hole = holes.find((h) => h.length > 2 && h.length <= MAX_HOLE) ?? [];
    hole.forEach((p, i) => this.hole.uHole.value[i].copy(p));
    this.hole.uHoleN.value = hole.length;
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const u = r.t / r.life;
      if (u >= 1) { r.mesh.visible = false; continue; }
      const s = r.r0 + (r.r1 - r.r0) * (1 - (1 - u) ** 2);
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = r.alpha * (1 - u) ** 1.5;
    }
  }
}
