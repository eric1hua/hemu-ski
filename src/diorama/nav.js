// Point-and-click navigation on the diorama. Clicking a run, a lift, one of its
// stations or a service centre selects it: it stays highlighted and a card
// offers to send you there in the game, as a destination key (destinations.js).
// The "You" pin (you.js) is picked the same way; its card can take you back.
// The selection is also kept in this page's address (?at=<key>), so coming back
// from the game, by Back or by the game's own menu, finds it again.
import * as THREE from 'three';
import { parseDestination, runTop } from '../destinations.js';

const TABS = { run: 'Run', lift: 'Lift', station: 'Lift station', lodge: 'Service centre', you: 'You' };
const m = (v) => `${Math.round(v).toLocaleString()} m`;

export class Nav {
  // `describe(item)` gives the tooltip's text; `onLook(item)` frames it;
  // `onGo(key, item)` sends you into the game; `onBack(item)`, if given, back
  // to where you were in it. `you()` is the "You" pin's item, or null.
  constructor({ hf, runs, runMap, lodges, stations, you, describe, onSelect, onLook, onGo, onBack }) {
    Object.assign(this, { hf, runs, runMap, lodges, stations, you, describe, onSelect, onLook, onGo, onBack });
    this.selected = null;
    this.actions = [];
    this.el = document.getElementById('pick');
    this.acts = this.el.querySelector('.acts');
    this.el.querySelector('.x').addEventListener('click', () => this.select(null));
    this.acts.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.#act(this.actions[+b.dataset.i]);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.selected || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Escape') this.select(null);
      // A focused card button gets Enter as its own click.
      else if (e.code === 'Enter' && !e.target.closest?.('button, a')) {
        e.preventDefault();
        this.#act(this.actions[0]);
      }
    });
  }

  select(item) {
    if (item === this.selected) return;
    this.selected = item;
    this.runMap.setPicked(item);
    this.#keepInURL();
    this.el.classList.toggle('hidden', !item);
    document.body.classList.toggle('picking', !!item);
    this.onSelect?.(item);
    if (item) this.#fill(item);
  }

  // The selection moved (the "You" pin follows you): paint and describe it again.
  refresh() {
    if (!this.selected) return;
    this.runMap.setPicked(null);
    this.runMap.setPicked(this.selected);
    this.#fill(this.selected);
  }

  #fill(item) {
    const d = this.describe(item);
    const { what, acts } = this.#offers(item);
    this.actions = acts;
    const $ = (s) => this.el.querySelector(s);
    $('.tab').textContent = TABS[item.kind];
    $('.badge').className = `badge ${d.badge}`;
    $('.zh').textContent = d.zh;
    $('.en').textContent = d.en;
    $('.en').classList.toggle('hidden', !d.en);
    $('.rows').innerHTML = d.rows.map(([v, k]) => `<span><b>${v}</b>${k ? ` ${k}` : ''}</span>`).join('');
    $('.what').textContent = what;
    this.acts.innerHTML = acts
      .map((a, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'go' : a.look ? 'look' : ''}">${a.label}${a.key || a.back ? ' ▸' : ''}</button>`)
      .join('');
  }

  // What the card offers for each kind of place; the first is the main one.
  #offers(item) {
    const look = { label: 'Look closer', look: true };
    const id = item.kind === 'station' ? item.lift.lift.id : item.lift?.id;
    switch (item.kind) {
      case 'run': {
        const top = runTop(this.hf, this.runs, item.runs[0].id);
        return {
          what: `You drop in at the top, ${m(top.y)} up, and ride it down.`,
          acts: [{ label: 'Ride it from the top', key: `run:${top.run.id}` }, look],
        };
      }
      case 'you':
        return {
          what: item.outside ? 'You’re past the edge of the table, out this way.' : 'Where you are in the game.',
          acts: [...(this.onBack ? [{ label: 'Back to riding', back: true }] : []), look],
        };
      case 'lodge':
        return {
          what: `Tickets, food and rentals. Board ${item.lift} at its station out front, or ride off from the door.`,
          acts: [{ label: 'Go to the hall', key: `lodge:${item.id}` }, look],
        };
      case 'station':
        return item.end === 'bottom'
          ? {
              what: `Board here for the ride up to ${m(item.lift.topY)}, or ride off from the station.`,
              acts: [{ label: 'Go to the station', key: `lift:${id}:bottom` }, { label: 'Board and ride up', key: `lift:${id}:ride` }, look],
            }
          : {
              what: `Step off at ${m(item.y)} and take any run down from here.`,
              acts: [{ label: 'Go to the top station', key: `lift:${id}:top` }, look],
            };
      default: {
        const belt = item.lift.type === 'magic_carpet';
        return {
          what: belt ? 'A beginners’ belt on the nursery slope.' : `Runs from ${m(item.bottomY)} up to ${m(item.topY)}.`,
          acts: [
            { label: belt ? 'Go to the bottom' : 'Bottom station', key: `lift:${id}:bottom` },
            { label: belt ? 'Go to the top' : 'Top station', key: `lift:${id}:top` },
            look,
          ],
        };
      }
    }
  }

  #act(a) {
    if (!a) return;
    if (a.look) this.onLook(this.selected);
    else if (a.back) this.onBack(this.selected);
    else this.onGo(a.key, this.itemOf(a.key) ?? this.selected);
  }

  // The selection's own key: for a lift (its cable) that's `lift:<id>`, which
  // the game reads as its bottom station.
  keyOf(item) {
    if (item.kind === 'you') return 'you';
    if (item.kind === 'run') return `run:${runTop(this.hf, this.runs, item.runs[0].id).run.id}`;
    if (item.kind === 'lodge') return `lodge:${item.id}`;
    if (item.kind === 'station') return `lift:${item.lift.lift.id}:${item.end}`;
    return `lift:${item.lift.id}`;
  }

  itemOf(key) {
    if (key === 'you') return this.you();
    const d = parseDestination(key);
    if (!d) return null;
    if (d.kind === 'run') return this.runMap.groups.find((g) => g.runs.some((r) => String(r.id) === d.id)) ?? null;
    if (d.kind === 'lodge') return this.lodges.find((l) => l.id === d.id) ?? null;
    if (key.split(':')[2]) {
      const end = d.end === 'ride' ? 'bottom' : d.end;
      const st = this.stations.find((s) => String(s.lift.lift.id) === d.id && s.end === end);
      if (st) return st;
    }
    return this.runMap.lifts.find((l) => String(l.lift.id) === d.id) ?? null;
  }

  // Where the camera looks for an item, and how much of the table it spans.
  // `dive` aims at the spot the game puts you: a run's top, a station's door.
  focus(item, { dive = false } = {}) {
    const p = new THREE.Vector3();
    const ground = (x, z) => p.set(x, this.hf.heightAt(x, z), z);
    switch (item.kind) {
      case 'run': {
        if (dive) {
          const top = runTop(this.hf, this.runs, item.runs[0].id);
          return { point: ground(top.x, top.z), size: 400 };
        }
        const box = new THREE.Box2();
        for (const r of item.runs) for (const [x, z] of r.points) box.expandByPoint(new THREE.Vector2(x, z));
        const c = box.getCenter(new THREE.Vector2()), s = box.getSize(new THREE.Vector2());
        return { point: ground(c.x, c.y), size: Math.max(s.x, s.y) };
      }
      case 'lift': {
        if (dive) return { point: ground(item.lift.points[0][0], item.lift.points[0][1]), size: 400 };
        const a = item.lift.points[0], b = item.lift.points[item.lift.points.length - 1];
        return { point: ground((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), size: item.length };
      }
      default:
        return { point: ground(item.x, item.z), size: item.ring * 6 };
    }
  }

  #keepInURL() {
    const url = new URL(location.href);
    if (this.selected) url.searchParams.set('at', this.keyOf(this.selected));
    else url.searchParams.delete('at');
    url.search = url.searchParams.toString().replaceAll('%3A', ':').replaceAll('%2C', ',');
    history.replaceState(history.state, '', url);
  }
}
