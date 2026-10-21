// How the dog holds itself and moves its legs: a blend of postures (standing,
// sitting, lying down, curled up asleep, flopped on its side, belly up, the
// play bow and rearing up), a gait whose stride and timing follow its speed (walk, trot, gallop),
// and what plays over the top (where it looks, its tail, panting, barking,
// shaking off snow, digging, sniffing, yawning, leaping). Dog (dog.js) says
// what it wants; this eases into it and poses the rig (rig.js) every frame.
//
// Everything here is in the model frame (see rig.js), in model units: the
// dog is about a unit long.
import * as THREE from 'three';
import { restPose } from './rig.js';

const { clamp, lerp, smoothstep, euclideanModulo: mod } = THREE.MathUtils;
const TAU = Math.PI * 2;
export const POSTURES = ['stand', 'sit', 'lie', 'sleep', 'side', 'belly', 'bow', 'rear'];
// How long easing into each takes (s, about two-thirds of the way).
const EASE = { stand: 0.45, sit: 0.5, lie: 0.7, sleep: 0.9, side: 0.8, belly: 0.6, bow: 0.3, rear: 0.22 };

// Gaits by leg (front left, front right, hind left, hind right): when in the
// stride each paw touches down, and how much of the stride it's down for.
const GAITS = {
  walk: { phase: [0.25, 0.75, 0, 0.5], duty: 0.68, lift: 0.045, bob: 0.006 },
  trot: { phase: [0, 0.5, 0.5, 0], duty: 0.46, lift: 0.06, bob: 0.01 },
  gallop: { phase: [0.62, 0.5, 0, 0.12], duty: 0.34, lift: 0.075, bob: 0.03 },
};
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

// A posture's frame (or a blend of them): the hips joint and the body's turn
// about it (pitch + nose up, yaw + to its left, roll + onto its right side),
// the spine's bend, how the head is held (`nod` + up, `tilt`, `level`: 1 keeps
// the head upright, 0 rolls it with the body; `rest`: how far it lies the way
// `gaze` points, whatever Dog wants it to look at), mouth, tongue, tail and legs
// (each paw's ball, pastern and paw directions, and `plant`: 1 if it stands on
// the ground and follows it).
function frame() {
  return {
    hp: new THREE.Vector3(), pitch: 0, yaw: 0, roll: 0, bend: new THREE.Vector3(),
    nod: 0, turn: 0, tilt: 0, level: 1, rest: 0, gaze: new THREE.Vector3(0, 0, 1), jaw: 0, tongue: 0, lift: 0, curl: 0,
    legs: [0, 1, 2, 3].map(() => ({ p: new THREE.Vector3(), u: new THREE.Vector3(), t: new THREE.Vector3(), plant: 1 })),
  };
}

export class DogBody {
  constructor(rig) {
    this.rig = rig;
    this.ref = rig.ref;
    this.P = restPose(rig);
    this.frames = Object.fromEntries(POSTURES.map((k) => [k, frame()]));
    this.mix = frame();
    this.w = Object.fromEntries(POSTURES.map((k) => [k, k === 'stand' ? 1 : 0]));
    this.posture = 'stand';
    this.t = 0;

    // Moving: forward and sideways speed and turn rate (model units/s, rad/s).
    this.speed = 0;
    this.side = 0;
    this.turnRate = 0;
    this.phase = 0;
    this.gait = 0; // 0 walk … 1 trot … 2 gallop
    this.stride = 0; // how far into a stride the legs are (0 standing still … 1 striding)

    // What plays over the top, set by Dog.
    this.look = Z.clone(); // where the muzzle points (model frame), eased toward `lookAt`
    this.lookAt = Z.clone();
    this.lookRate = 6;
    this.tilt = 0; // head cocked (+ toward its right ear)
    this.wag = 0.2; // 0 still … 1 a happy wag … 1.5 the whole back end
    this.tailUp = 0; // + raised (alert, happy), − tucked
    this.pant = 0;
    this.sniff = 0; // head down to the snow
    this.dig = 0;
    this.lean = 0; // into a hand, petted
    this.wiggle = 0; // belly up, squirming
    this.tired = 0; // sleepy: slower breaths, head lower
    this.acts = []; // { kind, t, dur } — bark, yawn, shake, leap, sneeze
    this.jumpY = 0; // a leap's height off the ground (model units)
    this.wagPhase = 0;
    this.breath = 0;
    this.eased = { pant: 0, sniff: 0, dig: 0, lean: 0, wiggle: 0, tilt: 0, tailUp: 0, wag: 0.2, tired: 0 };
  }

  // Starts a one-off: 'bark', 'yawn', 'shake', 'sneeze', or 'leap' with
  // { height (model units), dur (s), reach (forward, model units) }.
  play(kind, opts = {}) {
    const dur = opts.dur ?? { bark: 0.32, yawn: 2.2, shake: 1.5, sneeze: 0.5, leap: 0.7 }[kind];
    this.acts = this.acts.filter((a) => a.kind !== kind);
    this.acts.push({ kind, t: 0, dur, ...opts });
  }
  playing(kind) {
    return this.acts.some((a) => a.kind === kind);
  }

  // `ground(x, z)`: the snow's height under a point of the model frame.
  update(dt, ground) {
    this.t += dt;
    const k = (s) => 1 - Math.exp(-dt / s);
    for (const name of POSTURES) this.w[name] += ((name === this.posture ? 1 : 0) - this.w[name]) * k(EASE[this.posture]);
    for (const key of Object.keys(this.eased)) this.eased[key] += (this[key] - this.eased[key]) * k(key === 'wag' ? 0.3 : 0.25);
    this.look.lerp(this.lookAt, k(1 / this.lookRate)).normalize();
    for (const a of this.acts) a.t += dt;
    this.acts = this.acts.filter((a) => a.t < a.dur);

    this.#gait(dt);
    this.#stand(this.frames.stand);
    this.#sit(this.frames.sit);
    this.#lie(this.frames.lie);
    this.#sleep(this.frames.sleep);
    this.#side(this.frames.side);
    this.#belly(this.frames.belly);
    this.#bow(this.frames.bow);
    this.#rear(this.frames.rear);
    const F = this.#blend();
    this.#overlay(F, dt);
    this.#toPose(F, ground);
    this.rig.pose(this.P);
  }

  // ---- Gait ----
  // The stride's timing follows how fast the legs have to go: walking, then
  // trotting from about 1.4 m/s, galloping from about 4.5 (at the game's
  // size). Turning on the spot steps too.
  #gait(dt) {
    const S = this.scale ?? 1.3; // metres per model unit
    const u = (Math.hypot(this.speed, this.side) + Math.abs(this.turnRate) * 0.3) * S; // m/s
    const want = smoothstep(u, 1.2, 1.7) + smoothstep(u, 4.0, 5.0);
    this.gait += (want - this.gait) * (1 - Math.exp(-dt * 4));
    this.stride += ((u > 0.08 ? 1 : 0) - this.stride) * (1 - Math.exp(-dt * (u > 0.08 ? 10 : 6)));
    this.hz = clamp(1.45 + u * 0.5, 1.45, 3.3);
    if (this.stride > 0.01) this.phase = mod(this.phase + this.hz * dt, 1);
    else this.phase = 0;
  }

  // The stride's mix of the walk, trot and gallop.
  #gaitMix() {
    const g = this.gait, a = g < 1 ? GAITS.walk : GAITS.trot, b = g < 1 ? GAITS.trot : GAITS.gallop, f = g < 1 ? g : g - 1;
    return {
      phase: a.phase.map((p, i) => p + (mod(b.phase[i] - p + 0.5, 1) - 0.5) * f),
      duty: lerp(a.duty, b.duty, f), lift: lerp(a.lift, b.lift, f), bob: lerp(a.bob, b.bob, f),
    };
  }

  // ---- Postures ----
  // Standing, and on the move: each paw slides back under the body as fast as
  // the body goes over it while it's down, then swings forward, lifting and
  // folding, to land half a stride ahead.
  #stand(F) {
    const r = this.ref, m = this.#gaitMix(), s = this.stride;
    F.hp.copy(r.hips);
    F.pitch = F.yaw = F.roll = 0;
    F.bend.set(0, 0, 0);
    F.nod = F.turn = F.tilt = 0;
    F.level = 1;
    F.rest = F.jaw = F.tongue = F.lift = F.curl = 0;
    const stance = m.duty / this.hz; // s a paw is down
    r.legs.forEach((leg, i) => {
      const L = F.legs[i];
      L.p.copy(leg.paw);
      L.u.copy(leg.pastern);
      L.t.copy(leg.toe);
      L.plant = 1;
      if (s < 0.001) return;
      // The paw's slide under the body while it's down: back against the body's
      // way, and round against its turning.
      const vx = -(this.side + this.turnRate * leg.paw.z), vz = -(this.speed - this.turnRate * leg.paw.x);
      const p = mod(this.phase + m.phase[i], 1);
      let along, up = 0, fold = 0;
      if (p < m.duty) along = p / m.duty - 0.5;
      else {
        const q = (p - m.duty) / (1 - m.duty);
        along = 0.5 - smoothstep(q, 0, 1);
        up = Math.sin(Math.PI * q) ** 0.8;
        fold = Math.sin(Math.PI * Math.min(1, q * 1.25));
      }
      L.p.x += vx * stance * along * s;
      L.p.z += vz * stance * along * s;
      L.p.y += up * m.lift * s * (i < 2 ? 1 : 0.85);
      // The pastern folds back as the paw lifts (more in front), the paw curling under.
      const f = fold * s * (i < 2 ? 1.25 : 0.6);
      _q.setFromAxisAngle(X, f);
      L.u.applyQuaternion(_q);
      L.t.applyQuaternion(_q.setFromAxisAngle(X, f * 1.3));
    });
    // The body rides each footfall: down at mid-stance, up between, rocking nose
    // to tail at the gallop, rolling a little at the walk.
    const ph = this.phase * TAU, gal = Math.max(0, this.gait - 1);
    F.hp.y -= m.bob * s * (0.5 - 0.5 * Math.cos(2 * ph)) * (1 - gal) + 0.03 * gal * s * (0.5 + 0.5 * Math.sin(ph));
    F.hp.y -= 0.012 * gal * s; // crouched lower, reaching out
    F.pitch = 0.09 * gal * s * Math.sin(ph + 0.6);
    F.bend.x = 0.22 * gal * s * Math.sin(ph - 0.4); // the spine bunching and stretching
    F.roll = 0.035 * s * (1 - this.gait * 0.5) * Math.sin(ph) * (this.gait < 1.5 ? 1 : 0);
    F.bend.y = -0.25 * this.turnRate / Math.max(1, Math.abs(this.speed) * 3);
    F.nod = -0.08 * s - 0.05 * gal * s + 0.04 * s * Math.sin(2 * ph);
    F.lift = 0.3 * s + 0.5 * gal * s; // the tail out behind on the run
  }

  // Sitting: the rump down between the hind legs, hocks flat on the snow and
  // hind paws forward beside it, the front legs straight under the chest, the
  // tail lying out behind.
  #sit(F) {
    const r = this.ref;
    F.hp.set(r.hips.x, r.hips.y - 0.235, r.hips.z + 0.06);
    F.pitch = 0.62;
    F.yaw = F.roll = 0;
    F.bend.set(-0.12, 0, 0);
    F.nod = 0.1;
    F.turn = F.tilt = 0;
    F.level = 1;
    F.rest = F.jaw = F.tongue = F.curl = 0;
    F.lift = 0.85;
    const q = this.#bodyTurn(F, _q);
    r.legs.forEach((leg, i) => {
      const L = F.legs[i];
      L.plant = 1;
      if (i < 2) {
        // Straight down from where the shoulder has got to.
        _v.copy(leg.socket).sub(r.hips).applyQuaternion(q).add(F.hp);
        L.p.set(leg.paw.x * 0.95, leg.sole, _v.z + 0.02);
        L.u.copy(leg.pastern);
        L.t.copy(leg.toe);
      } else {
        L.p.set(leg.paw.x * 1.15, leg.sole * 0.9, r.hips.z + 0.17);
        L.u.set(0, -0.12, 1).normalize();
        L.t.set(0, -0.35, 1).normalize();
      }
    });
  }

  // Lying down, head up: chest and belly on the snow, forelegs out in front,
  // hind legs folded under at the sides.
  #lie(F) {
    const r = this.ref;
    F.hp.set(r.hips.x, r.hips.y - 0.25, r.hips.z + 0.02);
    F.pitch = 0.04;
    F.yaw = F.roll = 0;
    F.bend.set(0.05, 0, 0);
    F.nod = -0.05;
    F.turn = F.tilt = 0;
    F.level = 1;
    F.rest = 0;
    F.jaw = F.tongue = F.curl = 0;
    F.lift = 0.6;
    r.legs.forEach((leg, i) => {
      const L = F.legs[i];
      L.plant = 1;
      if (i < 2) {
        L.p.set(leg.paw.x * 1.05, leg.sole * 0.8, leg.paw.z + 0.24);
        L.u.set(0, -0.1, 1).normalize();
        L.t.set(0, -0.25, 1).normalize();
      } else {
        L.p.set(leg.paw.x * 1.6, leg.sole * 0.8, leg.paw.z + 0.12);
        L.u.set(leg.paw.x * 0.6, -0.15, 1).normalize();
        L.t.set(leg.paw.x * 0.6, -0.3, 1).normalize();
      }
    });
  }

  // Asleep curled up nose to tail, the way it keeps warm in the snow: lying
  // over a little onto its right hip, back curved round to its left, paws
  // tucked in, chin down on its hind leg.
  #sleep(F) {
    const r = this.ref;
    F.hp.set(r.hips.x - 0.02, r.hips.y - 0.27, r.hips.z + 0.04);
    F.pitch = 0.02;
    F.yaw = -0.55;
    F.roll = 0.3;
    F.bend.set(0.08, 1.15, 0.1);
    F.nod = F.turn = F.tilt = 0;
    F.level = 0.4;
    F.rest = 1;
    F.gaze.set(0.95, -0.42, -0.25).normalize();
    F.jaw = F.tongue = 0;
    F.lift = 0.5;
    F.curl = 0.5;
    r.legs.forEach((leg, i) => {
      const L = F.legs[i];
      L.plant = 1;
      if (i < 2) {
        // Forelegs folded under the chest, paws out toward the curl.
        L.p.set(leg.paw.x + 0.1, leg.sole * 0.8, leg.paw.z + 0.12 - (leg.side === 1 ? 0 : 0.06));
        L.u.set(0.4, -0.1, 1).normalize();
        L.t.set(0.4, -0.3, 1).normalize();
      } else {
        // Hind legs drawn up along the belly.
        L.p.set(leg.paw.x * 1.5 + 0.08, leg.sole * 0.8, leg.paw.z + 0.2);
        L.u.set(0.5, -0.12, 1).normalize();
        L.t.set(0.5, -0.3, 1).normalize();
      }
    });
  }

  // Flopped over on its right side, legs out loose, head down on the snow:
  // basking, or worn out.
  #side(F) {
    const r = this.ref;
    F.pitch = 0;
    F.yaw = 0;
    F.roll = 1.42;
    F.hp.set(r.hips.x + 0.1, 0.175, r.hips.z);
    F.bend.set(-0.1, 0.1, 0);
    F.nod = F.turn = F.tilt = 0;
    F.level = 0;
    F.rest = 1;
    F.jaw = F.tongue = 0;
    F.lift = 0.9;
    F.curl = 0.2;
    const q = this.#bodyTurn(F, _q);
    F.gaze.set(0, -0.12, 1).applyQuaternion(q).normalize();
    r.legs.forEach((leg, i) => {
      const L = F.legs[i];
      // Each paw drawn in toward its socket, forelegs reaching forward and hind
      // legs back; the lower pair on the snow, the upper pair resting on them.
      _v.copy(leg.paw).lerp(leg.socket, 0.3);
      _v.z += i < 2 ? 0.12 : -0.06;
      L.p.copy(_v).sub(r.hips).applyQuaternion(q).add(F.hp);
      L.p.y = leg.sole + (leg.side === 1 ? 0.075 : 0);
      L.u.set(0, -1, 0.5).normalize().applyQuaternion(q);
      L.t.set(0, -0.5, 1).normalize().applyQuaternion(q);
      L.plant = 0;
    });
  }

  // Belly up for a rub: on its back, paws folded in the air, tail wagging on the snow.
  #belly(F) {
    const r = this.ref;
    F.pitch = 0.05;
    F.yaw = 0;
    F.roll = 2.55;
    F.hp.set(r.hips.x + 0.08, 0.2, r.hips.z);
    F.bend.set(-0.1, 0, 0);
    F.nod = 0.2;
    F.turn = F.tilt = 0;
    F.level = 0.35;
    F.rest = 0;
    F.jaw = 0.18;
    F.tongue = 0.6;
    F.lift = 0.5;
    F.curl = 0;
    const q = this.#bodyTurn(F, _q);
    r.legs.forEach((leg, i) => {
      const L = F.legs[i];
      _v.copy(leg.paw).lerp(leg.socket, i < 2 ? 0.55 : 0.4);
      _v.z += i < 2 ? -0.02 : 0.06;
      _v.x += leg.side * 0.05;
      L.p.copy(_v).sub(r.hips).applyQuaternion(q).add(F.hp);
      L.u.set(0, -0.4, -1).normalize().applyQuaternion(q); // the forepaws folded back
      if (i >= 2) L.u.set(0, -1, 0.5).normalize().applyQuaternion(q);
      L.t.set(0, -1, -0.3).normalize().applyQuaternion(q);
      L.plant = 0;
    });
  }

  // The play bow: elbows down on the snow, rump up, tail high: "play with me!"
  #bow(F) {
    const r = this.ref;
    F.hp.set(r.hips.x, r.hips.y + 0.02, r.hips.z - 0.03);
    F.pitch = -0.5;
    F.yaw = F.roll = 0;
    F.bend.set(0.1, 0, 0);
    F.nod = 0.55;
    F.turn = F.tilt = 0;
    F.level = 1;
    F.rest = 0;
    F.jaw = 0.12;
    F.tongue = 0.4;
    F.lift = 1.4;
    F.curl = 0.3;
    r.legs.forEach((leg, i) => {
      const L = F.legs[i];
      L.plant = 1;
      if (i < 2) {
        L.p.set(leg.paw.x * 1.1, leg.sole * 0.8, leg.paw.z + 0.23);
        L.u.set(0, -0.08, 1).normalize();
        L.t.set(0, -0.2, 1).normalize();
      } else {
        L.p.copy(leg.paw);
        L.p.z -= 0.03;
        L.u.copy(leg.pastern);
        L.t.copy(leg.toe);
      }
    });
  }

  // Up on its hind legs, forepaws up and folded: to greet someone, or begging.
  #rear(F) {
    const r = this.ref;
    F.pitch = 0.95;
    F.yaw = F.roll = 0;
    F.hp.set(r.hips.x, r.hips.y - 0.08, r.hips.z + 0.1);
    F.bend.set(-0.15, 0, 0);
    F.nod = -0.1;
    F.turn = F.tilt = 0;
    F.level = 1;
    F.rest = 0;
    F.jaw = 0.15;
    F.tongue = 0.5;
    F.lift = 1.1;
    F.curl = 0;
    const q = this.#bodyTurn(F, _q);
    r.legs.forEach((leg, i) => {
      const L = F.legs[i];
      if (i < 2) {
        _v.copy(leg.paw).lerp(leg.socket, 0.45);
        _v.z += 0.1;
        L.p.copy(_v).sub(r.hips).applyQuaternion(q).add(F.hp);
        L.u.set(0, -0.6, -1).normalize().applyQuaternion(q);
        L.t.set(0, -1, -0.2).normalize().applyQuaternion(q);
        L.plant = 0;
      } else {
        L.p.copy(leg.paw);
        L.p.z += 0.06;
        L.u.set(0, -1, 0.5).normalize();
        L.t.copy(leg.toe);
        L.plant = 1;
      }
    });
  }

  // A posture's turn of the body, as a quaternion.
  #bodyTurn(F, out) {
    return out.setFromEuler(_e.set(-F.pitch, F.yaw, F.roll, 'YXZ'));
  }

  #blend() {
    const M = this.mix;
    let total = 0;
    for (const k of POSTURES) total += this.w[k];
    const first = POSTURES.find((k) => this.w[k] > 0);
    const keys = ['pitch', 'yaw', 'roll', 'nod', 'turn', 'tilt', 'level', 'rest', 'jaw', 'tongue', 'lift', 'curl'];
    for (const key of keys) M[key] = 0;
    M.gaze.set(0, 0, 0);
    M.hp.set(0, 0, 0);
    M.bend.set(0, 0, 0);
    for (const L of M.legs) { L.p.set(0, 0, 0); L.u.set(0, 0, 0); L.t.set(0, 0, 0); L.plant = 0; }
    for (const k of POSTURES) {
      const w = this.w[k] / total;
      if (w < 1e-4 && k !== first) continue;
      const F = this.frames[k];
      for (const key of keys) M[key] += F[key] * w;
      M.gaze.addScaledVector(F.gaze, F.rest * w);
      M.hp.addScaledVector(F.hp, w);
      M.bend.addScaledVector(F.bend, w);
      F.legs.forEach((L, i) => {
        const O = M.legs[i];
        O.p.addScaledVector(L.p, w);
        O.u.addScaledVector(L.u, w);
        O.t.addScaledVector(L.t, w);
        O.plant += L.plant * w;
      });
    }
    for (const L of M.legs) { L.u.normalize(); L.t.normalize(); }
    return M;
  }

  // ---- Over the top ----
  #overlay(F, dt) {
    const e = this.eased, t = this.t;
    const up = 1 - this.w.sleep - this.w.belly; // the share of postures it's upright in
    const standing = this.w.stand;
    // Breathing: slow asleep, quick panting.
    const rate = lerp(lerp(0.32, 0.22, e.tired), 2.8, e.pant);
    this.breath = mod(this.breath + rate * dt, 1);
    const b = Math.sin(this.breath * TAU);
    F.bend.x += b * lerp(0.012, 0.02, F.rest) + b * e.pant * 0.01;
    F.hp.y += b * 0.003;
    // Panting: mouth open, tongue out.
    F.jaw = Math.max(F.jaw, e.pant * (0.2 + 0.05 * b));
    F.tongue = Math.max(F.tongue, e.pant);
    // Sniffing: nose down to the snow, a little search side to side.
    F.nod -= e.sniff * 1.0 * up;
    F.bend.x += e.sniff * 0.12 * standing;
    F.turn += e.sniff * 0.25 * Math.sin(t * 1.7) * up;
    // Tired: head low.
    F.nod -= e.tired * 0.15 * (1 - F.rest);
    // Petted: leaning up into the hand, rubbing side to side.
    F.nod += e.lean * 0.35;
    F.tilt += e.lean * 0.3 * Math.sin(t * 1.6);
    F.tilt += e.tilt;
    // Belly up: squirming.
    F.roll += e.wiggle * 0.15 * Math.sin(t * 7);
    F.bend.y += e.wiggle * 0.2 * Math.sin(t * 7 + 1);
    for (const L of F.legs) if (L.plant < 0.5) L.p.y += e.wiggle * 0.02 * Math.sin(t * 9 + L.p.x * 40);
    // Digging: forepaws scraping the snow in turn, head down, rump up.
    if (e.dig > 0.01) {
      F.pitch -= 0.18 * e.dig;
      F.nod -= 0.5 * e.dig;
      F.hp.y += 0.02 * e.dig;
      for (let i = 0; i < 2; i++) {
        const p = mod(t * 3.2 + i * 0.5, 1);
        const L = F.legs[i];
        // Forward and up, down onto the snow, then raked back hard.
        const z = p < 0.45 ? lerp(-0.08, 0.14, smoothstep(p, 0, 0.45)) : lerp(0.14, -0.08, (p - 0.45) / 0.55);
        const y = p < 0.45 ? Math.sin((p / 0.45) * Math.PI) * 0.09 : 0;
        L.p.z += z * e.dig;
        L.p.y += y * e.dig;
        L.u.applyQuaternion(_q.setFromAxisAngle(X, (p < 0.45 ? 0.9 : 0.2) * e.dig));
        L.plant = lerp(L.plant, 0, e.dig);
      }
    }
    // The tail: raised by mood, wagging from the root with each bone lagging
    // the one before. A big wag swings the rump too.
    F.lift += e.tailUp * 0.7 * (1 - F.rest);
    const hz = lerp(1.2, 4.2, clamp(e.wag, 0, 1));
    this.wagPhase += hz * dt;
    const amp = clamp(e.wag, 0, 1.5) * 0.42 * (this.w.sit * 0.6 + up * 0.4 + this.w.belly * 0.5);
    this.wagAmp = amp;
    F.yaw += Math.max(0, e.wag - 1) * 0.12 * Math.sin(this.wagPhase * TAU) * standing;

    // One-offs.
    for (const a of this.acts) {
      const u = a.t / a.dur;
      if (a.kind === 'bark') {
        // Mouth snaps open and shut, head jerking up with it.
        const s = Math.sin(Math.PI * clamp(u * 1.3, 0, 1));
        F.jaw = Math.max(F.jaw, s * 0.42);
        F.nod += s * 0.18;
        F.hp.y += s * 0.008;
      } else if (a.kind === 'yawn') {
        const s = smoothstep(u, 0, 0.35) * (1 - smoothstep(u, 0.7, 1));
        F.jaw = Math.max(F.jaw, s * 0.6);
        F.tongue = Math.max(F.tongue, s * 0.4);
        F.nod += s * 0.35;
      } else if (a.kind === 'sneeze') {
        const s = Math.sin(Math.PI * u);
        F.nod -= s * 0.5;
        F.jaw = Math.max(F.jaw, s * 0.15);
      } else if (a.kind === 'shake') {
        // A shake runs from the head down to the tail: the body rolls back and
        // forth hard, the head ahead of it.
        const s = smoothstep(u, 0, 0.12) * (1 - smoothstep(u, 0.8, 1));
        const w = t * 4.6 * TAU;
        F.roll += Math.sin(w - 0.6) * 0.28 * s * up;
        F.bend.z += Math.sin(w - 0.3) * 0.5 * s * up;
        F.tilt += Math.sin(w) * 0.6 * s * up;
        F.turn += Math.sin(w + 0.4) * 0.15 * s;
        F.yaw += Math.sin(w - 0.9) * 0.05 * s;
        F.lift += 0.3 * s;
      } else if (a.kind === 'leap') {
        // Up and over in an arc, forepaws reaching then tucked, landing
        // front first.
        const h = a.height ?? 0.25;
        this.jumpY = 4 * h * u * (1 - u);
        F.pitch += (0.35 - u * 0.7) * Math.sin(Math.PI * u) * (a.tilt ?? 1);
        for (let i = 0; i < 4; i++) {
          const L = F.legs[i];
          const tuck = Math.sin(Math.PI * u);
          L.plant = lerp(L.plant, 0, tuck);
          L.p.y += tuck * (i < 2 ? 0.08 : 0.04);
          L.p.z += (i < 2 ? 0.1 : -0.06) * tuck;
          L.u.applyQuaternion(_q.setFromAxisAngle(X, tuck * (i < 2 ? 0.9 : 0.4)));
        }
      }
    }
    if (!this.playing('leap')) this.jumpY = 0;
  }

  // ---- Into the rig's pose ----
  // The body pitched with the ground under it (most of the slope, so it stays
  // a little more level than the snow), and the planted paws on the snow.
  #toPose(F, ground) {
    const P = this.P, r = this.ref;
    const front = (r.legs[0].paw.z + r.legs[1].paw.z) / 2, hind = (r.legs[2].paw.z + r.legs[3].paw.z) / 2;
    const gF = ground(0, front), gH = ground(0, hind);
    const slope = Math.atan2(gF - gH, front - hind) * 0.8;
    const lift = (gF + gH) / 2 - Math.sin(slope) * (front - hind) / 2 + this.jumpY;
    _e.set(-(F.pitch + slope), F.yaw, F.roll, 'YXZ');
    P.hips.quat.setFromEuler(_e);
    P.hips.pos.copy(F.hp);
    P.hips.pos.y += lift;
    P.bend.copy(F.bend);

    // Head: where Dog wants it, nodded and turned by the posture, kept upright
    // (or rolled with the body, lying on its side).
    _v.copy(this.look);
    _q.setFromAxisAngle(Y, F.turn);
    _v.applyQuaternion(_q);
    const flat = Math.hypot(_v.x, _v.z) || 1e-6;
    let pitch = Math.atan2(_v.y, flat) + F.nod;
    pitch = clamp(pitch, -1.25, 1.1);
    const yaw = Math.atan2(_v.x, _v.z);
    P.look.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // Lying with its head down, it rests where the posture puts it.
    if (F.rest > 0) P.look.lerp(_w.copy(F.gaze).normalize(), F.rest).normalize();
    _w.copy(Y).applyQuaternion(P.hips.quat);
    P.up.copy(Y).lerp(_w, 1 - F.level).normalize();
    P.up.applyQuaternion(_q.setFromAxisAngle(P.look, -F.tilt));

    P.jaw = F.jaw;
    P.tongue = clamp(F.tongue, 0, 1);
    P.tail.lift = F.lift;
    P.tail.curl = F.curl;
    const wp = this.wagPhase * TAU, amp = this.wagAmp ?? 0;
    for (let i = 0; i < 4; i++) P.tail.wag[i] = amp * Math.sin(wp - i * 0.55) * [0.6, 0.45, 0.4, 0.35][i];

    F.legs.forEach((L, i) => {
      const O = P.legs[i];
      O.paw.copy(L.p);
      O.paw.y += ground(L.p.x, L.p.z) * L.plant + (1 - L.plant) * lift;
      O.pastern.copy(L.u);
      O.toe.copy(L.t);
    });
  }
}
