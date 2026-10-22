import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeToon } from '../render/toon.js';

// The carved line the board leaves behind.
export class Trail {
  constructor(max = 900, color = '#d9e5e8') {
    this.max = max;
    this.pts = []; // {x,y,z,sx,sz,w}
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.last = null;
  }
  clear() { this.pts.length = 0; this.last = null; this.#upload(); }
  add(p, side, width) {
    if (this.last && this.last.distanceToSquared(p) < 0.36) return;
    this.last = p.clone();
    this.pts.push({ x: p.x, y: p.y + 0.03, z: p.z, sx: side.x, sz: side.z, w: width });
    if (this.pts.length > this.max) this.pts.shift();
    this.#upload();
  }
  gap(p) { this.add(p, new THREE.Vector3(1, 0, 0), 0); this.last = null; }
  #upload() {
    const a = this.pos;
    this.pts.forEach((q, i) => {
      const o = i * 6, hw = q.w / 2;
      a[o] = q.x + q.sx * hw; a[o + 1] = q.y; a[o + 2] = q.z + q.sz * hw;
      a[o + 3] = q.x - q.sx * hw; a[o + 4] = q.y; a[o + 5] = q.z - q.sz * hw;
    });
    this.geo.attributes.position.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, this.pts.length - 1) * 6);
  }
}

// The board's track: a thin carved line on the groomed snow and a wider, bluer
// furrow where it ploughs through powder, each with gaps where the other runs.
export class BoardTrail {
  constructor() {
    this.line = new Trail();
    this.furrow = new Trail(600, '#d5e2e7');
    this.mesh = new THREE.Group().add(this.line.mesh, this.furrow.mesh);
  }
  // `furrow`: the width of the furrow when in powder, else 0 for the carved line.
  add(p, side, width, furrow = 0) {
    const [on, off] = furrow > 0 ? [this.furrow, this.line] : [this.line, this.furrow];
    off.gap(p);
    on.add(p, side, furrow > 0 ? furrow : width);
  }
  gap(p) { this.line.gap(p); this.furrow.gap(p); }
  clear() { this.line.clear(); this.furrow.clear(); }
}

// Snow heaped round the board where it rides sunk in powder: lumps in an oval
// round it, half buried, as tall as `amount` (0–1) says. Place it on the snow
// surface in the board's frame (its length along local z).
export class SnowCollar {
  constructor() {
    const lumps = [];
    const rnd = (k) => { const s = Math.sin(k * 91.7) * 43758.5453; return s - Math.floor(s); };
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + rnd(k) * 0.25;
      const r = 0.1 + rnd(k + 7) * 0.07;
      lumps.push(new THREE.IcosahedronGeometry(r, 1).scale(1.3, 0.8, 1.3).translate(Math.sin(a) * 0.36, 0, Math.cos(a) * 0.86));
    }
    this.mesh = new THREE.Mesh(mergeGeometries(lumps), makeToon({ color: '#fbfaf4' }, { hatch: 0 }));
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
  }
  set(amount) {
    this.mesh.visible = amount > 0.05;
    this.mesh.scale.set(0.8 + amount * 0.2, amount, 0.9 + amount * 0.1);
  }
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(80,120,130,0.55)';
  g.lineWidth = 5;
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Puffs of snow kicked up when the edge bites or the board skids. Powder's are
// bigger and hang in the air longer (`size`, `gravity`, `life` in seconds).
export class Spray {
  constructor(n = 400, { size = 0.28, gravity = 6, life = 0.5 } = {}) {
    this.n = n;
    this.gravity = gravity;
    this.lifespan = life;
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.next = 0;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({ size, map: dotTexture(), transparent: true, alphaTest: 0.3, depthWrite: false, color: '#ffffff' }),
    );
    this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.p[i * 3 + 1] = -1e5;
  }
  emit(pos, vel, count, spread) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      this.p[i * 3] = pos.x + (Math.random() - 0.5) * 0.4;
      this.p[i * 3 + 1] = pos.y + 0.05;
      this.p[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.4;
      this.v[i * 3] = vel.x + (Math.random() - 0.5) * spread;
      this.v[i * 3 + 1] = vel.y + Math.random() * spread * 0.8 + 1;
      this.v[i * 3 + 2] = vel.z + (Math.random() - 0.5) * spread;
      this.life[i] = this.lifespan * (1 + Math.random());
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.p[i * 3 + 1] = -1e5; continue; }
      this.v[i * 3 + 1] -= this.gravity * dt;
      const damp = Math.exp(-dt * 2.5);
      this.v[i * 3] *= damp; this.v[i * 3 + 2] *= damp;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
