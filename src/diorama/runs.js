// Trail-map lines painted on the snow, plus picking and highlights for runs,
// lifts and their stations.
// Runs that share a name (OSM often splits one run into several ways) are
// grouped, so hovering any piece highlights the whole run.
import * as THREE from 'three';
import { makeToon } from '../render/toon.js';
import { RUN_NAMES, DIFFICULTY, liftTitle } from './names.js';

const LINE_LIFT = 3; // m above the snow

function ribbon(hf, points, half, lift) {
  // Densify so the strip drapes over the terrain.
  const pts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < L; d += 8) pts.push([ax + ((bx - ax) * d) / L, az + ((bz - az) * d) / L]);
  }
  pts.push(points[points.length - 1]);
  const pos = [], nrm = [], idx = [];
  const n = new THREE.Vector3();
  pts.forEach(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    for (const s of [-1, 1]) {
      const px = x + nx * half * s, pz = z + nz * half * s;
      pos.push(px, hf.heightAt(px, pz) + lift, pz);
      hf.normalAt(px, pz, n);
      nrm.push(n.x, n.y, n.z);
    }
    if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

function lineMat(color, opacity, order) {
  return makeToon({ color, transparent: opacity < 1, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -4 - order * 2, side: THREE.DoubleSide }, { hatch: 0 });
}

// A closed loop of [x, z] points, for ribbon().
function circle(x, z, r, n = 48) {
  return Array.from({ length: n + 1 }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, z + Math.sin((i / n) * Math.PI * 2) * r]);
}

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  let t = ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz);
}

export class RunMap {
  constructor(hf, runs, lifts, { lineHalf = 7, liftCable }) {
    this.hf = hf;
    this.group = new THREE.Group();
    this.hoverGroup = new THREE.Group();
    this.pickGroup = new THREE.Group();
    this.group.add(this.hoverGroup, this.pickGroup);

    // Group runs by name; unnamed ways stay on their own.
    const byKey = new Map();
    runs.forEach((run, i) => {
      const key = run.name || `#${i}`;
      if (!byKey.has(key)) byKey.set(key, { key, kind: 'run', name: run.name, runs: [], difficulty: run.difficulty });
      const g = byKey.get(key);
      g.runs.push(run);
      if ((DIFFICULTY[run.difficulty]?.rank ?? 1) > (DIFFICULTY[g.difficulty]?.rank ?? 1)) g.difficulty = run.difficulty;
    });
    this.groups = [...byKey.values()];
    for (const g of this.groups) {
      let length = 0, top = -Infinity, bottom = Infinity;
      const diffs = new Set();
      for (const r of g.runs) {
        diffs.add(r.difficulty);
        r.points.forEach((p, i) => {
          if (i) length += Math.hypot(p[0] - r.points[i - 1][0], p[1] - r.points[i - 1][1]);
          const h = hf.heightAt(p[0], p[1]);
          top = Math.max(top, h); bottom = Math.min(bottom, h);
        });
      }
      Object.assign(g, { length, top, bottom, difficulties: [...diffs] });
    }

    const mats = (this.lineMats = {});
    for (const [k, d] of Object.entries(DIFFICULTY)) mats[k] = lineMat(d.color, 0.9, 0);
    for (const g of this.groups)
      for (const r of g.runs) {
        const mesh = new THREE.Mesh(ribbon(hf, r.points, lineHalf, LINE_LIFT), mats[r.difficulty] || mats.intermediate);
        mesh.renderOrder = 1;
        this.group.add(mesh);
      }

    // Lift lines painted under each cable, like a trail map.
    mats.lift = lineMat('#f0c24a', 0.9, 0);
    for (const l of lifts) {
      const mesh = new THREE.Mesh(ribbon(hf, [l.points[0], l.points[l.points.length - 1]], lineHalf * 0.6, LINE_LIFT), mats.lift);
      mesh.renderOrder = 1;
      this.group.add(mesh);
    }

    // Lifts: hovered by their cable, measured on screen.
    this.lifts = lifts.map((l) => {
      const a = l.points[0], b = l.points[l.points.length - 1];
      const ha = hf.heightAt(a[0], a[1]), hb = hf.heightAt(b[0], b[1]);
      const h = liftCable(l);
      return {
        kind: 'lift', lift: l, ...liftTitle(l),
        A: new THREE.Vector3(a[0], ha + h, a[1]), B: new THREE.Vector3(b[0], hb + h, b[1]),
        length: Math.hypot(b[0] - a[0], b[1] - a[1], hb - ha), rise: Math.abs(hb - ha),
        bottomY: Math.min(ha, hb), topY: Math.max(ha, hb),
      };
    });

    this.hot = null;
    this.picked = null;
    this.hiMats = {
      casing: lineMat('#f0c24a', 1, 1),
      line: Object.fromEntries(Object.entries(DIFFICULTY).map(([k, d]) => [k, lineMat(d.color, 1, 2)])),
      lift: lineMat('#23303a', 1, 2),
    };
  }

  // Trail-map lines read from across the table but would look like roads up
  // close, so they fade as the camera comes in.
  setLineOpacity(o) {
    for (const m of Object.values(this.lineMats)) m.opacity = o;
  }

  // Heightfield ray march; returns the hit point or null.
  pickGround(ray, bounds) {
    const box = bounds, p = new THREE.Vector3();
    // From where the ray enters the box, or from its origin if it starts inside
    // (intersectBox would give the exit point then).
    if (box.containsPoint(ray.origin)) p.copy(ray.origin);
    else if (!ray.intersectBox(box, p)) return null;
    const hf = this.hf, d = ray.direction;
    let t = 0, prev = 0;
    const o = p.clone();
    const maxT = 30000;
    while (t < maxT) {
      p.copy(o).addScaledVector(d, t);
      if (!hf.inside(p.x, p.z)) {
        if (t > 0) return null;
      } else if (p.y < hf.heightAt(p.x, p.z)) {
        let lo = prev, hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          p.copy(o).addScaledVector(d, mid);
          if (p.y < hf.heightAt(p.x, p.z)) hi = mid; else lo = mid;
        }
        return p.copy(o).addScaledVector(d, hi);
      }
      if (p.y < box.min.y) return null;
      prev = t;
      t += 12;
    }
    return null;
  }

  // Nearest run group to a ground point within `tol` metres.
  nearestRun(x, z, tol) {
    let best = null, bd = tol;
    for (const g of this.groups)
      for (const r of g.runs)
        for (let i = 0; i < r.points.length - 1; i++) {
          const d = segDist(x, z, r.points[i], r.points[i + 1]);
          if (d < bd) { bd = d; best = g; }
        }
    return best;
  }

  // Nearest lift cable to the mouse, in pixels.
  nearestLift(mouse, camera, w, h, tolPx) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    let best = null, bd = tolPx;
    for (const l of this.lifts) {
      a.copy(l.A).project(camera);
      b.copy(l.B).project(camera);
      if (a.z > 1 || b.z > 1) continue;
      const ax = (a.x + 1) * w / 2, ay = (1 - a.y) * h / 2, bx = (b.x + 1) * w / 2, by = (1 - b.y) * h / 2;
      const d = segDist(mouse.x, mouse.y, [ax, ay], [bx, by]);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  // Highlights: `hot` follows the pointer and `picked` is the selection.
  // Items with a `ring` (lift stations, service centres) get one painted round
  // them on the snow.
  setHot(item) { this.#highlight('hot', item); }
  setPicked(item) { this.#highlight('picked', item); }

  #highlight(slot, item) {
    if (item === this[slot]) return;
    this[slot] = item;
    const group = slot === 'hot' ? this.hoverGroup : this.pickGroup;
    for (const c of [...group.children]) { c.geometry.dispose(); group.remove(c); }
    if (!item) return;
    const paint = (points, casingHalf, lineHalf, mat) => {
      const casing = new THREE.Mesh(ribbon(this.hf, points, casingHalf, LINE_LIFT + 1), this.hiMats.casing);
      const line = new THREE.Mesh(ribbon(this.hf, points, lineHalf, LINE_LIFT + 2), mat);
      casing.renderOrder = 2;
      line.renderOrder = 3;
      group.add(casing, line);
    };
    if (item.kind === 'run') {
      for (const r of item.runs) paint(r.points, 30, 13, this.hiMats.line[r.difficulty] || this.hiMats.line.intermediate);
      return;
    }
    // A painted dashed path under the lift line.
    const l = item.kind === 'station' ? item.lift.lift : item.kind === 'lift' ? item.lift : null;
    if (l) paint([l.points[0], l.points[l.points.length - 1]], 22, 11, this.hiMats.lift);
    if (item.ring) paint(circle(item.x, item.z, item.ring), 12, 5, this.hiMats.lift);
  }

  describe(item) {
    if (item.kind === 'station') {
      const l = item.lift;
      return {
        badge: 'lift',
        zh: `${l.zh} · ${item.end === 'bottom' ? '下站' : '上站'}`,
        en: `${l.en} · ${item.end} station`,
        rows: [
          [`${Math.round(item.y).toLocaleString()} m`, ''],
          [item.end === 'bottom' ? `up to ${Math.round(l.topY).toLocaleString()} m` : `from ${Math.round(l.bottomY).toLocaleString()} m`, ''],
        ],
      };
    }
    if (item.kind === 'lift') {
      return {
        badge: 'lift',
        zh: item.zh,
        en: item.en,
        rows: [
          [`${Math.round(item.length).toLocaleString()} m`, 'long'],
          [`${Math.round(item.rise).toLocaleString()} m`, 'rise'],
          [`${Math.round(item.bottomY).toLocaleString()} → ${Math.round(item.topY).toLocaleString()} m`, ''],
        ],
      };
    }
    const nm = item.name && RUN_NAMES[item.name];
    const d = DIFFICULTY[item.difficulty] || DIFFICULTY.intermediate;
    const levels = item.difficulties
      .map((k) => DIFFICULTY[k] || DIFFICULTY.intermediate)
      .sort((a, b) => b.rank - a.rank)
      .map((x) => x.label);
    return {
      badge: item.difficulty,
      zh: item.name || 'Unnamed run',
      en: nm ? (nm[1] ? `${nm[0]} · ${nm[1]}` : nm[0]) : item.name ? '' : 'No name in OpenStreetMap',
      rows: [
        [[...new Set(levels)].join(' / ') || d.label, ''],
        [`${Math.round(item.length).toLocaleString()} m`, 'long'],
        [`${Math.round(item.top - item.bottom).toLocaleString()} m`, 'drop'],
      ],
    };
  }
}
