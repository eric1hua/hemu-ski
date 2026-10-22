// Run: npm test (node tests/rider-animation.mjs)
// Uses the actual female GLB rigs/clips (ski gear and swimsuit); omits only texture material references
// so the regression runs in Node without browser image loaders or a WebGL context.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { RiderModel } = await server.ssrLoadModule('/src/player/rider-model.js');
  // The GLB with its textures left out.
  async function load(file) {
    const source = await readFile(new URL(`../public/models/female-rider/${file}`, import.meta.url));
    const jsonLength = source.readUInt32LE(12);
    const json = JSON.parse(source.subarray(20, 20 + jsonLength));
    json.materials = (json.materials || []).map(() => ({ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }));
    const jsonBytes = Buffer.from(JSON.stringify(json));
    const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
    const binaryChunk = source.subarray(20 + jsonLength);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0); // glTF
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + paddedJson.length + binaryChunk.length, 8);
    header.writeUInt32LE(paddedJson.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16); // JSON
    const bytes = Buffer.concat([header, paddedJson, binaryChunk]);
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  }
  const gltf = await load('female-rider-rigfix-walk-run-tex2k-v03.glb');

  const group = () => new THREE.Group();
  const rider = {
    hips: group(), torso: group(), head: group(),
    armL: { sh: group(), el: group() }, armR: { sh: group(), el: group() },
    feet: [group(), group()],
  };
  rider.hips.position.set(0.02, 0.6, -0.15);
  rider.hips.rotation.set(0, 0.3, 0);
  rider.torso.rotation.set(0.7, 0.25, 0);
  rider.head.rotation.set(-0.5, 0.55, 0);
  rider.armL.sh.rotation.set(-0.5, 0, 1.15);
  rider.armR.sh.rotation.set(-0.9, 0, -0.75);
  rider.feet[0].position.set(0.26, 0.025, 0);
  rider.feet[1].position.set(-0.26, 0.025, 0);

  const model = new RiderModel(gltf, 'female');
  assert.equal(model.canWalk, true, 'actual female asset must provide both walk and run');
  const frames = (mode, speed, count = 60, subject = model) => {
    for (let i = 0; i < count; i++) subject.update(1 / 60, rider, mode, speed);
  };
  function assertPose(expected, label, subject = model) {
    let count = 0;
    expected.traverse((bone) => {
      if (!bone.isBone) return;
      count++;
      const actual = subject.root.getObjectByName(bone.name);
      assert(actual, `${label}: missing ${bone.name}`);
      assert(actual.position.distanceTo(bone.position) < 1e-6, `${label}: ${bone.name} position`);
      // GLB float quaternions can be slightly non-unit even when identical.
      assert(actual.quaternion.clone().normalize().angleTo(bone.quaternion.clone().normalize()) < 1e-5,
        `${label}: ${bone.name} rotation`);
      assert(actual.scale.distanceTo(bone.scale) < 1e-6, `${label}: ${bone.name} scale`);
    });
    assert.equal(count, 65, `${label}: expected every actual asset bone`);
    console.log(`PASS ${label}: all ${count} bones`);
  }
  function assertAuthoredPose(speed, label) {
    const expected = clone(gltf.scene);
    const mixer = new THREE.AnimationMixer(expected);
    const blend = THREE.MathUtils.smoothstep(speed, 1.5, 4);
    const walk = mixer.clipAction(gltf.animations.find((clip) => clip.name === 'walk.001')).play();
    const run = mixer.clipAction(gltf.animations.find((clip) => clip.name === 'run.001')).play();
    walk.setEffectiveWeight(1 - blend); run.setEffectiveWeight(blend);
    walk.time = model.walk.time; run.time = model.run.time;
    mixer.update(0);
    assertPose(expected, label);
  }

  frames('ride', 0);
  frames('walk', 0);
  assertAuthoredPose(0, 'ride -> frozen idle');
  frames('walk', 1.4);
  assertAuthoredPose(1.4, 'walking target');
  frames('walk', 2.7);
  assertAuthoredPose(2.7, 'walk/run blend target');
  frames('walk', 4);
  assertAuthoredPose(4, 'running target');
  frames('ride', 0);
  const freshRide = new RiderModel(gltf, 'female');
  freshRide.update(1 / 60, rider, 'ride', 0);
  assertPose(freshRide.root, 'run -> ride restores all bones including undriven bones');
  frames('walk', 0);
  assertAuthoredPose(0, 'walk/run -> ride -> frozen idle');

  // The swimsuit's clips, as the hot spring plays them: 'act', at a set time.
  const swimGltf = await load('female-rider-swim-v01.glb');
  const swim = new RiderModel(swimGltf, 'female', { outfit: 'swim', fit: model });
  assert.deepEqual(Object.keys(swim.clips).sort(), ['ledge', 'sitDown', 'wade'], 'swimsuit clips found by role');
  function assertClipPose(subject, source, clip, time, label) {
    const expected = clone(source.scene);
    const mixer = new THREE.AnimationMixer(expected);
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play().time = time;
    mixer.update(0);
    assertPose(expected, label, subject);
  }
  const act = (subject, clip, time) => {
    rider.act = { clip, time };
    frames('act', 0, 30, subject);
  };
  const { ledge, sitDown } = swim.clips;
  act(swim, ledge, 1.5);
  assertClipPose(swim, swimGltf, ledge, 1.5, 'act: ledge clip mid-way');
  act(swim, sitDown, sitDown.duration);
  assertClipPose(swim, swimGltf, sitDown, sitDown.duration, 'act: the end of a clip holds its last frame');
  // The ski model plays them too (same skeleton), as it does while the puff covers the change.
  act(model, ledge, 0);
  assertClipPose(model, gltf, ledge, 0, 'act: a swimsuit clip on the ski model');
  frames('walk', 1.4);
  assertAuthoredPose(1.4, 'act -> walking, the clip let go');
  frames('ride', 0);
  assertPose(freshRide.root, 'act -> ride restores all bones');
  // What getting in fits to the pool: the step up, and how low she sits.
  const top = Math.max(...Array.from({ length: 151 }, (_, i) => swim.rise(ledge, (i / 150) * ledge.duration)));
  assert(top > 0.3 && top < 0.6, `ledge clip steps up ${top.toFixed(3)} m`);
  const sat = swim.heightIn(sitDown, sitDown.duration, 'LeftArm'), stood = swim.heightIn(sitDown, 0, 'LeftArm');
  assert(stood - sat > 0.6 && sat > 0.3, `shoulders ${stood.toFixed(2)} m standing, ${sat.toFixed(2)} m sat down`);
  console.log(`PASS fitting: steps up ${top.toFixed(2)} m; shoulders ${stood.toFixed(2)} m standing, ${sat.toFixed(2)} m sat down`);
} finally {
  await server.close();
}
