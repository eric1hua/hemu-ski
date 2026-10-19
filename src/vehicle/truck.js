// The pickup truck (public/models/truck/pickup.glb, a single Tripo mesh, nose
// toward +z, left toward +x, wheels on the ground at y = 0). The wheels are
// split out of the mesh at load so they can roll and the front ones steer.
//
// truck.root sits on the ground between the axles and follows the terrain
// under the four wheels; the body leans on its springs inside it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeToon } from '../render/toon.js';

const FILE = import.meta.env.BASE_URL + 'models/truck/pickup.glb';
const LENGTH = 5.6; // bumper to bumper, metres

export class Truck {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Truck';
    this.body = new THREE.Group(); // leans on its springs
    this.root.add(this.body);
    this.wheels = []; // { steer, spin, front }
    // Filled in from the model: wheelbase, track, wheel radius, half-extents.
    this.dims = null;
    // A rotated box { x, z, yaw, hw, hd } for the rider's collisions; it moves with the truck.
    this.footprint = { x: 0, z: 0, yaw: 0, hw: 0, hd: 0 };
    this.ready = new GLTFLoader().loadAsync(FILE).then((gltf) => this.#build(gltf));
    this.lean = { pitch: 0, roll: 0, vp: 0, vr: 0 };
  }

  #build(gltf) {
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const s = LENGTH / (box.max.z - box.min.z);
    geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).scale(s, s, s);
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new THREE.Vector3());

    const mat = makeToon({ map: src.material.map, side: src.material.side }, { rim: 1 });
    const parts = splitWheels(geo);
    // The parts share the model's vertices, so each mesh is offset rather than
    // its geometry moved.
    const add = (parent, g, offset) => {
      const m = new THREE.Mesh(g, mat);
      if (offset) m.position.copy(offset).negate();
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    add(this.body, parts.body);
    for (const w of parts.wheels) {
      // A pivot at the wheel's centre: `steer` turns about y, `spin` rolls about x.
      const steer = new THREE.Group();
      steer.position.copy(w.centre);
      const spin = new THREE.Group();
      steer.add(spin);
      add(spin, w.spin, w.centre);
      if (w.fixed) add(steer, w.fixed, w.centre);
      this.root.add(steer);
      this.wheels.push({ steer, spin, front: w.centre.z > 0 });
    }
    const front = parts.wheels.filter((w) => w.centre.z > 0), rear = parts.wheels.filter((w) => w.centre.z <= 0);
    const avg = (ws, k) => ws.reduce((a, w) => a + w.centre[k], 0) / Math.max(1, ws.length);
    const radius = parts.wheels.length ? avg(parts.wheels, 'y') : 0.45;
    this.dims = {
      length: size.z,
      height: size.y,
      halfWidth: parts.bodyHalfWidth, // the main shell's, without the mirrors
      halfLength: size.z / 2,
      wheelbase: parts.wheels.length === 4 ? avg(front, 'z') - avg(rear, 'z') : size.z * 0.62,
      axleZ: parts.wheels.length === 4 ? (avg(front, 'z') + avg(rear, 'z')) / 2 : 0, // midway between the axles
      track: parts.wheels.length === 4 ? Math.abs(front[0].centre.x - front[1].centre.x) : parts.bodyHalfWidth * 1.6,
      wheelRadius: radius,
    };
    this.body.position.z = this.dims.axleZ ? -this.dims.axleZ : 0;
    for (const w of this.wheels) w.steer.position.z -= this.dims.axleZ;
    this.footprint.hw = this.dims.halfWidth;
    this.footprint.hd = this.dims.halfLength;
    return this;
  }

  // Pose from the physics: position, heading, ground plane, steering, wheel roll.
  update(dt, p) {
    this.root.position.copy(p.pos);
    this.root.quaternion.copy(p.quat);
    // The body pitches back as you pull away, dives under braking and rolls out
    // of a turn: a damped spring toward a lean from the acceleration.
    const L = this.lean;
    const tp = THREE.MathUtils.clamp(-p.accel * 0.006, -0.06, 0.06);
    const tr = THREE.MathUtils.clamp(p.lateral * 0.008, -0.07, 0.07);
    L.vp += ((tp - L.pitch) * 90 - L.vp * 12) * dt;
    L.vr += ((tr - L.roll) * 90 - L.vr * 12) * dt;
    L.pitch += L.vp * dt;
    L.roll += L.vr * dt;
    this.body.rotation.set(L.pitch, 0, L.roll);
    for (const w of this.wheels) {
      if (w.front) w.steer.rotation.y = p.steer;
      w.spin.rotation.x = p.roll;
    }
    this.footprint.x = p.pos.x;
    this.footprint.z = p.pos.z;
    this.footprint.yaw = p.yaw;
  }
}

// Splits the truck's geometry into the body and four wheels. The model is one
// mesh, but its tyres and rims are separate pieces of it (connected
// components): the tyres are the four ground-touching pieces about as tall as
// they are long. Pieces centred on a tyre's axle (the rim) roll with it; other
// pieces inside the tyre (the brake calliper) steer with it but don't roll.
function splitWheels(geo) {
  const pos = geo.attributes.position;
  const index = geo.index ? geo.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const n = pos.count;
  // Weld by position, so seams in the UVs don't split a piece in two.
  const weld = new Int32Array(n), seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const j = seen.get(k);
    weld[i] = j ?? i;
    if (j === undefined) seen.set(k, i);
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  for (let t = 0; t < index.length; t += 3) {
    const a = find(weld[index[t]]);
    for (const v of [index[t + 1], index[t + 2]]) { const b = find(weld[v]); if (a !== b) parent[b] = a; }
  }
  const pieces = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const r = find(weld[index[t]]);
    let c = pieces.get(r);
    if (!c) pieces.set(r, (c = { tris: [], box: new THREE.Box3() }));
    c.tris.push(t);
    for (let k = 0; k < 3; k++) c.box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, index[t + k]));
  }
  const list = [...pieces.values()];
  const size = new THREE.Vector3(), centre = new THREE.Vector3();
  const tyres = list.filter((c) => {
    c.box.getSize(size);
    return c.box.min.y < size.y * 0.1 && Math.abs(size.y - size.z) < size.y * 0.15 && size.x < size.y * 0.8 && size.y > 0.3;
  }).sort((a, b) => b.tris.length - a.tris.length).slice(0, 4);

  const shell = list.reduce((a, b) => (b.tris.length > a.tris.length ? b : a));
  const bodyHalfWidth = Math.max(-shell.box.min.x, shell.box.max.x);
  if (tyres.length !== 4) {
    console.warn(`Truck: found ${tyres.length} tyres, not 4; the wheels won't turn.`);
    return { body: geo, wheels: [], bodyHalfWidth };
  }
  const wheels = tyres.map((c) => ({ c, centre: c.box.getCenter(new THREE.Vector3()), r: c.box.getSize(size).y / 2, spin: [], fixed: [] }));
  const body = [];
  for (const c of list) {
    c.box.getCenter(centre);
    const w = wheels.find((w) => w.c === c || (
      Math.sign(centre.x) === Math.sign(w.centre.x) && Math.abs(centre.x) > Math.abs(w.centre.x) - w.r * 0.8
      && c.box.min.y > w.centre.y - w.r - 0.01 && c.box.max.y < w.centre.y + w.r + 0.01
      && c.box.min.z > w.centre.z - w.r - 0.01 && c.box.max.z < w.centre.z + w.r + 0.01
    ));
    if (!w) body.push(...c.tris);
    else if (w.c === c || Math.hypot(centre.y - w.centre.y, centre.z - w.centre.z) < w.r * 0.15) w.spin.push(...c.tris);
    else w.fixed.push(...c.tris);
  }
  // Each part indexes into the same vertex buffers.
  const subset = (tris) => {
    if (!tris.length) return null;
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr);
    const idx = new Uint32Array(tris.length * 3);
    tris.forEach((t, i) => idx.set([index[t], index[t + 1], index[t + 2]], i * 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  };
  return {
    body: subset(body),
    wheels: wheels.map((w) => ({ centre: w.centre, spin: subset(w.spin), fixed: subset(w.fixed) })),
    bodyHalfWidth,
  };
}
