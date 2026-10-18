// The GPS: a destination you pick on the big map, the quickest way there over
// runs and lifts (see route.js), drawn on both maps and followed as you ride.
// Wander off it and it finds a new way from where you are; get there and it
// clears. The HUD card under the mini-map says what to do next.
import { RouteGraph } from './route.js';

export const ROUTE = '#9b5de5', CASING = '#fbfaf5', INK = '#23303a';
const OFF_ROUTE = 60; // metres from the line before it looks for a new way
// How close counts as there: a run's spot, or anywhere round a station or hall.
const ARRIVED = { hall: 150, lift: 80 }, ARRIVED_RUN = 40;
const SAVE_KEY = 'hemu-ski.gps';

const $ = (s) => document.querySelector(s);

export const formatDistance = (m) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);
const formatTime = (s) => (s < 60 ? 'under a minute' : `~${Math.round(s / 60)} min`);

export class Navigator {
  constructor({ hf, runs, rides }) {
    this.graph = new RouteGraph({ hf, runs, rides });
    this.waypoint = null; // a graph place: { node, x, z, name, sub, badge, key }
    this.route = null;
    this.s = 0; // how far along the route you are, metres
    this.seg = 0;
    this.version = 0; // bumps whenever the route changes, for the big map's redraw
    this.offFor = 0;
    this.card = {
      el: $('#gps'), badge: $('#gps .badge'), act: $('#gps .act'), dist: $('#gps .dist'), then: $('#gps .then'),
    };
  }

  // `from` is where you are ({ x, z, y, lift }).
  setWaypoint(place, from) {
    this.waypoint = place;
    this.#plan(from);
    this.#save();
  }
  clear() {
    this.waypoint = null;
    this.route = null;
    this.version++;
    this.#save();
    this.#card();
  }

  #plan(from) {
    this.route = this.waypoint && this.graph.route(from, this.waypoint.node);
    this.s = 0;
    this.seg = 0;
    this.offFor = 0;
    this.version++;
    if (this.route) this.#follow(from, 0, true);
    this.#card();
  }
  reroute(from) { if (this.waypoint) this.#plan(from); }

  // Saved by place key and spot, so the next page (after a trip to the diorama,
  // or a reload) can put the same destination back.
  #save() {
    try {
      if (this.waypoint) sessionStorage.setItem(SAVE_KEY, JSON.stringify({ key: this.waypoint.key, x: this.waypoint.x, z: this.waypoint.z }));
      else sessionStorage.removeItem(SAVE_KEY);
    } catch {}
  }
  restore(from) {
    try {
      const w = JSON.parse(sessionStorage.getItem(SAVE_KEY));
      const place = w && this.graph.placeAt(w.x, w.z, 60);
      if (place) this.setWaypoint(place, from);
    } catch {}
  }

  // Each frame you're on the mountain. Returns 'arrived' when you get there.
  update(dt, from) {
    if (!this.waypoint) return null;
    const near = ARRIVED[this.waypoint.badge] ?? ARRIVED_RUN;
    if (Math.hypot(from.x - this.waypoint.x, from.z - this.waypoint.z) < near && !from.lift) {
      const name = this.waypoint.label;
      this.clear();
      return { type: 'arrived', name };
    }
    if (!this.route) return null;
    this.#follow(from, dt);
    this.#card();
    return null;
  }

  // Find where you are along the line, looking a little back and further ahead
  // of where you were; off it for a moment and it plans again from here. A
  // lift's stretch only counts while you ride that lift (riding down under a
  // chairlift isn't riding it), and only it does while you do.
  #follow(from, dt, all = false) {
    const { points: P, acc, lift } = this.route;
    let best = Infinity, seg = this.seg, s = this.s;
    this.riding = from.lift ?? null;
    const i0 = all ? 0 : Math.max(0, this.seg - 4), i1 = all ? P.length - 1 : Math.min(P.length - 1, this.seg + 60);
    for (let i = i0; i < i1; i++) {
      if (lift[i] !== this.riding) continue;
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((from.x - ax) * dx + (from.z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * t - from.x, az + dz * t - from.z);
      if (d < best - 0.01) { best = d; seg = i; s = acc[i] + t * (acc[i + 1] - acc[i]); }
    }
    this.seg = seg;
    this.s = s;
    this.offFor = best < OFF_ROUTE ? 0 : this.offFor + dt;
    if (this.offFor > 1.2) this.#plan(from);
  }

  leg(s = this.s) {
    const legs = this.route?.legs ?? [];
    return legs.find((l) => s < l.end) ?? legs[legs.length - 1];
  }
  remaining() { return this.route ? Math.max(0, this.route.length - this.s) : 0; }

  // The card under the mini-map: what to do now, how far, and what comes after.
  #card() {
    const c = this.card;
    if (!c.el) return;
    c.el.classList.toggle('hidden', !this.waypoint);
    if (!this.waypoint) return;
    if (!this.route) {
      c.badge.className = 'badge offpiste';
      c.act.textContent = 'No way there from here';
      c.dist.textContent = '';
      c.then.textContent = this.waypoint.name;
      return;
    }
    const legs = this.route.legs, leg = this.leg(), next = legs[legs.indexOf(leg) + 1];
    const left = leg.end - this.s;
    let act;
    if (leg.kind === 'run') act = `Ride ${leg.name}`;
    else if (leg.kind === 'lift') act = this.riding ? `Ride ${leg.name} up` : `Board ${leg.name}`;
    else act = next ? `Cross to ${next.name}` : `Head for ${this.waypoint.label}`;
    c.badge.className = `badge ${leg.badge}`;
    c.act.textContent = act;
    c.dist.textContent = leg.kind === 'lift' && !this.riding ? '' : formatDistance(left);
    const total = this.remaining();
    const eta = this.route.time * (total / (this.route.length || 1));
    const then = next?.kind === 'lift' ? `then board ${next.name}` : next?.kind === 'run' ? `then ${next.name}` : '';
    // On the last leg its distance is the whole way, so just say where to.
    const rest = next ? `${formatDistance(total)} · ${formatTime(eta)} to ${this.waypoint.label}` : `${formatTime(eta)} to ${this.waypoint.label}`;
    c.then.textContent = [then, rest].filter(Boolean).join(' · ');
  }

  // The route on a 2D map, `px(x, z)` → [u, v] in canvas pixels. From where
  // you are on, unless `whole`. Stretches on the snow are a solid line, lifts a
  // dashed one, with a marker where you board and where you get off.
  drawRoute(g, px, { whole = false, width = 5 } = {}) {
    const r = this.route;
    if (!r) return;
    const P = r.points, from = whole ? 0 : this.seg;
    let start = P[from];
    if (!whole && P[from + 1]) {
      const [ax, az] = P[from], [bx, bz] = P[from + 1];
      const t = (this.s - r.acc[from]) / (r.acc[from + 1] - r.acc[from] || 1);
      start = [ax + (bx - ax) * t, az + (bz - az) * t];
    }
    // Split the line where it changes between snow and lift.
    const parts = [];
    for (let i = from; i < P.length - 1; i++) {
      const lift = r.lift[i] != null;
      let part = parts[parts.length - 1];
      if (!part || part.lift !== lift) parts.push((part = { lift, pts: [i === from ? start : P[i]] }));
      part.pts.push(P[i + 1]);
    }
    const trace = (pts) => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(...px(...p)) : g.moveTo(...px(...p))));
    };
    // Casings first, so no stretch's outline cuts across its neighbour's colour.
    // Lift dashes: purple over a wider ink dash, on a paper underlay that keeps
    // the gaps clear of the map.
    const dash = [width * 1.2, width * 2.8];
    const passes = [
      { snow: [INK, width + 4], lift: [CASING, width + 2] },
      { snow: [CASING, width + 1.5], lift: [INK, width + 3, dash] },
      { snow: [ROUTE, width], lift: [ROUTE, width, dash] },
    ];
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pass of passes)
      for (const part of parts) {
        const [color, w, d = []] = part.lift ? pass.lift : pass.snow;
        trace(part.pts);
        g.setLineDash(d);
        g.strokeStyle = color;
        g.lineWidth = w;
        g.stroke();
      }
    g.setLineDash([]);
    // Board and get off: a ring at each end of a lift stretch (but not where
    // you already are, riding it).
    const R = width * 0.7 + 3;
    parts.forEach((part, n) => {
      if (!part.lift) return;
      const ends = n > 0 || whole ? [part.pts[0], part.pts[part.pts.length - 1]] : [part.pts[part.pts.length - 1]];
      for (const p of ends) {
        const [x, y] = px(...p);
        g.beginPath();
        g.arc(x, y, R, 0, Math.PI * 2);
        g.fillStyle = CASING;
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = ROUTE;
        g.stroke();
        g.beginPath();
        g.arc(x, y, R + 1.5, 0, Math.PI * 2);
        g.lineWidth = 1.5;
        g.strokeStyle = INK;
        g.stroke();
      }
    });
    g.restore();
  }
}

// The destination's pin on a 2D map, its point at (x, y).
export function drawPin(g, x, y, size = 1) {
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-3, -7, -10, -11, -10, -19);
  g.arc(0, -19, 10, Math.PI, 0);
  g.bezierCurveTo(10, -11, 3, -7, 0, 0);
  g.closePath();
  g.fillStyle = ROUTE;
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(0, -19, 4, 0, Math.PI * 2);
  g.fillStyle = CASING;
  g.fill();
  g.restore();
}
