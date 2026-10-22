// The summit of Yunxiaofeng (云霄峰), round the top stations of Gondolas No. 6
// and No. 7: where the landmarks up there stand, and how the ground is shaped
// for them (see world/summit.js, which builds both).
//
// Everything is in metres from the summit's origin, the point midway between
// the two top stations as liftStations() places them, on the game's axes (x
// east, z south), so it follows the stations if the map editor moves them.
// `at` is an object's pivot, the middle of its base; `yaw` turns it, 0 facing
// +z (south) as the stand-ins are built; `size` is its footprint, half width ×
// half depth (a radius twice over when `round`), for the editor and the level
// pad dug under it.
//
// Where they came from (tools/summit-layout/v04/): the user's arrows on four
// photos, kept here as `from`, each view's arrow endpoint in that photo's own
// UV (0–1, top left). A is a summer shot from almost straight above, B a summer
// one low from the south-east, C a winter one from the north-east and D a
// winter one high from the south. Cameras fitted to the two stations in A, B
// and D (tools/review/summit.html shows them) cast those arrows onto the ground;
// `how` says how that went. Object 6 follows the user's later C/D arrows. None
// of this is surveyed: the photos give no scale, north or height, so the
// stations set the scale and the rest is as near as the photos allow.
export const SUMMIT = {
  stations: [1127891899, 1127891930], // 6号索道, 7号索道
  // Where the frame's origin was when this was laid out (x, z), should the lifts go missing.
  origin: [349.8, -403.45],
  objects: [
    {
      id: 'summit:object-1', label: '1', kind: 'yurt', en: 'Yurt', zh: '传统蒙古包',
      at: [24.4, -35], yaw: -0.68, size: [3.3, 3.3], round: true,
      from: { A: [0.3, 0.6038], B: [0.8318, 0.6054], C: [0.4385, 0.7265], D: [0.602, 0.5234] },
      how: 'A and D cast to 8 m of each other (D hits the roof, so lands north); the middle. Door turned to the plaza: a guess.',
    },
    {
      id: 'summit:object-2', label: '2', kind: 'signpost', en: 'Four-country signpost', zh: '一眼望四国路牌',
      at: [0.5, -3.5], yaw: 0, size: [2.6, 2.6], round: true,
      from: { A: [0.4276, 0.5377], B: [0.4029, 0.6311], C: [0.3972, 0.4752], D: [0.4742, 0.694] },
      how: 'A, B and D cast within 4 m. Its arrows point the real ways: Russia north, Mongolia east, Kazakhstan west, China south.',
    },
    ...[[-37.4, -5.2], [-43.6, -3.2], [-49.8, -1.2]].map((at, i) => ({
      id: `summit:object-3-set-${i + 1}`, label: `3·${i + 1}`, kind: 'prayerWheels', en: `Prayer wheels ${i + 1} of 3`, zh: `转经轮 第${i + 1}组`,
      at, yaw: 0.31, size: [2.7, 0.75],
      from: i ? {} : { A: [0.5645, 0.6639], B: [0.16, 0.4847], C: [0.5883, 0.4416], D: [0.2853, 0.5441] },
      how: 'The arrows mark the area only. Three sets in a row, 6.5 m apart, along the long roof seen in A and D (which cast to x -35 to -48), from G6 toward the ovoo; each set\'s own place and turn are estimates. Their fronts face the path out to the ovoo, so it passes them on your right.',
    })),
    {
      id: 'summit:object-4', label: '4', kind: 'ovoo', en: 'Ovoo and prayer flags', zh: '敖包与经幡',
      at: [-70, 7], yaw: 1.77, size: [3.4, 3.4], round: true,
      from: { A: [0.6705, 0.7173], C: [0.6184, 0.3498], D: [0.1169, 0.5564] },
      how: 'A\'s circle casts to (-76, 14), D\'s half in frame to (-68, 4); set between, 4 m off A and half out of D\'s frame as there. Steps face the path from G6.',
    },
    {
      id: 'summit:object-5', label: '5', kind: 'hut', en: 'Small wooden hut', zh: '小木屋',
      at: [-21.5, -19.5], yaw: 0.83, size: [1.8, 1.5],
      from: { A: [0.4617, 0.6968], B: [0.366, 0.5081], C: [0.6175, 0.5063], D: [0.4003, 0.5114] },
      how: 'A and D cast within 3 m, at the mast\'s foot. What it is for is not known.',
    },
    {
      id: 'summit:object-6', label: '6', kind: 'photoFrame', en: 'Giant photo frame', zh: '巨型木相框',
      at: [3.5, -24.5], yaw: -0.06, size: [2.7, 1.0],
      from: { A: [0.3674, 0.5988], B: [0.5783, 0.5925], C: [0.4973, 0.5812], D: [0.5128, 0.532] },
      how: 'The user\'s later D arrow (on its top bar) cast to (3, -28), its base about 3 m nearer; B\'s face-on frame casts to (2, -21). Faces the plaza, its plane east–west as D and B see it.',
    },
    {
      id: 'summit:object-7', label: '7', kind: 'cabin', en: 'Coffee cabin', zh: '咖啡小屋',
      at: [-20, -57], yaw: 0.34, size: [5, 4.75],
      from: { A: [0.3813, 0.868], B: [0.6073, 0.5595], C: [0.9128, 0.763], D: [0.4492, 0.3552] },
      how: 'A and D cast within 2 m, out on the shoulder past the mast. Door to the way up from the plaza: a guess.',
    },
    {
      id: 'summit:object-8', label: '8', kind: 'swing', en: 'Two-seat swing', zh: '双座秋千',
      at: [7.5, -5], yaw: -0.2, size: [2.9, 0.5],
      from: { A: [0.3961, 0.4889], B: [0.4877, 0.6696], C: [0.3207, 0.5089], D: [0.5301, 0.7116] },
      how: 'A, B and D cast to x 5–12, z -6 to 2; drawn 3 m west of that so it clears the game\'s wider G7 station. Beam east–west as in A and D.',
    },
    ...[[-4.3, -96, 0.05, [0.5229, 0.2482]], [2.5, -105.5, -0.02, [0.5449, 0.2312]], [37, -109, -0.33, [0.6421, 0.2692]]].map(([x, z, yaw, d], i) => ({
      id: `summit:object-9-pod-${i + 1}`, label: `9${'abc'[i]}`, kind: 'pod', en: `Dome pod ${'abc'[i]}`, zh: `穹顶帐篷 ${'abc'[i]}`,
      at: [x, z], yaw, size: [2.3, 2.3], round: true,
      from: { D: d },
      how: 'D only, from a pick of each pod (the arrow marks the three together), cast onto the shoulder raised for them; a, b, c left to right in D.',
    })),
    {
      id: 'summit:helper-mast', label: 'M', kind: 'mast', en: 'Telecoms mast', zh: '通信杆',
      at: [-28, -25.3], yaw: 0, size: [0.7, 0.7],
      from: {},
      how: 'Not one of the nine: fitted as a free point with camera D (base and top), and A agrees within 2 m. A landmark for checking the views.',
    },
  ],
  // The ground, in the same metres. Heights are metres above the plaza, the
  // ground under the two stations (their mean). Each line is levelled to its
  // heights within r0 of it, easing back to the ground by r1; then the knoll
  // is heaped on, and every object gets a level pad under it.
  terrain: {
    // One snow terrace joining the two stations, the plaza and the mast.
    terrace: { lines: [[[-22, 5, 0], [0, -4, 0], [21, -6, 0]], [[-26, -24, 0], [-6, -10, 0]]], r0: 14, r1: 30 },
    // The path along a low ridge from G6 out to the ovoo: level past the prayer
    // wheels, then rising to the ovoo.
    ridge: { line: [[-28, -3, 0.3], [-53, -0.5, 0.4], [-62, 5, 2], [-70, 7, 3]], r0: 3, r1: 12 },
    // The outer shoulder, from the mast out past the coffee cabin to the pods,
    // with the steep ground beyond it left as it is.
    shoulder: { line: [[-24, -24, 0], [-13, -42, -3], [-16, -58, -5], [-8, -80, -6.5], [-2, -98, -7.5], [14, -106, -7.5], [37, -109, -8]], r0: 5, r1: 16 },
    // The rounded knoll behind G7 the yurt stands on: long toward the
    // north-north-east, steep on its north-west side (the cornice in D), easy
    // on the other.
    knoll: { at: [28, -52], axis: [0.6, -0.8], half: 30, nw: 11, se: 22, height: 4 },
  },
};

export const SUMMIT_IDS = SUMMIT.objects.map((o) => o.id);
export const summitObject = (id) => SUMMIT.objects.find((o) => o.id === id);
