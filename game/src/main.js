// Solmar Heat — game entry point: loop, controls, driving, crime, zones,
// menus, saving and screenshot staging.
import { G, say } from './state.js';
import { clamp, lerp, dist, angleTo, angleDiff, fmtCash, TAU } from './util.js';
import { buildCity, collideBuildings, pointInBuilding, inWater, BLOCK } from './city.js';
import { draw, drawMinimap } from './render.js';
import { spawnWorld, reseed, updateTraffic, updatePeds, updatePolice, updateBullets, updateParticles, spawnPolice, addWanted, damagePlayer, shoot, punch, makeCar } from './actors.js';
import { MISSIONS, startMission, updateMission, tryStartFare, updateFare } from './missions.js';
import { saveGame, loadGame, applySave, hasSave, clearSave } from './save.js';
import { initAudio, setMuted, setEngine, setSiren, sfxChime, sfxCrash, sfxPickup } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Minimap canvas, overlaid top-right of the game area.
const mini = document.createElement('canvas');
mini.width = 180;
mini.height = 180;
mini.style.cssText = 'position:absolute;top:12px;right:12px;border:2px solid rgba(255,215,94,0.7);border-radius:8px;z-index:4;background:#0e1424;';
document.getElementById('wrap').appendChild(mini);
const mctx = mini.getContext('2d');

let last = performance.now();
let saveTimer = 0;
let policeTimer = 0;
let shotTimer = 0;

const WORLD_SEED = 20261117;

function newGame(seed) {
  G.seed = seed;
  reseed(seed);
  G.city = buildCity(seed);
  spawnWorld();
  G.cash = 250;
  G.health = 100;
  G.wanted = 0;
  G.ammo = 0;
  G.hasPistol = false;
  G.shells = 0;
  G.missionsDone = 0;
  G.missionIndex = 0;
  G.storyDone = false;
  G.freeRoam = false;
  G.mission = null;
  G.fare = null;
  G.farePed = null;
  G.retryMission = null;
  G.clock = 14 * 60 + 20;
  G.time = 0;
  G.stats = { stolen: 0, fares: 0, shots: 0, kos: 0, distance: 0 };
  const z = G.city.zones.safehouse;
  // Start on the road just south of the safehouse, facing north up the street.
  G.player = { x: z.x, y: 4 * BLOCK, angle: -Math.PI / 2, speed: 0, car: null, walkPhase: 0, punchT: 0, shootT: 0 };
  G.cam.x = G.player.x;
  G.cam.y = G.player.y;
  G.objective = 'Drive to the safehouse to start your first job';
  say('Welcome to Solmar Bay, Danny Rook. Mara Voss is waiting at the safehouse.', 6);
  setTimeout(() => {
    if (G.mode === 'play' && !G.mission && G.missionIndex === 0 && !G.shotMode) startMission(0);
  }, 4000);
}

function showOnly(id) {
  for (const el of ['titleScreen', 'howScreen', 'pauseScreen', 'bustedScreen', 'wastedScreen', 'endScreen']) {
    document.getElementById(el).classList.add('hidden');
  }
  if (id) document.getElementById(id).classList.remove('hidden');
}

function setMode(mode) {
  G.mode = mode;
  if (mode === 'play') showOnly(null);
  if (mode === 'paused') {
    document.getElementById('pauseStats').textContent =
      'Cash ' + fmtCash(G.cash) + '  •  Jobs done ' + G.missionsDone + '/' + MISSIONS.length +
      '  •  Shells ' + G.shells + '/' + G.shellsTotal + '  •  Cars stolen ' + G.stats.stolen;
    showOnly('pauseScreen');
  }
}

function startPlaying(fresh) {
  initAudio();
  if (fresh) newGame(WORLD_SEED);
  setMode('play');
}

// ---- Input ----
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  G.keys[e.code] = true;
  initAudio();
  if (e.code === 'KeyP' && (G.mode === 'play' || G.mode === 'paused')) setMode(G.mode === 'play' ? 'paused' : 'play');
  if (e.code === 'KeyM') {
    setMuted(!G.muted);
    document.getElementById('btnMute').textContent = 'SOUND: ' + (G.muted ? 'OFF' : 'ON');
  }
  if (e.code === 'KeyH' && G.mode === 'play') G.help = !G.help;
  if (e.code === 'KeyE' && G.mode === 'play') interact();
  if (e.code === 'KeyF' && G.mode === 'play') doPunch();
  if (e.code === 'Escape' && G.mode === 'play') setMode('paused');
});
window.addEventListener('keyup', (e) => {
  G.keys[e.code] = false;
});
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  G.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  G.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', (e) => {
  initAudio();
  if (e.button === 0 && G.mode === 'play') {
    G.mouse.down = true;
    doShoot();
  }
});
window.addEventListener('mouseup', () => {
  G.mouse.down = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function aimAngle(fromX, fromY) {
  const wx = G.cam.x - 640 + G.mouse.x;
  const wy = G.cam.y - 360 + G.mouse.y;
  return angleTo(fromX, fromY, wx, wy);
}

function doShoot() {
  const p = G.player;
  if (!p || shotTimer > 0) return;
  shotTimer = 0.25;
  const fx = p.car ? p.car.x : p.x;
  const fy = p.car ? p.car.y : p.y;
  const a = aimAngle(fx, fy);
  shoot(fx, fy, a);
  p.angle = a; // Danny turns to face the shot, on foot or driving
}

function doPunch() {
  const p = G.player;
  if (!p || p.punchT > 0 || p.car) return;
  p.punchT = 0.5;
  punch(p.x, p.y, p.angle);
}

// ---- Interaction (E key) ----
function nearestCar(maxD) {
  let best = null;
  let bd = maxD;
  for (const c of G.cars) {
    const d = dist(c.x, c.y, G.player.x, G.player.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function interact() {
  const p = G.player;
  if (!p) return;
  // In a car: try to pick up a taxi fare first, otherwise step out.
  if (p.car) {
    tryStartFare();
    if (!G.fare) exitCar();
    return;
  }
  // On foot near Ironclad Arms: buy a pistol or more ammo.
  const arms = G.city.zones.arms;
  if (dist(p.x, p.y, arms.x, arms.y) < 90) {
    if (!G.hasPistol) {
      if (G.cash >= 350) {
        G.cash -= 350;
        G.hasPistol = true;
        G.ammo = 12;
        say('Pistol bought — 12 rounds included. Ammo $2 a round.', 4);
        sfxChime();
      } else {
        say('A pistol costs $350 — you have ' + fmtCash(G.cash) + '.', 4);
      }
    } else if (G.cash >= 48) {
      G.cash -= 48;
      G.ammo += 24;
      say('Bought 24 rounds. Ammo: ' + G.ammo, 3);
      sfxChime();
    } else {
      say('Ammo is $48 for 24 rounds.', 3);
    }
    return;
  }
  // On foot near the clinic: heal up.
  const clinic = G.city.zones.clinic;
  if (dist(p.x, p.y, clinic.x, clinic.y) < 90) {
    if (G.health < 100) {
      if (G.cash >= 50) {
        G.cash -= 50;
        G.health = 100;
        say('Patched up at the Bay Clinic. Health full.', 3);
        sfxChime();
      } else {
        say('Treatment costs $50.', 3);
      }
    } else {
      say('You are already in perfect health.', 3);
    }
    return;
  }
  // Retry a failed mission at the safehouse.
  const sh = G.city.zones.safehouse;
  if (G.retryMission && dist(p.x, p.y, sh.x, sh.y) < 90) {
    const idx = MISSIONS.indexOf(G.retryMission);
    G.retryMission = null;
    startMission(idx);
    return;
  }
  // Otherwise: get into the nearest car.
  const c = nearestCar(52);
  if (c) enterCar(c);
}

function enterCar(c) {
  const p = G.player;
  if (c.driver === 'traffic') {
    // The driver bails. If anyone saw it, the heat goes up.
    const seen = G.cars.some((o) => o.driver === 'police' && dist(o.x, o.y, c.x, c.y) < 420)
      || G.peds.some((q) => !q.dead && !q.cop && dist(q.x, q.y, c.x, c.y) < 130);
    c.driver = 'player';
    p.car = c;
    G.stats.stolen++;
    say('You stole the ' + c.type + '!', 3);
    if (seen) addWanted(1, 'someone saw you steal that car');
  } else {
    if (c.driver === 'police') addWanted(1, 'you stole a police car');
    c.driver = 'player';
    p.car = c;
    G.stats.stolen++;
    say('You took the ' + c.type + '.', 3);
  }
  p.x = c.x;
  p.y = c.y;
}

function exitCar() {
  const p = G.player;
  const c = p.car;
  if (!c) return;
  p.car = null;
  c.driver = 'parked';
  c.speed = 0;
  p.x = c.x + Math.cos(c.angle + Math.PI / 2) * 30;
  p.y = c.y + Math.sin(c.angle + Math.PI / 2) * 30;
  p.angle = c.angle;
}

// ---- Per-frame updates ----
function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;
  p.punchT = Math.max(0, p.punchT - dt);
  if (p.car) updateDriving(dt);
  else updateOnFoot(dt);
}

function updateOnFoot(dt) {
  const p = G.player;
  let mx = 0;
  let my = 0;
  if (G.keys.KeyW || G.keys.ArrowUp) my -= 1;
  if (G.keys.KeyS || G.keys.ArrowDown) my += 1;
  if (G.keys.KeyA || G.keys.ArrowLeft) mx -= 1;
  if (G.keys.KeyD || G.keys.ArrowRight) mx += 1;
  const sprinting = G.keys.ShiftLeft || G.keys.ShiftRight;
  const sp = sprinting ? 285 : 175;
  if (mx || my) {
    const len = Math.hypot(mx, my);
    mx /= len;
    my /= len;
    p.angle = Math.atan2(my, mx);
    p.walkPhase += dt * 11;
    p.x += mx * sp * dt;
    p.y += my * sp * dt;
    G.stats.distance += sp * dt;
  }
  const res = collideBuildings(p.x, p.y, 10, G.city);
  p.x = res.x;
  p.y = res.y;
  p.x = clamp(p.x, 16, G.city.W - 16);
  p.y = clamp(p.y, 16, G.city.H - 16);
  if (inWater(p.x, p.y)) p.y = 17 * BLOCK + 50;
  // Golden shell pickup.
  for (const s of G.city.shells) {
    if (!s.taken && dist(p.x, p.y, s.x, s.y) < 28) {
      s.taken = true;
      G.shells++;
      G.cash += 50;
      sfxPickup();
      say('Golden shell ' + G.shells + '/' + G.shellsTotal + '  +$50', 3);
    }
  }
  // Slow health regen while nobody is looking for you.
  if (G.wanted === 0 && G.health < 100) G.health = Math.min(100, G.health + 1.2 * dt);
}

function updateDriving(dt) {
  const p = G.player;
  const c = p.car;
  const fwd = (G.keys.KeyW || G.keys.ArrowUp ? 1 : 0) - (G.keys.KeyS || G.keys.ArrowDown ? 1 : 0);
  const steer = (G.keys.KeyA || G.keys.ArrowLeft ? -1 : 0) + (G.keys.KeyD || G.keys.ArrowRight ? 1 : 0);
  const handbrake = G.keys.Space;
  const rolling = Math.abs(c.speed) > 4;
  if (fwd > 0) c.speed += c.accel * dt * (c.speed < 0 ? 2.2 : 1);
  else if (fwd < 0) c.speed -= c.accel * 0.85 * dt * (c.speed > 0 ? 2.2 : 1);
  else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), (handbrake ? 500 : 130) * dt);
  if (handbrake && rolling) c.speed -= Math.sign(c.speed) * 260 * dt;
  c.speed = clamp(c.speed, -130, c.max);
  if (rolling) {
    const grip = handbrake ? 1.1 : 2.6;
    c.angle += steer * clamp(Math.abs(c.speed) / 160, 0, 1.6) * grip * dt * Math.sign(c.speed);
  }
  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const res = collideBuildings(nx, ny, 15, G.city);
  if (res.hit) {
    if (Math.abs(c.speed) > 200) {
      sfxCrash();
      damagePlayer(6, 'crash');
      G.shake = Math.max(G.shake, 5);
    }
    c.speed *= 0.45;
  }
  c.x = clamp(res.x, 16, G.city.W - 16);
  c.y = clamp(res.y, 16, G.city.H - 16);
  if (inWater(c.x, c.y)) {
    c.x -= Math.cos(c.angle) * 30;
    c.y -= Math.sin(c.angle) * 30;
    c.speed *= 0.4;
  }
  // Shove traffic cars out of the way.
  for (const o of G.cars) {
    if (o === c || o.driver === 'player') continue;
    const d = dist(o.x, o.y, c.x, c.y);
    if (d < 40 && d > 0.01) {
      const push = (40 - d) / d;
      const px = (o.x - c.x) * push * 0.5;
      const py = (o.y - c.y) * push * 0.5;
      o.x += px;
      o.y += py;
      c.x -= px;
      c.y -= py;
      if (Math.abs(c.speed) > 170) {
        sfxCrash();
        o.speed = Math.max(o.speed, 60);
        if (o.driver === 'traffic') o.driver = 'parked';
        G.shake = Math.max(G.shake, 4);
      }
    }
  }
  // Running over pedestrians is a crime.
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(ped.x, ped.y, c.x, c.y) < 26 && Math.abs(c.speed) > 60) {
      ped.dead = true;
      addWanted(1, 'you hit a pedestrian');
      G.stats.kos++;
      sfxCrash();
    }
  }
  p.x = c.x;
  p.y = c.y;
  G.stats.distance += Math.abs(c.speed) * dt;
  // Lube & Tune: fresh paint and a clean record, for a price.
  const g = G.city.zones.garage;
  if (G.wanted > 0 && dist(c.x, c.y, g.x, g.y) < 95 && Math.abs(c.speed) < 40) {
    if (G.cash >= 250) {
      G.cash -= 250;
      G.wanted = 0;
      c.hp = 100;
      say('Lube & Tune: fresh paint, clean record. -$250', 4);
      sfxChime();
    }
  }
}

function update(dt) {
  G.time += dt;
  G.clock = (G.clock + dt * 0.5) % (24 * 60);
  G.messageT = Math.max(0, G.messageT - dt);
  G.crimeCooldown = Math.max(0, G.crimeCooldown - dt);
  G.flash = Math.max(0, G.flash - dt * 2);
  G.shake = Math.max(0, G.shake - dt * 14);
  shotTimer = Math.max(0, shotTimer - dt);
  if (G.mouse.down) doShoot();

  updatePlayer(dt);
  updateTraffic(dt);
  updatePeds(dt);
  updateBullets(dt);
  updateParticles(dt);
  updateMission(dt);
  updateFare(dt);

  // Wanted: keep the pressure on, let a star fade when the player stays hidden.
  if (G.wanted > 0) {
    policeTimer -= dt;
    if (policeTimer <= 0) {
      policeTimer = 3;
      spawnPolice();
    }
    const nearCop = G.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, G.player.x, G.player.y) < 420)
      || G.peds.some((q) => q.cop && !q.dead && dist(q.x, q.y, G.player.x, G.player.y) < 300);
    if (!nearCop && G.crimeCooldown <= 0) {
      G.wantedTimer += dt;
      if (G.wantedTimer > 12) {
        G.wanted--;
        G.wantedTimer = 0;
        say('Heat dying down… wanted level ' + G.wanted, 3);
      }
    } else {
      G.wantedTimer = 0;
    }
  }
  updatePolice(dt);

  // Camera follows with a little look-ahead in the direction of travel.
  const p = G.player;
  const tx = p.car ? p.car.x + Math.cos(p.car.angle) * 60 : p.x;
  const ty = p.car ? p.car.y + Math.sin(p.car.angle) * 60 : p.y;
  const follow = 1 - Math.pow(0.001, dt);
  G.cam.x = lerp(G.cam.x, clamp(tx, 640, G.city.W - 640), follow);
  G.cam.y = lerp(G.cam.y, clamp(ty, 360, G.city.H - 360), follow);
  G.cam.x = clamp(G.cam.x, 640, Math.max(640, G.city.W - 640));
  G.cam.y = clamp(G.cam.y, 360, Math.max(360, G.city.H - 360));

  // Audio follows the car and the sirens.
  const driving = !!(p.car && Math.abs(p.car.speed) > 10);
  setEngine(driving ? Math.abs(p.car.speed) / p.car.max : 0, driving);
  setSiren(G.wanted > 0 && G.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < 700));

  // Autosave every 30 seconds of play.
  saveTimer += dt;
  if (saveTimer > 30) {
    saveTimer = 0;
    saveGame();
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.mode === 'play') update(dt);
  if (G.city) {
    draw(ctx);
    drawMinimap(mctx);
  }
  requestAnimationFrame(frame);
}

// ---- Menu wiring ----
document.getElementById('btnNew').addEventListener('click', () => {
  clearSave();
  startPlaying(true);
});
document.getElementById('btnContinue').addEventListener('click', () => {
  initAudio();
  const data = loadGame();
  if (data && applySave(data)) {
    setMode('play');
    say('Welcome back, Danny. Mara has work if you want it.', 5);
    if (G.missionIndex < MISSIONS.length && !G.mission) {
      setTimeout(() => startMission(G.missionIndex), 3000);
    }
  } else {
    startPlaying(true);
  }
});
document.getElementById('btnHow').addEventListener('click', () => showOnly('howScreen'));
document.getElementById('btnHowBack').addEventListener('click', () => showOnly('titleScreen'));
document.getElementById('btnResume').addEventListener('click', () => setMode('play'));
document.getElementById('btnSave').addEventListener('click', () => {
  saveGame();
  say('Game saved.', 2);
});
document.getElementById('btnMute').addEventListener('click', (e) => {
  setMuted(!G.muted);
  e.target.textContent = 'SOUND: ' + (G.muted ? 'OFF' : 'ON');
});
document.getElementById('btnQuit').addEventListener('click', () => {
  saveGame();
  setMode('title');
  showOnly('titleScreen');
  if (hasSave()) document.getElementById('btnContinue').classList.remove('hidden');
});
document.getElementById('btnBusted').addEventListener('click', () => {
  const c = G.city.zones.clinic;
  G.player.x = c.x;
  G.player.y = c.y + 40;
  G.player.car = null;
  G.wanted = 0;
  G.health = 100;
  G.cars = G.cars.filter((x) => x.driver !== 'police');
  G.peds = G.peds.filter((x) => !x.cop);
  setMode('play');
  say('Bail paid. Stay clean out there, Danny.', 4);
});
document.getElementById('btnWasted').addEventListener('click', () => {
  G.cash = Math.max(0, G.cash - 150);
  const c = G.city.zones.clinic;
  G.player.x = c.x;
  G.player.y = c.y + 40;
  G.player.car = null;
  G.wanted = 0;
  G.health = 100;
  G.cars = G.cars.filter((x) => x.driver !== 'police');
  G.peds = G.peds.filter((x) => !x.cop);
  setMode('play');
  say('The clinic patched you up. $150 for the trouble.', 4);
});
document.getElementById('btnFreeRoam').addEventListener('click', () => {
  G.freeRoam = true;
  setMode('play');
});
document.getElementById('btnEndTitle').addEventListener('click', () => {
  setMode('title');
  showOnly('titleScreen');
  if (hasSave()) document.getElementById('btnContinue').classList.remove('hidden');
});

// Debug hook for automated play-testing (not part of gameplay).
window.__solmar = () => {
  if (!G.player) return null;
  const px = G.player.car ? G.player.car.x : G.player.x;
  const py = G.player.car ? G.player.car.y : G.player.y;
  const cops = G.cars.filter((c) => c.driver === 'police');
  return {
    mode: G.mode,
    inCar: !!G.player.car,
    x: Math.round(px),
    y: Math.round(py),
    speed: Math.round(G.player.car ? G.player.car.speed : 0),
    wanted: G.wanted,
    health: Math.round(G.health),
    cash: Math.round(G.cash),
    mission: G.mission ? G.mission.def.title + ' stage ' + (G.mission.stage + 1) : null,
    objective: G.objective,
    cars: G.cars.length,
    peds: G.peds.filter((q) => !q.dead).length,
    police: cops.length,
    policeDist: cops.length ? Math.round(Math.min(...cops.map((c) => Math.hypot(c.x - px, c.y - py)))) : null,
    bullets: G.bullets.length,
    ammo: G.ammo,
  };
};

// ---- Boot ----
if (hasSave()) document.getElementById('btnContinue').classList.remove('hidden');
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  // Deterministic screenshot staging: build the world, stage the scene, play.
  G.shotMode = shot;
  newGame(WORLD_SEED);
  stageShot(shot);
  if (shot !== 'start') setMode('play');
  // Let a few frames render before signalling readiness.
  let frames = 0;
  const waitReady = () => {
    frames++;
    if (frames > 5) {
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(waitReady);
  };
  requestAnimationFrame(waitReady);
}
requestAnimationFrame(frame);
