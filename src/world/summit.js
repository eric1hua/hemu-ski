// The summit of Yunxiaofeng, round the top stations of Gondolas No. 6 and 7,
// laid out in summit-layout.js: the ground shaped for it (shapeSummit) and
// stand-ins for its landmarks (createSummit) until their models are made.
//
// Each landmark is a group named by its id, standing on its pivot (the middle
// of its base) and turned by its yaw; its stand-in is the child group named
// 'placeholder', which a model can replace without moving the landmark. The
// solid parts of each stand-in become collision boxes of their own (posts, legs,
// walls), so the frame's opening, the swing's middle and the space under the
// pods stay open.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeToon } from '../render/toon.js';
import { placeOf, summitFrame } from './data.js';
import { SUMMIT } from './summit-layout.js';

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------- The ground ----------
// Distance from (x, z) to a line of [x, z, height] points, and its height there.
function nearLine(line, x, z) {
  let d = Infinity, dy = 0;
  for (let s = 0; s < line.length - 1; s++) {
    const a = line[s], b = line[s + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1));
    const e = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
    if (e < d) { d = e; dy = a[2] + (b[2] - a[2]) * t; }
  }
  return { d, dy };
}

// The knoll's height above the ground at (x, z), from the summit's origin: a
// blunt mound, (1 - ρ²)², steeper on its north-west side.
function knollAt({ at, axis, half, nw, se, height }, x, z) {
  const ax = x - at[0], az = z - at[1];
  const u = ax * axis[0] + az * axis[1]; // along it
  const v = ax * axis[1] - az * axis[0]; // across it, + to the north-west
  const r2 = (u / half) ** 2 + (v / (v > 0 ? nw : se)) ** 2;
  return r2 < 1 ? height * (1 - r2) ** 2 : 0;
}

// Shapes the ground round the summit, in place, on the final heightfield (after
// the banks) so the terrain, the physics and everything standing on it read the
// same heights; the bake's 4 m grid carries it, so nothing finer than that. Then
// levels a pad under each landmark wherever it stands now. Returns the frame it
// used, or null if the two lifts aren't on the map.
export function shapeSummit(hf, lifts) {
  const frame = summitFrame(lifts);
  if (!frame) return null;
  const [ox, oz] = frame.origin;
  const plaza = (hf.heightAt(...frame.stations[0]) + hf.heightAt(...frame.stations[1])) / 2;
  const T = SUMMIT.terrain;
  const lines = [...T.terrace.lines.map((l) => [l, T.terrace]), [T.ridge.line, T.ridge], [T.shoulder.line, T.shoulder]];
  const v = hf.verts, step = hf.step, R = 170;
  const span = (c, c0) => [Math.max(0, Math.floor((c - R - c0) / step)), Math.min(hf.cells, Math.ceil((c + R - c0) / step))];
  const [i0, i1] = span(ox, hf.x0), [j0, j1] = span(oz, hf.z0);
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = hf.x0 + i * step - ox, z = hf.z0 + j * step - oz, k = j * v + i;
      let h = hf.h[k];
      for (const [line, f] of lines) {
        const { d, dy } = nearLine(line, x, z);
        if (d < f.r1) h += (plaza + dy - h) * (1 - smooth(f.r0, f.r1, d));
      }
      hf.h[k] = h + knollAt(T.knoll, x, z);
    }
  // A level pad under each landmark, at the mean height under it, reaching a
  // grid step past it so the ground between the vertices is level too.
  for (const o of SUMMIT.objects) {
    const { x, z } = placeOf(o.id);
    const r0 = (o.round ? o.size[0] : Math.hypot(...o.size)) + 0.6 * step, r1 = r0 + step;
    let sum = hf.heightAt(x, z), n = 1;
    for (let a = 0; a < 8; a++)
      for (const r of [r0 * 0.5, r0]) { sum += hf.heightAt(x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r); n++; }
    const level = sum / n;
    const [pi0, pi1] = [Math.max(0, Math.floor((x - r1 - hf.x0) / step)), Math.min(hf.cells, Math.ceil((x + r1 - hf.x0) / step))];
    const [pj0, pj1] = [Math.max(0, Math.floor((z - r1 - hf.z0) / step)), Math.min(hf.cells, Math.ceil((z + r1 - hf.z0) / step))];
    for (let j = pj0; j <= pj1; j++)
      for (let i = pi0; i <= pi1; i++) {
        const d = Math.hypot(hf.x0 + i * step - x, hf.z0 + j * step - z), k = j * v + i;
        if (d < r1) hf.h[k] += (level - hf.h[k]) * (1 - smooth(r0, r1, d));
      }
  }
  return { ...frame, plaza };
}

// ---------- The stand-ins ----------
const toon = (color, rim = 0) => makeToon({ color }, { rim });
const M = {
  felt: toon('#f2eee4'), feltRoof: toon('#e6dfd0'), band: toon('#a8432f'), door: toon('#c4572f'), crown: toon('#7d5a3c'),
  timber: toon('#c98a3e'), board: toon('#efe3c8'),
  gold: toon('#d8a73e', 1),
  stone: toon('#9d978c'), stoneDark: toon('#7d786f'), pole: toon('#6b5136'),
  logs: toon('#b98b5d'), hutRoof: toon('#6c5a48'),
  frame: toon('#7b5230'),
  pale: toon('#e6dac5'), shingle: toon('#a09583'), dark: toon('#34302d'),
  post: toon('#987a5c'), seat: toon('#c4463a'), rope: toon('#3d3a36'),
  orange: toon('#e2742c', 1), steel: toon('#4b5157'),
  mast: toon('#e3e6e8'), panel: toon('#c9cfd3'),
};
const flagMat = makeToon({ vertexColors: true, side: THREE.DoubleSide }, { hatch: 0 });
const podMat = makeToon({ vertexColors: true, flatShading: true }, { rim: 1 });

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function add(g, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
// The group, with its collision boxes ({ x, z, yaw, hw, hd, top } in its own
// metres, top above its base) and its height.
function done(g, solids, height) {
  g.userData.solids = solids;
  g.userData.height = height;
  return g;
}
// A round thing as two boxes, an octagon.
const octagon = (r, top) => [0, Math.PI / 4].map((yaw) => ({ x: 0, z: 0, yaw, hw: r, hd: r, top }));

// A gable roof with its ridge along x at `y` + `rise`, over a body `span` deep
// (z) and `len` long, the eaves out by `over`; the gable ends filled in.
function gableRoof(g, len, span, y, rise, over, roofMat, endMat) {
  const half = span / 2 + over, a = Math.atan2(rise, span / 2);
  for (const s of [-1, 1]) {
    const slab = add(g, box(len + 2 * over, 0.12, half / Math.cos(a)), roofMat, 0, y + rise - (half / 2) * Math.tan(a) + 0.06, (s * half) / 2);
    slab.rotation.x = s * a;
  }
  const tri = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, rise)]);
  const ends = new THREE.ExtrudeGeometry(tri, { depth: len, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-len / 2, y, 0);
  add(g, ends, endMat);
}

// 1: a white felt yurt, a round wall under a shallow cone, its door at the front.
function yurt() {
  const g = new THREE.Group(), R = 3.2, wall = 1.7;
  add(g, new THREE.CylinderGeometry(R, R, wall, 28), M.felt, 0, wall / 2, 0);
  add(g, new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.28, 28, 1, true), M.band, 0, wall - 0.3, 0);
  add(g, new THREE.ConeGeometry(R + 0.2, 1.5, 28), M.feltRoof, 0, wall + 0.75, 0);
  add(g, new THREE.CylinderGeometry(0.5, 0.55, 0.3, 12), M.crown, 0, wall + 1.45, 0);
  add(g, box(0.95, 1.45, 0.3), M.door, 0, 0.72, R - 0.05);
  return done(g, octagon(R, wall + 1.6), wall + 1.6);
}

// 2: the timber signpost: a post with a forked top on four splayed legs, its
// arrows for the four countries in sight pointing their real ways (north is -z).
const COUNTRIES = [
  { dir: [0, -1], y: 4.6, colors: ['#2e5fb0', '#d8352a'] }, // Russia
  { dir: [1, 0], y: 4.15, colors: ['#c8342c', '#2550a0'] }, // Mongolia
  { dir: [-1, 0], y: 4.15, colors: ['#33a9dc', '#f2c230'] }, // Kazakhstan
  { dir: [0, 1], y: 4.6, colors: ['#d8352a', '#f2c230'] }, // China
];
function signpost() {
  const g = new THREE.Group(), H = 6.2, legH = 3.2, foot = 2.4;
  add(g, box(0.38, H, 0.38), M.timber, 0, H / 2, 0);
  for (const s of [-1, 1]) add(g, box(0.3, 1.3, 0.3), M.timber, s * 0.42, H + 0.35, 0).rotation.z = -s * 0.7;
  const legs = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, dx = Math.sin(a), dz = Math.cos(a);
    const leg = add(g, box(0.26, Math.hypot(foot, legH), 0.26), M.timber, (dx * foot) / 2, legH / 2, (dz * foot) / 2);
    leg.rotation.order = 'YXZ';
    leg.rotation.set(-Math.atan2(foot, legH), a, 0);
    legs.push({ x: (dx * (foot + 0.3)) / 2, z: (dz * (foot + 0.3)) / 2, yaw: a, hw: 0.17, hd: foot / 2, top: legH });
  }
  for (const { dir, y, colors } of COUNTRIES) {
    const arm = new THREE.Group();
    arm.position.y = y;
    arm.rotation.y = Math.atan2(dir[0], dir[1]);
    add(arm, box(0.1, 0.34, 1.25), M.board, 0, 0, 0.82);
    add(arm, box(0.11, 0.34, 0.32), toon(colors[0]), 0, 0, 1.6);
    add(arm, new THREE.CylinderGeometry(0, 0.2, 0.34, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), toon(colors[1]), 0, 0, 1.86);
    g.add(arm);
  }
  return done(g, [{ x: 0, z: 0, hw: 0.25, hd: 0.25, top: H + 1 }, ...legs], H + 1);
}

// 3: one set of prayer wheels (public/models/prayer-wheels/), a Tripo rack a
// unit long, shown WHEELS.scale times its size: 5.5, which puts its seven
// gilded wheels (0.5 m across, 0.89 m tall) from 0.75 m to 1.64 m, their
// middles level with the walking rider's shoulders (1.2 m), and the eaves of
// its shallow roof at 1.89 m, just over her head (1.84 m); any smaller and her
// head would go through them. Its long side is along x and it has no back:
// the wheels turn from either side. `userData.wheels` lists them, once
// loaded, for world/prayer-wheels.js to turn: each mesh, where its axle is
// along the rack (m) and its radius. The numbers below are in model units,
// measured off the model.
const WHEELS = { scale: 5.5, posts: 0.448, depth: 0.027, top: 0.526 };
let wheelsModel = null;
function loadWheels() {
  wheelsModel ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/prayer-wheels/prayer-wheels.glb`).then((gltf) => {
    const model = gltf.scene;
    const toonOf = new Map(); // the wheels gilded, with a rim of light
    model.traverse((o) => {
      if (!o.isMesh) return;
      const wheel = /^wheel_/.test(o.name);
      // Each wheel's mesh sits a little off its node: centre it, so it turns
      // on its own axle.
      if (wheel) {
        o.geometry.computeBoundingBox();
        const c = o.geometry.boundingBox.getCenter(new THREE.Vector3());
        o.geometry.translate(-c.x, 0, -c.z);
        o.geometry.computeBoundingBox();
        o.position.x += c.x;
        o.position.z += c.z;
      }
      const key = `${o.material.uuid}${wheel}`;
      if (!toonOf.has(key)) toonOf.set(key, makeToon({ map: o.material.map, color: 0xffffff, side: o.material.side }, { rim: wheel ? 1 : 0 }));
      o.material = toonOf.get(key);
      o.castShadow = o.receiveShadow = true;
    });
    return model;
  });
  return wheelsModel;
}
function prayerWheels() {
  const g = new THREE.Group(), S = WHEELS.scale;
  g.userData.wheels = [];
  g.userData.ready = loadWheels().then((model) => {
    const rack = model.clone();
    rack.scale.setScalar(S);
    rack.traverse((o) => {
      if (!/^wheel_/.test(o.name)) return;
      const bb = o.geometry.boundingBox;
      g.userData.wheels.push({ mesh: o, x: o.position.x * S, r: ((bb.max.x - bb.min.x + bb.max.z - bb.min.z) / 4) * S });
    });
    g.userData.wheels.sort((a, b) => a.x - b.x);
    g.add(rack);
  });
  // One box from post to post, as deep as the posts: the wheels stand out of
  // it a little, so a rider can come close enough to put a hand on them (the
  // game keeps a rider half a metre off a box, and her body is narrower than
  // that). The roof is overhead.
  return done(g, [{ x: 0, z: 0, hw: (WHEELS.posts + 0.01) * S, hd: WHEELS.depth * S, top: WHEELS.top * S }], WHEELS.top * S);
}

// 4: the ovoo: three stone tiers stepping in, a cairn, a pole with prayer-flag
// strings out to the ground, and a short flight of steps up at the front.
const FLAG_COLORS = ['#2f6fc0', '#f4f2ea', '#cf3b2e', '#3f9a52', '#f0c23a'].map((c) => new THREE.Color(c));
function ovoo() {
  const g = new THREE.Group();
  let y = 0;
  for (const [r, h] of [[3.3, 0.8], [2.5, 0.75], [1.75, 0.7]]) {
    add(g, new THREE.CylinderGeometry(r - 0.15, r, h, 11), y ? M.stone : M.stoneDark, 0, y + h / 2, 0);
    y += h;
  }
  add(g, new THREE.ConeGeometry(1.1, 0.9, 9), M.stone, 0, y + 0.45, 0);
  add(g, new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6), M.pole, 0, y + 2.3, 0);
  add(g, new THREE.ConeGeometry(0.18, 0.6, 6), M.gold, 0, y + 4.9, 0);
  for (let k = 0; k < 3; k++) add(g, box(1.6, (k + 1) * 0.27, 0.45), M.stoneDark, 0, (k + 1) * 0.135, 3.3 + (2.5 - k) * 0.45);
  // Flags hang off eight strings from near the pole's top out to the ground.
  const top = new THREE.Vector3(0, y + 4.2, 0), quads = [], lines = [];
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2, end = new THREE.Vector3(Math.sin(a) * 5.2, 0.05, Math.cos(a) * 5.2);
    lines.push(top, end);
    const dir = end.clone().sub(top).normalize();
    for (let f = 0; f < 7; f++) {
      const p = top.clone().lerp(end, 0.12 + f * 0.11);
      const q = new THREE.BufferGeometry().setFromPoints([p, p.clone().addScaledVector(dir, 0.3), p.clone().addScaledVector(dir, 0.3).setY(p.y - 0.26), p.clone().setY(p.y - 0.26)]);
      q.setIndex([0, 1, 2, 0, 2, 3]);
      const c = FLAG_COLORS[f % 5];
      q.setAttribute('color', new THREE.Float32BufferAttribute([c, c, c, c].flatMap((v) => v.toArray()), 3));
      quads.push(q);
    }
  }
  const flags = mergeGeometries(quads);
  flags.computeVertexNormals();
  add(g, flags, flagMat).castShadow = false;
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: '#4a3f36' })));
  return done(g, [...octagon(3.3, y + 5), { x: 0, z: 3.95, hw: 0.8, hd: 0.7, top: 0.8 }], y + 5.2);
}

// 5: a small timber hut under a gable roof, door at the front. What it's for
// isn't known, so it says nothing.
function hut() {
  const g = new THREE.Group(), W = 3.6, D = 3.0, H = 2.4, rise = 1.1;
  add(g, box(W, H, D), M.logs, 0, H / 2, 0);
  gableRoof(g, W, D, H, rise, 0.3, M.hutRoof, M.logs);
  add(g, box(0.9, 1.85, 0.08), M.dark, 0.6, 0.93, D / 2 + 0.02);
  add(g, box(0.8, 0.6, 0.08), M.dark, -0.9, 1.4, D / 2 + 0.02);
  return done(g, [{ x: 0, z: 0, hw: W / 2 + 0.1, hd: D / 2 + 0.1, top: H + rise }], H + rise);
}

// 6: the giant wooden photo frame, a whole rectangle on angled feet with the
// peak's name across its top and a low sill, open in the middle to walk through.
function photoFrame() {
  const g = new THREE.Group(), W = 4.6, H = 3.0, b = 0.34, t = 0.28, sill = 0.24;
  const top = sill + H + b;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + b / 2);
    add(g, box(b, top, t), M.frame, x, top / 2, 0);
    add(g, box(b * 0.9, 0.2, 1.9), M.frame, x, 0.1, 0);
    for (const sz of [-1, 1]) add(g, box(b * 0.6, 1.45, 0.16), M.frame, x, 0.62, sz * 0.48).rotation.x = sz * 0.68;
  }
  add(g, box(W + 2 * b, b, t), M.frame, 0, top - b / 2, 0);
  add(g, box(W, sill, t), M.frame, 0, sill / 2, 0);
  const name = new THREE.MeshBasicMaterial({ map: nameTexture('云霄峰 2800'), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), name);
  plate.position.set(0, top - b - 0.42, 0);
  g.add(plate);
  return done(g, [-1, 1].map((s) => ({ x: s * (W / 2 + b / 2), z: 0, hw: b / 2 + 0.05, hd: 0.95, top })), top);
}

// 7: the coffee cabin (public/models/coffee-cabin/), a Tripo log cabin a unit
// across, shown CABIN.scale times its size: 10, which puts its bar at 1.06 m,
// its table at 0.8 m and its chairs' seats at 0.45 m beside a 1.8 m rider (its
// glass door, a grand one, is 3.1 m). Its front, with the open door, faces +z.
// The room inside is 8.6 m by 4.1 m, with an alcove at the back for the tall
// window; out in front are ledges under the windows, the guitarist sitting on
// one, the open door and a post box. Its floor stands 0.042 units (0.42 m)
// above its foot, so the model is sunk to put that floor on the snow, which
// the pad levels there: riders and the dog walk straight in. The numbers below
// are in model units, measured off the model.
const CABIN = {
  scale: 10, floor: 0.042,
  room: [-0.42, 0.436, -0.25, 0.16], // the inside of its walls: x0, x1, z0 (back), z1 (front)
  door: [-0.09, 0.136], // the doorway in the front wall, across x
};
// What stands in it, as boxes [x0, x1, z0, z1, top] (top the model's height
// there), or { at: [x, z], yaw, hw, hd, top } turned: the walls round the
// doorway, then the furniture inside and the things out in front, so riders
// and the dog go round them rather than through.
const CABIN_SOLIDS = [
  // Walls, the alcove's included.
  [-0.455, CABIN.door[0], 0.16, 0.25, 0.32], [CABIN.door[1], 0.463, 0.16, 0.25, 0.32],
  [-0.455, -0.42, -0.31, 0.25, 0.32], [0.436, 0.463, -0.31, 0.25, 0.32],
  [-0.455, -0.1, -0.31, -0.25, 0.32], [0.15, 0.463, -0.31, -0.25, 0.32],
  [-0.135, -0.1, -0.4, -0.25, 0.35], [0.15, 0.185, -0.4, -0.25, 0.35], [-0.135, 0.185, -0.4, -0.381, 0.35],
  // The bar, an L in the back left corner with a slope filling its crook, and
  // the stools at its end.
  [-0.42, -0.19, -0.25, -0.17, 0.15], [-0.27, -0.19, -0.17, -0.05, 0.15],
  { at: [-0.2925, -0.1475], yaw: -Math.PI / 4, hw: 0.064, hd: 0.032, top: 0.15 },
  [-0.19, -0.125, -0.24, -0.17, 0.14],
  // The tall black cabinet by the door, inside.
  [-0.22, -0.16, 0.01, 0.14, 0.26],
  // In the alcove: a chair and stool, and the plant.
  [-0.1, -0.035, -0.32, -0.26, 0.14], [-0.1, -0.05, -0.385, -0.335, 0.16],
  // The long table and its chairs along the back wall on the right.
  [0.06, 0.4, -0.25, -0.175, 0.14],
  // Out in front: the ledges under the windows, the guitarist, the open door
  // and the post box; and the ledges under the back windows.
  [-0.437, -0.096, 0.25, 0.335, 0.14], [0.189, 0.436, 0.25, 0.335, 0.14],
  [-0.18, -0.07, 0.25, 0.37, 0.22],
  { at: [0.163, 0.337], yaw: Math.atan2(0.054, 0.162), hw: 0.012, hd: 0.086, top: 0.32 },
  [0.385, 0.495, 0.305, 0.425, 0.15],
  [-0.45, -0.135, -0.37, -0.29, 0.14], [0.185, 0.46, -0.37, -0.29, 0.14],
];
// Where Mantou lives inside, and the spots out in front of its door and just
// inside it, which it goes in and out by (see Dog's `home.via` and
// `home.door`); in the cabin's own frame, in model units like the rest.
const CABIN_DOG = { home: [0.26, 0.04], roam: 0.16, via: [0.023, 0.5], door: [0.023, 0.09] };
const cabinSink = () => CABIN.floor * CABIN.scale - 0.03;
// The inside of the cabin standing in `root`, in world terms: the dog's home,
// and (for the camera) where its room is. `room(x, z)` is 0 outside, 1 in the
// room, and eases up over `lead` m in front of the door.
export function cabinSpace(root, lead = 4) {
  const S = CABIN.scale, c = Math.cos(root.rotation.y), s = Math.sin(root.rotation.y);
  const at = ([x, z]) => ({ x: root.position.x + x * S * c + z * S * s, z: root.position.z - x * S * s + z * S * c });
  const local = (wx, wz) => {
    const dx = wx - root.position.x, dz = wz - root.position.z;
    return [dx * c - dz * s, dx * s + dz * c];
  };
  const [x0, x1, z0, z1] = CABIN.room.map((v) => v * S);
  const inside = (wx, wz) => {
    const [x, z] = local(wx, wz);
    return x > x0 && x < x1 && z > z0 && z < z1;
  };
  const doorX = ((CABIN.door[0] + CABIN.door[1]) / 2) * S, doorHalf = ((CABIN.door[1] - CABIN.door[0]) / 2) * S;
  const room = (wx, wz) => {
    const [x, z] = local(wx, wz);
    if (x > x0 && x < x1 && z > z0 && z < z1) return 1;
    if (Math.abs(x - doorX) < doorHalf + 1 && z >= z1) return 1 - smooth(0, lead, z - z1);
    return 0;
  };
  // Pulls a point back inside the room, `gap` m off its walls.
  const keepIn = (p, gap) => {
    const [x, z] = local(p.x, p.z);
    const nx = Math.max(x0 + gap, Math.min(x1 - gap, x)), nz = Math.max(z0 + gap, Math.min(z1 - gap, z));
    p.x = root.position.x + nx * c + nz * s;
    p.z = root.position.z - nx * s + nz * c;
  };
  const home = {
    ...at(CABIN_DOG.home),
    yaw: root.rotation.y,
    roam: CABIN_DOG.roam * S,
    via: at(CABIN_DOG.via),
    door: at(CABIN_DOG.door),
    inside,
  };
  return { home, inside, room, keepIn };
}

function cabin() {
  const g = new THREE.Group(), S = CABIN.scale, up = (y) => y * S - cabinSink();
  const solids = CABIN_SOLIDS.map((b) => Array.isArray(b)
    ? { x: ((b[0] + b[1]) / 2) * S, z: ((b[2] + b[3]) / 2) * S, hw: ((b[1] - b[0]) / 2) * S, hd: ((b[3] - b[2]) / 2) * S, top: up(b[4]) }
    : { x: b.at[0] * S, z: b.at[1] * S, yaw: b.yaw, hw: b.hw * S, hd: b.hd * S, top: up(b.top) });
  g.userData.ready = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/coffee-cabin/coffee-cabin.glb`).then((gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(S);
    model.position.y = -cabinSink();
    model.traverse((o) => {
      // The model's own lamps (KHR_lights_punctual) come in at its scale: the
      // reach grows with it, and the light with the square of the distance.
      // (The stray default light the file also carries is dropped.)
      if (o.isLight) {
        if (!/^Interior/.test(o.name)) { o.visible = false; return; }
        o.distance *= S;
        o.intensity *= S * S * CABIN_LIGHT;
        o.decay = 2;
        return;
      }
      if (!o.isMesh) return;
      const m = o.material, glass = m.transparent || m.opacity < 1 || /glass/i.test(m.name);
      if (m.emissive && m.emissive.getHex() > 0) {
        o.material = new THREE.MeshBasicMaterial({ color: m.emissive.clone().multiplyScalar(Math.min(1, m.emissiveIntensity ?? 1)) });
        return;
      }
      o.material = glass
        ? makeToon({ color: m.color, transparent: true, opacity: m.opacity, depthWrite: false, side: m.side }, { hatch: 0 })
        : makeToon({ map: m.map, color: m.map ? 0xffffff : m.color, side: m.side });
      o.castShadow = !glass;
      o.receiveShadow = true;
    });
    g.add(model);
  });
  return done(g, solids, up(0.8));
}
// How much of the lamps' glTF intensity the game shows; its sun is far
// brighter than a candle, so this is found by eye.
const CABIN_LIGHT = 1;

// 8: the swing: two straight posts and a beam, two seats hung on ropes between.
function swing() {
  const g = new THREE.Group(), half = 2.65, H = 3.4;
  for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.15, 0.17, H, 8), M.post, s * half, H / 2, 0);
  add(g, new THREE.CylinderGeometry(0.13, 0.13, 2 * half + 0.5, 8), M.post, 0, H - 0.05, 0).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    add(g, box(0.75, 0.07, 0.38), M.seat, s * 1.25, 0.55, 0);
    for (const r of [-0.32, 0.32]) add(g, box(0.035, H - 0.65, 0.035), M.rope, s * 1.25 + r, 0.55 + (H - 0.65) / 2, 0);
  }
  return done(g, [-1, 1].map((s) => ({ x: s * half, z: 0, hw: 0.22, hd: 0.22, top: H })), H);
}

// 9: one dome pod: an orange geodesic shell glazed dark across its top, up on
// four legs with a ladder at the front.
function pod() {
  const g = new THREE.Group(), R = 2.3, base = 2.2, sy = 0.9;
  const shell = new THREE.IcosahedronGeometry(R, 1).scale(1, sy, 1);
  const pos = shell.attributes.position, col = [];
  const glass = new THREE.Color('#2e3a45'), orange = new THREE.Color('#e2742c');
  for (let f = 0; f < pos.count; f += 3) {
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const c = cy > R * sy * 0.55 ? glass : orange;
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  shell.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  add(g, shell, podMat, 0, base + R * sy - 0.35, 0);
  add(g, new THREE.CylinderGeometry(R * 0.85, R * 0.7, 0.45, 12), M.steel, 0, base + 0.2, 0);
  const legs = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, x = Math.sin(a) * 1.45, z = Math.cos(a) * 1.45;
    add(g, new THREE.CylinderGeometry(0.11, 0.2, base - 0.4, 8), M.steel, x, 0.45 + (base - 0.4) / 2, z);
    add(g, new THREE.CylinderGeometry(0.22, 0.26, 0.5, 8), M.orange, x, 0.25, z);
    legs.push({ x, z, hw: 0.27, hd: 0.27, top: base });
  }
  const len = Math.hypot(base, 0.8), tilt = Math.atan2(-0.8, base);
  for (const s of [-1, 1]) add(g, box(0.05, len, 0.05), M.steel, s * 0.28, base / 2, 1.7).rotation.x = tilt;
  for (let r = 1; r <= 5; r++) add(g, box(0.56, 0.04, 0.05), M.steel, 0, (r / 6) * base, 2.1 - (r / 6) * 0.8);
  return done(g, legs, base + 2 * R * sy - 0.35);
}

// The telecoms mast by the hut: not one of the landmarks, but the tallest thing
// up there, for checking the views against the photos.
function mast() {
  const g = new THREE.Group(), H = 26;
  add(g, box(1.4, 0.5, 1.4), M.stoneDark, 0, 0.25, 0);
  add(g, new THREE.CylinderGeometry(0.32, 0.5, H, 8), M.mast, 0, H / 2, 0);
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3;
    add(g, box(0.35, 2.2, 0.12), M.panel, Math.sin(a) * 0.48, H - 3.5, Math.cos(a) * 0.48).rotation.y = a;
    add(g, box(0.3, 1.2, 0.1), M.panel, Math.sin(a + 1) * 0.5, H - 8, Math.cos(a + 1) * 0.5).rotation.y = a + 1;
  }
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), M.steel, Math.sin(a) * 0.3, H + 0.6, Math.cos(a) * 0.3).rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
  }
  return done(g, [{ x: 0, z: 0, hw: 0.75, hd: 0.75, top: H + 1 }], H + 1.4);
}

const BUILD = { yurt, signpost, prayerWheels, ovoo, hut, photoFrame, cabin, swing, pod, mast };

// Gold letters on clear, for the frame.
function nameTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 108;
  const g = c.getContext('2d');
  g.fillStyle = '#e2b54a';
  g.strokeStyle = '#5a3d1c';
  g.lineWidth = 6;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 84px "PingFang SC", "Patrick Hand SC", sans-serif';
  g.strokeText(text, 256, 58);
  g.fillText(text, 256, 58);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A round number badge that keeps its size on screen and shows through things.
function numberTag(label) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fillStyle = label === 'M' ? '#5c6a73' : '#c8402f';
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = '#fbfaf5';
  g.stroke();
  g.fillStyle = '#fbfaf5';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${label.length > 1 ? 54 : 78}px "Patrick Hand SC", sans-serif`;
  g.fillText(label, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  s.scale.set(0.05, 0.05, 1);
  s.renderOrder = 10;
  return s;
}

// The landmarks, each where placeOf() says (moved in the map editor, or as laid
// out), on `hf`'s ground. Returns the group, the collision boxes (`footprints`,
// with `top` the height of each part) and each landmark's group by id. With
// `labels`, each carries its number (`tags`, which can be shown later too).
export function createSummit(hf, { labels = false } = {}) {
  const group = new THREE.Group();
  group.name = 'summit';
  const tags = new THREE.Group();
  tags.visible = labels;
  group.add(tags);
  const footprints = [], byId = new Map(), loading = [];
  for (const o of SUMMIT.objects) {
    const { x, z, yaw } = placeOf(o.id);
    const root = new THREE.Group();
    root.name = o.id;
    root.userData = { id: o.id, label: o.label };
    root.position.set(x, hf.heightAt(x, z), z);
    root.rotation.y = yaw;
    const stand = BUILD[o.kind]();
    stand.name = 'placeholder';
    if (stand.userData.ready) loading.push(stand.userData.ready);
    root.add(stand);
    group.add(root);
    byId.set(o.id, root);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const p of stand.userData.solids)
      footprints.push({ id: o.id, x: x + p.x * c + p.z * s, z: z - p.x * s + p.z * c, yaw: yaw + (p.yaw ?? 0), hw: p.hw, hd: p.hd, top: root.position.y + p.top });
    const tag = numberTag(o.label);
    tag.position.set(x, root.position.y + stand.userData.height + 1.5, z);
    tags.add(tag);
  }
  return { group, footprints, byId, tags, ready: Promise.all(loading) };
}
