// Title screen, after Messenger's: the resort floats in the teal sky as a small
// island while chunky block letters hang in front of it, snow drifts past, and
// Begin flies the camera down through a cloud to the rider at the top station.
// This module builds the pieces; main.js drives the camera and the hand-off.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeToon } from './render/toon.js';
import { strataTexture, wallStrip } from './diorama/base.js';
import { vnoise } from './world/terrain.js';
import { PISTE_HALF_WIDTH } from './world/data.js';

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

// ---------- The floating island ----------
// Earth walls under the block's edges, a rocky keel tapering to a point below,
// a green canopy where the forest grows (real-size trees vanish from 20 km
// out) and a few rocks and clouds drifting around it. Only shown on the title.
export function createIsland(hf, piste, { min, max, treeline }) {
  const group = new THREE.Group();
  const baseY = min - 260;
  const keel = 3400;
  const v = hf.verts;
  const edges = [
    { ks: [...Array(v).keys()], out: new THREE.Vector3(0, 0, -1) }, // north
    { ks: [...Array(v).keys()].map((i) => (v - 1) * v + i), out: new THREE.Vector3(0, 0, 1) }, // south
    { ks: [...Array(v).keys()].map((j) => j * v), out: new THREE.Vector3(-1, 0, 0) }, // west
    { ks: [...Array(v).keys()].map((j) => j * v + v - 1), out: new THREE.Vector3(1, 0, 0) }, // east
  ];
  const earth = makeToon({ map: strataTexture() }, { hatch: 1 });
  const vOf = (y) => (y - baseY) / (max - baseY);
  // The terrain's own 120 m skirt is the snowpack; the earth starts below it.
  for (const e of edges) group.add(new THREE.Mesh(wallStrip(hf, e.ks, e.out, (h) => h - 119, () => baseY, vOf), earth));
  group.add(new THREE.Mesh(keelGeometry(hf, baseY, keel), makeToon({ vertexColors: true }, { hatch: 1 })));
  group.add(new THREE.Mesh(canopyGeometry(hf, piste, treeline), makeToon({ vertexColors: true }, { hatch: 1 })));

  const cx = hf.center[0], cz = hf.center[1];
  const rnd = seeded(29);
  const rockMat = makeToon({ color: '#857a6c' }, { hatch: 1 });
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rocks = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.6;
    const r = 120 + rnd() * 260;
    const m = new THREE.Mesh(rockGeo, rockMat);
    const R = 5000 + rnd() * 1400;
    m.position.set(cx + Math.cos(a) * R, baseY - 300 - rnd() * 1500, cz + Math.sin(a) * R);
    m.scale.set(r, r * 0.75, r * 0.9);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.userData.y = m.position.y;
    rocks.push(m);
    group.add(m);
  }

  const cloudMat = makeToon({ color: '#ffffff' }, { hatch: 0 });
  const puffGeo = new THREE.IcosahedronGeometry(1, 2);
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group();
    const n = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const p = new THREE.Mesh(puffGeo, cloudMat);
      const r = 260 + rnd() * 320 * (1 - Math.abs(k / (n - 1) - 0.5));
      p.scale.set(r, r * 0.8, r);
      p.position.set((k - (n - 1) / 2) * 380, r * 0.25, (rnd() - 0.5) * 300);
      cloud.add(p);
    }
    const high = i % 2 === 0;
    cloud.userData = {
      a: (i / 6) * Math.PI * 2 + rnd() * 0.5,
      R: 4300 + rnd() * 1300,
      y: high ? max - 500 + rnd() * 700 : baseY - 200 + rnd() * 900,
    };
    clouds.push(cloud);
    group.add(cloud);
  }

  group.update = (time) => {
    rocks.forEach((m, i) => {
      m.position.y = m.userData.y + Math.sin(time * 0.35 + i * 1.7) * 60;
      m.rotation.y += 0.0006;
    });
    for (const c of clouds) {
      const a = c.userData.a + time * 0.006;
      c.position.set(cx + Math.cos(a) * c.userData.R, c.userData.y, cz + Math.sin(a) * c.userData.R);
      c.rotation.y = -a;
    }
  };
  // Framing: the middle of the island top to keel, and a sphere around it.
  const midY = (max + baseY - keel) / 2;
  group.userData = {
    center: new THREE.Vector3(cx, midY, cz),
    radius: Math.hypot(hf.half * Math.SQRT2, (max - (baseY - keel)) / 2),
  };
  group.update(0);
  return group;
}

// A sheet 14 m over the ground on the cells the forest covers, by the same
// rules it places trees with (treeline, runs, cliffs, glades), at 24 m cells.
function canopyGeometry(hf, piste, treeline) {
  const CELL = 24, n = Math.floor(hf.size / CELL);
  const nrm = new THREE.Vector3(), c = new THREE.Color();
  const dark = new THREE.Color('#3e5a4f'), light = new THREE.Color('#557a63');
  const pos = [], col = [], idx = [];
  const vert = new Map();
  const at = (i, j) => {
    const key = j * (n + 1) + i;
    if (!vert.has(key)) {
      const x = hf.x0 + i * CELL, z = hf.z0 + j * CELL;
      vert.set(key, pos.length / 3);
      pos.push(x, hf.heightAt(x, z) + 14, z);
      c.copy(dark).lerp(light, vnoise(x * 0.004, z * 0.004));
      col.push(c.r, c.g, c.b);
    }
    return vert.get(key);
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = hf.x0 + (i + 0.5) * CELL, z = hf.z0 + (j + 0.5) * CELL;
      if (!hf.inside(x, z, 30) || hf.holeAt(x, z)) continue;
      const y = hf.heightAt(x, z);
      if (y > treeline - 60 + (vnoise(x * 0.006, z * 0.006) - 0.5) * 160) continue;
      if (piste.distAt(x, z) < PISTE_HALF_WIDTH + 5) continue;
      if (hf.normalAt(x, z, nrm).y < 0.78) continue;
      if (vnoise(x * 0.012 + 40, z * 0.012) < 0.42) continue;
      const a = at(i, j), b = at(i + 1, j), d = at(i, j + 1), e = at(i + 1, j + 1);
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Rings of points around the block's square edge, shrinking and jittering as
// they drop, closed off by a tip. Flat-shaded so each facet catches the ink.
function keelGeometry(hf, baseY, depth) {
  const { x0, z0, size } = hf;
  const cx = x0 + size / 2, cz = z0 + size / 2;
  const PER = 7, RINGS = 6;
  const edge = [];
  for (let s = 0; s < 4; s++)
    for (let i = 0; i < PER; i++) {
      const t = i / PER;
      const [x, z] = [[t, 0], [1, t], [1 - t, 1], [0, 1 - t]][s];
      edge.push([x0 + x * size, z0 + z * size]);
    }
  const rnd = seeded(7);
  const rings = [];
  for (let r = 0; r < RINGS; r++) {
    const t = r / RINGS, j = r ? 1 : 0; // the top ring meets the walls exactly
    rings.push(edge.map(([x, z]) => {
      const s = Math.pow(1 - t, 0.75) * (1 + (rnd() - 0.5) * 0.22 * j);
      const y = baseY - depth * Math.pow(t, 1.3) + (rnd() - 0.5) * depth * 0.07 * j;
      return new THREE.Vector3(cx + (x - cx) * s, y, cz + (z - cz) * s);
    }));
  }
  const tip = new THREE.Vector3(cx + 180, baseY - depth, cz - 120);
  const tones = ['#8f7a63', '#7d6a5a', '#6f7472', '#5d6264', '#6a6e6c', '#585d60'].map((h) => new THREE.Color(h));
  const pos = [], col = [];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), m = new THREE.Vector3(), c = new THREE.Color();
  const tri = (a, b, d, r) => {
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(d, a));
    m.addVectors(a, b).add(d).divideScalar(3);
    if (n.x * (m.x - cx) + n.z * (m.z - cz) < 0) [b, d] = [d, b];
    c.copy(tones[Math.min(r, tones.length - 1)]).multiplyScalar(0.9 + rnd() * 0.2);
    for (const p of [a, b, d]) {
      pos.push(p.x, p.y, p.z);
      col.push(c.r, c.g, c.b);
    }
  };
  const N = edge.length;
  for (let r = 0; r < RINGS; r++)
    for (let i = 0; i < N; i++) {
      const a = rings[r][i], b = rings[r][(i + 1) % N];
      if (r === RINGS - 1) {
        tri(a, b, tip, r);
        continue;
      }
      const d = rings[r + 1][i], e = rings[r + 1][(i + 1) % N];
      tri(a, b, d, r);
      tri(b, e, d, r);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- Block letters ----------
// Each letter is a cream cube with thin slots cut into its face, Messenger's
// way: slots are [x0, y0, x1, y1] on a 10 × 10 face, y down. The face is cut
// along every slot edge into cells, and the cells outside the slots are raised.
const GLYPHS = {
  H: [[4.35, 0, 5.65, 3.9], [4.35, 6.1, 5.65, 10]],
  E: [[3.3, 2.55, 10, 3.85], [3.3, 6.15, 10, 7.45]],
  M: [[2.8, 3.3, 4.1, 10], [5.9, 3.3, 7.2, 10]],
  U: [[4.35, 0, 5.65, 6.9]],
  S: [[3.0, 2.55, 10, 3.85], [0, 6.15, 7.0, 7.45]],
  K: [[3.0, 0, 4.3, 3.9], [3.0, 6.1, 4.3, 10], [6.3, 4.35, 10, 5.65]],
  I: [[0, 2.6, 3.4, 7.4], [6.6, 2.6, 10, 7.4]],
};
const ROWS = ['HEMU', 'SKI'];
const TILE = 10, GAP = 1.3, RAISE = 1.8, BODY = 7.5;
const WIDTH = 4 * TILE + 3 * GAP, HEIGHT = 2 * TILE + GAP;
// Baked tones (lit from the top left) so the letters keep their look as the
// camera circles the sun; the ink pass draws their edges.
const FACE = Object.fromEntries(Object.entries({
  cream: '#f7f2e4', slot: '#4d6467', top: '#efe9d8', left: '#ddd5c1', right: '#bfb6a1', bottom: '#a39a87', back: '#8f877a',
}).map(([k, hex]) => [k, new THREE.Color(hex)]));

function paint(g, isBody) {
  const n = g.attributes.normal, col = new Float32Array(n.count * 3);
  for (let k = 0; k < n.count; k++) {
    const x = n.getX(k), y = n.getY(k), z = n.getZ(k);
    const c = z > 0.5 ? (isBody ? FACE.slot : FACE.cream) : z < -0.5 ? FACE.back
      : y > 0.5 ? FACE.top : y < -0.5 ? FACE.bottom : x < 0 ? FACE.left : FACE.right;
    col.set([c.r, c.g, c.b], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function tileGeometry(slots) {
  const cuts = (a, b) => [...new Set([0, TILE, ...slots.flatMap((s) => [s[a], s[b]])])].sort((p, q) => p - q);
  const xs = cuts(0, 2), ys = cuts(1, 3);
  const parts = [paint(new THREE.BoxGeometry(TILE, TILE, BODY).translate(0, 0, -BODY / 2), true)];
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const mx = (xs[i] + xs[i + 1]) / 2, my = (ys[j] + ys[j + 1]) / 2;
      if (slots.some(([a, b, c, d]) => mx > a && mx < c && my > b && my < d)) continue;
      const g = new THREE.BoxGeometry(xs[i + 1] - xs[i], ys[j + 1] - ys[j], RAISE);
      parts.push(paint(g.translate(mx - TILE / 2, TILE / 2 - my, RAISE / 2), false));
    }
  return mergeGeometries(parts);
}

// The letters hang in front of the camera (add `group` to it). `update` lays
// them out for the current lens; `leave` sends them tumbling off screen.
export function createTitleLetters() {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const rnd = seeded(3);
  const tiles = [];
  ROWS.forEach((row, r) => [...row].forEach((ch, i) => {
    const m = new THREE.Mesh(tileGeometry(GLYPHS[ch]), mat);
    m.position.set((i - (row.length - 1) / 2) * (TILE + GAP), (0.5 - r) * (TILE + GAP), 0);
    m.userData = {
      home: m.position.clone(),
      tilt: new THREE.Euler((rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.14, (rnd() - 0.5) * 0.08),
      phase: rnd() * Math.PI * 2,
      v: new THREE.Vector3(),
      w: new THREE.Vector3(),
      delay: 0,
    };
    inner.add(m);
    tiles.push(m);
  }));
  let leaving = -1;

  return {
    group,
    update(dt, time, cam, dist, pointer) {
      if (!group.visible) return;
      const k = 1 - Math.exp(-dt * 3);
      if (leaving < 0) {
        const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
        const s = Math.min((0.56 * visH * cam.aspect) / WIDTH, (0.34 * visH) / HEIGHT);
        group.position.set(0, visH * 0.08, -dist);
        group.scale.setScalar(s);
        inner.rotation.x += (0.22 - pointer.y * 0.14 - inner.rotation.x) * k;
        inner.rotation.y += (pointer.x * 0.28 - inner.rotation.y) * k;
        for (const m of tiles) {
          const { home, tilt, phase } = m.userData;
          m.position.y = home.y + Math.sin(time * 1.1 + phase) * 0.25;
          m.rotation.set(tilt.x + Math.sin(time * 0.7 + phase) * 0.025, tilt.y, tilt.z);
        }
        return;
      }
      leaving += dt;
      for (const m of tiles) {
        const u = m.userData;
        if (leaving < u.delay) continue;
        u.v.y -= 70 * dt;
        m.position.addScaledVector(u.v, dt);
        m.rotation.x += u.w.x * dt;
        m.rotation.y += u.w.y * dt;
        m.rotation.z += u.w.z * dt;
      }
      if (leaving > 2.4) group.visible = false;
    },
    leave() {
      if (leaving >= 0) return;
      leaving = 0;
      tiles.forEach((m, i) => {
        const u = m.userData;
        u.delay = i * 0.05 + rnd() * 0.05;
        u.v.set(u.home.x * 1.6 + (rnd() - 0.5) * 14, 22 + u.home.y * 1.5 + rnd() * 14, 4 + rnd() * 8);
        u.w.set((rnd() - 0.5) * 7, (rnd() - 0.5) * 7, (rnd() - 0.5) * 5);
      });
    },
  };
}

// ---------- Drifting snow ----------
// Soft flakes spread through the view at 0.2–1.3× the camera's distance to the
// island, so some pass in front of it and some behind. Lives in camera space.
export function createSnowSpecks(count = 150) {
  const rnd = seeded(41);
  const flakes = [];
  const pos = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    flakes.push({ u: rnd() * 2.3 - 1.15, v: rnd() * 2.3 - 1.15, z: 0.2 + rnd() * 1.1, fall: 0.025 + rnd() * 0.035, phase: rnd() * 6.3 });
    size[i] = 2.5 + rnd() * rnd() * 7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color('#f2faf6') } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uScale;
      void main() {
        gl_PointSize = aSize * uScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float a = 1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5));
        if (a <= 0.0) discard;
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    set opacity(o) {
      mat.uniforms.uOpacity.value = o;
      points.visible = o > 0;
    },
    update(dt, time, cam, dist, pixelRatio) {
      if (!points.visible) return;
      const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), tx = ty * cam.aspect;
      flakes.forEach((f, i) => {
        f.v -= f.fall * dt;
        f.u += Math.sin(time * 0.5 + f.phase) * 0.012 * dt;
        if (f.v < -1.15) {
          f.v = 1.15;
          f.u = rnd() * 2.3 - 1.15;
        }
        const z = f.z * dist;
        pos.set([f.u * tx * z, f.v * ty * z, -z], i * 3);
      });
      geo.attributes.position.needsUpdate = true;
      mat.uniforms.uScale.value = pixelRatio;
    },
  };
}

// ---------- Cloud wipe ----------
// Paper-white puffs close in from the edges as the camera dives into a cloud
// and open out again as it comes through. `set(c)` takes the cover, 0–1.
export function createCloudWipe(el) {
  const blobs = [];
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('i');
    el.appendChild(b);
    blobs.push({ el: b, a: (i / 9) * Math.PI * 2 + Math.sin(i * 7.1) * 0.4, r: 0.55 + ((i * 37) % 10) / 30, s: 0.75 + ((i * 53) % 10) / 25 });
  }
  return (c) => {
    el.style.visibility = c > 0 ? 'visible' : 'hidden';
    if (c <= 0) return;
    const R = Math.max(window.innerWidth, window.innerHeight);
    for (const b of blobs) {
      const off = (1 - c) * b.r * R;
      b.el.style.transform = `translate(${Math.cos(b.a) * off}px, ${Math.sin(b.a) * off}px) scale(${b.s * (0.5 + c * 1.1)})`;
    }
    el.style.opacity = Math.min(1, c * 2.5);
    el.style.backgroundColor = `rgba(251, 250, 245, ${THREE.MathUtils.smoothstep(c, 0.7, 1)})`;
  };
}
