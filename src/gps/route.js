// The GPS's road map: a graph of everywhere you can go on the mountain, and the
// quickest way between two places on it. Runs are ridden downhill, lifts ridden
// up, and short traverses join them where they meet; edges cost seconds.
//
//   const graph = new RouteGraph({ hf, runs, rides });
//   const place = graph.placeAt(x, z);              // snaps a map click to a place
//   const route = graph.route({ x, z }, place.node); // or null if it can't be reached
//
// Coordinates are game metres; `rides` are main.js's ({ id, label, bottom, top, length }).
import { SERVICE_CENTRES } from '../world/data.js';

const STEP = 25; // run centrelines are resampled this often
// Riding speeds (m/s) by difficulty, as on the diorama's riders.
const SPEED = { easy: 10, novice: 10, intermediate: 14, advanced: 18, expert: 21, freeride: 21 };
const TRAVERSE = 6; // skating or sliding across between runs
const WALK = 1.6; // on foot, uphill
const JOIN = 45; // runs this close count as joined
const STATION = 90; // reach of a lift's bottom and top stations
const HALL = 200; // a service centre's forecourt
const BOARD_WAIT = 12; // seconds in the queue and the gate

// A binary min-heap of node indices keyed by a Float64Array.
class Heap {
  constructor(key) { this.key = key; this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a, k = this.key;
    a.push(n);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (k[a[p]] <= k[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, k = this.key, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && k[a[l]] < k[a[m]]) m = l;
        if (r < a.length && k[a[r]] < k[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class RouteGraph {
  constructor({ hf, runs, rides }) {
    this.hf = hf;
    this.runs = runs;
    this.rides = rides;
    // Nodes: x, z, y and what they belong to.
    this.x = []; this.z = []; this.y = [];
    this.info = []; // { kind: 'run', run } | { kind: 'station', ride, end } | { kind: 'hall', hall }
    this.out = []; // per node: [{ to, cost, kind, ref }]
    this.runNodes = [];
    this.#buildRuns();
    this.#hash();
    this.#joinRuns();
    this.#buildLifts();
    this.#buildHalls();
  }

  #node(x, z, info) {
    const i = this.x.length;
    this.x.push(x); this.z.push(z); this.y.push(this.hf.heightAt(x, z));
    this.info.push(info);
    this.out.push([]);
    return i;
  }
  #edge(a, b, cost, kind, ref = null) {
    this.out[a].push({ to: b, cost, kind, ref });
  }
  dist(a, b) { return Math.hypot(this.x[a] - this.x[b], this.z[a] - this.z[b]); }

  // Each run's centreline, every STEP m, ridden from its higher end down.
  #buildRuns() {
    const { hf } = this;
    this.runs.forEach((run, ri) => {
      let p = run.points;
      if (p.length < 2) return;
      if (hf.heightAt(...p[0]) < hf.heightAt(...p[p.length - 1])) p = [...p].reverse();
      const ids = [];
      const add = (x, z) => ids.push(this.#node(x, z, { kind: 'run', run: ri }));
      add(...p[0]);
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, az] = p[i], [bx, bz] = p[i + 1];
        const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / STEP));
        for (let k = 1; k <= n; k++) add(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
      }
      const v = SPEED[run.difficulty] || SPEED.intermediate;
      for (let i = 0; i < ids.length - 1; i++) {
        const a = ids[i], b = ids[i + 1], d = this.dist(a, b);
        this.#edge(a, b, d / v, 'run', ri);
        // Back along it where that way is downhill too (OSM's ways don't all
        // run the way people ride them).
        if (this.y[a] < this.y[b] - 2) this.#edge(b, a, d / v, 'run', ri);
      }
      this.runNodes.push(ids);
    });
    this.runCount = this.x.length;
  }

  // A spatial hash of the run nodes, for finding what's near a point.
  #hash() {
    this.cell = 60;
    this.grid = new Map();
    for (let i = 0; i < this.runCount; i++) {
      const k = this.#key(this.x[i], this.z[i]);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    }
  }
  #key(x, z) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }
  // Run nodes within r of (x, z), nearest first, as [node, distance].
  near(x, z, r) {
    const c = this.cell, out = [];
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++)
        for (const n of this.grid.get(`${i},${j}`) ?? []) {
          const d = Math.hypot(this.x[n] - x, this.z[n] - z);
          if (d <= r) out.push([n, d]);
        }
    return out.sort((a, b) => a[1] - b[1]);
  }

  // Where two runs meet, you can cross from one onto the other, as long as it
  // isn't up a rise; a run's last node reaches a little further, since many stop
  // short of the run they feed.
  #joinRuns() {
    for (const ids of this.runNodes) {
      const last = ids[ids.length - 1];
      for (const a of ids) {
        const ri = this.info[a].run;
        const reach = a === last ? JOIN * 2 : JOIN;
        const seen = new Set();
        for (const [b, d] of this.near(this.x[a], this.z[a], reach)) {
          const rb = this.info[b].run;
          if (rb === ri || seen.has(rb)) continue; // the nearest node of each other run
          seen.add(rb);
          if (this.y[b] > this.y[a] + 2) continue;
          this.#edge(a, b, d / TRAVERSE + 1, 'link');
        }
      }
    }
  }

  // Run nodes near (x, z) that you can get to from there (not far uphill), and
  // ones you can get from to it.
  #linkFrom(n, r, rise = 5) {
    for (const [b, d] of this.near(this.x[n], this.z[n], r))
      if (this.y[b] <= this.y[n] + rise) this.#edge(n, b, d / TRAVERSE + 2, 'link');
  }
  #linkTo(n, r, drop = 15) {
    for (const [a, d] of this.near(this.x[n], this.z[n], r))
      if (this.y[a] >= this.y[n] - drop) this.#edge(a, n, d / TRAVERSE + 2, 'link');
  }

  // A lift is a bottom and a top station and the ride between them.
  #buildLifts() {
    this.stations = new Map(); // ride id → { bottom, top }
    for (const ride of this.rides) {
      const bottom = this.#node(ride.bottom.x, ride.bottom.z, { kind: 'station', ride, end: 'bottom' });
      const top = this.#node(ride.top.x, ride.top.z, { kind: 'station', ride, end: 'top' });
      this.y[bottom] = ride.bottom.y; this.y[top] = ride.top.y;
      this.stations.set(ride.id, { bottom, top });
      // The game's ride: 1–2 km of cable in 10–22 s.
      this.#edge(bottom, top, BOARD_WAIT + Math.min(Math.max(ride.length / 110, 10), 22), 'lift', ride);
      this.#linkTo(bottom, STATION);
      this.#linkFrom(top, STATION * 1.4);
      this.#linkFrom(bottom, STATION); // changed your mind at the bottom
    }
    // Lifts that hand on to each other: 1号's top station is beside 7号's bottom one.
    for (const a of this.stations.values())
      for (const b of this.stations.values())
        if (a !== b && this.dist(a.top, b.bottom) < 150) this.#edge(a.top, b.bottom, this.dist(a.top, b.bottom) / WALK, 'link');
  }

  // The service centres: reached from the runs that end at them, and boarding
  // their gondola.
  #buildHalls() {
    this.halls = new Map();
    for (const hall of SERVICE_CENTRES) {
      const n = this.#node(hall.x, hall.z, { kind: 'hall', hall });
      this.halls.set(hall.id, n);
      this.#linkTo(n, HALL, 25);
      this.#linkFrom(n, HALL * 0.6, 3);
      const ride = this.rides.find((r) => r.label === hall.lift);
      const st = ride && this.stations.get(ride.id);
      if (st) {
        this.#edge(n, st.bottom, this.dist(n, st.bottom) / WALK, 'link');
        this.#edge(st.bottom, n, this.dist(n, st.bottom) / WALK, 'link');
      }
    }
  }

  // What a click at (x, z) on the map means: the service centre or lift
  // station there, or else the nearest point on a run within `reach` metres.
  // null off the resort. `slack` widens the stations' and halls' catch, for a
  // zoomed-out map or a finger.
  placeAt(x, z, reach = 350, slack = 0) {
    const named = [];
    for (const n of this.halls.values()) named.push([n, 140]);
    for (const st of this.stations.values()) named.push([st.bottom, 70], [st.top, 70]);
    let best = null;
    for (const [n, r] of named) {
      const d = Math.hypot(this.x[n] - x, this.z[n] - z);
      if (d < Math.max(r, slack) && (!best || d < best[1])) best = [n, d];
    }
    if (!best) best = this.near(x, z, reach)[0];
    return best ? this.place(best[0]) : null;
  }

  // A node, named for the GPS: { node, x, z, y, name, sub, label, badge, key }
  // (`label` is the short form for "… to <label>").
  place(n) {
    const i = this.info[n], base = { node: n, x: this.x[n], z: this.z[n], y: this.y[n] };
    if (i.kind === 'hall') return { ...base, name: i.hall.zh, sub: i.hall.en, label: i.hall.zh, badge: 'hall', key: `lodge:${i.hall.id}` };
    if (i.kind === 'station')
      return { ...base, name: i.ride.label, sub: `${i.end} station`, label: `${i.ride.label} ${i.end}`, badge: 'lift', key: `lift:${i.ride.id}:${i.end}` };
    const run = this.runs[i.run], name = run.name || 'Unnamed run';
    return { ...base, name, sub: 'run', label: name, badge: run.difficulty, key: `run:${run.id}` };
  }

  // The quickest way from `from` ({ x, z, y }, or { lift } while riding one up)
  // to node `goal`: { points: [[x, z]…], acc, lift, legs, time, length }, or
  // null. `lift[i]` is the id of the lift ridden from point i to i + 1, if any.
  route(from, goal) {
    const N = this.x.length, START = N;
    const cost = new Float64Array(N + 1).fill(Infinity);
    const prev = new Int32Array(N + 1).fill(-1);
    const via = new Array(N + 1);
    const heap = new Heap(cost);
    const seed = (n, c, kind, ref = null) => {
      if (c < cost[n]) { cost[n] = c; prev[n] = START; via[n] = { kind, ref }; heap.push(n); }
    };
    if (from.lift && this.stations.has(from.lift)) {
      // Riding a lift: you get off at its top.
      seed(this.stations.get(from.lift).top, 0, 'lift', this.rides.find((r) => r.id === from.lift));
    } else {
      const y = from.y ?? this.hf.heightAt(from.x, from.z);
      // Down to the runs around you, or across a little rise to them…
      for (const r of [300, 800, 2000]) {
        for (const [n, d] of this.near(from.x, from.z, r)) {
          const rise = this.y[n] - y;
          seed(n, rise > 3 ? d / WALK + rise * 2 : d / (TRAVERSE + 2), 'start');
        }
        if (heap.size) break;
      }
      // …or a lift you're standing at, or a hall's gondola.
      for (const st of this.stations.values()) {
        const d = Math.hypot(this.x[st.bottom] - from.x, this.z[st.bottom] - from.z);
        if (d < 60) seed(st.bottom, d / TRAVERSE, 'start');
      }
      for (const n of this.halls.values()) {
        const d = Math.hypot(this.x[n] - from.x, this.z[n] - from.z);
        if (d < 150) seed(n, d / TRAVERSE, 'start');
      }
    }
    while (heap.size) {
      const a = heap.pop();
      if (a === goal) break;
      for (const e of this.out[a]) {
        const c = cost[a] + e.cost;
        if (c < cost[e.to]) { cost[e.to] = c; prev[e.to] = a; via[e.to] = e; heap.push(e.to); }
      }
    }
    if (!Number.isFinite(cost[goal])) return null;

    // Walk back from the goal, then lay the way out as a polyline whose
    // stretches remember how they're travelled.
    const chain = [];
    for (let n = goal; n !== START; n = prev[n]) chain.push(n);
    chain.reverse();
    const points = [[from.x, from.z]], kinds = [via[chain[0]]];
    for (const n of chain) { points.push([this.x[n], this.z[n]]); kinds.push(via[n]); }
    const acc = [0];
    for (let i = 1; i < points.length; i++) acc.push(acc[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const lift = kinds.slice(1).map((e) => (e.kind === 'lift' ? e.ref.id : null));
    return { points, acc, lift, legs: this.#legs(points, acc, kinds), time: cost[goal], length: acc[acc.length - 1], goal };
  }

  // The route as instructions: consecutive stretches on the same run (by name,
  // since OSM splits runs into several ways) or lift make one leg; traverses
  // shorter than a few tens of metres fold into the leg after them.
  #legs(points, acc, kinds) {
    const legs = [];
    for (let i = 1; i < points.length; i++) {
      const e = kinds[i];
      let leg;
      if (e.kind === 'run') {
        const run = this.runs[e.ref];
        leg = { kind: 'run', name: run.name || 'Unnamed run', badge: run.difficulty, id: run.id };
      } else if (e.kind === 'lift') {
        leg = { kind: 'lift', name: e.ref.label, badge: 'lift', id: e.ref.id, top: e.ref.top.y };
      } else leg = { kind: 'cross', name: '', badge: 'offpiste' };
      const tail = legs[legs.length - 1];
      const same = tail && tail.kind === leg.kind && (leg.kind === 'cross' || tail.name === leg.name);
      if (same) tail.end = acc[i];
      else legs.push({ ...leg, start: acc[i - 1], end: acc[i] });
    }
    // Fold short traverses in, and join what they separated if it's the same run.
    // One at the very start (stepping onto the first run) folds forward instead.
    const out = [];
    for (const [i, leg] of legs.entries()) {
      const tail = out[out.length - 1];
      if (leg.kind === 'cross' && leg.end - leg.start < 60 && (tail || legs[i + 1])) {
        if (tail) tail.end = leg.end;
        else legs[i + 1].start = leg.start;
        continue;
      }
      if (tail && tail.kind === leg.kind && tail.name === leg.name && leg.kind !== 'cross') { tail.end = leg.end; continue; }
      out.push(leg);
    }
    return out;
  }
}
