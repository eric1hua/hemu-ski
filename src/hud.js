import { SERVICE_CENTRES } from './world/data.js';
import { drawPin } from './gps/navigator.js';

export const DIFF = { easy: '#4f8fd6', novice: '#4f8fd6', intermediate: '#d9534a', advanced: '#23303a', expert: '#23303a' };
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(world, piste) {
    this.world = world;
    this.piste = piste;
    this.el = $('hud');
    this.speed = $('speed');
    this.time = $('time');
    this.alt = $('alt');
    this.runName = $('run-name');
    this.badge = $('run-badge');
    this.toastEl = $('toast');
    this.promptEl = $('prompt');
    this.map = $('minimap').getContext('2d');
    this.#prerenderMap();
    this.lastRun = null;
    this.place = { name: '', badge: 'offpiste' };
    this.parked = []; // the parked vehicles' footprints { kind, x, z, yaw }, shown on the mini-map
  }

  #prerenderMap() {
    const { detail, meta } = this.world;
    const ppm = 0.3; // pixels per metre
    const N = Math.round(detail.size * ppm);
    // The shaded relief and contours on their own, for the big map to draw its
    // runs over at any zoom; the mini-map's copy has them baked in.
    const relief = document.createElement('canvas');
    relief.width = relief.height = N;
    const rg = relief.getContext('2d');
    const img = rg.createImageData(N, N);
    const { x0, z0 } = detail;
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) H[j * N + i] = detail.heightAt(i / ppm + x0, j / ppm + z0);
    for (let j = 1; j < N - 1; j++)
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        const h = H[k];
        const shade = Math.max(-1, Math.min(1, (H[k - 1] - H[k + 1] + H[k - N] - H[k + N]) * 0.08));
        let r = 246 + shade * 14, gg = 244 + shade * 12, b = 236 + shade * 8;
        const band = Math.floor(h / 50);
        if (band !== Math.floor(H[k + 1] / 50) || band !== Math.floor(H[k + N] / 50)) {
          r -= 40; gg -= 30; b -= 20;
        }
        img.data.set([r, gg, b, 255], k * 4);
      }
    rg.putImageData(img, 0, 0);
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.drawImage(relief, 0, 0);
    const toPx = (p) => [(p[0] - x0) * ppm, (p[1] - z0) * ppm];
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const run of meta.runs) {
      g.strokeStyle = DIFF[run.difficulty] || DIFF.intermediate;
      g.lineWidth = run.name === '云霄峰道' ? 5 : 3;
      g.beginPath();
      run.points.forEach((p, i) => (i ? g.lineTo(...toPx(p)) : g.moveTo(...toPx(p))));
      g.stroke();
    }
    g.setLineDash([4, 3]);
    g.strokeStyle = '#23303a';
    g.lineWidth = 1.5;
    for (const l of meta.lifts) {
      g.beginPath();
      l.points.forEach((p, i) => (i ? g.lineTo(...toPx(p)) : g.moveTo(...toPx(p))));
      g.stroke();
    }
    g.setLineDash([]);
    for (const sc of SERVICE_CENTRES) {
      const [px, pz] = toPx([sc.x, sc.z]);
      g.fillStyle = sc.roof;
      g.fillRect(px - 12, pz - 12, 24, 24);
      g.strokeRect(px - 12, pz - 12, 24, 24);
    }
    this.mapCanvas = c;
    this.reliefCanvas = relief;
    this.ppm = ppm;
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  // `label` (e.g. a lift's name) replaces the run name while it's set.
  update(phys, elapsed, label = null) {
    this.speed.textContent = Math.round(phys.speed * 3.6);
    this.alt.textContent = Math.round(phys.pos.y);
    const m = Math.floor(elapsed / 60), s = elapsed - m * 60;
    this.time.textContent = `${m}:${s.toFixed(1).padStart(4, '0')}`;

    const ri = label ?? (this.piste.distAt(phys.pos.x, phys.pos.z) < 22 ? this.piste.runAt(phys.pos.x, phys.pos.z) : -1);
    if (ri !== this.lastRun) {
      this.lastRun = ri;
      const run = label ? null : this.world.meta.runs[ri];
      this.runName.textContent = label ?? (run ? run.name || 'Unnamed run' : 'Off-piste');
      this.badge.className = 'badge ' + (run ? run.difficulty : 'offpiste');
      // Where you are, for the big map.
      this.place = { name: this.runName.textContent, badge: label ? 'lift' : run ? run.difficulty : 'offpiste' };
    }

    // Minimap: north-up window centred on the rider.
    const ctx = this.map, W = ctx.canvas.width;
    const view = 700; // metres across
    const scale = W / (view * this.ppm);
    const { x0, z0 } = this.world.detail;
    const cx = (phys.pos.x - x0) * this.ppm, cz = (phys.pos.z - z0) * this.ppm;
    ctx.save();
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(this.mapCanvas, -cx, -cz);
    ctx.restore();
    if (this.gps?.waypoint) this.#drawRoute(ctx, phys.pos, W / view);
    for (const v of this.parked) this.#drawVehicle(ctx, phys.pos, W / view, v);
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(-phys.yaw);
    ctx.fillStyle = '#f0c24a';
    ctx.strokeStyle = '#23303a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#23303a';
    ctx.font = '16px "Patrick Hand SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', W / 2, 18);
  }

  // The GPS route on the mini-map, and the destination's pin, held on the rim
  // when it's further than the map shows.
  #drawRoute(ctx, at, k) {
    const W = ctx.canvas.width, R = W / 2;
    const px = (x, z) => [R + (x - at.x) * k, R + (z - at.z) * k];
    this.gps.drawRoute(ctx, px, { width: 4 });
    const [u, v] = px(this.gps.waypoint.x, this.gps.waypoint.z);
    const du = u - R, dv = v - R, d = Math.hypot(du, dv), rim = R - 16;
    if (d < rim) drawPin(ctx, u, v, 0.8);
    else drawPin(ctx, R + (du / d) * rim, R + (dv / d) * rim + 10, 0.7);
  }

  // A parked vehicle: the pickup a red block, the snowmobile a smaller orange
  // one on two skis, nose up for north, held on the rim when it's further than
  // the map shows.
  #drawVehicle(ctx, at, k, car) {
    const W = ctx.canvas.width, R = W / 2, rim = R - 12;
    let u = (car.x - at.x) * k, v = (car.z - at.z) * k;
    const d = Math.hypot(u, v);
    if (d > rim) { u *= rim / d; v *= rim / d; }
    ctx.save();
    ctx.translate(R + u, R + v);
    ctx.rotate(-car.yaw);
    ctx.strokeStyle = '#23303a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (car.kind === 'snowmobile') {
      ctx.moveTo(-6, -10); ctx.lineTo(-6, -3); // the skis
      ctx.moveTo(6, -10); ctx.lineTo(6, -3);
      ctx.stroke();
      ctx.fillStyle = '#f0883a';
      ctx.beginPath();
      ctx.roundRect(-4, -7, 8, 15, 3);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#23303a';
      ctx.fillRect(-2.5, -4, 5, 2.5); // the windscreen
    } else {
      ctx.fillStyle = '#d9604c';
      ctx.roundRect(-5, -9, 10, 18, 3);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#23303a';
      ctx.fillRect(-3.5, -5, 7, 4); // the cab's windscreen, toward the nose
    }
    ctx.restore();
  }

  // Persistent hint (HTML, e.g. with <kbd>); empty hides it.
  prompt(html) {
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    if (html) this.promptEl.innerHTML = html;
    this.promptEl.classList.toggle('show', !!html);
  }

  toast(text, ms = 1400) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
