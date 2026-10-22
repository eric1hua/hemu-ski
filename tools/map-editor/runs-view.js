// Runs and lifts drawn over the editor's terrain as screen-width lines, plus
// the selected run's control points as draggable handles. Picking is done in
// screen space (pixels from the cursor), which suits thin lines and dots.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const DIFF_COLORS = { easy: '#4f8fd6', novice: '#4f8fd6', intermediate: '#d9534a', advanced: '#23303a', expert: '#23303a', freeride: '#f08a24' };
const LIFT = 4; // m above the ground
const STEP = 10; // drape sample spacing (m)

export class RunsView {
  constructor(hf, runs, lifts) {
    this.hf = hf;
    this.runs = runs;
    this.group = new THREE.Group();
    this.mats = {};
    this.lines = runs.map((r) => {
      const line = new Line2(new LineGeometry(), this.#mat(r.difficulty, 2.5));
      line.renderOrder = 1;
      this.group.add(line);
      return line;
    });
    this.samples = [];
    this.selected = -1;
    this.hovered = -1;

    // Lifts: context only, not editable.
    const liftMat = new LineMaterial({ color: '#23303a', linewidth: 1.5, dashed: true, dashSize: 30, gapSize: 20, worldUnits: false });
    this.mats.lift = liftMat;
    this.liftLines = lifts.map((l) => {
      const line = new Line2(new LineGeometry(), liftMat);
      this.group.add(line);
      return { lift: l, line };
    });

    // Handles for the selected run's points.
    this.handleGeo = new THREE.BufferGeometry();
    this.handles = new THREE.Points(this.handleGeo, new THREE.PointsMaterial({
      size: 13, sizeAttenuation: false, vertexColors: true, map: dotTexture(), alphaTest: 0.5, depthTest: false, transparent: true,
    }));
    this.handles.renderOrder = 3;
    this.handles.frustumCulled = false;
    this.group.add(this.handles);
    this.hoverHandle = -1;
    this.rebuild();
  }

  #mat(difficulty, width) {
    const key = `${difficulty}/${width}`;
    return (this.mats[key] ??= new LineMaterial({ color: DIFF_COLORS[difficulty] || DIFF_COLORS.intermediate, linewidth: width, worldUnits: false }));
  }

  setResolution(w, h) {
    for (const m of Object.values(this.mats)) m.resolution.set(w, h);
  }

  // Re-drape one run (after its points moved) or everything (after the ground moved).
  rebuild(ri) {
    const list = ri === undefined ? this.runs.map((_, i) => i) : [ri];
    for (const i of list) this.#drape(i);
    if (ri === undefined) this.rebuildLifts();
    this.#syncHandles();
  }

  // Redraw the lifts (after the ground moved, or a station did).
  rebuildLifts() {
    for (const { lift, line } of this.liftLines) {
      const [a, b] = [lift.points[0], lift.points[lift.points.length - 1]];
      const pts = [a, b].flatMap(([x, z]) => [x, this.hf.heightAt(x, z) + 12, z]);
      line.geometry.dispose();
      line.geometry = new LineGeometry().setPositions(pts);
      line.computeLineDistances();
    }
  }

  #drape(ri) {
    const p = this.runs[ri].points, hf = this.hf;
    const pts = [], samples = [];
    for (let s = 0; s < p.length - 1; s++) {
      const [ax, az] = p[s], [bx, bz] = p[s + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d < L; d += STEP) {
        const x = ax + ((bx - ax) * d) / L, z = az + ((bz - az) * d) / L;
        pts.push(x, hf.heightAt(x, z) + LIFT, z);
        samples.push(s);
      }
    }
    const [lx, lz] = p[p.length - 1];
    pts.push(lx, hf.heightAt(lx, lz) + LIFT, lz);
    samples.push(p.length - 2);
    const line = this.lines[ri];
    line.geometry.dispose();
    line.geometry = new LineGeometry().setPositions(pts);
    this.samples[ri] = { pts, seg: samples };
  }

  setSelected(ri) {
    if (this.selected >= 0) this.#style(this.selected);
    this.selected = ri;
    this.hoverHandle = -1;
    this.#style(ri);
    this.#syncHandles();
  }

  setHovered(ri) {
    if (ri === this.hovered) return;
    const old = this.hovered;
    this.hovered = ri;
    this.#style(old);
    this.#style(ri);
  }

  #style(ri) {
    if (ri < 0) return;
    const r = this.runs[ri];
    const w = ri === this.selected ? 5 : ri === this.hovered ? 4 : 2.5;
    this.lines[ri].material = this.#mat(r.difficulty, w);
    this.lines[ri].renderOrder = ri === this.selected ? 2 : 1;
  }

  setHandleHover(k) {
    if (k === this.hoverHandle) return;
    this.hoverHandle = k;
    this.#syncHandles();
  }

  #syncHandles() {
    const ri = this.selected;
    if (ri < 0) { this.handles.visible = false; return; }
    const p = this.runs[ri].points;
    const pos = new Float32Array(p.length * 3), col = new Float32Array(p.length * 3);
    const c = new THREE.Color();
    p.forEach(([x, z], k) => {
      pos.set([x, this.hf.heightAt(x, z) + LIFT, z], k * 3);
      c.set(k === this.hoverHandle ? '#f0c24a' : k === 0 ? '#7fd08a' : k === p.length - 1 ? '#e8807a' : '#ffffff');
      c.toArray(col, k * 3);
    });
    this.handleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.handleGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.handles.visible = true;
  }

  // ---------- Screen-space picking (mouse in CSS px) ----------
  #toScreen(camera, w, h, x, y, z, out) {
    out.set(x, y, z).project(camera);
    if (out.z > 1) return false; // behind the camera
    out.set((out.x + 1) * 0.5 * w, (1 - out.y) * 0.5 * h, 0);
    return true;
  }

  // Nearest run (within `radius` px) and, on it, the segment and the point on it.
  pickRun(mouse, camera, w, h, radius = 8, only = -1) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    let best = null;
    const list = only >= 0 ? [only] : this.runs.map((_, i) => i);
    for (const ri of list) {
      const { pts, seg } = this.samples[ri];
      let prevOk = false;
      for (let k = 0; k < seg.length; k++) {
        const ok = this.#toScreen(camera, w, h, pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2], b);
        if (ok && prevOk) {
          const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((mouse.x - a.x) * dx + (mouse.y - a.y) * dy) / len2));
          const d = Math.hypot(a.x + dx * t - mouse.x, a.y + dy * t - mouse.y);
          if (d < radius && (!best || d < best.d)) best = { ri, d, seg: seg[k - 1] };
        }
        a.copy(b);
        prevOk = ok;
      }
    }
    return best;
  }

  pickHandle(mouse, camera, w, h, radius = 9) {
    if (this.selected < 0) return -1;
    const v = new THREE.Vector3();
    let best = -1, bestD = radius;
    this.runs[this.selected].points.forEach(([x, z], k) => {
      if (!this.#toScreen(camera, w, h, x, this.hf.heightAt(x, z) + LIFT, z, v)) return;
      const d = Math.hypot(v.x - mouse.x, v.y - mouse.y);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  }
}

export function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.beginPath();
  g.arc(16, 16, 13, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#23303a';
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
