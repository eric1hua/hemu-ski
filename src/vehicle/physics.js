// Arcade vehicle handling on the real heightfield: the pickup, a 4×4 on snow,
// and the snowmobile, on its track and skis.
// A vehicle rolls downhill under gravity; the engine, the brakes and the turn
// all draw on the same grip, so it can't climb what's too steep, slides on a
// slope too steep to hold, and runs wide in a fast turn. The handbrake lets the
// tail out. It stays on the ground, pitched and rolled to the plane under its
// four corners (the wheels, or the skis and the track).
// Walls are the edge of the heightfield, tiles deleted in the map editor, the
// buildings (`obstacles`, rotated boxes { x, z, yaw, hw, hd }), the trees and
// the lakes' shores; it bounces off them rather than crashing.
import * as THREE from 'three';
import { PISTE_HALF_WIDTH } from '../world/data.js';
import { shoreAt } from '../world/lakes.js';

const G = 9.81;
const EDGE = 40; // metres kept clear of the heightfield's edge
// How a vehicle handles. The pickup's:
export const PICKUP = {
  engine: 6.5, // m/s² from a standstill, fading to nothing at topSpeed
  topSpeed: 30,
  reverse: 3.5, reverseSpeed: 7,
  brake: 9,
  maxSpeed: 40, // even downhill
  grip: 0.55, // tyres on snow
  steer: 0.6, // full lock at a crawl (rad); less as you go faster
  drag: [0.03, 0.08], // rolling resistance (× g) on a piste, and off it in deep snow
  air: 0.0016, // air resistance, m/s² per (m/s)²
};
// The snowmobile's: a big engine (as hard off the mark as the track can grip,
// 180 km/h in about 10 s and 200 km/h, its limit, in about 14 s on the flat), a
// track that bites into steeper snow, skis that turn less sharply, poor brakes,
// and it floats on the powder.
export const SNOWMOBILE = {
  engine: 16, topSpeed: 66,
  reverse: 2, reverseSpeed: 4,
  brake: 6,
  maxSpeed: 200 / 3.6,
  grip: 0.7,
  steer: 0.5,
  drag: [0.025, 0.04],
  air: 0.0006,
};
const _f = new THREE.Vector3(), _l = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _z = new THREE.Vector3();

const towardZero = (v, by) => Math.sign(v) * Math.max(0, Math.abs(v) - by);

export class VehiclePhysics {
  // `dims`: the vehicle's { wheelbase, track, wheelRadius, halfWidth, halfLength };
  // `handling` as PICKUP's.
  constructor({ hf, piste, forest, obstacles = [], lakes = [], dims, handling = PICKUP }) {
    this.hf = hf;
    this.piste = piste;
    this.forest = forest;
    this.obstacles = obstacles;
    this.lakes = lakes;
    this.dims = dims;
    this.h = handling;
    this.pos = new THREE.Vector3(); // on the ground, midway between the axles
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3(); // horizontal
    this.normal = new THREE.Vector3(0, 1, 0); // of the ground under the wheels
    this.quat = new THREE.Quaternion();
    this.yaw = 0; // as the rider's: forward is (-sin yaw, 0, -cos yaw)
    this.yawRate = 0;
    this.steer = 0; // front wheel angle, + to the left
    this.roll = 0; // wheel rotation, for the model
    this.accel = 0; // along the vehicle, smoothed, for the body's lean
    this.lateral = 0; // toward its left
    this.slip = 0; // sideways speed
    this.events = [];
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = this.steer = this.accel = this.lateral = this.slip = 0;
    this.#ground(1);
  }

  get speed() { return this.vel.length(); }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  // Toward the vehicle's left (the pickup's driver's side).
  left(out = new THREE.Vector3()) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  // input: { throttle, reverse, steer (-1…1, + left), handbrake }
  step(dt, input) {
    const { dims, h: H } = this;
    this.prev.copy(this.pos);
    const f = this.forward(_f), l = this.left(_l), n = this.normal;
    let vF = this.vel.dot(f), vL = this.vel.dot(l);
    const v0 = vF;

    // Gravity along the ground under the wheels.
    const gF = G * n.y * n.dot(f), gL = G * n.y * n.dot(l);
    const grip = H.grip * G * n.y;
    const onPiste = this.piste.distAt(this.pos.x, this.pos.z) < PISTE_HALF_WIDTH + 2;

    // Pedals. S brakes, then reverses once you've stopped; W the same the other
    // way. Let go at a crawl and the brakes hold you.
    let push = 0, brake = 0;
    const { throttle, reverse, handbrake } = input;
    if (throttle && !reverse) {
      if (vF < -0.3) brake = H.brake;
      else push = H.engine * Math.max(0, 1 - vF / H.topSpeed);
    } else if (reverse && !throttle) {
      if (vF > 0.3) brake = H.brake;
      else push = -H.reverse * Math.max(0, 1 + vF / H.reverseSpeed);
    } else if (throttle && reverse) brake = H.brake;
    else brake = Math.abs(vF) < 1.5 ? H.brake : 0.6; // holding, or engine braking
    if (handbrake) brake = Math.max(brake, 4);
    push = THREE.MathUtils.clamp(push, -grip, grip);
    brake = Math.min(brake, grip);
    const resist = H.drag[onPiste ? 0 : 1] * G * n.y + H.air * vF * vF;
    vF += (gF + push) * dt;
    vF = towardZero(vF, (brake + resist) * dt);

    // Steering: less lock the faster you go; the turn is held to what the
    // tyres can grip, more with the handbrake's tail out.
    const sp = Math.abs(vF);
    const target = input.steer * H.steer / (1 + (sp * sp) / 180);
    this.steer += (target - this.steer) * (1 - Math.exp(-dt * 8));
    const maxRate = (grip * (handbrake ? 2.2 : 1.25)) / Math.max(sp, 2);
    let rate = (vF * Math.tan(this.steer)) / dims.wheelbase;
    if (handbrake) rate *= 1.5;
    this.yawRate = THREE.MathUtils.clamp(rate, -maxRate, maxRate);
    this.yaw += this.yawRate * dt;

    // Sideways: the side slope pushes, the tyres hold up to their grip (the
    // locked rear wheels hardly at all on the handbrake).
    vL = towardZero(vL + gL * dt, grip * (handbrake ? 0.35 : 1.2) * dt);
    this.slip = Math.abs(vL);

    // Back into world space along the old heading: the vehicle has turned under
    // its velocity, and next step the tyres pull that round as far as they grip.
    this.vel.copy(f).multiplyScalar(vF).addScaledVector(l, vL);
    if (this.vel.length() > H.maxSpeed) this.vel.setLength(H.maxSpeed);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.#walls();
    this.#ground(dt);

    const vF1 = this.vel.dot(f);
    this.accel += ((vF1 - v0) / dt - this.accel) * (1 - Math.exp(-dt * 10));
    this.lateral += (vF1 * this.yawRate - this.lateral) * (1 - Math.exp(-dt * 10));
    this.roll += (vF1 * dt) / dims.wheelRadius;
  }

  // Height from the ground under the four wheels, and the plane through them.
  #ground(dt) {
    const { hf, dims, pos } = this;
    const f = this.forward(_f), l = this.left(_l);
    const a = dims.wheelbase / 2, b = dims.track / 2;
    const h = (sf, sl) => hf.heightAt(pos.x + f.x * a * sf + l.x * b * sl, pos.z + f.z * a * sf + l.z * b * sl);
    const fl = h(1, 1), fr = h(1, -1), rl = h(-1, 1), rr = h(-1, -1);
    pos.y = (fl + fr + rl + rr) / 4;
    const pitch = (fl + fr - rl - rr) / (2 * dims.wheelbase); // rise per metre forward
    const bank = (fl + rl - fr - rr) / (2 * dims.track); // rise per metre to the left
    _n.set(0, 1, 0).addScaledVector(f, -pitch).addScaledVector(l, -bank).normalize();
    this.normal.lerp(_n, 1 - Math.exp(-dt * 25)).normalize();
    // Model axes: +x left, +y up, +z forward.
    _z.copy(f).addScaledVector(this.normal, -f.dot(this.normal)).normalize();
    _x.crossVectors(this.normal, _z);
    this.quat.setFromRotationMatrix(_m.makeBasis(_x, this.normal, _z));
  }

  // Slide along the map edge, deleted tiles, buildings, trees and lake shores.
  // The vehicle is three circles down its length, each as wide as the body.
  #walls() {
    const { hf, pos, vel, prev, dims } = this;
    const lim = hf.half - EDGE - dims.halfLength;
    for (const [axis, c] of [['x', hf.center[0]], ['z', hf.center[1]]]) {
      const d = pos[axis] - c;
      if (Math.abs(d) <= lim) continue;
      pos[axis] = c + Math.sign(d) * lim;
      if (vel[axis] * d > 0) vel[axis] = 0;
    }
    const f = this.forward(_f), l = this.left(_l);
    const a = dims.wheelbase / 2, b = dims.track / 2;
    for (const [sf, sl] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (!hf.holeAt(pos.x + f.x * a * sf + l.x * b * sl, pos.z + f.z * a * sf + l.z * b * sl)) continue;
      // A wheel over a deleted tile: back to where it was, stopped.
      pos.copy(prev);
      vel.set(0, 0, 0);
      break;
    }
    const r = dims.halfWidth, reach = dims.halfLength - r;
    for (const k of [-1, 0, 1]) {
      const cx = () => pos.x + f.x * reach * k, cz = () => pos.z + f.z * reach * k;
      for (const o of this.obstacles) {
        const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
        const dx = cx() - o.x, dz = cz() - o.z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c; // box-local
        const px = o.hw + r - Math.abs(lx), pz = o.hd + r - Math.abs(lz);
        if (px <= 0 || pz <= 0) continue;
        const [nx, nz, depth] = px < pz ? [c * Math.sign(lx), -s * Math.sign(lx), px] : [s * Math.sign(lz), c * Math.sign(lz), pz];
        this.#bump(nx, nz, depth, 'wall');
      }
      for (let i = 0; i < 3; i++) {
        const t = this.forest.hit(cx(), cz(), r);
        if (!t) break;
        let nx = cx() - t.x, nz = cz() - t.z;
        const d = Math.hypot(nx, nz) || 1;
        nx /= d; nz /= d;
        this.#bump(nx, nz, r + t.r - d + 0.01, 'tree');
      }
      const shore = shoreAt(this.lakes, cx(), cz(), r + 1);
      if (shore && shore.d < r) this.#bump(shore.nx, shore.nz, r - shore.d, 'wall');
    }
  }

  // Pushed out along (nx, nz) by `depth`, losing the speed into it, with a
  // little bounce; hard enough and it's an event for the HUD.
  #bump(nx, nz, depth, what) {
    this.pos.x += nx * depth;
    this.pos.z += nz * depth;
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn >= 0) return;
    this.vel.x -= nx * vn * 1.25;
    this.vel.z -= nz * vn * 1.25;
    this.vel.multiplyScalar(0.85);
    if (vn < -5) this.events.push({ type: 'crash', reason: what, speed: -vn });
  }
}
