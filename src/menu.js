// Sidebar menu: a shortcut to the diorama, panels for the rider (see main.js),
// outfit & gear and settings, and music / sound-effect toggles. Settings are
// remembered between visits; createMenu() hands back { prefs, save } so the
// game can keep its rider in the same place.
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
    if (e.code === 'Escape' && open) show(null);
  });
  window.addEventListener('pointerdown', (e) => {
    if (open && !root.contains(e.target)) show(null);
  });

  return { prefs, save };
}
