// Sidebar menu: a shortcut to the diorama, back to the start (see main.js),
// panels for the rider (see main.js), outfit & gear and settings, and music /
// sound-effect toggles. Settings are remembered between visits; createMenu()
// hands back { prefs, save, close } so the game can keep its rider in the same
// place and fold the menu away.
const PREFS_KEY = 'hemu-ski.prefs';

function loadPrefs() {
  const prefs = { music: true, sfx: true };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)));
  } catch {}
  return prefs;
}

export function createMenu(sound) {
  const root = document.getElementById('menu');
  const prefs = loadPrefs();
  const save = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  };

  // A click shouldn't leave the button focused: Space (ollie) would press it again.
  root.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, a')) e.preventDefault();
  });

  // ---------- Toggles ----------
  const toggles = [
    ['music', 'mi-music', 'Music', (on) => sound.setMusic(on)],
    ['sfx', 'mi-sfx', 'Sound effects', (on) => sound.setSfx(on)],
  ];
  for (const [key, id, name, apply] of toggles) {
    const btn = document.getElementById(id);
    const set = (on) => {
      prefs[key] = on;
      btn.setAttribute('aria-pressed', String(on));
      btn.dataset.tip = `${name}: ${on ? 'on' : 'off'}`;
      apply(on);
    };
    set(prefs[key] !== false);
    btn.addEventListener('click', () => {
      sound.start();
      set(!prefs[key]);
      save();
    });
  }

  // ---------- Folded ----------
  // On a touch screen (body.touch) the rail folds away behind one button in the
  // corner, clear of the thumbs, and drops down as a row when you tap it.
  const toggle = root.querySelector('.toggle');
  let expanded = false;
  function expand(on) {
    expanded = on;
    root.classList.toggle('expanded', on);
    toggle.setAttribute('aria-expanded', String(on));
    if (!on) show(null);
  }
  toggle.addEventListener('click', () => expand(!expanded));

  // ---------- Panels ----------
  // One open at a time; its button stays lit. Escape or a click elsewhere closes it.
  const openers = [...root.querySelectorAll('[data-flyout]')];
  let open = null;
  function show(name) {
    open = name;
    for (const btn of openers) {
      const on = btn.dataset.flyout === name;
      btn.setAttribute('aria-expanded', String(on));
      document.getElementById(`fly-${btn.dataset.flyout}`).classList.toggle('hidden', !on);
    }
    root.classList.toggle('open', !!name);
  }
  for (const btn of openers)
    btn.addEventListener('click', () => show(open === btn.dataset.flyout ? null : btn.dataset.flyout));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && (open || expanded)) expand(false);
  });
  window.addEventListener('pointerdown', (e) => {
    if ((open || expanded) && !root.contains(e.target)) expand(false);
  });

  return { prefs, save, close: () => expand(false) };
}
