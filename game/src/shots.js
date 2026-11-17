// Deterministic screenshot staging: each ?shot= scene places the player,
// traffic and police in a fixed, readable composition, then the page signals
// window.__shotReady once a few frames have rendered.
import { G, say } from './state.js';
import { makeCar, spawnPolice } from './actors.js';
import { startMission } from './missions.js';
import { BLOCK } from './city.js';

function placePlayer(x, y, angle) {
  G.player.x = x; G.player.y = y; G.player.angle = angle;
  G.cam.x = x; G.cam.y = y;
}

function giveCar(type, color) {
  const p = G.player;
  const c = makeCar(type, p.x + 10, p.y, p.angle, 'player');
  if (color) c.color = color;
  c.speed = 0;
  G.cars.push(c);
  p.car = c;
  p.x = c.x; p.y = c.y;
  return c;
}

export function stageShot(name) {
  const city = G.city;
  const z = city.zones;
  G.clock = 16 * 60 + 40; // golden hour for every shot
  G.messageT = 0;
  G.help = false;

  if (name === 'start') {
    // Title screen: keep the world behind the overlay alive.
    G.mode = 'title';
    placePlayer(z.plaza.x, z.plaza.y, 0);
    document.getElementById('titleScreen').classList.remove('hidden');
    return;
  }

  // All gameplay shots run in play mode with the HUD visible.
  G.mode = 'play';
  if (name === 'play') {
    // On foot downtown, plaza behind, traffic passing.
    placePlayer(z.plaza.x + 60, z.plaza.y + 90, -Math.PI / 2);
    G.objective = 'Drive to the safehouse to start your first job';
    say('Welcome to Solmar Bay, Danny Rook.', 5);
  } else if (name === 'drive') {
    // Driving a sports car down the main avenue, wanted 1, one police car behind.
    placePlayer(11 * BLOCK, 7 * BLOCK + 9, 0);
    const car = giveCar('sports', '#d92638');
    car.speed = 260;
    G.wanted = 1;
    const cop = makeCar('police', car.x - 260, car.y + 9, 0, 'police');
    cop.speed = 300;
    G.cars.push(cop);
    G.objective = 'Lose the cops — or reach Lube & Tune';
    say('Wanted level 1 — the Solmar Bay PD is on you.', 4);
  } else if (name === 'chase') {
    // Mission 4 in progress: 3 stars, two police cars closing in, bank behind.
    startMission(3);
    G.mission.stage = 2; // escape stage
    G.mission.def.stages[0]._setup = true;
    G.mission.def.stages[1]._setup = true;
    G.mission.def.stages[2]._setup = true;
    G.objective = 'Escape to the safehouse';
    placePlayer(11 * BLOCK, 8 * BLOCK + 9, 0);
    const car = giveCar('sports', '#d92638');
    car.speed = 320;
    G.wanted = 3;
    G.cash = 2450;
    for (const [dx, dy] of [[-260, 0], [-340, 18]]) {
      const cop = makeCar('police', car.x + dx, car.y + dy, 0, 'police');
      cop.speed = 330;
      G.cars.push(cop);
    }
    say('Solmar Savings complete! +$1,200 — lose the cops!', 5);
  } else if (name === 'end') {
    // Free-roam victory moment on the beach at sunset.
    G.storyDone = true;
    G.missionsDone = 5;
    G.cash = 5280;
    G.shells = 12;
    placePlayer(z.beach.x, z.beach.y - 40, -Math.PI / 2);
    G.objective = 'Free roam — Solmar Bay is yours';
    say('King of Solmar Bay. The city is yours, Danny Rook.', 5);
  }
  // Settle the camera on the staged scene.
  G.cam.x = G.player.x;
  G.cam.y = G.player.y;
}
