// The GPS in the world: a column of light over the destination, seen from
// anywhere on the mountain, and chevrons painted on the snow along the next
// stretch of the route. Both skip the ink pass's normals (see post.js).
import * as THREE from 'three';
import { ROUTE } from './navigator.js';

const AHEAD = 320; // metres of route painted ahead of you
const GAP = 2.5; // sample spacing along it
const WIDTH = 3;
const MERGE = 45; // metres over which the strip runs from your feet onto the route
const LIFT = 0.25; // over the snow

export class RouteMarks {
  constructor(hf) {
    this.hf = hf;
    this.group = new THREE.Group();

    // The beacon: an open cylinder that fades upward, always drawn on top of fog.
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5, 260, 32, 1, true).translate(0, 130, 0),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(ROUTE) }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
          void main() {
            float a = (1.0 - vUv.y) * 0.75 + 0.05;
            a *= 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 3.0);
            gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25), a * 0.7);
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.beacon.visible = false;
    this.beacon.frustumCulled = false;

    // The chevron strip, rebuilt as you go.
    const max = Math.ceil(AHEAD / GAP) + 2;
    this.max = max;
    this.pos = new Float32Array(max * 2 * 3);
    this.along = new Float32Array(max * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('along', new THREE.BufferAttribute(this.along, 1).setUsage(THREE.DynamicDrawUsage));
    const side = new Float32Array(max * 2);
    for (let i = 0; i < max; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
    const idx = [];
    for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    geo.setIndex(idx);
    this.strip = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(ROUTE) }, uTime: { value: 0 }, uLen: { value: AHEAD } },
        vertexShader: /* glsl */ `
          attribute float along; attribute float side;
          varying float vAlong; varying float vSide;
          void main() { vAlong = along; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uTime; uniform float uLen;
          varying float vAlong; varying float vSide;
          void main() {
            // Chevrons pointing the way, every 7 m, drifting forward.
            float f = fract((vAlong + abs(vSide) * 2.2) / 7.0 - uTime * 0.35);
            float body = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.38, 0.44, f));
            float edge = smoothstep(0.42, 0.44, f) * (1.0 - smoothstep(0.5, 0.52, f));
            if (body + edge < 0.01) discard;
            // In from the rider's feet, out into the distance.
            float fade = smoothstep(2.0, 10.0, vAlong) * (1.0 - smoothstep(uLen * 0.6, uLen, vAlong));
            vec3 c = mix(uColor, vec3(0.137, 0.188, 0.227), edge);
            gl_FragColor = vec4(c, 0.85 * fade * (body + edge));
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }),
    );
    this.strip.frustumCulled = false;
    this.strip.visible = false;
    this.group.add(this.beacon, this.strip);
    this.hidden = [this.beacon, this.strip]; // for the ink pass to skip
  }

  // `nav` is the Navigator, `at` where you are ({ x, z }); `riding` hides the
  // strip while you're on a lift.
  update(nav, time, riding, at) {
    this.beacon.material.uniforms.uTime.value = time;
    this.strip.material.uniforms.uTime.value = time;
    const w = nav.waypoint;
    this.beacon.visible = !!w;
    if (w) {
      this.beacon.position.set(w.x, this.hf.heightAt(w.x, w.z), w.z);
      // Wider the further off it is, so it still reads from across the valley.
      const k = Math.max(1, Math.hypot(w.x - at.x, w.z - at.z) / 700);
      this.beacon.scale.set(k, 1, k);
    }
    const r = nav.route;
    if (!r || riding) { this.strip.visible = false; return; }

    // Sample the route from where you are to AHEAD further on, stopping at a lift
    // (its line crosses the snow under the cable, which you don't ride).
    const lifts = r.legs.filter((l) => l.kind === 'lift');
    let stop = Math.min(r.length, nav.s + AHEAD);
    for (const l of lifts) if (l.end > nav.s && l.start < stop) stop = Math.max(nav.s, l.start);
    const n = Math.min(this.max, Math.floor((stop - nav.s) / GAP) + 1);
    if (n < 2) { this.strip.visible = false; return; }
    const { points: P, acc } = r;
    let seg = nav.seg;
    const along = (s) => {
      while (seg < P.length - 2 && acc[seg + 1] < s) seg++;
      const L = acc[seg + 1] - acc[seg] || 1, t = Math.min(1, Math.max(0, (s - acc[seg]) / L));
      return [P[seg][0] + (P[seg + 1][0] - P[seg][0]) * t, P[seg][1] + (P[seg + 1][1] - P[seg][1]) * t];
    };
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(along(nav.s + i * GAP));
    // Off the line (riding beside the run's centreline), it starts at your feet
    // and eases onto it.
    const ox = at.x - pts[0][0], oz = at.z - pts[0][1];
    for (let i = 0; i < n; i++) {
      const w = Math.max(0, 1 - (i * GAP) / MERGE), e = w * w * (3 - 2 * w);
      pts[i][0] += ox * e;
      pts[i][1] += oz * e;
    }
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const [x, z] = pts[i], hw = WIDTH / 2;
      const sx = -dz * hw, sz = dx * hw;
      const o = i * 6;
      for (const [k, sgn] of [[0, -1], [3, 1]]) {
        const px = x + sx * sgn, pz = z + sz * sgn;
        this.pos[o + k] = px;
        this.pos[o + k + 1] = this.hf.heightAt(px, pz) + LIFT;
        this.pos[o + k + 2] = pz;
      }
      this.along[i * 2] = this.along[i * 2 + 1] = i * GAP;
    }
    const geo = this.strip.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.along.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
    this.strip.visible = true;
  }
}
