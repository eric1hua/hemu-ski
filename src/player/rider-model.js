// Selectable Mixamo riders. Riding copies the classic pose and solves leg IK;
// on-foot movement plays the authored walk/run clips without procedural posing.
// Model and body coordinates: +Z facing, character left +X.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeToon } from '../render/toon.js';

// `seat`: how high the Hips bone sits above a seat's cushion (metres), for the
// thighs' thickness. `outfits`: other sets of clothes, each a whole model on
// the same Mixamo skeleton (Tripo can't take clothes off a model), sized to the
// rider's own by the skeleton rather than by height; `seat` can differ there.
// `clips`: the model's own clips by what they're for, each named by how its
// name starts (Tripo cuts names off at 63 characters).
export const RIDER_MODELS = {
  male: { file: 'player.glb', height: 1.7, seat: 0.16 },
  // Includes the cat ears: keep her body scale independent of the male's hat.
  female: {
    file: 'female-rider/female-rider-rigfix-walk-run-tex2k-v03.glb', height: 1.8, seat: 0.15,
    // For the hot spring, with the clips for getting in (see Soaking in main.js).
    // It has no clip for undressing: she changes in a puff of steam instead.
    outfits: {
      swim: {
        file: 'female-rider/female-rider-swim-v01.glb',
        clips: { ledge: 'Go upstairs, then go downstairs', wade: 'walk', sitDown: 'Like stepping down a few steps' },
      },
    },
  },
};
const BOARD_TOP = 0.025;
const FADE = 0.25;
const loading = new Map();
export function loadRiderModel(id = 'male', outfit = null) {
  const spec = RIDER_MODELS[id];
  const file = outfit ? spec?.outfits?.[outfit]?.file : spec?.file;
  if (!file) throw new Error(`Unknown rider: ${id}${outfit ? ` in ${outfit}` : ''}`);
  const key = outfit ? `${id}:${outfit}` : id;
  if (!loading.has(key)) {
    loading.set(key, new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/' + file)
      .catch((err) => { loading.delete(key); throw err; }));
  }
  return loading.get(key);
}

// Bones driven each frame. The clavicles (Shoulder) and Spine2 stay at the bind
// pose: the auto-rig gave the shoulders much of the chest and backpack, so
// moving them would drag the torso along with the arms.
const DRIVEN = ['Hips', 'Spine', 'Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm',
  'LeftHand', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const DOWN = new THREE.Vector3(0, -1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _e = new THREE.Euler();

export class RiderModel {
  // `outfit` names one of RIDER_MODELS[id].outfits, sized to `fit`: the
  // RiderModel of the rider's own clothes.
  constructor(gltf, id = 'male', { outfit = null, fit = null } = {}) {
    const spec = RIDER_MODELS[id], wearing = outfit ? spec.outfits[outfit] : spec;
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
    const byName = {};
    scene.traverse((bone) => {
      if (bone.isBone) byName[bone.name.replace(/^mixamorig:?/, '')] = bone;
    });
    const missing = DRIVEN.filter((n) => !byName[n]);
    if (missing.length) throw new Error(`${wearing.file} is missing Mixamo bones: ${missing.join(', ')}`);
    // The trunk, from the Hips joint up to the Head joint (model units): what
    // sizes another set of clothes to the rider's own, since neither a hat nor
    // boots reach it. The rider's own clothes go by their height.
    this.root.updateMatrixWorld(true);
    this.trunk = byName.Head.getWorldPosition(_v).y - byName.Hips.getWorldPosition(_w).y;
    const box = new THREE.Box3().setFromObject(scene);
    this.scale = fit ? (fit.scale * fit.trunk) / this.trunk : spec.height / (box.max.y - box.min.y);
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
    this.clips = {};
    for (const [role, name] of Object.entries(wearing.clips ?? {})) {
      const clip = gltf.animations.find((c) => c.name.startsWith(name));
      if (clip) this.clips[role] = clip;
      else console.warn(`${wearing.file} has no clip named "${name}…" (for ${role}).`);
    }
    this.acts = new Map(); // clip → its action, for 'act'
    this.mode = 'ride';
    this.clip = null;
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

    // Bind-pose geometry the IK and arm mapping need (model units).
    const pos = (n) => this.root.worldToLocal(this.bones[n].bone.getWorldPosition(new THREE.Vector3()));
    this.thigh = pos('LeftLeg').distanceTo(pos('LeftUpLeg'));
    this.shin = pos('LeftFoot').distanceTo(pos('LeftLeg'));
    this.ankle = pos('LeftFoot'); // height and depth of the ankle above the sole
    this.armDir = {
      Left: [pos('LeftForeArm').sub(pos('LeftArm')).normalize(), childDir(this.bones.LeftForeArm.bone, this.root)],
      Right: [pos('RightForeArm').sub(pos('RightArm')).normalize(), childDir(this.bones.RightForeArm.bone, this.root)],
    };

    // Seated (on the snowmobile, or in the Jetson), the arms reach for the grips
    // (or the sticks' handles) with two-bone IK, and the hands close round them.
    const at = (bone) => this.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
    this.upperArm = pos('LeftArm').distanceTo(pos('LeftForeArm'));
    this.foreArm = pos('LeftForeArm').distanceTo(pos('LeftHand'));
    // Wrist to the middle of the palm, where the grip goes.
    this.palm = byName.LeftHandMiddle1 ? pos('LeftHand').distanceTo(at(byName.LeftHandMiddle1)) * 0.6 : 0;
    // The rider's build, for Rider's seated pose (body units): as its CLASSIC_BUILD.
    const S = this.scale;
    this.build = {
      seat: wearing.seat ?? spec.seat,
      pivot: (pos('Spine').y - pos('Hips').y) * S,
      shoulder: [Math.abs(pos('LeftArm').x - pos('Hips').x) * S, (pos('LeftArm').y - pos('Spine').y) * S],
      reach: (this.upperArm + this.foreArm + this.palm) * S,
    };
    // Each finger joint curls about the axis across its finger, toward the palm
    // (down, in the T-pose), kept in the joint's own frame.
    this.fingers = [];
    for (const side of ['Left', 'Right'])
      for (const finger of FINGERS)
        for (let j = 1; j <= 3; j++) {
          const bone = byName[`${side}Hand${finger}${j}`], next = byName[`${side}Hand${finger}${j + 1}`];
          if (!bone || !next) continue;
          const axis = at(next).sub(at(bone)).normalize().cross(DOWN).normalize();
          const boneQ = rootQinv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
          this.fingers.push({ bone, axis: axis.applyQuaternion(boneQ.invert()), angle: finger === 'Thumb' ? 0.45 : 1.0 });
        }
  }

  // Takes up `mode` (and in 'act', `clip`) at once, with no fade from the pose
  // it was last left in: for a set of clothes changed into mid-pose.
  snapTo(mode, clip = null) {
    this.mode = mode;
    this.clip = clip;
    this.transition = null;
    this.fade = FADE;
  }

  // 'act' plays `rider.act`: { clip, time }, a clip at a time the rider sets
  // rather than one the mixer runs on, so clothes changed into mid-clip carry
  // on from the same frame. Any clip on the Mixamo skeleton plays, whichever
  // model it came with. Changing clips fades as changing modes does.
  update(dt, rider, mode, speed) {
    const clip = mode === 'act' ? rider.act.clip : null;
    if (mode !== this.mode || clip !== this.clip) {
      this.transition = this.rest.map(({ bone }) => ({ p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }));
      this.fade = 0;
      this.mode = mode;
      this.clip = clip;
    }
    if (mode === 'act') {
      const action = this.#act(this.mixer, clip, this.acts);
      for (const a of this.acts.values()) if (a !== action) a.stop();
      this.walk?.setEffectiveWeight?.(0);
      this.run?.setEffectiveWeight?.(0);
      action.play();
      action.time = THREE.MathUtils.clamp(rider.act.time, 0, clip.duration);
      this.mixer.update(0);
      this.#copyAnimated();
    } else if (mode === 'walk' && this.canWalk) {
      for (const a of this.acts.values()) a.stop();
      const blend = THREE.MathUtils.smoothstep(speed, 1.5, 4);
      this.walk.setEffectiveWeight(1 - blend);
      this.run.setEffectiveWeight(blend);
      // Hold the current walk frame when stopped; the asset has no idle clip.
      this.walk.setEffectiveTimeScale(speed < 0.05 ? 0 : THREE.MathUtils.clamp(speed / 1.4, 0.25, 1.5));
      this.run.setEffectiveTimeScale(speed < 0.05 ? 0 : THREE.MathUtils.clamp(speed / 4, 0.25, 1.5));
      this.mixer.update(dt);
      this.#copyAnimated();
    } else {
      // Clips animate all 65 bones; restore all of them before procedural posing.
      for (const { bone, p, q, s } of this.rest) {
        bone.position.copy(p); bone.quaternion.copy(q); bone.scale.copy(s);
      }
      this.apply(rider, mode);
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

  #copyAnimated() {
    for (const { bone, animated } of this.rest) {
      bone.position.copy(animated.position);
      bone.quaternion.copy(animated.quaternion);
      bone.scale.copy(animated.scale);
    }
  }

  // `clip`'s action on `mixer`, played once and held at its end: a time past
  // the end is the last frame, not the first again.
  #act(mixer, clip, actions) {
    let action = actions.get(clip);
    if (!action) {
      action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      actions.set(clip, action);
    }
    return action;
  }

  // How high the Mixamo bone `name` (e.g. 'LeftArm') stands over the rider's
  // root (metres) at `time` into `clip`, posed on a copy, leaving this one be.
  heightIn(clip, time, name) {
    if (!this.probe) {
      const scene = clone(this.animationScene);
      const bones = {};
      scene.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
      this.probe = { scene, bones, mixer: new THREE.AnimationMixer(scene), actions: new Map() };
    }
    const { scene, bones, mixer, actions } = this.probe;
    mixer.stopAllAction();
    const action = this.#act(mixer, clip, actions).play();
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    return this.root.position.y + bones[name].getWorldPosition(_v).y * this.scale;
  }

  // How far `clip` has raised the Hips joint by `time` from where it starts
  // (metres, at this model's size): for fitting a clip's steps up and down to
  // the heights of real ones.
  rise(clip, time) {
    this.hipsAt ||= new Map();
    let at = this.hipsAt.get(clip);
    if (!at) {
      const name = `${this.bones.Hips.bone.name}.position`;
      at = clip.tracks.find((t) => t.name === name).createInterpolant();
      this.hipsAt.set(clip, at);
    }
    const y = at.evaluate(time)[1];
    return (y - at.evaluate(0)[1]) * this.scale;
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

  apply(rider, mode = 'ride') {
    const sitting = mode === 'sit';
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
    this.#turn('Spine', _q.setFromEuler(_e.set(t.x * 0.5, t.y, t.z * 0.5)));
    this.#turn('Spine1', _q.setFromEuler(_e.set(t.x * 0.5, 0, t.z * 0.5)));
    this.#turn('Head', _q.setFromEuler(rider.head.rotation));

    if (sitting) this.#grip(rider.seat.grips);
    // Arms: the classic rider's arms hang along -y at rest; map that
    // shoulder/elbow rotation onto the T-posed Mixamo arms.
    else for (const [side, arm] of [['Left', rider.armL], ['Right', rider.armR]]) {
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
      // keeps its bind height; only its spot along the board changes. A
      // footrest above the deck lifts it by as much.
      const ankle = this.#fromBody(_w.copy(foot), new THREE.Vector3());
      ankle.y = this.ankle.y + (foot.y - BOARD_TOP) / this.scale;
      ankle.z += this.ankle.z;
      const hip = this.#modelPos(side + 'UpLeg', new THREE.Vector3());
      const d = ankle.clone().sub(hip);
      const len = Math.min(d.length(), this.thigh + this.shin - 1e-4);
      d.normalize();
      const along = (this.thigh ** 2 - this.shin ** 2 + len ** 2) / (2 * len);
      const up = Math.sqrt(Math.max(0, this.thigh ** 2 - along ** 2));
      const bend = FWD.clone().addScaledVector(d, -FWD.dot(d));
      bend.x += sign * (rider.kneeOut ?? 0.12); // knees track slightly outward
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

  // Seated: each hand onto its grip (body frame), the palm on the bar and the
  // fingers round it, the elbows bent out, down and back.
  #grip(grips) {
    this.root.updateMatrixWorld(true);
    for (const [i, side, sign] of [[0, 'Left', 1], [1, 'Right', -1]]) {
      const grip = this.#fromBody(grips[i], new THREE.Vector3());
      const sh = this.#modelPos(side + 'Arm', new THREE.Vector3());
      // The wrist, a palm's length back from the grip toward the shoulder and a
      // little above it.
      const wrist = grip.clone().addScaledVector(sh.clone().sub(grip).normalize(), this.palm);
      wrist.y += this.palm * 0.5;
      const d = wrist.clone().sub(sh);
      const len = Math.min(d.length(), this.upperArm + this.foreArm - 1e-4);
      d.normalize();
      const along = (this.upperArm ** 2 - this.foreArm ** 2 + len ** 2) / (2 * len);
      const out = Math.sqrt(Math.max(0, this.upperArm ** 2 - along ** 2));
      const bend = new THREE.Vector3(sign * 0.8, -1, -0.4);
      bend.addScaledVector(d, -bend.dot(d)).normalize();
      const elbow = sh.clone().addScaledVector(d, along).addScaledVector(bend, out);

      this.#aim(side + 'Arm', sh, this.#modelPos(side + 'ForeArm', new THREE.Vector3()), elbow.clone().sub(sh).normalize());
      const elbowNow = this.#modelPos(side + 'ForeArm', new THREE.Vector3());
      this.#aim(side + 'ForeArm', elbowNow, this.#modelPos(side + 'Hand', new THREE.Vector3()), wrist.clone().sub(elbowNow).normalize());
    }
    for (const { bone, axis, angle } of this.fingers) bone.quaternion.multiply(_q.setFromAxisAngle(axis, angle));
  }
}

// Model-space direction from a bone to its first child bone (bind pose).
function childDir(bone, root) {
  const child = bone.children.find((c) => c.isBone);
  const a = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  const b = root.worldToLocal(child.getWorldPosition(new THREE.Vector3()));
  return b.sub(a).normalize();
}
