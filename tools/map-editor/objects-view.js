// The things the Objects tool moves, drawn over the terrain: the service
// centres, the hot spring and the parked vehicles as their footprints, with a
// tick the way they face, and every lift's stations (a magic carpet's ends).
// Each has a dot too, so the small ones can be found and picked from far out,
// and the selected place a handle off its front corner to turn it by (clear of
// the vehicles parked in front of a hall). Picking is in screen space, like the
// runs'.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { PLACE_IDS, placeOf, SERVICE_CENTRES, ONSEN, setSummitFrame } from '../../src/world/data.js';
import { liftStations } from '../../src/world/props.js';
import { SUMMIT } from '../../src/world/summit-layout.js';
import { dotTexture } from './runs-view.js';

// Each place's name, colour and footprint, half width × half depth in metres:
// the halls' plinths and the pool's ring as the game builds them, the vehicles
// as their models measure, the summit's landmarks as their layout gives them.
// `clearing` is the ring the forest keeps clear.
const VEHICLE = '#e0812c';
const PLACES = {
  ...Object.fromEntries(SERVICE_CENTRES.map((c) => [`lodge:${c.id}`, { name: c.en, zh: c.zh, color: '#7d5ba6', size: [60, 25.5], clearing: 110 }])),
  onsen: { name: ONSEN.en, zh: ONSEN.zh, color: '#2f8f8a', size: [3.6, 3.6], round: true, clearing: ONSEN.clearing },
  'vehicle:pickup': { name: 'Pickup', color: VEHICLE, size: [1.2, 2.8] },
  'vehicle:snowmobile': { name: 'Snowmobile', color: VEHICLE, size: [0.52, 1.3] },
  'vehicle:jetson': { name: 'Jetson ONE', color: VEHICLE, size: [1.66, 1.55] },
  ...Object.fromEntries(SUMMIT.objects.map((o) => [o.id, { name: `${o.label} · ${o.en}`, zh: o.zh, color: '#c8402f', size: o.size, round: o.round }])),
};
const STATION = '#23303a';
const STATION_SIZE = [7, 9]; // the stand-in station box, 14 × 18 m
const COLORS = { selected: '#f0c24a', partner: '#f6dc95', hover: '#ffffff', clearing: '#3f6b55' };
const LIFT = 1.5; // m above the ground
const STEP = 6; // drape sample spacing (m)

export class ObjectsView {
  constructor(hf, map) {
    this.hf = hf;
    this.map = map;
    this.group = new THREE.Group();
    this.mats = [2, 3.5].map((linewidth) => new LineMaterial({ linewidth, vertexColors: true, worldUnits: false }));
    // Everything, then the hovered and selected ones again, drawn heavier.
    this.lines = this.mats.map((m) => {
      const l = new LineSegments2(new LineSegmentsGeometry(), m);
      l.renderOrder = 2;
      l.frustumCulled = false;
      this.group.add(l);
      return l;
    });
    const dotMat = (size) => new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: dotTexture(), alphaTest: 0.5, depthTest: false, transparent: true });
    this.dotGeo = new THREE.BufferGeometry();
    this.dots = new THREE.Points(this.dotGeo, dotMat(12));
    this.dots.renderOrder = 4;
    this.dots.frustumCulled = false;
    this.group.add(this.dots);
    this.handle = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)), dotMat(14));
    this.handle.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(new THREE.Color(COLORS.selected).toArray()), 3));
    this.handle.renderOrder = 5;
    this.handle.frustumCulled = false;
    this.handle.visible = false;
    this.group.add(this.handle);
    this.items = [];
    this.byId = new Map();
    this.selected = null;
    this.hovered = null;
    this.rebuild();
  }

  setResolution(w, h) {
    for (const m of this.mats) m.resolution.set(w, h);
  }

  // Where everything stands now (after a move, or the ground changed).
  rebuild() {
    const items = [];
    setSummitFrame(this.map.lifts); // the summit's landmarks follow its stations
    for (const id of PLACE_IDS) {
      const info = PLACES[id], { x, z, yaw } = placeOf(id);
      items.push({ id, kind: 'place', x, z, yaw, hw: info.size[0], hd: info.size[1], round: info.round, color: info.color, clearing: info.clearing });
    }
    const at = liftStations(this.map.lifts);
    this.map.lifts.forEach((lift, li) => {
      const p = lift.points, ends = at[li] ?? [p[0], p[p.length - 1]];
      const yaw = Math.atan2(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]);
      const [hw, hd] = at[li] ? STATION_SIZE : [0, 0];
      ends.forEach(([x, z], end) => items.push({ id: `lift:${li}:${end}`, kind: 'station', li, end, x, z, yaw, hw, hd, color: STATION }));
    });
    this.items = items;
    this.byId = new Map(items.map((it) => [it.id, it]));
    if (!this.byId.has(this.selected)) this.selected = null;
    if (!this.byId.has(this.hovered)) this.hovered = null;
    this.#draw();
  }

  get(id) { return this.byId.get(id); }
  get selectedItem() { return this.byId.get(this.selected) ?? null; }

  setSelected(id) {
    if (id === this.selected) return;
    this.selected = id;
    this.#draw();
  }
  setHover(id) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.#draw();
  }

  // The other end of the selected station's lift.
  #partner() {
    const it = this.selectedItem;
    return it?.kind === 'station' ? `lift:${it.li}:${1 - it.end}` : null;
  }

  #colorOf(it) {
    return it.id === this.hovered ? COLORS.hover : it.id === this.selected ? COLORS.selected : it.id === this.#partner() ? COLORS.partner : it.color;
  }

  #draw() {
    const hf = this.hf, col = new THREE.Color();
    const segs = [[], []], cols = [[], []];
    // A line from (ax, az) to (bx, bz) in world metres, draped over the ground.
    const line = (layer, ax, az, bx, bz, color) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
      col.set(color);
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n;
        const x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
        segs[layer].push(x0, hf.heightAt(x0, z0) + LIFT, z0, x1, hf.heightAt(x1, z1) + LIFT, z1);
        cols[layer].push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
    };
    const ring = (layer, x, z, r, color, n = 48) => {
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        line(layer, x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, color);
      }
    };
    const pos = new Float32Array(this.items.length * 3), dotCol = new Float32Array(this.items.length * 3);
    this.items.forEach((it, k) => {
      const color = this.#colorOf(it), layer = color === it.color ? 0 : 1;
      pos.set([it.x, hf.heightAt(it.x, it.z) + LIFT, it.z], k * 3);
      col.set(color).toArray(dotCol, k * 3);
      if (!it.hw) return;
      const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
      const to = (lx, lz) => [it.x + lx * c + lz * s, it.z - lx * s + lz * c];
      if (it.round) ring(layer, it.x, it.z, it.hw, color, 24);
      else {
        const corners = [to(-it.hw, -it.hd), to(it.hw, -it.hd), to(it.hw, it.hd), to(-it.hw, it.hd)];
        corners.forEach((a, i) => line(layer, ...a, ...corners[(i + 1) % 4], color));
      }
      if (it.kind !== 'place') return;
      // The way it faces: a tick out of its front, with an arrowhead.
      const tip = it.hd + Math.max(2, it.hd * 0.4), head = Math.max(1, it.hd * 0.25);
      line(layer, ...to(0, 0), ...to(0, tip), color);
      line(layer, ...to(-head, tip - head), ...to(0, tip), color);
      line(layer, ...to(head, tip - head), ...to(0, tip), color);
      if (it.id === this.selected && it.clearing) ring(1, it.x, it.z, it.clearing, COLORS.clearing);
    });
    this.dotGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dotGeo.setAttribute('color', new THREE.BufferAttribute(dotCol, 3));
    this.lines.forEach((l, i) => {
      l.geometry.dispose();
      l.geometry = new LineSegmentsGeometry();
      if (!segs[i].length) { l.visible = false; return; }
      l.geometry.setPositions(segs[i]);
      l.geometry.setColors(cols[i]);
      l.visible = true;
    });
  }

  // Keep the turning handle a steady few pixels out from the selected place's
  // front corner, however far the camera is.
  update(camera, h) {
    const it = this.selectedItem;
    this.handle.visible = this.group.visible && it?.kind === 'place';
    if (!this.handle.visible) return;
    const y = this.hf.heightAt(it.x, it.z) + LIFT;
    const mpp = (camera.position.distanceTo(new THREE.Vector3(it.x, y, it.z)) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h;
    const out = Math.max(2, mpp * 16), lx = it.hw + out, lz = it.hd + out;
    const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
    const x = it.x + lx * c + lz * s, z = it.z - lx * s + lz * c;
    this.handle.geometry.attributes.position.array.set([x, this.hf.heightAt(x, z) + LIFT, z]);
    this.handle.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- Screen-space picking (mouse in CSS px) ----------
  #toScreen(camera, w, h, x, z, out) {
    out.set(x, this.hf.heightAt(x, z) + LIFT, z).project(camera);
    if (out.z > 1) return false;
    out.set((out.x + 1) * 0.5 * w, (1 - out.y) * 0.5 * h, 0);
    return true;
  }

  // Screen position of an item, for its label.
  screenOf(id, camera, w, h) {
    const it = this.byId.get(id), v = new THREE.Vector3();
    return it && this.#toScreen(camera, w, h, it.x, it.z, v) ? { x: v.x, y: v.y } : null;
  }

  // The item under the mouse: a dot within `radius` px, else the footprint the
  // ground point `ground` falls in (the smallest, where they overlap).
  pick(mouse, camera, w, h, ground, radius = 10) {
    const v = new THREE.Vector3();
    let best = null, bestD = radius;
    for (const it of this.items) {
      if (!this.#toScreen(camera, w, h, it.x, it.z, v)) continue;
      const d = Math.hypot(v.x - mouse.x, v.y - mouse.y);
      if (d < bestD) { bestD = d; best = it.id; }
    }
    if (best || !ground) return best;
    let area = Infinity;
    for (const it of this.items) {
      if (!it.hw) continue;
      const dx = ground.x - it.x, dz = ground.z - it.z, c = Math.cos(it.yaw), s = Math.sin(it.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const inside = it.round ? Math.hypot(lx, lz) <= it.hw : Math.abs(lx) <= it.hw && Math.abs(lz) <= it.hd;
      if (inside && it.hw * it.hd < area) { area = it.hw * it.hd; best = it.id; }
    }
    return best;
  }

  pickHandle(mouse, camera, w, h, radius = 10) {
    if (!this.handle.visible) return false;
    const [x, , z] = this.handle.geometry.attributes.position.array, v = new THREE.Vector3();
    return this.#toScreen(camera, w, h, x, z, v) && Math.hypot(v.x - mouse.x, v.y - mouse.y) < radius;
  }

  // ---------- Words ----------
  // What an item is called, and what more there is to say about it.
  label(id) {
    const it = this.byId.get(id);
    if (!it) return '';
    if (it.kind === 'place') return PLACES[id].name;
    const lift = this.map.lifts[it.li];
    return `${lift.name || (lift.type === 'magic_carpet' ? 'Magic carpet' : 'Lift')} · ${this.#isTop(it) ? 'top' : 'bottom'} ${it.hw ? 'station' : 'end'}`;
  }
  zh(id) { return PLACES[id]?.zh ?? ''; }
  color(id) { return this.byId.get(id)?.color ?? STATION; }
  #isTop(it) {
    const other = this.byId.get(`lift:${it.li}:${1 - it.end}`);
    return this.hf.heightAt(it.x, it.z) > this.hf.heightAt(other.x, other.z);
  }
  // A lift's length between its stations (m, on the map) and how far it climbs.
  liftStats(li) {
    const a = this.byId.get(`lift:${li}:0`), b = this.byId.get(`lift:${li}:1`);
    return { length: Math.hypot(b.x - a.x, b.z - a.z), rise: Math.abs(this.hf.heightAt(b.x, b.z) - this.hf.heightAt(a.x, a.z)) };
  }
}
