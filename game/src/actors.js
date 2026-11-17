// Cars, pedestrians, police and projectiles: spawning, traffic AI, pursuit
// AI, on-foot cops, bullets and particles.
import { G, say } from './state.js';
import { makeRng, pick, clamp, dist, angleTo, angleDiff, TAU } from './util.js';
import { BLOCK, COLS, ROWS, randomRoadPoint, roadPointNear, collideBuildings, pointInBuilding, inWater } from './city.js';
import { sfxCrash, sfxShot, sfxPunch } from './audio.js';

export const CAR_TYPES = {
  sedan: { len: 44, wid: 20, max: 300, accel: 240, color: '#c94f42' },
  taxi: { len: 44, wid: 20, max: 300, accel: 240, color: '#f2c230' },
  sports: { len: 46, wid: 20, max: 430, accel: 330, color: '#d92638' },
  truck: { len: 58, wid: 24, max: 230, accel: 170, color: '#7d8a99' },
  van: { len: 52, wid: 22, max: 260, accel: 200, color: '#e8e4d8' },
  police: { len: 46, wid: 20, max: 445, accel: 340, color: '#1c2436' },
  coupe: { len: 44, wid: 20, max: 340, accel: 280, color: '#3f7d5a' },
};

const PAINT_JOBS = ['#c94f42', '#3f7d5a', '#4a6fa5', '#d9a441', '#8a6fb8', '#e8e4d8', '#5a6b7d', '#b85c38'];
const SHIRT_COLORS = ['#e2583e', '#3e7cb1', '#f2c230', '#7fb069', '#c06c9e', '#e8e4d8', '#5a4a8a', '#2f9e8f'];

let rng = makeRng(20261117);
export function reseed(seed) {
  rng = makeRng(seed);
}

export function makeCar(type, x, y, angle, driver = 'traffic') {
  const spec = CAR_TYPES[type];
  const heading = Math.abs(Math.cos(angle)) > 0.7 ? 'h' : 'v';
  const car = {
    type, x, y, angle, speed: 0, driver,
    len: spec.len, wid: spec.wid, max: spec.max, accel: spec.accel,
    color: type === 'taxi' ? spec.color : (driver === 'police' ? spec.color : pick(rng, PAINT_JOBS)),
    hp: 100,
    siren: driver === 'police',
    axis: heading,
    dir: heading === 'h' ? (Math.cos(angle) >= 0 ? 1 : -1) : (Math.sin(angle) >= 0 ? 1 : -1),
    road: 0,
    cruise: 90 + rng() * 70,
    stuck: 0,
    honk: 0,
    targetSpeed: 0,
    flash: 0,
  };
  return car;
}

export function makePed(x, y) {
  return {
    x, y,
    angle: rng() * TAU,
    speed: 34 + rng() * 26,
    color: pick(rng, SHIRT_COLORS),
    walk: rng() * TAU,
    flee: 0,
    waiting: false,
    fare: false,
    hp: 30,
    dead: false,
    panic: 0,
  };
}

// Fill the streets: parked cars, moving traffic, sidewalk pedestrians.
export function spawnWorld() {
  G.cars = [];
  G.peds = [];
  G.bullets = [];
  G.particles = [];

  for (let i = 0; i < 14; i++) {
    const p = randomRoadPoint(rng, G.city);
    const type = pick(rng, ['sedan', 'coupe', 'van', 'sports', 'truck']);
    const across = p.axis === 'h' ? 22 : 0;
    const along = p.axis === 'h' ? 0 : 22;
    const c = makeCar(type, p.x + across, p.y + along, p.axis === 'h' ? 0 : Math.PI / 2, 'parked');
    c.speed = 0;
    G.cars.push(c);
  }
  for (let i = 0; i < 24; i++) {
    const p = randomRoadPoint(rng, G.city);
    const type = pick(rng, ['sedan', 'sedan', 'taxi', 'coupe', 'van', 'truck']);
    const angle = p.axis === 'h'
      ? (rng() < 0.5 ? 0 : Math.PI)
      : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const c = makeCar(type, p.x, p.y, angle, 'traffic');
    c.axis = p.axis;
    c.road = p.road;
    c.dir = c.axis === 'h' ? (Math.cos(c.angle) >= 0 ? 1 : -1) : (Math.sin(c.angle) >= 0 ? 1 : -1);
    c.speed = c.cruise;
    G.cars.push(c);
  }
  for (let i = 0; i < 34; i++) {
    const p = randomRoadPoint(rng, G.city);
    G.peds.push(makePed(p.x + (rng() - 0.5) * 30, p.y + (rng() - 0.5) * 30));
  }
}

// Traffic follows its road line, slows for the car ahead, sometimes turns at
// an intersection, and wraps around the city edge so the streets stay busy.
export function updateTraffic(dt) {
  for (const c of G.cars) {
    if (c.driver === 'player' || c.driver === 'police' || c.driver === 'parked') continue;
    if (c.axis === 'h') {
      c.x += c.dir * c.speed * dt;
      const laneY = c.road * BLOCK + (c.dir > 0 ? 9 : -9);
      c.y += (laneY - c.y) * Math.min(1, dt * 4);
      c.angle = c.dir > 0 ? 0 : Math.PI;
    } else {
      c.y += c.dir * c.speed * dt;
      const laneX = c.road * BLOCK + (c.dir > 0 ? 9 : -9);
      c.x += (laneX - c.x) * Math.min(1, dt * 4);
      c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    let blocked = false;
    for (const o of G.cars) {
      if (o === c || o.driver === 'parked') continue;
      if (o.axis !== c.axis || o.road !== c.road || o.dir !== c.dir) continue;
      const gap = c.axis === 'h' ? (o.x - c.x) * c.dir : (o.y - c.y) * c.dir;
      if (gap > 0 && gap < 64) { blocked = true; break; }
    }
    const want = blocked ? 0 : c.cruise;
    c.speed += clamp(want - c.speed, -260 * dt, 180 * dt);

    const along = c.axis === 'h' ? c.x : c.y;
    const atCrossing = Math.abs(along % BLOCK) < 6 || Math.abs(along % BLOCK) > BLOCK - 6;
    if (atCrossing && rng() < dt * 1.4 && rng() < 0.16) {
      // Turn onto the crossing road.
      if (c.axis === 'h') {
        c.axis = 'v';
        c.road = Math.round(c.x / BLOCK);
        c.dir = rng() < 0.5 ? 1 : -1;
        c.y = c.road * BLOCK;
      } else {
        c.axis = 'h';
        c.road = Math.round(c.y / BLOCK);
        c.dir = rng() < 0.5 ? 1 : -1;
        c.x = c.road * BLOCK;
      }
    }

    if (c.x < -80) c.x = G.city.W + 60;
    if (c.x > G.city.W + 80) c.x = -60;
    if (c.y < -80) c.y = G.city.H + 60;
    if (c.y > G.city.H + 80) c.y = -60;

    const res = collideBuildings(c.x, c.y, 16, G.city);
    c.x = res.x;
    c.y = res.y;
  }
}

export function updatePeds(dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    ped.walk += dt * 6;
    let fx = 0;
    let fy = 0;
    const playerCar = p && p.car;
    const threatenedByCar = playerCar && dist(ped.x, ped.y, playerCar.x, playerCar.y) < 120 && Math.abs(playerCar.speed) > 150;
    const nearBullet = G.bullets.length > 0 && G.bullets.some((b) => dist(ped.x, ped.y, b.x, b.y) < 160);
    if (threatenedByCar || nearBullet || ped.panic > 0) {
      ped.panic = Math.max(ped.panic, 1.2);
      const tx = threatenedByCar ? playerCar.x : (G.bullets[0] ? G.bullets[0].x : ped.x);
      const ty = threatenedByCar ? playerCar.y : (G.bullets[0] ? G.bullets[0].y : ped.y);
      const away = angleTo(tx, ty, ped.x, ped.y);
      fx = Math.cos(away);
      fy = Math.sin(away);
      ped.angle = away;
    } else {
      ped.angle += (rng() - 0.5) * dt * 1.2;
      fx = Math.cos(ped.angle);
      fy = Math.sin(ped.angle);
    }
    ped.panic = Math.max(0, ped.panic - dt);
    const sp = ped.panic > 0 ? ped.speed * 3.2 : ped.speed;
    ped.x += fx * sp * dt;
    ped.y += fy * sp * dt;
    ped.x = clamp(ped.x, 20, G.city.W - 20);
    ped.y = clamp(ped.y, 20, G.city.H - 20);
    const res = collideBuildings(ped.x, ped.y, 8, G.city);
    if (res.hit) {
      ped.x = res.x;
      ped.y = res.y;
      ped.angle += Math.PI / 2;
    }
    if (inWater(ped.x, ped.y)) {
      ped.y -= 40;
      ped.angle = -Math.PI / 2;
    }
  }
  // Top the street back up when too many pedestrians are gone.
  if (G.peds.filter((q) => !q.dead).length < 26) {
    const rp = randomRoadPoint(rng, G.city);
    G.peds.push(makePed(rp.x, rp.y));
  }
}

// Bring in police cars (and foot cops at high heat) to match the wanted level.
export function spawnPolice() {
  const want = G.wanted;
  const carsWanted = Math.min(2 + want * 2, 8);
  const current = G.cars.filter((c) => c.driver === 'police').length;
  for (let i = current; i < carsWanted; i++) {
    const p = roadPointNear(G.player.x, G.player.y, rng, G.city, 420);
    const c = makeCar('police', p.x, p.y, 0, 'police');
    c.speed = 200;
    G.cars.push(c);
  }
  if (!G.player.car && want >= 2) {
    const footCops = G.peds.filter((q) => q.cop).length;
    for (let i = footCops; i < want; i++) {
      const a = rng() * TAU;
      const cop = makePed(G.player.x + Math.cos(a) * 320, G.player.y + Math.sin(a) * 320);
      cop.cop = true;
      cop.color = '#1c2436';
      cop.speed = 120;
      G.peds.push(cop);
    }
  }
}

export function updatePolice(dt) {
  const p = G.player;
  if (!p) return;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;

  for (const c of G.cars) {
    if (c.driver !== 'police') continue;
    const d = dist(c.x, c.y, px, py);
    const targetAngle = angleTo(c.x, c.y, px, py);
    c.angle += clamp(angleDiff(c.angle, targetAngle), -2.4 * dt, 2.4 * dt);
    const wantSpeed = d > 260 ? c.max : d > 60 ? 300 : 140;
    c.speed += clamp(wantSpeed - c.speed, -420 * dt, 300 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    const res = collideBuildings(c.x, c.y, 15, G.city);
    if (res.hit) {
      c.x = res.x;
      c.y = res.y;
      c.speed *= 0.55;
      c.angle += (rng() - 0.5) * 1.2;
    }
    c.x = clamp(c.x, 0, G.city.W);
    c.y = clamp(c.y, 0, G.city.H);
    // Ram the player's car.
    if (p.car && d < 46) {
      p.car.speed *= 0.92;
      p.car.x += Math.cos(c.angle) * 26 * dt * 10;
      p.car.y += Math.sin(c.angle) * 26 * dt * 10;
      if (Math.abs(c.speed) > 140 && G.time - (c.lastHit || 0) > 0.8) {
        c.lastHit = G.time;
        damagePlayer(8, 'rammed by the police');
      }
    }
    c.flash = (c.flash + dt) % 0.7;
  }

  // Foot cops chase the player on foot and try to make an arrest.
  for (const ped of G.peds) {
    if (!ped.cop || ped.dead) continue;
    const d = dist(ped.x, ped.y, p.x, p.y);
    const a = angleTo(ped.x, ped.y, p.x, p.y);
    ped.angle = a;
    ped.x += Math.cos(a) * ped.speed * dt;
    ped.y += Math.sin(a) * ped.speed * dt;
    if (!p.car && d < 20) {
      ped.bustT = (ped.bustT || 0) + dt;
      if (ped.bustT > 1.4) {
        bustPlayer();
        return;
      }
    } else {
      ped.bustT = 0;
    }
  }

  // Drop police cars that fell far behind.
  G.cars = G.cars.filter((c) => c.driver !== 'police' || dist(c.x, c.y, px, py) < 2600);
}

export function addWanted(n, why) {
  if (G.mode !== 'play') return;
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.crimeCooldown = 2;
  G.wantedTimer = 0;
  if (n > 0) say('Wanted level ' + G.wanted + ' — ' + why, 3);
  spawnPolice();
}

export function damagePlayer(n, why) {
  if (G.mode !== 'play') return;
  G.health -= n;
  G.flash = 0.25;
  if (G.health <= 0) {
    G.health = 0;
    G.mode = 'wasted';
    document.getElementById('wastedScreen').classList.remove('hidden');
  }
}

export function bustPlayer() {
  if (G.mode !== 'play') return;
  G.mode = 'busted';
  G.cash = Math.max(0, G.cash - 200);
  document.getElementById('bustedScreen').classList.remove('hidden');
}

export function shoot(fromX, fromY, angle) {
  if (!G.hasPistol) {
    say('You need a pistol — buy one at Ironclad Arms', 3);
    return;
  }
  if (G.ammo <= 0) {
    say('Out of ammo — buy more at Ironclad Arms', 3);
    return;
  }
  G.ammo--;
  G.stats.shots++;
  G.bullets.push({
    x: fromX + Math.cos(angle) * 22,
    y: fromY + Math.sin(angle) * 22,
    angle,
    speed: 900,
    life: 0.9,
  });
  G.shake = Math.max(G.shake, 3);
  sfxShot();
  if (G.crimeCooldown <= 0) addWanted(1, 'shots fired');
}

export function punch(px, py, angle) {
  sfxPunch();
  for (const ped of G.peds) {
    if (ped.dead || ped.cop) continue;
    if (dist(ped.x, ped.y, px, py) < 46 && Math.abs(angleDiff(angle, angleTo(px, py, ped.x, ped.y))) < 0.9) {
      ped.hp -= 25;
      ped.panic = 2;
      ped.x += Math.cos(angle) * 26;
      ped.y += Math.sin(angle) * 26;
      if (ped.hp <= 0) {
        ped.dead = true;
        addWanted(1, 'you hurt a pedestrian');
        G.stats.kos++;
      }
      break;
    }
  }
  for (const c of G.cars) {
    if (c.driver === 'police' && dist(c.x, c.y, px, py) < 60) {
      c.hp -= 10;
      if (c.hp <= 0) {
        c.driver = 'parked';
        c.speed = 0;
        addWanted(2, 'you wrecked a police car');
      }
    }
  }
}

export function updateBullets(dt) {
  for (const b of G.bullets) {
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (pointInBuilding(b.x, b.y, G.city)) {
      b.life = 0;
      spawnSparks(b.x, b.y, '#ffd75e', 5);
      continue;
    }
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (dist(ped.x, ped.y, b.x, b.y) < 14) {
        ped.hp -= 34;
        spawnSparks(b.x, b.y, '#ff4d5e', 7);
        if (ped.hp <= 0) {
          ped.dead = true;
          addWanted(ped.cop ? 2 : 1, ped.cop ? 'you shot a police officer' : 'you shot a pedestrian');
          G.stats.kos++;
        }
        b.life = 0;
        break;
      }
    }
    if (b.life <= 0) continue;
    for (const c of G.cars) {
      if (c.driver === 'player') continue;
      if (dist(c.x, c.y, b.x, b.y) < 26) {
        c.hp -= 20;
        spawnSparks(b.x, b.y, '#ffd75e', 6);
        if (c.hp <= 0 && c.driver === 'police') {
          c.driver = 'parked';
          c.speed = 0;
          addWanted(2, 'you wrecked a police car');
        }
        b.life = 0;
        break;
      }
    }
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
}

export function spawnSparks(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    G.particles.push({
      x, y,
      vx: Math.cos(a) * (60 + rng() * 160),
      vy: Math.sin(a) * (60 + rng() * 160),
      life: 0.4 + rng() * 0.3,
      color,
      size: 2 + rng() * 2,
    });
  }
}

export function updateParticles(dt) {
  for (const pt of G.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
}
