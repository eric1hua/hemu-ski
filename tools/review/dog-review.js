// Dev-only inspection surface for the dog (tools/review/dog.html): the same rig and
// body the game uses, on a grid, with every posture, gait and one-off on a button.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InkPost } from '../../src/render/post.js';
import { loadDog, DogRig } from '../../src/dog/rig.js';
import { DogBody, POSTURES } from '../../src/dog/body.js';

const SCALE = 1.3;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e7edf0');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
const post = new InkPost(renderer);
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8b9ca8, 2));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(3, 5, 4);
sun.castShadow = true;
scene.add(sun);
const grid = new THREE.GridHelper(40, 160, 0x80939c, 0xb7c5cb);
scene.add(grid);

const rig = new DogRig(await loadDog());
const body = new DogBody(rig);
body.scale = SCALE;
const dog = new THREE.Group();
rig.scene.scale.setScalar(SCALE);
dog.add(rig.scene);
scene.add(dog);
window.__dog = { rig, body, dog };

const status = document.getElementById('status');
const acts = document.getElementById('acts');
const button = (parent, label, fn) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  parent.append(b);
  return b;
};
for (const p of POSTURES) button(acts, p, () => { body.posture = p; });
acts.append(document.createElement('br'));
for (const a of ['bark', 'yawn', 'shake', 'sneeze', 'leap']) button(acts, a, () => body.play(a));
acts.append(document.createElement('br'));
const sliders = {};
for (const [key, min, max, step] of [['wag', 0, 1.5, 0.05], ['tailUp', -1, 1, 0.05], ['pant', 0, 1, 0.05], ['sniff', 0, 1, 0.05], ['dig', 0, 1, 0.05],
  ['lean', 0, 1, 0.05], ['wiggle', 0, 1, 0.05], ['tilt', -0.6, 0.6, 0.05], ['tired', 0, 1, 0.05], ['lookYaw', -1.6, 1.6, 0.05], ['lookPitch', -1, 1, 0.05], ['turn', -2, 2, 0.1]]) {
  const label = document.createElement('label');
  label.innerHTML = `${key}<input type="range" min="${min}" max="${max}" step="${step}"><span></span>`;
  const input = label.querySelector('input'), out = label.querySelector('span');
  input.value = body[key] ?? 0;
  const set = () => { out.textContent = Number(input.value).toFixed(2); sliders[key] = Number(input.value); if (key in body) body[key] = sliders[key]; };
  input.oninput = set;
  set();
  acts.append(label);
}
let speed = 0, paused = false, elapsed = 0;
const speeds = document.getElementById('speeds');
for (const v of [0, 0.6, 1.2, 2, 3, 4.5, 6.5, 8]) button(speeds, `${v}`, () => { speed = v; });

let view = 'three';
const VIEWS = { side: [3.2, 0.6, 0], front: [0, 0.6, 3.2], three: [2.2, 1.0, 2.2], top: [0, 3.5, 0.01], back: [0.3, 0.8, -3.2] };
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => { view = b.dataset.view; place(true); };
document.getElementById('pause').onclick = () => { paused = !paused; };
const slope = document.getElementById('slope');
function place(snap) {
  const [x, y, z] = VIEWS[view];
  const target = dog.position.clone().add(new THREE.Vector3(0, 0.45, 0));
  if (snap) camera.position.copy(target).add(new THREE.Vector3(x, y, z));
  else camera.position.add(target.clone().sub(orbit.target));
  orbit.target.copy(target);
  orbit.update();
}
place(true);

// Flat, or a 20° slope rising ahead.
const groundAt = (x, z) => (slope.checked ? Math.tan(THREE.MathUtils.degToRad(20)) * z : 0);
let previous = performance.now();
function frame(now) {
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (!paused) {
    elapsed += dt;
    const moving = body.posture === 'stand' ? speed : 0;
    body.speed = moving / SCALE;
    body.turnRate = sliders.turn ?? 0;
    dog.rotation.y += body.turnRate * dt;
    dog.position.addScaledVector(new THREE.Vector3(Math.sin(dog.rotation.y), 0, Math.cos(dog.rotation.y)), moving * dt);
    if (dog.position.length() > 15) dog.position.set(0, 0, 0);
    dog.position.y = groundAt(dog.position.x, dog.position.z);
    const yaw = sliders.lookYaw ?? 0, pitch = sliders.lookPitch ?? 0;
    body.lookAt.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // The model frame's ground, from the world's.
    body.update(dt, (mx, mz) => {
      const w = dog.localToWorld(new THREE.Vector3(mx * SCALE, 0, mz * SCALE));
      return (groundAt(w.x, w.z) - dog.position.y) / SCALE;
    });
    place(false);
  }
  const w = Object.entries(body.w).filter(([, v]) => v > 0.01).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' ');
  status.textContent = `${w}\nspeed ${speed} m/s · gait ${body.gait.toFixed(2)} · ${body.hz?.toFixed(2)} Hz\nacts ${body.acts.map((a) => a.kind).join(',')}`;
  if (document.getElementById('ink').checked) post.render(scene, camera, elapsed);
  else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight, devicePixelRatio);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
