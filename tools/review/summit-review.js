// Dev-only check of the summit (tools/review/summit.html): the game's ground and
// landmarks round the top of Gondolas No. 6 and 7, seen from cameras fitted to
// the four photos the layout came from (tools/summit-layout/v04/), with the
// photo laid over it and the user's arrows marked; and from straight above.
// ?view=A|B|C|D|top|free picks the view, ?photo=0.5 the photo's opacity,
// ?numbers=0 and ?arrows=0 hide those. window.__summit drives it from a script.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadWorld, PisteField } from '../../src/world/data.js';
import { raiseBanks, gameClearings } from '../../src/world/banks.js';
import { createDetailTerrain, createBackdrop } from '../../src/world/terrain.js';
import { createLifts } from '../../src/world/props.js';
import { createSky, SKY } from '../../src/world/sky.js';
import { shapeSummit, createSummit } from '../../src/world/summit.js';
import { SUMMIT } from '../../src/world/summit-layout.js';
import { InkPost } from '../../src/render/post.js';
import { toonUniforms } from '../../src/render/toon.js';

const TREELINE = 2350;
const PHOTOS = '/canvas/pages/ApwypO47DueJozzQFxZIw/assets/';
// Each photo, and the camera fitted to it: [x, y, z, yaw, pitch, roll, focal],
// x and z from the summit's origin, y its height; yaw from north clockwise,
// pitch down from level, roll about its axis, and the focal length in the
// photo's own pixels (its middle is the lens's). A, B and D were fitted to the
// ends of the two stations (B and D to the mast too). C wouldn't fit the
// stations (the game's sit ~100 px off its photo whatever the camera), so it
// was fitted to the mast and the landmarks A, B and D had placed: it checks
// their order and what hides what, not their places.
const VIEWS = {
  A: { file: 'asset--2127530644.jpg', size: [2265, 1284], cam: [17.44, 2921.69, 12.83, 1.5267, 1.7539, -1.0093, 1301.4] },
  B: { file: 'asset--1471199125.jpg', size: [2265, 1284], cam: [41.18, 2773.92, 34.13, -0.7187, 0.2047, -0.0206, 1718.7] },
  C: { file: 'asset--1407903703.webp', size: [3840, 2160], cam: [84.37, 2778.89, -81.03, 4.0724, 0.1773, 0.1466, 3876.3] },
  D: { file: 'asset-2098789449.png', size: [2778, 1284], cam: [4.3, 2834.41, 54.16, -0.0559, 0.751, 0.2022, 1415.4] },
};
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------- The world, as the game builds it ----------
const world = await loadWorld('', { edits: !params.has('original') });
const { meta } = world;
const piste = new PisteField(meta.runs, world.detail.size, 4, 60, world.detail.center);
const hf = raiseBanks(world.detail, meta.runs, piste, gameClearings(meta.lifts));
const frame = shapeSummit(hf, meta.lifts);
const [ox, oz] = frame.origin;

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const post = new InkPost(renderer);
const scene = new THREE.Scene();
scene.background = SKY.horizon;
scene.fog = new THREE.Fog(SKY.horizon.clone().lerp(new THREE.Color('#ffffff'), 0.15), 900, 17000);
const sun = new THREE.DirectionalLight('#ffffff', toonUniforms.uSunIntensity.value);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 1, far: 900 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
const plazaY = frame.plaza;
sun.target.position.set(ox - 20, plazaY, oz - 50);
sun.position.copy(sun.target.position).addScaledVector(new THREE.Vector3(0.62, 0.55, 0.56).normalize(), 400);
scene.add(sun, sun.target);
const terrain = createDetailTerrain(hf, piste, TREELINE, { tiles: 9, lodDistance: 1200, nearDistance: 300, corduroy: true });
const backdrop = createBackdrop(world.backdrop, hf, TREELINE);
const lifts = createLifts(hf, meta.lifts);
const summit = createSummit(hf, { labels: params.get('numbers') !== '0' });
const sky = createSky();
scene.add(terrain, backdrop, lifts.group, summit.group, sky);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 60000);
const orbit = new OrbitControls(camera, canvas);
orbit.enabled = false;

// ---------- Views ----------
let view = null;
// A photo's camera: its axes from yaw, pitch and roll as the fit had them.
function photoCamera([x, y, z, yaw, pitch, roll, focal], [w, h]) {
  const f = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const r0 = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const u0 = new THREE.Vector3().crossVectors(r0, f);
  const r = r0.clone().multiplyScalar(Math.cos(roll)).addScaledVector(u0, Math.sin(roll));
  const u = u0.clone().multiplyScalar(Math.cos(roll)).addScaledVector(r0, -Math.sin(roll));
  camera.position.set(ox + x, y, oz + z);
  camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f.clone().negate()));
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / 2 / focal));
}
function setView(name, cam) {
  view = name;
  const v = VIEWS[name];
  orbit.enabled = name === 'free';
  if (v) {
    if (cam) v.cam = cam;
    photoCamera(v.cam, v.size);
    $('photo').src = PHOTOS + v.file;
  } else if (name === 'top') {
    camera.position.set(ox - 18, plazaY + 330, oz - 48);
    camera.up.set(0, 0, -1); // north up
    camera.lookAt(ox - 18, plazaY, oz - 48);
    camera.up.set(0, 1, 0);
    camera.fov = 26;
  } else {
    camera.fov = 50;
    if (!orbit.enabled) return;
    orbit.target.set(ox, plazaY, oz - 30);
    camera.position.set(ox + 120, plazaY + 110, oz + 120);
    orbit.update();
  }
  $('photo').style.display = v ? '' : 'none';
  for (const b of $('views').children) b.classList.toggle('on', b.textContent === name);
  resize();
}
for (const name of [...Object.keys(VIEWS), 'top', 'free']) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => setView(name);
  $('views').append(b);
}

// The stage keeps the photo's shape, as big as the window allows.
function resize() {
  const v = VIEWS[view], W = innerWidth, H = innerHeight;
  const aspect = v ? v.size[0] / v.size[1] : W / H;
  const w = Math.min(W, H * aspect), h = w / aspect;
  Object.assign($('stage').style, { width: `${w}px`, height: `${h}px`, left: `${(W - w) / 2}px`, top: `${(H - h) / 2}px` });
  const pr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, pr);
  toonUniforms.uPixelRatio.value = pr;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  drawArrows();
}
addEventListener('resize', resize);

// The user's arrows on this photo, where they point (see summit-layout.js).
function drawArrows() {
  const svg = $('pins'), v = VIEWS[view];
  svg.innerHTML = '';
  if (!v || !$('arrows').checked) return;
  const { width, height } = svg.getBoundingClientRect();
  for (const o of SUMMIT.objects) {
    const uv = o.from[view];
    if (!uv) continue;
    const x = uv[0] * width, y = uv[1] * height;
    svg.insertAdjacentHTML('beforeend', `<g class="pin"><circle cx="${x}" cy="${y}" r="5"/><text x="${x + 8}" y="${y - 6}">${o.label.split('·')[0]}</text></g>`);
  }
}

$('opacity').oninput = () => ($('photo').style.opacity = $('opacity').value);
$('numbers').onchange = () => (summit.tags.visible = $('numbers').checked);
$('arrows').onchange = drawArrows;
$('numbers').checked = summit.tags.visible;
$('arrows').checked = params.get('arrows') !== '0';
$('opacity').value = params.get('photo') ?? 0;
$('opacity').oninput();

// Where each landmark stands and how high, for the record.
$('status').textContent = `origin ${ox.toFixed(1)}, ${oz.toFixed(1)} · plaza ${plazaY.toFixed(1)} m\n` + SUMMIT.objects.map((o) => {
  const g = summit.byId.get(o.id);
  return `${o.label.padEnd(3)} ${(g.position.x - ox).toFixed(1).padStart(6)} ${(g.position.z - oz).toFixed(1).padStart(7)}  ${g.position.y.toFixed(1)}`;
}).join('\n');

function render() {
  if (orbit.enabled) orbit.update();
  terrain.update(camera.position);
  sky.position.copy(camera.position);
  post.render(scene, camera, 0, [sky, backdrop]);
}
renderer.setAnimationLoop(render);
setView(params.get('view') || 'D');

// look(at, from): the free view from `from` toward `at`, both [x, y, z] from the
// origin, y above the plaza.
function look(at, from) {
  setView('free');
  orbit.target.set(ox + at[0], plazaY + at[1], oz + at[2]);
  camera.position.set(ox + from[0], plazaY + from[1], oz + from[2]);
  orbit.update();
}
window.__summit = { setView, look, VIEWS, camera, orbit, summit, hf, frame, render, scene };
