// Selectable Mixamo riders. Riding copies the classic pose and solves leg IK;
// on-foot movement plays the authored walk/run clips without procedural posing.
// Model and body coordinates: +Z facing, character left +X.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeToon } from '../render/toon.js';

export const RIDER_MODELS = {
  male: { file: 'player.glb', height: 1.7 },
  // Includes the cat ears: keep her body scale independent of the male's hat.
  female: { file: 'female-rider/female-rider-rigfix-walk-run-tex2k-v03.glb', height: 1.8 },
};
const BOARD_TOP = 0.025;
const FADE = 0.25;
const loading = new Map();
export function loadRiderModel(id = 'male') {
  const spec = RIDER_MODELS[id];
  if (!spec) throw new Error(`Unknown rider: ${id}`);
  if (!loading.has(id)) {
    loading.set(id, new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/' + spec.file)
      .catch((err) => { loading.delete(id); throw err; }));
  }
  return loading.get(id);
}

// Bones driven each frame. The clavicles (Shoulder) and Spine2 stay at the bind
// pose: the auto-rig gave the shoulders much of the chest and backpack, so
// moving them would drag the torso along with the arms.
const DRIVEN = ['Hips', 'Spine', 'Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const DOWN = new THREE.Vector3(0, -1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _e = new THREE.Euler();

export class RiderModel {
  constructor(gltf, id = 'male') {
    const scene = clone(gltf.scene);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      o.material = makeToon({ map: src.map, color: src.color, side: src.side }, { rim: 1, hatch: 0 });
      o.castShadow = true;
      o.frustumCulled = false; // bind-pose bounds don't follow the crouch
    });

    this.root = new THREE.Group();
    this.root.name = 'RiderModel';
    this.root.add(scene);
    const box = new THREE.Box3().setFromObject(scene);
    this.scale = RIDER_MODELS[id].height / (box.max.y - box.min.y);
    this.root.scale.setScalar(this.scale);
    this.root.position.y = BOARD_TOP - box.min.y * this.scale;
    this.root.updateMatrixWorld(true);

    // Per bone: bind local pose, and the parent's bind orientation in model
    // space (so a model-space rotation can be applied relative to the parent).
    this.bones = {};
    this.rest = [];
    scene.traverse((bone) => {
      if (bone.isBone) this.rest.push({ bone, p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() });
    });
    // Keep mixer targets separate: PropertyMixer caches unchanged track values.
    // Fading on its target bones would leave a frozen clip stuck halfway.
    this.animationScene = clone(gltf.scene);
    for (const entry of this.rest) entry.animated = this.animationScene.getObjectByName(entry.bone.name);
    this.mixer = new THREE.AnimationMixer(this.animationScene);
    this.walk = gltf.animations.find((clip) => clip.name === 'walk.001');
    this.run = gltf.animations.find((clip) => clip.name === 'run.001');
    this.canWalk = !!(this.walk && this.run);
    if (this.canWalk) {
      this.walk = this.mixer.clipAction(this.walk).play();
      this.run = this.mixer.clipAction(this.run).play();
    }
    this.mode = 'ride';
    this.fade = FADE;
    this.transition = null;
    const rootQinv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    scene.traverse((o) => {
      if (!o.isBone) return;
      const name = o.name.replace(/^mixamorig:?/, '');
      if (!DRIVEN.includes(name)) return;
      const parentQ = rootQinv.clone().multiply(o.parent.getWorldQuaternion(new THREE.Quaternion()));
      this.bones[name] = {
        bone: o,
        q: o.quaternion.clone(),
        p: o.position.clone(),
        parentQ,
        parentQinv: parentQ.clone().invert(),
        modelQ: rootQinv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion())),
      };
    });
    const missing = DRIVEN.filter((n) => !this.bones[n]);
    if (missing.length) throw new Error(`player.glb is missing Mixamo bones: ${missing.join(', ')}`);

    // Bind-pose geometry the IK and arm mapping need (model units).
    const pos = (n) => this.root.worldToLocal(this.bones[n].bone.getWorldPosition(new THREE.Vector3()));
    this.thigh = pos('LeftLeg').distanceTo(pos('LeftUpLeg'));
    this.shin = pos('LeftFoot').distanceTo(pos('LeftLeg'));
    this.ankle = pos('LeftFoot'); // height and depth of the ankle above the sole
    this.armDir = {
      Left: [pos('LeftForeArm').sub(pos('LeftArm')).normalize(), childDir(this.bones.LeftForeArm.bone, this.root)],
      Right: [pos('RightForeArm').sub(pos('RightArm')).normalize(), childDir(this.bones.RightForeArm.bone, this.root)],
    };
  }

  update(dt, rider, mode, speed) {
    if (mode !== this.mode) {
      this.transition = this.rest.map(({ bone }) => ({ p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }));
      this.fade = 0;
      this.mode = mode;
    }
    if (mode === 'walk' && this.canWalk) {
      const blend = THREE.MathUtils.smoothstep(speed, 1.5, 4);
      this.walk.setEffectiveWeight(1 - blend);
      this.run.setEffectiveWeight(blend);
      // Hold the current walk frame when stopped; the asset has no idle clip.
      this.walk.setEffectiveTimeScale(speed < 0.05 ? 0 : THREE.MathUtils.clamp(speed / 1.4, 0.25, 1.5));
      this.run.setEffectiveTimeScale(speed < 0.05 ? 0 : THREE.MathUtils.clamp(speed / 4, 0.25, 1.5));
      this.mixer.update(dt);
      for (const { bone, animated } of this.rest) {
        bone.position.copy(animated.position);
        bone.quaternion.copy(animated.quaternion);
        bone.scale.copy(animated.scale);
      }
    } else {
      // Clips animate all 65 bones; restore all of them before procedural posing.
      for (const { bone, p, q, s } of this.rest) {
        bone.position.copy(p); bone.quaternion.copy(q); bone.scale.copy(s);
      }
      this.apply(rider);
    }
    this.fade = Math.min(FADE, this.fade + dt);
    if (this.transition) {
      const t = THREE.MathUtils.smoothstep(this.fade, 0, FADE);
      this.rest.forEach(({ bone }, i) => {
        const from = this.transition[i];
        bone.position.lerpVectors(from.p, bone.position, t);
        bone.quaternion.slerpQuaternions(from.q, bone.quaternion, t);
        bone.scale.lerpVectors(from.s, bone.scale, t);
      });
      if (this.fade === FADE) this.transition = null;
    }
  }

  // Rotate a bone by `d` (a model-space rotation) relative to its parent.
  #turn(name, d) {
    const b = this.bones[name];
    b.bone.quaternion.copy(b.parentQinv).multiply(d).multiply(b.parentQ).multiply(b.q);
  }

  // Swing a bone so the segment from it to `childPos` points along `dir` (model space).
  #aim(name, from, to, dir) {
    const b = this.bones[name];
    _a.subVectors(to, from).normalize();
    _q.setFromUnitVectors(_a, dir);
    // model-space delta → world → parent-local, applied on top of the current pose
    const rootQ = this.root.getWorldQuaternion(_r);
    const worldDelta = rootQ.clone().multiply(_q).multiply(rootQ.clone().invert());
    const parentQ = b.bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const boneQ = b.bone.getWorldQuaternion(new THREE.Quaternion());
    b.bone.quaternion.copy(parentQ.invert().multiply(worldDelta).multiply(boneQ));
    b.bone.updateMatrixWorld(true);
  }

  #modelPos(name, out) {
    return this.root.worldToLocal(this.bones[name].bone.getWorldPosition(out));
  }

  // Body-frame point (the Rider's body group) → model space.
  #fromBody(p, out) {
    return out.copy(p).sub(this.root.position).divideScalar(this.scale);
  }

  apply(rider) {
    for (const b of Object.values(this.bones)) {
      b.bone.quaternion.copy(b.q);
      b.bone.position.copy(b.p);
    }

    // Hips: same place and turn as the classic rider's hip block.
    const hips = this.bones.Hips.bone;
    this.root.updateMatrixWorld(true);
    this.#fromBody(rider.hips.position, _v);
    hips.position.copy(hips.parent.worldToLocal(this.root.localToWorld(_v)));
    this.#turn('Hips', _q.setFromEuler(rider.hips.rotation));

    // Torso fold split over two spine bones; head counter-tilts down the nose.
    const t = rider.torso.rotation;
    this.#turn('Spine', _q.setFromEuler(_e.set(t.x * 0.5, t.y, 0)));
    this.#turn('Spine1', _q.setFromEuler(_e.set(t.x * 0.5, 0, 0)));
    this.#turn('Head', _q.setFromEuler(rider.head.rotation));

    // Arms: the classic rider's arms hang along -y at rest; map that
    // shoulder/elbow rotation onto the T-posed Mixamo arms.
    for (const [side, arm] of [['Left', rider.armL], ['Right', rider.armR]]) {
      const [upperBind, foreBind] = this.armDir[side];
      const upper = _a.copy(DOWN).applyEuler(arm.sh.rotation);
      const dUpper = new THREE.Quaternion().setFromUnitVectors(upperBind, upper);
      this.#turn(side + 'Arm', dUpper);
      const fore = _b.copy(DOWN).applyEuler(arm.el.rotation).applyEuler(arm.sh.rotation)
        .applyQuaternion(dUpper.clone().invert());
      this.#turn(side + 'ForeArm', _q.setFromUnitVectors(foreBind, fore.normalize()));
    }

    // Legs: two-bone IK from each hip socket to the ankle above its binding.
    this.root.updateMatrixWorld(true);
    for (const [i, side, sign] of [[0, 'Left', 1], [1, 'Right', -1]]) {
      const foot = rider.feet[i].position;
      // The bindings sit on the deck, as the T-posed soles do, so the ankle
      // keeps its bind height; only its spot along the board changes.
      const ankle = this.#fromBody(_w.copy(foot), new THREE.Vector3());
      ankle.y = this.ankle.y;
      ankle.z += this.ankle.z;
      const hip = this.#modelPos(side + 'UpLeg', new THREE.Vector3());
      const d = ankle.clone().sub(hip);
      const len = Math.min(d.length(), this.thigh + this.shin - 1e-4);
      d.normalize();
      const along = (this.thigh ** 2 - this.shin ** 2 + len ** 2) / (2 * len);
      const up = Math.sqrt(Math.max(0, this.thigh ** 2 - along ** 2));
      const bend = FWD.clone().addScaledVector(d, -FWD.dot(d));
      bend.x += sign * 0.12; // knees track slightly outward
      bend.normalize();
      const knee = hip.clone().addScaledVector(d, along).addScaledVector(bend, up);

      this.#aim(side + 'UpLeg', hip, this.#modelPos(side + 'Leg', new THREE.Vector3()), knee.clone().sub(hip).normalize());
      const kneeNow = this.#modelPos(side + 'Leg', new THREE.Vector3());
      this.#aim(side + 'Leg', kneeNow, this.#modelPos(side + 'Foot', new THREE.Vector3()), ankle.clone().sub(kneeNow).normalize());

      // Boot flat on the binding, whatever the leg is doing.
      const f = this.bones[side + 'Foot'];
      const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
      const parentQ = f.bone.parent.getWorldQuaternion(new THREE.Quaternion());
      f.bone.quaternion.copy(parentQ.invert().multiply(rootQ).multiply(f.modelQ));
      f.bone.updateMatrixWorld(true);
    }
  }
}

// Model-space direction from a bone to its first child bone (bind pose).
function childDir(bone, root) {
  const child = bone.children.find((c) => c.isBone);
  const a = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  const b = root.worldToLocal(child.getWorldPosition(new THREE.Vector3()));
  return b.sub(a).normalize();
}
