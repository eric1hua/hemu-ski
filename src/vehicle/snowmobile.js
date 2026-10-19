// The snowmobile (public/models/snowmobile/snowmobile.glb, a single Tripo mesh,
// nose toward +x, its left toward -z, skis and track on the ground at y = 0),
// turned at load to the pickup's axes: nose toward +z, left toward +x. The skis
// are cut out of the mesh so they steer.
//
// sled.root sits on the ground midway between the skis and the track and follows
// the terrain under them; the body leans on its springs inside it. The rider's
// root follows `saddle`, which turns with the body, and `seat` says where their
// hips, feet and hands go in that frame (see Rider.setLocomotion).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeToon } from '../render/toon.js';
import { springTo, subsetGeometry } from './truck.js';

const FILE = import.meta.env.BASE_URL + 'models/snowmobile/snowmobile.glb';
// Ski tips to the rack, metres: smaller than a real one (about 3.2 m) to suit
// the riders, whose arms and legs are short for their height.
const LENGTH = 2.6;
// Measured off the model, in its own units (0.98 long, centred, nose +x):
const AT = {
  seat: [-0.06, 0.281], // where the rider sits: x, and the cushion's height there
  grips: [0.135, 0.375, 0.155], // the handlebar grips: x, y, ±z
  boards: [0.02, 0.107, 0.135], // the running boards, under the feet: x, y, ±z
  skis: [0.275, 0.17], // the skis' spindles: x, ±z
  track: [-0.195, 0.102], // the middle of the track's footprint on the snow: x; its half-width
};

export class Snowmobile {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Snowmobile';
    this.body = new THREE.Group(); // leans on its springs
    this.root.add(this.body);
    this.saddle = new THREE.Object3D(); // the rider's root: -z forward, as on the board
    this.saddle.rotation.y = Math.PI;
    this.body.add(this.saddle);
    this.skis = []; // pivots that steer about y
    this.seat = null; // { hips, feet: [left, right], grips: [left, right] } in the rider's body frame
    this.dims = null;
    // A rotated box { x, z, yaw, hw, hd } for the rider's collisions; it moves with the sled.
    this.footprint = { kind: 'snowmobile', x: 0, z: 0, yaw: 0, hw: 0, hd: 0 };
    this.marks = []; // the track's and the skis' lines in the snow: { along, left, width } from the middle
    this.exits = []; // where you step off: { along, left }, the left first
    this.lean = { pitch: 0, roll: 0, vp: 0, vr: 0 };
    this.ready = new GLTFLoader().loadAsync(FILE).then((gltf) => this.#build(gltf));
  }

  #build(gltf) {
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const s = LENGTH / (box.max.x - box.min.x);
    geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).rotateY(-Math.PI / 2).scale(s, s, s);
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new THREE.Vector3());
    // A point measured off the model, in metres on the turned one.
    const at = (x, y, z) => new THREE.Vector3(-z * s, y * s, x * s);

    const skiZ = AT.skis[0] * s, trackZ = AT.track[0] * s;
    const d = (this.dims = {
      length: size.z,
      height: size.y,
      halfWidth: size.x / 2,
      halfLength: size.z / 2,
      wheelbase: skiZ - trackZ, // skis to track
      axleZ: (skiZ + trackZ) / 2,
      track: 2 * AT.skis[1] * s, // between the skis
      wheelRadius: 0.2, // there are no wheels; the physics counts their roll anyway
    });

    const mat = makeToon({ map: src.material.map, side: src.material.side }, { rim: 1 });
    const parts = splitSkis(geo, s);
    const add = (parent, g, offset) => {
      const m = new THREE.Mesh(g, mat);
      if (offset) m.position.copy(offset).negate();
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    add(this.body, parts.body);
    this.body.position.z = -d.axleZ;
    parts.skis.forEach((g, i) => {
      if (!g) return;
      const pivot = at(AT.skis[0], 0, i ? AT.skis[1] : -AT.skis[1]);
      const steer = new THREE.Group();
      steer.position.copy(pivot);
      steer.position.z -= d.axleZ;
      add(steer, g, pivot);
      this.root.add(steer);
      this.skis.push(steer);
    });

    // The rider's frame is the body's (the saddle turns it to face forward).
    const pair = ([x, y, z]) => [at(x, y, -z), at(x, y, z)];
    this.seat = { hips: at(AT.seat[0], AT.seat[1], 0), feet: pair(AT.boards), grips: pair(AT.grips) };

    this.footprint.hw = d.halfWidth;
    this.footprint.hd = d.halfLength;
    this.marks = [
      { along: -d.wheelbase / 2, left: 0, width: 2 * AT.track[1] * s },
      ...[-1, 1].map((side) => ({ along: d.wheelbase / 2, left: side * d.track / 2, width: 0.12 })),
    ];
    const seatZ = AT.seat[0] * s - d.axleZ;
    this.exits = [[seatZ, d.halfWidth + 0.7], [seatZ, -d.halfWidth - 0.7], [-d.halfLength - 1, 0], [d.halfLength + 1, 0]]
      .map(([along, left]) => ({ along, left }));
    return this;
  }

  // Pose from the physics: position, heading, ground plane, steering.
  update(dt, p) {
    this.root.position.copy(p.pos);
    this.root.quaternion.copy(p.quat);
    // The nose lifts as the track bites and dips under braking; the body rolls
    // a little out of a turn while the rider leans into it.
    springTo(this.lean, dt, THREE.MathUtils.clamp(-p.accel * 0.008, -0.07, 0.07), THREE.MathUtils.clamp(p.lateral * 0.005, -0.05, 0.05));
    this.body.rotation.set(this.lean.pitch, 0, this.lean.roll);
    for (const ski of this.skis) ski.rotation.y = p.steer;
    this.footprint.x = p.pos.x;
    this.footprint.z = p.pos.z;
    this.footprint.yaw = p.yaw;
  }
}

// The model is one connected mesh, so the skis are cut out of it by place: the
// triangles wholly ahead of the running boards, below the bumper and outside
// the tunnel, each side's ski with the foot of its spindle. `s` is the model's
// scale; the rest is the body.
function splitSkis(geo, s) {
  const pos = geo.attributes.position;
  const index = geo.index ? geo.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const inSki = (i) => pos.getZ(i) > 0.17 * s && pos.getY(i) < 0.12 * s && Math.abs(pos.getX(i)) > 0.105 * s;
  const body = [], skis = [[], []]; // left, right
  for (let t = 0; t < index.length; t += 3) {
    if (inSki(index[t]) && inSki(index[t + 1]) && inSki(index[t + 2])) skis[pos.getX(index[t]) > 0 ? 0 : 1].push(t);
    else body.push(t);
  }
  return { body: subsetGeometry(geo, index, body), skis: skis.map((tris) => subsetGeometry(geo, index, tris)) };
}
