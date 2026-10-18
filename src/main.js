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
import { BigMap } from './bigmap.js';
import { Sound } from './audio.js';
import { createMenu } from './menu.js';
import { createIsland, createTitleLetters, createSnowSpecks, createCloudWipe } from './intro.js';
import {
  destinationFromURL, destinationKey, runTop, noteArrival, takeArrivalNote, whereaboutsParam, saveWhereabouts,
} from './destinations.js';
import { liftTitle } from './diorama/names.js';

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
// Sent from the diorama, the loading screen says where to.
const arrivalNote = takeArrivalNote();
if (arrivalNote) document.querySelector('#loading > :last-child').textContent = arrivalNote;
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
// Where a run starts and R takes you back to: here, unless the diorama sent
// you somewhere else (see Destinations, below).
let spawn = { key: `run:${mainRun.id}`, x: startAt.x, z: startAt.z, dx: startAt.dx, dz: startAt.dz, toast: 'Drop in!' };
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
  return { id: l.id, label, bottom, top, dir, cable, acc, length: acc[acc.length - 1] };
});
const boardSpots = [
  ...SERVICE_CENTRES.map((c) => ({ ride: rides.find((r) => r.label === c.lift), x: c.x, z: c.z, r: 150, hall: c })),
  ...rides.map((ride) => ({ ride, x: ride.bottom.x, z: ride.bottom.z, r: 60 })),
].filter((s) => s.ride);
const cabin = gondolaCabin();
cabin.visible = false;
scene.add(cabin);

// ---------- Player ----------
// Choose a rider under Rider in the menu (see below), or deep-link with
// ?rider=female/male/classic.
const rider = new Rider({ model: false });
scene.add(rider.root);
const phys = new BoardPhysics({ hf: detail, piste, forest, obstacles: [...lifts.footprints, ...lodges.map((l) => l.userData.footprint)] });
const trail = new Trail();
const spray = new Spray();
scene.add(trail.mesh, spray.points);
const hud = new Hud(world, piste);
const sound = new Sound();
const menu = createMenu(sound);
const bigMap = new BigMap({
  hud, detail, runs: meta.runs, lifts: rides, onClose: closeMap,
  onDiorama: () => leaveFor(dioramaHref('you'), 'Finding you on the diorama'),
});

const keys = new Set();
const isControl = (target) => target instanceof Element
  && !!target.closest('input, select, textarea, button, a, [contenteditable="true"]');
window.addEventListener('keydown', (e) => {
  // The big map takes the keys while it's open; Escape or M closes it.
  if (bigMap.isOpen) {
    if ((e.code === 'Escape' || e.code === 'KeyM') && !e.repeat) closeMap();
    return;
  }
  if (isControl(e.target)) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  sound.start();
  if ((e.code === 'Enter' || e.code === 'Space') && state === 'title') { begin(); return; }
  if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') && state === 'swoop') { swoop.t = 1; return; }
  if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') && state === 'arrive') { arrival.t = 1; return; }
  if (e.code === 'KeyR' && state === 'ride') startRun();
  if (e.code === 'KeyF' && !e.repeat && state === 'ride') toggleLocomotion();
  if (e.code === 'KeyM' && !e.repeat) openMap();
  if (e.code === 'KeyE' && state === 'ride' && boardable) board(boardable.ride);
  else if ((e.code === 'KeyE' || e.code === 'Space') && state === 'lift' && liftRide.t > 0.5) liftRide.t = liftRide.dur;
  if ((e.code === 'Enter' || e.code === 'Space') && panelNext) { const f = panelNext; panelNext = null; f(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('focusin', (e) => { if (isControl(e.target)) keys.clear(); });
const input = { steer: 0, tuck: false, brake: false, jump: false, walk: false, run: false };
function readInput() {
  const L = keys.has('KeyA') || keys.has('ArrowLeft');
  const R = keys.has('KeyD') || keys.has('ArrowRight');
  input.steer = (L ? 1 : 0) - (R ? 1 : 0);
  input.tuck = keys.has('KeyW') || keys.has('ArrowUp');
  input.brake = keys.has('KeyS') || keys.has('ArrowDown');
  input.jump = keys.has('Space');
  input.walk = input.tuck;
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
}

function restoreRide() {
  const wasWalking = rider.locomotion === 'walk';
  rider.setLocomotion('ride');
  if (wasWalking) {
    phys.vel.set(0, 0, 0);
    phys.yawRate = 0;
    phys.jumpCharge = 0;
    trail.gap(phys.pos);
  }
}
function toggleLocomotion() {
  if (!phys.grounded || phys.crashed > 0) return;
  if (rider.locomotion === 'walk') {
    restoreRide();
    hud.toast('On board · W push / tuck');
    return;
  }
  if (!rider.setLocomotion('walk')) {
    hud.toast('Choose a rider who can walk under Rider in the menu');
    return;
  }
  phys.vel.set(0, 0, 0);
  phys.yawRate = phys.jumpCharge = phys.slip = 0;
  trail.gap(phys.pos);
  hud.toast('On foot · W walk · Shift run · F board');
}

// ---------- Rider ----------
// The menu's Rider panel has a button per rider. The game remembers the one you
// ride (with the music and sound settings), so it's the same rider after a trip
// to the diorama, a reload or the map editor's Ride button; ?rider= picks one too.
const RIDERS = ['male', 'female', 'classic'];
const riderGroup = document.querySelector('#fly-rider .riders');
const riderButtons = [...riderGroup.querySelectorAll('[data-rider]')];
const riderStatus = document.getElementById('rider-status');
const showRider = (id) => {
  for (const b of riderButtons) b.setAttribute('aria-pressed', String(b.dataset.rider === id));
};
let riderSelection = 0, riderWanted = null;
async function chooseRider(id) {
  const selection = ++riderSelection;
  riderWanted = id;
  restoreRide();
  showRider(id);
  riderGroup.setAttribute('aria-busy', 'true');
  riderStatus.textContent = 'Loading rider…';
  let loaded = false;
  try { loaded = await rider.selectModel(id); }
  catch (err) { console.warn('Could not switch rider.', err); }
  if (selection !== riderSelection) return;
  // A failed load keeps the effective rider selected; an older request cannot
  // overwrite the status of the latest choice.
  riderWanted = rider.modelId;
  showRider(rider.modelId);
  riderGroup.removeAttribute('aria-busy');
  if (loaded && menu.prefs.rider !== rider.modelId) {
    menu.prefs.rider = rider.modelId;
    menu.save();
  }
  riderStatus.textContent = loaded
    ? (rider.model?.canWalk ? 'Ready · F switches board / on foot' : 'Ready · snowboarding')
    : 'Could not load that rider. Previous rider kept; choose again to retry.';
}
for (const b of riderButtons)
  b.addEventListener('click', () => {
    if (b.dataset.rider !== riderWanted) void chooseRider(b.dataset.rider);
  });
const riderParam = new URLSearchParams(location.search).get('rider');
void chooseRider([riderParam, menu.prefs.rider].find((id) => RIDERS.includes(id)) ?? 'male');

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
let state = 'title'; // title → swoop → intro → ride ⇄ lift, or arrive → ride from the diorama
let elapsed = 0, timing = false, falls = 0;
let camDir = new THREE.Vector3(startAt.dx, 0, startAt.dz);

// From your spawn, or from `at` ({ x, z, dx, dz, toast }) coming back to where you left off.
function startRun(at = spawn) {
  restoreRide();
  phys.reset(at.x, at.z, yawOf(at.dx, at.dz));
  trail.clear();
  elapsed = 0; timing = false; falls = 0;
  rider.pose.tumble = 0;
  camDir.set(at.dx, 0, at.dz);
  snapCamera();
  state = 'ride';
  hud.show(true);
  hud.toast(at.toast, 2000);
}

phys.reset(startAt.x, startAt.z, yawOf(startAt.dx, startAt.dz));
const introPanel = () => showPanel('Hemu · 禾木', `
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
    <span><kbd>F</kbd></span><span>board / on foot with a walking rider · choose under Rider</span>
    <span><kbd>W</kbd><kbd>Shift</kbd></span><span>walk / run on foot · A/D turn · S stop</span>
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
function introPose(t, pos, look) {
  const a = Math.sin(t * 0.25) * 0.6;
  pos.set(Math.cos(a) * 5.5, 1.6, Math.sin(a) * 5.5 - 1.5).applyQuaternion(rider.root.quaternion).add(phys.pos);
  pos.y = Math.max(pos.y, detail.heightAt(pos.x, pos.z) + 1);
  look.copy(phys.pos);
  look.y -= 0.6; // keeps the rider in the upper half, clear of the panel
}
function updateIntroCamera(dt) {
  introT += dt;
  introPose(introT, camera.position, _look);
  camera.lookAt(_look);
  setLens(50, 6);
}

// The title and the flight down scale the near plane and the ink pass's line
// thresholds with distance, so a 20 km view draws like a close-up.
function setLens(fov, dist) {
  camera.fov = fov;
  camera.near = THREE.MathUtils.clamp(dist / 400, 0.3, 50);
  camera.updateProjectionMatrix();
  post.material.uniforms.uDepthScale.value = THREE.MathUtils.clamp(150 / dist, 0.005, 1);
}

// ---------- Title ----------
// ?notitle skips straight to the panel at the top station.
const TITLE_FOV = 30;
const TITLE_ELEVATION = THREE.MathUtils.degToRad(24);
const FOG = { near: scene.fog.near, far: scene.fog.far };
const island = createIsland(detail, piste, { ...meta.detail, treeline: TREELINE });
const letters = createTitleLetters();
const specks = createSnowSpecks();
const setCloud = createCloudWipe(document.getElementById('cloud'));
const titleEl = document.getElementById('title');
scene.add(island, camera);
camera.add(letters.group, specks.points);
const pointer = new THREE.Vector2();
window.addEventListener('pointermove', (e) => pointer.set((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2));
document.getElementById('begin').addEventListener('click', () => begin());

let orbitA = 0.5; // 0 looks up the valley from the south
// Far enough out for the island's bounding sphere to fill the narrower field of view.
function titleDistance() {
  const vf = THREE.MathUtils.degToRad(TITLE_FOV) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  return (island.userData.radius / Math.sin(Math.min(vf, hf))) * (camera.aspect < 1 ? 1 : 0.9);
}
function titlePose(pos, look) {
  const D = titleDistance(), c = island.userData.center;
  pos.set(Math.sin(orbitA) * Math.cos(TITLE_ELEVATION), Math.sin(TITLE_ELEVATION), Math.cos(orbitA) * Math.cos(TITLE_ELEVATION))
    .multiplyScalar(D).add(c);
  look.copy(c);
  return D;
}
function setTitleWorld(on) {
  island.visible = on;
  backdrop.visible = !on;
  sky.material.uniforms.uFloat.value = on ? 1 : 0;
  scene.fog.near = on ? 1e7 : FOG.near;
  scene.fog.far = on ? 2e7 : FOG.far;
}
let titleDist = 1;
function updateTitleCamera(dt) {
  orbitA += dt * 0.035;
  titleDist = titlePose(camera.position, camLook);
  camera.lookAt(camLook);
  setLens(TITLE_FOV, titleDist);
}

// Begin: the letters scatter and the camera dives from the title orbit to the
// portrait shot at the top station. Distance shrinks exponentially (so each
// second covers the same share of the way, from 20 km down to 6 m), the camera
// circles round to the rider's side, diving steeper midway, and a cloud 4.5 km
// out hides the swap from the island to the full valley.
let swoop = null;
function begin() {
  if (state !== 'title') return;
  state = 'swoop';
  sound.start();
  titleEl.classList.add('gone');
  letters.leave();
  const pos1 = new THREE.Vector3(), anchor = new THREE.Vector3();
  introPose(0, pos1, anchor);
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(anchor));
  const to = new THREE.Spherical().setFromVector3(pos1.clone().sub(anchor));
  // Turn the short way round.
  to.theta = from.theta + THREE.MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, Math.PI * 2) - Math.PI;
  const l0 = from.radius, l1 = to.radius;
  swoop = {
    t: 0, dur: 6.5, anchor, l0, l1, from, to,
    lookOff: camLook.clone().sub(anchor),
    clearAt: Math.log(l0 / 4500) / Math.log(l0 / l1), // progress when 4.5 km out
    cleared: false,
  };
}
const _sph = new THREE.Spherical();
function updateSwoop(dt) {
  const S = swoop;
  S.t = Math.min(1, S.t + dt / S.dur);
  const e = S.t * S.t * S.t * (S.t * (S.t * 6 - 15) + 10); // smootherstep
  const u = THREE.MathUtils.smoothstep(S.t, 0, 0.85);
  _sph.set(
    S.l0 * Math.pow(S.l1 / S.l0, e),
    THREE.MathUtils.lerp(S.from.phi, S.to.phi, u) - Math.sin(Math.PI * u) * 0.45, // dive steeper midway
    THREE.MathUtils.lerp(S.from.theta, S.to.theta, u),
  );
  const len = _sph.radius;
  camera.position.setFromSpherical(_sph).add(S.anchor);
  if (detail.inside(camera.position.x, camera.position.z))
    camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 2);
  // The look point starts on the island's middle and closes on the rider as fast as the camera does.
  camLook.copy(S.anchor).addScaledVector(S.lookOff, (len / S.l0) * (1 - e));
  camera.lookAt(camLook);
  setLens(THREE.MathUtils.lerp(TITLE_FOV, 50, e), len);

  setCloud(THREE.MathUtils.clamp((0.1 - Math.abs(e - S.clearAt)) / 0.07, 0, 1));
  specks.opacity = 1 - THREE.MathUtils.smoothstep(S.t, 0.05, 0.3);
  if (!S.cleared && e >= S.clearAt) {
    S.cleared = true;
    setTitleWorld(false);
  }
  if (S.t >= 1) {
    setCloud(0);
    letters.group.visible = false; // still tumbling if the flight was skipped
    titleEl.classList.add('hidden');
    swoop = null;
    state = 'intro';
    introT = 0;
    introPanel();
  }
}

if (new URLSearchParams(location.search).has('notitle')) {
  state = 'intro';
  setTitleWorld(false);
  letters.group.visible = false;
  specks.opacity = 0;
  titleEl.classList.add('hidden');
  introPanel();
} else {
  setTitleWorld(true);
}

function updateRideCamera(dt) {
  const sp = phys.speed;
  _v.copy(phys.vel).setY(0);
  if (rider.locomotion === 'walk') {
    phys.forward(_v);
    camDir.lerp(_v, 1 - Math.exp(-dt * 2.2)).normalize();
  } else if (sp > 2 && phys.crashed <= 0) {
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
  const walking = rider.locomotion === 'walk';
  if (walking || !phys.grounded) _up.set(0, 1, 0);
  else _up.copy(phys.normal);
  phys.forward(_f);
  _f.addScaledVector(_up, -_f.dot(_up)).normalize();
  _x.crossVectors(_f, _up);
  _m.makeBasis(_x, _up, _w.copy(_f).negate());
  _q.setFromRotationMatrix(_m);
  if (walking) rider.root.quaternion.copy(_q);
  else rider.root.quaternion.slerp(_q, 1 - Math.exp(-dt * 14));
  rider.root.position.copy(phys.pos);

  const sp = phys.speed;
  let lean = Math.atan2(sp * phys.yawRate, G);
  if (input.brake && phys.grounded) lean -= 0.35; // sit on the heel edge
  lean = THREE.MathUtils.clamp(lean, -1.0, 1.0);
  if (!phys.grounded) lean *= 0.3;
  rider.pose.tumble = phys.crashed > 0 ? rider.pose.tumble + dt * 9 : 0;
  rider.update(dt, {
    crouch: walking ? 0 : input.tuck ? 0.9 : input.brake ? 0.6 : 0.35 + phys.jumpCharge * 0.5,
    lean: walking ? 0 : lean,
    twist: walking ? 0 : input.steer * 0.5,
    air: !walking && !phys.grounded,
    locomotion: rider.locomotion,
    speed: sp,
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

  if (bigMap.isOpen) {
    sound.update(0, 0, false); // the ride holds still under the map
  } else if (state === 'ride') {
    acc += dt;
    while (acc >= STEP) {
      if (rider.locomotion === 'walk') phys.stepWalk(STEP, input);
      else phys.step(STEP, input);
      acc -= STEP;
    }
    for (const ev of phys.events.splice(0)) {
      if (ev.type === 'crash') { falls++; hud.toast(ev.reason === 'tree' ? 'Tree!' : 'Wipeout!'); trail.gap(phys.pos); }
      if (ev.type === 'respawn') respawnInPlace();
      if (ev.type === 'air') hud.toast(ev.spin >= 180 ? `${ev.spin}°!` : `Air ${ev.time.toFixed(1)}s`);
    }
    if (!timing && phys.pos.distanceTo(new THREE.Vector3(spawn.x, phys.pos.y, spawn.z)) > 3) timing = true;
    if (timing) elapsed += dt;
    updateBoarding();

    // Board track + spray.
    phys.forward(_f);
    _side.set(-_f.z, 0, _f.x);
    if (rider.locomotion !== 'walk' && phys.grounded && phys.crashed <= 0) {
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
    sound.update(phys.speed, phys.slip + (input.brake ? 4 : 0), phys.grounded && rider.locomotion !== 'walk');
  } else if (state === 'lift') {
    const label = `${liftRide.ride.label} ↑`;
    updateLift(dt); // may step you off at the top
    if (timing) elapsed += dt;
    hud.update(phys, elapsed, state === 'lift' ? label : null);
    sound.update(0, 0, false);
  } else {
    poseRider(dt);
    if (state === 'intro') updateIntroCamera(dt);
    else if (state === 'title') updateTitleCamera(dt);
    else if (state === 'swoop') updateSwoop(dt);
    else if (state === 'arrive') updateArrival(dt);
    sound.update(0, 0, false);
  }
  if ((state === 'ride' || state === 'lift') && (whereT -= dt) <= 0) {
    whereT = 0.25;
    saveWhereabouts(whereabouts());
  }
  if (leaving) updateLeaving(dt);
  letters.update(dt, time, camera, titleDist * 0.45, pointer);
  specks.update(dt, time, camera, titleDist, renderer.getPixelRatio());
  if (island.visible) island.update(time);

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
  post.render(scene, camera, time, [sky, spray.points, specks.points, backdrop, ...forest.farMeshes]);
  requestAnimationFrame(frame);
}

// Back on your feet where you came to rest, heading the way you were going.
// After a tree you're set beside its trunk, on the side you were passing it.
const _n = new THREE.Vector3(), _d = new THREE.Vector3();
function respawnInPlace() {
  restoreRide();
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
    : !timing && spawn.hint ? spawn.hint : '');
}

let liftRide = null;
const _c = new THREE.Vector3();
function board(ride) {
  restoreRide();
  state = 'lift';
  // Sped up: 1–2 km of cable in 10–22 s.
  liftRide = { ride, t: 0, dur: THREE.MathUtils.clamp(ride.length / 110, 10, 22) };
  rider.root.visible = false;
  cabin.visible = true;
  cabin.setLine(ride.label);
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
  restoreRide();
  const P = ride.top;
  const at = topSpot(ride);
  phys.reset(at.x, at.z, yawOf(at.dx, at.dz));
  camDir.set(at.dx, 0, at.dz);
  snapCamera();
  rider.root.visible = true;
  cabin.visible = false;
  liftRide = null;
  state = 'ride';
  hud.prompt('');
  hud.toast(`${ride.label} · ${Math.round(P.y).toLocaleString()} m`, 2000);
}
function topSpot(ride) {
  const P = ride.top;
  const best = openSpot(P, [26, 36, 48], (x, z, n, R) => // within reach of a lift that starts here
    (piste.distAt(x, z) < PISTE_HALF_WIDTH ? 1 : 0) + Math.min(1 - n.y, 0.12) * 6 - R * 0.004);
  return best
    ? facing({ x: best.x, z: best.z, dx: best.nx, dz: best.nz }, ride.dir)
    : { x: P.x + ride.dir.x * 30, z: P.z + ride.dir.z * 30, dx: ride.dir.x, dz: ride.dir.z };
}

// Open snow: on the map, not in a deleted tile, clear of buildings and trees.
const blocked = (x, z) => phys.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < Math.hypot(o.hw, o.hd) + 3);
const openGround = (x, z) => detail.inside(x, z, 60) && !detail.holeAt(x, z) && !blocked(x, z) && !forest.hit(x, z, 3);
// The best open snow on rings round P, ranked by score(x, z, groundNormal, R).
function openSpot(P, radii, score) {
  let best = null;
  for (const R of radii)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = P.x + Math.cos(a) * R, z = P.z + Math.sin(a) * R;
      if (!openGround(x, z)) continue;
      detail.normalAt(x, z, _n);
      const sc = score(x, z, _n, R);
      if (!best || sc > best.score) best = { x, z, score: sc, nx: _n.x, nz: _n.z };
    }
  return best;
}
// Makes a spot's heading a unit vector; on dead-flat ground, where there's no
// downhill to face, it takes `or` instead.
function facing(at, or) {
  const len = Math.hypot(at.dx, at.dz);
  if (len < 1e-4) { at.dx = or.x; at.dz = or.z; } else { at.dx /= len; at.dz /= len; }
  return at;
}

// ---------- Destinations ----------
// The diorama sends you here with ?at=<key> (see destinations.js): to the top
// of a run, beside a lift station, or outside a service centre. It becomes your
// spawn, where R takes you back to, and the menu's way back to the diorama
// opens on it. Returns the spawn, or null if the key names nothing here.
const HINT = '<kbd>A</kbd><kbd>D</kbd> carve · <kbd>W</kbd> tuck or push · <kbd>R</kbd> back here';
function resolveDestination(dest) {
  const key = destinationKey(dest);
  if (dest.kind === 'run') {
    const top = runTop(detail, meta.runs, dest.id);
    if (!top) return null;
    // A few metres down from the top, past any lift station there and any
    // rise the smoothed terrain leaves at the very top, so you set off downhill.
    const rises = (a) => detail.heightAt(a.x + a.dx * 15, a.z + a.dz * 15) > detail.heightAt(a.x, a.z) - 0.3;
    let d = 14, at = along(top.points, d);
    while (d < 120 && (!openGround(at.x, at.z) || rises(at))) at = along(top.points, (d += 6));
    return { key, x: at.x, z: at.z, dx: at.dx, dz: at.dz, toast: 'Drop in!', hint: `<b>${top.run.name || 'Unnamed run'}</b> · ${HINT}` };
  }
  if (dest.kind === 'lodge') {
    const c = SERVICE_CENTRES.find((sc) => sc.id === dest.id);
    if (!c) return null;
    // Out the front, on level ground, facing the gondola the hall boards.
    const fx = c.faceTo[0] - c.x, fz = c.faceTo[1] - c.z, fl = Math.hypot(fx, fz);
    const at = openSpot(c, [80, 95, 110, 130], (x, z, n, R) => (((x - c.x) * fx + (z - c.z) * fz) / (R * fl)) * 2 - (1 - n.y) * 8 - R * 0.01);
    if (!at) return null;
    return facing({ key, x: at.x, z: at.z, dx: c.faceTo[0] - at.x, dz: c.faceTo[1] - at.z, toast: c.zh, hint: HINT }, camDir);
  }
  const lift = meta.lifts.find((l) => String(l.id) === dest.id);
  if (!lift) return null;
  // Magic carpets aren't rides; their ends still make places to start from.
  const ride = rides.find((r) => String(r.id) === dest.id) ?? liftEnds(lift);
  const { zh } = liftTitle(lift);
  if (dest.end === 'top') {
    return { key, ...topSpot(ride), toast: `${zh} · ${Math.round(ride.top.y).toLocaleString()} m`, hint: HINT };
  }
  // Beside the bottom station on the side you'd queue from, facing it.
  const P = ride.bottom;
  const at = openSpot(P, [22, 30, 40, 50], (x, z, n, R) =>
    -(((x - P.x) * ride.dir.x + (z - P.z) * ride.dir.z) / R) * 0.5 - (1 - n.y) * 6 - R * 0.01);
  if (!at) return null;
  return facing({
    key, x: at.x, z: at.z, dx: P.x - at.x, dz: P.z - at.z,
    toast: `${zh} · ${Math.round(P.y).toLocaleString()} m`, hint: HINT,
    board: dest.end === 'ride' && ride.cable ? ride : null,
  }, ride.dir);
}
function liftEnds(lift) {
  const [a, b] = [lift.points[0], lift.points[lift.points.length - 1]].map(([x, z]) => new THREE.Vector3(x, detail.heightAt(x, z), z));
  const [bottom, top] = a.y <= b.y ? [a, b] : [b, a];
  return { bottom, top, dir: new THREE.Vector3(top.x - bottom.x, 0, top.z - bottom.z).normalize() };
}

// ---------- Arrival ----------
// From the diorama the page opens inside the cloud the diorama dived into. The
// camera drops out of it, from high over the spot to just behind the rider,
// and you're off (or, for "Board and ride up", straight onto the lift).
// Space, Enter or Escape skips the drop. `dest` becomes your spawn; coming back
// to where you left off, you drop at `at` instead.
let arrival = null;
function arrive(dest, at = dest) {
  restoreRide();
  spawn = dest;
  linkDiorama();
  state = 'arrive';
  setTitleWorld(false);
  letters.group.visible = false;
  specks.opacity = 0;
  titleEl.classList.add('hidden');
  panel.classList.add('hidden'); // ?notitle opens on the intro panel
  panelNext = null;
  phys.reset(at.x, at.z, yawOf(at.dx, at.dz));
  camDir.set(at.dx, 0, at.dz);
  const end = new THREE.Vector3(), look = new THREE.Vector3();
  cameraTarget(end, look);
  const from = end.clone().addScaledVector(camDir, -260);
  from.y += 380;
  // A beat in the cloud first while the loading screen fades.
  arrival = { t: -0.25, dur: 2.8, end, look, from, at };
  setCloud(1);
  updateArrival(0);
}
function updateArrival(dt) {
  const A = arrival;
  A.t = Math.min(1, A.t + dt / A.dur);
  const u = Math.max(0, A.t);
  const e = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
  // The gap closes by the same share each moment, as on the title's flight.
  const k = (Math.pow(0.01, e) - 0.01) / 0.99;
  camera.position.lerpVectors(A.end, A.from, k);
  camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 2);
  camLook.copy(A.look);
  camera.lookAt(camLook);
  setLens(60, Math.max(6, camera.position.distanceTo(A.look)));
  setCloud(1 - THREE.MathUtils.smoothstep(u, 0, 0.4));
  if (A.t < 1) return;
  setCloud(0);
  setLens(60, 6);
  arrival = null;
  startRun(A.at);
  if (A.at === spawn && spawn.board) board(spawn.board);
}

// ---------- Whereabouts ----------
// Where you are, for the big map and the diorama's "You" pin (see
// destinations.js). Saved a few times a second while you ride, so a diorama
// open in another window follows you; a fresh page clears the last one.
const _fw = new THREE.Vector3();
let whereT = 0;
saveWhereabouts(null);
function whereabouts() {
  const ride = state === 'lift' ? liftRide.ride : null;
  const f = ride ? ride.dir : phys.forward(_fw);
  const bearing = THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)), 360);
  return { x: phys.pos.x, z: phys.pos.z, bearing, lift: ride?.id ?? null };
}

// ---------- Big map ----------
// Click the mini-map (or press M) while riding: the whole map, with you on it.
const minimapBtn = document.getElementById('minimap-open');
minimapBtn.addEventListener('mousedown', (e) => e.preventDefault()); // keep Space for the ollie
minimapBtn.addEventListener('click', () => openMap());
function openMap() {
  if (bigMap.isOpen || leaving || (state !== 'ride' && state !== 'lift')) return;
  const at = whereabouts();
  bigMap.open(at, hud.place, phys.pos.y);
  minimapBtn.setAttribute('aria-expanded', 'true');
  saveWhereabouts(at);
}
function closeMap() {
  bigMap.close();
  minimapBtn.setAttribute('aria-expanded', 'false');
}

// ---------- Back to the diorama ----------
// The menu's diorama button opens it on your spawn, after the cloud closes
// over the slope the way the diorama's own dive does; the big map's opens it
// on you. Either way the diorama puts its "You" pin where you are.
const dioramaLink = document.querySelector('#menu a.go');
function dioramaHref(at = spawn.key) {
  const placed = state !== 'title' && state !== 'swoop'; // not on the mountain yet
  return `./diorama.html?at=${at}${placed ? `&you=${whereaboutsParam(whereabouts())}` : ''}`;
}
function linkDiorama() {
  dioramaLink.href = dioramaHref();
}
// A new tab or window opens straight from the link, so it's kept current.
dioramaLink.addEventListener('pointerdown', linkDiorama);
dioramaLink.addEventListener('focus', linkDiorama);
let leaving = null;
dioramaLink.addEventListener('click', (e) => {
  if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab or window
  e.preventDefault();
  leaveFor(dioramaHref(), 'Back to the diorama');
});
function leaveFor(href, note) {
  if (leaving) return;
  noteArrival(note);
  keepResume();
  leaving = { t: 0, href };
}
function updateLeaving(dt) {
  leaving.t = Math.min(1, leaving.t + dt / 0.7);
  setCloud(THREE.MathUtils.smoothstep(leaving.t, 0, 1));
  if (leaving.t >= 1) {
    closeMap(); // back from the diorama, you ride on
    location.assign(leaving.href);
    leaving = null;
  }
}
// Back here with the page kept as it was: it's still in the cloud, and you ride
// on from where you were.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  setCloud(0);
  takeResume();
  takeArrivalNote();
});

// If the browser reloads the page instead (Back, or the diorama's "Back to
// riding"), it drops you where you left off: on the snow where you were, or
// at the top if you were riding a lift up. Your spawn stays as it was.
const RESUME_KEY = 'hemu-ski.resume';
function keepResume() {
  try {
    if (state === 'ride' || state === 'lift') sessionStorage.setItem(RESUME_KEY, JSON.stringify(whereabouts()));
    else sessionStorage.removeItem(RESUME_KEY); // from the title, Back is the title again
  } catch {}
}
function takeResume() {
  try {
    const w = JSON.parse(sessionStorage.getItem(RESUME_KEY));
    sessionStorage.removeItem(RESUME_KEY);
    return w && performance.getEntriesByType('navigation')[0]?.type === 'back_forward' ? w : null;
  } catch {
    return null;
  }
}
function resumeSpot(w) {
  if (w.lift) return resolveDestination({ kind: 'lift', id: String(w.lift), end: 'top' });
  const b = THREE.MathUtils.degToRad(w.bearing);
  return detail.inside(w.x, w.z) ? { x: w.x, z: w.z, dx: Math.sin(b), dz: -Math.cos(b), toast: 'Back on the snow' } : null;
}

linkDiorama();
const asked = destinationFromURL();
const askedDest = asked && resolveDestination(asked);
if (asked && !askedDest) console.warn(`No ${asked.kind} ${asked.id} on this map; starting at the top.`);
const back = takeResume();
const backAt = back && resumeSpot(back);
if (askedDest || backAt) arrive(askedDest ?? spawn, backAt ?? askedDest);

// Handy for poking at things from the console.
const debug = { cam: null };
window.__game = { phys, rider, camera, scene, input, startRun, debug, cabin, forest, resolveDestination, bigMap, openMap, whereabouts, get state() { return state; }, get spawn() { return spawn; } };
requestAnimationFrame(frame);
