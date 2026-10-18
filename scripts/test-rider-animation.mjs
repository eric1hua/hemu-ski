// Run: node scripts/test-rider-animation.mjs
// Uses the actual female GLB rig/clips; omits only texture material references
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
  const source = await readFile(new URL('../public/models/female-rider/female-rider-rigfix-walk-run-tex2k-v03.glb', import.meta.url));
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
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

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
  const frames = (mode, speed, count = 60) => {
    for (let i = 0; i < count; i++) model.update(1 / 60, rider, mode, speed);
  };
  function assertPose(expected, label) {
    let count = 0;
    expected.traverse((bone) => {
      if (!bone.isBone) return;
      count++;
      const actual = model.root.getObjectByName(bone.name);
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
} finally {
  await server.close();
}
