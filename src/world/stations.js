// Where the lift stations stand, from the lifts' map lines. No three.js here, so
// the map data (world/data.js) can use it as well as the props.

// How far a station is pulled back along its own line when the map data has two
// lines meeting end to end (No. 1's top is No. 7's bottom): they're separate
// stations on the mountain, back to back with a gap between.
export const STATION_PULL = 20;

// Where each lift's two stations stand, as [[x, z], [x, z]] from points[0] to
// the far end (null for a magic carpet, which has none): at its ends, pulled
// back along its own line where two lifts meet end to end.
export function liftStations(lifts, stationScale = 1) {
  const endKey = (p) => `${p[0]},${p[1]}`;
  const ends = new Map();
  for (const l of lifts) {
    if (l.type === 'magic_carpet') continue;
    for (const p of [l.points[0], l.points[l.points.length - 1]]) ends.set(endKey(p), (ends.get(endKey(p)) || 0) + 1);
  }
  const ownEnd = (p, toward) => {
    if (ends.get(endKey(p)) < 2) return p;
    const dx = toward[0] - p[0], dz = toward[1] - p[1], L = Math.hypot(dx, dz);
    const d = STATION_PULL * stationScale;
    return [p[0] + (dx / L) * d, p[1] + (dz / L) * d];
  };
  return lifts.map((l) => {
    if (l.type === 'magic_carpet') return null;
    const p = l.points, last = p.length - 1;
    return [ownEnd(p[0], p[1]), ownEnd(p[last], p[last - 1])];
  });
}
