// Places the diorama can send you to in the game, written as a key that both
// pages carry in their URL (?at=<key>):
//   run:<OSM id>                the top of that run, ready to drop in
//   lift:<OSM id>:bottom|top    beside one of a lift's stations
//   lift:<OSM id>:ride          at the bottom station, boarding straight away
//   lodge:<id>                  outside a service centre's hall
// Runs and lifts keep their OpenStreetMap ids in both bakes and in the map
// editor's saves, so a key names the same place on both pages even though
// their coordinates differ.
const LIFT_ENDS = new Set(['bottom', 'top', 'ride']);

export function destinationKey(d) {
  if (d.kind === 'run') return `run:${d.id}`;
  if (d.kind === 'lift') return `lift:${d.id}:${d.end}`;
  return `lodge:${d.id}`;
}

// The key's parts, or null if it isn't one.
export function parseDestination(key) {
  const [kind, id, end] = String(key ?? '').split(':');
  if (!id) return null;
  if (kind === 'run' || kind === 'lodge') return { kind, id };
  if (kind === 'lift') return { kind, id, end: LIFT_ENDS.has(end) ? end : 'bottom' };
  return null;
}

export const destinationFromURL = () => parseDestination(new URLSearchParams(location.search).get('at'));

// Where a run starts. OpenStreetMap often splits one run into several ways
// under the same name, so of all the ways sharing its name, take the highest
// end of any; `points` is that way, ordered downhill from there.
export function runTop(hf, runs, id) {
  const run = runs.find((r) => String(r.id) === String(id));
  if (!run) return null;
  const family = run.name ? runs.filter((r) => r.name === run.name) : [run];
  let best = null;
  for (const r of family)
    for (const end of [0, r.points.length - 1]) {
      const [x, z] = r.points[end];
      const y = hf.heightAt(x, z);
      if (!best || y > best.y) best = { run: r, x, y, z, points: end ? [...r.points].reverse() : r.points };
    }
  return best;
}

// The page that is being opened passes a line for its loading screen through
// here ("Off to 云霄峰道"), so the hand-off reads as one move.
const NOTE_KEY = 'hemu-ski.arriving';
export function noteArrival(text) {
  try {
    sessionStorage.setItem(NOTE_KEY, text);
  } catch {}
}
export function takeArrivalNote() {
  try {
    const text = sessionStorage.getItem(NOTE_KEY);
    sessionStorage.removeItem(NOTE_KEY);
    return text;
  } catch {
    return null;
  }
}
