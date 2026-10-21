// A hot spring hidden in the trees behind the East Service Centre, after the
// snowy mountain springs of Zao: a ring of snow-capped boulders
// (public/models/onsen/stone-arena.glb) holding milky jade water, fed by a
// wooden spout out of a snowy cave rock (cave-rock.glb), with steam rising off
// it. Both models are Tripo-made; the water, the stream off the spout and the
// steam are drawn here. The water is opaque, as Zao's sulphur water is milky,
// so the ink pass outlines its shore against the rocks; the steam has no
// normals, so that pass leaves it out (see InkPost.render).
//
// The pool's frame: the middle of the ring at its foot, +z toward the gap in
// the ring, which faces `faceTo`, the cave rock out to +x, its spout pouring
// back toward -x. You soak on the -x side, facing the spout.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeToon, toonUniforms } from '../render/toon.js';

const DIR = import.meta.env.BASE_URL + 'models/onsen/';
// The ring is a unit across and 0.26 tall: 7.2 m across, its rocks 0.9 m
// (at the gap) to 1.6 m tall. The water stands 0.66 m above its foot, below
// the flat stone across the gap.
const RING = 7.2, RING_TALL = 6;
const WATER = 0.66;
// The cave rock is 0.9 tall: 2.7 m. Its trough points along its +z; measured
// off the model, the trough's bed runs from the cave (z 0.1) to its lip
// (z 0.488) along x -0.04, 0.48 up.
const ROCK = 3;
const TROUGH = { x: -0.04, y: 0.48, from: 0.1, lip: 0.488 };
const ROCK_AT = { x: 3.3, z: 0.12 }; // in the pool's frame, turned to pour toward -x
// The water's edge tucks this far under the rocks.
const TUCK = 0.15;
// The way in, straight in over the flat stone across the gap: measured off the
// ring, the stone spans x 0.1–1.1 and z 2.8–3.4, 0.7 m up. From the snow
// outside it (`shore`), onto it, and down onto the pool floor inside.
const WAY = { x: 0.6, shore: 3.5, stone: 3.3, water: 2.45 };

const WATER_COLORS = { deep: '#86cbbf', pale: '#b3e3d8', foam: '#f3faf6' };
// Steam drifts downwind (m/s, world).
const WIND = new THREE.Vector3(0.22, 0, 0.12);

export function createOnsen(hf, { x, z, faceTo }) {
  const group = new THREE.Group();
  group.name = 'Onsen';
  const yaw = Math.atan2(faceTo[0] - x, faceTo[1] - z);
  group.rotation.y = yaw;
  // On the lowest ground under the ring, so no rock floats over the snow; the
  // uphill rocks sink a little into it.
  const ground = (cx, cz, r) => {
    let lo = Infinity;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let u = -r; u <= r; u += r / 4)
      for (let v = -r; v <= r; v += r / 4) {
        if (u * u + v * v > r * r * 1.05) continue;
        const lx = cx + u, lz = cz + v;
        lo = Math.min(lo, hf.heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
      }
    return lo;
  };
  const base = ground(0, 0, RING / 2) - 0.05;
  group.position.set(x, base, z);
  group.updateMatrixWorld(true);

  const toWorld = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(group.matrixWorld);
  const along = (lx, lz) => new THREE.Vector3(lx, 0, lz).transformDirection(group.matrixWorld);
  // Walls for the rider and the vehicles, with their tops for the Jetson: the
  // ring, and the cave rock's body.
  const box = (cx, cz, hw, hd, top) => {
    const p = toWorld(cx, cz);
    return { kind: 'onsen', x: p.x, z: p.z, yaw, hw, hd, top: base + top };
  };
  const footprints = [box(0, 0, RING * 0.48, RING * 0.48, 1.7), box(ROCK_AT.x + 0.6, ROCK_AT.z, 0.86, 1.16, ROCK * 0.95)];

  const uniforms = {
    uTime: { value: 0 },
    uFall: { value: new THREE.Vector2() }, // where the stream lands (world xz)
    uDrift: { value: new THREE.Vector2() }, // the pool's slow drift toward the gap (world)
    uSoak: { value: new THREE.Vector3() }, // a soaking rider's xz, and their ripples' strength
    uDeep: { value: new THREE.Color(WATER_COLORS.deep) },
    uPale: { value: new THREE.Color(WATER_COLORS.pale) },
    uFoam: { value: new THREE.Color(WATER_COLORS.foam) },
  };
  const drift = along(0, 1).multiplyScalar(0.18);
  uniforms.uDrift.value.set(drift.x, drift.z);
  const puff = createPuff(group);
  group.add(puff);
  let puffAt = null, puffAge = PUFF_LIFE;

  const onsen = {
    group,
    footprints,
    waterY: base + WATER,
    // Where you soak and which way you face (world), and where you climb out:
    // outside the gap, facing away. Set again once the ring's shape is known.
    seat: { x: 0, z: 0, dx: 1, dz: 0 },
    exit: null,
    // The way in, once the ring is in: `shore`, `stone` and `water` (world, each
    // on the ground there), and the way they go (dx, dz).
    way: null,
    fall: null, // where the stream lands (world), once it's in
    // The top of the rocks or the pool floor under (x, z) (world), once the
    // ring is in; null off it.
    floorAt: () => null,
    // Close enough to the ring to get in.
    near(px, pz) {
      return Math.hypot(px - x, pz - z) < RING * 0.5 + 1.8;
    },
    // A puff of steam round `at` (a rider's feet, world, followed while they
    // slide in or out), thick by PUFF_COVER s.
    puff(at) {
      puffAt = at;
      puffAge = 0;
      puff.visible = true;
    },
    update(dt, time, soaker) {
      uniforms.uTime.value = time;
      const k = 1 - Math.exp(-dt * 2);
      const S = uniforms.uSoak.value;
      if (soaker) S.set(soaker.x, soaker.z, S.z + (1 - S.z) * k);
      else S.z -= S.z * k;
      if (puff.visible) {
        if (puffAge < PUFF_FOLLOW) group.worldToLocal(puff.material.uniforms.uOrigin.value.copy(puffAt).add(PUFF_LIFT));
        puffAge += dt;
        puff.material.uniforms.uAge.value = puffAge;
        puff.visible = puffAge < PUFF_LIFE;
      }
    },
    ready: null,
  };
  const exit = toWorld(0, RING * 0.5 + 1.3), out = along(0, 1);
  onsen.exit = { x: exit.x, z: exit.z, dx: out.x, dz: out.z };
  setSeat(onsen, toWorld(-1.6, 0), along(1, 0));

  onsen.ready = Promise.all(['stone-arena', 'cave-rock'].map((n) => new GLTFLoader().loadAsync(`${DIR}${n}.glb`)))
    .then(([ring, rock]) => {
      const ringGeo = placed(ring, [RING, RING_TALL, RING]);
      group.add(rocky(ringGeo));

      // The cave rock, behind the rocks on the +x side, on its own lowest ground.
      const rockBase = ground(ROCK_AT.x + 0.6, ROCK_AT.z, 1.2) - 0.08 - base;
      const rockM = new THREE.Matrix4().compose(
        new THREE.Vector3(ROCK_AT.x, rockBase, ROCK_AT.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2),
        new THREE.Vector3(ROCK, ROCK, ROCK),
      );
      group.add(rocky(placed(rock, [1, 1, 1]).applyMatrix4(rockM)));

      // The water: out to where the rocks rise through it, tucked under them.
      const grid = heightGrid(ringGeo, RING / 2, 0.05);
      const edge = waterEdge(grid);
      const _p = new THREE.Vector3();
      onsen.floorAt = (wx, wz) => {
        group.worldToLocal(_p.set(wx, 0, wz));
        const y = grid.at(_p.x, _p.z);
        return y < 0 ? null : base + y;
      };
      const on = (lz, y) => toWorld(WAY.x, lz).setY(y);
      const shore = toWorld(WAY.x, WAY.shore), inward = along(0, -1);
      onsen.way = {
        shore: shore.setY(hf.heightAt(shore.x, shore.z)),
        stone: on(WAY.stone, base + grid.at(WAY.x, WAY.stone)),
        water: on(WAY.water, base + grid.at(WAY.x, WAY.water)),
        dx: inward.x,
        dz: inward.z,
      };
      const water = new THREE.Mesh(waterGeometry(edge), waterMaterial(uniforms));
      water.position.y = WATER;
      water.receiveShadow = true;
      group.add(water);
      // Sit back against the rocks on the far side from the spout.
      const back = edge.radius(Math.PI);
      setSeat(onsen, toWorld(edge.center.x - back + 0.55, edge.center.y), along(1, 0));

      // The stream: along the trough's bed and off its lip, falling into the pool.
      const bed = (tz) => new THREE.Vector3(TROUGH.x, TROUGH.y + 0.012, tz).applyMatrix4(rockM);
      const a = bed(TROUGH.from), lip = bed(TROUGH.lip);
      const dir = lip.clone().sub(a).setY(0).normalize();
      const pts = [a, a.clone().lerp(lip, 0.5), lip];
      const v0 = 1.1, drop = lip.y - (WATER - 0.15);
      const T = Math.sqrt((2 * drop) / 9.81);
      for (let i = 1; i <= 6; i++) {
        const t = (i / 6) * T;
        pts.push(lip.clone().addScaledVector(dir, v0 * t).add(new THREE.Vector3(0, -4.905 * t * t, 0)));
      }
      const fall = pts[pts.length - 1];
      const fallW = fall.clone().applyMatrix4(group.matrixWorld);
      uniforms.uFall.value.set(fallW.x, fallW.z);
      onsen.fall = fallW;
      const stream = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 48, 0.1, 8, false),
        streamMaterial(uniforms),
      );
      stream.castShadow = true;
      group.add(stream);

      // Steam off the whole surface, thicker where the stream lands, and a
      // thin column over the trees that gives the spring away from afar.
      const steam = createSteam(edge, new THREE.Vector2(fall.x, fall.z), uniforms, group);
      group.add(steam);
    });
  return onsen;
}

function setSeat(onsen, at, dir) {
  onsen.seat = { x: at.x, z: at.z, dx: dir.x, dz: dir.z };
}

// One mesh's geometry from a Tripo GLB, on the ground, centred, scaled to `size`.
function placed(gltf, size) {
  let src = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(...size);
  geo.userData.map = src.material.map;
  geo.userData.side = src.material.side;
  return geo;
}

function rocky(geo) {
  const m = new THREE.Mesh(geo, makeToon({ map: geo.userData.map, side: geo.userData.side }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// The highest surface over a grid of `cell`-metre squares, `half` either side
// of the middle: each triangle's top over the squares it covers.
function heightGrid(geo, half, cell) {
  const n = Math.ceil((2 * half) / cell);
  const h = new Float32Array(n * n).fill(-1);
  const pos = geo.attributes.position, index = geo.index;
  const count = index ? index.count : pos.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const cellOf = (v) => Math.floor((v + half) / cell);
  const put = (i, j, y) => {
    if (i < 0 || j < 0 || i >= n || j >= n) return;
    const k = j * n + i;
    if (y > h[k]) h[k] = y;
  };
  for (let t = 0; t < count; t += 3) {
    a.fromBufferAttribute(pos, index ? index.getX(t) : t);
    b.fromBufferAttribute(pos, index ? index.getX(t + 1) : t + 1);
    c.fromBufferAttribute(pos, index ? index.getX(t + 2) : t + 2);
    for (const v of [a, b, c]) put(cellOf(v.x), cellOf(v.z), v.y); // steep faces cover no square's middle
    const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(det) < 1e-9) continue;
    const i0 = Math.max(0, cellOf(Math.min(a.x, b.x, c.x))), i1 = Math.min(n - 1, cellOf(Math.max(a.x, b.x, c.x)));
    const j0 = Math.max(0, cellOf(Math.min(a.z, b.z, c.z))), j1 = Math.min(n - 1, cellOf(Math.max(a.z, b.z, c.z)));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * cell - half, pz = (j + 0.5) * cell - half;
        const l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / det;
        const l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        put(i, j, l1 * a.y + l2 * b.y + l3 * c.y);
      }
  }
  return {
    at(x, z) {
      const i = cellOf(x), j = cellOf(z);
      return i < 0 || j < 0 || i >= n || j >= n ? -1 : h[j * n + i];
    },
  };
}

// The water's outline: from the middle of the low ground inside the ring, out
// each way to where the rocks first stand above the water, smoothed. `radius(a)`
// is that reach toward angle `a` (0 along +x, π/2 along +z).
const EDGE_STEPS = 96;
function waterEdge(grid) {
  const dry = (x, z) => grid.at(x, z) > WATER + 0.01;
  // The middle: the centroid of the wet ground within the ring.
  let sx = 0, sz = 0, n = 0;
  for (let x = -RING * 0.4; x <= RING * 0.4; x += 0.1)
    for (let z = -RING * 0.4; z <= RING * 0.4; z += 0.1)
      if (Math.hypot(x, z) < RING * 0.4 && !dry(x, z)) { sx += x; sz += z; n++; }
  const center = new THREE.Vector2(sx / n, sz / n);
  const maxR = RING * 0.38;
  const raw = [];
  for (let k = 0; k < EDGE_STEPS; k++) {
    const a = (k / EDGE_STEPS) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    let r = 0.3;
    while (r < maxR && !dry(center.x + cx * r, center.y + cz * r)) r += 0.03;
    raw.push(r);
  }
  // A median of five takes out the cracks between rocks, then a light blur.
  const wrap = (arr, k) => arr[(k + EDGE_STEPS) % EDGE_STEPS];
  const med = raw.map((_, k) => [-2, -1, 0, 1, 2].map((d) => wrap(raw, k + d)).sort((p, q) => p - q)[2]);
  const r = med.map((_, k) => (wrap(med, k - 1) + 2 * med[k] + wrap(med, k + 1)) / 4);
  return {
    center,
    r,
    radius(a) {
      const f = (THREE.MathUtils.euclideanModulo(a, Math.PI * 2) / (Math.PI * 2)) * EDGE_STEPS;
      const k = Math.floor(f);
      return THREE.MathUtils.lerp(wrap(r, k), wrap(r, k + 1), f - k);
    },
  };
}

// A disc out to the edge (and TUCK under the rocks), rings closer together
// toward the shore. `shore` is each point's distance in from the visible shore.
function waterGeometry(edge) {
  const RINGS = 14;
  const pos = [0, 0, 0], shore = [edge.r.reduce((s, v) => s + v, 0) / EDGE_STEPS], idx = [];
  pos[0] = edge.center.x;
  pos[2] = edge.center.y;
  for (let j = 1; j <= RINGS; j++) {
    const t = 1 - (1 - j / RINGS) ** 1.6;
    for (let k = 0; k < EDGE_STEPS; k++) {
      const a = (k / EDGE_STEPS) * Math.PI * 2, R = edge.r[k] + TUCK;
      pos.push(edge.center.x + Math.cos(a) * R * t, 0, edge.center.y + Math.sin(a) * R * t);
      shore.push((1 - t) * R - TUCK);
    }
  }
  const at = (j, k) => (j === 0 ? 0 : 1 + (j - 1) * EDGE_STEPS + (k % EDGE_STEPS));
  for (let k = 0; k < EDGE_STEPS; k++) idx.push(0, at(1, k + 1), at(1, k));
  for (let j = 1; j < RINGS; j++)
    for (let k = 0; k < EDGE_STEPS; k++) {
      const a = at(j, k), b = at(j, k + 1), c = at(j + 1, k), d = at(j + 1, k + 1);
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('shore', new THREE.Float32BufferAttribute(shore, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const NOISE = /* glsl */ `
float oHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float oNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(oHash(i), oHash(i + vec2(1, 0)), u.x), mix(oHash(i + vec2(0, 1)), oHash(i + vec2(1, 1)), u.x), u.y);
}
`;

// The water: the toon material's flat tones and shadows over a painted
// surface in three colours. Pale streaks drift away from where the stream
// lands and on toward the gap, sampled in two phases half a cycle apart and
// crossfaded so they never stretch out; rings spread from the landing and
// from a soaking rider; foam rims the shore.
function waterMaterial(uniforms) {
  const mat = makeToon({ color: '#ffffff' }, { hatch: 0 });
  const toon = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    toon(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shore;\nvarying float vShore;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShore = shore;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vShore;
        uniform float uTime;
        uniform vec2 uFall, uDrift;
        uniform vec3 uSoak, uDeep, uPale, uFoam;
        ${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vTWorld.xz;
          vec2 d = p - uFall;
          float r = length(d);
          vec2 flow = d / max(r, 0.6) * 0.45 + uDrift;
          float ph = uTime * 0.16;
          float t0 = fract(ph), t1 = fract(ph + 0.5);
          vec2 q0 = (p - flow * t0 * 2.5) * 1.1, q1 = (p - flow * t1 * 2.5) * 1.1 + 17.3;
          float n0 = oNoise(q0 + oNoise(q0 * 0.5) * 1.6), n1 = oNoise(q1 + oNoise(q1 * 0.5) * 1.6);
          float n = mix(n0, n1, abs(1.0 - 2.0 * t0));
          vec3 col = mix(uDeep, uPale, smoothstep(0.6, 0.63, n));
          float foam = smoothstep(0.8, 0.83, n) * (1.0 - smoothstep(0.6, 2.4, r));
          // Rings from the landing, and round a soaking rider.
          float ring = smoothstep(0.82, 0.88, fract(r * 1.5 - uTime * 0.8)) * (1.0 - smoothstep(0.3, 2.0, r));
          float rs = length(p - uSoak.xy);
          float ring2 = smoothstep(0.84, 0.9, fract(rs * 2.2 - uTime * 0.45)) * (1.0 - smoothstep(0.25, 1.1, rs)) * step(0.32, rs) * uSoak.z;
          col = mix(col, uPale, max(ring, ring2));
          // White water where the stream lands, and foam along the shore.
          float wob = oNoise(p * 4.0 + uTime * 1.7) - 0.5;
          float splash = 1.0 - smoothstep(0.22, 0.3, r + wob * 0.18);
          float shoreF = 1.0 - smoothstep(0.05, 0.09, vShore + (oNoise(p * 2.6 + uTime * 0.25) - 0.5) * 0.12);
          col = mix(col, uFoam, max(max(foam, splash), shoreF));
          diffuseColor.rgb = col;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'onsen-water';
  return mat;
}

// The stream off the spout: pale jade with white streaks racing along it.
function streamMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: uniforms.uTime,
      uPale: uniforms.uPale,
      uFoam: uniforms.uFoam,
      uLitTint: toonUniforms.uLitTint,
      uShadowTint: toonUniforms.uShadowTint,
    },
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uPale, uFoam, uLitTint, uShadowTint;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        float n = oNoise(vec2(vUv.x * 14.0 - uTime * 5.0, vUv.y * 6.0));
        vec3 col = mix(uPale, uFoam, smoothstep(0.55, 0.6, n));
        // White where it pours off the lip and churns into the pool.
        col = mix(col, uFoam, smoothstep(0.85, 0.95, vUv.x));
        gl_FragColor = vec4(col * mix(uShadowTint, uLitTint, 0.8), 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// Steam: puffs on quads that face the camera, risen, drifted and faded in the
// vertex shader from each puff's seed, so nothing moves on the CPU. Soft cel
// blobs with a ragged edge, a little bluer at the foot.
function createSteam(edge, fall, uniforms, group) {
  const puffs = [];
  const rnd = mulberry(20261020);
  const inPool = (f) => {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * edge.radius(a) * f;
    return [edge.center.x + Math.cos(a) * r, WATER, edge.center.y + Math.sin(a) * r];
  };
  // [origin, life (s), rise (m), size (m), opacity]
  for (let i = 0; i < 28; i++) puffs.push([inPool(0.85), 5 + rnd() * 3, 1.2 + rnd() * 0.8, 1 + rnd() * 0.8, 0.32]);
  for (let i = 0; i < 10; i++) puffs.push([[fall.x + (rnd() - 0.5) * 0.5, WATER, fall.y + (rnd() - 0.5) * 0.5], 3 + rnd() * 2, 1.6 + rnd(), 0.8 + rnd() * 0.6, 0.4]);
  // The column starts above head height, so it never fogs the pool itself.
  for (let i = 0; i < 12; i++) {
    const o = inPool(0.4);
    o[1] += 2.5 + rnd() * 2;
    puffs.push([o, 12 + rnd() * 6, 12 + rnd() * 4, 3 + rnd() * 2.5, 0.26]);
  }

  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const origin = [], corner = [], seed = [], shape = [], idx = [];
  puffs.forEach(([o, life, rise, size, alpha], i) => {
    const phase = rnd();
    for (const c of corners) {
      origin.push(...o);
      corner.push(...c);
      seed.push(phase, life, rise, size);
      shape.push(alpha, rnd() * 10);
    }
    const v = i * 4;
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  });
  const g = new THREE.BufferGeometry();
  // `position` carries the origin so three.js can bound it; no normals, so the
  // ink pass skips it.
  g.setAttribute('position', new THREE.Float32BufferAttribute(origin, 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 4));
  g.setAttribute('shape', new THREE.Float32BufferAttribute(shape, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 9, 0), 18);

  // The wind in the pool's frame.
  const wind = WIND.clone().applyQuaternion(group.quaternion.clone().invert());
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: uniforms.uTime, uWind: { value: wind }, uShadowTint: toonUniforms.uShadowTint },
    fog: true,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec2 corner;
      attribute vec4 seed; // phase, life (s), rise (m), size (m)
      attribute vec2 shape; // opacity, a random offset for the blob's outline
      uniform float uTime;
      uniform vec3 uWind;
      varying vec2 vCorner;
      varying float vAlpha, vKey, vLife;
      void main() {
        float life = fract(uTime / seed.y + seed.x);
        vec3 c = position;
        c.y += seed.z * (1.0 - (1.0 - life) * (1.0 - life)); // quick off the water, slowing as it goes
        c += uWind * life * seed.y;
        c.x += sin(uTime * 0.7 + shape.y) * 0.15 * life;
        float size = seed.w * (0.35 + 0.65 * sqrt(life));
        vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
        mvPosition.xy += corner * size * 0.5;
        gl_Position = projectionMatrix * mvPosition;
        vCorner = corner;
        // Puffs thin out close to the camera, so steam never whites out the view from the water.
        vAlpha = shape.x * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.45, 1.0, life)) * smoothstep(1.5, 5.0, -mvPosition.z);
        vKey = shape.y;
        vLife = life;
        #include <fog_vertex>
      }`,
    fragmentShader: STEAM_FRAGMENT,
  });
  const steam = new THREE.Mesh(g, mat);
  steam.name = 'Steam';
  steam.renderOrder = 2;
  return steam;
}

// A puff of steam round a rider changing as they get in or out: as the pool's
// steam, but thick, in at once, and gone in about a second. Its
// middle (`uOrigin`, the pool's frame) follows the rider for the first half
// second, while they slide in or out, and then lets them go.
export const PUFF_COVER = 0.15;
const PUFF_LIFE = 1.5, PUFF_FOLLOW = 0.5; // the last puff's delay and life, at most
const PUFF_LIFT = new THREE.Vector3(0, 0.55, 0); // the puff's foot above the rider's feet
function createPuff(group) {
  const rnd = mulberry(20261021);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const offset = [], corner = [], seed = [], key = [], idx = [];
  // From the knees to over the head of a rider standing by the pool (below the
  // surface, for one in it), and out past their hands.
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 0.2 + rnd() * 0.45;
    const o = [Math.cos(a) * r, -0.35 + rnd() * 1.4, Math.sin(a) * r];
    // [delay (s), life (s), rise (m), size (m)]: most at once, a few billowing after.
    const s = [i < 18 ? 0 : rnd() * 0.25, 0.8 + rnd() * 0.4, 0.4 + rnd() * 0.6, 1.3 + rnd() * 0.8];
    const k = rnd() * 10;
    for (const c of corners) {
      offset.push(...o);
      corner.push(...c);
      seed.push(...s);
      key.push(k);
    }
    const v = i * 4;
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  const g = new THREE.BufferGeometry();
  // `position` is each puff's offset from the middle; no normals, so the ink pass skips it.
  g.setAttribute('position', new THREE.Float32BufferAttribute(offset, 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 4));
  g.setAttribute('key', new THREE.Float32BufferAttribute(key, 1));
  g.setIndex(idx);

  const wind = WIND.clone().applyQuaternion(group.quaternion.clone().invert());
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uAge: { value: PUFF_LIFE },
      uOrigin: { value: new THREE.Vector3() },
      uWind: { value: wind },
      uShadowTint: toonUniforms.uShadowTint,
    },
    fog: true,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec2 corner;
      attribute vec4 seed; // delay (s), life (s), rise (m), size (m)
      attribute float key; // a random offset for the blob's outline
      uniform float uAge;
      uniform vec3 uOrigin, uWind;
      varying vec2 vCorner;
      varying float vAlpha, vKey, vLife;
      void main() {
        float t = uAge - seed.x;
        float life = clamp(t / seed.y, 0.0, 1.0);
        vec3 c = uOrigin + position * (1.0 + 0.5 * life); // spreading as it goes
        c.y += seed.z * (1.0 - (1.0 - life) * (1.0 - life));
        c += uWind * max(t, 0.0);
        float size = seed.w * (0.6 + 0.4 * sqrt(life));
        vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
        mvPosition.xy += corner * size * 0.5;
        gl_Position = projectionMatrix * mvPosition;
        vCorner = corner;
        // Full almost at once, so it hides the change, and thinning soon after;
        // thinner still near the camera, so it doesn't white out the view from the water.
        vAlpha = step(0.0, t) * smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.35, 1.0, life)) * smoothstep(1.0, 2.4, -mvPosition.z);
        vKey = key;
        vLife = life;
        #include <fog_vertex>
      }`,
    fragmentShader: STEAM_FRAGMENT,
  });
  const puff = new THREE.Mesh(g, mat);
  puff.name = 'Puff';
  puff.renderOrder = 2;
  puff.frustumCulled = false; // placed in the shader
  puff.visible = false;
  return puff;
}

// Steam's look, for both: a soft cel blob with a ragged edge, white with a
// shadowed rim, a little bluer at the foot.
const STEAM_FRAGMENT = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uShadowTint;
  varying vec2 vCorner;
  varying float vAlpha, vKey, vLife;
  ${NOISE}
  void main() {
    float d = length(vCorner) + (oNoise(vCorner * 2.2 + vKey) - 0.5) * 0.45;
    float body = 1.0 - smoothstep(0.62, 0.68, d);
    if (body * vAlpha < 0.01) discard;
    float core = 1.0 - smoothstep(0.32, 0.38, d + vCorner.y * 0.25);
    vec3 col = mix(mix(vec3(1.0), uShadowTint, 0.35), vec3(1.0), core);
    col = mix(col * mix(uShadowTint, vec3(1.0), 0.7), col, smoothstep(0.0, 0.4, vLife));
    gl_FragColor = vec4(col, body * vAlpha * (0.75 + 0.25 * core));
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
