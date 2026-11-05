// Tiny procedural sound engine. No assets, no network, all synthesized.
const MUTE_KEY = 'neon-rampage-muted';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.lastHit = 0;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.24;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise();
  }

  makeNoise() {
    const length = Math.floor(this.ctx.sampleRate * 0.6);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  get on() {
    return !this.muted && !!this.ctx;
  }

  setMuted(value) {
    this.muted = !!value;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {}
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.24, this.ctx.currentTime, 0.02);
    }
    if (!this.muted) this.ui();
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  tone(f0, f1, dur, type = 'square', vol = 0.15, delay = 0) {
    if (!this.on) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise(dur, vol, cutoff = 900, delay = 0) {
    if (!this.on) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.18), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shoot() {
    this.tone(920 + Math.random() * 80, 320, 0.06, 'square', 0.06);
  }

  hit() {
    const now = performance.now();
    if (now - this.lastHit < 40) return;
    this.lastHit = now;
    this.tone(240, 110, 0.045, 'square', 0.055);
  }

  explode() {
    this.noise(0.22, 0.17, 1500);
    this.tone(160, 42, 0.2, 'sawtooth', 0.08);
  }

  bigExplode() {
    this.noise(0.55, 0.26, 2200);
    this.tone(120, 30, 0.55, 'sawtooth', 0.14);
  }

  rescue() {
    this.tone(523, 523, 0.08, 'triangle', 0.12);
    this.tone(784, 784, 0.08, 'triangle', 0.12, 0.075);
    this.tone(1046, 1046, 0.12, 'triangle', 0.12, 0.15);
  }

  death() {
    this.tone(440, 70, 0.6, 'sawtooth', 0.14);
    this.noise(0.45, 0.2, 1200);
  }

  wave() {
    this.tone(330, 330, 0.09, 'square', 0.09);
    this.tone(440, 440, 0.09, 'square', 0.09, 0.1);
    this.tone(660, 660, 0.16, 'square', 0.1, 0.2);
  }

  extra() {
    this.tone(880, 880, 0.07, 'triangle', 0.13);
    this.tone(1174, 1174, 0.07, 'triangle', 0.13, 0.07);
    this.tone(1568, 1568, 0.16, 'triangle', 0.13, 0.14);
  }

  gameOver() {
    this.tone(330, 330, 0.18, 'square', 0.1);
    this.tone(262, 262, 0.18, 'square', 0.1, 0.2);
    this.tone(196, 196, 0.22, 'square', 0.1, 0.4);
    this.tone(131, 60, 0.7, 'sawtooth', 0.12, 0.65);
  }

  ui() {
    this.tone(660, 660, 0.04, 'square', 0.06);
  }
}
