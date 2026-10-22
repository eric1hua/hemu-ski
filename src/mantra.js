// Om Mani Padme Hum, the six-syllable mantra the prayer wheels carry, chanted
// low by a few voices in unison (Sound.setMantra plays it while they turn).
// A buzzing voice, its harmonics falling away as the vocal folds' do, goes
// through the mouth's resonances (formants) side by side, and they glide from
// sound to sound as each syllable is said; the m's and n's hum through the
// nose's, and the h and the p's release are breath through the same mouth.
// It works on any audio context, so it can be rendered offline to listen to.

const BASE = 98; // Hz, G2: the voices' note; one more sings an octave under it
const WIDTH = [90, 110, 170, 250]; // each formant's bandwidth, Hz
// Each sound: its four formants (Hz) and how loud each is, then how much hums
// through the nose, how much is voiced and how much is breath (1, 1 and 0 if
// not given). A p's lips are closed, then let go in a puff (`burst`).
const A = { f: [750, 1150, 2500, 3400], a: [1, 0.7, 0.35, 0.2] };
const U = { f: [320, 800, 2300, 3200], a: [1, 0.35, 0.08, 0.05] };
const SOUNDS = {
  o: { f: [500, 850, 2500, 3300], a: [1, 0.5, 0.15, 0.1] },
  a: A,
  i: { f: [280, 2250, 2950, 3500], a: [0.6, 2, 1.2, 0.6] },
  e: { f: [450, 1900, 2550, 3400], a: [0.9, 1, 0.6, 0.3] },
  u: U,
  m: { f: [270, 1100, 2300, 3200], a: [0.2, 0.04, 0.02, 0.01], nose: 0.5, voice: 0.8 },
  n: { f: [270, 1600, 2500, 3300], a: [0.2, 0.06, 0.03, 0.01], nose: 0.45, voice: 0.8 },
  p: { ...A, voice: 0, burst: true },
  d: { f: [250, 1700, 2600, 3300], a: [0.15, 0.02, 0.01, 0], nose: 0.15, voice: 0.4 },
  h: { ...U, voice: 0.08, breath: 0.6 },
  _: { f: [500, 850, 2500, 3300], a: [0, 0, 0, 0], voice: 0 }, // a breath between
};
// One saying, as [sound, seconds, semitones off the note]: Om, Ma, Ni, Pad, Me,
// Hum, the Hum falling away, and a breath before the next.
const MANTRA = [
  ['o', 0.5, 0], ['m', 0.4, 0],
  ['m', 0.08, 0], ['a', 0.4, 0],
  ['n', 0.08, 0], ['i', 0.4, 0],
  ['p', 0.07, 2], ['a', 0.38, 2], ['d', 0.05, 2],
  ['m', 0.08, 0], ['e', 0.42, 0],
  ['h', 0.1, 0], ['u', 0.4, 0], ['m', 0.75, -1],
  ['_', 0.45, -1],
];

export class Mantra {
  // Into `dest`, at `out`'s gain (0 to begin with); `noise` is a buffer of
  // white noise to breathe with.
  constructor(ctx, dest, noise) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // A little room round it: a short tail of reverb.
    const verb = ctx.createConvolver();
    verb.buffer = tail(ctx, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.out.connect(verb).connect(wet).connect(dest);
    const mouth = ctx.createGain();
    mouth.connect(this.out);

    // The voices, a hair apart, each wavering a little: one pitch (in cents off
    // the note) for them all.
    this.pitch = ctx.createConstantSource();
    this.pitch.offset.value = 0;
    const n = 48, real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = 1 / k;
    const wave = ctx.createPeriodicWave(real, imag);
    this.voice = ctx.createGain(); // voicing
    this.voice.gain.value = 0;
    this.sources = [this.pitch];
    for (const [mul, level, wob] of [[1, 1, 4.7], [1.006, 0.7, 5.3], [0.995, 0.7, 4.3], [0.5, 0.45, 3.9]]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = BASE * mul;
      this.pitch.connect(o.detune);
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = wob;
      depth.gain.value = 7;
      lfo.connect(depth).connect(o.detune);
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(this.voice);
      this.sources.push(o, lfo);
    }
    // Breath: noise, its rumble cut.
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    this.breath = ctx.createGain();
    this.breath.gain.value = 0;
    hiss.connect(hp).connect(this.breath);
    this.sources.push(hiss);

    // The mouth's four resonances, the nose's one, and the chest: the voice's
    // own low notes under them.
    this.formants = WIDTH.map((width, k) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = SOUNDS._.f[k];
      f.Q.value = f.frequency.value / width;
      const g = ctx.createGain();
      g.gain.value = 0;
      this.voice.connect(f);
      this.breath.connect(f);
      f.connect(g).connect(mouth);
      return { f, g, width };
    });
    const nose = ctx.createBiquadFilter();
    nose.type = 'bandpass';
    nose.frequency.value = 260;
    nose.Q.value = 2.5;
    this.nose = ctx.createGain();
    this.nose.gain.value = 0;
    this.voice.connect(nose).connect(this.nose).connect(mouth);
    const chest = ctx.createBiquadFilter();
    chest.type = 'lowpass';
    chest.frequency.value = 200;
    const chestG = ctx.createGain();
    chestG.gain.value = 0.1;
    this.voice.connect(chest).connect(chestG).connect(mouth);

    const t = ctx.currentTime;
    for (const s of this.sources) s.start(t);
  }

  // Says it once from `t` (the context's time), and returns when it's done.
  say(t) {
    for (const [name, dur, semis] of MANTRA) {
      const s = SOUNDS[name], glide = name === 'p' ? 0.012 : 0.03;
      this.formants.forEach(({ f, g, width }, k) => {
        f.frequency.setTargetAtTime(s.f[k], t, glide);
        f.Q.setTargetAtTime(s.f[k] / width, t, glide);
        g.gain.setTargetAtTime(s.a[k], t, glide);
      });
      this.nose.gain.setTargetAtTime(s.nose ?? 0, t, glide);
      this.voice.gain.setTargetAtTime(s.voice ?? 1, t, name === 'o' ? 0.08 : 0.02);
      this.breath.gain.setTargetAtTime(s.breath ?? 0, t, 0.02);
      if (s.burst) this.breath.gain.setValueAtTime(0.5, t + dur - 0.015); // the next sound breathes it out
      this.pitch.offset.setTargetAtTime(semis * 100, t, 0.05);
      t += dur;
    }
    return t;
  }

  stop() {
    const t = this.ctx.currentTime;
    for (const s of this.sources) s.stop(t);
    this.out.disconnect();
  }
}

// A stereo reverb tail, `secs` long: noise dying away.
function tail(ctx, secs) {
  const len = Math.round(ctx.sampleRate * secs), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-i / len) * 7);
  }
  return buf;
}
