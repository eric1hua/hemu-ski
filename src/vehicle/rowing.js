// Rowing: the boat on its lake (see world/lakes.js), moved by its oars. Each
// stroke is a drive, the blades in the water pulling, then a recovery, the
// blades out and swinging back; the boat surges on the drive and glides on the
// recovery. Stop rowing and it glides on, slowing over a dozen seconds or so,
// then drifts on the breeze. W rows (both oars pull), S backs water (both
// push), A and D pull harder on one oar and ease or back the other, so it
// turns, on the spot if that's all you do; Space holds the blades square in the
// water and stops it. It rocks on the lake's waves (waveHeight()), the bow
// lifting as the rower reaches for the catch and dipping as they swing back.
// The shore stops it: points round the hull are kept off the bank, and it
// turns about the one that touches.
//
// The rower faces the stern, as rowers do, so the boat goes bow first, away
// from them. `oars` says where each oar is for the model, the port oar first.
import * as THREE from 'three';
import { shoreAt, waveHeight } from '../world/lakes.js';

export const ROWBOAT = {
  stroke: 2.4, // s for a stroke at a steady pace
  drive: 0.42, // of a stroke, the blades in the water
  pull: 0.8, // m/s² from each oar at the height of the drive
  back: 0.65, // backing water pushes this much as hard as rowing pulls
  turn: 1.1, // rad/s² of turn per m/s² of difference between the oars
  catch: 0.7, // rad: the blades forward at the catch, toward the bow
  finish: 0.38, // rad: and aft at the finish
  drag: [0.05, 0.06], // along the hull, m/s² per m/s and per (m/s)²
  slip: [1.1, 0.8], // across it: the keel's grip
  spin: [1.0, 0.6], // against turning, per rad/s and (rad/s)²
  hold: 1.4, // blades held square in the water: per m/s, and per rad/s
  breeze: 0.008, // m/s² the wind pushes a crewed boat toward the east-south-east
  steer: 1, // the most `steer` gets, for the rider's twist
};
// The oars at rest: resting on them, blades flat on the water; and shipped
// with no one aboard, trailed aft along the hull. { angle (rad toward the
// bow), dip (0 out of the water … 1 in it), feather (0 square … 1 flat) }.
const RESTING = { angle: 0.05, dip: 0.35, feather: 1 };
const SHIPPED = { angle: -1.25, dip: 0.55, feather: 1 };
const BREEZE = new THREE.Vector2(0.92, 0.38).normalize(); // as the lake's waves
const _f = new THREE.Vector3(), _l = new THREE.Vector3();

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const ease = (v, to, rate, dt) => v + (to - v) * (1 - Math.exp(-dt * rate));
// A damped spring { x, v } toward `to`: `w` its natural frequency, `z` its damping.
function spring(s, to, w, z, dt) {
  s.v += (-w * w * (s.x - to) - 2 * z * w * s.v) * dt;
  s.x += s.v * dt;
}

export class RowingPhysics {
  // `lake`: the one it floats on; `dims`: the hull's { length, beam }.
  constructor({ lake, dims, handling = ROWBOAT }) {
    this.lake = lake;
    this.lakes = [lake];
    this.dims = dims;
    this.h = handling;
    this.obstacles = []; // the vehicles' footprints get pushed in here; nothing on the water to hit
    this.pos = new THREE.Vector3(); // on the water, amidships
    this.vel = new THREE.Vector3(); // horizontal
    this.yaw = 0; // as the rider's: forward (the bow) is (-sin yaw, 0, -cos yaw)
    this.yawRate = 0;
    this.steer = 0; // which oar pulls harder, + the starboard (turning left)
    this.accel = 0; // along the boat, smoothed
    this.lateral = 0; // toward its left
    this.slip = 0;
    this.t = 0; // the waves' clock
    this.crewed = false;
    this.phase = 1; // through the stroke: 0 the catch, `drive` the finish, 1 the next catch
    this.rest = 1; // 1 resting on the oars (or shipped) … 0 rowing
    this.holding = 0; // blades held in the water
    this.efforts = [0, 0]; // port, starboard: 1 rows, -1 backs water, eased
    this.drives = [0, 0]; // each oar's effort this drive: its sign held from the catch
    this.from = [0, 0]; // each oar's sweep as its recovery began
    this.sweeps = [0, 0]; // -1 blade forward … 1 blade aft
    this.oars = [{ ...SHIPPED }, { ...SHIPPED }]; // for the model
    this.heave = { x: 0, v: 0 };
    this.pitch = { x: 0, v: 0 }; // + the bow up
    this.roll = { x: 0, v: 0 }; // + the port side up
    this.shore = Infinity; // how far the hull is from the nearest bank
    this.events = [];
  }

  reset(x, z, yaw) {
    this.pos.set(x, this.lake.level, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = this.steer = this.accel = this.lateral = this.slip = 0;
    this.#move(0, 0, 0);
  }

  get speed() { return this.vel.length(); }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  left(out = new THREE.Vector3()) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }
  // Close enough to a bank to step out onto it.
  get canExit() { return this.shore < 1.2; }

  // A jolt: someone stepping in or out, on the port side (+) or starboard.
  nudge(side) {
    this.roll.v += side * 0.18;
    this.heave.v -= 0.2;
  }

  // input: { throttle (row), reverse (back water), steer (-1…1, + left), handbrake (hold water) }
  step(dt, input) {
    this.crewed = true;
    const [port, starboard] = this.#stroke(dt, input);
    this.#move(dt, port + starboard, (starboard - port) * this.h.turn);
  }

  // No one aboard: the oars shipped, rocking where it was left.
  coast(dt) {
    this.crewed = false;
    this.#stroke(dt, null);
    this.#move(dt, 0, 0);
  }

  // The oars through the stroke; returns the push from each (m/s² along the boat).
  #stroke(dt, input) {
    const H = this.h, D = H.drive;
    let want = [0, 0], rowing = false, holding = false;
    if (input) {
      const fwd = input.throttle === input.reverse ? 0 : input.throttle ? 1 : -1;
      want = [clamp(fwd - input.steer, -1, 1), clamp(fwd + input.steer, -1, 1)];
      rowing = Math.abs(want[0]) > 0.05 || Math.abs(want[1]) > 0.05;
      holding = input.handbrake && !rowing;
    }
    for (let i = 0; i < 2; i++) this.efforts[i] = ease(this.efforts[i], want[i], 5, dt);
    this.steer = ease(this.steer, (want[1] - want[0]) / 2, 6, dt);
    // Taking up the oars from rest, they swing forward to the catch first.
    if (rowing && this.rest > 0.95) {
      this.phase = 0.8;
      this.from = [...this.sweeps];
      this.drives = [0, 0];
    }
    this.rest = ease(this.rest, rowing ? 0 : 1, rowing ? 6 : 2.5, dt);
    this.holding = ease(this.holding, holding ? 1 : 0, 5, dt);

    const was = this.phase;
    if (this.rest < 0.98) this.phase += dt / H.stroke;
    if (this.phase >= 1) {
      // The catch: each oar takes its effort for this drive.
      this.phase -= 1;
      this.drives = [...this.efforts];
      if (this.rest < 0.5) this.events.push({ type: 'catch', oars: this.drives.map((e) => Math.abs(e) > 0.1) });
    }
    if (was < D && this.phase >= D) {
      this.from = [...this.sweeps];
      if (this.rest < 0.5) this.events.push({ type: 'release', oars: this.drives.map((e) => Math.abs(e) > 0.1) });
    }

    const push = [0, 0];
    const still = this.crewed ? RESTING : SHIPPED;
    for (let i = 0; i < 2; i++) {
      let s, dip;
      if (this.phase < D) {
        // The drive: as hard as the oar's asked now, the way it was asked at the catch.
        const u = this.phase / D, sign = Math.sign(this.drives[i]);
        const c = sign * Math.max(0, this.efforts[i] * sign);
        s = -c * Math.cos(Math.PI * u);
        dip = Math.abs(this.drives[i]) > 0.05 ? smooth(0, 0.1, u) * (1 - smooth(0.9, 1, u)) : 0;
        push[i] = c * (c < 0 ? H.back : 1) * H.pull * Math.sin(Math.PI * u) * dip * (1 - this.rest);
      } else {
        // The recovery: blades out, swinging back to where the next catch wants them.
        const u = (this.phase - D) / (1 - D);
        s = THREE.MathUtils.lerp(this.from[i], -this.efforts[i], smooth(0, 1, u));
        dip = 0;
      }
      this.sweeps[i] = s;
      const o = this.oars[i];
      const angle = s < 0 ? -s * H.catch : -s * H.finish;
      o.angle = THREE.MathUtils.lerp(THREE.MathUtils.lerp(angle, still.angle, this.rest), 0, this.holding);
      o.dip = THREE.MathUtils.lerp(THREE.MathUtils.lerp(dip, still.dip, this.rest), 1, this.holding);
      o.feather = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1 - dip, still.feather, this.rest), 0, this.holding);
    }
    return push;
  }

  // Along and across the hull, turning, the shore, and the rocking.
  #move(dt, push, torque) {
    const H = this.h;
    this.t += dt;
    const f = this.forward(_f), l = this.left(_l);
    let vF = this.vel.dot(f), vL = this.vel.dot(l);
    const v0 = vF;
    vF += push * dt;
    if (this.crewed) {
      vF += (BREEZE.x * f.x + BREEZE.y * f.z) * H.breeze * dt;
      vL += (BREEZE.x * l.x + BREEZE.y * l.z) * H.breeze * dt;
    }
    const hold = this.holding * H.hold;
    vF -= (H.drag[0] * vF + H.drag[1] * vF * Math.abs(vF) + hold * vF) * dt;
    vL -= (H.slip[0] * vL + H.slip[1] * vL * Math.abs(vL) + hold * vL) * dt;
    this.slip = Math.abs(vL);
    let w = this.yawRate + torque * dt;
    w -= (H.spin[0] * w + H.spin[1] * w * Math.abs(w) + hold * w) * dt;
    this.yawRate = w;
    this.yaw += w * dt;
    // Back into world space along the old heading: the boat has turned under
    // its way, and next step the keel bleeds off what's now across it.
    this.vel.copy(f).multiplyScalar(vF).addScaledVector(l, vL);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.#shore();

    // Rocking: toward the plane of the waves under bow, stern and sides, the
    // bow up as the rower leans to the catch, and settled a little with them in.
    const { length: L, beam: B } = this.dims;
    const fw = this.forward(_f), lf = this.left(_l), { x, z } = this.pos, t = this.t;
    const at = (a, s) => waveHeight(x + fw.x * a + lf.x * s, z + fw.z * a + lf.z * s, t);
    const bow = at(L * 0.38, 0), stern = at(-L * 0.38, 0), port = at(0, B * 0.45), stbd = at(0, -B * 0.45);
    const lean = (this.sweeps[0] + this.sweeps[1]) / 2 * (1 - this.rest);
    if (dt > 0) {
      spring(this.heave, (bow + stern + port + stbd) / 4 - (this.crewed ? 0.035 : 0), 4.2, 0.3, dt);
      spring(this.pitch, (bow - stern) / (L * 0.76) - lean * 0.014 + this.accel * 0.004, 3.4, 0.18, dt);
      spring(this.roll, (port - stbd) / (B * 0.9) + this.lateral * 0.01, 2.9, 0.14, dt);
      const vF1 = this.vel.dot(f);
      this.accel = ease(this.accel, (vF1 - v0) / dt, 10, dt);
      this.lateral = ease(this.lateral, vF1 * this.yawRate, 10, dt);
    }
    this.pos.y = this.lake.level + this.heave.x;
  }

  // Points round the hull kept just off the bank. Touching it, the boat loses
  // its way into the bank (with a little bounce) and turns about that point.
  #shore() {
    const { length: L, beam: B } = this.dims;
    const f = this.forward(_f), l = this.left(_l);
    const I = (L * L + B * B) / 12; // per unit mass, about the middle
    let nearest = Infinity;
    for (const [a, s] of HULL) {
      const ra = a * L / 2, rs = s * B / 2;
      const rx = f.x * ra + l.x * rs, rz = f.z * ra + l.z * rs;
      const edge = shoreAt(this.lakes, this.pos.x + rx, this.pos.z + rz, 6);
      if (!edge) continue;
      nearest = Math.min(nearest, -edge.d);
      const depth = edge.d + 0.1;
      if (depth <= 0) continue;
      const { nx, nz } = edge;
      this.pos.x -= nx * depth;
      this.pos.z -= nz * depth;
      // The point's way into the bank, with the turn.
      const vn = (this.vel.x + this.yawRate * rz) * nx + (this.vel.z - this.yawRate * rx) * nz;
      if (vn <= 0) continue;
      const c = rz * nx - rx * nz; // the push's turn about the middle, per unit
      const j = (-(1 + 0.15) * vn) / (1 + (c * c) / I);
      this.vel.x += j * nx;
      this.vel.z += j * nz;
      this.yawRate += (j * c) / I;
      if (vn > 1.2) this.events.push({ type: 'crash', reason: 'ground', speed: vn });
    }
    this.shore = nearest;
  }
}

// Where the hull is checked against the shore, as (along, across) fractions of
// half its length and half its beam: the stem, the bow's shoulders, the widest
// point, the quarters and the transom's corners.
const HULL = [[0.98, 0], [0.55, 0.62], [0.55, -0.62], [0, 1], [0, -1], [-0.6, 0.9], [-0.6, -0.9], [-1, 0.62], [-1, -0.62]];
