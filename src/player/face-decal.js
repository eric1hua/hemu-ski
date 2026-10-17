// A painted face (small smile + blush) projected onto a generated character
// mesh. Tripo's low-poly bake drops tiny features like the mouth, and with the
// goggles down the face reads blank, so the face is drawn here instead: a
// canvas texture we can restyle for free, in the same style as the face in
// rider.js. The decal hugs the faceted surface (DecalGeometry) and is parented
// to the mesh, so it follows any transform the mesh gets.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { makeToon } from '../render/toon.js';

// Placement is relative to the mesh's own bounding box so it survives scaling:
// `height` is the decal centre as a fraction of the box height (0 = feet),
// `width` the decal width as a fraction of the box height. The face is assumed
// to look down +Z, as Tripo exports do.
export const FACE_DEFAULTS = {
  height: 0.745,
  width: 0.15,
  smile: true,
  blush: true,
  smileColor: '#7a3e34',
  blushColor: 'rgba(240,150,140,0.55)',
};

const ASPECT = 0.5; // canvas and decal box are twice as wide as tall

function paint(o) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  if (o.blush) {
    g.fillStyle = o.blushColor;
    for (const x of [58, 198]) { g.beginPath(); g.ellipse(x, 52, 26, 13, 0, 0, Math.PI * 2); g.fill(); }
  }
  if (o.smile) {
    g.strokeStyle = o.smileColor;
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(128, 58, 16, 0.25 * Math.PI, 0.75 * Math.PI);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class FaceDecal {
  constructor(target, opts = {}) {
    this.target = target;
    this.opts = { ...FACE_DEFAULTS, ...opts };
    this.mesh = null;
    this.build();
  }

  set(opts) {
    Object.assign(this.opts, opts);
    this.build();
  }

  build() {
    this.clear();
    const o = this.opts;
    const target = this.target;
    target.updateWorldMatrix(true, false);
    if (!target.geometry.boundingBox) target.geometry.computeBoundingBox();
    const box = target.geometry.boundingBox;
    const h = box.max.y - box.min.y;

    // Find the face surface by shooting a ray at the front of the mesh.
    const local = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + h * o.height, box.max.z + h);
    const origin = local.clone().applyMatrix4(target.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).transformDirection(target.matrixWorld);
    const hit = new THREE.Raycaster(origin, dir).intersectObject(target, false)[0];
    if (!hit) return;

    // DecalGeometry works in world space; size/orientation follow the mesh.
    const scale = new THREE.Vector3().setFromMatrixScale(target.matrixWorld);
    const w = h * o.width * scale.y;
    const size = new THREE.Vector3(w, w * ASPECT, w * 0.6);
    const orient = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(target.matrixWorld));
    const geo = new DecalGeometry(target, hit.point, orient, size);
    geo.applyMatrix4(target.matrixWorld.clone().invert());

    const mat = makeToon(
      { map: paint(o), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 },
      { rim: 1, hatch: 0 },
    );
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'FaceDecal';
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    target.add(this.mesh);
  }

  clear() {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.map.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
  }
}
