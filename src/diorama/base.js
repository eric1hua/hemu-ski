// The tabletop part of the diorama: the cut-away earth under the snow, a
// stepped walnut plinth with a brass name plaque, and a soft contact shadow.
import * as THREE from 'three';
import { makeToon } from '../render/toon.js';

const CRUST = 14; // snowpack shown in cross-section, m

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Earth strata, bedrock at the bottom (v = 0) up to soil under the snow (v = 1).
// Band edges wave with whole-number frequencies so the texture tiles in u.
export function strataTexture() {
  const bands = [
    [0.0, '#5d6264'], [0.16, '#6f7472'], [0.3, '#7d6a5a'], [0.44, '#8f7a63'],
    [0.56, '#a48a6c'], [0.68, '#8c735d'], [0.8, '#a79680'], [0.9, '#7f6a58'],
  ];
  const t = canvasTexture(512, 1024, (g, w, h) => {
    bands.forEach(([v0, col], i) => {
      const v1 = i + 1 < bands.length ? bands[i + 1][0] : 1.01;
      g.fillStyle = col;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const wob = Math.sin((x / w) * Math.PI * 2 * (2 + i)) * 0.012 + Math.sin((x / w) * Math.PI * 2 * 5 + i) * 0.006;
        g[x ? 'lineTo' : 'moveTo'](x, h - (v0 + (i ? wob : -0.1)) * h);
      }
      for (let x = w; x >= 0; x -= 8) {
        const wob = Math.sin((x / w) * Math.PI * 2 * (3 + i)) * 0.012 + Math.sin((x / w) * Math.PI * 2 * 4 + i) * 0.006;
        g.lineTo(x, h - (v1 + wob) * h);
      }
      g.fill();
    });
    // Pebbles and cracks for scale.
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h;
      g.fillStyle = rnd() > 0.5 ? 'rgba(40,46,52,0.35)' : 'rgba(250,245,235,0.25)';
      g.beginPath();
      g.ellipse(x, y, 2 + rnd() * 6, 1.5 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function woodTexture() {
  const t = canvasTexture(1024, 128, (g, w, h) => {
    g.fillStyle = '#7a5640';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const y = (i / 46) * h;
      g.strokeStyle = i % 3 ? 'rgba(60,38,26,0.25)' : 'rgba(150,110,80,0.25)';
      g.lineWidth = 1 + (i % 4);
      g.beginPath();
      for (let x = 0; x <= w; x += 16) g[x ? 'lineTo' : 'moveTo'](x, y + Math.sin(x * 0.006 + i) * 4 + Math.sin(x * 0.031 + i * 2) * 1.5);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function plaqueTexture(title, subtitle) {
  return canvasTexture(2048, 160, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#e7c873');
    grad.addColorStop(1, '#c9a24f');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6d5124';
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#3b2c14';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 70px "Patrick Hand SC", "PingFang SC", sans-serif';
    g.fillText(title, w / 2, 62);
    g.font = '38px "Patrick Hand SC", "PingFang SC", sans-serif';
    g.fillText(subtitle, w / 2, 118);
  });
}

function compassTexture() {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#d8b863';
    g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6d5124'; g.lineWidth = 6;
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#3b2c14';
    g.beginPath(); g.moveTo(128, 34); g.lineTo(156, 140); g.lineTo(128, 124); g.lineTo(100, 140); g.closePath(); g.fill();
    g.font = '700 54px "Patrick Hand SC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', 128, 186);
  });
}

// One vertical wall strip under an edge of the heightfield. `ks` lists the
// edge vertex indices in order; `outward` is the face direction.
export function wallStrip(hf, ks, outward, yTop, yBot, uvTop) {
  const pos = [], uv = [], idx = [];
  const { verts, size, cells, x0, z0 } = hf;
  let along = 0, prev = null;
  ks.forEach((k, n) => {
    const x = x0 + ((k % verts) / cells) * size, z = z0 + (Math.floor(k / verts) / cells) * size;
    if (prev) along += Math.hypot(x - prev[0], z - prev[1]);
    prev = [x, z];
    const top = yTop(hf.h[k]), bot = yBot(hf.h[k]);
    pos.push(x, top, z, x, bot, z);
    uv.push(along / 1600, uvTop(top), along / 1600, uvTop(bot));
    if (n) {
      const a = n * 2;
      idx.push(a - 2, a - 1, a, a, a - 1, a + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // Make sure the triangles face outward.
  g.computeVertexNormals();
  const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 0);
  if (n0.dot(outward) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  return g;
}

export function createBase(hf, { baseY, top, title, subtitle }) {
  const group = new THREE.Group();
  const v = hf.verts;
  const edges = [
    { ks: [...Array(v).keys()], out: new THREE.Vector3(0, 0, -1) }, // north
    { ks: [...Array(v).keys()].map((i) => (v - 1) * v + i), out: new THREE.Vector3(0, 0, 1) }, // south
    { ks: [...Array(v).keys()].map((j) => j * v), out: new THREE.Vector3(-1, 0, 0) }, // west
    { ks: [...Array(v).keys()].map((j) => j * v + v - 1), out: new THREE.Vector3(1, 0, 0) }, // east
  ];
  const earth = makeToon({ map: strataTexture() }, { hatch: 1 });
  const snow = makeToon({ color: '#f4f6f1' }, { hatch: 1 });
  const vOf = (y) => (y - baseY) / (top - baseY);
  for (const e of edges) {
    const crust = new THREE.Mesh(wallStrip(hf, e.ks, e.out, (h) => h + 0.5, (h) => h - CRUST, vOf), snow);
    const wall = new THREE.Mesh(wallStrip(hf, e.ks, e.out, (h) => h - CRUST, () => baseY, vOf), earth);
    wall.receiveShadow = crust.receiveShadow = true;
    group.add(crust, wall);
  }

  // Two-step walnut plinth.
  const wood = woodTexture();
  const plinthMat = makeToon({ map: wood, color: '#b89a86' }, { hatch: 1 });
  const S = hf.size, [cx, cz] = hf.center;
  const steps = [
    { w: S + 260, h: 170, y: baseY },
    { w: S + 520, h: 120, y: baseY - 170 },
  ];
  for (const st of steps) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.w), plinthMat);
    box.position.set(cx, st.y - st.h / 2, cz);
    box.receiveShadow = true;
    box.castShadow = true;
    group.add(box);
  }
  // Brass name plaque on the front of the top step, compass on the ledge.
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 150),
    makeToon({ map: plaqueTexture(title, subtitle) }, { hatch: 0 }),
  );
  plaque.position.set(cx, baseY - 85, cz + (S + 260) / 2 + 1.5);
  group.add(plaque);

  const compass = new THREE.Mesh(new THREE.CircleGeometry(95, 40), makeToon({ map: compassTexture() }, { hatch: 0 }));
  compass.rotation.x = -Math.PI / 2;
  compass.position.set(cx + S / 2 + 65, baseY + 1.5, cz + S / 2 + 65);
  compass.scale.setScalar(0.55);
  group.add(compass);

  // Soft contact shadow on the "table".
  const shadowTex = canvasTexture(256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    r.addColorStop(0, 'rgba(20,50,55,0.38)');
    r.addColorStop(0.55, 'rgba(20,50,55,0.18)');
    r.addColorStop(1, 'rgba(20,50,55,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  });
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 2.1, S * 2.1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(cx, baseY - 290 - 2, cz);
  shadow.renderOrder = -1;
  group.add(shadow);

  return { group, shadow, floorY: baseY - 290 };
}
