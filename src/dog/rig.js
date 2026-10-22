// The Old English Sheepdog's skeleton, posed in code every frame rather than
// from clips (public/models/dog/, exported from its Rigify rig by the asset
// lab's scripts/export-dog.py). Dog (dog.js) decides what the dog is doing and
// hands this a pose; this turns the bones to match.
//
// Model frame: +z forward, +x the dog's left, +y up, the paws on the ground at
// y = 0, about a unit from nose to tail. Every bone points along its own +y,
// toward the next joint.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeToon } from '../render/toon.js';

const FILE = import.meta.env.BASE_URL + 'models/dog/old-english-sheepdog.glb';
let loading = null;
export function loadDog() {
  loading ||= new GLTFLoader().loadAsync(FILE).catch((err) => { loading = null; throw err; });
  return loading;
}

// Front left, front right, hind left, hind right, each from its upper bone to
// its paw: the upper arm or thigh, the forearm or shin, the pastern or hock
// (the long bone of the foot, standing nearly upright) and the paw. A front
// leg's elbow bends back, a hind leg's knee forward.
export const LEGS = [
  { id: 'LF', chain: ['upperArm_L', 'forearm_L', 'pastern_L', 'paw_L'], front: true, side: 1 },
  { id: 'RF', chain: ['upperArm_R', 'forearm_R', 'pastern_R', 'paw_R'], front: true, side: -1 },
  { id: 'LH', chain: ['thigh_L', 'shin_L', 'hock_L', 'hindPaw_L'], front: false, side: 1 },
  { id: 'RH', chain: ['thigh_R', 'shin_R', 'hock_R', 'hindPaw_R'], front: false, side: -1 },
];
const SPINE = ['spine', 'spine1', 'spine2', 'chest'];
// The neck and head share a turn toward where the dog looks: each takes this
// much of what's left of it.
const NECK = [['neck', 0.3], ['neck1', 0.45], ['head', 1]];
const TAIL = ['tail', 'tail1', 'tail2', 'tail3'];
const TONGUE = ['tongue', 'tongue1', 'tongue2'];
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _s = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

// A pose, all in the model frame (see DogRig.pose):
//   hips: { pos, quat }   where the hips joint (the root of the tail) goes, and
//                          the body's turn from standing, about that joint
//   bend: Vector3          the spine's arch (x, + nose down), sideways curve
//                          (y, + toward its left) and twist (z), shared out
//                          from the hips to the chest
//   look, up: Vector3      the way the muzzle points, and the head's up
//   jaw: radians open; tongue: 0 in, 1 lolling out
//   tail: { lift, wag: [4 radians], curl }  raised from hanging; swung side
//                          to side, root to tip
//   legs: [4 × { paw, pastern, toe }]  where each paw's ball goes, and the
//                          way its pastern (or hock) and paw point
export function restPose(rig) {
  const r = rig.ref;
  return {
    hips: { pos: r.hips.clone(), quat: new THREE.Quaternion() },
    bend: new THREE.Vector3(),
    look: Z.clone(),
    up: Y.clone(),
    jaw: 0,
    tongue: 0,
    tail: { lift: 0, wag: [0, 0, 0, 0], curl: 0 },
    legs: r.legs.map((l) => ({ paw: l.paw.clone(), pastern: l.pastern.clone(), toe: l.toe.clone() })),
  };
}

export class DogRig {
  constructor(gltf) {
    this.scene = clone(gltf.scene);
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.material = makeToon({ map: o.material.map, side: o.material.side }, { rim: 1, hatch: 0 });
      o.castShadow = true;
      o.frustumCulled = false; // bind-pose bounds don't follow a dog lying down
    });
    // Bones parent-first. Each keeps its rest pose (local), and its pose in the
    // model frame now (`mq`, `mp`, kept by #fk) and at rest.
    this.bones = {};
    this.list = [];
    this.scene.traverse((o) => { if (o.isBone) { this.bones[o.name] = o; this.list.push(o); } });
    this.list.forEach((b, i) => {
      b.userData.i = i;
      b.userData.mq = new THREE.Quaternion();
      b.userData.mp = new THREE.Vector3();
    });
    // Each bone's subtree runs on from it in the list until a bone that isn't under it.
    this.list.forEach((b, i) => {
      let end = i + 1;
      while (end < this.list.length && isUnder(this.list[end], b)) end++;
      b.userData.end = end;
    });
    // The armature's own frame, under the model's root.
    this.scene.updateMatrixWorld(true);
    const armature = this.bones.root.parent;
    const m = new THREE.Matrix4().copy(this.scene.matrixWorld).invert().multiply(armature.matrixWorld);
    this.base = { mq: new THREE.Quaternion(), mp: new THREE.Vector3() };
    m.decompose(this.base.mp, this.base.mq, _a);
    this.#fk(0, this.list.length);
    for (const b of this.list) {
      b.userData.rest = {
        p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone(),
        mq: b.userData.mq.clone(), mp: b.userData.mp.clone(),
      };
    }

    // What Dog needs to know of the dog at rest (model frame).
    const B = this.bones, at = (n) => B[n].userData.rest.mp.clone(), dir = (n) => Y.clone().applyQuaternion(B[n].userData.rest.mq);
    this.legs = LEGS.map((leg) => {
      const [A, Bn, C, D] = leg.chain.map((n) => B[n]);
      const socket = at(A.name), knee = at(Bn.name), ankle = at(C.name);
      const line = _a.subVectors(ankle, socket).normalize();
      const hint = knee.clone().sub(socket);
      hint.addScaledVector(line, -hint.dot(line)).normalize();
      return {
        ...leg, bones: [A, Bn, C, D],
        len: [Bn.position.length(), C.position.length(), D.position.length()],
        hint, // the way the joint bends, in its parent's rest frame (model)
      };
    });
    this.ref = {
      hips: at('hips'),
      head: at('head'),
      jaw: at('jaw'),
      chest: at('chest'),
      legs: this.legs.map(({ bones: [A, , C, D], side, front }) => ({
        side, front, socket: at(A.name), paw: at(D.name), pastern: dir(C.name), toe: dir(D.name),
        sole: at(D.name).y, // how high the paw's ball stands off the ground
      })),
    };
  }

  // Turns the bones to `P` (see restPose).
  pose(P) {
    for (const b of this.list) {
      const r = b.userData.rest;
      b.position.copy(r.p);
      b.quaternion.copy(r.q);
      b.scale.copy(r.s);
    }
    const B = this.bones;
    // The body: the hips joint placed, the hips turned about it.
    this.#place(B.hips, P.hips.pos, _q.copy(P.hips.quat).multiply(B.hips.userData.rest.mq));
    // The spine's bend, shared out over its four bones, each turned in its
    // parent's frame so the curve adds up along it.
    _q.setFromEuler(_e.set(P.bend.x / SPINE.length, P.bend.y / SPINE.length, P.bend.z / SPINE.length));
    for (const n of SPINE) this.#turn(B[n], _q);
    this.#fk(0, this.list.length);

    // The head toward `look`, the neck taking part of the turn, then rolled
    // about the muzzle so its up is `up`.
    for (const [n, share] of NECK) {
      const cur = this.#muzzle(_a);
      _q.setFromUnitVectors(cur, P.look);
      this.#rotate(B[n], _r.identity().slerp(_q, share));
    }
    const look = this.#muzzle(_a);
    const up = _b.copy(Y).applyQuaternion(this.#turned(B.head, _q));
    up.addScaledVector(look, -up.dot(look)).normalize();
    const want = _c.copy(P.up).addScaledVector(look, -_c.dot(look));
    if (want.lengthSq() > 1e-6) {
      want.normalize();
      const roll = Math.atan2(_d.crossVectors(up, want).dot(look), up.dot(want));
      this.#rotate(B.head, _q.setFromAxisAngle(look, roll));
    }

    // Mouth and tongue: the jaw drops about its hinge; the tongue slides out
    // over the lower teeth and droops.
    this.#turn(B.jaw, _q.setFromAxisAngle(X, P.jaw));
    if (P.tongue > 0) {
      const t = P.tongue;
      B.tongue.position.y += 0.03 * t; // along the jaw, out of the mouth
      B.tongue.position.z -= 0.006 * t;
      this.#turn(B.tongue, _q.setFromAxisAngle(X, 0.25 * t));
      this.#turn(B.tongue1, _q.setFromAxisAngle(X, 0.5 * t));
      this.#turn(B.tongue2, _q.setFromAxisAngle(X, 0.6 * t));
    }
    this.#fk(B.jaw.userData.i, B.jaw.userData.end);

    // The tail: raised from hanging (most at the root), curled toward the tip,
    // then each bone swung across the body.
    const { tail } = P;
    TAIL.forEach((n, i) => this.#turn(B[n], _q.setFromAxisAngle(X, tail.lift * [0.6, 0.25, 0.1, 0.05][i] + tail.curl * i * 0.25)));
    this.#fk(B.tail.userData.i, B.tail.userData.end);
    const side = _c.copy(X).applyQuaternion(this.#turned(B.hips, _q));
    TAIL.forEach((n, i) => {
      if (!tail.wag[i]) return;
      const along = _a.copy(Y).applyQuaternion(B[n].userData.mq);
      const axis = _b.crossVectors(side, along);
      if (axis.lengthSq() < 1e-6) return;
      this.#rotate(B[n], _q.setFromAxisAngle(axis.normalize(), tail.wag[i]));
    });

    // Each leg reaches its paw (see #reach).
    this.legs.forEach((leg, i) => this.#reach(leg, P.legs[i]));
  }

  // Two-bone IK from the socket to the pastern's (or hock's) top, set a
  // pastern's length back from the paw along `pastern`; the joint between
  // bends the way it does at rest, carried round with the body. Then the
  // pastern and paw are pointed.
  #reach(leg, { paw, pastern, toe }) {
    const [A, Bn, C, D] = leg.bones, [la, lb, lc] = leg.len;
    const socket = A.userData.mp;
    const ankle = _a.copy(paw).addScaledVector(pastern, -lc);
    const d = _b.subVectors(ankle, socket);
    const dist = THREE.MathUtils.clamp(d.length(), Math.abs(la - lb) + 1e-4, la + lb - 1e-4);
    d.normalize();
    const bend = _c.copy(leg.hint).applyQuaternion(this.#turned(A.parent, _q));
    bend.addScaledVector(d, -bend.dot(d));
    if (bend.lengthSq() < 1e-8) bend.set(0, 0, leg.front ? -1 : 1);
    bend.normalize();
    const along = (la * la - lb * lb + dist * dist) / (2 * dist);
    const out = Math.sqrt(Math.max(0, la * la - along * along));
    const knee = _d.copy(socket).addScaledVector(d, along).addScaledVector(bend, out);
    const end = d.multiplyScalar(dist).add(socket); // the ankle, as near as the leg reaches
    this.#aim(A, knee.clone().sub(socket));
    this.#aim(Bn, end.sub(Bn.userData.mp));
    this.#aim(C, pastern);
    this.#aim(D, toe);
  }

  // The muzzle's way now: the model's +z, carried round by the head's turn.
  #muzzle(out) {
    return out.copy(Z).applyQuaternion(this.#turned(this.bones.head, _r));
  }

  // A bone's turn from rest, in the model frame.
  #turned(b, out) {
    return out.copy(b.userData.mq).multiply(_s.copy(b.userData.rest.mq).invert());
  }

  // Puts a bone's joint at `mp` turned to `mq` (model frame).
  #place(b, mp, mq) {
    const p = b.parent.isBone ? b.parent.userData : this.base;
    const inv = _r.copy(p.mq).invert();
    b.quaternion.copy(inv).multiply(mq);
    b.position.copy(mp).sub(p.mp).applyQuaternion(inv);
    this.#fk(b.userData.i, b.userData.end);
  }

  // Turns a bone by `d`, a turn in its parent's rest frame (model axes), on
  // top of its rest pose.
  #turn(b, d) {
    const pq = b.parent.isBone ? b.parent.userData.rest.mq : this.base.mq;
    b.quaternion.copy(pq).invert().multiply(d).multiply(pq).multiply(b.userData.rest.q);
  }

  // Turns a bone (and everything under it) about its joint by `q`, a turn in
  // the model frame, on top of how it's turned now.
  #rotate(b, q) {
    const pq = b.parent.isBone ? b.parent.userData.mq : this.base.mq;
    b.quaternion.copy(pq).invert().multiply(q).multiply(b.userData.mq);
    this.#fk(b.userData.i, b.userData.end);
  }

  // Swings a bone so it points along `dir` (model frame), the shortest way.
  #aim(b, dir) {
    _a.copy(Y).applyQuaternion(b.userData.mq);
    this.#rotate(b, _q.setFromUnitVectors(_a, dir.normalize()));
  }

  // The bones from list[i] to list[end - 1], in the model frame.
  #fk(i, end) {
    for (let k = i; k < end; k++) {
      const b = this.list[k], d = b.userData, p = b.parent.isBone ? b.parent.userData : this.base;
      d.mq.copy(p.mq).multiply(b.quaternion);
      d.mp.copy(b.position).applyQuaternion(p.mq).add(p.mp);
    }
  }

  // Where a bone's joint is now, in the model frame.
  at(name, out = new THREE.Vector3()) {
    return out.copy(this.bones[name].userData.mp);
  }
}

function isUnder(o, b) {
  for (let p = o.parent; p; p = p.parent) if (p === b) return true;
  return false;
}
