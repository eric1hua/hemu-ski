// The player, built after the character turnaround sheet in
// refs/player-turnaround.webp: chibi proportions, brown messy hair, slouchy
// cream beanie with goggles pushed up, cream jacket with a navy hem and cuffs,
// chest harness with a yellow badge and pouch, black backpack with orange
// pulls, cream/navy pants with zip piping, black boots with orange straps.
// Built from primitives so it matches the flat cel-shaded world.
import * as THREE from 'three';
import { makeToon } from '../render/toon.js';

const P = {
  cream: '#efe9dc',
  navy: '#1e2536',
  black: '#1c1d21',
  skin: '#f6dcc6',
  hair: '#5b3b28',
  hairDark: '#452d1f',
  lens: '#3d4a5c',
  lensGlint: '#d9553a',
  yellow: '#f2c83a',
  orange: '#ff5a1f',
  board: '#ee4f2c',
  boardBase: '#c63b22',
  piping: '#f7f5ee',
  patch: '#b9b4aa',
};
const M = Object.fromEntries(
  Object.entries(P).map(([k, c]) => [k, makeToon({ color: c }, { rim: 1, hatch: 0 })]),
);

// Face painted into an equirectangular texture: front of the sphere is u=0.25.
function faceTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = P.skin;
  g.fillRect(0, 0, 512, 256);
  const cx = 128;
  g.fillStyle = 'rgba(240,150,140,0.55)'; // blush
  for (const dx of [-40, 40]) { g.beginPath(); g.ellipse(cx + dx, 150, 13, 7, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#16171a'; // dot eyes
  for (const dx of [-25, 25]) { g.beginPath(); g.ellipse(cx + dx, 132, 6.5, 10, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#5a3a2a'; // brows
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (const dx of [-25, 25]) { g.beginPath(); g.moveTo(cx + dx - 8, 112); g.lineTo(cx + dx + 8, 110); g.stroke(); }
  g.strokeStyle = '#7a3e34'; // small smile
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, 152, 7, 0.25 * Math.PI, 0.75 * Math.PI);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function backpackTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = P.black;
  g.fillRect(0, 0, 128, 256);
  g.save();
  g.translate(78, 128);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#e9e6de';
  g.font = '600 30px "Patrick Hand SC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('SALONION', 0, 0);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const UP = new THREE.Vector3(0, 1, 0);

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// A unit-height limb segment placed between two points each frame.
class Limb {
  constructor(parent, r0, r1, mat, { top, pipe } = {}) {
    this.mesh = mesh(new THREE.CylinderGeometry(r1, r0, 1, 8).translate(0, 0.5, 0), mat, parent);
    // Optional second color over the front of the upper part (the cream hip panel).
    if (top) mesh(new THREE.CylinderGeometry(r1 * 1.07, r1 * 1.04, top.len, 10, 1, false, -1.9, 3.8).translate(0, 1 - top.len / 2, 0), top.mat, this.mesh);
    // Optional zip piping down the outside of the leg.
    if (pipe) mesh(new THREE.BoxGeometry(0.018, 0.9, 0.02).translate(0, 0.5, 0), pipe.mat, this.mesh, pipe.side * r1 * 1.02, 0, 0);
  }
  set(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
    this.mesh.scale.set(1, len, 1);
  }
}

function boardGeometry() {
  const L = 1.56, W = 0.27, flat = 0.52;
  const g = new THREE.BoxGeometry(W, 0.025, L, 6, 1, 40);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const over = Math.max(0, Math.abs(z) - flat);
    const u = over / (L / 2 - flat); // 0 at contact point … 1 at tip
    // Slight sidecut waist, rounded tips, kicked nose and tail.
    const width = (1 - 0.06 * Math.cos((z / L) * Math.PI) ** 2) * Math.sqrt(Math.max(0.05, 1 - u ** 4));
    pos.setX(i, pos.getX(i) * width);
    pos.setY(i, pos.getY(i) + over * over * 1.1);
  }
  g.computeVertexNormals();
  return g;
}

export class Rider {
  // `model: true` swaps the primitive body for the rigged Tripo character once
  // public/models/player.glb has loaded; the primitive one stays as the fallback.
  constructor({ model = false } = {}) {
    this.root = new THREE.Group(); // at board, oriented to slope; -z = travel
    this.edge = new THREE.Group(); // rolls onto toe/heel edge
    this.root.add(this.edge);

    this.proceduralBoard = new THREE.Group();
    this.edge.add(this.proceduralBoard);
    this.board = mesh(boardGeometry(), M.board, this.proceduralBoard, 0, 0.0, 0);
    this.board.receiveShadow = true;
    const base = mesh(new THREE.BoxGeometry(0.24, 0.006, 1.0), M.boardBase, this.proceduralBoard, 0, -0.002, 0);
    base.castShadow = false;

    // The character faces +z in its own frame; turned 90° so the chest faces
    // the toe side, left foot toward the nose (regular stance).
    this.body = new THREE.Group();
    this.body.rotation.y = Math.PI / 2;
    this.edge.add(this.body);
    this.classic = new THREE.Group(); // the primitive character, minus the bindings
    this.body.add(this.classic);
    this.bindings = [];
    this.boots = []; // primitive boots and straps, hidden when the model boots stand in them
    this.#buildCharacter();

    this.pose = { crouch: 0.4, lean: 0, twist: 0, armSwing: 0, air: 0, tumble: 0 };
    this.t = 0;
    this.model = null;
    this.modelId = 'classic';
    this.locomotion = 'ride';
    this.models = new Map();
    this.selection = 0;
    if (model) this.selectModel(model === true ? 'male' : model).catch((err) => console.warn('Rider model unavailable.', err));
  }

  async selectModel(id) {
    const selection = ++this.selection;
    let model = null;
    if (id !== 'classic') {
      if (!this.models.has(id)) {
        this.models.set(id, import('./rider-model.js')
          .then(async ({ loadRiderModel, RiderModel }) => new RiderModel(await loadRiderModel(id), id))
          .catch((err) => { this.models.delete(id); throw err; }));
      }
      model = await this.models.get(id);
      if (id === 'female' && !this.boardAssembly) {
        this.boardLoading ||= import('./rider-board.js').then(({ loadBoardAssembly }) => loadBoardAssembly(this))
          .catch((err) => { this.boardLoading = null; throw err; });
        this.boardAssembly = await this.boardLoading;
      }
    }
    if (selection !== this.selection) return false;
    this.setLocomotion('ride');
    if (this.model) this.body.remove(this.model.root);
    this.model = model;
    this.modelId = id;
    if (model) this.body.add(model.root);
    this.classic.visible = !model;
    for (const m of this.boots) m.visible = !model;
    this.#gearVisibility();
    return true;
  }

  setLocomotion(mode) {
    if (mode === 'walk' && !this.model?.canWalk) return false;
    this.locomotion = mode;
    this.#gearVisibility();
    return true;
  }

  #gearVisibility() {
    const riding = this.locomotion === 'ride';
    this.proceduralBoard.visible = riding && this.modelId !== 'female';
    if (this.boardAssembly) this.boardAssembly.visible = riding && this.modelId === 'female';
    for (const binding of this.bindings) binding.visible = riding && this.modelId !== 'female';
    for (const boot of this.boots) boot.visible = !this.model && riding;
  }

  #buildCharacter() {
    const b = this.body;
    // Feet (character x = along the board). Stance ~0.52 m. Chunky boots with
    // orange straps, sitting in orange bindings.
    this.feet = [0.26, -0.26].map((x) => {
      const foot = new THREE.Group();
      foot.position.set(x, 0.025, 0);
      b.add(foot);
      this.boots.push(
        mesh(new THREE.BoxGeometry(0.17, 0.16, 0.33), M.black, foot, 0, 0.09, 0.02), // boot
        mesh(new THREE.BoxGeometry(0.19, 0.05, 0.12), M.orange, foot, 0, 0.15, 0.05), // ankle strap
        mesh(new THREE.BoxGeometry(0.19, 0.04, 0.07), M.orange, foot, 0, 0.12, 0.15), // toe strap
      );
      this.bindings.push(mesh(new THREE.BoxGeometry(0.18, 0.035, 0.35), M.orange, foot, 0, 0.015, 0.02)); // sole
      this.bindings.push(mesh(new THREE.BoxGeometry(0.18, 0.26, 0.05), M.orange, foot, 0, 0.17, -0.16)); // highback
      return foot;
    });

    // Baggy pants: navy with the cream upper panel and white zip piping.
    const c = this.classic;
    this.thighs = [1, -1].map((side) => new Limb(c, 0.135, 0.15, M.navy, { top: { len: 0.55, mat: M.cream }, pipe: { side, mat: M.piping } }));
    this.shins = [1, -1].map((side) => new Limb(c, 0.135, 0.14, M.navy, { pipe: { side, mat: M.piping } }));
    this.cuffs = [0, 1].map(() => mesh(new THREE.CylinderGeometry(0.145, 0.14, 0.08, 9), M.black, c));
    this.knees = [0, 1].map(() => mesh(new THREE.SphereGeometry(0.14, 9, 7), M.navy, c));

    this.hips = new THREE.Group();
    c.add(this.hips);
    mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1.25, 0.75, 0.95), M.navy, this.hips);
    mesh(new THREE.SphereGeometry(0.205, 12, 8, Math.PI / 2 - 1.2, 2.4, 0.5, 1.6).scale(1.25, 0.75, 0.95), M.cream, this.hips); // front panel

    // Jacket: puffy cream top, wide navy hem with a white zip through it.
    this.torso = new THREE.Group();
    this.torso.position.y = 0.04;
    this.hips.add(this.torso);
    const t = this.torso;
    mesh(new THREE.CylinderGeometry(0.245, 0.26, 0.2, 12), M.navy, t, 0, 0.1, 0);
    mesh(new THREE.CapsuleGeometry(0.225, 0.08, 4, 12), M.cream, t, 0, 0.3, 0).scale.set(1.08, 1, 0.95);
    mesh(new THREE.BoxGeometry(0.014, 0.19, 0.02), M.piping, t, 0.0, 0.1, 0.258); // zip on hem
    mesh(new THREE.BoxGeometry(0.012, 0.3, 0.02), M.navy, t, 0.0, 0.36, 0.215); // centre zip
    // Hood bunched at the collar.
    mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.11, 12), M.cream, t, 0, 0.55, 0);
    mesh(new THREE.SphereGeometry(0.15, 10, 8).scale(1.2, 0.75, 0.8), M.cream, t, 0, 0.55, -0.11);
    // Chest harness: shoulder straps, sternum strap, yellow badge, pouch.
    for (const sx of [-0.13, 0.13]) {
      const st = mesh(new THREE.BoxGeometry(0.032, 0.24, 0.02), M.black, t, sx, 0.42, 0.2);
      st.rotation.x = -0.35; // runs back over the shoulder
    }
    mesh(new THREE.BoxGeometry(0.28, 0.025, 0.02), M.black, t, 0, 0.37, 0.222);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 14), M.yellow, t, -0.12, 0.44, 0.22).rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.09, 0.13, 0.05), M.black, t, 0.12, 0.31, 0.235);
    mesh(new THREE.BoxGeometry(0.02, 0.07, 0.01), M.orange, t, 0.12, 0.31, 0.262);
    // Backpack with orange zip pulls and the side logo.
    mesh(new THREE.BoxGeometry(0.38, 0.46, 0.17), M.black, t, 0, 0.31, -0.27);
    mesh(new THREE.BoxGeometry(0.4, 0.1, 0.19), M.black, t, 0, 0.53, -0.27); // top flap
    for (const sx of [-0.195, 0.195]) {
      mesh(new THREE.BoxGeometry(0.02, 0.07, 0.03), M.orange, t, sx, 0.42, -0.22);
      mesh(new THREE.BoxGeometry(0.02, 0.06, 0.03), M.orange, t, sx, 0.18, -0.22);
    }
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.34), new THREE.MeshBasicMaterial({ map: backpackTexture() }));
    logo.position.set(0, 0.29, -0.357);
    logo.rotation.y = Math.PI;
    t.add(logo);

    // Head: big chibi head, face texture, messy brown hair, slouchy beanie,
    // goggles pushed up on the beanie.
    this.head = new THREE.Group();
    this.head.position.y = 0.56;
    t.add(this.head);
    const h = this.head;
    const HY = 0.19; // head centre above the collar
    const face = mesh(new THREE.SphereGeometry(0.19, 24, 16), makeToon({ map: faceTexture() }, { rim: 1, hatch: 0 }), h, 0, HY, 0);
    face.scale.set(1.04, 1, 0.98);
    for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.042, 8, 6), M.skin, h, sx * 0.19, HY - 0.02, 0);
    // Hair cap over the back and sides, leaving the face open.
    const cap = mesh(new THREE.SphereGeometry(0.203, 18, 12, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.64), M.hair, h, 0, HY + 0.005, -0.004);
    cap.scale.set(1.06, 1.02, 1.04);
    // Tufts: bangs over the forehead, flicks at the sides and nape.
    const tuft = (x, y, z, rx, rz, size, mat = M.hair) => {
      const m = mesh(new THREE.ConeGeometry(0.045 * size, 0.13 * size, 5).rotateX(Math.PI), mat, h, x, y, z);
      m.rotation.set(rx, 0, rz);
    };
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.21;
      tuft(Math.sin(a) * 0.18, HY + 0.075 - Math.abs(i) * 0.008, Math.cos(a) * 0.18, -0.55, -a * 0.6, 1 - Math.abs(i) * 0.06, i % 2 ? M.hairDark : M.hair);
    }
    for (const sx of [-1, 1]) {
      tuft(sx * 0.2, HY + 0.02, 0.06, 0.1, sx * 0.9, 1.1);
      tuft(sx * 0.21, HY - 0.03, -0.04, -0.1, sx * 1.4, 1.0, M.hairDark);
      tuft(sx * 0.15, HY - 0.1, -0.14, 0.7, sx * 1.1, 1.1);
    }
    tuft(0, HY - 0.12, -0.18, 1.1, 0, 1.2);
    // Slouchy beanie: tall, soft, slumped toward the back.
    const beanie = mesh(new THREE.SphereGeometry(0.222, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.47), M.cream, h, 0, HY + 0.03, -0.012);
    beanie.scale.set(1.05, 1.3, 1.08);
    mesh(new THREE.SphereGeometry(0.15, 12, 9), M.cream, h, 0, HY + 0.23, -0.07).scale.set(1.2, 0.85, 1.2);
    // Goggles pushed up onto the beanie: thin strap hugging it (white side
    // logo) and a big frame + lens on the front.
    const strap = mesh(new THREE.TorusGeometry(0.228, 0.012, 5, 28), M.black, h, 0, HY + 0.1, -0.01);
    strap.rotation.x = Math.PI / 2 + 0.18;
    strap.scale.set(1.04, 1.07, 1);
    for (const sx of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(0.024, 0.006, 5, 12), M.piping, h, sx * 0.24, HY + 0.095, -0.03);
      ring.rotation.y = Math.PI / 2;
    }
    const gog = new THREE.Group();
    gog.position.set(0, HY + 0.13, -0.01);
    gog.rotation.x = -0.18;
    h.add(gog);
    mesh(new THREE.CylinderGeometry(0.236, 0.236, 0.125, 18, 1, true, -0.82, 1.64), M.black, gog);
    mesh(new THREE.CylinderGeometry(0.243, 0.243, 0.095, 18, 1, true, -0.74, 1.48), M.lens, gog);
    mesh(new THREE.BoxGeometry(0.12, 0.01, 0.012), M.lensGlint, gog, 0.07, 0.02, 0.233).rotation.z = -0.12;
    mesh(new THREE.BoxGeometry(0.07, 0.008, 0.012), M.lensGlint, gog, -0.09, -0.015, 0.226).rotation.z = -0.12;

    // Arms: cream upper sleeve, navy forearm cuff, big black mitts.
    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(0.26 * side, 0.43, 0);
      t.add(sh);
      mesh(new THREE.SphereGeometry(0.105, 9, 7), M.cream, sh);
      mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.22, 9).translate(0, -0.11, 0), M.cream, sh);
      const el = new THREE.Group();
      el.position.y = -0.22;
      sh.add(el);
      mesh(new THREE.SphereGeometry(0.098, 9, 7), M.navy, el);
      mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.2, 9).translate(0, -0.1, 0), M.navy, el);
      mesh(new THREE.SphereGeometry(0.085, 9, 7).scale(0.95, 1.15, 0.85), M.black, el, 0, -0.25, 0.01);
      return { sh, el };
    };
    this.armL = arm(1);
    this.armR = arm(-1);
    // Sleeve patch on the left arm.
    mesh(new THREE.BoxGeometry(0.01, 0.07, 0.08), M.patch, this.armL.sh, 0.1, -0.08, 0);
  }

  update(dt, s) {
    this.t += dt;
    const p = this.pose;
    const k = 1 - Math.exp(-dt * 10);
    p.crouch += (s.crouch - p.crouch) * k;
    p.lean += (s.lean - p.lean) * (1 - Math.exp(-dt * 8));
    p.twist += (s.twist - p.twist) * k;
    p.air += ((s.air ? 1 : 0) - p.air) * (1 - Math.exp(-dt * 6));

    this.edge.rotation.z = p.lean; // roll about the travel axis
    const c = Math.min(1, p.crouch + p.air * 0.35);

    // Hips drop and sit back with crouch; torso folds forward.
    const hipY = 0.76 - c * 0.24;
    this.hips.position.set(0.02, hipY, -0.1 - c * 0.08);
    this.hips.rotation.set(0, 0.3 + p.twist * 0.3, 0);
    this.torso.rotation.set(0.45 + c * 0.45, 0.25 + p.twist * 0.25, 0);
    this.head.rotation.set(-0.3 - c * 0.35, 0.55 - p.twist * 0.3, 0); // look down the nose

    // Legs: two-bone IK from hip socket to ankle, knees driven forward.
    const fwd = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const hip = new THREE.Vector3(0.12 * side, 0, 0).applyEuler(this.hips.rotation).add(this.hips.position);
      const ankle = this.feet[i].position.clone().add(new THREE.Vector3(0, 0.15, 0));
      const L = 0.3;
      const d = hip.clone().sub(ankle);
      const len = Math.min(d.length(), 2 * L - 0.001);
      const mid = ankle.clone().addScaledVector(d.normalize(), len / 2);
      const bendDir = fwd.clone().addScaledVector(d, -fwd.dot(d)).normalize();
      bendDir.x += side * 0.12;
      bendDir.normalize();
      const knee = mid.addScaledVector(bendDir, Math.sqrt(L * L - (len / 2) ** 2));
      this.thighs[i].set(knee, hip);
      this.shins[i].set(ankle, knee);
      this.knees[i].position.copy(knee);
      this.cuffs[i].position.copy(ankle).add(new THREE.Vector3(0, 0.02, 0));
    }

    // Arms out for balance, swinging with the edge change; tucked in the air.
    const sway = Math.sin(this.t * 2.1) * 0.05;
    const air = p.air;
    const L = this.armL, R = this.armR;
    L.sh.rotation.set(-0.5 - p.lean * 0.6 - air * 0.6, 0, 1.15 - air * 0.5 + sway);
    L.el.rotation.set(-0.35, 0, 0.1);
    R.sh.rotation.set(-0.9 + p.lean * 0.5 - air * 0.4, 0, -0.75 + air * 0.2 - sway);
    R.el.rotation.set(-1.0 - air * 0.4, 0, -0.2);

    // Crash tumble.
    this.body.rotation.x = p.tumble;

    const walking = this.locomotion === 'walk';
    const targetYaw = walking ? Math.PI : Math.PI / 2;
    this.body.rotation.y += (targetYaw - this.body.rotation.y) * Math.min(1, dt / 0.08);
    if (walking) { this.edge.rotation.z = 0; this.body.rotation.x = 0; }
    this.model?.update(dt, this, this.locomotion, s.speed || 0);
  }
}
