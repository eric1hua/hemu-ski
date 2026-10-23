// Touch controls for phones and tablets: a floating stick low on the left and
// up to five round buttons by the right thumb. The stick centres wherever the
// thumb lands; read() turns it into what the keys give the game (steer -1 to 1,
// A positive, and up / down past a third of the way, like W and S), and the
// held buttons stand in for Space and Shift. Tapped buttons call onTap(name).
// Which buttons show, and what they say, follows the game (see touchLayout in
// main.js).
//
// Touch mode starts on a coarse pointer, or at the first touch, and ends at the
// next key press or mouse click, so the prompts and the first panel say "drag"
// or "W" to suit what you're using; body.touch carries it for the CSS.

const REACH = 46; // px the knob travels from the stick's centre
const DEAD = 0.12; // the middle of the stick that doesn't steer
const PUSH = 0.35; // how far up or down counts as W or S
const FULL = 0.9; // pushed out this far: run, on foot

const svg = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  ollie: '<path d="M4 19h16M12 15V4M7.5 8.5 12 4l4.5 4.5"/>',
  brake: '<circle cx="12" cy="12" r="6"/><path d="M12 9v3.6M12 15.2v.1"/><path d="M4.8 6.5a8.5 8.5 0 0 0 0 11M19.2 6.5a8.5 8.5 0 0 1 0 11"/>',
  up: '<path d="M12 19V6M5.5 12 12 5.5 18.5 12"/>',
  down: '<path d="M12 5v13M5.5 12 12 18.5 18.5 12"/>',
  board: '<rect x="2.5" y="9.5" width="19" height="5.5" rx="2.75" fill="#d9534a"/><path d="M8.5 9.5v5.5M15.5 9.5v5.5"/>',
  foot: '<circle cx="13.5" cy="4.5" r="2"/><path d="M10 21l2.5-6.5L10 11l1.5-4 3 2.5 3 1M11.5 7 8 9.5 7 13M12.5 14.5 16 17l1 4"/>',
  lift: '<path d="M2 5.5 22 2M12 4v4"/><rect x="6" y="8" width="12" height="12" rx="2.5"/><path d="M6 13h12"/>',
  in: '<path d="M14 4h5v16h-5"/><path d="M10 8l4 4-4 4M14 12H5"/>',
  out: '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  skip: '<path d="M5 6l7 6-7 6zM12 6l7 6-7 6z"/>',
  paw: '<ellipse cx="12" cy="15.5" rx="4.5" ry="3.8"/><circle cx="6" cy="10" r="1.8"/><circle cx="9.8" cy="6.4" r="1.8"/><circle cx="14.2" cy="6.4" r="1.8"/><circle cx="18" cy="10" r="1.8"/>',
  ball: '<circle cx="15" cy="9" r="5" fill="#fff"/><path d="M3 20c3-1 5-3 7-6"/>',
  wheel: '<rect x="8.5" y="2.5" width="7" height="11" rx="1.5"/><path d="M10.5 6h3M10.5 10h3"/><path d="M20.5 13a8.5 4.5 0 0 1-17 0"/><path d="M1.6 15.4 3.5 13l2.6 1.6"/>',
};
// What each button can be: its label and icon, and whether it's held (read as
// a key) or tapped.
const KINDS = {
  ollie: { label: 'Ollie', icon: 'ollie', hold: true },
  handbrake: { label: 'Handbrake', icon: 'brake', hold: true },
  hold: { label: 'Hold water', icon: 'brake', hold: true }, // the boat's oars held in the water
  up: { label: 'Up', icon: 'up', hold: true },
  down: { label: 'Down', icon: 'down', hold: true },
  board: { label: 'Board', icon: 'board' },
  foot: { label: 'On foot', icon: 'foot' },
  throw: { label: 'Throw', icon: 'ball' },
};

export class TouchPad {
  // `onTap(name)`: a tapped button ('act', 'alt', 'aux' or 'big' when it isn't held);
  // `onMode(on)`: touch mode switched; `onPress()`: any touch on the controls
  // (to start the sound, which needs a gesture).
  constructor({ onTap, onMode, onPress }) {
    Object.assign(this, { onTap, onMode, onPress });
    this.el = document.getElementById('touch');
    this.zone = this.el.querySelector('.zone');
    this.stickEl = this.el.querySelector('.stick');
    this.knob = this.stickEl.querySelector('i');
    this.buttons = {};
    this.shown = {}; // name → what it shows now, so the DOM changes only when that does
    this.specs = {}; // name → the button's spec, or null
    this.held = { big: false, low: false };
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.visible = false;
    this.on = false;

    for (const name of ['big', 'low', 'act', 'alt', 'aux']) {
      const b = this.el.querySelector(`.${name}`);
      this.buttons[name] = b;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // no focus, no mouse events after the touch
        this.onPress?.();
        if (!this.#kind(name)?.hold) return;
        try { b.setPointerCapture(e.pointerId); } catch {}
        this.#hold(name, true);
      });
      const letGo = () => this.#hold(name, false);
      b.addEventListener('pointerup', letGo);
      b.addEventListener('pointercancel', letGo);
      b.addEventListener('lostpointercapture', letGo);
      b.addEventListener('click', () => {
        if (!this.#kind(name)?.hold) this.onTap?.(name);
      });
    }

    const z = this.zone;
    z.addEventListener('pointerdown', (e) => this.#down(e));
    z.addEventListener('pointermove', (e) => this.#move(e));
    z.addEventListener('pointerup', (e) => this.#up(e));
    z.addEventListener('pointercancel', (e) => this.#up(e));

    // The last thing you used decides the mode.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.setMode(true);
      else if (e.pointerType === 'mouse') this.setMode(false);
    }, true);
    window.addEventListener('keydown', () => this.setMode(false), true);
    window.addEventListener('blur', () => this.release());
    document.addEventListener('visibilitychange', () => this.release());
    this.setMode(matchMedia('(pointer: coarse)').matches, true);
  }

  setMode(on, initial = false) {
    if (on === this.on && !initial) return;
    this.on = on;
    document.body.classList.toggle('touch', on);
    if (!on) this.show(false);
    if (!initial) this.onMode?.(on);
  }

  // The stick and the held buttons, as the game reads them each frame.
  read() {
    const { x, y } = this.stick, s = -x, a = Math.abs(s);
    return {
      steer: a < DEAD ? 0 : (Math.sign(s) * (a - DEAD)) / (1 - DEAD),
      up: y < -PUSH,
      down: y > PUSH,
      full: Math.hypot(x, y) > FULL,
      big: this.held.big && !!this.#kind('big')?.hold,
      low: this.held.low,
    };
  }

  show(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.el.classList.toggle('hidden', !v);
    if (!v) this.release();
  }

  // What shows: `layout` names the arrangement for the CSS ('board', 'walk',
  // 'drive', 'fly' or 'lift'); `big`, `low`, `alt` and `aux` a kind from
  // KINDS, or null; `act` { label, icon, lit, dim }, or null.
  layout({ layout, stick = true, big = null, low = null, alt = null, aux = null, act = null }) {
    if (this.shown.layout !== layout) {
      this.shown.layout = layout;
      this.el.dataset.layout = layout;
    }
    if (this.shown.stick !== stick) {
      this.shown.stick = stick;
      this.zone.classList.toggle('hidden', !stick);
      this.stickEl.classList.toggle('hidden', !stick);
      if (!stick) this.#reset();
    }
    this.#set('big', big && KINDS[big]);
    this.#set('low', low && KINDS[low]);
    this.#set('alt', alt && KINDS[alt]);
    this.#set('aux', aux && KINDS[aux]);
    this.#set('act', act);
  }

  // Lets go of everything: the stick back to rest, every button up.
  release() {
    this.#reset();
    this.#hold('big', false);
    this.#hold('low', false);
  }

  #kind(name) { return this.specs[name] ?? null; }

  #set(name, spec) {
    const key = spec ? JSON.stringify(spec) : '';
    if (this.shown[name] === key) return;
    this.shown[name] = key;
    this.specs[name] = spec || null;
    const b = this.buttons[name];
    b.classList.toggle('hidden', !spec);
    if (!spec) { this.#hold(name, false); return; }
    b.innerHTML = `${svg(ICONS[spec.icon] ?? '')}<span>${spec.label}</span>`;
    b.setAttribute('aria-label', spec.hold ? `${spec.label} (hold)` : spec.label);
    b.classList.toggle('lit', !!spec.lit);
    b.classList.toggle('dim', !!spec.dim);
    if (!spec.hold) this.#hold(name, false);
  }

  #hold(name, on) {
    if (!(name in this.held) || this.held[name] === on) return;
    this.held[name] = on;
    this.buttons[name].classList.toggle('down', on);
  }

  // ---------- The stick ----------
  #down(e) {
    if (this.stick.id !== null) return;
    e.preventDefault();
    this.onPress?.();
    try { this.zone.setPointerCapture(e.pointerId); } catch {}
    // Centred under the thumb, but kept on the screen.
    const m = this.stickEl.offsetWidth / 2 + 6;
    const ox = Math.min(Math.max(e.clientX, m), window.innerWidth - m);
    const oy = Math.min(Math.max(e.clientY, m), window.innerHeight - m);
    Object.assign(this.stick, { id: e.pointerId, ox, oy, x: 0, y: 0 });
    const s = this.stickEl.style;
    s.left = `${ox - this.stickEl.offsetWidth / 2}px`;
    s.top = `${oy - this.stickEl.offsetHeight / 2}px`;
    s.bottom = 'auto';
    this.stickEl.classList.add('live');
    this.#move(e);
  }

  #move(e) {
    const S = this.stick;
    if (e.pointerId !== S.id) return;
    let dx = e.clientX - S.ox, dy = e.clientY - S.oy;
    const d = Math.hypot(dx, dy);
    if (d > REACH) { dx *= REACH / d; dy *= REACH / d; }
    S.x = dx / REACH;
    S.y = dy / REACH;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  #up(e) {
    if (e.pointerId === this.stick.id) this.#reset();
  }

  #reset() {
    Object.assign(this.stick, { id: null, x: 0, y: 0 });
    this.stickEl.removeAttribute('style');
    this.stickEl.classList.remove('live');
    this.knob.style.transform = '';
  }
}
