// Every sound is synthesized with WebAudio: engine hum, two-tone siren,
// gunshots, chimes and a laid-back bass-led music loop. No audio files.
import { G } from './state.js';

let ctx = null;
let master = null;
let musicBus = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let musicTimer = null;
let nextNoteAt = 0;
let step = 0;

// A minor-key bass walk (Hz) and a sparse lead line over 8 beats.
const BASS_LINE = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
const LEAD_LINE = [220, 0, 261.63, 0, 329.63, 0, 293.66, 246.94];
const STEP_SECONDS = 0.24;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = G.muted ? 0 : 0.5;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.16;
    musicBus.connect(master);

    // Engine: a sawtooth through a lowpass, pitch and volume follow speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();

    // Siren: a triangle wave wobbling between two pitches on a slow square LFO.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 750;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.9;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 220;
    lfo.connect(lfoDepth);
    lfoDepth.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    lfo.start();

    startMusicLoop();
  } catch (e) {
    ctx = null;
  }
}

export function setMuted(m) {
  G.muted = m;
  if (master && ctx) master.gain.value = m ? 0 : 0.5;
}

export function setEngine(speedFrac, driving) {
  if (!ctx || !engineOsc) return;
  const vol = driving ? 0.05 + speedFrac * 0.075 : 0;
  engineGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
  engineOsc.frequency.setTargetAtTime(55 + speedFrac * 145, ctx.currentTime, 0.08);
}

export function setSiren(on) {
  if (!ctx || !sirenGain) return;
  sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.3);
}

// One short oscillator blip with an exponential fade.
function tone(freq, dur, type, vol, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A burst of filtered noise, for shots, crashes and hi-hats.
function noiseBurst(dur, vol, cutoff, destination) {
  if (!ctx) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(destination || master);
  src.start(ctx.currentTime);
}

export function sfxShot() {
  noiseBurst(0.12, 0.5, 2400);
  tone(140, 0.1, 'square', 0.25);
}

export function sfxPunch() {
  tone(90, 0.12, 'sine', 0.5);
  tone(55, 0.14, 'triangle', 0.4, 0.02);
}

export function sfxChime() {
  tone(880, 0.18, 'sine', 0.3);
  tone(1318, 0.28, 'sine', 0.3, 0.09);
}

export function sfxPickup() {
  tone(660, 0.12, 'sine', 0.3);
  tone(990, 0.2, 'sine', 0.3, 0.07);
}

export function sfxCrash() {
  noiseBurst(0.18, 0.4, 900);
}

export function sfxBusted() {
  tone(392, 0.3, 'triangle', 0.35);
  tone(311, 0.45, 'triangle', 0.35, 0.28);
}

export function sfxMission() {
  [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'sine', 0.3, i * 0.1));
}

function startMusicLoop() {
  if (!ctx || musicTimer) return;
  nextNoteAt = ctx.currentTime + 0.1;
  step = 0;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    if (G.muted) {
      nextNoteAt = Math.max(nextNoteAt, ctx.currentTime + 0.05);
      return;
    }
    while (nextNoteAt < ctx.currentTime + 0.3) {
      scheduleStep(step, nextNoteAt);
      nextNoteAt += STEP_SECONDS;
      step = (step + 1) % 32;
    }
  }, 90);
}

function scheduleStep(s, t) {
  if (!ctx || !musicBus) return;
  const dur = STEP_SECONDS;
  // Bass note on every beat (every 4th step).
  if (s % 4 === 0) {
    const f = BASS_LINE[Math.floor(s / 4) % BASS_LINE.length];
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 3.4);
    osc.connect(gain);
    gain.connect(musicBus);
    osc.start(t);
    osc.stop(t + dur * 3.5);
  }
  // Sparse lead pluck on steps 2 and 6 of each bar.
  const lead = LEAD_LINE[s % LEAD_LINE.length];
  if (lead && s % 2 === 0 && (s % 8 === 2 || s % 8 === 6)) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = lead;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 2);
    osc.connect(gain);
    gain.connect(musicBus);
    osc.start(t);
    osc.stop(t + dur * 2.1);
  }
  // Hat tick on the off-beats.
  if (s % 2 === 1) {
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(musicBus);
    src.start(t);
  }
}
