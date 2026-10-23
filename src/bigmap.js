// The whole map, opened by clicking the mini-map (or M): the resort north up,
// with its runs, lifts and service centres, and an arrow where you are. The
// game holds still while it's open. Scroll or pinch to zoom, drag to move it;
// the buttons on its edge zoom, find you and show the whole map again. Click or
// tap a place to make it the GPS's destination (see gps/), and tap its pin, or
// Clear route, to drop it. The main button shows you the same spot on the diorama.
import { SERVICE_CENTRES } from './world/data.js';
import { DIFF, drawLake } from './hud.js';
import { drawPin, formatDistance } from './gps/navigator.js';

const INK = '#23303a', PAPER = '#fbfaf5';
const MIN_VIEW = 500; // metres across, zoomed all the way in
const STEP = 1.6; // zoom per button press or key
const TAP = 8; // pixels a press can wander and still count as a tap
const BARS = [100, 200, 500, 1000, 2000]; // scale bar lengths, metres
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export class BigMap {
  // `hud` lends its prerendered relief; `lifts` are the rides ({ label, bottom,
  // top }), `lines` every lift's line ({ points }, magic carpets too) and `runs`
  // { points, difficulty, name }, in game metres.
  constructor({ hud, detail, runs, lifts, lines, gps, onClose, onDiorama }) {
    Object.assign(this, { hud, detail, runs, lifts, lines, gps });
    this.el = document.getElementById('bigmap');
    const $ = (s) => this.el.querySelector(s);
    this.frame = $('.frame');
    this.canvas = $('canvas');
    this.you = $('.you');
    this.here = { badge: $('.here .badge'), name: $('.here .name'), alt: $('.here .alt') };
    this.pick = $('.pick');
    this.dest = { badge: $('.dest .badge'), what: $('.dest .what'), clear: $('.dest .clear') };
    this.zoomIn = $('.zin');
    this.zoomOut = $('.zout');
    this.isOpen = false;
    this.pointers = new Map(); // pointers down on the map: id → { x, y }
    this.press = null; // one pointer down: a tap, or a drag once it moves
    this.pinch = null; // two down
    this.touch = matchMedia('(pointer: coarse)').matches;

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
    this.dest.clear.addEventListener('click', () => this.clearRoute());
    this.zoomIn.addEventListener('click', () => this.zoomBy(STEP));
    this.zoomOut.addEventListener('click', () => this.zoomBy(1 / STEP));
    $('.zme').addEventListener('click', () => this.#centreOnYou());
    $('.zfit').addEventListener('click', () => this.#setView(this.home));
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.#down(e));
    c.addEventListener('pointermove', (e) => this.#move(e));
    c.addEventListener('pointerup', (e) => this.#up(e, true));
    c.addEventListener('pointercancel', (e) => this.#up(e, false));
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.press) this.#tag(null); });
    c.addEventListener('wheel', (e) => this.#wheel(e), { passive: false });
    // A click on the dimmed game around the sheet closes it too.
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) onClose();
    });
    window.addEventListener('resize', () => this.isOpen && this.#redraw());
  }

  // `at` is { x, z, bearing } in game metres and degrees; `place` the HUD's
  // { name, badge } for it; `alt` metres.
  open(at, place, alt) {
    this.isOpen = true;
    this.at = at;
    this.el.classList.remove('hidden');
    this.home = this.#frameOn(at);
    this.view = { ...this.home };
    this.you.style.setProperty('--bearing', `${at.bearing}deg`);
    this.here.badge.className = `badge ${place.badge}`;
    this.here.name.textContent = place.name;
    this.here.alt.textContent = `${Math.round(alt).toLocaleString()} m`;
    this.#tag(null);
    this.#draw();
    this.#showDest();
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('hidden');
    this.pointers.clear();
    this.press = this.pinch = null;
  }

  clearRoute() {
    this.gps.clear();
    this.#tag(null);
    this.#redraw();
    this.#showDest();
  }

  // Keys while it's open: + / − zoom, 0 shows the whole map, arrows move it.
  // Returns whether it used the key.
  key(code) {
    const v = this.view, step = v.size * 0.2;
    if (code === 'Equal' || code === 'NumpadAdd') this.zoomBy(STEP);
    else if (code === 'Minus' || code === 'NumpadSubtract') this.zoomBy(1 / STEP);
    else if (code === 'Digit0' || code === 'Numpad0') this.#setView(this.home);
    else if (code === 'ArrowLeft') this.#setView({ ...v, x0: v.x0 - step });
    else if (code === 'ArrowRight') this.#setView({ ...v, x0: v.x0 + step });
    else if (code === 'ArrowUp') this.#setView({ ...v, z0: v.z0 - step });
    else if (code === 'ArrowDown') this.#setView({ ...v, z0: v.z0 + step });
    else return false;
    return true;
  }

  zoomBy(f) { this.#zoomAt(f, 0.5, 0.5); }

  // ---------- Getting around ----------
  // Zoom by `f` about the point at frame fractions (u, w), which stays put.
  #zoomAt(f, u, w) {
    const v = this.view, size = this.#clampSize(v.size / f);
    const x = v.x0 + u * v.size, z = v.z0 + w * v.size;
    this.#setView({ size, x0: x - u * size, z0: z - w * size });
  }
  #centreOnYou() {
    const size = Math.min(this.view.size, 1500);
    this.#setView({ size, x0: this.at.x - size / 2, z0: this.at.z - size / 2 });
  }
  #clampSize(s) { return clamp(s, MIN_VIEW, this.detail.size); }
  // A view kept on the ride area, drawn on the next frame.
  #setView(v) {
    const d = this.detail, size = this.#clampSize(v.size);
    this.view = { size, x0: clamp(v.x0, d.x0, d.x0 + d.size - size), z0: clamp(v.z0, d.z0, d.z0 + d.size - size) };
    this.#redraw();
  }
  #redraw() {
    if (this.frameReq) return;
    this.frameReq = requestAnimationFrame(() => {
      this.frameReq = 0;
      if (this.isOpen) this.#draw();
    });
  }

  // Where a pointer is: frame fractions u, w, and the canvas's rect.
  #local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, w: (e.clientY - r.top) / r.height, r };
  }

  #wheel(e) {
    e.preventDefault();
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    // A trackpad pinch arrives as a wheel with Ctrl held, in finer steps.
    const f = Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.012 : 0.0015));
    const { u, w } = this.#local(e);
    this.#zoomAt(f, u, w);
    if (e.pointerType !== 'touch') this.#pickAt(e, false);
  }

  // One pointer down is a tap until it moves more than TAP pixels, then a drag;
  // a second one makes it a pinch. Taps pick a place on release.
  #down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch {} // keeps a drag that leaves the map
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.press = { x: e.clientX, y: e.clientY, view: { ...this.view }, moved: false };
    } else {
      this.press = null;
      this.#startPinch();
    }
    if (e.pointerType !== 'mouse') this.#tag(null);
  }

  #move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.#pickAt(e, false); // hovering
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pinch) { this.#pinchMove(); return; }
    const pr = this.press;
    if (!pr) return;
    const dx = e.clientX - pr.x, dy = e.clientY - pr.y;
    if (!pr.moved && Math.hypot(dx, dy) < TAP) return;
    pr.moved = true;
    this.canvas.classList.add('dragging');
    this.#tag(null);
    const r = this.canvas.getBoundingClientRect();
    this.#setView({ size: pr.view.size, x0: pr.view.x0 - (dx / r.width) * pr.view.size, z0: pr.view.z0 - (dy / r.height) * pr.view.size });
  }

  #up(e, released) {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      // The finger left on the map carries on moving it, but isn't a tap.
      const [q] = this.pointers.values();
      if (q) this.press = { x: q.x, y: q.y, view: { ...this.view }, moved: true };
      return;
    }
    const pr = this.press;
    this.press = null;
    this.canvas.classList.remove('dragging');
    if (released && pr && !pr.moved) this.#pickAt(e, true);
    else if (e.pointerType === 'mouse') this.#pickAt(e, false);
  }

  #startPinch() {
    const [a, b] = this.pointers.values();
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: { ...this.view } };
  }
  // The spot under the fingers when they came down stays under them as they
  // spread, close and move.
  #pinchMove() {
    const [a, b] = this.pointers.values(), P = this.pinch, r = this.canvas.getBoundingClientRect();
    const size = this.#clampSize((P.view.size * P.d) / (Math.hypot(a.x - b.x, a.y - b.y) || 1));
    const x = P.view.x0 + ((P.mx - r.left) / r.width) * P.view.size;
    const z = P.view.z0 + ((P.my - r.top) / r.height) * P.view.size;
    const u = ((a.x + b.x) / 2 - r.left) / r.width, w = ((a.y + b.y) / 2 - r.top) / r.height;
    this.#setView({ size, x0: x - u * size, z0: z - w * size });
  }

  // ---------- Destinations ----------
  // The place at a pointer: named in a tag as a mouse hovers, the GPS's
  // destination on a click or tap. A click or tap on the destination's pin
  // drops it. Fingers get bigger targets.
  #pickAt(e, set) {
    const { u, w, r } = this.#local(e), v = this.view;
    if (u < 0 || u > 1 || w < 0 || w > 1) { this.#tag(null); return; }
    const x = v.x0 + u * v.size, z = v.z0 + w * v.size, k = r.width / v.size;
    const finger = e.pointerType === 'touch' || e.pointerType === 'pen';
    const wp = this.gps.waypoint;
    // The pin's head stands 19 px over its point.
    const onPin = wp && Math.hypot((wp.x - x) * k, (wp.z - z) * k - 19) < (finger ? 24 : 14);
    const place = onPin ? null : this.gps.graph.placeAt(x, z, clamp(60 / k, 40, 400), (finger ? 26 : 16) / k);
    if (set) {
      if (onPin) { this.clearRoute(); return; }
      if (place) {
        this.gps.setWaypoint(place, this.at);
        this.#redraw();
        this.#showDest();
      }
      if (finger) return; // no hover tag under a finger
    }
    this.#tag(onPin ? 'Clear route' : place ? `${place.name} · ${place.sub}` : null, u * r.width, w * r.height);
  }

  // The hover tag, beside the pointer at (x, y) and kept on the map.
  #tag(text, x = 0, y = 0) {
    const t = this.pick;
    t.classList.toggle('hidden', !text);
    this.canvas.style.cursor = text ? 'pointer' : '';
    if (!text) return;
    t.textContent = text;
    const S = this.frame.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
    let left = x + 14;
    if (left + tw > S - 4) left = x - 14 - tw;
    t.style.left = `${clamp(left, 4, S - 4 - tw)}px`;
    t.style.top = `${clamp(y - th / 2, 4, S - 4 - th)}px`;
  }

  // The foot's GPS line: where to and how far, or how to pick somewhere.
  #showDest() {
    const g = this.gps, el = this.dest, wp = g.waypoint;
    el.clear.classList.toggle('hidden', !wp);
    el.badge.className = `badge ${wp ? wp.badge : 'pin'}`;
    if (!wp) el.what.textContent = this.touch
      ? 'Tap a place to go there · pinch to zoom'
      : 'Click a place to go there · scroll to zoom, drag to move';
    else if (!g.route) el.what.textContent = `${wp.name} · no way there from here`;
    else el.what.textContent = `${wp.name} · ${wp.sub} · ${formatDistance(g.remaining())}`;
  }

  // A square on the resort, taking in `at` too if you've ridden off it, kept
  // inside the ride area.
  #frameOn(at) {
    const b = this.bounds, d = this.detail;
    const x0 = Math.min(b.x0, at.x), x1 = Math.max(b.x1, at.x);
    const z0 = Math.min(b.z0, at.z), z1 = Math.max(b.z1, at.z);
    const size = Math.min(d.size, Math.max(x1 - x0, z1 - z0) * 1.12);
    const fit = (v, lo) => clamp(v, lo, lo + d.size - size);
    return { size, x0: fit((x0 + x1 - size) / 2, d.x0), z0: fit((z0 + z1 - size) / 2, d.z0) };
  }

  // ---------- Drawing ----------
  // Every lift's [bottom, top] stations, in game metres: the rides' own, and
  // the magic carpets' line ends, lower first.
  #stations() {
    if (this.ends) return this.ends;
    const rides = new Set(this.lifts.map((l) => String(l.id)));
    this.ends = this.lifts.map((l) => [l.bottom, l.top]);
    for (const l of this.lines) {
      if (rides.has(String(l.id))) continue;
      const [a, b] = [l.points[0], l.points[l.points.length - 1]].map(([x, z]) => ({ x, z, y: this.detail.heightAt(x, z) }));
      this.ends.push(a.y <= b.y ? [a, b] : [b, a]);
    }
    return this.ends;
  }

  #draw() {
    const S = this.frame.clientWidth, v = this.view;
    if (!S || !v) return;
    const dpr = Math.min(window.devicePixelRatio, 2), c = this.canvas, N = Math.round(S * dpr);
    if (c.width !== N) c.width = c.height = N;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, S, S);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const { ppm, reliefCanvas } = this.hud, d = this.detail;
    g.drawImage(reliefCanvas, (v.x0 - d.x0) * ppm, (v.z0 - d.z0) * ppm, v.size * ppm, v.size * ppm, 0, 0, S, S);

    const k = S / v.size; // pixels per metre
    const px = (x, z) => [(x - v.x0) * k, (z - v.z0) * k];
    const onMap = (x, y, m = 0) => x > m && x < S - m && y > m && y < S - m;

    // Lakes, runs and lifts are drawn afresh at each zoom, so they stay crisp.
    for (const lake of this.hud.lakes) drawLake(g, lake, (p) => px(...p), clamp(k * 2, 1, 2));
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = clamp(1 + k * 4.5, 1.6, 7);
    for (const run of this.runs) {
      g.strokeStyle = DIFF[run.difficulty] || DIFF.intermediate;
      g.beginPath();
      run.points.forEach((p, i) => (i ? g.lineTo(...px(...p)) : g.moveTo(...px(...p))));
      g.stroke();
    }
    // Lifts dashed, station to station: where two share a top, each station
    // stands a little back along its own line (see createLifts).
    const ends = this.#stations();
    g.setLineDash([4, 3]);
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    for (const [a, b] of ends) {
      g.beginPath();
      g.moveTo(...px(a.x, a.z));
      g.lineTo(...px(b.x, b.z));
      g.stroke();
    }
    g.setLineDash([]);
    for (const sc of SERVICE_CENTRES) {
      const [x, y] = px(sc.x, sc.z), h = Math.max(4, 40 * k);
      g.fillStyle = sc.roof;
      g.fillRect(x - h, y - h, h * 2, h * 2);
      g.strokeRect(x - h, y - h, h * 2, h * 2);
    }

    // Names on a paper halo, so they read over the runs. Ones that may be left
    // out (run names) give way to what's already there.
    const taken = [
      [0, 0, 44, 44], // north
      [S - 50, 0, S, 168], // the zoom buttons
      [S - 170, S - 40, S, S], // the scale bar
    ];
    const label = (text, x, y, { font = 15, optional = false } = {}) => {
      g.font = `${font}px "Patrick Hand SC", "Patrick Hand", sans-serif`;
      const hw = g.measureText(text).width / 2 + 3, hh = font / 2 + 2;
      const box = [x - hw, y - hh, x + hw, y + hh];
      if (optional && (!onMap(x, y, hw) || taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1]))) return;
      taken.push(box);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 4;
      g.strokeStyle = PAPER;
      g.strokeText(text, x, y);
      g.fillStyle = INK;
      g.fillText(text, x, y);
    };
    for (const sc of SERVICE_CENTRES) {
      const [x, y] = px(sc.x, sc.z), h = Math.max(4, 40 * k);
      label(sc.zh, x, y + h + 12 < S - 10 ? y + h + 12 : y - h - 10); // under the hall, unless that's off the map
    }
    // Lakes by name, just above them, where there's room.
    for (const lake of this.hud.lakes) {
      const [x, y] = px((lake.box[0] + lake.box[2]) / 2, lake.box[1]);
      if (lake.name) label(lake.name, x, y - 10, { font: 14, optional: true });
    }
    // Lifts by number, halfway along what's on the map of their lines (their
    // top stations come in pairs).
    for (const l of this.lifts) {
      const mid = visibleMiddle([[l.bottom.x, l.bottom.z], [l.top.x, l.top.z]], px, onMap);
      if (mid) label(l.label.replace('索道', ''), ...mid, { font: k > 0.25 ? 17 : 15 });
    }
    // Zoomed in, the runs are named too, once each wherever there's room.
    if (k > 0.16) {
      const named = new Map();
      for (const run of this.runs) {
        if (!run.name) continue;
        const mid = visibleMiddle(run.points, px, onMap);
        if (!mid) continue;
        const near = named.get(run.name)?.some(([x, y]) => Math.hypot(x - mid[0], y - mid[1]) < 260);
        if (near) continue;
        if (!named.has(run.name)) named.set(run.name, []);
        named.get(run.name).push(mid);
        label(run.name, mid[0], mid[1] - 12, { font: 14, optional: true });
      }
    }

    // Each lift's stations: a dot where you board, a ring where you get off,
    // so two stations side by side still read as two. They grow a little as
    // you zoom in.
    const r = clamp(2.5 + k * 3, 3.5, 6);
    g.lineWidth = 2;
    for (const [bottom, top] of ends) {
      for (const [p, boards] of [[top, false], [bottom, true]]) {
        const [x, y] = px(p.x, p.z);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = boards ? INK : PAPER;
        g.strokeStyle = boards ? PAPER : INK;
        g.fill();
        g.stroke();
        if (boards) { // an ink edge round the paper halo, so it reads on a run too
          g.beginPath();
          g.arc(x, y, r + 1.5, 0, Math.PI * 2);
          g.lineWidth = 1;
          g.strokeStyle = INK;
          g.stroke();
          g.lineWidth = 2;
        }
      }
    }

    // The GPS route from where you are, and its destination. Its own markers
    // stand over the stations where it boards and leaves a lift.
    const wp = this.gps.waypoint;
    if (wp) {
      this.gps.drawRoute(g, px, { width: clamp(3 + k * 4, 4, 8) });
      drawPin(g, ...px(wp.x, wp.z), 1);
    }

    // North, top left, and a round distance for scale, bottom right.
    const m = BARS.filter((b) => b * k <= 140).pop() ?? BARS[0];
    const bar = m * k, bx = S - 14 - bar, by = S - 16;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(bx, by - 5); g.lineTo(bx, by); g.lineTo(bx + bar, by); g.lineTo(bx + bar, by - 5);
    g.stroke();
    label(m >= 1000 ? `${m / 1000} km` : `${m} m`, bx + bar / 2, by - 10, { font: 14 });
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(20, 8); g.lineTo(25, 18); g.lineTo(15, 18); g.closePath();
    g.fill();
    label('N', 20, 30, { font: 20 });

    // You, if you're on this part of the map; your tag turns in from the edges.
    const u = (this.at.x - v.x0) / v.size, w = (this.at.z - v.z0) / v.size;
    this.you.classList.toggle('hidden', u < 0 || u > 1 || w < 0 || w > 1);
    this.you.style.left = `${u * 100}%`;
    this.you.style.top = `${w * 100}%`;
    this.you.classList.toggle('flip-x', u > 0.72);
    this.you.classList.toggle('flip-y', w < 0.12);
    this.zoomIn.disabled = v.size <= MIN_VIEW + 1;
    this.zoomOut.disabled = v.size >= d.size - 1;
  }
}

// The middle of the part of a polyline that's on the map, in canvas pixels,
// or null if too little of it shows.
function visibleMiddle(points, px, onMap) {
  const seen = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const a = px(ax, az), b = px(bx, bz), n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
    for (let j = 0; j < n; j++) {
      const t = j / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (onMap(...p, 12)) seen.push(p);
    }
  }
  return seen.length >= 4 ? seen[Math.floor(seen.length / 2)] : null;
}
