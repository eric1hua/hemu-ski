// Map editor: a top-down working view of the game's map, for deleting tiles,
// raising and lowering them, reshaping the runs (their line and the ground
// under them), removing and planting trees, and moving the lift stations and
// the things placed on the map, with a layer that shows the runs as wide as
// the game makes them. Saves go to public/data/edits/ through the dev server,
// and the game picks them up on its next load.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadWorld, PisteField, PISTE_HALF_WIDTH, applyPlaces, placeOf } from '../../src/world/data.js';
import { createBackdrop } from '../../src/world/terrain.js';
import { SKY } from '../../src/world/sky.js';
import { GAME_FOREST } from '../../src/world/trees.js';
import { EditMap } from './map.js';
import { TerrainView } from './terrain-view.js';
import { RunsView, DIFF_COLORS } from './runs-view.js';
import { TreesView, TREE_HEIGHT } from './trees-view.js';
import { ObjectsView } from './objects-view.js';

const TREELINE = 2350;
const $ = (id) => document.getElementById(id);

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = SKY.horizon;
const camera = new THREE.PerspectiveCamera(50, 1, 1, 80000);
scene.add(new THREE.HemisphereLight('#ffffff', '#8a9a96', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(0.62, 0.55, 0.56);
scene.add(sun);

// ---------- Map ----------
const world = await loadWorld('', { edits: !new URLSearchParams(location.search).has('original') });
const hf = world.detail;
const map = new EditMap(world);
const terrain = new TerrainView(hf);
scene.add(terrain.group);
scene.add(createBackdrop(world.backdrop, hf, TREELINE));
const runsView = new RunsView(hf, map.runs, world.meta.lifts);
scene.add(runsView.group);
const treesView = new TreesView(hf, map, world.meta.lifts);
scene.add(treesView.group);
const objectsView = new ObjectsView(hf, map);
scene.add(objectsView.group);

// ---------- Camera ----------
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.zoomToCursor = true;
controls.screenSpacePanning = false; // pan across the ground, like a map
controls.minDistance = 15;
controls.maxDistance = 20000;
controls.maxPolarAngle = 1.48;
const BUTTONS = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.mouseButtons = { ...BUTTONS };

function fitMap() {
  const y = map.tileHeight(Math.floor(hf.tiles / 2) * hf.tiles + Math.floor(hf.tiles / 2));
  controls.target.set(hf.center[0], y, hf.center[1]);
  camera.position.set(hf.center[0] + 1800, y + 6500, hf.center[1] + 4200);
  controls.update();
}

// Frame the selected tiles or run, keeping the viewing angle.
function frameSelection() {
  let pts = [];
  if (tool === 'runs' && runsView.selected >= 0) pts = map.runs[runsView.selected].points;
  else if (tool === 'objects') {
    const it = objectsView.selectedItem;
    if (it?.kind === 'station') pts = [0, 1].map((end) => { const e = objectsView.get(`lift:${it.li}:${end}`); return [e.x, e.z]; });
    else if (it) pts = [[it.x - it.hd, it.z - it.hd], [it.x + it.hd, it.z + it.hd]];
  } else if (tool === 'trees') for (const id of treesView.selection) { const t = treesView.get(id); pts.push([t.x, t.z]); }
  else for (const t of selection) { const r = map.tileVerts(t); pts.push([hf.x0 + r.i0 * hf.step, hf.z0 + r.j0 * hf.step], [hf.x0 + r.i1 * hf.step, hf.z0 + r.j1 * hf.step]); }
  if (!pts.length) return fitMap();
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const span = Math.max(x1 - x0, z1 - z0, 160);
  const dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.set(cx, hf.heightAt(cx, cz), cz);
  camera.position.copy(controls.target).addScaledVector(dir, span * 1.4);
  controls.update();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  runsView.setResolution(w, h);
  objectsView.setResolution(w, h);
}
window.addEventListener('resize', resize);
resize();
fitMap();

// ---------- Tools and selection ----------
let tool = 'tiles';
let treeMode = 'select'; // or 'plant'
const selection = new Set();
const params = { step: () => +$('p-step').value || 5, blend: () => Math.max(0, +$('p-blend').value || 0), halfWidth: () => (+$('p-width').value || PISTE_HALF_WIDTH * 2) / 2 };

function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== t));
  document.querySelectorAll('[data-only]').forEach((p) => p.classList.toggle('hidden', !p.dataset.only.split(' ').includes(t)));
  terrain.setRect(null);
  terrain.setSelection(t === 'tiles' ? selection : []);
  runsView.setHovered(-1);
  if (t !== 'runs') runsView.setSelected(-1);
  treesView.setShowRemoved(t === 'trees');
  treesView.setHover(null);
  if (t !== 'trees') treesView.setSelection([]);
  objectsView.group.visible = t === 'objects';
  objectsView.setHover(null);
  if (t !== 'objects') objectsView.setSelected(null);
  updatePanButton();
  updatePanels();
}
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

function setTreeMode(m) {
  treeMode = m;
  document.querySelectorAll('[data-tmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tmode === m)));
  $('tree-hint').textContent = m === 'plant'
    ? 'Click to plant a tree; drag to plant a row. Planted trees stand even on a run.'
    : 'Click a tree, or drag a box. Shift adds, Alt takes away. Removed trees show in red; select them to restore.';
  treesView.setHover(null);
  updatePanButton();
}
document.querySelectorAll('[data-tmode]').forEach((b) => b.addEventListener('click', () => setTreeMode(b.dataset.tmode)));
$('p-density').addEventListener('change', () => map.setTreeDensity((+$('p-density').value || 0) / 100));
// Don't leave buttons focused, or Space (pan) would press them again.
document.addEventListener('click', (e) => e.target.closest?.('button')?.blur());

let spaceHeld = false;
function updatePanButton() {
  controls.mouseButtons.LEFT = tool === 'hand' || spaceHeld ? THREE.MOUSE.PAN : null;
  canvas.style.cursor = tool === 'hand' || spaceHeld ? 'grab' : tool === 'trees' && treeMode === 'plant' ? 'copy' : 'crosshair';
}

const tileXY = (t) => [t % hf.tiles, Math.floor(t / hf.tiles)];
function tilesInRect(r) {
  const out = [];
  for (let j = r.tj0; j <= r.tj1; j++) for (let i = r.ti0; i <= r.ti1; i++) out.push(j * hf.tiles + i);
  return out;
}
function rectOf(a, b) {
  const [ai, aj] = tileXY(a), [bi, bj] = tileXY(b);
  return { ti0: Math.min(ai, bi), tj0: Math.min(aj, bj), ti1: Math.max(ai, bi), tj1: Math.max(aj, bj) };
}

function updatePanels() {
  const n = selection.size;
  let deleted = 0;
  for (const t of selection) deleted += hf.holes[t];
  if (n === 1) {
    const [t] = selection, [i, j] = tileXY(t);
    $('tile-info').innerHTML = `Tile ${i}, ${j} · ${Math.round(map.tileHeight(t)).toLocaleString()} m${deleted ? ' · <b>deleted</b>' : ''}`;
  } else {
    $('tile-info').innerHTML = n ? `${n} tiles · ${(n * hf.tileSize * hf.tileSize / 1e6).toFixed(2)} km²${deleted ? ` · ${deleted} deleted` : ''}` : 'Click a tile, or drag a box.';
  }
  document.querySelectorAll('[data-panel="tiles"] [data-act]').forEach((b) => (b.disabled = !n));

  const ri = runsView.selected;
  if (ri >= 0) {
    const r = map.runs[ri], p = r.points;
    let len = 0;
    for (let k = 1; k < p.length; k++) len += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
    const drop = hf.heightAt(...p[0]) - hf.heightAt(...p[p.length - 1]);
    $('run-info').innerHTML = `<span class="badge" style="background:${DIFF_COLORS[r.difficulty] || DIFF_COLORS.intermediate}"></span>${r.name || '<i>unnamed run</i>'}<br><span class="dim">${r.difficulty || '?'} · ${Math.round(len).toLocaleString()} m · ${Math.round(drop)} m drop · ${p.length} points</span>`;
  } else $('run-info').textContent = 'Click a run to edit it.';
  document.querySelectorAll('[data-panel="runs"] [data-act]').forEach((b) => (b.disabled = ri < 0));

  const ts = [...treesView.selection].map((id) => treesView.get(id));
  const gone = ts.filter((t) => t.removed).length;
  if (ts.length === 1) {
    const [t] = ts;
    $('tree-info').innerHTML = `${t.id < 0 ? 'Planted tree' : 'Tree'} · ${(TREE_HEIGHT * t.sy).toFixed(1)} m tall${gone ? ' · <b>removed</b>' : ''}`;
  } else if (ts.length) {
    $('tree-info').innerHTML = `${ts.length} trees${gone ? ` · ${gone} removed` : ''}`;
  } else {
    $('tree-info').innerHTML = `${treesView.standing.toLocaleString()} trees<br><span class="dim">${map.trees.removed.size.toLocaleString()} removed · ${treesView.planted.toLocaleString()} planted</span>`;
  }
  $('p-density').value = Math.round(map.trees.density * 100);
  document.querySelector('[data-act="tree-remove"]').disabled = ts.length === gone;
  document.querySelector('[data-act="tree-restore"]').disabled = !gone;

  const it = objectsView.selectedItem;
  const liftMoved = (l) => JSON.stringify(map.baked.lifts.find((b) => b.id === l.id)?.points) !== JSON.stringify(l.points);
  let moved = false;
  if (it?.kind === 'place') {
    const zh = objectsView.zh(it.id);
    moved = !!map.places[it.id];
    $('obj-info').innerHTML = `<span class="badge" style="background:${it.color}"></span>${objectsView.label(it.id)}${zh ? ` · ${zh}` : ''}<br><span class="dim">x ${Math.round(it.x)} · z ${Math.round(it.z)} · ${Math.round(hf.heightAt(it.x, it.z)).toLocaleString()} m · faces ${bearingName(it.yaw)}${moved ? ' · <b>moved</b>' : ''}</span>`;
    $('p-facing').value = Math.round(bearingOf(it.yaw)) % 360;
  } else if (it) {
    const lift = map.lifts[it.li], { length, rise } = objectsView.liftStats(it.li);
    moved = liftMoved(lift);
    $('obj-info').innerHTML = `<span class="badge" style="background:${it.color}"></span>${objectsView.label(it.id)}<br><span class="dim">${lift.type.replace('_', ' ')} · ${Math.round(length).toLocaleString()} m long · climbs ${Math.round(rise)} m${moved ? ' · <b>moved</b>' : ''}</span>`;
  } else {
    const n = Object.keys(map.places).length + map.lifts.filter(liftMoved).length;
    $('obj-info').innerHTML = `Click a hall, the hot spring, a vehicle or a lift station.${n ? `<br><span class="dim">${n} moved</span>` : ''}`;
  }
  const turnable = it?.kind === 'place';
  document.querySelector('[data-act="obj-left"]').disabled = document.querySelector('[data-act="obj-right"]').disabled = $('p-facing').disabled = !turnable;
  document.querySelector('[data-act="obj-reset"]').disabled = !moved;

  $('undo').disabled = !map.undoStack.length;
  $('redo').disabled = !map.redoStack.length;
  $('save').classList.toggle('dirty', map.dirty);
  $('save').textContent = map.dirty ? 'Save •' : 'Saved';
}

let msgTimer = 0;
function say(msg) {
  $('st-msg').textContent = msg;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => ($('st-msg').textContent = ''), 4000);
}

map.onChange((c) => {
  if (c.heights) {
    terrain.refresh(c.heights);
    runsView.rebuild();
  }
  if (c.holes) terrain.syncHoles();
  if (c.run !== undefined) runsView.rebuild(c.run);
  // Trees follow the ground and keep clear of the runs.
  if (c.heights) {
    const r = c.heights, pad = 15; // normals sample 2 m out, trees wobble 4.5 m off their grid corner
    treesView.invalidate([hf.x0 + r.i0 * hf.step - pad, hf.z0 + r.j0 * hf.step - pad, hf.x0 + r.i1 * hf.step + pad, hf.z0 + r.j1 * hf.step + pad]);
  }
  if (c.holes) treesView.invalidate();
  if (c.run !== undefined) treesView.invalidateRun(c.run);
  if (c.objects) {
    objectsView.rebuild();
    runsView.rebuildLifts();
    // The forest keeps clear of the lifts and around the halls and the pool:
    // re-plant where one of those was and where it went.
    const now = clearedAreas();
    for (const [k, area] of now) if (String(cleared.get(k)) !== String(area)) { treesView.invalidate(cleared.get(k)); treesView.invalidate(area); }
    cleared = now;
  } else if (c.heights) objectsView.rebuild();
  if (c.heights || c.holes || c.run !== undefined || c.trees || c.objects) treesView.refresh();
  if (c.run !== undefined) { widthsStale = true; if (widthsOn) setWidths(true); }
  if (c.label) say(c.label);
  updatePanels();
});

// The ground each lift and clearing keeps free of trees, [x0, z0, x1, z1].
function clearedAreas() {
  const out = new Map(), pad = 24; // a lift's 9 m, and trees wobble off their grid corner
  map.lifts.forEach((l, i) => {
    const a = l.points[0], b = l.points[l.points.length - 1];
    out.set(`lift:${i}`, [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad]);
  });
  GAME_FOREST.clearings.forEach((c, i) => out.set(`clearing:${i}`, [c.x - c.r - pad, c.z - c.r - pad, c.x + c.r + pad, c.z + c.r + pad]));
  return out;
}
let cleared = clearedAreas();

// Facing as a compass bearing: yaw 0 faces +z, which is south.
const bearingOf = (yaw) => (((180 - THREE.MathUtils.radToDeg(yaw)) % 360) + 360) % 360;
const yawOf = (bearing) => THREE.MathUtils.degToRad(180 - bearing);
function bearingName(yaw) {
  const b = bearingOf(yaw);
  return `${Math.round(b) % 360}° ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8]}`;
}

// ---------- Run widths ----------
// The game's piste field over the edited runs: the same distances it grooms,
// clears the forest and rides by. Rebuilt when a run changes, while the layer
// is up.
let widthsOn = false, widthsStale = true, piste = null;
function setWidths(on) {
  widthsOn = on;
  if (on && widthsStale) {
    piste = new PisteField(map.runs, hf.size, 4, 60, hf.center);
    terrain.setPiste(piste, map.runs.map((r) => DIFF_COLORS[r.difficulty] || DIFF_COLORS.intermediate));
    widthsStale = false;
  }
  terrain.showWidths(on, PISTE_HALF_WIDTH);
  $('widths').setAttribute('aria-pressed', String(on));
  $('legend').classList.toggle('hidden', !on);
  $('lg-half').textContent = PISTE_HALF_WIDTH;
}
$('widths').addEventListener('click', () => setWidths(!widthsOn));

// ---------- Actions ----------
function act(name) {
  const step = params.step(), blend = params.blend();
  const ri = runsView.selected;
  const groom = { halfWidth: params.halfWidth(), blend };
  switch (name) {
    case 'raise': return map.raiseTiles(selection, step, blend);
    case 'lower': return map.raiseTiles(selection, -step, blend);
    case 'level': return map.levelTiles(selection, blend);
    case 'smooth': return map.smoothTiles(selection, blend);
    case 'delete': return map.setHoles(selection, 1);
    case 'restore': return map.setHoles(selection, 0);
    case 'run-smooth': return ri >= 0 && map.groomRun(ri, 'smooth', groom);
    case 'run-bench': return ri >= 0 && map.groomRun(ri, 'bench', groom);
    case 'run-raise': return ri >= 0 && map.groomRun(ri, 'raise', { ...groom, dh: step });
    case 'run-lower': return ri >= 0 && map.groomRun(ri, 'raise', { ...groom, dh: -step });
    case 'tree-remove': return map.removeTrees([...treesView.selection].filter((id) => !treesView.get(id).removed));
    case 'tree-restore': return map.restoreTrees([...treesView.selection]);
    case 'obj-left': return turnBy(-15);
    case 'obj-right': return turnBy(15);
    case 'obj-reset': return putBack();
  }
}

// Turn the selected place by `deg` degrees (clockwise, seen from above).
function turnBy(deg) {
  const it = objectsView.selectedItem;
  if (it?.kind !== 'place') return;
  const { x, z, yaw } = placeOf(it.id);
  map.editObjects(`Turn ${objectsView.label(it.id)}`, (m) => (m.places[it.id] = { x, z, yaw: yaw - THREE.MathUtils.degToRad(deg) }));
}
function putBack() {
  const it = objectsView.selectedItem;
  if (!it) return;
  const label = `Put back ${objectsView.label(it.id)}`;
  if (it.kind === 'place') return map.editObjects(label, (m) => delete m.places[it.id]);
  const lift = map.lifts[it.li], was = map.baked.lifts.find((l) => l.id === lift.id);
  if (was) map.editObjects(label, () => (lift.points = was.points.map((q) => [...q])));
}
$('p-facing').addEventListener('change', () => {
  const it = objectsView.selectedItem;
  if (it?.kind !== 'place') return;
  const { x, z } = placeOf(it.id);
  map.editObjects(`Turn ${objectsView.label(it.id)}`, (m) => (m.places[it.id] = { x, z, yaw: yawOf(+$('p-facing').value || 0) }));
});
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));

$('undo').addEventListener('click', () => map.undo() ?? say('Nothing to undo'));
$('redo').addEventListener('click', () => map.redo() ?? say('Nothing to redo'));
$('fit').addEventListener('click', fitMap);

async function save() {
  try {
    say('Saving…');
    const e = await map.save();
    say(`Saved: ${e.holes.length} deleted tiles, ${e.runs.length} runs, ${e.trees.removed.length} trees removed, ${e.trees.added.length} planted, ${Object.keys(e.places).length} places moved`);
  } catch (err) {
    say(err.message);
    throw err;
  } finally {
    updatePanels();
  }
}
$('save').addEventListener('click', () => save().catch(() => {}));
$('play').addEventListener('click', async () => {
  // Open the tab first so the popup isn't blocked, then point it at the game once saved.
  const tab = window.open('', '_blank');
  try {
    if (map.dirty) await save();
    if (tab) tab.location.href = '/';
  } catch {
    tab?.close();
  }
});
$('reset').addEventListener('click', async () => {
  if (!confirm('Throw away the saved edits (and any unsaved ones) and go back to the baked map?')) return;
  try {
    await EditMap.discardSaved();
    map.dirty = false;
    location.reload();
  } catch (err) { say(err.message); }
});
window.addEventListener('beforeunload', (e) => {
  if (map.dirty) e.preventDefault();
});

// ---------- Pointer ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const mouse = { x: 0, y: 0 };
let drag = null; // { kind: 'box', from, mode } | { kind: 'point', ri, k, before } | { kind: 'trees', x, y, mode, box } | { kind: 'plant', before, last } | { kind: 'object' | 'turn', id, before, ... }

function groundAt(e) {
  mouse.x = e.clientX; mouse.y = e.clientY;
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return terrain.raycast(ray.ray);
}

// Metres per screen pixel at a ground point, for picking radii.
function metresPerPixel(p) {
  return (camera.position.distanceTo(p) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
}
// The ground under the mouse can lie well behind a tree that covers it, more so
// the flatter the view, so search further around it then.
function pickTree(p) {
  if (!p) return null;
  const d = camera.position.clone().sub(p), flat = Math.hypot(d.x, d.z) / Math.max(1, d.y);
  const reach = Math.max(30, metresPerPixel(p) * 20) + Math.min(TREE_HEIGHT * 1.6 * flat, 300);
  return treesView.pickScreen(mouse, camera, window.innerWidth, window.innerHeight, p, reach);
}

const PLANT_GAP = 9; // m between trees planted in one drag
function plant(x, z) {
  if (!hf.inside(x, z, 30) || hf.holeAt(x, z)) return false;
  map.trees.added.push([x, z, 0.75 + Math.random() * 0.55]);
  return true;
}

function boxRect(d, e) {
  return { x0: Math.min(d.x, e.clientX), y0: Math.min(d.y, e.clientY), x1: Math.max(d.x, e.clientX), y1: Math.max(d.y, e.clientY) };
}

function showCursor(p) {
  if (!p) { $('st-cursor').textContent = '—'; return; }
  const t = hf.tileAt(p.x, p.z);
  const [i, j] = t >= 0 ? tileXY(t) : ['–', '–'];
  let on = '';
  if (widthsOn && piste) {
    const d = piste.distAt(p.x, p.z), ri = piste.runAt(p.x, p.z);
    if (ri >= 0 && d < 40) on = ` · ${map.runs[ri].name || 'unnamed run'}, ${Math.round(d)} m from its line${d < PISTE_HALF_WIDTH ? '' : d < PISTE_HALF_WIDTH + 2 ? ' (its edge)' : ' (off it)'}`;
  }
  $('st-cursor').textContent = `x ${Math.round(p.x)} · z ${Math.round(p.z)} · ${Math.round(p.y).toLocaleString()} m · tile ${i}, ${j}${t >= 0 && hf.holes[t] ? ' (deleted)' : ''}${on}`;
}

canvas.addEventListener('pointermove', (e) => {
  const p = groundAt(e);
  showCursor(p);
  if (tool === 'hand' || spaceHeld || e.buttons & 6) return;
  const W = window.innerWidth, H = window.innerHeight;

  if (tool === 'tiles') {
    const t = p ? hf.tileAt(p.x, p.z) : -1;
    if (drag?.kind === 'box') {
      if (t >= 0) drag.to = t;
      terrain.setRect(rectOf(drag.from, drag.to), drag.mode === 'sub' ? '#e8807a' : '#f0c24a');
    } else terrain.setRect(t >= 0 ? rectOf(t, t) : null, '#ffffff');
  } else if (tool === 'runs') {
    if (drag?.kind === 'point') {
      if (p && hf.inside(p.x, p.z, 20)) {
        map.runs[drag.ri].points[drag.k] = [p.x, p.z];
        runsView.rebuild(drag.ri);
        drag.moved = true;
      }
      return;
    }
    const k = runsView.pickHandle(mouse, camera, W, H);
    runsView.setHandleHover(k);
    const hit = k < 0 ? runsView.pickRun(mouse, camera, W, H) : null;
    runsView.setHovered(hit ? hit.ri : -1);
    canvas.style.cursor = k >= 0 ? 'move' : hit ? 'pointer' : 'crosshair';
  } else if (tool === 'trees') {
    if (drag?.kind === 'plant') {
      if (!p) return;
      // A row PLANT_GAP apart, however far the pointer jumped since the last tree.
      const { x, z } = drag.last, d = Math.hypot(p.x - x, p.z - z), n = Math.floor(d / PLANT_GAP);
      for (let k = 1; k <= n; k++) plant(x + ((p.x - x) * k * PLANT_GAP) / d, z + ((p.z - z) * k * PLANT_GAP) / d);
      if (n) {
        drag.last = { x: x + ((p.x - x) * n * PLANT_GAP) / d, z: z + ((p.z - z) * n * PLANT_GAP) / d };
        treesView.refresh();
        updatePanels();
      }
      return;
    }
    if (drag?.kind === 'trees') {
      if (!drag.box && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      drag.box = boxRect(drag, e);
      const b = drag.box, el = $('box');
      Object.assign(el.style, { left: `${b.x0}px`, top: `${b.y0}px`, width: `${b.x1 - b.x0}px`, height: `${b.y1 - b.y0}px` });
      el.classList.toggle('sub', drag.mode === 'sub');
      el.classList.remove('hidden');
      treesView.setHover(null);
      return;
    }
    if (treeMode === 'select') {
      const t = pickTree(p);
      treesView.setHover(t ? t.id : null);
      canvas.style.cursor = t ? 'pointer' : 'crosshair';
    }
  } else if (tool === 'objects') {
    if (drag?.kind === 'object') {
      if (p && hf.inside(p.x, p.z, 20)) { moveObject(drag, p); drag.moved = true; }
      return;
    }
    if (drag?.kind === 'turn') {
      if (p) { turnObject(drag, p, e.shiftKey); drag.moved = true; }
      return;
    }
    const onHandle = objectsView.pickHandle(mouse, camera, W, H);
    const id = onHandle ? null : objectsView.pick(mouse, camera, W, H, p);
    objectsView.setHover(id);
    canvas.style.cursor = onHandle ? 'grab' : id ? 'move' : 'crosshair';
  }
});

// Moving and turning happen live; the forest catches up on release.
function moveObject(d, p) {
  const dx = p.x - d.from.x, dz = p.z - d.from.z;
  if (d.ends) {
    for (const { lift, k, at } of d.ends) lift.points[k] = [at[0] + dx, at[1] + dz];
    runsView.rebuildLifts();
  } else map.places[d.id] = { ...d.start, x: d.start.x + dx, z: d.start.z + dz };
  applyPlaces(map.places);
  objectsView.rebuild();
  updatePanels();
}
// Turned by however far round its middle the pointer has gone since it grabbed the handle.
function turnObject(d, p, snap) {
  const angle = (q) => Math.atan2(q.x - d.start.x, q.z - d.start.z);
  let yaw = d.start.yaw + angle(p) - angle(d.from);
  if (snap) yaw = Math.round(yaw / (Math.PI / 12)) * (Math.PI / 12);
  map.places[d.id] = { ...d.start, yaw };
  applyPlaces(map.places);
  objectsView.rebuild();
  updatePanels();
}
// Every lift end at exactly this point: where one lift's top is the next one's bottom.
const endsAt = (at) => map.lifts.flatMap((lift) => [0, lift.points.length - 1]
  .filter((k) => lift.points[k][0] === at[0] && lift.points[k][1] === at[1]).map((k) => ({ lift, k, at: [...at] })));

// Apply a click or box to the tree selection.
function selectTrees(ids, mode) {
  const sel = mode === 'replace' ? new Set() : new Set(treesView.selection);
  // Shift-clicking a single selected tree toggles it off.
  const single = ids.length === 1 && mode === 'add' && sel.has(ids[0]);
  for (const id of ids) (mode === 'sub' || single ? sel.delete(id) : sel.add(id));
  treesView.setSelection(sel);
  updatePanels();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || tool === 'hand' || spaceHeld) return;
  const p = groundAt(e);
  if (tool === 'tiles') {
    const t = p ? hf.tileAt(p.x, p.z) : -1;
    if (t < 0) return;
    drag = { kind: 'box', from: t, to: t, mode: e.shiftKey ? 'add' : e.altKey ? 'sub' : 'replace' };
    terrain.setRect(rectOf(t, t), drag.mode === 'sub' ? '#e8807a' : '#f0c24a');
    canvas.setPointerCapture(e.pointerId);
  } else if (tool === 'runs') {
    const W = window.innerWidth, H = window.innerHeight;
    const k = runsView.pickHandle(mouse, camera, W, H);
    const ri = runsView.selected;
    if (k >= 0) {
      if (e.altKey) return removePoint(ri, k);
      drag = { kind: 'point', ri, k, before: map.runs[ri].points.map((q) => [...q]) };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const hit = runsView.pickRun(mouse, camera, W, H);
    runsView.setSelected(hit ? hit.ri : -1);
    updatePanels();
  } else if (tool === 'trees') {
    if (treeMode === 'plant') {
      const before = map.treeSnapshot();
      if (!p || !plant(p.x, p.z)) return say("Trees can't go there");
      treesView.refresh();
      drag = { kind: 'plant', before, last: { x: p.x, z: p.z } };
    } else {
      drag = { kind: 'trees', x: e.clientX, y: e.clientY, p, mode: e.shiftKey ? 'add' : e.altKey ? 'sub' : 'replace', box: null };
    }
    canvas.setPointerCapture(e.pointerId);
  } else if (tool === 'objects') {
    const W = window.innerWidth, H = window.innerHeight, before = map.objectSnapshot();
    if (objectsView.pickHandle(mouse, camera, W, H)) {
      const id = objectsView.selected;
      if (!p) return;
      drag = { kind: 'turn', id, start: placeOf(id), from: { x: p.x, z: p.z }, before };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const id = objectsView.pick(mouse, camera, W, H, p);
    objectsView.setSelected(id);
    updatePanels();
    if (!id || !p) return;
    const it = objectsView.get(id);
    drag = { kind: 'object', id, from: { x: p.x, z: p.z }, before };
    if (it.kind === 'station') {
      const lift = map.lifts[it.li], k = it.end ? lift.points.length - 1 : 0;
      // Joined stations move together, unless Alt pulls this one away.
      drag.ends = e.altKey ? [{ lift, k, at: [...lift.points[k]] }] : endsAt(lift.points[k]);
    } else drag.start = placeOf(id);
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !drag) return;
  if (drag.kind === 'box') {
    const tiles = tilesInRect(rectOf(drag.from, drag.to));
    if (drag.mode === 'replace') selection.clear();
    // Shift-clicking a single selected tile toggles it off.
    const single = tiles.length === 1 && drag.mode === 'add' && selection.has(tiles[0]);
    for (const t of tiles) (drag.mode === 'sub' || single ? selection.delete(t) : selection.add(t));
    terrain.setSelection(selection);
    terrain.setRect(rectOf(drag.to, drag.to), '#ffffff');
    updatePanels();
  } else if (drag.kind === 'point' && drag.moved) {
    map.commitRun(drag.ri, drag.before, 'Move point');
  } else if (drag.kind === 'trees') {
    $('box').classList.add('hidden');
    if (drag.box) selectTrees(treesView.inScreenRect(camera, window.innerWidth, window.innerHeight, drag.box), drag.mode);
    else {
      const t = pickTree(drag.p);
      selectTrees(t ? [t.id] : [], drag.mode);
    }
  } else if (drag.kind === 'plant') {
    const n = map.trees.added.length - drag.before.added.length;
    map.editTrees(`Plant ${n} tree${n > 1 ? 's' : ''}`, null, drag.before);
  } else if ((drag.kind === 'object' || drag.kind === 'turn') && drag.moved) {
    map.editObjects(`${drag.kind === 'turn' ? 'Turn' : 'Move'} ${objectsView.label(drag.id)}`, null, drag.before);
  }
  drag = null;
});

// Double-click on the selected run's line adds a point there.
canvas.addEventListener('dblclick', (e) => {
  if (tool !== 'runs' || runsView.selected < 0) return;
  const p = groundAt(e);
  const ri = runsView.selected;
  const hit = runsView.pickRun(mouse, camera, window.innerWidth, window.innerHeight, 10, ri);
  if (!p || !hit) return;
  const before = map.runs[ri].points.map((q) => [...q]);
  map.runs[ri].points.splice(hit.seg + 1, 0, [p.x, p.z]);
  map.commitRun(ri, before, 'Add point');
  runsView.setSelected(ri);
});

function removePoint(ri, k) {
  const pts = map.runs[ri].points;
  if (pts.length <= 2) return say('A run needs at least two points');
  const before = pts.map((q) => [...q]);
  pts.splice(k, 1);
  map.commitRun(ri, before, 'Remove point');
  runsView.setSelected(ri);
}

canvas.addEventListener('pointerleave', () => {
  if (!drag) terrain.setRect(null);
  treesView.setHover(null);
  if (!drag) objectsView.setHover(null);
  showCursor(null);
});

// ---------- Keys ----------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.code === 'KeyZ') { e.preventDefault(); (e.shiftKey ? map.redo() : map.undo()) ?? say(`Nothing to ${e.shiftKey ? 'redo' : 'undo'}`); return; }
  if (mod && e.code === 'KeyY') { e.preventDefault(); map.redo(); return; }
  if (mod && e.code === 'KeyS') { e.preventDefault(); save().catch(() => {}); return; }
  if (mod) return;
  keys.add(e.code);
  switch (e.code) {
    case 'KeyT': return setTool('tiles');
    case 'KeyR': return setTool('runs');
    case 'KeyG': return setTool('trees');
    case 'KeyP': return tool === 'trees' && setTreeMode(treeMode === 'plant' ? 'select' : 'plant');
    case 'KeyO': return setTool('objects');
    case 'KeyH': return setTool('hand');
    case 'KeyL': return setWidths(!widthsOn);
    case 'KeyQ': case 'KeyE': return tool === 'objects' && turnBy((e.code === 'KeyQ' ? -1 : 1) * (e.shiftKey ? 1 : 15));
    case 'KeyF': return frameSelection();
    case 'Home': return fitMap();
    case 'Space':
      e.preventDefault();
      if (!spaceHeld) { spaceHeld = true; updatePanButton(); }
      return;
    case 'BracketRight': case 'PageUp': return act(tool === 'runs' ? 'run-raise' : 'raise');
    case 'BracketLeft': case 'PageDown': return act(tool === 'runs' ? 'run-lower' : 'lower');
    case 'Delete': case 'Backspace':
      e.preventDefault();
      if (tool === 'tiles') return act(e.shiftKey ? 'restore' : 'delete');
      if (tool === 'runs' && runsView.hoverHandle >= 0) return removePoint(runsView.selected, runsView.hoverHandle);
      if (tool === 'trees') return act(e.shiftKey ? 'tree-restore' : 'tree-remove');
      return;
    case 'Escape':
      if (tool === 'tiles') { selection.clear(); terrain.setSelection(selection); }
      else if (tool === 'trees') treesView.setSelection([]);
      else if (tool === 'objects') objectsView.setSelected(null);
      else runsView.setSelected(-1);
      return updatePanels();
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') { spaceHeld = false; updatePanButton(); }
});
window.addEventListener('blur', () => { keys.clear(); spaceHeld = false; updatePanButton(); });

// WASD pans across the ground, faster the further out you are.
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Vector3();
function keyPan(dt) {
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (!f && !r) return;
  camera.getWorldDirection(_f).setY(0).normalize();
  _r.crossVectors(_f, camera.up).normalize();
  const dist = camera.position.distanceTo(controls.target);
  const speed = dist * 0.9 * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1);
  _m.set(0, 0, 0).addScaledVector(_f, f).addScaledVector(_r, r).normalize().multiplyScalar(speed * dt);
  camera.position.add(_m);
  controls.target.add(_m);
  // Keep the pivot on the ground so orbiting stays natural.
  const gy = hf.heightAt(controls.target.x, controls.target.z);
  camera.position.y += gy - controls.target.y;
  controls.target.y = gy;
}

// ---------- Loop ----------
const clock = new THREE.Clock();
setTreeMode('select');
setTool('tiles');
$('loading').classList.add('done');
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  keyPan(dt);
  controls.update(dt);
  // Near plane follows the zoom, so close-ups don't clip and far views keep depth precision.
  const near = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.004, 0.5, 40);
  if (Math.abs(near - camera.near) > near * 0.2) { camera.near = near; camera.updateProjectionMatrix(); }
  objectsView.update(camera, window.innerHeight);
  placeLabel();
  renderer.render(scene, camera);
});

// The name of the object under the mouse (or the selected one) beside it.
function placeLabel() {
  const id = tool === 'objects' ? objectsView.hovered ?? (drag ? null : objectsView.selected) : null;
  const at = id && objectsView.screenOf(id, camera, window.innerWidth, window.innerHeight);
  $('obj-label').classList.toggle('hidden', !at);
  if (!at) return;
  if ($('obj-label').dataset.id !== id) { $('obj-label').dataset.id = id; $('obj-label').textContent = objectsView.label(id); }
  Object.assign($('obj-label').style, { left: `${at.x}px`, top: `${at.y}px` });
}

// For poking at from the console.
window.__editor = { map, terrain, runsView, treesView, objectsView, camera, controls, selection, setTool, setWidths };
