// All sound is synthesized with WebAudio: engine hum, sirens, gunshots, chimes
// and a laid-back bass-led music loop. No audio files, no network.
import { G } from './state.js';

let ctx = null;
let master = null;
let musicGain = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenLfo = null;
let musicTimer = null;
let nextNoteTime = 0;
let step = 0;

const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42]; // A1 A1 C2 G1 A1 A1 E2 D2
const LEAD = [220, 0, 261.63, 0, 329.63, 0, 293.66, 246.94];

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = G.muted ? 0 : 0.5;
    master.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 750;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();

    startMusic();
  } catch (e) { ctx = null; }
}

export function setMuted(m) {
  G.muted = m;
  if (master && ctx) master.gain.value = m ? 0 : 0.5;
}

export function setEngine(speedFrac, driving) {
  if (!ctx || !engineOsc) return;
  const target = driving ? 0.05 + speedFrac * 0.075 : 0;
  engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
  engineOsc.frequency.setTargetAtTime(55 + speedFrac * 145, ctx.currentTime, 0.08);
}

export function setSiren(on) {
  if (!ctx || !sirenGain) return;
  sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.3);
}

function blip(freq, dur, type, vol, when = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function sfxShot() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = 0.5;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  blip(140, 0.1, 'square', 0.25);
}

export function sfxPunch() { blip(90, 0.12, 'sine', 0.5); blip(55, 0.14, 'triangle', 0.4, 0.02); }
export function sfxChime() { blip(880, 0.18, 'sine', 0.3); blip(1318, 0.28, 'sine', 0.3, 0.09); }
export function sfxPickup() { blip(660, 0.12, 'sine', 0.3); blip(990, 0.2, 'sine', 0.3, 0.07); }
export function sfxCrash() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.18);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.8;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = 0.4;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}
export function sfxBusted() { blip(392, 0.3, 'triangle', 0.35); blip(311, 0.45, 'triangle', 0.35, 0.28); }
export function sfxMission() { [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'sine', 0.3, i * 0.1)); }

function startMusic() {
  if (!ctx || musicTimer) return;
  nextNoteTime = ctx.currentTime + 0.1;
  step = 0;
  musicTimer = setInterval(() => {
    if (!ctx || G.muted) { nextNoteTime = Math.max(nextNoteTime, ctx.currentTime + 0.05); return; }
    const stepDur = 0.24;
    while (nextNoteTime < ctx.currentTime + 0.3) {
      scheduleStep(step, nextNoteTime, stepDur);
      nextNoteTime += stepDur;
      step = (step + 1) % 32;
    }
  }, 90);
}

function scheduleStep(s, t, dur) {
  if (!ctx || !musicGain) return;
  // Bass on every beat (4 steps).
  if (s % 4 === 0) {
    const f = BASS[Math.floor(s / 4) % BASS.length];
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 3.4);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur * 3.5);
  }
  // Sparse lead pluck.
  const lead = LEAD[s % LEAD.length];
  if (lead && s % 2 === 0 && (s % 8 === 2 || s % 8 === 6)) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = lead;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 2);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur * 2.1);
  }
  // Hat tick on off-beats.
  if (s % 2 === 1) {
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.5;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.12;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t);
  }
}
