// The editor's terrain: the heightfield as a grid of chunk meshes that can be
// re-heighted one chunk at a time, drawn as a working map rather than the
// game's toon look: elevation tint, hillshade, 25/100 m contours, the tile grid,
// deleted tiles striped red, the selection in amber.
import * as THREE from 'three';

const CHUNK = 100; // cells per chunk side

export class TerrainView {
  constructor(hf) {
    this.hf = hf;
    this.group = new THREE.Group();
    const n = hf.tiles;
    // Per-tile flags, read by the shader: 1 deleted, 2 selected.
    this.tileData = new Uint8Array(n * n);
    this.tileTex = new THREE.DataTexture(this.tileData, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    this.tileTex.magFilter = this.tileTex.minFilter = THREE.NearestFilter;
    this.uniforms = {
      uTiles: { value: this.tileTex },
      uGrid: { value: new THREE.Vector4(hf.x0, hf.z0, hf.tileSize, n) },
      uRect: { value: new THREE.Vector4(-1, -1, -2, -2) }, // tile range being hovered / dragged
      uRectColor: { value: new THREE.Color('#f0c24a') },
      uMinMax: { value: new THREE.Vector2(1200, 3000) },
    };
    this.material = makeMaterial(this.uniforms);
    this.chunks = [];
    const per = CHUNK, count = Math.ceil(hf.cells / per);
    for (let cj = 0; cj < count; cj++)
      for (let ci = 0; ci < count; ci++) {
        const i0 = ci * per, j0 = cj * per;
        const i1 = Math.min(hf.cells, i0 + per), j1 = Math.min(hf.cells, j0 + per);
        const mesh = new THREE.Mesh(chunkGeometry(i1 - i0 + 1, j1 - j0 + 1), this.material);
        mesh.userData = { i0, j0, i1, j1 };
        this.#fill(mesh);
        this.chunks.push(mesh);
        this.group.add(mesh);
      }
    this.syncHoles();
    this.#range();
  }

  #range() {
    let lo = Infinity, hi = -Infinity;
    for (const v of this.hf.h) { if (v < lo) lo = v; if (v > hi) hi = v; }
    this.uniforms.uMinMax.value.set(lo, hi);
  }

  // Positions and normals of a chunk straight from the heightfield, so normals
  // match across chunk edges.
  #fill(mesh, region) {
    const { hf } = this;
    const { i0, j0, i1, j1 } = mesh.userData;
    const w = i1 - i0 + 1;
    const pos = mesh.geometry.attributes.position.array, nrm = mesh.geometry.attributes.normal.array;
    const { h, verts, cells, step } = hf;
    const a0 = region ? Math.max(i0, region.i0 - 1) : i0, a1 = region ? Math.min(i1, region.i1 + 1) : i1;
    const b0 = region ? Math.max(j0, region.j0 - 1) : j0, b1 = region ? Math.min(j1, region.j1 + 1) : j1;
    for (let j = b0; j <= b1; j++)
      for (let i = a0; i <= a1; i++) {
        const k = ((j - j0) * w + (i - i0)) * 3, v = j * verts + i;
        pos[k] = hf.x0 + i * step;
        pos[k + 1] = h[v];
        pos[k + 2] = hf.z0 + j * step;
        const hl = h[j * verts + Math.max(0, i - 1)], hr = h[j * verts + Math.min(cells, i + 1)];
        const hu = h[Math.max(0, j - 1) * verts + i], hd = h[Math.min(cells, j + 1) * verts + i];
        const nx = hl - hr, ny = 2 * step, nz = hu - hd;
        const L = Math.hypot(nx, ny, nz);
        nrm[k] = nx / L; nrm[k + 1] = ny / L; nrm[k + 2] = nz / L;
      }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.normal.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }

  // Redraw the chunks a height edit touched ({ i0, j0, i1, j1 } in vertices).
  refresh(region) {
    for (const m of this.chunks) {
      const c = m.userData;
      if (c.i1 < region.i0 - 1 || c.i0 > region.i1 + 1 || c.j1 < region.j0 - 1 || c.j0 > region.j1 + 1) continue;
      this.#fill(m, region);
    }
  }

  syncHoles() {
    const { holes } = this.hf;
    for (let t = 0; t < holes.length; t++) this.tileData[t] = (this.tileData[t] & ~1) | holes[t];
    this.tileTex.needsUpdate = true;
  }

  setSelection(tiles) {
    for (let t = 0; t < this.tileData.length; t++) this.tileData[t] &= ~2;
    for (const t of tiles) this.tileData[t] |= 2;
    this.tileTex.needsUpdate = true;
  }

  // Outline a tile range (inclusive), e.g. the tile under the cursor or a box drag.
  setRect(r, color) {
    if (!r) this.uniforms.uRect.value.set(-1, -1, -2, -2);
    else this.uniforms.uRect.value.set(r.ti0, r.tj0, r.ti1, r.tj1);
    if (color) this.uniforms.uRectColor.value.set(color);
  }

  // Where a ray first meets the ground: march the heightfield, then bisect.
  raycast(ray) {
    const { hf } = this;
    const o = ray.origin, d = ray.direction;
    const p = new THREE.Vector3();
    let t = 0, prev = 0;
    // Start where the ray enters the map's vertical bounds.
    const top = this.uniforms.uMinMax.value.y + 50;
    if (o.y > top && d.y < 0) t = prev = (o.y - top) / -d.y;
    for (let n = 0; n < 4000 && t < 60000; n++) {
      p.copy(o).addScaledVector(d, t);
      if (!hf.inside(p.x, p.z) && n > 0 && t > 1000) {
        // Outside the map: keep going only if we're still heading toward it.
        const ahead = p.clone().addScaledVector(d, 50);
        if (Math.hypot(ahead.x - hf.center[0], ahead.z - hf.center[1]) > Math.hypot(p.x - hf.center[0], p.z - hf.center[1])) break;
      }
      const gap = p.y - hf.heightAt(p.x, p.z);
      if (gap <= 0 && hf.inside(p.x, p.z)) {
        let a = prev, b = t;
        for (let k = 0; k < 24; k++) {
          const m = (a + b) / 2;
          p.copy(o).addScaledVector(d, m);
          if (p.y > hf.heightAt(p.x, p.z)) a = m; else b = m;
        }
        p.copy(o).addScaledVector(d, b);
        p.y = hf.heightAt(p.x, p.z);
        return p;
      }
      prev = t;
      t += THREE.MathUtils.clamp(Math.abs(gap) * 0.5, 1, 40);
    }
    return null;
  }
}

function chunkGeometry(w, h) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(w * h * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(w * h * 3), 3));
  const idx = new Uint32Array((w - 1) * (h - 1) * 6);
  let t = 0;
  for (let j = 0; j < h - 1; j++)
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

function makeMaterial(uniforms) {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEdWorld;\nvarying vec3 vEdNormal;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvEdWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvEdNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vEdWorld;
        varying vec3 vEdNormal;
        uniform sampler2D uTiles;
        uniform vec4 uGrid; // x0, z0, tile size, tiles per side
        uniform vec4 uRect;
        uniform vec3 uRectColor;
        uniform vec2 uMinMax;
        // Anti-aliased line at every multiple of 'period' along value v.
        float isoLine(float v, float period, float width) {
          float f = abs(fract(v / period + 0.5) - 0.5) * period;
          return 1.0 - smoothstep(0.0, fwidth(v) * width, f);
        }`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec2 tileF = (vEdWorld.xz - uGrid.xy) / uGrid.z;
        vec2 tile = floor(tileF);
        float flags = floor(texture2D(uTiles, (tile + 0.5) / uGrid.w).r * 255.0 + 0.5);
        float hole = mod(flags, 2.0);
        float sel = mod(floor(flags / 2.0), 2.0);
        // Elevation: valley sage, through snow, to cool blue-white peaks.
        float e = clamp((vEdWorld.y - uMinMax.x) / max(1.0, uMinMax.y - uMinMax.x), 0.0, 1.0);
        vec3 col = mix(vec3(0.70, 0.78, 0.68), vec3(0.97, 0.96, 0.92), smoothstep(0.0, 0.45, e));
        col = mix(col, vec3(0.86, 0.92, 0.98), smoothstep(0.6, 1.0, e));
        // Steep ground goes rocky grey.
        float slope = 1.0 - normalize(vEdNormal).y;
        col = mix(col, vec3(0.62, 0.60, 0.57), smoothstep(0.22, 0.4, slope) * 0.7);
        // Contours: thin every 25 m, bolder every 100 m.
        col *= 1.0 - 0.18 * isoLine(vEdWorld.y, 25.0, 1.0) - 0.25 * isoLine(vEdWorld.y, 100.0, 1.4);
        // Tile grid, fading out as tiles get small on screen.
        float px = max(fwidth(tileF.x), fwidth(tileF.y));
        float gridA = 1.0 - smoothstep(0.04, 0.12, px);
        vec2 g = abs(fract(tileF + 0.5) - 0.5) / max(fwidth(tileF), vec2(1e-5));
        col = mix(col, vec3(0.14, 0.19, 0.23), (1.0 - smoothstep(0.0, 1.2, min(g.x, g.y))) * 0.35 * gridA);
        // Deleted: dark red with diagonal stripes.
        if (hole > 0.5) {
          float stripe = step(0.5, fract((tileF.x + tileF.y) * 4.0));
          col = mix(vec3(0.55, 0.16, 0.14), vec3(0.32, 0.08, 0.08), stripe);
        }
        if (sel > 0.5) col = mix(col, vec3(0.94, 0.76, 0.29), 0.45);
        // Hover / drag rectangle: tinted, with a bright rim.
        if (tile.x >= uRect.x && tile.y >= uRect.y && tile.x <= uRect.z && tile.y <= uRect.w) {
          vec2 lo = (tileF - uRect.xy) / max(fwidth(tileF), vec2(1e-5));
          vec2 hi = (uRect.zw + 1.0 - tileF) / max(fwidth(tileF), vec2(1e-5));
          float rim = 1.0 - smoothstep(1.0, 2.5, min(min(lo.x, lo.y), min(hi.x, hi.y)));
          col = mix(col, uRectColor, 0.25 + 0.75 * rim);
        }
        vec4 diffuseColor = vec4(col, opacity);`,
      );
  };
  return mat;
}
