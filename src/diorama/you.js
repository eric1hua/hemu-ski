// "You" on the table: a map pin where you are in the game, standing on an arrow
// painted on the snow the way you're heading, with a paper tag over it. The
// game passes where you are (destinations.js has the format). The pin keeps
// about the same size on screen at any zoom and is drawn over the table (a
// station or a ridge can't hide it), so it can be found from anywhere; it's
// hovered and picked like a lodge or a station.
import * as THREE from 'three';
import { makeToon, toonUniforms } from '../render/toon.js';

const H = 60; // the head's height over the snow, in metres, seen from FAR away
const R = 16; // its radius
const FAR = 2500; // the pin is scaled to keep its size on screen, down to MIN of that
const MIN = 0.35;
const EDGE = 40; // a spot off the table is shown this far inside its edge

export class YouMarker {
  // `offset` is the block's centre in game metres; `tag` the HTML label;
  // `sunDir` lights the pin like the table.
  constructor(hf, offset, tag, sunDir) {
    Object.assign(this, { hf, offset, tag });
    this.group = new THREE.Group(); // the arrow, in the table's scene
    this.group.visible = false;
    this.item = { kind: 'you', x: 0, y: 0, z: 0, ring: 42, top: new THREE.Vector3(), bearing: 0, lift: null, outside: false };
    this.reach = R;
    this.normal = new THREE.Vector3(0, 1, 0);

    const yellow = makeToon({ color: '#f0c24a' }, { hatch: 0 });
    const flat = (color, order) => makeToon({ color, polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -4 - order * 2 }, { hatch: 0 });
    // The pin has a scene of its own, drawn after the ink pass (drawOver), so it
    // carries its own outline: an ink shell a little bigger, seen from inside.
    const ink = new THREE.MeshBasicMaterial({ color: '#23303a', side: THREE.BackSide });
    const O = R * 0.14;
    const cone = (r) => new THREE.ConeGeometry(r, H, 24, 1, true).rotateX(Math.PI).translate(0, H / 2, 0);
    this.pin = new THREE.Group();
    const stem = new THREE.Mesh(cone(R * 0.7), yellow);
    const stemLine = new THREE.Mesh(cone(R * 0.7 + O).translate(0, -O * 1.5, 0), ink);
    // The head turns to face the camera, so its white spot is always in view.
    this.head = new THREE.Group();
    this.head.position.y = H;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(R * 0.42, 24), makeToon({ color: '#fbfaf5' }, { hatch: 0 }));
    dot.position.z = R * 1.01;
    this.head.add(
      new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), yellow),
      new THREE.Mesh(new THREE.SphereGeometry(R + O, 32, 16), ink),
      dot,
    );
    this.pin.add(stem, stemLine, this.head);
    this.pin.visible = false;
    const sun = new THREE.DirectionalLight('#ffffff', toonUniforms.uSunIntensity.value);
    sun.position.copy(sunDir);
    this.overlay = new THREE.Scene();
    this.overlay.add(this.pin, sun, sun.target);

    // The mini-map's arrow, on the snow: yellow over an ink casing.
    const shape = new THREE.Shape([[0, 11], [7, -8], [0, -4], [-7, -8]].map(([x, y]) => new THREE.Vector2(x, y)));
    const arrowGeo = new THREE.ShapeGeometry(shape).scale(R * 0.22, R * 0.22, 1).rotateX(-Math.PI / 2);
    this.arrow = new THREE.Group();
    const casing = new THREE.Mesh(arrowGeo, flat('#23303a', 0));
    casing.scale.setScalar(1.3);
    const fill = new THREE.Mesh(arrowGeo, flat('#f0c24a', 1));
    fill.position.y = 0.5;
    this.heading = new THREE.Group();
    this.heading.add(casing, fill);
    this.arrow.add(this.heading);
    this.group.add(this.arrow);
  }

  get shown() { return this.group.visible; }

  // `w` is { x, z, bearing, lift } in game metres (destinations.js), or null to hide.
  set(w) {
    this.group.visible = this.pin.visible = !!w;
    this.tag.classList.toggle('hidden', !w);
    if (!w) return;
    const { hf, item } = this;
    const lim = hf.half - EDGE;
    const x = w.x - this.offset.x, z = w.z - this.offset.z;
    item.outside = Math.abs(x) > lim || Math.abs(z) > lim;
    item.x = THREE.MathUtils.clamp(x, -lim, lim);
    item.z = THREE.MathUtils.clamp(z, -lim, lim);
    item.y = hf.heightAt(item.x, item.z);
    item.bearing = w.bearing;
    item.lift = w.lift;
    this.group.position.set(item.x, item.y, item.z);
    // Lie the arrow on the slope, turned to the bearing (clockwise from north, -z).
    hf.normalAt(item.x, item.z, this.normal);
    this.arrow.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.normal);
    this.heading.rotation.y = -THREE.MathUtils.degToRad(w.bearing);
  }

  update(camera, time, w, h) {
    if (!this.group.visible) return;
    const s = Math.max(MIN, camera.position.distanceTo(this.group.position) / FAR);
    const bob = (Math.sin(time * 2.4) * 0.5 + 0.5) * 6;
    this.pin.scale.setScalar(s);
    this.pin.position.copy(this.group.position);
    this.pin.position.y += bob * s;
    this.arrow.scale.setScalar(s);
    this.arrow.position.copy(this.normal).multiplyScalar(2 * s); // just off the snow
    this.head.quaternion.copy(camera.quaternion);
    // Picked anywhere on the pin, head to point: round its middle.
    this.item.top.set(this.item.x, this.item.y + (H / 2 + bob) * s, this.item.z);
    this.reach = (H / 2 + R) * s;

    // The tag sits over the head.
    const p = this.item.top.clone().setY(this.item.y + (H + bob + R * 1.3) * s).project(camera);
    const on = p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
    this.tag.classList.toggle('hidden', !on);
    if (on) this.tag.style.transform = `translate(${((p.x + 1) * w) / 2}px, ${((1 - p.y) * h) / 2}px) translate(-50%, -100%)`;
  }

  // After the table is drawn: the pin, over everything on it.
  drawOver(renderer, camera) {
    if (!this.pin.visible) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.overlay, camera);
    renderer.autoClear = true;
  }
}
