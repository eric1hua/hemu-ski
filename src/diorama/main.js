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
import { Nav } from './nav.js';
import { YouMarker } from './you.js';
import { createCloudWipe } from '../intro.js';
import { noteArrival, takeArrivalNote, parseWhereabouts, watchWhereabouts } from '../destinations.js';

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

// Coming back from the game, the loading screen says so.
const arrivalNote = takeArrivalNote();
if (arrivalNote) document.querySelector('#loading > :last-child').textContent = arrivalNote;
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
  return { kind: 'lodge', ...at, group, ring: 64 * LODGE_SCALE, top: new THREE.Vector3(at.x, group.position.y + 20 * LODGE_SCALE, at.z) };
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
// Each lift's two stations, picked like the lodges.
const stations = lifts.lines.flatMap((line) => {
  const lift = runMap.lifts.find((l) => l.lift.id === line.id);
  const up = line.a.y <= line.b.y;
  return [[up ? line.a : line.b, 'bottom'], [up ? line.b : line.a, 'top']].map(([P, end]) => ({
    kind: 'station', lift, end, x: P.x, y: P.y, z: P.z, ring: 13 * STATION_SCALE,
    top: new THREE.Vector3(P.x, P.y + 6 * STATION_SCALE, P.z),
  }));
});
const skiers = new Skiers(hf, meta.runs, { count: RIDERS, scale: RIDER_SCALE });
scene.add(skiers.group);
const sky = createSky();
scene.add(sky);
// Where you are in the game: from the address (?you=), or else from a game
// open in another window, which keeps it moving as you ride.
const you = new YouMarker(hf, meta.center, document.getElementById('you-tag'), sunDir);
scene.add(you.group);
const savedYou = watchWhereabouts((w) => {
  you.set(w);
  youMoved();
});
you.set(parseWhereabouts(new URLSearchParams(location.search).get('you')) ?? savedYou);

document.getElementById('stats').textContent =
  `${runMap.groups.filter((g) => g.name).length} named runs · ${meta.lifts.length} lifts · ${RIDERS} riders`;

// ---------- Camera ----------
const MIN_ZOOM = 900;
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomToCursor = true;
controls.screenSpacePanning = false;
controls.minDistance = MIN_ZOOM;
controls.maxDistance = 24000;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = 1.42;
controls.autoRotateSpeed = 0.35;
const home = new THREE.Vector3(0, (top + baseY) / 2 + 150, 250);
controls.target.copy(home);
// The orbit pivot is kept inside the block.
const pivotBox = new THREE.Box3(new THREE.Vector3(-hf.half, baseY, -hf.half), new THREE.Vector3(hf.half, top, hf.half));

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
const pauseSpin = () => {
  controls.autoRotate = false;
  clearTimeout(idleTimer);
};
const resumeSpinLater = () => {
  clearTimeout(idleTimer);
  // Not while flying: a drag or scroll mid-flight ends with this too.
  // Nor while a place is picked: the card is about it.
  idleTimer = setTimeout(() => (controls.autoRotate = spin && !held.size && !nav.selected), 6000);
};
controls.addEventListener('start', pauseSpin);
controls.addEventListener('end', resumeSpinLater);

// Camera flights (Reset view, Look closer, the dive into the game), eased from
// the current view to `to`, turning round `toT`. A WASD key takes over.
let flyTo = null;
const easeOut = (t) => 1 - (1 - t) ** 3;
function flyCamera(to, toT, { dur = 1.4, ease = easeOut } = {}) {
  flyTo = { t: 0, dur, ease, from: camera.position.clone(), fromT: controls.target.clone(), to, toT };
}
document.getElementById('home').addEventListener('click', () => {
  flyCamera(home.clone().add(new THREE.Vector3(0.45, 0.52, 0.72).normalize().multiplyScalar(fitDistance())), home);
});
// A view of `point` from `dist` away, from the side the camera is on now,
// looking down at it between `tilt[0]` and `tilt[1]` radians from overhead.
const _sph = new THREE.Spherical();
function viewOf(point, dist, tilt = [0.55, 1.1]) {
  _sph.setFromVector3(camera.position.clone().sub(controls.target));
  _sph.phi = THREE.MathUtils.clamp(_sph.phi, tilt[0], tilt[1]);
  _sph.radius = dist;
  return point.clone().add(new THREE.Vector3().setFromSpherical(_sph));
}
// How far back to stand to see `size` metres of the table.
function frameDistance(size) {
  const fit = (size * 1.4) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  return THREE.MathUtils.clamp(fit, MIN_ZOOM * 1.3, fitDistance());
}

// ---------- WASD fly ----------
// Flies the camera itself, so W always goes where it's facing; only the
// mountain (it skims over it) and the table's edges stop it. W/S along the
// view, A/D sideways, E/Q up/down, Shift faster. Speed scales with how far
// away the middle of the view is.
const FLY_KEYS = { KeyW: [0, 0, 1], KeyS: [0, 0, -1], KeyA: [-1, 0, 0], KeyD: [1, 0, 0], KeyE: [0, 1, 0], KeyQ: [0, -1, 0] };
const held = new Set();
let boost = false;
const flyVel = new THREE.Vector3(), flyWant = new THREE.Vector3();
const fwd = new THREE.Vector3(), side = new THREE.Vector3(), was = new THREE.Vector3();
const sight = new THREE.Ray();
const MIN_PIVOT = camera.near * 2;
// How far along a ray it's inside the block, as [from, to], or null.
function blockSpan(ray) {
  let from = 0, to = Infinity;
  for (const k of ['x', 'y', 'z']) {
    const a = (pivotBox.min[k] - ray.origin[k]) / ray.direction[k];
    const b = (pivotBox.max[k] - ray.origin[k]) / ray.direction[k];
    from = Math.max(from, Math.min(a, b));
    to = Math.min(to, Math.max(a, b));
  }
  return from <= to ? [from, to] : null;
}
window.addEventListener('keydown', (e) => {
  boost = e.shiftKey;
  if (!FLY_KEYS[e.code] || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest?.('input, textarea, select')) return;
  e.preventDefault();
  held.add(e.code);
  flyTo = null;
  pauseSpin();
});
window.addEventListener('keyup', (e) => {
  boost = e.shiftKey;
  const had = held.size;
  // macOS drops other keys' keyups while Cmd is down, so letting go of Cmd
  // lets go of everything; otherwise a W released mid-shortcut flies on alone.
  if (e.key === 'Meta') held.clear();
  else held.delete(e.code);
  if (had && !held.size) resumeSpinLater();
});
const letGo = () => { held.clear(); boost = false; };
window.addEventListener('blur', letGo);
document.addEventListener('visibilitychange', letGo);

function fly(dt) {
  const p = camera.position, t = controls.target;
  flyWant.set(0, 0, 0);
  camera.getWorldDirection(fwd);
  side.crossVectors(fwd, camera.up).normalize();
  for (const code of held) {
    const [x, y, z] = FLY_KEYS[code];
    flyWant.addScaledVector(side, x).addScaledVector(camera.up, y).addScaledVector(fwd, z);
  }
  if (flyWant.lengthSq() > 0) {
    const speed = Math.max(p.distanceTo(t), MIN_ZOOM) * (boost ? 0.8 : 0.25);
    flyWant.normalize().multiplyScalar(speed);
  }
  flyVel.lerp(flyWant, 1 - Math.exp(-dt * 8));
  if (!held.size && flyVel.lengthSq() < 1) return flyVel.set(0, 0, 0);

  // Move the camera, keeping it above the mountain, and carry the pivot by
  // exactly as much, so OrbitControls neither turns nor zooms the view.
  was.copy(p);
  p.addScaledVector(flyVel, dt);
  const floor = (hf.inside(p.x, p.z) ? hf.heightAt(p.x, p.z) : baseY) + 80;
  if (p.y < floor) p.y = floor;
  t.add(was.subVectors(p, was));
  // Then slide the pivot along the line of sight onto the ground in the middle
  // of the view, so drag-to-spin turns around what's in front of you. With no
  // ground there, it keeps its distance but stays inside the block; only once
  // the camera itself reaches the block's edge does it stop.
  sight.set(p, fwd);
  const hit = runMap.pickGround(sight, pivotBox);
  const span = blockSpan(sight);
  if (hit && hit.distanceTo(p) > MIN_PIVOT) {
    t.copy(hit);
  } else if (span && span[1] > MIN_PIVOT) {
    sight.at(THREE.MathUtils.clamp(p.distanceTo(t), Math.max(span[0], MIN_PIVOT), span[1]), t);
  } else {
    was.copy(t);
    pivotBox.clampPoint(t, t);
    p.add(was.subVectors(t, was));
  }
  // Flying can get closer than the zoom limit; don't let OrbitControls push back.
  controls.minDistance = Math.min(MIN_ZOOM, p.distanceTo(t));
  needsPick = true;
}

// ---------- Hover ----------
const tip = document.getElementById('tip');
const mouse = new THREE.Vector2(), ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const bounds = new THREE.Box3(new THREE.Vector3(-hf.half, baseY, -hf.half), new THREE.Vector3(hf.half, top + 400, hf.half));
let pointerIn = false, dragging = false, downAt = null, needsPick = false, lastTap = null;
canvas.addEventListener('pointermove', (e) => {
  mouse.set(e.clientX, e.clientY);
  pointerIn = true;
  needsPick = true;
});
canvas.addEventListener('pointerleave', () => { pointerIn = false; needsPick = true; });
canvas.addEventListener('pointerdown', (e) => { dragging = true; downAt = [e.clientX, e.clientY]; needsPick = true; });
window.addEventListener('pointerup', (e) => {
  dragging = false;
  // A click or tap (no drag) picks at that spot and selects what's there, or
  // clears the selection on open ground. A second tap there straight after
  // flies closer instead. A finger gets twice the reach, and leaves no hover
  // behind it.
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) {
    const finger = e.pointerType !== 'mouse', now = performance.now();
    mouse.set(e.clientX, e.clientY);
    pointerIn = true;
    if (finger && lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      if (!wipe) flyCloser();
    } else {
      if (e.button === 0 && !wipe) nav.select(pick(finger));
      lastTap = finger ? { t: now, x: e.clientX, y: e.clientY } : null;
    }
  }
  if (e.pointerType !== 'mouse') pointerIn = false;
  downAt = null;
  needsPick = true;
});

// `finger`: reach twice as far, for a fingertip.
function pick(finger = false) {
  if (!pointerIn || dragging) return null;
  const w = window.innerWidth, h = window.innerHeight, k = finger ? 2 : 1;
  const spot = (you.shown && nearestSpot([you.item], you.reach, w, h, 12 * k))
    || nearestSpot(lodges, 55 * LODGE_SCALE, w, h, 12 * k) || nearestSpot(stations, 16 * STATION_SCALE, w, h, 12 * k);
  if (spot) return spot;
  const lift = runMap.nearestLift(mouse, camera, w, h, 9 * k);
  if (lift) return lift;
  const hit = groundAt(mouse.x, mouse.y);
  if (!hit) return null;
  const mPerPx = (camera.position.distanceTo(hit) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / h;
  return runMap.nearestRun(hit.x, hit.z, Math.max(20, mPerPx * 10 * k));
}
// The mountain under a point on the screen, or null.
function groundAt(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return runMap.pickGround(raycaster.ray, bounds);
}
// A double tap: the camera flies in to about half as far from the spot,
// turning round it, and no closer than the zoom limit.
function flyCloser() {
  const hit = groundAt(mouse.x, mouse.y);
  if (!hit) return;
  pauseSpin();
  flyCamera(viewOf(hit, Math.max(MIN_ZOOM, camera.position.distanceTo(hit) * 0.45)), hit);
  resumeSpinLater();
}

// A lodge or lift station is hovered within `reach` metres of its middle,
// measured on screen, and at least `min` pixels; of several, the closest for its size.
const lp = new THREE.Vector3();
function nearestSpot(list, reach, w, h, min = 12) {
  const pxPerM = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  let best = null, bd = 1;
  for (const l of list) {
    lp.copy(l.top).project(camera);
    if (lp.z > 1) continue;
    const r = Math.max(min, (reach * pxPerM) / camera.position.distanceTo(l.top));
    const d = Math.hypot((lp.x + 1) * w / 2 - mouse.x, (1 - lp.y) * h / 2 - mouse.y) / r;
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}
const describeLodge = (l) => ({
  badge: 'lodge', zh: l.zh, en: l.en,
  rows: [[`${l.ele.toLocaleString()} m`, ''], ['Tickets · food · rental · first aid', '']],
});
// You: what you're on, and how high.
function describeYou(y) {
  const lift = y.lift && runMap.lifts.find((l) => String(l.lift.id) === y.lift);
  const run = !lift && !y.outside && runMap.nearestRun(y.x, y.z, 22); // as the game's HUD counts it
  const on = lift ? `${lift.zh} ↑` : run ? run.name || 'Unnamed run' : y.outside ? 'Off the table' : 'Off-piste';
  const m = (v) => `${Math.round(v).toLocaleString()} m`;
  return { badge: 'you', zh: '你在这里', en: 'You are here', rows: [[on, ''], [lift ? `up to ${m(lift.topY)}` : m(y.y), '']] };
}
const describe = (item) =>
  item.kind === 'lodge' ? describeLodge(item) : item.kind === 'you' ? describeYou(item) : runMap.describe(item);

function showTip(item) {
  runMap.setHot(item);
  canvas.style.cursor = item ? 'pointer' : dragging ? 'grabbing' : 'grab';
  if (!item) { tip.classList.add('hidden'); return; }
  const d = describe(item);
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

// ---------- Navigation ----------
// Clicking a place selects it; its card can frame it ("Look closer") or send
// you into the game there. Opened from the game in this tab, the "You" pin's
// card goes back to it, just as you left it.
const gamePage = new URL('./', location.href).pathname;
const fromGame = (() => {
  try {
    const r = new URL(document.referrer);
    return history.length > 1 && r.origin === location.origin && [gamePage, `${gamePage}index.html`].includes(r.pathname);
  } catch {
    return false;
  }
})();
const nav = new Nav({
  hf, runs: meta.runs, runMap, lodges, stations, describe,
  you: () => (you.shown ? you.item : null),
  onSelect: (item) => (item ? pauseSpin() : resumeSpinLater()),
  onLook: (item) => {
    const f = nav.focus(item);
    flyCamera(viewOf(f.point, frameDistance(f.size)), f.point);
  },
  onGo: (key, item) => dive(item, () => location.assign(`./?at=${key}`), `Off to ${describe(item).zh}`),
  onBack: fromGame ? (item) => dive(item, () => history.back(), 'Back to riding') : null,
});
// The game moved you (or forgot you): the card and highlights follow.
function youMoved() {
  if (nav.selected === you.item) {
    if (you.shown) nav.refresh();
    else nav.select(null);
  }
  runMap.setHot(null);
  needsPick = true;
}

// Going: the camera dives at the spot while a cloud closes over the table, and
// the game opens in that cloud (destinations.js has the ?at= keys). Coming back
// with ?at= in the address, the table pulls out of the cloud the same way.
const setCloud = createCloudWipe(document.getElementById('cloud'));
let wipe = null;
// `go` leaves once the cloud has closed; `note` is for the game's loading screen.
function dive(item, go, note) {
  if (wipe) return;
  const f = nav.focus(item, { dive: true });
  flyCamera(viewOf(f.point, 160, [0.7, 1.0]), f.point, { dur: 1.3, ease: (t) => t * t * (3 - 2 * t) });
  pauseSpin();
  if (note) noteArrival(note);
  wipe = { t: 0, dur: 1.3, cloud: (t) => THREE.MathUtils.smoothstep(t, 0.35, 1), done: go };
}
function emerge(item) {
  const f = nav.focus(item);
  controls.target.copy(f.point);
  camera.position.copy(viewOf(f.point, 160, [0.7, 1.0]));
  flyCamera(viewOf(f.point, frameDistance(f.size)), f.point, { dur: 2.2 });
  setCloud(1);
  wipe = { t: 0, dur: 2.2, cloud: (t) => 1 - THREE.MathUtils.smoothstep(t, 0.05, 0.55) };
}
const startAt = nav.itemOf(new URLSearchParams(location.search).get('at'));
if (startAt) {
  nav.select(startAt);
  emerge(startAt);
}

// ---------- Touch ----------
// Touch mode, as in the game (touch.js): on from a coarse pointer or the first
// touch, off at a mouse click or a key. body.touch swaps the hint and sizes the
// cards for fingers. The first time on a touch screen, a card shows how to
// handle the table; Got it, or a tap beside it, puts it away for good.
const GUIDE_KEY = 'hemu-diorama.touch-guide';
const guide = document.getElementById('guide');
function setTouch(on) {
  document.body.classList.toggle('touch', on);
  if (!on) return;
  let seen = true;
  try { seen = !!localStorage.getItem(GUIDE_KEY); } catch {}
  if (!seen && !startAt) guide.classList.remove('hidden');
}
function closeGuide() {
  guide.classList.add('hidden');
  try { localStorage.setItem(GUIDE_KEY, '1'); } catch {}
}
guide.querySelector('.ok').addEventListener('click', closeGuide);
guide.addEventListener('click', (e) => {
  if (e.target === guide) closeGuide();
});
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && !document.body.classList.contains('touch')) setTouch(true);
  else if (e.pointerType === 'mouse') document.body.classList.remove('touch');
}, true);
window.addEventListener('keydown', () => document.body.classList.remove('touch'), true);
setTouch(matchMedia('(pointer: coarse)').matches);
// Back from the game with this page kept as it was: it's still in the cloud.
window.addEventListener('pageshow', (e) => {
  if (e.persisted && nav.selected) emerge(nav.selected);
});

// ---------- Loop ----------
const clock = new THREE.Clock();
let time = 0;
const hideForNormals = [sky, runMap.group, base.shadow];
document.getElementById('loading').classList.add('done');

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  if (flyTo) {
    flyTo.t = Math.min(1, flyTo.t + dt / flyTo.dur);
    const k = flyTo.ease(flyTo.t);
    camera.position.lerpVectors(flyTo.from, flyTo.to, k);
    controls.target.lerpVectors(flyTo.fromT, flyTo.toT, k);
    // A dive goes closer than the zoom limit; don't let OrbitControls push back.
    controls.minDistance = Math.min(MIN_ZOOM, camera.position.distanceTo(controls.target));
    if (flyTo.t >= 1) flyTo = null;
  }
  if (wipe) {
    wipe.t = Math.min(1, wipe.t + dt / wipe.dur);
    setCloud(wipe.cloud(wipe.t));
    if (wipe.t >= 1) {
      const w = wipe;
      wipe = null;
      w.done?.();
    }
  }
  fly(dt);
  controls.update(dt);
  // Keep the pivot over the table.
  const t = controls.target;
  pivotBox.clampPoint(t, t);
  // Zooming back out restores the zoom limit a flight may have lowered.
  controls.minDistance = Math.min(MIN_ZOOM, camera.position.distanceTo(t));

  runMap.setLineOpacity(THREE.MathUtils.clamp((camera.position.distanceTo(t) - 1500) / 5000, 0.18, 0.9));
  lifts.update(dt);
  skiers.update(dt, camera);
  you.update(camera, time, window.innerWidth, window.innerHeight);
  forest.update(camera.position);
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = time;

  if (needsPick || controls.autoRotate) {
    needsPick = false;
    showTip(pick());
  }
  placeTip();

  post.render(scene, camera, time, hideForNormals);
  you.drawOver(renderer, camera);
  requestAnimationFrame(frame);
}

window.__diorama = { scene, camera, controls, skiers, runMap, lifts, forest, renderer, nav, stations, lodges, you };
requestAnimationFrame(frame);
