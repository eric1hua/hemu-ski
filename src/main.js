import * as THREE from 'three';
import { loadWorld, PisteField, SERVICE_CENTRES, PISTE_HALF_WIDTH } from './world/data.js';
import { createDetailTerrain, createBackdrop } from './world/terrain.js';
import { createForest, GAME_FOREST } from './world/trees.js';
import { createLifts, createPisteMarkers, createBanner, createServiceCentre, gondolaCabin } from './world/props.js';
import { createSky, SKY } from './world/sky.js';
import { InkPost } from './render/post.js';
import { toonUniforms } from './render/toon.js';
import { Rider } from './player/rider.js';
import { BoardPhysics } from './player/physics.js';
import { Trail, Spray } from './player/fx.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';

const MAIN_RUN = '云霄峰道'; // Yunxiaofeng — the run under Gondola No. 6
const TREELINE = 2350;
const G = 9.81;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const post = new InkPost(renderer);

const scene = new THREE.Scene();
scene.background = SKY.horizon;
scene.fog = new THREE.Fog(SKY.horizon.clone().lerp(new THREE.Color('#ffffff'), 0.15), 900, 17000);
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 60000);

const sunDir = new THREE.Vector3(0.62, 0.55, 0.56).normalize();
const sun = new THREE.DirectionalLight('#ffffff', toonUniforms.uSunIntensity.value);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

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

// ---------- World ----------
// The map editor's saved edits apply unless the URL says ?original.
const world = await loadWorld('', { edits: !new URLSearchParams(location.search).has('original') });
await document.fonts.load('40px "Patrick Hand SC"').catch(() => {});
const { detail, meta } = world;
const piste = new PisteField(meta.runs, detail.size, 4, 60, detail.center);
const mainRun = meta.runs.find((r) => r.name === MAIN_RUN);

// The ride area runs from the summit down the valley to both service centres.
const terrain = createDetailTerrain(detail, piste, TREELINE, { tiles: 9, lodDistance: 1200 });
scene.add(terrain);
const backdrop = createBackdrop(world.backdrop, detail, TREELINE);
scene.add(backdrop);
const lodges = SERVICE_CENTRES.map((c) => createServiceCentre(detail, c));
scene.add(...lodges);
const forest = createForest(detail, piste, meta.lifts, { ...GAME_FOREST, edits: world.edits?.trees });
scene.add(forest.group);
const lifts = createLifts(detail, meta.lifts);
scene.add(lifts.group);
scene.add(createPisteMarkers(detail, meta.runs));
const sky = createSky();
scene.add(sky);

// Start a few metres below 6号's top station, at the head of Yunxiaofeng.
// From there the whole mountain is open: there is no finish line.
function along(points, dist) {
  let d = dist;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= L) {
      const t = d / L;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L };
    }
    d -= L;
  }
  const a = points[points.length - 2], b = points[points.length - 1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { x: b[0], z: b[1], dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L };
}
const runLength = mainRun.points.reduce((s, p, i, a) => (i ? s + Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) : 0), 0);
const startAt = along(mainRun.points, 14);
const gateAt = along(mainRun.points, 26);
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
scene.add(createBanner(detail, new THREE.Vector3(gateAt.x, 0, gateAt.z), new THREE.Vector3(-gateAt.dx, 0, -gateAt.dz), ['云霄峰道 · START', 'Yunxiaofeng · Gondola No.6'], '#f0c24a'));

// Lifts you can ride: each one's cable from its bottom station to its top.
// You board at the bottom station, or from a service centre's hall.
const rides = lifts.lines.map((l) => {
  const up = l.a.y <= l.b.y;
  const cable = up ? l.cable : [...l.cable].reverse();
  const acc = [0];
  for (let i = 1; i < cable.length; i++) acc.push(acc[i - 1] + cable[i].distanceTo(cable[i - 1]));
  const bottom = up ? l.a : l.b, top = up ? l.b : l.a;
  const dir = new THREE.Vector3(top.x - bottom.x, 0, top.z - bottom.z).normalize();
  const label = l.name || (l.type === 'gondola' ? 'Gondola' : 'Chair lift');
  return { label, bottom, top, dir, cable, acc, length: acc[acc.length - 1] };
});
const boardSpots = [
  ...SERVICE_CENTRES.map((c) => ({ ride: rides.find((r) => r.label === c.lift), x: c.x, z: c.z, r: 150, hall: c })),
  ...rides.map((ride) => ({ ride, x: ride.bottom.x, z: ride.bottom.z, r: 60 })),
].filter((s) => s.ride);
const cabin = gondolaCabin(true);
cabin.visible = false;
scene.add(cabin);

// ---------- Player ----------
const rider = new Rider();
scene.add(rider.root);
const phys = new BoardPhysics({ hf: detail, piste, forest, obstacles: [...lifts.footprints, ...lodges.map((l) => l.userData.footprint)] });
const trail = new Trail();
const spray = new Spray();
scene.add(trail.mesh, spray.points);
const hud = new Hud(world, piste);
const sound = new Sound();

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  sound.start();
  if (e.code === 'KeyR' && state === 'ride') startRun();
  if (e.code === 'KeyE' && state === 'ride' && boardable) board(boardable.ride);
  else if ((e.code === 'KeyE' || e.code === 'Space') && state === 'lift' && liftRide.t > 0.5) liftRide.t = liftRide.dur;
  if ((e.code === 'Enter' || e.code === 'Space') && panelNext) { const f = panelNext; panelNext = null; f(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const input = { steer: 0, tuck: false, brake: false, jump: false };
function readInput() {
  const L = keys.has('KeyA') || keys.has('ArrowLeft');
  const R = keys.has('KeyD') || keys.has('ArrowRight');
  input.steer = (L ? 1 : 0) - (R ? 1 : 0);
  input.tuck = keys.has('KeyW') || keys.has('ArrowUp');
  input.brake = keys.has('KeyS') || keys.has('ArrowDown');
  input.jump = keys.has('Space');
}

// ---------- Panels ----------
const panel = document.getElementById('panel');
let panelNext = null;
function showPanel(tab, html, next) {
  document.getElementById('panel-tab').textContent = tab;
  document.getElementById('panel-body').innerHTML = html;
  panel.classList.remove('hidden');
  panelNext = () => { panel.classList.add('hidden'); next(); };
}
document.getElementById('panel-next').addEventListener('click', () => {
  sound.start();
  if (panelNext) { const f = panelNext; panelNext = null; f(); }
});

// ---------- Game state ----------
let state = 'intro'; // intro → ride ⇄ lift
let elapsed = 0, timing = false, falls = 0;
let camDir = new THREE.Vector3(startAt.dx, 0, startAt.dz);

function startRun() {
  phys.reset(startAt.x, startAt.z, yawOf(startAt.dx, startAt.dz));
  trail.clear();
  elapsed = 0; timing = false; falls = 0;
  rider.pose.tumble = 0;
  camDir.set(startAt.dx, 0, startAt.dz);
  snapCamera();
  state = 'ride';
  hud.show(true);
  hud.toast('Drop in!');
}

phys.reset(startAt.x, startAt.z, yawOf(startAt.dx, startAt.dz));
showPanel('Hemu · 禾木', `
  <p>Top of <b>Gondola No. 6</b>, Hemu Jikepulin, Altay — 2,756 m.
  The whole mountain is yours: drop into <b>云霄峰道 Yunxiaofeng</b> (${Math.round(runLength)} m) or ride anywhere,
  all the way down the valley to the <b>East Service Centre</b> (东区服务大厅), 1,300 m below.
  Board a gondola there, or at any lift's bottom station, to head back up.</p>
  <div class="keys">
    <span><kbd>A</kbd><kbd>D</kbd></span><span>carve heelside / toeside</span>
    <span><kbd>W</kbd></span><span>tuck for speed · push along on the flat</span>
    <span><kbd>S</kbd></span><span>skid to scrub speed</span>
    <span><kbd>Space</kbd></span><span>hold and release to ollie · spin in the air</span>
    <span><kbd>E</kbd></span><span>board a lift at its station</span>
    <span><kbd>R</kbd></span><span>back to the top</span>
  </div>
  <p class="dim">Terrain: real elevation data. Runs and lifts: OpenStreetMap / OpenSkiMap.</p>`, startRun);

// ---------- Camera ----------
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _look = new THREE.Vector3();
const camLook = new THREE.Vector3();
function cameraTarget(out, look) {
  const sp = phys.speed;
  const d = 4.6 + Math.min(sp, 30) * 0.07;
  out.copy(phys.pos).addScaledVector(camDir, -d);
  out.y += 1.9 + Math.min(sp, 30) * 0.025;
  out.y = Math.max(out.y, detail.heightAt(out.x, out.z) + 1.5);
  look.copy(phys.pos).addScaledVector(camDir, 3.5);
  look.y += 0.7;
}
function snapCamera() {
  cameraTarget(camera.position, camLook);
  camera.lookAt(camLook);
}

let introT = 0;
// Slow orbit around the rider's toe side — a portrait shot with the run behind.
function updateIntroCamera(dt) {
  introT += dt;
  const a = Math.sin(introT * 0.25) * 0.6;
  _w.set(Math.cos(a) * 5.5, 1.6, Math.sin(a) * 5.5 - 1.5).applyQuaternion(rider.root.quaternion);
  camera.position.copy(phys.pos).add(_w);
  camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 1);
  _look.copy(phys.pos);
  _look.y -= 0.6; // keeps the rider in the upper half, clear of the panel
  camera.lookAt(_look);
  camera.fov = 50;
  camera.updateProjectionMatrix();
}

function updateRideCamera(dt) {
  const sp = phys.speed;
  _v.copy(phys.vel).setY(0);
  if (sp > 2 && phys.crashed <= 0) {
    _v.normalize();
    camDir.lerp(_v, 1 - Math.exp(-dt * 2.2)).normalize();
  }
  cameraTarget(_w, _look);
  camera.position.lerp(_w, 1 - Math.exp(-dt * 6));
  camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 1.2);
  camLook.lerp(_look, 1 - Math.exp(-dt * 10));
  camera.lookAt(camLook);
  camera.fov = 60 + Math.min(sp, 30) * 0.45;
  camera.updateProjectionMatrix();
}

// ---------- Rider pose from physics ----------
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _f = new THREE.Vector3(), _x = new THREE.Vector3(), _up = new THREE.Vector3();
function poseRider(dt) {
  _up.copy(phys.grounded ? phys.normal : _up.set(0, 1, 0));
  phys.forward(_f);
  _f.addScaledVector(_up, -_f.dot(_up)).normalize();
  _x.crossVectors(_f, _up);
  _m.makeBasis(_x, _up, _w.copy(_f).negate());
  _q.setFromRotationMatrix(_m);
  rider.root.quaternion.slerp(_q, 1 - Math.exp(-dt * 14));
  rider.root.position.copy(phys.pos);

  const sp = phys.speed;
  let lean = Math.atan2(sp * phys.yawRate, G);
  if (input.brake && phys.grounded) lean -= 0.35; // sit on the heel edge
  lean = THREE.MathUtils.clamp(lean, -1.0, 1.0);
  if (!phys.grounded) lean *= 0.3;
  rider.pose.tumble = phys.crashed > 0 ? rider.pose.tumble + dt * 9 : 0;
  rider.update(dt, {
    crouch: input.tuck ? 0.9 : input.brake ? 0.6 : 0.35 + phys.jumpCharge * 0.5,
    lean,
    twist: input.steer * 0.5,
    air: !phys.grounded,
  });
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let acc = 0, time = 0;
const STEP = 1 / 120;
const _side = new THREE.Vector3(), _tail = new THREE.Vector3(), _sv = new THREE.Vector3();
document.getElementById('loading').classList.add('done');

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  readInput();

  if (state === 'ride') {
    acc += dt;
    while (acc >= STEP) { phys.step(STEP, input); acc -= STEP; }
    for (const ev of phys.events.splice(0)) {
      if (ev.type === 'crash') { falls++; hud.toast(ev.reason === 'tree' ? 'Tree!' : 'Wipeout!'); trail.gap(phys.pos); }
      if (ev.type === 'respawn') respawnInPlace();
      if (ev.type === 'air') hud.toast(ev.spin >= 180 ? `${ev.spin}°!` : `Air ${ev.time.toFixed(1)}s`);
    }
    if (!timing && phys.pos.distanceTo(new THREE.Vector3(startAt.x, phys.pos.y, startAt.z)) > 3) timing = true;
    if (timing) elapsed += dt;
    updateBoarding();

    // Board track + spray.
    phys.forward(_f);
    _side.set(-_f.z, 0, _f.x);
    if (phys.grounded && phys.crashed <= 0) {
      trail.add(phys.pos, _side, 0.28);
      const kick = phys.slip * 0.6 + (input.brake ? 3 : 0) + Math.abs(phys.yawRate) * phys.speed * 0.08;
      const n = Math.min(6, Math.floor(kick * dt * 22 + Math.random()));
      if (n > 0 && phys.speed > 2) {
        _tail.copy(phys.pos).addScaledVector(_f, -0.5);
        _sv.copy(phys.vel).multiplyScalar(0.35).addScaledVector(_side, -Math.sign(phys.yawRate || 1) * 1.5);
        spray.emit(_tail, _sv, n, 2.2);
      }
    } else if (!phys.grounded) trail.gap(phys.pos);
    poseRider(dt);
    updateRideCamera(dt);
    hud.update(phys, elapsed);
    sound.update(phys.speed, phys.slip + (input.brake ? 4 : 0), phys.grounded);
  } else if (state === 'lift') {
    const label = `${liftRide.ride.label} ↑`;
    updateLift(dt); // may step you off at the top
    if (timing) elapsed += dt;
    hud.update(phys, elapsed, state === 'lift' ? label : null);
    sound.update(0, 0, false);
  } else {
    poseRider(dt);
    if (state === 'intro') updateIntroCamera(dt);
    sound.update(0, 0, false);
  }

  spray.update(dt);
  lifts.update(dt);
  forest.update(camera.position);
  terrain.update(camera.position);
  if (debug.cam) debug.cam(camera, phys);
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = time;
  sun.target.position.copy(phys.pos);
  sun.position.copy(phys.pos).addScaledVector(sunDir, 250);

  // Normal-edge lines fade out by ~600 m, so far geometry can skip that pass.
  post.render(scene, camera, time, [sky, spray.points, backdrop, ...forest.farMeshes]);
  requestAnimationFrame(frame);
}

// Back on your feet where you came to rest, heading the way you were going.
// After a tree you're set beside its trunk, on the side you were passing it.
const _n = new THREE.Vector3(), _d = new THREE.Vector3();
function respawnInPlace() {
  const dir = _d.copy(phys.crashDir);
  let x = phys.pos.x, z = phys.pos.z;
  for (let i = 0; i < 6; i++) {
    const t = forest.hit(x, z, 1.2);
    if (!t) break;
    const sx = -dir.z, sz = dir.x;
    const side = Math.sign((x - t.x) * sx + (z - t.z) * sz) || 1;
    x = t.x + sx * side * (t.r + 1.5);
    z = t.z + sz * side * (t.r + 1.5);
  }
  // Don't restart facing up the hill: turn across it instead.
  detail.normalAt(x, z, _n);
  const fall = _w.set(_n.x, 0, _n.z);
  if (fall.lengthSq() > 1e-4) {
    fall.normalize();
    const d = dir.dot(fall);
    if (d < 0.1) dir.addScaledVector(fall, 0.4 - d).normalize();
  }
  phys.reset(x, z, yawOf(dir.x, dir.z));
  camDir.copy(dir);
  snapCamera();
  trail.gap(phys.pos);
}

// ---------- Lifts ----------
let boardable = null, atHall = null;
function updateBoarding() {
  boardable = null;
  if (phys.crashed <= 0 && phys.grounded) {
    let bestD = Infinity;
    for (const s of boardSpots) {
      const d = Math.hypot(phys.pos.x - s.x, phys.pos.z - s.z);
      if (d < s.r && d < bestD) { bestD = d; boardable = s; }
    }
  }
  const hall = boardable?.hall ?? null;
  if (hall && hall !== atHall) hud.toast(hall.zh, 2200);
  atHall = hall;
  hud.prompt(boardable
    ? `${hall ? `${hall.en} · ` : ''}<kbd>E</kbd> ride <b>${boardable.ride.label}</b> up to ${Math.round(boardable.ride.top.y).toLocaleString()} m`
    : '');
}

let liftRide = null;
const _c = new THREE.Vector3();
function board(ride) {
  state = 'lift';
  // Sped up: 1–2 km of cable in 10–22 s.
  liftRide = { ride, t: 0, dur: THREE.MathUtils.clamp(ride.length / 110, 10, 22) };
  rider.root.visible = false;
  cabin.visible = true;
  cabin.rotation.set(0, Math.atan2(ride.dir.x, ride.dir.z), 0);
  phys.vel.set(0, 0, 0);
  trail.gap(phys.pos);
  hud.prompt('<kbd>Space</kbd> skip the ride');
  updateLift(0);
  camera.position.copy(_w);
}

function updateLift(dt) {
  const L = liftRide, { ride } = L;
  L.t = Math.min(L.dur, L.t + dt);
  const u = L.t / L.dur;
  const s = (u - Math.sin(u * Math.PI * 2) / (Math.PI * 2)) * ride.length; // eased start and stop
  let i = 1;
  while (i < ride.acc.length - 1 && ride.acc[i] < s) i++;
  cabin.position.lerpVectors(ride.cable[i - 1], ride.cable[i], (s - ride.acc[i - 1]) / (ride.acc[i] - ride.acc[i - 1]));
  cabin.rotation.z = Math.sin(L.t * 1.3) * 0.02;
  phys.pos.copy(cabin.position);
  // Camera off the cabin's flank, looking up the line past it.
  _c.set(-ride.dir.z, 0, ride.dir.x);
  _w.copy(cabin.position).addScaledVector(ride.dir, -14).addScaledVector(_c, 5);
  _w.y = Math.max(_w.y + 1, detail.heightAt(_w.x, _w.z) + 2);
  camera.position.lerp(_w, 1 - Math.exp(-dt * 4));
  _look.copy(cabin.position).addScaledVector(ride.dir, 6);
  _look.y -= 3;
  camLook.copy(_look);
  camera.lookAt(camLook);
  camera.fov = 58;
  camera.updateProjectionMatrix();
  if (L.t >= L.dur) unload(ride);
}

// Step off at the top station onto the best open snow nearby, facing downhill.
function unload(ride) {
  const P = ride.top;
  const blocked = (x, z) => phys.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < Math.hypot(o.hw, o.hd) + 3);
  let best = null;
  for (const R of [26, 36, 48]) { // within reach of a lift that starts here
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = P.x + Math.cos(a) * R, z = P.z + Math.sin(a) * R;
      if (!detail.inside(x, z, 60) || detail.holeAt(x, z) || blocked(x, z) || forest.hit(x, z, 3)) continue;
      detail.normalAt(x, z, _n);
      const slope = 1 - _n.y;
      const score = (piste.distAt(x, z) < PISTE_HALF_WIDTH ? 1 : 0) + Math.min(slope, 0.12) * 6 - R * 0.004;
      if (!best || score > best.score) best = { x, z, score, dx: _n.x, dz: _n.z };
    }
  }
  const at = best ?? { x: P.x + ride.dir.x * 30, z: P.z + ride.dir.z * 30, dx: ride.dir.x, dz: ride.dir.z };
  const len = Math.hypot(at.dx, at.dz) || 1;
  phys.reset(at.x, at.z, yawOf(at.dx / len, at.dz / len));
  camDir.set(at.dx / len, 0, at.dz / len);
  snapCamera();
  rider.root.visible = true;
  cabin.visible = false;
  liftRide = null;
  state = 'ride';
  hud.prompt('');
  hud.toast(`${ride.label} · ${Math.round(P.y).toLocaleString()} m`, 2000);
}

// Handy for poking at things from the console.
const debug = { cam: null };
window.__game = { phys, rider, camera, scene, input, startRun, debug, cabin, forest, get state() { return state; } };
requestAnimationFrame(frame);
