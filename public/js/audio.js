// Sonidos y música sintetizados en vivo con WebAudio (sin archivos externos).
const PREFS_KEY = 'rinconcito.audio';

class Audio {
  constructor() {
    this.ctx = null;
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { /* */ }
    this.prefs = { music: p.music ?? 0.55, sfx: p.sfx ?? 0.8, muted: !!p.muted };
    this.mood = 'isla';
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* */ } }

  // En iPhone el audio solo arranca después de un toque
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master); this.sfxGain.connect(this.master);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.timer) this.startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.prefs.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.prefs.music * 0.32, t, 0.1);
    this.sfxGain.gain.setTargetAtTime(this.prefs.sfx * 0.6, t, 0.05);
  }
  set(key, v) { this.prefs[key] = v; this.applyVolumes(); this.savePrefs(); }

  // ------------------------------------------------------------ primitivas
  tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.005, dest = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { vol = 0.3, at = 0, freq = 1200, q = 0.8, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t); s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || this.prefs.muted) return;
    const T = (f, d, o) => this.tone(f, d, o);
    switch (name) {
      case 'chop': this.noise(0.09, { freq: 500, vol: 0.5 }); T(140, 0.12, { type: 'triangle', vol: 0.35, slide: 0.6 }); break;
      case 'mine': T(1250, 0.09, { type: 'square', vol: 0.1, slide: 0.7 }); this.noise(0.06, { freq: 3000, vol: 0.2 }); break;
      case 'pick': T(520, 0.08, { vol: 0.25, slide: 1.6 }); T(780, 0.1, { vol: 0.18, at: 0.05 }); break;
      case 'till': this.noise(0.14, { freq: 350, vol: 0.45, type: 'lowpass' }); break;
      case 'water': this.noise(0.35, { freq: 2600, vol: 0.18, q: 0.4 }); break;
      case 'plant': T(400, 0.07, { vol: 0.25, slide: 1.4 }); break;
      case 'harvest': T(660, 0.1, { vol: 0.22 }); T(990, 0.14, { vol: 0.2, at: 0.08 }); break;
      case 'splash': this.noise(0.3, { freq: 900, vol: 0.4 }); break;
      case 'bite': T(300, 0.12, { vol: 0.3, slide: 2 }); T(600, 0.1, { vol: 0.2, at: 0.1 }); break;
      case 'tap': T(880, 0.05, { type: 'triangle', vol: 0.18 }); break;
      case 'good': T(1046, 0.08, { type: 'triangle', vol: 0.22 }); break;
      case 'bad': T(220, 0.12, { type: 'triangle', vol: 0.25, slide: 0.7 }); break;
      case 'catch': [523, 659, 784, 1046].forEach((f, i) => T(f, 0.18, { type: 'triangle', vol: 0.22, at: i * 0.08 })); break;
      case 'lost': T(392, 0.15, { type: 'triangle', vol: 0.2 }); T(294, 0.25, { type: 'triangle', vol: 0.2, at: 0.13 }); break;
      case 'hit': T(180, 0.1, { type: 'square', vol: 0.12, slide: 0.5 }); this.noise(0.05, { freq: 1500, vol: 0.3 }); break;
      case 'poof': this.noise(0.25, { freq: 1800, vol: 0.3, q: 0.3 }); T(700, 0.15, { vol: 0.15, slide: 1.8 }); break;
      case 'hurt': T(440, 0.18, { type: 'square', vol: 0.1, slide: 0.45 }); break;
      case 'swing': this.noise(0.08, { freq: 2200, vol: 0.18, q: 0.6 }); break;
      case 'craft': [784, 988, 1175].forEach((f, i) => T(f, 0.2, { vol: 0.16, at: i * 0.06 })); break;
      case 'love': [659, 830, 988].forEach((f, i) => T(f, 0.6, { vol: 0.12, at: i * 0.04, attack: 0.03 })); break;
      case 'ui': T(700, 0.04, { type: 'triangle', vol: 0.12 }); break;
      case 'door': T(200, 0.12, { type: 'triangle', vol: 0.25 }); T(160, 0.12, { type: 'triangle', vol: 0.25, at: 0.12 }); break;
      case 'eat': this.noise(0.05, { freq: 900, vol: 0.3 }); this.noise(0.05, { freq: 900, vol: 0.3, at: 0.12 }); T(600, 0.1, { vol: 0.15, at: 0.24, slide: 1.3 }); break;
      case 'error': T(260, 0.09, { type: 'triangle', vol: 0.18 }); T(220, 0.12, { type: 'triangle', vol: 0.18, at: 0.08 }); break;
      case 'fanfare': [523, 659, 784, 659, 1046].forEach((f, i) => T(f, 0.22, { type: 'triangle', vol: 0.2, at: i * 0.11 })); break;
      case 'tick': T(1400, 0.03, { type: 'square', vol: 0.05 }); break;
      case 'musicbox': [784, 988, 1175, 988, 784, 659, 784, 988, 784, 659, 587, 659].forEach((f, i) => T(f, 0.5, { vol: 0.13, at: i * 0.22, attack: 0.002 })); break;
    }
  }

  // ------------------------------------------------------------ música
  setMood(m) { this.mood = m; }
  startMusic() {
    this.nextTime = this.ctx.currentTime + 0.2;
    this.timer = setInterval(() => this.schedule(), 60);
  }
  schedule() {
    if (!this.ctx) return;
    const beat = 60 / 84 / 2; // corcheas a 84 bpm
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 64;
      this.nextTime += beat;
    }
  }
  playStep(step, time) {
    const at = time - this.ctx.currentTime;
    const M = this.musicGain;
    const midi = (n) => 440 * 2 ** ((n - 69) / 12);
    const bar = Math.floor(step / 16) % 4, s = step % 16;
    if (this.mood === 'cueva') {
      const roots = [45, 41, 43, 40]; // la menor, fa, sol, mi
      if (s === 0) this.tone(midi(roots[bar]), 2.2, { type: 'sine', vol: 0.35, at, attack: 0.3, dest: M });
      if (s % 4 === 2 && ((step * 7) % 5 < 2)) this.tone(midi(roots[bar] + 24 + [0, 3, 7, 10][(step >> 2) % 4]), 0.9, { type: 'triangle', vol: 0.12, at, attack: 0.01, dest: M });
      return;
    }
    const night = this.mood === 'noche' || this.mood === 'casa';
    // Fa mayor: I - vi - IV - V
    const chords = [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 58]];
    const ch = chords[bar];
    if (s === 0 || s === 8) this.tone(midi(ch[0] - 12), 0.9, { type: 'sine', vol: 0.4, at, attack: 0.02, dest: M });
    if (!night || s % 2 === 0) {
      const arp = [0, 1, 2, 3, 2, 1, 2, 3];
      this.tone(midi(ch[arp[s % 8]] + 12), 0.5, { type: 'triangle', vol: night ? 0.07 : 0.09, at, attack: 0.008, dest: M });
    }
    // melodía suave cada tanto
    const mel = [72, -1, 69, -1, 67, 69, -1, 65, -1, -1, 64, 65, 67, -1, -1, -1];
    if (bar % 2 === 1 && mel[s] > 0) this.tone(midi(mel[s] + (bar === 3 ? -2 : 0)), 0.7, { type: 'sine', vol: 0.12, at, attack: 0.02, dest: M });
  }
}

export const audio = new Audio();
