// Procedural sound: wind that rises with speed, and a scrape for edge/skid.
export class Sound {
  constructor() { this.ctx = null; }
  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
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
    noise().connect(this.windF).connect(this.windG).connect(ctx.destination);

    this.scrapeF = ctx.createBiquadFilter();
    this.scrapeF.type = 'highpass';
    this.scrapeF.frequency.value = 1800;
    this.scrapeG = ctx.createGain();
    this.scrapeG.gain.value = 0;
    noise().connect(this.scrapeF).connect(this.scrapeG).connect(ctx.destination);
  }
  update(speed, slip, grounded) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = Math.min(1, speed / 25);
    this.windG.gain.setTargetAtTime(0.02 + w * w * 0.22, t, 0.2);
    this.windF.frequency.setTargetAtTime(300 + w * 900, t, 0.2);
    const s = grounded ? Math.min(1, slip / 6) * Math.min(1, speed / 5) : 0;
    this.scrapeG.gain.setTargetAtTime(grounded ? 0.015 + s * 0.12 : 0, t, 0.05);
  }
}
