// Tiny riders carving down the runs. Each one follows a run's centreline with a
// sinusoidal carve, chains onto a run that starts where theirs ends, and
// otherwise pops back in at the top of another run. Riders near the camera use
// the game's full snowboarder model; far ones (a few pixels tall) use a cheap
// instanced stand-in so the draw-call count stays flat.
import * as THREE from 'three';
import { Rider } from '../player/rider.js';
import { makeToon } from '../render/toon.js';

const G = 9.81;
const SPEED = { easy: 10, novice: 10, intermediate: 14, advanced: 18, expert: 21, freeride: 21 };
const JACKETS = ['#d9604c', '#4f8fd6', '#f0c24a', '#6fae78', '#b678c9', '#efe9dc', '#ff8a3d', '#2f8f9d'];
const BOARDS = ['#ee4f2c', '#23303a', '#4f8fd6', '#f0c24a', '#efe9dc'];
const CREAM = new THREE.Color('#efe9dc').getHex();
const BOARD = new THREE.Color('#ee4f2c').getHex();
const STEP = 6;

// Run centreline resampled every STEP m, oriented downhill.
function buildPath(hf, run, index) {
  let p = run.points;
  if (hf.heightAt(p[0][0], p[0][1]) < hf.heightAt(p[p.length - 1][0], p[p.length - 1][1])) p = [...p].reverse();
  const xs = [], zs = [];
  for (let i = 0; i < p.length - 1; i++) {
    const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    for (let d = 0; d < L; d += STEP) {
      xs.push(p[i][0] + ((p[i + 1][0] - p[i][0]) * d) / L);
      zs.push(p[i][1] + ((p[i + 1][1] - p[i][1]) * d) / L);
    }
  }
  const last = p[p.length - 1];
  xs.push(last[0]); zs.push(last[1]);
  // Re-space evenly so index = distance / STEP.
  const acc = [0];
  for (let i = 1; i < xs.length; i++) acc.push(acc[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
  const length = acc[acc.length - 1];
  const n = Math.max(2, Math.round(length / STEP) + 1);
  const X = new Float32Array(n), Z = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * length;
    while (j < acc.length - 2 && acc[j + 1] < s) j++;
    const t = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    X[i] = xs[j] + (xs[j + 1] - xs[j]) * t;
    Z[i] = zs[j] + (zs[j + 1] - zs[j]) * t;
  }
  const top = hf.heightAt(X[0], Z[0]), bottom = hf.heightAt(X[n - 1], Z[n - 1]);
  return { index, run, X, Z, n, step: length / (n - 1), length, drop: top - bottom, next: [] };
}

function proxyMeshes(count) {
  const body = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.26, 0.45, 3, 8).translate(0, 0.78, 0),
    makeToon({ color: '#ffffff' }, { rim: 1, hatch: 0 }),
    count,
  );
  const head = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.24, 10, 8).translate(0, 1.36, 0),
    makeToon({ color: '#f6dcc6' }, { rim: 1, hatch: 0 }),
    count,
  );
  const board = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.3, 0.06, 1.56).translate(0, 0.03, 0),
    makeToon({ color: '#ffffff' }, { hatch: 0 }),
    count,
  );
  for (const m of [body, head, board]) {
    m.frustumCulled = false; // instances span the whole diorama
    m.castShadow = true;
  }
  return { body, head, board };
}

export class Skiers {
  constructor(hf, runs, { count = 40, scale = 7, lodDistance = 2600 } = {}) {
    this.hf = hf;
    this.scale = scale;
    this.lodDistance = lodDistance;
    this.group = new THREE.Group();
    this.full = new THREE.Group(); // full-detail riders, for the post pass to skip
    this.group.add(this.full);

    this.paths = runs.map((r, i) => buildPath(hf, r, i)).filter((p) => p.length > 180 && p.drop > 30);
    for (const a of this.paths) {
      const ex = a.X[a.n - 1], ez = a.Z[a.n - 1];
      for (const b of this.paths) {
        if (b === a) continue;
        if (Math.hypot(b.X[0] - ex, b.Z[0] - ez) < 90) a.next.push(b);
      }
    }
    this.totalLength = this.paths.reduce((s, p) => s + p.length, 0);

    this.proxy = proxyMeshes(count);
    this.group.add(this.proxy.body, this.proxy.head, this.proxy.board);
    const jacketMats = JACKETS.map((c) => makeToon({ color: c }, { rim: 1, hatch: 0 }));
    const boardMats = BOARDS.map((c) => makeToon({ color: c }, { rim: 1, hatch: 0 }));

    this.skiers = [];
    for (let i = 0; i < count; i++) {
      const jacket = i % JACKETS.length, boardC = (i * 3) % BOARDS.length;
      this.proxy.body.setColorAt(i, new THREE.Color(JACKETS[jacket]));
      this.proxy.board.setColorAt(i, new THREE.Color(BOARDS[boardC]));
      const sk = {
        i, rider: null, jacketMat: jacketMats[jacket], boardMat: boardMats[boardC],
        pos: new THREE.Vector3(), quat: new THREE.Quaternion(), yaw: 0, yawRate: 0, lean: 0,
        pop: 1, path: null, s: 0, phase: 0, amp: 0, wave: 0, speed: 0,
      };
      this.#spawn(sk, this.#randomPath(), true);
      this.skiers.push(sk);
    }
  }

  #randomPath() {
    let r = Math.random() * this.totalLength;
    for (const p of this.paths) if ((r -= p.length) <= 0) return p;
    return this.paths[0];
  }

  #spawn(sk, path, anywhere = false, keepPhase = false) {
    sk.path = path;
    sk.s = anywhere ? Math.random() * path.length * 0.9 : 0;
    if (!keepPhase) {
      sk.phase = Math.random() * Math.PI * 2;
      sk.pop = anywhere ? 1 : 0;
    }
    sk.amp = 6 + Math.random() * 6;
    sk.wave = 70 + Math.random() * 60;
    sk.speed = (SPEED[path.run.difficulty] || 14) * (0.8 + Math.random() * 0.4);
    sk.yaw = NaN;
  }

  #sample(path, s, out) {
    const f = Math.min(Math.max(s / path.step, 0), path.n - 1.001);
    const i = Math.floor(f), t = f - i;
    out.x = path.X[i] + (path.X[i + 1] - path.X[i]) * t;
    out.z = path.Z[i] + (path.Z[i + 1] - path.Z[i]) * t;
    const L = Math.hypot(path.X[i + 1] - path.X[i], path.Z[i + 1] - path.Z[i]) || 1;
    out.tx = (path.X[i + 1] - path.X[i]) / L;
    out.tz = (path.Z[i + 1] - path.Z[i]) / L;
    return out;
  }

  update(dt, camera) {
    const c = {}, hf = this.hf, m = new THREE.Matrix4(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(), f = new THREE.Vector3(), x = new THREE.Vector3(), zb = new THREE.Vector3();
    for (const sk of this.skiers) {
      const p = sk.path;
      sk.s += sk.speed * dt;
      sk.phase += ((sk.speed * dt) / sk.wave) * Math.PI * 2;

      // Ease the carve in and out at the ends so chained runs join smoothly.
      const ends = Math.min(1, sk.s / 40, (p.length - sk.s) / 40);
      if (sk.s >= p.length) {
        const chain = p.next.length && Math.random() < 0.75;
        if (chain) this.#spawn(sk, p.next[Math.floor(Math.random() * p.next.length)], false, true);
        else this.#spawn(sk, this.#randomPath());
        continue;
      }
      sk.pop = Math.min(1, sk.pop + dt * 2.5);
      const shrink = !p.next.length ? Math.min(1, (p.length - sk.s) / 25) : 1;

      this.#sample(p, sk.s, c);
      const k = (Math.PI * 2) / sk.wave;
      const off = sk.amp * ends * Math.sin(sk.phase);
      const dOff = sk.amp * ends * k * Math.cos(sk.phase);
      const nx = -c.tz, nz = c.tx;
      sk.pos.set(c.x + nx * off, 0, c.z + nz * off);
      sk.pos.y = hf.heightAt(sk.pos.x, sk.pos.z);

      // Heading and lean from the carve, using the game's sign conventions.
      const dx = c.tx + nx * dOff, dz = c.tz + nz * dOff;
      const yaw = Math.atan2(-dx, -dz);
      if (!Number.isNaN(sk.yaw)) {
        let dy = yaw - sk.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        sk.yawRate += (dy / Math.max(dt, 1e-4) - sk.yawRate) * (1 - Math.exp(-dt * 6));
      }
      sk.yaw = yaw;
      sk.lean = THREE.MathUtils.clamp(Math.atan2(sk.speed * sk.yawRate, G), -0.9, 0.9);

      hf.normalAt(sk.pos.x, sk.pos.z, up);
      f.set(dx, 0, dz).normalize();
      f.addScaledVector(up, -f.dot(up)).normalize();
      x.crossVectors(f, up);
      m.makeBasis(x, up, zb.copy(f).negate());
      sk.quat.setFromRotationMatrix(m);

      const s = this.scale * sk.pop * shrink;
      const near = camera.position.distanceTo(sk.pos) < this.lodDistance;
      if (near && !sk.rider) this.#attachRider(sk);
      if (!near && sk.rider) this.#detachRider(sk);

      if (sk.rider) {
        sk.rider.root.position.copy(sk.pos);
        sk.rider.root.quaternion.copy(sk.quat);
        sk.rider.root.scale.setScalar(Math.max(s, 1e-3));
        sk.rider.update(dt, { crouch: 0.35 + Math.abs(sk.lean) * 0.4, lean: sk.lean, twist: Math.sin(sk.phase) * 0.3, air: false });
        sc.setScalar(0);
      } else {
        sc.setScalar(s);
      }
      // Hidden proxies collapse to zero scale.
      m.compose(sk.pos, sk.quat, sc);
      this.proxy.body.setMatrixAt(sk.i, m);
      this.proxy.head.setMatrixAt(sk.i, m);
      this.proxy.board.setMatrixAt(sk.i, m);
    }
    for (const mm of Object.values(this.proxy)) {
      mm.instanceMatrix.needsUpdate = true;
      if (mm.instanceColor) mm.instanceColor.needsUpdate = true;
    }
  }

  #attachRider(sk) {
    const rider = (this.pool ||= []).pop() || new Rider();
    // Each rider gets their own jacket and board colours.
    rider.root.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.baseMat ||= o.material;
      const hex = o.userData.baseMat.color?.getHex();
      o.material = hex === CREAM ? sk.jacketMat : hex === BOARD ? sk.boardMat : o.userData.baseMat;
    });
    sk.rider = rider;
    this.full.add(rider.root);
  }

  #detachRider(sk) {
    this.full.remove(sk.rider.root);
    this.pool.push(sk.rider);
    sk.rider = null;
  }

  get nearCount() {
    return this.full.children.length;
  }
}
