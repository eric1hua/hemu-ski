// The whole map, opened by clicking the mini-map (or M): the resort north up,
// with lifts and service centres named, and an arrow where you are. The game
// holds still while it's open. Its main button shows you the same spot on the
// diorama.
import { SERVICE_CENTRES } from './world/data.js';

const INK = '#23303a', PAPER = '#fbfaf5';

export class BigMap {
  // `hud` lends its prerendered map; `lifts` are { label, bottom, top } and
  // `runs` { points }, in game metres.
  constructor({ hud, detail, runs, lifts, onClose, onDiorama }) {
    Object.assign(this, { hud, detail, lifts });
    this.el = document.getElementById('bigmap');
    const $ = (s) => this.el.querySelector(s);
    this.frame = $('.frame');
    this.canvas = $('canvas');
    this.you = $('.you');
    this.here = { badge: $('.here .badge'), name: $('.here .name'), alt: $('.here .alt') };
    this.isOpen = false;
    this.drawn = '';

    // The resort's extent: every run, lift and service centre.
    const b = (this.bounds = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
    const grow = (x, z) => {
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
      b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
    };
    for (const r of runs) for (const [x, z] of r.points) grow(x, z);
    for (const l of lifts) { grow(l.bottom.x, l.bottom.z); grow(l.top.x, l.top.z); }
    for (const sc of SERVICE_CENTRES) grow(sc.x, sc.z);

    // A click shouldn't leave a button focused: Space (ollie) would press it again.
    this.el.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) e.preventDefault();
    });
    $('.x').addEventListener('click', onClose);
    $('.back').addEventListener('click', onClose);
    $('.go').addEventListener('click', onDiorama);
    // A click on the dimmed game around the sheet closes it too.
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) onClose();
    });
    window.addEventListener('resize', () => this.isOpen && this.#draw());
  }

  // `at` is { x, z, bearing } in game metres and degrees; `place` the HUD's
  // { name, badge } for it; `alt` metres.
  open(at, place, alt) {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.view = this.#frameOn(at);
    this.#draw();
    const v = this.view, u = (at.x - v.x0) / v.size, w = (at.z - v.z0) / v.size;
    this.you.style.left = `${u * 100}%`;
    this.you.style.top = `${w * 100}%`;
    this.you.style.setProperty('--bearing', `${at.bearing}deg`);
    // The tag goes up and to the right, unless that's off the map.
    this.you.classList.toggle('flip-x', u > 0.82);
    this.you.classList.toggle('flip-y', w < 0.12);
    this.here.badge.className = `badge ${place.badge}`;
    this.here.name.textContent = place.name;
    this.here.alt.textContent = `${Math.round(alt).toLocaleString()} m`;
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  // A square on the resort, taking in `at` too if you've ridden off it, kept
  // inside the ride area.
  #frameOn(at) {
    const b = this.bounds, d = this.detail;
    const x0 = Math.min(b.x0, at.x), x1 = Math.max(b.x1, at.x);
    const z0 = Math.min(b.z0, at.z), z1 = Math.max(b.z1, at.z);
    const size = Math.min(d.size, Math.max(x1 - x0, z1 - z0) * 1.12);
    const clamp = (v, lo) => Math.min(Math.max(v, lo), lo + d.size - size);
    return { size, x0: clamp((x0 + x1 - size) / 2, d.x0), z0: clamp((z0 + z1 - size) / 2, d.z0) };
  }

  #draw() {
    const S = this.frame.clientWidth, v = this.view;
    const key = `${S} ${v.x0} ${v.z0} ${v.size}`;
    if (!S || key === this.drawn) return;
    this.drawn = key;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const c = this.canvas;
    c.width = c.height = Math.round(S * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, S, S);
    g.imageSmoothingQuality = 'high';
    const { ppm, mapCanvas } = this.hud, d = this.detail;
    g.drawImage(mapCanvas, (v.x0 - d.x0) * ppm, (v.z0 - d.z0) * ppm, v.size * ppm, v.size * ppm, 0, 0, S, S);

    const k = S / v.size; // pixels per metre
    const px = (x, z) => [(x - v.x0) * k, (z - v.z0) * k];
    // Names on a paper halo, so they read over the runs.
    const label = (text, x, y, font = 15) => {
      g.font = `${font}px "Patrick Hand SC", "Patrick Hand", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 4;
      g.strokeStyle = PAPER;
      g.strokeText(text, x, y);
      g.fillStyle = INK;
      g.fillText(text, x, y);
    };
    // Lifts by number, halfway up their lines: their top stations come in pairs.
    for (const l of this.lifts) label(l.label.replace('索道', ''), ...px((l.bottom.x + l.top.x) / 2, (l.bottom.z + l.top.z) / 2));
    for (const sc of SERVICE_CENTRES) {
      const [x, y] = px(sc.x, sc.z);
      label(sc.zh, x, y + 18 < S - 10 ? y + 18 : y - 16); // under the hall, unless that's off the map
    }

    // North, top left, and a kilometre for scale, bottom right.
    const bar = 1000 * k, bx = S - 14 - bar, by = S - 16;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(bx, by - 5); g.lineTo(bx, by); g.lineTo(bx + bar, by); g.lineTo(bx + bar, by - 5);
    g.stroke();
    label('1 km', bx + bar / 2, by - 10, 14);
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(20, 8); g.lineTo(25, 18); g.lineTo(15, 18); g.closePath();
    g.fill();
    label('N', 20, 30, 20);
  }
}
