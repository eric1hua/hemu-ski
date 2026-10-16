// Arcade-plausible snowboard physics on the real heightfield.
// The board slides along the slope under gravity; the active edge bleeds off
// sideways velocity and feeds most of it back along the board (carving), so
// turning costs a little speed rather than a lot. Leaving the ground happens
// naturally when the terrain falls away faster than gravity can follow.
// The edge of the heightfield and the buildings (`obstacles`, rotated boxes
// { x, z, yaw, hw, hd }) are walls you slide along; only trees and bad
// landings knock you over.
import * as THREE from 'three';
import { PISTE_HALF_WIDTH } from '../world/data.js';

const G = 9.81;
const SKATE_SPEED = 4.5; // W on the flat pushes you along up to this (m/s)
const EDGE = 40; // metres kept clear of the heightfield's edge
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
const _g = new THREE.Vector3(), _t = new THREE.Vector3();

export class BoardPhysics {
  constructor({ hf, piste, forest, obstacles = [] }) {
    this.hf = hf;
    this.piste = piste;
    this.forest = forest;
    this.obstacles = obstacles;
    this.crashDir = new THREE.Vector3(); // travel direction when you went down
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.yaw = 0;
    this.yawRate = 0;
    this.grounded = true;
    this.airTime = 0;
    this.crashed = 0;
    this.slip = 0; // sideways skid speed, drives spray + sound
    this.jumpCharge = 0;
    this.events = [];
  }

  reset(x, z, yaw) {
    this.pos.set(x, this.hf.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = 0;
    this.grounded = true;
    this.crashed = 0;
    this.airTime = 0;
    this.hf.normalAt(x, z, this.normal);
  }

  get speed() { return this.vel.length(); }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  crash(reason, tree = null) {
    if (this.crashed > 0) return;
    this.crashed = 2.2;
    this.crashDir.set(this.vel.x, 0, this.vel.z);
    if (this.crashDir.lengthSq() < 1) this.forward(this.crashDir);
    this.crashDir.normalize();
    this.events.push({ type: 'crash', reason, tree });
  }

  step(dt, input) {
    const hf = this.hf;
    if (this.crashed > 0) {
      this.crashed -= dt;
      this.vel.multiplyScalar(Math.exp(-dt * 2.5));
      this.pos.addScaledVector(this.vel, dt);
      this.pos.y = Math.max(this.pos.y + this.vel.y * dt, hf.heightAt(this.pos.x, this.pos.z));
      this.#walls();
      if (this.crashed <= 0) this.events.push({ type: 'respawn' });
      return;
    }

    const speed = this.vel.length();
    // Turn rate limited so lean (v·ω/g) stays under ~55°.
    const maxRate = Math.min(2.2, 14 / Math.max(speed, 1));
    let target = input.steer * maxRate;
    if (!this.grounded) target = input.steer * 4.5; // spins
    this.yawRate += (target - this.yawRate) * (1 - Math.exp(-dt * 7));
    this.yaw += this.yawRate * dt;

    if (this.grounded) this.#ground(dt, input, speed);
    else this.#air(dt);

    this.#walls();
    const tree = this.forest.hit(this.pos.x, this.pos.z, 0.35);
    if (tree) {
      if (this.vel.length() > 4.5) this.crash('tree', tree);
      else {
        _t.set(this.pos.x - tree.x, 0, this.pos.z - tree.z).normalize();
        this.pos.addScaledVector(_t, 0.05);
        this.vel.multiplyScalar(0.5);
      }
    }
  }

  #ground(dt, input, speed) {
    const n = this.hf.normalAt(this.pos.x, this.pos.z, _n);
    this.normal.copy(n);
    this.forward(_f);
    _f.addScaledVector(n, -_f.dot(n)).normalize();
    _s.crossVectors(n, _f);

    // Gravity along the slope.
    _g.set(0, -G, 0).addScaledVector(n, G * n.y);
    this.vel.addScaledVector(_g, dt);

    // Edge grip: kill lateral velocity, return most of it along the board.
    let vf = this.vel.dot(_f);
    let vs = this.vel.dot(_s);
    const grip = input.brake ? 2.2 : 7.5;
    const newVs = vs * Math.exp(-grip * dt);
    const removed = Math.abs(vs) - Math.abs(newVs);
    vf += Math.sign(vf || 1) * removed * (input.brake ? 0.1 : 0.8);
    this.slip = Math.abs(vs);
    this.vel.copy(_f).multiplyScalar(vf).addScaledVector(_s, newVs);

    // Snow friction + air drag.
    const onPiste = this.piste.distAt(this.pos.x, this.pos.z) < PISTE_HALF_WIDTH + 2;
    let mu = onPiste ? 0.035 : 0.1;
    if (input.brake) mu += 0.5;
    const drag = input.tuck ? 0.0022 : 0.0042;
    const sp = this.vel.length();
    const dec = mu * G * n.y + drag * sp * sp;
    if (sp > 0) this.vel.multiplyScalar(Math.max(0, sp - dec * dt) / sp);

    // Skating: on the flat (or to get going), W pushes off along the nose.
    if (input.tuck && !input.brake && this.vel.dot(_f) < SKATE_SPEED) this.vel.addScaledVector(_f, 3.2 * dt);

    // Ollie: hold to load, release to pop.
    if (input.jump) this.jumpCharge = Math.min(1, this.jumpCharge + dt * 2.5);
    else if (this.jumpCharge > 0) {
      this.vel.addScaledVector(n, 2.6 + this.jumpCharge * 2.6);
      this.jumpCharge = 0;
      this.#takeoff();
      this.pos.addScaledVector(this.vel, dt);
      return;
    }

    const y0 = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const h = this.hf.heightAt(this.pos.x, this.pos.z);
    const ballistic = y0 + this.vel.y * dt - 0.5 * G * dt * dt;
    if (h < ballistic - 0.04 && sp > 7) {
      this.pos.y = ballistic;
      this.#takeoff();
    } else {
      this.pos.y = h;
      // Follow the new surface, keeping (most of) the speed.
      const n2 = this.hf.normalAt(this.pos.x, this.pos.z, _t);
      const m = this.vel.length();
      this.vel.addScaledVector(n2, -this.vel.dot(n2));
      const m2 = this.vel.length();
      if (m2 > 1e-4) this.vel.multiplyScalar((m * 0.999) / m2);
    }
  }

  // Slide along the map edge and building walls instead of passing through.
  #walls() {
    const { hf, pos, vel } = this;
    const lim = hf.half - EDGE;
    let hitWall = false;
    for (const [axis, c] of [['x', hf.center[0]], ['z', hf.center[1]]]) {
      const d = pos[axis] - c;
      if (Math.abs(d) <= lim) continue;
      pos[axis] = c + Math.sign(d) * lim;
      if (vel[axis] * d > 0) vel[axis] = 0;
      hitWall = true;
    }
    const r = 0.5;
    for (const o of this.obstacles) {
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c; // box-local
      const px = o.hw + r - Math.abs(lx), pz = o.hd + r - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      // Push out through the nearest face and drop the speed into it.
      const [nx, nz, depth] = px < pz ? [c * Math.sign(lx), -s * Math.sign(lx), px] : [s * Math.sign(lz), c * Math.sign(lz), pz];
      pos.x += nx * depth;
      pos.z += nz * depth;
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) { vel.x -= nx * vn; vel.z -= nz * vn; }
      hitWall = true;
    }
    if (hitWall && this.grounded) pos.y = hf.heightAt(pos.x, pos.z);
  }

  #takeoff() {
    this.grounded = false;
    this.airTime = 0;
    this.slip = 0;
    this.takeoffYaw = this.yaw;
  }

  #air(dt) {
    this.airTime += dt;
    this.vel.y -= G * dt;
    const sp = this.vel.length();
    this.vel.multiplyScalar(1 - 0.0035 * sp * dt);
    this.pos.addScaledVector(this.vel, dt);
    const h = this.hf.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y > h) return;

    // Landing.
    this.pos.y = h;
    const n = this.hf.normalAt(this.pos.x, this.pos.z, _n);
    const impact = -this.vel.dot(n);
    this.vel.addScaledVector(n, impact);
    this.grounded = true;
    const flat = _t.copy(this.vel).addScaledVector(n, -this.vel.dot(n));
    const fwd = this.forward(_f);
    const cos = flat.lengthSq() > 1 ? Math.abs(flat.normalize().dot(fwd)) : 1;
    if (impact > 13) return this.crash('hard landing');
    if (cos < 0.45 && this.vel.length() > 7) return this.crash('sideways landing');
    this.vel.multiplyScalar(0.96);
    if (this.airTime > 0.6) this.events.push({
      type: 'air',
      time: this.airTime,
      spin: Math.round(Math.abs(this.yaw - this.takeoffYaw) / Math.PI) * 180,
    });
  }
}
