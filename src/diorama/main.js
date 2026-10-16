// Tabletop diorama of the whole Hemu (Jikepulin) ski area: real terrain cut out
// as a block on a walnut plinth, every run painted on as a trail-map line,
// working lifts and tiny riders, viewed with an orbit camera. Reuses the game's
// terrain, forest, lift, rider and ink-rendering modules at toy proportions.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadWorld, PisteField, SERVICE_CENTRES } from '../world/data.js';
import { createDetailTerrain } from '../world/terrain.js';
import { createForest } from '../world/trees.js';
import { createLifts, createServiceCentre } from '../world/props.js';
import { createSky, SKY } from '../world/sky.js';
import { InkPost } from '../render/post.js';
import { toonUniforms } from '../render/toon.js';
import { createBase } from './base.js';
import { Skiers } from './skiers.js';
import { RunMap } from './runs.js';

const TREELINE = 2350;
// Toy proportions: props are oversized so they read from across the table.
const LIFT_SCALE = 5;
const STATION_SCALE = 3.2;
const TREE_SCALE = 2.8;
const LODGE_SCALE = 1.8;
const RIDER_SCALE = 8;
const RIDERS = 56;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const post = new InkPost(renderer, { depthScale: 0.03 });

const scene = new THREE.Scene();
scene.background = SKY.horizon;
const camera = new THREE.PerspectiveCamera(30, 1, 20, 80000);

const world = await loadWorld('diorama/');
await document.fonts.load('40px "Patrick Hand SC"').catch(() => {});
const { detail: hf, meta } = world;
const top = meta.detail.max, baseY = meta.detail.min - 160;

// ---------- Light ----------
const sunDir = new THREE.Vector3(0.62, 0.55, 0.56).normalize();
const sun = new THREE.DirectionalLight('#ffffff', toonUniforms.uSunIntensity.value);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sh = hf.half * 1.45;
Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh, near: 100, far: 22000 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 4;
sun.target.position.set(0, (top + baseY) / 2, 0);
sun.position.copy(sun.target.position).addScaledVector(sunDir, 10000);
scene.add(sun, sun.target);

// ---------- Diorama ----------
const piste = new PisteField(meta.runs, hf.size, 8);
const terrain = createDetailTerrain(hf, piste, TREELINE, { skirt: false });
terrain.traverse((o) => (o.castShadow = true));
scene.add(terrain);
const base = createBase(hf, {
  baseY,
  top,
  title: 'HEMU · 禾木  —  JIKEPULIN SKI RESORT',
  subtitle: `Altay, Xinjiang · ${Math.round(meta.detail.min).toLocaleString()}–${Math.round(top).toLocaleString()} m · ${meta.runs.length} runs · ${meta.lifts.length} lifts`,
});
scene.add(base.group);
// Base lodges, moved from game coordinates into the block's.
const lodges = SERVICE_CENTRES.map((c) => {
  const at = { ...c, x: c.x - meta.center.x, z: c.z - meta.center.z, faceTo: [c.faceTo[0] - meta.center.x, c.faceTo[1] - meta.center.z] };
  const group = createServiceCentre(hf, at, { scale: LODGE_SCALE });
  scene.add(group);
  return { kind: 'lodge', ...at, group, top: new THREE.Vector3(at.x, group.position.y + 20 * LODGE_SCALE, at.z) };
});
const forest = createForest(hf, piste, meta.lifts, {
  treeline: TREELINE, spacing: 34, scale: TREE_SCALE, chunk: 800, lodDistance: 2600, density: 0.45,
  clearings: lodges.map((l) => ({ x: l.x, z: l.z, r: 70 * LODGE_SCALE })),
});
scene.add(forest.group);
const lifts = createLifts(hf, meta.lifts, { scale: LIFT_SCALE, stationScale: STATION_SCALE, spacing: 2.4, speed: 14 });
scene.add(lifts.group);
const cableHeight = (l) => (l.type === 'magic_carpet' ? 3 : (l.type === 'gondola' ? 13 : 9) * LIFT_SCALE);
const runMap = new RunMap(hf, meta.runs, meta.lifts, { lineHalf: 10, liftCable: cableHeight });
scene.add(runMap.group);
const skiers = new Skiers(hf, meta.runs, { count: RIDERS, scale: RIDER_SCALE });
scene.add(skiers.group);
const sky = createSky();
scene.add(sky);

document.getElementById('stats').textContent =
  `${runMap.groups.filter((g) => g.name).length} named runs · ${meta.lifts.length} lifts · ${RIDERS} riders`;

// ---------- Camera ----------
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomToCursor = true;
controls.screenSpacePanning = false;
controls.minDistance = 900;
controls.maxDistance = 24000;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = 1.42;
controls.autoRotateSpeed = 0.35;
const home = new THREE.Vector3(0, (top + baseY) / 2 + 150, 250);
controls.target.copy(home);

function fitDistance() {
  const vf = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  // A portrait view sees the block's diagonal as it spins, so it needs more room.
  const room = camera.aspect < 1 ? 1.6 + (1 - camera.aspect) * 1.0 : 1.3;
  return (hf.size * room) / (2 * Math.tan(Math.min(vf, hfov) / 2));
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, pr);
  toonUniforms.uPixelRatio.value = pr;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
// Start from the south-east, where the runs face the sun.
camera.position.copy(home).add(new THREE.Vector3(0.45, 0.52, 0.72).normalize().multiplyScalar(fitDistance()));

// Auto-spin, paused while the user is handling it.
const spinBtn = document.getElementById('spin');
let spin = true, idleTimer = 0;
controls.autoRotate = spin;
const setSpin = (v) => {
  spin = v;
  spinBtn.setAttribute('aria-pressed', String(v));
  controls.autoRotate = v;
};
spinBtn.addEventListener('click', () => setSpin(!spin));
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  clearTimeout(idleTimer);
});
controls.addEventListener('end', () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => (controls.autoRotate = spin), 6000);
});
document.getElementById('home').addEventListener('click', () => {
  flyTo = { t: 0, from: camera.position.clone(), fromT: controls.target.clone() };
});
let flyTo = null;

// ---------- Hover ----------
const tip = document.getElementById('tip');
const mouse = new THREE.Vector2(), ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const bounds = new THREE.Box3(new THREE.Vector3(-hf.half, baseY, -hf.half), new THREE.Vector3(hf.half, top + 400, hf.half));
let pointerIn = false, dragging = false, downAt = null, needsPick = false;
canvas.addEventListener('pointermove', (e) => {
  mouse.set(e.clientX, e.clientY);
  pointerIn = true;
  needsPick = true;
});
canvas.addEventListener('pointerleave', () => { pointerIn = false; needsPick = true; });
canvas.addEventListener('pointerdown', (e) => { dragging = true; downAt = [e.clientX, e.clientY]; needsPick = true; });
window.addEventListener('pointerup', (e) => {
  dragging = false;
  // A tap (touch) picks at that spot.
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) {
    mouse.set(e.clientX, e.clientY);
    pointerIn = true;
  }
  downAt = null;
  needsPick = true;
});

function pick() {
  if (!pointerIn || dragging) return null;
  const w = window.innerWidth, h = window.innerHeight;
  const lodge = nearestLodge(w, h);
  if (lodge) return lodge;
  const lift = runMap.nearestLift(mouse, camera, w, h, 9);
  if (lift) return lift;
  ndc.set((mouse.x / w) * 2 - 1, -(mouse.y / h) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = runMap.pickGround(raycaster.ray, bounds);
  if (!hit) return null;
  const mPerPx = (camera.position.distanceTo(hit) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / h;
  return runMap.nearestRun(hit.x, hit.z, Math.max(20, mPerPx * 10));
}

// A lodge is hovered within its on-screen half-length of its roof.
const lp = new THREE.Vector3();
function nearestLodge(w, h) {
  const pxPerM = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  for (const l of lodges) {
    lp.copy(l.top).project(camera);
    if (lp.z > 1) continue;
    const r = Math.max(12, (55 * LODGE_SCALE * pxPerM) / camera.position.distanceTo(l.top));
    if (Math.hypot((lp.x + 1) * w / 2 - mouse.x, (1 - lp.y) * h / 2 - mouse.y) < r) return l;
  }
  return null;
}
const describeLodge = (l) => ({
  badge: 'lodge', zh: l.zh, en: l.en,
  rows: [[`${l.ele.toLocaleString()} m`, ''], ['Tickets · food · rental · first aid', '']],
});

function showTip(item) {
  runMap.setHot(item?.kind === 'lodge' ? null : item);
  canvas.style.cursor = item ? 'pointer' : dragging ? 'grabbing' : 'grab';
  if (!item) { tip.classList.add('hidden'); return; }
  const d = item.kind === 'lodge' ? describeLodge(item) : runMap.describe(item);
  tip.querySelector('.badge').className = `badge ${d.badge}`;
  tip.querySelector('.zh').textContent = d.zh;
  tip.querySelector('.en').textContent = d.en;
  tip.querySelector('.en').classList.toggle('hidden', !d.en);
  tip.querySelector('.rows').innerHTML = d.rows.map(([v, k]) => `<span><b>${v}</b>${k ? ` ${k}` : ''}</span>`).join('');
  tip.classList.remove('hidden');
}
function placeTip() {
  if (tip.classList.contains('hidden')) return;
  const r = tip.getBoundingClientRect();
  let x = mouse.x + 18, y = mouse.y + 20;
  if (x + r.width > window.innerWidth - 12) x = mouse.x - r.width - 14;
  if (y + r.height > window.innerHeight - 12) y = mouse.y - r.height - 14;
  tip.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let time = 0;
const hideForNormals = [sky, runMap.group, base.shadow];
document.getElementById('loading').classList.add('done');

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  if (flyTo) {
    flyTo.t = Math.min(1, flyTo.t + dt / 1.4);
    const k = 1 - (1 - flyTo.t) ** 3;
    const dest = home.clone().add(new THREE.Vector3(0.45, 0.52, 0.72).normalize().multiplyScalar(fitDistance()));
    camera.position.lerpVectors(flyTo.from, dest, k);
    controls.target.lerpVectors(flyTo.fromT, home, k);
    if (flyTo.t >= 1) flyTo = null;
  }
  controls.update(dt);
  // Keep the pivot over the table.
  const t = controls.target;
  t.x = THREE.MathUtils.clamp(t.x, -hf.half, hf.half);
  t.z = THREE.MathUtils.clamp(t.z, -hf.half, hf.half);
  t.y = THREE.MathUtils.clamp(t.y, baseY, top);

  runMap.setLineOpacity(THREE.MathUtils.clamp((camera.position.distanceTo(t) - 1500) / 5000, 0.18, 0.9));
  lifts.update(dt);
  skiers.update(dt, camera);
  forest.update(camera.position);
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = time;

  if (needsPick || controls.autoRotate) {
    needsPick = false;
    showTip(pick());
  }
  placeTip();

  post.render(scene, camera, time, hideForNormals);
  requestAnimationFrame(frame);
}

window.__diorama = { scene, camera, controls, skiers, runMap, lifts, forest, renderer };
requestAnimationFrame(frame);
