// Arcade flight for the Jetson ONE, a single-seat electric multirotor, over the
// real heightfield. It flies the way its flight controller makes it feel, with
// far more power than the real one (which is held to 102 km/h): W tilts it
// nose-down and it reaches 100 km/h in about 3 s and its 180 km/h limit in
// about 7; S tilts it back to brake hard and then backs it off; let go and it
// levels out, stops within a few seconds and holds its height. A/D spin it on
// the spot at a hover and turn it more gently at speed, banking into the turn,
// tight enough at full speed to come round in about 150 m. Space climbs at
// 15 m/s and Shift comes down at 10; it holds its height in between, and low
// over the snow it climbs to keep clear of what's ahead, unless you're coming
// down. On the snow it sits on its skids, set on the plane under their four
// feet, until Space lifts it off.
// Walls are the edge of the heightfield, tiles deleted in the map editor, and,
// while it's low enough to hit them, the buildings (`obstacles`, rotated boxes
// { x, z, yaw, hw, hd, top }) and the trees; it bounces off them.
import * as THREE from 'three';

const G = 9.81;
const EDGE = 40; // metres kept clear of the heightfield's edge
export const JETSON = {
  topSpeed: 180 / 3.6, // its limiter, m/s
  backSpeed: 12,
  tilt: 0.5, // most it leans to speed up, slow down or turn (rad)
  push: 12, // m/s² of thrust ahead or astern at full lean
  turnPush: 16, // and sideways, banked into a turn
  yawRate: 2, // turning on the spot (rad/s)
  climb: 15, sink: 10, // m/s
  lift: [12, 10], // the most it speeds up its climb or its descent, m/s²
  clearance: 1.2, // the height it keeps off the snow while flying, m
  ceiling: 3300, // m above sea level: the summit is 2,763 m
  spool: 0.8, // s for the rotors to come up to speed
  drag: [0.04, 0.0035], // air resistance, m/s² per m/s and per (m/s)²
};
const BUILDING_TOP = 20; // m above the ground, for obstacles that don't say
const TREE_TOP = 12;
const _f = new THREE.Vector3(), _l = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _z = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _gf = new THREE.Vector3(), _gl = new THREE.Vector3(); // the ground's, apart from step's heading

const ease = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-dt * rate));
const clamp = THREE.MathUtils.clamp;

export class FlightPhysics {
  // `dims`: the aircraft's { wheelbase, track, halfWidth, halfLength } (the
  // wheelbase and track between its skids' feet); `handling` as JETSON's.
  constructor({ hf, forest, obstacles = [], dims, handling = JETSON }) {
    this.hf = hf;
    this.forest = forest;
    this.obstacles = obstacles;
    this.dims = dims;
    this.h = handling;
    this.pos = new THREE.Vector3(); // on the ground under the skids, midway between their feet
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0); // of the ground under the skids
    this.quat = new THREE.Quaternion();
    this.yaw = 0; // as the rider's: forward is (-sin yaw, 0, -cos yaw)
    this.yawRate = 0;
    this.pitch = 0; // nose down, rad
    this.bank = 0; // left side down, rad
    this.steer = 0; // the turn, -1…1 (+ left), for the rider's lean
    this.accel = 0; // along the heading, smoothed
    this.lateral = 0; // toward its left
    this.spool = 0; // the rotors' speed, 0 stopped … 1 flying
    this.load = 0; // how hard they're working, 0 … 1
    this.stick = { pitch: 0, turn: 0, lift: 0 }; // the sticks, -1…1
    this.landed = true;
    this.agl = 0; // height above the snow
    this.events = [];
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = this.pitch = this.bank = this.steer = this.accel = this.lateral = 0;
    this.landed = true;
    this.#settle(1);
    this.quat.copy(_q);
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); } // over the ground
  // You can get out on the snow, or hovering just above it at a crawl (it sets
  // itself down first; see land).
  get canExit() { return this.landed || (this.agl < this.h.clearance + 0.4 && this.speed < 2); }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  left(out = new THREE.Vector3()) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  // input: { throttle, reverse, steer (-1…1, + left), climb, sink }
  step(dt, input) {
    const H = this.h;
    this.prev.copy(this.pos);
    this.spool = Math.min(1, this.spool + dt / H.spool);
    const fwd = input.throttle && !input.reverse ? 1 : input.reverse && !input.throttle ? -1 : 0;
    const lift = input.climb && !input.sink ? 1 : input.sink && !input.climb ? -1 : 0;
    this.stick.pitch = ease(this.stick.pitch, fwd, 12, dt);
    this.stick.turn = ease(this.stick.turn, input.steer, 12, dt);
    this.stick.lift = ease(this.stick.lift, lift, 12, dt);
    this.steer = this.stick.turn;

    if (this.landed) {
      // On its skids the sticks do nothing until it lifts off, once the rotors are up to speed.
      this.vel.set(0, 0, 0);
      this.yawRate = this.accel = this.lateral = 0;
      this.pitch = ease(this.pitch, 0, 6, dt);
      this.bank = ease(this.bank, 0, 6, dt);
      this.load = ease(this.load, 0, 4, dt);
      this.#settle(dt);
      this.quat.slerp(_q, 1 - Math.exp(-dt * 10));
      if (lift > 0 && this.spool > 0.85) {
        this.landed = false;
        this.vel.y = 1;
        this.events.push({ type: 'takeoff' });
      }
      return;
    }

    const f = this.forward(_f), l = this.left(_l);
    let vF = this.vel.x * f.x + this.vel.z * f.z, vL = this.vel.x * l.x + this.vel.z * l.z;
    const v0 = vF, sp = Math.hypot(vF, vL);

    // Turning: quick on the spot, gentler with speed, about as fast as the bank
    // can swing its speed round.
    const rate = input.steer * H.yawRate / (1 + sp / 10);
    this.yawRate = ease(this.yawRate, rate, 6, dt);
    this.yaw += this.yawRate * dt;

    // The flight controller leans it toward the speed it's asked for: flat out
    // ahead, backing off, or a standstill. Lean is thrust sideways, `push` at
    // full lean (`turnPush` banked).
    const want = fwd > 0 ? H.topSpeed + 4 : fwd < 0 ? (vF > 0.5 ? -H.topSpeed : -H.backSpeed) : 0;
    const pitchTo = clamp((want - vF) * 0.12, -H.tilt, H.tilt);
    // Into the turn, and against any slide.
    const bankTo = clamp(-vL * 0.15, -H.tilt, H.tilt);
    this.pitch = ease(this.pitch, pitchTo, 6, dt);
    this.bank = ease(this.bank, bankTo, 6, dt);
    const drag = H.drag[0] + H.drag[1] * sp, full = Math.tan(H.tilt);
    vF += (H.push * Math.tan(this.pitch) / full - drag * vF) * dt;
    vL += (H.turnPush * Math.tan(this.bank) / full - drag * vL) * dt;

    // Up and down: Space climbs, Shift sinks, and in between it holds its
    // height. Unless it's landing, it keeps clear of the snow under it and of
    // the snow it will be over in the next three seconds, by more the faster it
    // goes, climbing harder than Space would if it must.
    const ground = this.#groundHeight();
    this.agl = this.pos.y - ground;
    const { x, z } = this.pos, { x: vx, z: vz } = this.vel, h = (t) => this.hf.heightAt(x + vx * t, z + vz * t);
    const clear = this.pos.y - Math.max(ground, h(1), h(2), h(3));
    const margin = H.clearance + sp * 0.3; // more the faster it goes: over the trees, flat out
    let vyTo = lift * (lift > 0 ? H.climb : H.sink);
    if (lift >= 0 && clear < margin) vyTo = Math.max(vyTo, Math.min(30, (margin - clear) * 2));
    else if (lift < 0) vyTo = Math.max(vyTo, -Math.max(1, this.agl * 1.5)); // flaring to land
    const [up, down] = H.lift;
    this.vel.y += clamp(vyTo - this.vel.y, -down * dt, (vyTo > H.climb ? up * 1.6 : up) * dt);

    // Back into world space along the old heading: it has turned under its
    // velocity, and next step the lean pulls that round as far as it can.
    this.vel.x = f.x * vF + l.x * vL;
    this.vel.z = f.z * vF + l.z * vL;
    const over = Math.hypot(this.vel.x, this.vel.z) / H.topSpeed; // its speed limiter
    if (over > 1) { this.vel.x /= over; this.vel.z /= over; }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y > H.ceiling) { this.pos.y = H.ceiling; this.vel.y = Math.min(0, this.vel.y); }
    this.#walls();
    this.#touchdown(lift);

    const vF1 = this.vel.dot(f);
    this.accel = ease(this.accel, (vF1 - v0) / dt, 10, dt);
    this.lateral = ease(this.lateral, vF1 * this.yawRate, 10, dt);
    this.load = ease(this.load, clamp(Math.abs(fwd) * 0.5 + Math.max(0, lift) * 0.7 + Math.abs(input.steer) * 0.2, 0, 1), 4, dt);
    _e.set(this.pitch, this.yaw + Math.PI, -this.bank);
    this.quat.slerp(_q.setFromEuler(_e), 1 - Math.exp(-dt * 20));
  }

  // The skids on the snow. Coming down gently it lands; hitting it hard, or
  // fast, it bounces. Flying into a rising slope it rides up over it.
  #touchdown(lift) {
    const { pos, vel } = this;
    const ground = this.#groundHeight();
    this.agl = pos.y - ground;
    if (this.agl > 0) return;
    pos.y = ground;
    const down = -vel.y, sp = this.speed;
    if (down > 4 || sp > 9) {
      this.events.push({ type: 'crash', reason: 'ground', speed: Math.max(down, sp) });
      vel.y = Math.max(1.5, down * 0.3);
      vel.x *= 0.6;
      vel.z *= 0.6;
    } else if (lift < 0 && sp < 4) {
      this.landed = true;
      vel.set(0, 0, 0);
      this.events.push({ type: 'landed' });
    } else vel.y = Math.max(vel.y, 0);
  }

  // The highest ground under the skids' four feet.
  #groundHeight() {
    const { hf, dims, pos } = this;
    const f = this.forward(_gf), l = this.left(_gl);
    const a = dims.wheelbase / 2, b = dims.track / 2;
    let h = -Infinity;
    for (const [sf, sl] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      h = Math.max(h, hf.heightAt(pos.x + f.x * a * sf + l.x * b * sl, pos.z + f.z * a * sf + l.z * b * sl));
    return h;
  }

  // Parked: height from the ground under the skids' four feet, and the plane
  // through them, as a target attitude in _q.
  #settle(dt) {
    const { hf, dims, pos } = this;
    const f = this.forward(_gf), l = this.left(_gl);
    const a = dims.wheelbase / 2, b = dims.track / 2;
    const h = (sf, sl) => hf.heightAt(pos.x + f.x * a * sf + l.x * b * sl, pos.z + f.z * a * sf + l.z * b * sl);
    const fl = h(1, 1), fr = h(1, -1), rl = h(-1, 1), rr = h(-1, -1);
    pos.y = (fl + fr + rl + rr) / 4;
    this.agl = 0;
    const pitch = (fl + fr - rl - rr) / (2 * dims.wheelbase);
    const bank = (fl + rl - fr - rr) / (2 * dims.track);
    _n.set(0, 1, 0).addScaledVector(f, -pitch).addScaledVector(l, -bank).normalize();
    this.normal.lerp(_n, 1 - Math.exp(-dt * 25)).normalize();
    _z.copy(f).addScaledVector(this.normal, -f.dot(this.normal)).normalize();
    _x.crossVectors(this.normal, _z);
    _q.setFromRotationMatrix(_m.makeBasis(_x, this.normal, _z));
  }

  // Slide along the map edge, deleted tiles, and the buildings and trees it's
  // low enough to hit. It is a circle as wide as its rotors.
  #walls() {
    const { hf, pos, vel, prev, dims } = this;
    const lim = hf.half - EDGE - dims.halfLength;
    for (const [axis, c] of [['x', hf.center[0]], ['z', hf.center[1]]]) {
      const d = pos[axis] - c;
      if (Math.abs(d) <= lim) continue;
      pos[axis] = c + Math.sign(d) * lim;
      if (vel[axis] * d > 0) vel[axis] = 0;
    }
    if (hf.holeAt(pos.x, pos.z)) {
      // Over a deleted tile: back to where it was, stopped.
      pos.copy(prev);
      vel.set(0, 0, 0);
    }
    const r = dims.halfWidth;
    const ground = hf.heightAt(pos.x, pos.z);
    for (const o of this.obstacles) {
      if (pos.y > (o.top ?? ground + BUILDING_TOP)) continue;
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c; // box-local
      const px = o.hw + r - Math.abs(lx), pz = o.hd + r - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      const [nx, nz, depth] = px < pz ? [c * Math.sign(lx), -s * Math.sign(lx), px] : [s * Math.sign(lz), c * Math.sign(lz), pz];
      this.#bump(nx, nz, depth, 'wall');
    }
    if (pos.y - ground < TREE_TOP * 1.4)
      for (let i = 0; i < 3; i++) {
        const t = this.forest.hit(pos.x, pos.z, r);
        if (!t || pos.y > (t.top ?? ground + TREE_TOP)) break;
        let nx = pos.x - t.x, nz = pos.z - t.z;
        const d = Math.hypot(nx, nz) || 1;
        nx /= d; nz /= d;
        this.#bump(nx, nz, r + t.r - d + 0.01, 'tree');
      }
  }

  // Pushed out along (nx, nz) by `depth`, losing the speed into it, with a
  // little bounce; hard enough and it's an event for the HUD.
  #bump(nx, nz, depth, what) {
    this.pos.x += nx * depth;
    this.pos.z += nz * depth;
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn >= 0) return;
    this.vel.x -= nx * vn * 1.3;
    this.vel.z -= nz * vn * 1.3;
    this.vel.multiplyScalar(0.8);
    if (vn < -4) this.events.push({ type: 'crash', reason: what, speed: -vn });
  }

  // Down on its skids where it is.
  land() {
    this.landed = true;
    this.vel.set(0, 0, 0);
    this.#settle(1);
    this.quat.copy(_q);
  }

  // Parked with nobody aboard: the rotors run down.
  coast(dt) {
    this.spool = Math.max(0, this.spool - dt / (this.h.spool * 2));
    this.load = ease(this.load, 0, 4, dt);
    this.stick.pitch = ease(this.stick.pitch, 0, 8, dt);
    this.stick.turn = ease(this.stick.turn, 0, 8, dt);
    this.stick.lift = ease(this.stick.lift, 0, 8, dt);
  }
}
