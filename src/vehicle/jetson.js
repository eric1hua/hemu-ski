// The Jetson ONE (public/models/jetson/jetson-one.glb, a Tripo model in 37
// parts, nose toward +x, its left toward -z, skids on the ground at y = 0),
// turned at load to the pickup's axes: nose toward +z, left toward +x. Its eight
// propellers (two to a corner, one above the other) and its two control sticks
// are parts of their own, so the rotors spin and the sticks move with the
// controls; the rest is merged into one mesh.
//
// jet.root sits on the ground midway between the skids' feet and carries the
// flight's pitch and roll; the body bobs a little in the hover inside it. The
// rider's root follows `saddle`, and `seat` says where their hips, feet and
// hands go in that frame (see Rider.setLocomotion): the hands on the sticks'
// handles, which `update` moves with the sticks.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeToon } from '../render/toon.js';

const FILE = import.meta.env.BASE_URL + 'models/jetson/jetson-one.glb';
// Nose to tail, metres: longer than a real one (about 2.5 m) to give the
// riders' big heads room under the roll cage.
const LENGTH = 3.1;
// The parts that move, by name: the eight propellers, and the sticks.
const PROPS = ['17', '18', '8', '26', 'new_0', 'new_0_0_0', 'new_0_1_0', 'new_0_2'].map((n) => `tripo_part_${n}`);
const STICKS = ['tripo_part_new_0_3', 'tripo_part_new_0_0']; // left, right
// Measured off the model, in its own units (0.92 long, centred, nose +x):
const AT = {
  pads: [0.141, -0.157, 0.12], // the skids' feet: front x, rear x, ±z
  seat: [-0.085, 0.172], // where the rider sits: x, and the cushion's height there
  feet: [0.14, 0.15, 0.055], // the footwell's floor, under the feet: x, y, ±z
  sticks: [0.052, 0.18, 0.312, 0.05], // the control sticks: x, the pivot's height, the handle's, ±z
};
const STICK_TILT = 0.3; // how far a stick leans at full deflection (rad)

export class Jetson {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Jetson';
    this.body = new THREE.Group(); // bobs in the hover
    this.root.add(this.body);
    this.saddle = new THREE.Object3D(); // the rider's root: -z forward, as on the board
    this.saddle.rotation.y = Math.PI;
    this.body.add(this.saddle);
    this.rotors = []; // { pivot, disc, dir }: each spins about y
    this.sticks = []; // pivots at the sticks' feet, the left one first
    this.seat = null; // { hips, feet: [left, right], grips: [left, right], kneeOut } in the rider's body frame
    this.dims = null;
    // A rotated box { x, z, yaw, hw, hd } for the rider's collisions; it moves with the aircraft.
    this.footprint = { kind: 'jetson', x: 0, z: 0, yaw: 0, hw: 0, hd: 0 };
    this.marks = []; // it leaves no tracks
    this.exits = []; // where you step off: { along, left }, the left first
    this.t = 0;
    this.hover = 0; // 0 on the ground … 1 in the air, for the bob
    this.ready = new GLTFLoader().loadAsync(FILE).then((gltf) => this.#build(gltf));
  }

  #build(gltf) {
    gltf.scene.updateMatrixWorld(true);
    const parts = new Map();
    let src = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      parts.set(o.name, o.geometry.clone().applyMatrix4(o.matrixWorld));
      src ||= o.material;
    });
    for (const name of [...PROPS, ...STICKS]) if (!parts.has(name)) throw new Error(`jetson-one.glb has no ${name}`);
    const box = new THREE.Box3();
    for (const g of parts.values()) { g.computeBoundingBox(); box.union(g.boundingBox); }
    const s = LENGTH / (box.max.x - box.min.x);
    const cx = (AT.pads[0] + AT.pads[1]) / 2; // the origin goes between the skids' feet
    // A point measured off the model, in metres on the turned one.
    const at = (x, y, z) => new THREE.Vector3(-z * s, y * s, (x - cx) * s);
    const turn = (g) => g.translate(-cx, 0, 0).rotateY(-Math.PI / 2).scale(s, s, s);
    for (const g of parts.values()) turn(g);

    const mat = makeToon({ map: src.map, side: src.side }, { rim: 1 });
    const mesh = (g) => {
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    // A pivot at `p` holding the part, offset so it stays where it was.
    const pivot = (g, p) => {
      const o = new THREE.Group();
      o.position.copy(p);
      o.add(mesh(g.translate(-p.x, -p.y, -p.z)));
      this.body.add(o);
      return o;
    };
    this.body.add(mesh(mergeGeometries([...parts].filter(([name]) => !PROPS.includes(name) && !STICKS.includes(name)).map(([, g]) => g))));

    // Each propeller turns about its hub, midway between its blade tips. The
    // two at a corner turn opposite ways, and so do neighbouring corners.
    const discTex = discTexture();
    for (const name of PROPS) {
      const g = parts.get(name);
      const { tips, y } = bladeTips(g);
      const hub = new THREE.Vector3((tips[0].x + tips[1].x) / 2, y, (tips[0].z + tips[1].z) / 2);
      const radius = tips[0].distanceTo(tips[1]) / 2;
      const r = { pivot: pivot(g, hub), hub, radius, dir: 1 };
      // A faint disc for the blur of the spinning blades. It has no normals, so
      // the ink pass draws no lines round it.
      const dg = new THREE.CircleGeometry(radius * 1.02, 40).rotateX(-Math.PI / 2);
      dg.deleteAttribute('normal');
      r.disc = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ map: discTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      r.disc.position.copy(hub);
      r.disc.renderOrder = 1;
      this.body.add(r.disc);
      this.rotors.push(r);
    }
    for (const r of this.rotors) {
      const pair = this.rotors.find((o) => o !== r && Math.hypot(o.hub.x - r.hub.x, o.hub.z - r.hub.z) < r.radius);
      const upper = !pair || r.hub.y > pair.hub.y;
      r.dir = (upper ? 1 : -1) * Math.sign(r.hub.x * r.hub.z || 1);
    }

    // The sticks lean about their feet; the hands hold their handles.
    const st = AT.sticks;
    this.sticks = STICKS.map((name, i) => pivot(parts.get(name), at(st[0], st[1], i ? st[3] : -st[3])));
    this.handles = this.sticks.map(() => new THREE.Vector3(0, (st[2] - st[1]) * s, 0)); // pivot to handle

    const pads = AT.pads;
    const d = (this.dims = {
      length: (box.max.x - box.min.x) * s,
      height: box.max.y * s,
      halfWidth: (box.max.z - box.min.z) * s / 2, // tip to tip of the rotors
      halfLength: (box.max.x - box.min.x) * s / 2,
      wheelbase: (pads[0] - pads[1]) * s, // front skid feet to rear
      track: 2 * pads[2] * s,
    });

    const pair = ([x, y, z]) => [at(x, y, -z), at(x, y, z)];
    this.seat = {
      hips: at(AT.seat[0], AT.seat[1], 0),
      feet: pair(AT.feet),
      grips: this.sticks.map((p, i) => this.handles[i].clone().add(p.position)),
      kneeOut: 0.05, // legs together, down the footwell under the nose
    };

    this.footprint.hw = d.halfWidth;
    this.footprint.hd = d.halfLength;
    // Out between the front and rear rotors, clear of their blades.
    const mid = (this.rotors.reduce((a, r) => a + r.hub.z, 0) / this.rotors.length);
    this.exits = [[mid, d.halfWidth + 0.6], [mid, -d.halfWidth - 0.6], [-d.halfLength - 1, 0], [d.halfLength + 1, 0]]
      .map(([along, left]) => ({ along, left }));
    return this;
  }

  // Pose from the flight: position and attitude, the rotors' speed, the sticks.
  update(dt, p) {
    this.t += dt;
    this.root.position.copy(p.pos);
    this.root.quaternion.copy(p.quat);
    this.hover += ((p.landed ? 0 : 1) - this.hover) * (1 - Math.exp(-dt * 3));
    this.body.position.y = Math.sin(this.t * 1.7) * 0.03 * this.hover;
    this.body.rotation.z = Math.sin(this.t * 1.1 + 1) * 0.006 * this.hover;

    // Spun at a rate the eye can follow rather than the real thousands of rpm,
    // with the blur disc thickening as they come up to speed.
    const w = p.spool * (24 + 8 * p.load);
    const blur = THREE.MathUtils.smoothstep(p.spool, 0.25, 0.9) * (0.2 + 0.08 * p.load);
    for (const r of this.rotors) {
      r.pivot.rotation.y += w * r.dir * dt;
      r.disc.material.opacity = blur;
      r.disc.visible = blur > 0.005;
    }

    // Right stick: W/S lean it forward and back, A/D to the side. Left stick:
    // forward to climb, back to come down.
    const k = p.stick;
    this.sticks[0].rotation.set(k.lift * STICK_TILT, 0, 0);
    this.sticks[1].rotation.set(k.pitch * STICK_TILT, 0, -k.turn * STICK_TILT);
    this.sticks.forEach((st, i) => this.seat.grips[i].copy(this.handles[i]).applyEuler(st.rotation).add(st.position));

    this.footprint.x = p.pos.x;
    this.footprint.z = p.pos.z;
    this.footprint.yaw = p.yaw;
  }
}

// A propeller's two blade tips (the points furthest apart across it) and the
// height of its blades.
function bladeTips(g) {
  const pos = g.attributes.position, v = new THREE.Vector3();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  const far = (from) => {
    let best = null, bd = -1;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = Math.hypot(v.x - from.x, v.z - from.z);
      if (d > bd) { bd = d; best = v.clone(); }
    }
    return best;
  };
  const a = far(c), b = far(a);
  return { tips: [a, b], y: (a.y + b.y) / 2 };
}

// Soft grey rings, darker toward the tips, where the blades' blur shows most.
function discTexture() {
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(N / 2, N / 2, N * 0.06, N / 2, N / 2, N / 2);
  grad.addColorStop(0, 'rgba(40,44,50,0)');
  grad.addColorStop(0.25, 'rgba(40,44,50,0.35)');
  grad.addColorStop(0.8, 'rgba(40,44,50,0.8)');
  grad.addColorStop(0.95, 'rgba(40,44,50,1)');
  grad.addColorStop(1, 'rgba(40,44,50,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
