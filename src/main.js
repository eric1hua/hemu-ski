import * as THREE from 'three';
import { loadWorld, PisteField } from './world/data.js';
import { createDetailTerrain, createBackdrop } from './world/terrain.js';
import { createForest } from './world/trees.js';
import { createLifts, createPisteMarkers, createBanner } from './world/props.js';
import { createSky, SKY } from './world/sky.js';
import { InkPost } from './render/post.js';
import { toonUniforms } from './render/toon.js';
import { Rider } from './player/rider.js';
import { BoardPhysics } from './player/physics.js';
import { Trail, Spray } from './player/fx.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';

const MAIN_RUN = '云霄峰道'; // Yunxiaofeng — the run under Gondola No. 6
const TREELINE = 2480;
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
const world = await loadWorld();
await document.fonts.load('40px "Patrick Hand SC"').catch(() => {});
const { detail, meta } = world;
const piste = new PisteField(meta.runs, detail.size);
const mainRun = meta.runs.find((r) => r.name === MAIN_RUN);

scene.add(createDetailTerrain(detail, piste, TREELINE));
const backdrop = createBackdrop(world.backdrop, detail.half, TREELINE);
scene.add(backdrop);
const forest = createForest(detail, piste, meta.lifts, { treeline: TREELINE });
scene.add(forest.group);
const lifts = createLifts(detail, meta.lifts);
scene.add(lifts.group);
scene.add(createPisteMarkers(detail, meta.runs));
const sky = createSky();
scene.add(sky);

// Course: start a few metres below the top station, finish at the bottom one.
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
const finishAt = along(mainRun.points, runLength - 40);
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
scene.add(createBanner(detail, new THREE.Vector3(gateAt.x, 0, gateAt.z), new THREE.Vector3(-gateAt.dx, 0, -gateAt.dz), ['云霄峰道 · START', 'Yunxiaofeng · Gondola No.6'], '#f0c24a'));
scene.add(createBanner(detail, new THREE.Vector3(finishAt.x, 0, finishAt.z), new THREE.Vector3(-finishAt.dx, 0, -finishAt.dz), ['FINISH · 终点', `${Math.round(runLength)} m · Hemu Jikepulin`], '#d9604c'));

// ---------- Player ----------
const rider = new Rider();
scene.add(rider.root);
const phys = new BoardPhysics({ hf: detail, piste, forest });
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

let best = null;
try { best = JSON.parse(localStorage.getItem('hemu-best')); } catch {}
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

// ---------- Game state ----------
let state = 'intro';
let elapsed = 0, timing = false, topSpeed = 0, falls = 0;
let camDir = new THREE.Vector3(startAt.dx, 0, startAt.dz);

function startRun() {
  phys.reset(startAt.x, startAt.z, yawOf(startAt.dx, startAt.dz));
  trail.clear();
  elapsed = 0; timing = false; topSpeed = 0; falls = 0;
  rider.pose.tumble = 0;
  camDir.set(startAt.dx, 0, startAt.dz);
  snapCamera();
  state = 'ride';
  hud.show(true);
  hud.toast('Drop in!');
}

function finish() {
  state = 'finish';
  timing = false;
  const isBest = best === null || elapsed < best;
  if (isBest) { best = elapsed; try { localStorage.setItem('hemu-best', JSON.stringify(best)); } catch {} }
  showPanel('Finish · 终点', `
    <div class="big">${fmt(elapsed)}${isBest ? ' ★' : ''}</div>
    <p>Top speed <b>${Math.round(topSpeed * 3.6)} km/h</b> · falls <b>${falls}</b> · best <b>${fmt(best)}</b></p>
    <p class="dim">Hop back on Gondola No. 6 for another lap.</p>`, startRun);
}

phys.reset(startAt.x, startAt.z, yawOf(startAt.dx, startAt.dz));
showPanel('Hemu · 禾木', `
  <p>Top of <b>Gondola No. 6</b>, Hemu Jikepulin, Altay — 2,756 m.
  Below you: <b>云霄峰道 Yunxiaofeng</b>, ${Math.round(runLength)} m and 460 m of drop to the bottom station.</p>
  <div class="keys">
    <span><kbd>A</kbd><kbd>D</kbd></span><span>carve heelside / toeside</span>
    <span><kbd>W</kbd></span><span>tuck for speed</span>
    <span><kbd>S</kbd></span><span>skid to scrub speed</span>
    <span><kbd>Space</kbd></span><span>hold and release to ollie · spin in the air</span>
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
      if (ev.type === 'respawn') respawnOnRun();
      if (ev.type === 'air') hud.toast(ev.spin >= 180 ? `${ev.spin}°!` : `Air ${ev.time.toFixed(1)}s`);
    }
    if (!timing && phys.pos.distanceTo(new THREE.Vector3(startAt.x, phys.pos.y, startAt.z)) > 3) timing = true;
    if (timing) elapsed += dt;
    topSpeed = Math.max(topSpeed, phys.speed);
    if (Math.hypot(phys.pos.x - finishAt.x, phys.pos.z - finishAt.z) < 20) finish();

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
  } else if (state === 'finish') {
    const coast = { steer: 0, tuck: false, brake: true, jump: false };
    acc += dt;
    while (acc >= STEP) { phys.step(STEP, coast); acc -= STEP; }
    phys.events.length = 0;
    Object.assign(input, coast);
    poseRider(dt);
    updateRideCamera(dt);
    sound.update(phys.speed, phys.slip + 4, phys.grounded);
  } else {
    poseRider(dt);
    if (state === 'intro') updateIntroCamera(dt);
    sound.update(0, 0, false);
  }

  spray.update(dt);
  lifts.update(dt);
  forest.update(camera.position);
  if (debug.cam) debug.cam(camera, phys);
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = time;
  sun.target.position.copy(phys.pos);
  sun.position.copy(phys.pos).addScaledVector(sunDir, 250);

  // Normal-edge lines fade out by ~600 m, so far geometry can skip that pass.
  post.render(scene, camera, time, [sky, spray.points, backdrop, ...forest.farMeshes]);
  requestAnimationFrame(frame);
}

function respawnOnRun() {
  // Nearest point on the main run, nudged back uphill a little.
  let best = { d: Infinity, s: 0 }, s = 0;
  const p = mainRun.points;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= L; t += 4) {
      const x = a[0] + ((b[0] - a[0]) * t) / L, z = a[1] + ((b[1] - a[1]) * t) / L;
      const d = Math.hypot(x - phys.pos.x, z - phys.pos.z);
      if (d < best.d) best = { d, s: s + t };
    }
    s += L;
  }
  const at = along(p, Math.max(14, best.s - 15));
  phys.reset(at.x, at.z, yawOf(at.dx, at.dz));
  camDir.set(at.dx, 0, at.dz);
  snapCamera();
  trail.gap(phys.pos);
}

// Handy for poking at things from the console.
const debug = { cam: null };
window.__game = { phys, rider, camera, scene, input, startRun, debug, get state() { return state; } };
requestAnimationFrame(frame);
