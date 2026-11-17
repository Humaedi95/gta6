// Solmar Bay: a sun-soaked coastal city on a 160px road grid, built from one
// seed. The southern rows are beach and sea; the eastern columns are docks.
// Story locations are fixed coordinates so missions always have a target.
import { makeRng, pick, clamp } from './util.js';

export const BLOCK = 160;
export const COLS = 24;
export const ROWS = 18;
export const CITY_W = COLS * BLOCK; // 3840
export const CITY_H = ROWS * BLOCK; // 2880
export const ROAD_HALF = 19; // half of the road width, in pixels

const ROOF_COLORS = [
  ['#e8b48a', '#d99a6c', '#c98a5e'], // terracotta
  ['#f2e3c6', '#e6d3ae', '#d9c193'], // cream
  ['#9fc8c0', '#7fb3a8', '#68a194'], // seafoam
  ['#c9a7c9', '#b18ab1', '#9c749c'], // lilac
  ['#f0c96a', '#e0b452', '#cfa13f'], // sand gold
  ['#8fa8c8', '#7694b8', '#5f7ea6'], // dusty blue
  ['#d97b6c', '#c7685a', '#b35549'], // coral
];

const BEACH_ROW = 16; // first sand row
const DOCKS_COL = 22; // first dock column

export function buildCity(seed) {
  const rng = makeRng(seed);
  const city = {
    seed,
    W: CITY_W,
    H: CITY_H,
    BLOCK,
    COLS,
    ROWS,
    buildings: [],
    parks: [],
    trees: [],
    lots: [],
    shells: [],
    zones: {},
  };

  city.zones = {
    safehouse: { x: 3 * BLOCK + 80, y: 3 * BLOCK + 80, name: 'Rook Safehouse' },
    bank: { x: 11 * BLOCK + 80, y: 7 * BLOCK + 80, name: 'Solmar Savings Bank' },
    hotel: { x: 16 * BLOCK + 80, y: 13 * BLOCK + 80, name: 'Hotel Marisol' },
    garage: { x: 7 * BLOCK + 80, y: 11 * BLOCK + 80, name: 'Lube & Tune' },
    clinic: { x: 19 * BLOCK + 80, y: 5 * BLOCK + 80, name: 'Bay Clinic' },
    arms: { x: 5 * BLOCK + 80, y: 15 * BLOCK + 80, name: 'Ironclad Arms' },
    docks: { x: 22 * BLOCK + 80, y: 9 * BLOCK + 80, name: 'Solmar Docks' },
    plaza: { x: 12 * BLOCK + 80, y: 11 * BLOCK + 80, name: 'Plaza del Sol' },
    beach: { x: 10 * BLOCK + 80, y: 17 * BLOCK + 60, name: 'Solmar Beach' },
    airport: { x: 20 * BLOCK + 80, y: 14 * BLOCK + 80, name: 'Solmar Airfield' },
  };

  // Blocks that hold a story location keep one landmark building (the plaza
  // and the beach stay open) instead of random filler.
  const landmarkBlocks = new Set();
  for (const z of Object.values(city.zones)) {
    landmarkBlocks.add(Math.floor(z.x / BLOCK) + ',' + Math.floor(z.y / BLOCK));
  }
  const zoneInBlock = (cx, cy) => {
    for (const z of Object.values(city.zones)) {
      if (Math.floor(z.x / BLOCK) === cx && Math.floor(z.y / BLOCK) === cy) return z;
    }
    return null;
  };

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const x0 = cx * BLOCK;
      const y0 = cy * BLOCK;
      if (cy >= BEACH_ROW) continue; // sand: no buildings
      if (cx >= DOCKS_COL) {
        // Warehouses along the piers.
        if (rng() < 0.55) city.buildings.push(newBuilding(rng, x0 + 30, y0 + 34, 100, 92, '#8a7f72'));
        continue;
      }
      if (landmarkBlocks.has(cx + ',' + cy)) {
        const z = zoneInBlock(cx, cy);
        if (z && z.name !== 'Plaza del Sol' && z.name !== 'Solmar Beach') {
          city.buildings.push(newBuilding(rng, x0 + 34, y0 + 34, 92, 92, pick(rng, ROOF_COLORS)[0]));
        }
        if (z && z.name === 'Plaza del Sol') {
          city.parks.push({ x: x0 + 80, y: y0 + 80, r: 62 });
        }
        continue;
      }
      const roll = rng();
      if (roll < 0.62) {
        // One to three houses per block.
        const count = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const bw = 52 + rng() * 56;
          const bh = 52 + rng() * 56;
          const bx = x0 + 26 + rng() * Math.max(1, BLOCK - 52 - bw);
          const by = y0 + 26 + rng() * Math.max(1, BLOCK - 52 - bh);
          city.buildings.push(newBuilding(rng, bx, by, bw, bh, pick(rng, ROOF_COLORS)[0]));
        }
      } else if (roll < 0.74) {
        city.parks.push({ x: x0 + 80, y: y0 + 80, r: 46 + rng() * 20 });
        const trees = 3 + Math.floor(rng() * 5);
        for (let i = 0; i < trees; i++) {
          city.trees.push({ x: x0 + 24 + rng() * (BLOCK - 48), y: y0 + 24 + rng() * (BLOCK - 48), r: 9 + rng() * 5 });
        }
      } else if (roll < 0.86) {
        city.lots.push({ x: x0 + 80, y: y0 + 80, w: 96, h: 96 });
      }
      if (rng() < 0.5) {
        city.trees.push({ x: x0 + 14 + rng() * 8, y: y0 + 40 + rng() * 80, r: 8 + rng() * 4 });
      }
    }
  }

  // Twenty golden shells, hidden on the beach, in parks, at the docks, and
  // a few scattered anywhere so the whole map is worth exploring.
  const spots = [];
  for (let i = 0; i < 8; i++) {
    spots.push({ x: 240 + rng() * (CITY_W - 480), y: BEACH_ROW * BLOCK + 40 + rng() * 110 });
  }
  for (const p of city.parks) {
    spots.push({ x: p.x + (rng() - 0.5) * 70, y: p.y + (rng() - 0.5) * 70 });
  }
  for (let i = 0; i < 5; i++) {
    spots.push({ x: DOCKS_COL * BLOCK + 30 + rng() * 260, y: 120 + rng() * (CITY_H - 400) });
  }
  while (spots.length < 20) {
    spots.push({ x: 120 + rng() * (CITY_W - 240), y: 120 + rng() * (CITY_H - 240) });
  }
  city.shells = spots.slice(0, 20).map((s, i) => ({
    id: i,
    x: clamp(s.x, 40, CITY_W - 40),
    y: clamp(s.y, 40, CITY_H - 40),
    taken: false,
  }));

  return city;
}

function newBuilding(rng, x, y, w, h, color) {
  return {
    x, y, w, h, color,
    floors: 1 + Math.floor(rng() * 3),
    shade: 0.82 + rng() * 0.18,
    windows: 2 + Math.floor(rng() * 3),
  };
}

// True when the point lies on a road (within ROAD_HALF of a grid line).
export function isRoad(x, y, city) {
  if (x < 0 || y < 0 || x > city.W || y > city.H) return false;
  const mx = x % BLOCK;
  const my = y % BLOCK;
  return mx < ROAD_HALF || mx > BLOCK - ROAD_HALF || my < ROAD_HALF || my > BLOCK - ROAD_HALF;
}

export function inBeach(x, y) {
  return y >= BEACH_ROW * BLOCK;
}

export function inWater(x, y) {
  return y >= 17 * BLOCK + 60;
}

// Push a circle out of every building AABB it overlaps; report any hit.
export function collideBuildings(x, y, r, city) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.001) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      x += dx * push;
      y += dy * push;
    } else {
      y -= r; // dead centre of a roof: shove straight up out of it
    }
  }
  return { x, y, hit };
}

export function pointInBuilding(x, y, city) {
  for (const b of city.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b;
  }
  return null;
}

// A random point on a road line, for spawning traffic and pedestrians.
export function randomRoadPoint(rng, city, margin = 60) {
  if (rng() < 0.5) {
    const row = Math.floor(rng() * (ROWS + 1));
    return { x: margin + rng() * (city.W - margin * 2), y: row * BLOCK + (rng() < 0.5 ? -9 : 9), axis: 'h', road: row };
  }
  const col = Math.floor(rng() * (COLS + 1));
  return { x: col * BLOCK + (rng() < 0.5 ? -9 : 9), y: margin + rng() * (city.H - margin * 2), axis: 'v', road: col };
}

// A road point some distance from (x, y): where police cars appear.
export function roadPointNear(x, y, rng, city, radius = 500) {
  for (let i = 0; i < 24; i++) {
    const p = randomRoadPoint(rng, city);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > radius && d < radius * 3) return p;
  }
  return randomRoadPoint(rng, city);
}
