// Bruitages et musique synthétisés en direct avec la Web Audio API (aucun fichier son).
const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

export class Sfx {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.nextNote = 0;
    this.step = 0;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.setMusic(this.musicOn);
    setInterval(() => this.schedule(), 50);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide, delay = 0, out } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + Math.max(0, delay);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.2, freq = 1000, to, q = 1, type = 'lowpass', delay = 0, out } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + Math.max(0, delay);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  jump() { this.tone(300, 0.18, { slide: 620, vol: 0.18 }); }
  land(v) { this.noise(0.14, { freq: 380, vol: Math.min(0.45, v * 0.025) }); }
  pop(pitch = 1) {
    this.tone(880 * pitch, 0.09, { slide: 1500 * pitch, vol: 0.16 });
    this.tone(1760 * pitch, 0.07, { type: 'triangle', vol: 0.06, delay: 0.02 });
  }
  grab() {
    this.tone(190, 0.06, { type: 'square', vol: 0.06 });
    this.noise(0.05, { freq: 2500, vol: 0.08, type: 'bandpass' });
  }
  release() { this.tone(150, 0.05, { type: 'square', vol: 0.04 }); }
  whoosh() { this.noise(0.28, { type: 'bandpass', freq: 500, to: 1800, q: 1.5, vol: 0.18 }); }
  nope() { this.tone(110, 0.15, { type: 'square', vol: 0.06, slide: 90 }); }
  poof() { this.noise(0.45, { freq: 1200, to: 150, vol: 0.3 }); }
  checkpoint() {
    [72, 76, 79, 84].forEach((m, i) => this.tone(midiToHz(m), 0.25, { type: 'triangle', vol: 0.13, delay: i * 0.08 }));
  }
  finish() {
    [72, 76, 79, 84, 79, 84, 88].forEach((m, i) =>
      this.tone(midiToHz(m), i === 6 ? 0.8 : 0.22, { type: 'triangle', vol: 0.15, delay: i * 0.12 }));
    this.noise(1.2, { freq: 6000, type: 'highpass', vol: 0.06, delay: 0.7 });
  }

  // ---------- Musique : petite boucle guitare/xylophone façon "jardin" ----------

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 0.3);
    if (on && this.nextNote < this.ctx.currentTime) this.nextNote = this.ctx.currentTime + 0.1;
  }

  toggleMusic() {
    this.setMusic(!this.musicOn);
    return this.musicOn;
  }

  schedule() {
    if (!this.ctx || !this.musicOn) return;
    const eighth = 60 / 100 / 2;
    while (this.nextNote < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextNote - this.ctx.currentTime);
      this.nextNote += eighth;
      this.step++;
    }
  }

  playStep(i, delay) {
    const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]; // Do, Lam, Fa, Sol
    const melody = [76, null, 74, 72, null, 74, 76, null, 72, null, 69, null, 72, 74, null, null,
      77, null, 76, 74, null, 72, 74, null, 74, null, 71, null, 74, 76, null, null];
    const bar = Math.floor(i / 8) % 4;
    const pos = i % 8;
    const chord = chords[bar];
    const out = this.musicBus;

    const arp = [0, 1, 2, 1, 0, 2, 1, 2][pos];
    this.tone(midiToHz(chord[arp] + (pos === 4 ? 12 : 0)), 0.32, { type: 'triangle', vol: 0.1, delay, out });
    if (pos === 0 || pos === 4) this.tone(midiToHz(chord[0] - 24), 0.45, { vol: 0.22, delay, out });
    if (pos % 2 === 1) this.noise(0.04, { freq: 7000, type: 'highpass', vol: 0.035, delay, out });

    const note = melody[i % melody.length];
    if (note && Math.floor(i / 32) % 2 === 1) {
      this.tone(midiToHz(note + 12), 0.5, { vol: 0.05, delay, out });
    }
  }
}
