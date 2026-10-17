import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeToon } from '../render/toon.js';
import { PISTE_HALF_WIDTH } from './data.js';

const mats = {
  steel: makeToon({ color: '#9aa3a6' }),
  dark: makeToon({ color: '#3a4249' }),
  cabin: makeToon({ color: '#f0c24a' }, { rim: 1 }),
  cabinRed: makeToon({ color: '#d9604c' }, { rim: 1 }),
  cabinGray: makeToon({ color: '#aeb5b8' }, { rim: 1 }),
  glass: makeToon({ color: '#2f4752' }),
  wall: makeToon({ color: '#d8cfc0' }),
  roof: makeToon({ color: '#4f6f7a' }),
  wood: makeToon({ color: '#9b7458' }),
  cable: new THREE.LineBasicMaterial({ color: '#2a3138' }),
};
const DIFF_COLOR = { easy: '#4f8fd6', novice: '#4f8fd6', intermediate: '#d9534a', advanced: '#23303a', expert: '#23303a', freeride: '#f08a24' };

function station(width, depth, height) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mats.wall);
  body.position.y = height / 2;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, width * 0.75, 2.6, 4, 1), mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, depth / width);
  roof.position.y = height + 1.3;
  const door = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, height * 0.55, 0.3), mats.glass);
  door.position.set(0, height * 0.28, depth / 2);
  for (const o of [body, roof, door]) { o.castShadow = true; o.receiveShadow = true; g.add(o); }
  return g;
}

// Cabin paint per gondola line, as on the resort: No. 6 grey, No. 2 yellow,
// the rest red. Chairs keep their own colours.
const CABIN_PAINT = { '6号索道': 'gray', '2号索道': 'yellow' };
const PAINT = { red: null, yellow: '#f0c24a', gray: '#aeb5b8' }; // null: the model's own red
export const cabinPaint = (liftName) => CABIN_PAINT[liftName] || 'red';

// Tripo-made lift models (public/models/lifts). Until they load — or if they
// fail to — the box cars and stations above stand in.
// Cars are sized to these heights (grip to the bottom of the car) and moved so
// the origin sits in the grip's cable slot; +z is the direction of travel.
// The station is sized to 18 m long, its open end (+z) facing the line.
const CABIN_H = 4.2, CHAIR_H = 3.0, STATION_L = 18;
const MODEL_DIR = import.meta.env.BASE_URL + 'models/lifts/';
let modelsLoading = null;
export function loadLiftModels() {
  return (modelsLoading ||= (async () => {
    const loader = new GLTFLoader();
    const [cabin, chair, station] = await Promise.all(
      ['cabin', 'chair', 'station'].map((n) => loader.loadAsync(`${MODEL_DIR}${n}.glb`).then(meshOf)),
    );
    const cabinGeo = hangFromGrip(cabin.geometry, CABIN_H);
    const stationGeo = station.geometry;
    stationGeo.computeBoundingBox();
    const sb = stationGeo.boundingBox;
    const s = STATION_L / (sb.max.z - sb.min.z);
    stationGeo.translate(-(sb.min.x + sb.max.x) / 2, -sb.min.y, -(sb.min.z + sb.max.z) / 2).scale(s, s, s);
    stationGeo.computeBoundingBox();
    const toon = (m, map) => makeToon({ map, side: m.side }, { rim: 1 });
    return {
      cabin: cabinGeo,
      cabinMats: Object.fromEntries(Object.entries(PAINT).map(([k, hex]) => [k, toon(cabin.material, hex ? repaintRed(cabin.material.map, hex) : cabin.material.map)])),
      chair: hangFromGrip(chair.geometry, CHAIR_H),
      chairMat: toon(chair.material, chair.material.map),
      station: stationGeo,
      stationMat: makeToon({ map: station.material.map }),
      stationHalfWidth: stationGeo.boundingBox.max.x,
      stationHeight: stationGeo.boundingBox.max.y,
    };
  })());
}

// The GLB's single mesh, with its node transform baked into the geometry.
function meshOf(gltf) {
  let mesh = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  return { geometry, material: mesh.material };
}

// Scale a car to `height` and put the origin in its grip: the middle of the top
// few percent of the model, where the cable passes.
function hangFromGrip(geo, height) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const s = height / (max.y - min.y);
  const cut = (max.y - (max.y - min.y) * 0.05) * s;
  geo.scale(s, s, s);
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = lo.clone().negate(), v = new THREE.Vector3();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y < cut) continue;
    lo.min(v); hi.max(v);
  }
  return geo.translate(-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -(lo.z + hi.z) / 2);
}

// Copy of a texture with its saturated red paint swapped for `hex`, keeping the
// paint's light and dark (and blending the JPEG's soft edges).
function repaintRed(tex, hex) {
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  const to = {};
  new THREE.Color(hex).getRGB(to, THREE.SRGBColorSpace);
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], m = Math.max(p[i + 1], p[i + 2]);
    const k = THREE.MathUtils.smoothstep(r ? (r - m) / r : 0, 0.3, 0.6);
    if (!k) continue;
    const l = Math.min(r / 225, 1.1); // the model's red is ~225 at full light
    p[i] += (to.r * 255 * l - r) * k;
    p[i + 1] += (to.g * 255 * l - p[i + 1]) * k;
    p[i + 2] += (to.b * 255 * l - p[i + 2]) * k;
  }
  g.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(c);
  for (const key of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy']) out[key] = tex[key];
  return out;
}

// Round badge with the lift's number, floating above each of its stations.
function liftBadge(liftName, paint) {
  const no = liftName.match(/(\d+)号/)?.[1];
  if (!no) return null;
  const fill = { red: '#d9604c', yellow: '#f0c24a', gray: '#aeb5b8', chair: '#4f6f7a' }[paint];
  const ink = paint === 'red' || paint === 'chair' ? '#fbfaf5' : '#23303a';
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.beginPath();
  g.arc(128, 128, 116, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 14;
  g.strokeStyle = '#23303a';
  g.stroke();
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 168px "Patrick Hand SC", sans-serif';
  g.fillText(no, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // alphaTest: the clear corners mustn't write depth, or the ink pass outlines the square.
  return new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
}

// Number badge: size, height above the fallback station, and offset toward the
// line's end of the station (so lines sharing a station don't stack badges).
const BADGE = 6, BADGE_Y = 14, BADGE_Z = 5;
// How far a station is pulled back along its own line when the map data has two
// lines meeting end to end (No. 1's top is No. 7's bottom): they're separate
// stations on the mountain, back to back with a gap between.
const STATION_PULL = 20;

// `scale` sizes towers, cable height and cars; `stationScale` the buildings;
// `spacing` multiplies the gap between cars; `speed` is the haul rope in m/s.
// Besides the meshes it returns `lines` (each lift's cable from points[0] to the
// far end, for riding it, with the lift's OSM `id`) and `footprints` (station
// boxes, for collisions).
export function createLifts(hf, lifts, { scale = 1, stationScale = scale, spacing: gap = 1, speed = 5 } = {}) {
  const group = new THREE.Group();
  const movers = [];
  const belts = [];
  const lines = [];
  const footprints = [];
  const stations = [], badges = [];
  const towerGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.35, 0.5, 1, 6).translate(0, 0.5, 0),
  ]);
  const armGeo = new THREE.BoxGeometry(7.5, 0.4, 0.5);
  // Towers, arms and cars are instanced: there are hundreds of each.
  const towerMats = [], armMats = [];
  const _o = new THREE.Object3D();
  const endKey = (p) => `${p[0]},${p[1]}`;
  const ends = new Map();
  for (const l of lifts) {
    if (l.type === 'magic_carpet') continue;
    for (const p of [l.points[0], l.points[l.points.length - 1]]) ends.set(endKey(p), (ends.get(endKey(p)) || 0) + 1);
  }
  const ownEnd = (p, toward) => {
    if (ends.get(endKey(p)) < 2) return p;
    const dx = toward[0] - p[0], dz = toward[1] - p[1], L = Math.hypot(dx, dz);
    const d = STATION_PULL * stationScale;
    return [p[0] + (dx / L) * d, p[1] + (dz / L) * d];
  };
  const place = (list, x, y, z, ry, sx, sy = sx) => {
    _o.position.set(x, y, z);
    _o.rotation.set(0, ry, 0);
    _o.scale.set(sx, sy, sx);
    _o.updateMatrix();
    list.push(_o.matrix.clone());
  };

  for (const lift of lifts) {
    if (lift.type === 'magic_carpet') {
      const belt = magicCarpet(hf, lift, stationScale);
      group.add(belt.mesh);
      belts.push(belt);
      continue;
    }
    const pts0 = lift.points, last = pts0.length - 1;
    const a = ownEnd(pts0[0], pts0[1]), b = ownEnd(pts0[last], pts0[last - 1]);
    const A = new THREE.Vector3(a[0], hf.heightAt(a[0], a[1]), a[1]);
    const B = new THREE.Vector3(b[0], hf.heightAt(b[0], b[1]), b[1]);
    const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const yaw = Math.atan2(dir.x, dir.z);
    const isGondola = lift.type === 'gondola';
    const cableH = (isGondola ? 13 : 9) * scale;
    const paint = isGondola ? cabinPaint(lift.name) : 'chair';
    const badge = lift.name && liftBadge(lift.name, paint);

    for (const [P, flip] of [[A, 0], [B, Math.PI]]) {
      const st = new THREE.Group();
      st.add(station(14, 18, 7));
      st.scale.setScalar(stationScale);
      st.position.copy(P);
      st.rotation.y = yaw + flip;
      group.add(st);
      stations.push(st);
      if (badge) {
        const sign = new THREE.Sprite(badge);
        sign.scale.setScalar(BADGE);
        sign.position.set(0, BADGE_Y, BADGE_Z);
        st.add(sign);
        badges.push(sign);
      }
      footprints.push({ x: P.x, z: P.z, yaw, hw: 7 * stationScale, hd: 9 * stationScale });
    }

    // Towers every ~140 m; the cable runs tower-to-tower at a fixed clearance.
    const nT = Math.max(2, Math.round(len / 140));
    const pts = [];
    for (let i = 0; i <= nT; i++) {
      const t = i / nT;
      const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
      const y = hf.heightAt(x, z);
      pts.push(new THREE.Vector3(x, y + cableH, z));
      if (i === 0 || i === nT) continue;
      place(towerMats, x, y - 0.5, z, 0, scale, cableH + 1);
      place(armMats, x, y + cableH + 0.3, z, yaw + Math.PI / 2, scale);
    }
    pts[0].y = A.y + 6 * scale;
    pts[nT].y = B.y + 6 * scale;

    const lanes = [-3 * scale, 3 * scale].map((off) => pts.map((p) => p.clone().addScaledVector(side, off)));
    for (const lane of lanes) {
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(lane), mats.cable));
    }
    const laneLen = lanes.map((lane) => {
      const acc = [0];
      for (let i = 1; i < lane.length; i++) acc.push(acc[i - 1] + lane[i].distanceTo(lane[i - 1]));
      return acc;
    });
    lines.push({ id: lift.id, name: lift.name, type: lift.type, a: A, b: B, cable: lanes[0], acc: laneLen[0] });

    // Cabins / chairs riding the loop: up on one lane, down on the other.
    const spacing = (isGondola ? 55 : 25) * gap;
    const n = Math.floor(laneLen[0][laneLen[0].length - 1] / spacing);
    for (let laneIdx = 0; laneIdx < 2; laneIdx++) {
      for (let i = 0; i < n; i++) {
        const kind = paint;
        movers.push({ kind, lane: lanes[laneIdx], acc: laneLen[laneIdx], s: i * spacing, up: laneIdx === 0, yaw });
      }
    }
  }

  const instanced = (geo, mat, count) => {
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = true;
    im.frustumCulled = false; // instances span the whole map and move
    group.add(im);
    return im;
  };
  for (const [geo, mat, list] of [[towerGeo, mats.steel, towerMats], [armGeo, mats.dark, armMats]]) {
    if (!list.length) continue;
    const im = instanced(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
  }
  const fleets = {};
  for (const kind of ['red', 'yellow', 'gray', 'chair']) {
    const mine = movers.filter((m) => m.kind === kind);
    if (!mine.length) continue;
    const im = instanced(carGeometry(kind), carMat, mine.length);
    mine.forEach((m, i) => { m.mesh = im; m.index = i; });
    fleets[kind] = im;
  }

  // Swap in the Tripo models once they arrive.
  loadLiftModels().then((md) => {
    for (const [kind, im] of Object.entries(fleets)) {
      im.geometry = kind === 'chair' ? md.chair : md.cabin;
      im.material = kind === 'chair' ? md.chairMat : md.cabinMats[kind];
    }
    for (const st of stations) {
      const m = new THREE.Mesh(md.station, md.stationMat);
      m.castShadow = m.receiveShadow = true;
      st.children[0].removeFromParent();
      st.add(m);
    }
    for (const b of badges) b.position.y = md.stationHeight + BADGE * 0.75;
    for (const f of footprints) f.hw = md.stationHalfWidth * stationScale;
  }).catch((err) => console.warn('Lift models failed to load; keeping the box stand-ins.', err));

  const tmp = new THREE.Vector3();
  return {
    group,
    lines,
    footprints,
    update(dt) {
      for (const b of belts) b.tex.offset.y = (b.tex.offset.y - dt * b.rate) % 1;
      for (const m of movers) {
        const total = m.acc[m.acc.length - 1];
        m.s = (m.s + dt * speed) % total;
        const d = m.up ? m.s : total - m.s;
        let i = 1;
        while (i < m.acc.length - 1 && m.acc[i] < d) i++;
        const t = (d - m.acc[i - 1]) / (m.acc[i] - m.acc[i - 1]);
        tmp.lerpVectors(m.lane[i - 1], m.lane[i], t);
        _o.position.copy(tmp);
        _o.rotation.set(0, m.yaw + (m.up ? 0 : Math.PI), Math.sin(m.s * 0.3) * 0.03);
        _o.scale.setScalar(scale);
        _o.updateMatrix();
        m.mesh.setMatrixAt(m.index, _o.matrix);
      }
      for (const im of Object.values(fleets)) im.instanceMatrix.needsUpdate = true;
    },
  };
}

// Conveyor belt for beginners, draped over the ground with a scrolling stripe.
function magicCarpet(hf, lift, scale) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a4249';
  g.fillRect(0, 0, 16, 64);
  g.fillStyle = '#9aa3a6';
  g.fillRect(0, 0, 16, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const half = 0.6 * scale, lift0 = 0.3 * scale, step = 4;
  const pts = [];
  const p = lift.points;
  for (let i = 0; i < p.length - 1; i++) {
    const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    for (let d = 0; d < L; d += step) pts.push([p[i][0] + ((p[i + 1][0] - p[i][0]) * d) / L, p[i][1] + ((p[i + 1][1] - p[i][1]) * d) / L]);
  }
  pts.push(p[p.length - 1]);
  const pos = [], uv = [], idx = [];
  let v = 0;
  pts.forEach(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    if (i) v += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]) / (half * 3);
    for (const s of [-1, 1]) {
      const px = x + nx * half * s, pz = z + nz * half * s;
      pos.push(px, hf.heightAt(px, pz) + lift0, pz);
      uv.push((s + 1) / 2, v);
    }
    if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, makeToon({ map: tex, side: THREE.DoubleSide }, { hatch: 0 }));
  mesh.receiveShadow = true;
  // The belt moves at ~1 m/s; texture v is in units of 3 half-widths.
  return { mesh, tex, rate: 1 / (half * 3) };
}

// Cars are merged into one vertex-coloured mesh each (one draw call per car).
const carMat = makeToon({ vertexColors: true }, { rim: 1 });
const carGeos = new Map();
function part(geo, color, x, y, z) {
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => c.toArray()[i % 3]), 3));
  return geo;
}
function carGeometry(kind) {
  if (carGeos.has(kind)) return carGeos.get(kind);
  const parts = kind === 'chair'
    ? [
        part(new THREE.BoxGeometry(0.1, 2.0, 0.1), mats.dark.color, 0, -1, 0),
        part(new THREE.BoxGeometry(2.4, 0.15, 0.7), mats.steel.color, 0, -2, 0),
        part(new THREE.BoxGeometry(2.4, 0.7, 0.1), mats.steel.color, 0, -1.65, -0.35),
      ]
    : [
        part(new THREE.BoxGeometry(0.12, 2.2, 0.12), mats.dark.color, 0, -1.1, 0),
        part(new THREE.BoxGeometry(1.9, 2.0, 2.2), { red: mats.cabinRed, yellow: mats.cabin, gray: mats.cabinGray }[kind].color, 0, -3.1, 0),
        part(new THREE.BoxGeometry(1.95, 0.8, 1.7), mats.glass.color, 0, -2.7, 0),
        part(new THREE.BoxGeometry(1.7, 0.25, 2.0), mats.dark.color, 0, -2.0, 0),
      ];
  const g = mergeGeometries(parts);
  carGeos.set(kind, g);
  return g;
}

// A single cabin, e.g. the one the player rides in. `setLine(name)` paints it
// for that gondola line.
export function gondolaCabin() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(carGeometry('red'), carMat);
  m.castShadow = true;
  g.add(m);
  let paint = 'red', models = null;
  const apply = () => {
    if (models) { m.geometry = models.cabin; m.material = models.cabinMats[paint]; }
    else m.geometry = carGeometry(paint);
  };
  loadLiftModels().then((md) => { models = md; apply(); }).catch(() => {});
  g.setLine = (name) => { paint = cabinPaint(name); apply(); };
  return g;
}

// Bamboo-style marker poles every ~35 m down both edges of each run.
export function createPisteMarkers(hf, runs) {
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5).translate(0, 0.9, 0);
  const capGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.45, 5).translate(0, 1.6, 0);
  const byColor = new Map();
  for (const run of runs) {
    const p = run.points;
    let carry = 0;
    for (let s = 0; s < p.length - 1; s++) {
      const ax = p[s][0], az = p[s][1], bx = p[s + 1][0], bz = p[s + 1][1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let d = carry; d < len; d += 35) {
        const t = d / len;
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        for (const sd of [-1, 1]) {
          const x = cx + nx * sd * (PISTE_HALF_WIDTH + 1), z = cz + nz * sd * (PISTE_HALF_WIDTH + 1);
          const key = DIFF_COLOR[run.difficulty] || DIFF_COLOR.intermediate;
          if (!byColor.has(key)) byColor.set(key, []);
          byColor.get(key).push([x, hf.heightAt(x, z), z]);
        }
        carry = d + 35 - len;
      }
      if (carry < 0) carry = 0;
    }
  }
  const group = new THREE.Group();
  const pole = makeToon({ color: '#e9a23b' });
  const m = new THREE.Matrix4();
  for (const [color, list] of byColor) {
    const capMat = makeToon({ color });
    const poles = new THREE.InstancedMesh(poleGeo, pole, list.length);
    const caps = new THREE.InstancedMesh(capGeo, capMat, list.length);
    list.forEach(([x, y, z], i) => {
      m.makeTranslation(x, y - 0.1, z);
      poles.setMatrixAt(i, m);
      caps.setMatrixAt(i, m);
    });
    poles.computeBoundingSphere();
    caps.computeBoundingSphere();
    group.add(poles, caps);
  }
  return group;
}

function textTexture(lines, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#23303a';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, c.width - 14, c.height - 14);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 104px "Patrick Hand SC", "PingFang SC", sans-serif';
  ctx.fillText(lines[0], c.width / 2, lines[1] ? 100 : 128);
  if (lines[1]) {
    ctx.font = '56px "Patrick Hand SC", sans-serif';
    ctx.fillText(lines[1], c.width / 2, 196);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A base lodge like the ones on the resort's trail map: a long stone-and-glass
// hall under two folded shed roofs, a timber upper floor, an entrance canopy
// and a name board, with a plinth that steps down to the lowest ground under it.
// Its front faces `faceTo` (the nearby lift station). `scale` 1 is ~96 m long.
export function createServiceCentre(hf, { x, z, faceTo, roof, zh, en, ele }, { scale = 1 } = {}) {
  const W = 96, D = 34, H = 10;
  const g = new THREE.Group();
  const yaw = Math.atan2(faceTo[0] - x, faceTo[1] - z);
  // Lowest and highest ground under the (scaled, rotated) footprint.
  let lo = Infinity, hi = -Infinity;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let u = -0.5; u <= 0.5; u += 0.125)
    for (let v = -0.5; v <= 0.5; v += 0.25) {
      const lx = u * W * 1.3 * scale, lz = v * D * 1.6 * scale;
      const h = hf.heightAt(x + lx * c + lz * s, z - lx * s + lz * c);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
  g.position.set(x, hi, z);
  g.rotation.y = yaw;
  g.scale.setScalar(scale);
  const sink = (hi - lo) / scale + 2;

  const roofMat = makeToon({ color: roof }, { rim: 1 });
  const add = (geo, mat, px, py, pz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // Plinth / snow-cleared terrace, then the ground floor with its glass front.
  add(new THREE.BoxGeometry(W * 1.25, sink, D * 1.5), mats.wall, 0, -sink / 2 + 0.4, 0);
  add(new THREE.BoxGeometry(W, H, D), mats.wall, 0, H / 2, 0);
  add(new THREE.BoxGeometry(W * 0.86, H * 0.6, 0.6), mats.glass, 0, H * 0.42, D / 2);
  // Timber upper floor, set back, under two shed roofs folding opposite ways.
  add(new THREE.BoxGeometry(W * 0.94, 7, D * 0.72), mats.wood, 0, H + 3.5, -D * 0.06);
  const slab = (w, px, tilt) => {
    const r = add(new THREE.BoxGeometry(w, 1.2, D * 0.95), roofMat, px, H + 7.3 + Math.tan(Math.abs(tilt)) * w * 0.5, -D * 0.04);
    r.rotation.z = tilt;
  };
  slab(W * 0.54, -W * 0.24, -0.16);
  slab(W * 0.5, W * 0.25, 0.11);
  // Entrance canopy on posts.
  add(new THREE.BoxGeometry(22, 1, 9), roofMat, W * 0.12, H * 0.62, D / 2 + 4.2);
  for (const px of [-9, 9]) add(new THREE.CylinderGeometry(0.4, 0.4, H * 0.6, 6), mats.dark, W * 0.12 + px, H * 0.3, D / 2 + 8);
  // Name board above the entrance, readable from the lift station.
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 8.5),
    new THREE.MeshBasicMaterial({ map: textTexture([zh, `${en} · ${ele} m`], '#fbfaf5', '#23303a') }),
  );
  board.position.set(-W * 0.18, H + 3.6, D * 0.3 + 0.1);
  g.add(board);
  // The plinth's outline, for collisions.
  g.userData.footprint = { x, z, yaw, hw: W * 0.625 * scale, hd: D * 0.75 * scale };
  return g;
}

// An inflatable-style arch across the run, facing up-slope.
export function createBanner(hf, at, facing, lines, color) {
  const g = new THREE.Group();
  const y = hf.heightAt(at.x, at.z);
  g.position.set(at.x, y, at.z);
  g.rotation.y = Math.atan2(facing.x, facing.z);
  const legMat = makeToon({ color }, { rim: 1 });
  for (const sx of [-9, 9]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 6.5, 8).translate(0, 3.25, 0), legMat);
    leg.position.x = sx;
    leg.castShadow = true;
    g.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(20, 2.6, 0.9), legMat);
  beam.position.y = 7.2;
  beam.castShadow = true;
  const tex = textTexture(lines, '#fbfaf5', '#23303a');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(0, 7.2, 0.5);
  const back = sign.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.5;
  g.add(beam, sign, back);
  return g;
}
