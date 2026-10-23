// The resort as the game builds it: the ground, shaped, and everything that
// stands on it. The game and the diorama both build from here (the diorama at
// toy proportions), so whatever changes the game's world (the bake, the map
// editor's edits, the banks, the summit's layout, a building or a prop added
// here) changes the diorama's with it. The summit review reads the ground from
// here too.
import * as THREE from 'three';
import { loadWorld, PisteField, SERVICE_CENTRES, ONSEN, placeOf } from './data.js';
import { raiseBanks, gameClearings } from './banks.js';
import { shapeSummit, createSummit } from './summit.js';
import { shapeLakes, createLakes, overWater, mooring } from './lakes.js';
import { createDetailTerrain } from './terrain.js';
import { createForest, gameTrees, toyForest, GAME_FOREST } from './trees.js';
import { createLifts, createPisteMarkers, createBanner, createServiceCentre } from './props.js';
import { createOnsen } from './onsen.js';
import { Truck } from '../vehicle/truck.js';
import { Snowmobile } from '../vehicle/snowmobile.js';
import { VehiclePhysics, PICKUP, SNOWMOBILE } from '../vehicle/physics.js';
import { Jetson } from '../vehicle/jetson.js';
import { FlightPhysics, JETSON } from '../vehicle/flight.js';
import { Rowboat } from '../vehicle/rowboat.js';
import { RowingPhysics, ROWBOAT } from '../vehicle/rowing.js';

export const TREELINE = GAME_FOREST.treeline;
export const MAIN_RUN = '云霄峰道'; // Yunxiaofeng, the run under Gondola No. 6

// The game's world: the bake with the map editor's edits (unless `original`),
// on which the snow is banked up beside the runs (see banks.js), the summit
// shaped for its landmarks (summit.js) and Cloud Lake for its water (lakes.js).
// Returns loadWorld()'s world plus `piste` (the runs' field, on the 4 m grid),
// `ground` (the heightfield all of that made, which everything stands on),
// `lakes` and `summitFrame` (where the summit is laid out from).
export async function loadResort({ original = false } = {}) {
  const world = await loadWorld({ edits: !original });
  const { meta } = world;
  const piste = new PisteField(meta.runs, world.detail.size, 4, 60, world.detail.center);
  const ground = raiseBanks(world.detail, meta.runs, piste, gameClearings(meta.lifts));
  const summitFrame = shapeSummit(ground, meta.lifts);
  const lakes = shapeLakes(ground, meta.lakes);
  return { ...world, piste, ground, lakes, summitFrame };
}

// The point `dist` metres along a line of [x, z] points, and the way it runs
// there, as { x, z, dx, dz }; past its end, its last point.
export function along(points, dist) {
  let d = dist;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= L) {
      const t = d / L;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L };
    }
    d -= L;
  }
  const a = points[points.length - 2], b = points[points.length - 1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { x: b[0], z: b[1], dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L };
}

// Do two boxes ({ x, z, yaw, hw, hd }, as the physics' obstacles) overlap?
function overlap(a, b) {
  const reach = (o, ux, uz) => {
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    return o.hw * Math.abs(c * ux - s * uz) + o.hd * Math.abs(s * ux + c * uz);
  };
  return [a.yaw, b.yaw].every((yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [[c, -s], [s, c]].every(([ux, uz]) => Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz) < reach(a, ux, uz) + reach(b, ux, uz));
  });
}

// What stands on the resort's ground, as the game has it: the terrain
// (`terrain` is createDetailTerrain()'s options), the service centres, the lifts,
// the forest (`forest`: createForest()'s chunk and LOD), the hot spring, the
// summit's landmarks (`labels` shows their numbers), the lakes' water, the piste
// markers, the banner at the top of Yunxiaofeng and the vehicles.
//
// `toy` draws it at the diorama's toy proportions: { lift, station, lodge, tree }
// say how many times bigger the lifts (towers, cable and cars), their stations,
// the halls and the trees are, `treeCell` and `treePer` how far apart the trees
// are thinned to and how many of the game's each one stands for (see
// toyForest), and `carSpacing` and `liftSpeed` space and run the cars for that. The rest keeps the game's size, and whatever would then stand
// inside a station or a hall is left off.
//
// Returns each part, `group` holding all but the vehicles, and `obstacles`
// (the boxes the game's riders and vehicles run into). Each vehicle comes with
// its model, still loading, and `park` (where it's parked); parkVehicle() gives
// it its physics and puts it there, once the model is in.
export function createResort(resort, { terrain: terrainOpts = {}, forest: forestOpts = {}, toy = null, labels = false } = {}) {
  const { ground: hf, piste, meta, lakes, edits } = resort;
  const group = new THREE.Group();
  const terrain = createDetailTerrain(hf, piste, TREELINE, terrainOpts);
  const lodges = SERVICE_CENTRES.map((c) => createServiceCentre(hf, c, { scale: toy?.lodge }));
  const lifts = createLifts(hf, meta.lifts, toy ? { scale: toy.lift, stationScale: toy.station, spacing: toy.carSpacing, speed: toy.liftSpeed } : {});
  const buildings = [...lifts.footprints, ...lodges.map((l) => l.userData.footprint)];
  // At toy sizes, does something with these footprints stand clear of the stations and halls?
  const fits = (boxes) => !toy || !boxes.some((b) => buildings.some((B) => overlap(b, B)));
  const onsen = createOnsen(hf, ONSEN);
  const onsenFits = fits(onsen.footprints);
  const summit = createSummit(hf, { labels, keep: (box) => fits([box]) });
  const mainRun = meta.runs.find((r) => r.name === MAIN_RUN);
  const gate = along(mainRun.points, 26);
  const banner = createBanner(hf, new THREE.Vector3(gate.x, 0, gate.z), new THREE.Vector3(-gate.dx, 0, -gate.dz), ['云霄峰道 · START', 'Yunxiaofeng · Gondola No.6'], '#f0c24a');
  const props = [...(onsenFits ? onsen.footprints : []), ...summit.footprints];
  const trees = gameTrees(hf, piste, meta.lifts, edits?.trees);
  const forest = createForest(hf, toy
    ? toyForest(trees, hf, piste, meta.lifts, { scale: toy.tree, cell: toy.treeCell, per: toy.treePer, keepOff: [...buildings, ...props] })
    : trees, forestOpts);
  const water = createLakes(lakes);
  const markers = createPisteMarkers(hf, meta.runs);
  group.add(terrain, ...lodges, forest.group, lifts.group, summit.group, water.group, markers);
  if (onsenFits) group.add(onsen.group);
  if (fits([banner.userData.footprint])) group.add(banner);
  const obstacles = [...buildings, ...props];

  // The vehicles, each where it's parked: the pickup, the snowmobile and the
  // Jetson ONE in front of the East Service Centre (or wherever the map editor
  // moved them; see Places in data.js), and the rowing boat drawn up on Cloud
  // Lake's shore where it comes nearest a run. One whose spot is inside a
  // building stays out (fits() its model's footprint once it's in, to be sure).
  const parked = (name) => {
    const { x, z, yaw } = placeOf(`vehicle:${name}`);
    return { x, z, dx: Math.sin(yaw), dz: Math.cos(yaw) };
  };
  const lake = lakes.find((l) => l.name === '云湖') ?? lakes[0] ?? null;
  const vehicles = [
    { name: 'pickup', Model: Truck, handling: PICKUP, park: parked('pickup') },
    { name: 'snowmobile', Model: Snowmobile, handling: SNOWMOBILE, park: parked('snowmobile') },
    { name: 'jetson', Model: Jetson, handling: JETSON, flies: true, park: parked('jetson') },
    ...(lake ? [{ name: 'rowboat', Model: Rowboat, handling: ROWBOAT, floats: true, lake, park: mooring(lake, meta.runs) }] : []),
  ].filter((v) => fits([{ x: v.park.x, z: v.park.z, yaw: 0, hw: 1, hd: 1 }]))
    .map(({ Model, ...v }) => ({ ...v, model: new Model() }));
  // A vehicle's physics, with it parked on its spot. The Jetson can come down
  // on the water.
  const parkVehicle = (v) => {
    const phys = new (v.flies ? FlightPhysics : v.floats ? RowingPhysics : VehiclePhysics)({
      hf: v.flies ? overWater(hf, lakes) : hf, piste, forest, lakes, lake: v.lake, dims: v.model.dims, handling: v.handling, obstacles: [...obstacles],
    });
    phys.reset(v.park.x, v.park.z, Math.atan2(-v.park.dx, -v.park.dz));
    v.model.update(0, phys);
    return phys;
  };

  return { group, terrain, lodges, lifts, forest, onsen, summit, banner, water, markers, vehicles, obstacles, parkVehicle, fits };
}
