// The rowing boat on Cloud Lake. For now a stand-in built here from simple
// shapes, to the size and layout the real one will have: a 3.4 m skiff with a
// pointed bow and a transom stern, round in the bilge, white outside with a red
// sheer strake and bare wood inside; floorboards, three thwarts, and a pair of
// oars in oarlocks on the gunwales.
//
// Axes as the other vehicles': bow toward +z, port (its left) toward +x, the
// waterline at y = 0. boat.root sits on the water amidships and carries the
// heading; the hull rocks inside it (`body`). The rider sits on the middle
// thwart facing the stern, as rowers do: `saddle` faces them that way, and
// `seat` says where their hips, feet and hands go (see Rider.setLocomotion),
// the hands on the oars' handles, which `update` moves with the oars.
//
// Swapping in a Tripo model: make the hull and an oar as separate GLBs (or the
// oars as parts of their own), load them as the snowmobile loads its model,
// scaled to LENGTH, and set AT from points measured off the hull. Each oar
// pivots at its oarlock and lies outboard along +x from there, its blade's
// middle BLADE m out; the starboard one is the port one turned round.
import * as THREE from 'three';
import { makeToon } from '../render/toon.js';

const LENGTH = 3.4, BEAM = 1.36;
// Measured off the hull, metres (z along from amidships, y off the waterline):
const AT = {
  seat: [0.12, 0.2], // the rowing thwart: z, and its top
  locks: [-0.2, 0.05], // the oarlocks: z, and the pins' height above the gunwale
  feet: [-0.36, 0.14], // the rower's feet on the floorboards: z (toward the stern), ±x
  thwarts: [1.02, -1.18], // the bow thwart's z, and the stern seat's
};
const OAR = { inboard: 0.6, outboard: 1.62, grip: 0.52 }; // m from the oarlock to the handle's end, the tip, the hands
const BLADE = 1.35; // m out from the oarlock, the blade's middle
const BLADE_UP = 0.25, BLADE_DOWN = -0.08; // its height off the water, out of it and in it
const COLORS = { paint: '#f2ede2', stripe: '#c9473d', wood: '#b98b5a', thwart: '#a2754a', oar: '#dcb683', iron: '#3a4148' };

// The hull's lines at t, from 0 at the transom to 1 at the stem: the half-beam
// at the gunwale, the keel's height and the gunwale's (the sheer), off the waterline.
function lines(t) {
  const half = (BEAM / 2) * (t < 0.45 ? 0.72 + 0.28 * Math.sin(((t / 0.45) * Math.PI) / 2) : Math.max(0, 1 - ((t - 0.45) / 0.55) ** 2) ** 0.75);
  const keel = -0.17 + 0.2 * Math.max(0, (t - 0.62) / 0.38) ** 2 + 0.05 * Math.max(0, (0.2 - t) / 0.2) ** 2;
  const sheer = 0.36 + 0.16 * Math.max(0, (t - 0.45) / 0.55) ** 2 + 0.05 * Math.max(0, (0.3 - t) / 0.3) ** 2;
  return { half, keel, sheer };
}
// A point round the section at t, `a` from the keel (0) to the gunwale (±1, + port), `inset` m in.
function section(t, a, inset = 0) {
  const { half, keel, sheer } = lines(t);
  const th = (Math.abs(a) * Math.PI) / 2;
  const x = Math.sign(a) * Math.max(0, half - inset) * Math.sin(th) ** 0.8;
  const y = keel + inset + (sheer - keel - inset) * (1 - Math.cos(th));
  return new THREE.Vector3(x, y, (t - 0.5) * LENGTH);
}
const tAt = (z) => z / LENGTH + 0.5;
// The hull's half-width at height y, at z (inside, `inset` m in).
function halfWidth(z, y, inset = 0) {
  const t = tAt(z);
  let a = 0;
  while (a < 1 && section(t, a, inset).y < y) a += 0.01;
  return section(t, Math.min(1, a), inset).x;
}

export class Rowboat {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Rowboat';
    this.body = new THREE.Group(); // rocks on the water
    this.root.add(this.body);
    this.saddle = new THREE.Object3D(); // the rider's root: they face the stern
    this.body.add(this.saddle);
    this.oars = []; // { pivot, blade }: the port oar first
    this.seat = null; // { hips, feet: [left, right], grips: [left, right], kneeOut } in the rider's body frame
    this.dims = { length: LENGTH, beam: BEAM, halfLength: LENGTH / 2, halfWidth: BEAM / 2, height: 0.7 };
    // A rotated box { x, z, yaw, hw, hd } for the rider's collisions; it moves with the boat.
    this.footprint = { kind: 'rowboat', x: 0, z: 0, yaw: 0, hw: BEAM / 2, hd: LENGTH / 2 };
    this.marks = []; // it leaves no tracks
    // Where you step out, { along, left } from amidships: over the stern first,
    // then over the bow, then over either side, and each a stride further.
    this.exits = [[-1, 0], [1, 0], [0, 1], [0, -1]].flatMap(([a, s]) => [0.9, 1.8].map((out) => ({
      along: a * (LENGTH / 2 + out), left: s * (BEAM / 2 + out),
    })));
    this.t = 0;
    this.#build();
    this.ready = Promise.resolve(this);
  }

  #build() {
    const paint = makeToon({ color: '#ffffff', vertexColors: true }, { rim: 1 });
    const wood = makeToon({ color: COLORS.wood }, { rim: 1 });
    const thwart = makeToon({ color: COLORS.thwart }, { rim: 1 });
    const oar = makeToon({ color: COLORS.oar }, { rim: 1 });
    const iron = makeToon({ color: COLORS.iron });
    const add = (geo, mat, parent = this.body) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // The shell, outside and in, the gunwales' tops and the transom.
    const S = 20, A = 8, TH = 0.035;
    const outside = shell(S, A, 0, -1), inside = shell(S, A, TH, 1);
    const stripe = new THREE.Color(COLORS.stripe), white = new THREE.Color(COLORS.paint);
    const pos = outside.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = tAt(pos.getZ(i)), top = lines(t).sheer;
      (top - pos.getY(i) < 0.09 ? stripe : white).toArray(col, i * 3);
    }
    outside.setAttribute('color', new THREE.BufferAttribute(col, 3));
    add(outside, paint);
    add(inside, wood);
    add(gunwales(S, TH), thwart);
    add(transom(A, TH), makeToon({ color: COLORS.paint }, { rim: 1 }));

    // Floorboards, the thwarts and the oarlocks.
    const floorY = lines(0.5).keel + 0.09;
    add(new THREE.BoxGeometry(0.5, 0.025, 2).translate(0, floorY, -0.2), thwart);
    const [seatZ, seatTop] = AT.seat;
    for (const [z, top, depth] of [[seatZ, seatTop, 0.24], [AT.thwarts[0], seatTop + 0.03, 0.2], [AT.thwarts[1], seatTop + 0.02, 0.34]]) {
      const w = 2 * halfWidth(z, top, TH) - 0.01;
      add(new THREE.BoxGeometry(w, 0.04, depth).translate(0, top - 0.02, z), thwart);
    }
    const [lockZ, lockUp] = AT.locks;
    const lockT = tAt(lockZ), gunwale = lines(lockT).sheer, lockX = lines(lockT).half - TH / 2;
    const pin = new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6).translate(0, 0.045, 0);
    const horn = new THREE.TorusGeometry(0.04, 0.008, 5, 10, Math.PI).rotateY(Math.PI / 2).translate(0, 0.07, 0);

    // The oars, pivoting on their pins; the blades turn flat on the recovery.
    for (const side of [1, -1]) {
      const at = new THREE.Vector3(side * lockX, gunwale + lockUp, lockZ);
      const lock = add(pin, iron);
      lock.position.set(at.x, gunwale, at.z);
      add(horn, iron, lock);
      const pivot = new THREE.Group();
      pivot.position.copy(at);
      this.body.add(pivot);
      const arm = new THREE.Group(); // the port oar's geometry along +x; the starboard's turned round
      arm.rotation.y = side > 0 ? 0 : Math.PI;
      pivot.add(arm);
      const len = OAR.inboard + OAR.outboard;
      add(new THREE.CylinderGeometry(0.022, 0.022, len, 7).rotateZ(Math.PI / 2).translate((OAR.outboard - OAR.inboard) / 2, 0, 0), oar, arm);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 7).rotateZ(Math.PI / 2).translate(-OAR.inboard + 0.08, 0, 0), oar, arm); // the grip
      add(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 7).rotateZ(Math.PI / 2).translate(0.02, 0, 0), thwart, arm); // the leather at the pin
      const blade = new THREE.Group();
      blade.position.x = BLADE;
      arm.add(blade);
      add(new THREE.BoxGeometry(0.52, 0.016, 0.15), oar, blade);
      add(new THREE.BoxGeometry(0.14, 0.018, 0.152).translate(0.2, 0, 0), makeToon({ color: COLORS.stripe }, { rim: 1 }), blade); // painted tips
      this.oars.push({ pivot, blade, side });
    }

    // The rower, in their own frame: turned round to face the stern.
    const rider = (x, y, z) => new THREE.Vector3(-x, y, -z);
    const [footZ, footX] = AT.feet;
    this.seat = {
      hips: rider(0, seatTop, seatZ),
      feet: [rider(-footX, floorY + 0.015, footZ), rider(footX, floorY + 0.015, footZ)], // their left foot to starboard
      grips: [new THREE.Vector3(), new THREE.Vector3()], // their left hand on the starboard oar, set by #pose
      kneeOut: 0.3,
    };
    this.oars.forEach((o) => this.#pose(o, { angle: 0, dip: 0.3, feather: 1 }));
  }

  // Pose from the rowing: position, heading, the rocking, the oars.
  update(dt, p) {
    this.t += dt;
    this.root.position.copy(p.pos);
    this.root.rotation.set(0, p.yaw + Math.PI, 0);
    this.body.rotation.set(-p.pitch.x, Math.sin(this.t * 0.6) * 0.012, p.roll.x);
    this.oars.forEach((o, i) => this.#pose(o, p.oars[i]));
    this.footprint.x = p.pos.x;
    this.footprint.z = p.pos.z;
    this.footprint.yaw = p.yaw;
    this.footprint.top = p.pos.y + this.dims.height;
  }

  // An oar `angle` toward the bow, its blade `dip` from out of the water (0)
  // to in it (1), turned `feather` from square (0) to flat (1); the hand on it.
  #pose(o, { angle, dip, feather }) {
    const drop = o.pivot.position.y - THREE.MathUtils.lerp(BLADE_UP, BLADE_DOWN, dip);
    const tilt = Math.asin(THREE.MathUtils.clamp(drop / BLADE, -1, 1));
    o.pivot.rotation.set(0, -o.side * angle, -o.side * tilt, 'YZX');
    o.blade.rotation.x = ((1 - feather) * Math.PI) / 2; // the box is built flat
    const grip = this.seat.grips[o.side > 0 ? 1 : 0];
    grip.set(-o.side * OAR.grip, 0, 0).applyEuler(o.pivot.rotation).add(o.pivot.position);
    grip.set(-grip.x, grip.y, -grip.z); // into the rower's frame
  }

  // Where oar i's blade is, in the world (0 the port oar).
  bladeAt(i, out = new THREE.Vector3()) {
    const o = this.oars[i];
    o.pivot.updateWorldMatrix(true, false);
    return o.pivot.localToWorld(out.set(o.side * BLADE, 0, 0));
  }

  // Where the hull meets water at height `level`, as it sits now: a ring of
  // world (x, z) as Vector2s, up the port side from the transom and back down
  // the starboard, taken in the middle of the planking so its edge is hidden
  // whichever side you look from. The lake leaves the water out inside it, so
  // the boat is dry inside (see createLakes). Where the keel comes out of the
  // water toward the bow (or the stern, pitched hard), the ring closes on it.
  waterline(level) {
    this.body.updateWorldMatrix(true, false);
    const m = this.body.matrixWorld, inset = WATERLINE.inset;
    const at = (t, a, out) => out.copy(section(t, a, inset)).applyMatrix4(m);
    const wet = (t) => at(t, 0, _a).y < level;
    // Up one side of the section at t from the keel, the first point out of the water.
    const crossing = (t, side) => {
      const lo = at(t, 0, _a);
      for (let j = 1; j <= WATERLINE.around; j++) {
        const hi = at(t, (side * j) / WATERLINE.around, _b);
        if (hi.y >= level) {
          const k = (level - lo.y) / (hi.y - lo.y);
          return new THREE.Vector2(lo.x + (hi.x - lo.x) * k, lo.z + (hi.z - lo.z) * k);
        }
        lo.copy(hi);
      }
      return new THREE.Vector2(lo.x, lo.z); // awash to the gunwale
    };
    // Where along the keel, between a station in the water and one out of it, it comes out.
    const keelOut = (tIn, tOut) => {
      for (let i = 0; i < 12; i++) {
        const t = (tIn + tOut) / 2;
        if (wet(t)) tIn = t; else tOut = t;
      }
      const p = at(tIn, 0, _a);
      return new THREE.Vector2(p.x, p.z);
    };
    const S = WATERLINE.stations;
    // The first station sits just inside the transom's face, for the same reason.
    const ts = Array.from({ length: S + 1 }, (_, i) => (i ? i / S : inset / LENGTH));
    const inWater = ts.map(wet);
    const i0 = inWater.indexOf(true), i1 = inWater.lastIndexOf(true);
    if (i0 < 0) return [];
    const port = [], starboard = [];
    for (let i = i0; i <= i1; i++) {
      port.push(crossing(ts[i], 1));
      starboard.push(crossing(ts[i], -1));
    }
    const ring = [...port];
    if (i1 < S) ring.push(keelOut(ts[i1], ts[i1 + 1]));
    ring.push(...starboard.reverse());
    if (i0 > 0) ring.push(keelOut(ts[i0], ts[i0 - 1]));
    return ring;
  }
}
// The waterline's ring: stations along the hull, steps round each side, and
// how far in from the outside of the planking (which is 3.5 cm thick).
const WATERLINE = { stations: 24, around: 16, inset: 0.015 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// The hull's skin: S stations from the transom to the stem, 2A + 1 points round
// each from gunwale to gunwale, `inset` m in from the outside, facing `face`
// (-1 out of the boat, 1 into it).
function shell(S, A, inset, face) {
  const pts = [];
  for (let i = 0; i <= S; i++) for (let j = -A; j <= A; j++) pts.push(section(i / S, j / A, inset));
  const row = 2 * A + 1, index = [];
  for (let i = 0; i < S; i++)
    for (let j = 0; j < 2 * A; j++) {
      const a = i * row + j, b = a + row, c = b + 1, d = a + 1;
      facing(pts, index, [a, b, c], face);
      facing(pts, index, [a, c, d], face);
    }
  return geometry(pts, index);
}

// The tops of the gunwales: from the outside to the inside, along each side.
function gunwales(S, th) {
  const pts = [], index = [];
  for (const side of [1, -1])
    for (let i = 0; i <= S; i++) {
      const base = pts.length;
      pts.push(section(i / S, side, 0), section(i / S, side, th));
      if (i === 0) continue;
      const a = base - 2, b = base - 1, c = base + 1, d = base;
      facing(pts, index, [a, b, c], 0, [0, 1, 0]);
      facing(pts, index, [a, c, d], 0, [0, 1, 0]);
    }
  return geometry(pts, index);
}

// The transom: a board across the stern, out to the skin.
function transom(A, th) {
  const pts = [], index = [];
  for (const [z, face] of [[0, -1], [th, 1]]) {
    const base = pts.length, mid = section(0, 0, 0);
    pts.push(new THREE.Vector3(0, (mid.y + lines(0).sheer) / 2, -LENGTH / 2 + z));
    for (let j = -A; j <= A; j++) pts.push(section(0, j / A, 0).setZ(-LENGTH / 2 + z));
    for (let j = 0; j < 2 * A; j++) facing(pts, index, [base, base + 1 + j, base + 2 + j], 0, [0, 0, face]);
    facing(pts, index, [base, base + 2 * A + 1, base + 1], 0, [0, 0, face]); // across the top
  }
  return geometry(pts, index);
}

// A triangle wound so it faces `dir`, or away from the hull's middle line
// (`face` -1) or toward it (1).
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _c = new THREE.Vector3();
function facing(pts, index, [a, b, c], face, dir = null) {
  const n = _e1.subVectors(pts[b], pts[a]).cross(_e2.subVectors(pts[c], pts[a]));
  let want;
  if (dir) want = _c.fromArray(dir);
  else {
    want = _c.copy(pts[a]).add(pts[b]).add(pts[c]).divideScalar(3);
    want.set(want.x, want.y - 0.25, 0).multiplyScalar(-face);
  }
  index.push(...(n.dot(want) >= 0 ? [a, b, c] : [a, c, b]));
}

function geometry(pts, index) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
