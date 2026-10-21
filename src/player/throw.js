// Throwing a snowball overarm, the way a baseball is thrown: the right arm
// draws back as the right foot steps back and the hips and shoulders turn
// away, weight on the back foot; then the hips lead the shoulders round, the
// arm whips over the top and lets go high out in front, and follows through
// down across the body as the weight comes forward and the right foot steps
// through. Key poses at times (s); between them each value eases from one key
// to the next. The ball leaves the hand at `release`.
import * as THREE from 'three';

export const THROW = { release: 0.6, length: 1.4 };

// How far the throw has taken over from whatever the rider was doing, 0–1.
export function throwWeight(t) {
  const { smoothstep } = THREE.MathUtils;
  return smoothstep(t, 0, 0.14) * (1 - smoothstep(t, 1.05, THROW.length));
}

// On foot (RiderModel), in the body frame: +z the way it's thrown, +x the
// thrower's left, metres. `turn`: the trunk's turn about the vertical (+ to
// the left; the hips take 40% of it, each spine bone 30%); `lean` forward (+)
// or back; `drop`: how far the hips sink; `shift`: how far they go forward (+)
// or back. `lf`, `rf`: where each ankle stands [x, z]; `rfLift`: the right
// foot off the snow; `rfYaw`: its toes turned out (− to the right). `lh`,
// `rh`: each hand from its shoulder [x, y, z]; `lb`, `rb`: the way each elbow
// points. `grip`: the right hand closed on the ball.
export const ON_FOOT = keys([
  { t: 0, turn: 0, lean: 0.04, drop: 0, shift: 0, lf: [0.15, 0.06], rf: [-0.15, -0.02], rfLift: 0, rfYaw: 0,
    lh: [0.03, -0.32, 0.04], lb: [1, -1, -0.3], rh: [-0.03, -0.32, 0.04], rb: [-1, -1, -0.3], grip: 1 },
  // Drawing back: the right foot lifts and steps back, the trunk turns away,
  // the ball hand goes back and the glove hand comes up toward the target.
  { t: 0.24, turn: -0.5, lean: -0.02, drop: 0.03, shift: -0.03, rf: [-0.19, -0.2], rfLift: 0.07, rfYaw: -0.5,
    lh: [0, -0.08, 0.28], rh: [-0.14, -0.12, -0.18], rb: [-1, -0.7, -0.4] },
  // Cocked: weight on the back foot, the ball up behind the head, elbow out at
  // shoulder height, the glove arm pointing at the target.
  { t: 0.46, turn: -1.0, lean: -0.12, drop: 0.08, shift: -0.08, rf: [-0.22, -0.4], rfLift: 0, rfYaw: -1.0,
    lh: [-0.03, 0.04, 0.32], lb: [1, -0.6, -0.2], rh: [-0.1, 0.17, -0.2], rb: [-1, -0.15, -0.35] },
  // Let go: hips and shoulders square to the target and on round, the arm out
  // high in front, the glove arm tucked in.
  { t: 0.6, turn: 0.45, lean: 0.35, drop: 0.07, shift: 0.08, rfYaw: -0.7,
    lh: [-0.06, -0.17, 0.17], lb: [1, -1, -0.4], rh: [0.03, 0.13, 0.31], rb: [-0.7, -0.5, 0] },
  // Following through: the arm down across the body, bent over the front leg,
  // the right foot swinging through.
  { t: 0.86, turn: 0.75, lean: 0.75, drop: 0.1, shift: 0.12, rf: [-0.13, 0.06], rfLift: 0.1, rfYaw: -0.2,
    lh: [0.04, -0.25, -0.04], rh: [0.24, -0.26, 0.14], rb: [-0.4, -0.4, 0.8], grip: 0 },
  // Settling back up.
  { t: 1.08, turn: 0.25, lean: 0.22, drop: 0.03, shift: 0.05, rf: [-0.14, 0.1], rfLift: 0, rfYaw: 0,
    lh: [0.03, -0.32, 0.04], lb: [1, -1, -0.3], rh: [-0.02, -0.3, 0.08], rb: [-1, -1, -0.3] },
  { t: THROW.length, turn: 0, lean: 0.04, drop: 0, shift: 0, rh: [-0.03, -0.32, 0.04] },
]);

// On the board (Rider), feet strapped in, so only the trunk and arm throw: in
// the body frame (+x the nose, the way it's thrown; +z the chest), the right
// hand from its shoulder [x, y, z], and `turn`, the trunk's twist (+ toward
// the nose).
export const ON_BOARD = keys([
  { t: 0, turn: 0, rh: [0, -0.4, 0.1] },
  { t: 0.46, turn: -0.55, rh: [-0.3, 0.25, -0.1] },
  { t: 0.6, turn: 0.45, rh: [0.4, 0.15, 0.15] },
  { t: 0.86, turn: 0.6, rh: [0.3, -0.3, 0.3] },
  { t: THROW.length, turn: 0, rh: [0, -0.4, 0.1] },
]);

// Each key carries on whatever the one before set, so every key has every value.
function keys(list) {
  let prev = {};
  return list.map((k) => (prev = { ...prev, ...k }));
}

// The pose `t` s into a throw, eased between the keys either side.
export function sample(list, t) {
  let i = 0;
  while (i < list.length - 2 && list[i + 1].t <= t) i++;
  const a = list[i], b = list[i + 1];
  const u = THREE.MathUtils.smootherstep(t, a.t, b.t);
  const out = {};
  for (const key of Object.keys(a)) {
    const x = a[key], y = b[key];
    out[key] = Array.isArray(x) ? x.map((v, j) => v + (y[j] - v) * u) : x + (y - x) * u;
  }
  return out;
}
