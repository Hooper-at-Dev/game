// Tiny synthesised sound kit. No audio files.
let ctx;

function tone(f, d = 0.12, type = 'triangle', vol = 0.1, slide = 0, delay = 0) {
  if (sfx.muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + d + 0.02);
}

function noise(d = 0.2, vol = 0.25) {
  if (sfx.muted || !ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * d, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start();
}

export const sfx = {
  muted: localStorage.cf_mute === '1',
  unlock() {
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
    } catch {
      /* no audio, no problem */
    }
  },
  toggle() {
    this.muted = !this.muted;
    localStorage.cf_mute = this.muted ? '1' : '0';
    return this.muted;
  },
  click: () => tone(520, 0.05, 'square', 0.04),
  pop: () => tone(340, 0.09, 'sine', 0.12, 420),
  tick: () => tone(880, 0.03, 'square', 0.035),
  turn: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, 0, i * 0.08)),
  deal: () => [392, 330, 262].forEach((f, i) => tone(f, 0.2, 'sawtooth', 0.045, 0, i * 0.12)),
  power: () => [660, 880, 1320, 1760].forEach((f, i) => tone(f, 0.1, 'sine', 0.08, 0, i * 0.05)),
  vote: () => tone(180, 0.16, 'square', 0.06, -80),
  stamp: () => {
    noise(0.22, 0.3);
    tone(90, 0.3, 'sine', 0.3, -50);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, 0, i * 0.11)),
  lose: () => [330, 294, 220].forEach((f, i) => tone(f, 0.25, 'triangle', 0.09, 0, i * 0.14)),
  coin: () => tone(1200, 0.08, 'square', 0.035, 500),
};
