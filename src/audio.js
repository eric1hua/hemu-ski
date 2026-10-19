// Procedural sound: wind that rises with speed, a scrape for edge/skid, and the
// pickup's engine.
// Effects and music play through their own buses, switched from the menu.
export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
  }
  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(ctx.destination);
    this.music = ctx.createGain(); // nothing plays on it yet
    this.music.gain.value = this.musicOn ? 1 : 0;
    this.music.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = () => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass';
    this.windF.Q.value = 0.7;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    noise().connect(this.windF).connect(this.windG).connect(this.sfx);

    this.scrapeF = ctx.createBiquadFilter();
    this.scrapeF.type = 'highpass';
    this.scrapeF.frequency.value = 1800;
    this.scrapeG = ctx.createGain();
    this.scrapeG.gain.value = 0;
    noise().connect(this.scrapeF).connect(this.scrapeG).connect(this.sfx);

    // Engine: a sawtooth and a square an octave down, through a low-pass that
    // opens on the throttle.
    this.engF = ctx.createBiquadFilter();
    this.engF.type = 'lowpass';
    this.engF.Q.value = 2;
    this.engG = ctx.createGain();
    this.engG.gain.value = 0;
    this.engF.connect(this.engG).connect(this.sfx);
    this.eng = ['sawtooth', 'square'].map((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = i ? 0.6 : 1;
      o.connect(g).connect(this.engF);
      o.start();
      return o;
    });
  }
  setSfx(on) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  // `engine` ({ speed, throttle }) while you drive the pickup, else null.
  update(speed, slip, grounded, engine = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = Math.min(1, speed / 25);
    this.windG.gain.setTargetAtTime(0.02 + w * w * 0.22, t, 0.2);
    this.windF.frequency.setTargetAtTime(300 + w * 900, t, 0.2);
    const s = grounded ? Math.min(1, slip / 6) * Math.min(1, speed / 5) : 0;
    this.scrapeG.gain.setTargetAtTime(grounded ? 0.015 + s * 0.12 : 0, t, 0.05);
    // Revs climb through each gear (every 7 m/s) and drop back at the shift.
    const gear = engine ? Math.min(4, Math.floor(engine.speed / 7)) : 0;
    const rev = engine ? Math.min(1.1, (engine.speed - gear * 7) / 7 * (gear ? 0.65 : 1) + (gear ? 0.35 : 0)) : 0;
    const load = engine?.throttle ? 1 : 0;
    const hz = 34 + rev * 52 + load * 6;
    this.eng.forEach((o, i) => o.frequency.setTargetAtTime(i ? hz / 2 : hz, t, 0.08));
    this.engF.frequency.setTargetAtTime(220 + rev * 260 + load * 420, t, 0.08);
    this.engG.gain.setTargetAtTime(engine ? 0.05 + load * 0.05 : 0, t, engine ? 0.1 : 0.3);
  }
}
