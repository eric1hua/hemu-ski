// Snow banks along the runs. A groomed run is packed down, the groomer pushes
// its spoil out to the sides, and the snowpack beside it stays deep and loose,
// so a run lies a metre or two below the snow on either side, edged by a bank.
// raiseBanks() builds that into the ground: the runs keep the bake's height and
// the snow beside them rises into a bank, then eases back down to the ground's
// own height further out. Banks die away toward a run's loose ends and around
// the lift stations and halls, where the snow is level.
//
// The bank is narrower than the bake's 8 m cells, so the result is a heightfield
// at twice the resolution (4 m), the bake's ground sampled as heightAt() reads it.
import { Heightfield, PISTE_HALF_WIDTH, SERVICE_CENTRES, ONSEN } from './data.js';
import { vnoise } from './terrain.js';

export const BANK = {
  height: [1.4, 2.5], // m above the run's edge, varying along it
  width: [6, 10], // m from the run's edge to the top of the bank, varying too
  fade: [12, 45], // m past the widest bank's top, over which the snow comes back down
  ends: 40, // m over which a bank dies away toward a run's loose end
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// `piste` must be a PisteField of the same runs on the fine grid (4 m cells over
// the same square). `clear` ([{ x, z, r0, r1 }]) keeps the ground as it is
// within r0 of each point, easing to full banks by r1.
export function raiseBanks(hf, runs, piste, clear = []) {
  const cells = hf.cells * 2, n = cells + 1, step = hf.step / 2;
  if (piste.cell !== step || piste.n !== n || piste.x0 !== hf.x0 || piste.z0 !== hf.z0)
    throw new Error('raiseBanks: the piste field must be on the 4 m grid');
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) h[j * n + i] = hf.heightAt(hf.x0 + i * step, hf.z0 + j * step);

  // How much bank each point gets, 0–1: the most any stretch of run gives it.
  const reach = PISTE_HALF_WIDTH + BANK.width[1];
  const [f0, f1] = [reach + BANK.fade[0], reach + BANK.fade[1]];
  const amount = new Float32Array(n * n);
  runs.forEach((run, ri) => {
    const { p, cum } = piste.lines[ri];
    const total = cum[cum.length - 1];
    const [loose0, loose1] = [p[0], p[p.length - 1]].map((e) => isLoose(e, runs, ri));
    for (let s = 0; s < p.length - 1; s++) {
      const a = p[s], b = p[s + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - f1 - hf.x0) / step));
      const i1 = Math.min(cells, Math.ceil((Math.max(a[0], b[0]) + f1 - hf.x0) / step));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - f1 - hf.z0) / step));
      const j1 = Math.min(cells, Math.ceil((Math.max(a[1], b[1]) + f1 - hf.z0) / step));
      for (let j = j0; j <= j1; j++) {
        const z = hf.z0 + j * step;
        for (let i = i0; i <= i1; i++) {
          const x = hf.x0 + i * step;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len)));
          const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
          if (d >= f1) continue;
          const along = cum[s] + t * len;
          let f = 1 - smooth(f0, f1, d);
          if (loose0) f *= smooth(0, BANK.ends, along);
          if (loose1) f *= smooth(0, BANK.ends, total - along);
          const k = j * n + i;
          if (f > amount[k]) amount[k] = f;
        }
      }
    }
  });
  for (const c of clear) {
    const i0 = Math.max(0, Math.floor((c.x - c.r1 - hf.x0) / step)), i1 = Math.min(cells, Math.ceil((c.x + c.r1 - hf.x0) / step));
    const j0 = Math.max(0, Math.floor((c.z - c.r1 - hf.z0) / step)), j1 = Math.min(cells, Math.ceil((c.z + c.r1 - hf.z0) / step));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        amount[j * n + i] *= smooth(c.r0, c.r1, Math.hypot(hf.x0 + i * step - c.x, hf.z0 + j * step - c.z));
  }

  // The bank rises from the edge of whichever run is nearest, so where runs
  // meet or run side by side it stays out of both.
  const [h0, h1] = BANK.height, [w0, w1] = BANK.width;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (!amount[k]) continue;
      const x = hf.x0 + i * step, z = hf.z0 + j * step;
      const height = h0 + (h1 - h0) * vnoise(x * 0.011 + 3.7, z * 0.011);
      const width = w0 + (w1 - w0) * vnoise(x * 0.013, z * 0.013 + 9.1);
      h[k] += height * amount[k] * smooth(PISTE_HALF_WIDTH, PISTE_HALF_WIDTH + width, piste.dist[k]);
    }

  const out = new Heightfield(hf.size, cells, h, hf.center);
  const holes = [];
  hf.holes.forEach((v, t) => v && holes.push(t));
  out.setHoles(hf.tileCells * 2, holes);
  return out;
}

// Where the game keeps the snow level, for raiseBanks(): round the lift
// stations, the halls and the hot spring.
export const gameClearings = (lifts) => [
  ...lifts.flatMap((l) => [l.points[0], l.points[l.points.length - 1]].map(([x, z]) => ({ x, z, r0: 20, r1: 50 }))),
  ...SERVICE_CENTRES.map(({ x, z }) => ({ x, z, r0: 70, r1: 120 })),
  { x: ONSEN.x, z: ONSEN.z, r0: 15, r1: 35 },
];

// Does a run's end lie out in the open, away from every other run? (One that
// joins another run keeps its banks, so they carry on into that run's.)
function isLoose([x, z], runs, ri) {
  const near = PISTE_HALF_WIDTH + 5;
  return !runs.some((run, rj) => rj !== ri && run.points.some((a, s, p) => {
    const b = p[s + 1];
    if (!b) return Math.hypot(a[0] - x, a[1] - z) < near;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < near;
  }));
}
