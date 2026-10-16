// Trail-map lines painted on the snow, plus hover picking for runs and lifts.
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
    this.group.add(this.hoverGroup);

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
    if (!ray.intersectBox(box, p)) return null;
    const hf = this.hf, d = ray.direction;
    let t = 0, prev = 0;
    const o = p.clone();
    const maxT = 30000;
    while (t < maxT) {
      p.copy(o).addScaledVector(d, t);
      if (Math.abs(p.x) > hf.half || Math.abs(p.z) > hf.half) {
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

  setHot(item) {
    if (item === this.hot) return;
    this.hot = item;
    for (const c of [...this.hoverGroup.children]) { c.geometry.dispose(); this.hoverGroup.remove(c); }
    if (!item) return;
    if (item.kind === 'run') {
      for (const r of item.runs) {
        const casing = new THREE.Mesh(ribbon(this.hf, r.points, 30, LINE_LIFT + 1), this.hiMats.casing);
        const line = new THREE.Mesh(ribbon(this.hf, r.points, 13, LINE_LIFT + 2), this.hiMats.line[r.difficulty] || this.hiMats.line.intermediate);
        casing.renderOrder = 2;
        line.renderOrder = 3;
        this.hoverGroup.add(casing, line);
      }
    } else {
      // A painted dashed path under the lift line.
      const l = item.lift;
      const pts = [l.points[0], l.points[l.points.length - 1]];
      const casing = new THREE.Mesh(ribbon(this.hf, pts, 22, LINE_LIFT + 1), this.hiMats.casing);
      const line = new THREE.Mesh(ribbon(this.hf, pts, 11, LINE_LIFT + 2), this.hiMats.lift);
      casing.renderOrder = 2;
      line.renderOrder = 3;
      this.hoverGroup.add(casing, line);
    }
  }

  describe(item) {
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
