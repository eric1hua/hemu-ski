// The prayer wheels on the summit (object 3, whose racks world/summit.js
// builds): three racks of seven, each wheel turning on its own axle. A hand
// on one sets it turning, clockwise seen from above as prayer wheels are
// turned, and it slows over several seconds. main.js says when a hand is on
// one: brushing past them on foot, or E beside one. While they turn, the
// mantra they carry is heard (audio.js), louder the more of them turn and the
// nearer you are.
import * as THREE from 'three';

// How far a hand reaches: from the wheels' face to the rider's middle. The
// walking rider's shoulders are 1.2 m up and her arms short (0.45 m to the
// hand), so she reaches them only close by; the rack lets her within 0.4 m.
const REACH = 0.55;
const HAND = 1.05; // m up the wheels a hand goes, a little under their middles, out and down from the shoulder
const MAX_SPIN = 12; // rad/s, near two turns a second
// A turning wheel slows by a share of its speed and a little more, so a brush
// in passing (5 rad/s) keeps it turning about 9 s.
const DRAG = 1 / 6, FRICTION = 0.25;

export class PrayerWheels {
  // `racks`: the landmarks' groups (summit.byId), each with its wheels listed
  // in its 'placeholder' once its model has loaded.
  constructor(racks) {
    this.racks = racks.map((root) => ({ root, wheels: root.getObjectByName('placeholder').userData.wheels }));
    this.spin = new Map(); // wheel → rad/s, clockwise
  }

  // The wheel a rider at `pos`, facing `facing` (level, unit), can put a hand
  // on, or null: { rack, wheel, side, left, gap, along }. `side` is the face of
  // the rack they're at (+1 its front, -1 its back); `left` whether it's their
  // left hand that reaches; `gap` how far they are from the wheels' face; and
  // `along` how far along the rack they are (m, its own x).
  near(pos, facing) {
    let best = null;
    for (const rack of this.racks) {
      const { wheels, root } = rack;
      if (!wheels.length) continue;
      const c = Math.cos(root.rotation.y), s = Math.sin(root.rotation.y);
      const dx = pos.x - root.position.x, dz = pos.z - root.position.z;
      const along = dx * c - dz * s, across = dx * s + dz * c;
      const r = wheels[0].r, gap = Math.abs(across) - r;
      if (gap > REACH || along < wheels[0].x - r || along > wheels.at(-1).x + r) continue;
      if (best && gap >= best.gap) continue;
      const wheel = wheels.reduce((a, b) => (Math.abs(b.x - along) < Math.abs(a.x - along) ? b : a));
      // Not one behind you; and the hand on the rack's side reaches.
      const side = Math.sign(across) || 1;
      const tx = -s * side, tz = -c * side; // the way from you to the rack, in the world
      if (facing.x * tx + facing.z * tz < -0.3) continue;
      const left = facing.z * tx - facing.x * tz > 0; // the rack is on your left
      best = { rack, wheel, side, left, gap, along };
    }
    return best;
  }

  // The world point on the wheels' face in `near` that a hand goes to, `x` m
  // along the rack (its own x), into `out`.
  handAt(near, x, out) {
    const { root, wheels } = near.rack;
    const lx = THREE.MathUtils.clamp(x, wheels[0].x, wheels.at(-1).x), lz = near.side * (wheels[0].r + 0.03);
    const c = Math.cos(root.rotation.y), s = Math.sin(root.rotation.y);
    return out.set(root.position.x + lx * c + lz * s, root.position.y + HAND, root.position.z - lx * s + lz * c);
  }

  // The wheel nearest `x` m along `near`'s rack.
  wheelAt(near, x) {
    return near.rack.wheels.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
  }

  // A hand turning `wheel`: at least `rate` rad/s, or `add` more than it was.
  push(wheel, { rate = 0, add = 0 }) {
    const w = this.spin.get(wheel) ?? 0;
    this.spin.set(wheel, Math.min(MAX_SPIN, Math.max(w + add, rate)));
  }

  // Turns them, and returns how loud the mantra is for someone at `ear`
  // (0…1): each turning wheel adds by how fast it turns and how near it is.
  update(dt, ear) {
    let sum = 0;
    for (const [wheel, w] of this.spin) {
      const next = Math.max(0, w - (w * DRAG + FRICTION) * dt);
      wheel.mesh.rotation.y -= ((w + next) / 2) * dt;
      if (next > 0) this.spin.set(wheel, next);
      else this.spin.delete(wheel);
      wheel.mesh.getWorldPosition(_p);
      sum += Math.min(1, next / 3) * (1 - THREE.MathUtils.smoothstep(Math.hypot(_p.x - ear.x, _p.z - ear.z), 4, 30));
    }
    return 1 - Math.exp(-1.2 * sum);
  }
}
const _p = new THREE.Vector3();
