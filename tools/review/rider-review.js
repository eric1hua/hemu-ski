// Dev-only inspection surface, using the same Rider/IK/mixer as the game.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InkPost } from '../../src/render/post.js';
import { Rider } from '../../src/player/rider.js';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e7edf0');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
const post = new InkPost(renderer);
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(38, 1, .01, 100);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8b9ca8, 2));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(3, 5, 4); scene.add(sun);
const grid = new THREE.GridHelper(6, 30, 0x80939c, 0xb7c5cb); scene.add(grid);
const rider = new Rider(); scene.add(rider.root);
const status = document.getElementById('status');
let speed = 0, paused = false, twist = 0, elapsed = 0;
const pose = { crouch: .35, lean: 0, twist: 0, air: false, speed: 0 };
function view(x, y, z, targetY) { camera.position.set(x, y, z); orbit.target.set(0, targetY, 0); orbit.update(); }
view(3.5, 1.5, 3, .85);
document.getElementById('front').onclick = () => view(3.8, 1.3, 0, .85);
document.getElementById('side').onclick = () => view(0, 1.2, 3.8, .85);
document.getElementById('boots').onclick = () => view(1.3, .7, 1.2, .15);
for (const [id, value] of [['ride', 0], ['idle', 0], ['walk', 1.4], ['run', 4]]) document.getElementById(id).onclick = () => {
  if (rider.setLocomotion(id === 'ride' ? 'ride' : 'walk')) speed = value;
};
document.getElementById('turn').onclick = () => { twist = twist ? 0 : -1.5; };
document.getElementById('pause').onclick = () => { paused = !paused; };
document.getElementById('model').onchange = async (e) => { speed = 0; await rider.selectModel(e.target.value); };
await rider.selectModel('female');
let previous = performance.now();
function frame(now) {
  const dt = Math.min((now - previous) / 1000, .05); previous = now;
  if (!paused) {
    elapsed += dt;
    rider.update(dt, { ...pose, twist, speed });
  }
  const model = rider.model;
  const feet = model ? ['LeftFoot', 'RightFoot'].map((side, i) => {
    const p = model.bones[side].bone.getWorldPosition(new THREE.Vector3());
    rider.body.worldToLocal(p);
    return Math.hypot(p.x - rider.feet[i].position.x, p.z - (rider.feet[i].position.z + model.ankle.z * model.scale));
  }) : [];
  status.textContent = `${rider.modelId} · ${rider.locomotion} · ${speed} m/s\nwalk ${model?.walk?.getEffectiveWeight?.().toFixed(2) ?? '-'} / run ${model?.run?.getEffectiveWeight?.().toFixed(2) ?? '-'}\nfade ${model?.fade?.toFixed(2)} s · board ${rider.boardAssembly?.visible}\nankle XZ error ${feet.map((d) => (d * 1000).toFixed(1)).join(' / ')} mm\ntime ${elapsed.toFixed(1)} s`;
  if (document.getElementById('ink').checked) post.render(scene, camera, elapsed);
  else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight, devicePixelRatio); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize(); requestAnimationFrame(frame);
