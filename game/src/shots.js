// Deterministic screenshot staging: each ?shot= scene places the player,
// traffic and police in a fixed, readable composition, then the page signals
// window.__shotReady once a few frames have rendered.
import { G, say } from './state.js';
import { makeCar } from './actors.js';
import { startMission } from './missions.js';
import { BLOCK } from './city.js';

function movePlayer(x, y, angle) {
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  G.cam.x = x;
  G.cam.y = y;
}

// Put the player in a car of the given type, parked right where they stand.
function handPlayerCar(type, color) {
  const p = G.player;
  const c = makeCar(type, p.x + 10, p.y, p.angle, 'player');
  if (color) c.color = color;
  c.speed = 0;
  G.cars.push(c);
  p.car = c;
  p.x = c.x;
  p.y = c.y;
  return c;
}

// Drop a police car behind the player's car, already in pursuit.
function addPursuer(playerCar, dx, dy, speed) {
  const cop = makeCar('police', playerCar.x + dx, playerCar.y + dy, 0, 'police');
  cop.speed = speed;
  G.cars.push(cop);
  return cop;
}

export function stageShot(name) {
  const city = G.city;
  const z = city.zones;
  G.clock = 16 * 60 + 40; // golden hour for every shot
  G.messageT = 0;
  G.help = false;

  if (name === 'start') {
    // Title screen: keep the world alive behind the overlay.
    G.mode = 'title';
    movePlayer(z.plaza.x, z.plaza.y, 0);
    document.getElementById('titleScreen').classList.remove('hidden');
    return;
  }

  // Every gameplay shot runs in play mode with the HUD visible.
  G.mode = 'play';
  if (name === 'play') {
    // On foot in the plaza, traffic passing on the avenue behind.
    movePlayer(z.plaza.x + 60, z.plaza.y + 90, -Math.PI / 2);
    G.objective = 'Drive to the safehouse to start your first job';
    say('Welcome to Solmar Bay, Danny Rook.', 5);
  } else if (name === 'drive') {
    // Driving a red sports car down the main avenue, one star, one cop behind.
    movePlayer(11 * BLOCK, 7 * BLOCK + 9, 0);
    const car = handPlayerCar('sports', '#d92638');
    car.speed = 260;
    G.wanted = 1;
    addPursuer(car, -260, 9, 300);
    G.objective = 'Lose the cops — or reach Lube & Tune';
    say('Wanted level 1 — the Solmar Bay PD is on you.', 4);
  } else if (name === 'chase') {
    // Mission 4 in progress: three stars, two police cars closing in.
    startMission(3);
    G.mission.stage = 2; // straight to the escape stage
    G.objective = 'Escape to the safehouse';
    movePlayer(11 * BLOCK, 8 * BLOCK + 9, 0);
    const car = handPlayerCar('sports', '#d92638');
    car.speed = 320;
    G.wanted = 3;
    G.cash = 2450;
    addPursuer(car, -260, 0, 330);
    addPursuer(car, -340, 18, 330);
    say('Solmar Savings complete! +$1,200 — lose the cops!', 5);
  } else if (name === 'end') {
    // Free-roam victory moment on the beach at sunset.
    G.storyDone = true;
    G.missionsDone = 5;
    G.cash = 5280;
    G.shells = 12;
    movePlayer(z.beach.x, z.beach.y - 40, -Math.PI / 2);
    G.objective = 'Free roam — Solmar Bay is yours';
    say('King of Solmar Bay. The city is yours, Danny Rook.', 5);
  }
  G.cam.x = G.player.x;
  G.cam.y = G.player.y;
}
