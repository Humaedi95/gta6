// Solmar Bay: a sun-soaked coastal city on a road grid, generated from one seed.
// Roads run on a 160px grid; each block holds buildings, a park, a lot or a plaza.
// The south edge is beach and sea; the east edge is the docks.
import { mulberry32, pick, clamp } from './util.js';

export const BLOCK = 160;
export const COLS = 24;
export const ROWS = 18;
export const CITY_W = COLS * BLOCK; // 3840
export const CITY_H = ROWS * BLOCK; // 2880
export const ROAD_HALF = 19; // half road width

const PALETTES = [
  ['#e8b48a', '#d99a6c', '#c98a5e'], // terracotta
  ['#f2e3c6', '#e6d3ae', '#d9c193'], // cream
  ['#9fc8c0', '#7fb3a8', '#68a194'], // seafoam
  ['#c9a7c9', '#b18ab1', '#9c749c'], // lilac
  ['#f0c96a', '#e0b452', '#cfa13f'], // sand gold
  ['#8fa8c8', '#7694b8', '#5f7ea6'], // dusty blue
  ['#d97b6c', '#c7685a', '#b35549'], // coral
];

export function buildCity(seed) {
  const rng = mulberry32(seed);
  const city = {
    seed, W: CITY_W, H: CITY_H, BLOCK, COLS, ROWS,
    buildings: [], parks: [], trees: [], lots: [], shells: [],
    zones: {},
  };

  // Named story locations (fixed, so missions always have somewhere to go).
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

  const reserved = new Set();
  const reserve = (cx, cy) => reserved.add(cx + ',' + cy);
  for (const z of Object.values(city.zones)) {
    reserve(Math.floor(z.x / BLOCK), Math.floor(z.y / BLOCK));
  }

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const x0 = cx * BLOCK, y0 = cy * BLOCK;
      // Beach strip: bottom two rows are sand, no buildings.
      if (cy >= 16) continue;
      // Docks: east two columns are piers and warehouses.
      if (cx >= 22) {
        if (rng() < 0.55) {
          city.buildings.push(mkBuilding(rng, x0 + 30, y0 + 34, 100, 92, '#8a7f72'));
        }
        continue;
      }
      if (reserved.has(cx + ',' + cy)) {
        // Zone blocks get one landmark building (except plaza/beach which stay open).
        const z = zoneAt(city, cx, cy);
        if (z && z.name !== 'Plaza del Sol' && z.name !== 'Solmar Beach') {
          city.buildings.push(mkBuilding(rng, x0 + 34, y0 + 34, 92, 92, pick(rng, PALETTES)[0]));
        }
        if (z && z.name === 'Plaza del Sol') city.parks.push({ x: x0 + 80, y: y0 + 80, r: 62 });
        continue;
      }
      const roll = rng();
      if (roll < 0.62) {
        // 1-3 buildings per block.
        const n = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const bw = 52 + rng() * 56, bh = 52 + rng() * 56;
          const bx = x0 + 26 + rng() * Math.max(1, BLOCK - 52 - bw);
          const by = y0 + 26 + rng() * Math.max(1, BLOCK - 52 - bh);
          city.buildings.push(mkBuilding(rng, bx, by, bw, bh, pick(rng, PALETTES)[0]));
        }
      } else if (roll < 0.74) {
        city.parks.push({ x: x0 + 80, y: y0 + 80, r: 46 + rng() * 20 });
        const nt = 3 + Math.floor(rng() * 5);
        for (let i = 0; i < nt; i++) {
          city.trees.push({ x: x0 + 24 + rng() * (BLOCK - 48), y: y0 + 24 + rng() * (BLOCK - 48), r: 9 + rng() * 5 });
        }
      } else if (roll < 0.86) {
        city.lots.push({ x: x0 + 80, y: y0 + 80, w: 96, h: 96 });
      }
      // A few street trees along the block.
      if (rng() < 0.5) {
        city.trees.push({ x: x0 + 14 + rng() * 8, y: y0 + 40 + rng() * 80, r: 8 + rng() * 4 });
      }
    }
  }

  // 20 golden shells hidden around the bay: beach, parks, plazas, docks.
  const shellSpots = [];
  for (let i = 0; i < 8; i++) shellSpots.push({ x: 240 + rng() * (CITY_W - 480), y: 16 * BLOCK + 40 + rng() * 110 });
  for (const p of city.parks) shellSpots.push({ x: p.x + (rng() - 0.5) * 70, y: p.y + (rng() - 0.5) * 70 });
  for (let i = 0; i < 5; i++) shellSpots.push({ x: 22 * BLOCK + 30 + rng() * 260, y: 120 + rng() * (CITY_H - 400) });
  while (shellSpots.length < 20) {
    shellSpots.push({ x: 120 + rng() * (CITY_W - 240), y: 120 + rng() * (CITY_H - 240) });
  }
  city.shells = shellSpots.slice(0, 20).map((s, i) => ({ id: i, x: clamp(s.x, 40, CITY_W - 40), y: clamp(s.y, 40, CITY_H - 40), taken: false }));

  return city;
}

function zoneAt(city, cx, cy) {
  for (const z of Object.values(city.zones)) {
    if (Math.floor(z.x / BLOCK) === cx && Math.floor(z.y / BLOCK) === cy) return z;
  }
  return null;
}

function mkBuilding(rng, x, y, w, h, color) {
  const floors = 1 + Math.floor(rng() * 3);
  return { x, y, w, h, color, floors, shade: 0.82 + rng() * 0.18, windows: 2 + Math.floor(rng() * 3) };
}

export function isRoad(x, y, city) {
  if (x < 0 || y < 0 || x > city.W || y > city.H) return false;
  const mx = x % BLOCK, my = y % BLOCK;
  return mx < ROAD_HALF || mx > BLOCK - ROAD_HALF || my < ROAD_HALF || my > BLOCK - ROAD_HALF;
}

export function inBeach(x, y) { return y >= 16 * BLOCK; }
export function inWater(x, y) { return y >= 17 * BLOCK + 60; }

// Circle vs building AABBs: push the circle out, return true on any hit.
export function collideBuildings(x, y, r, city) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.001) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        x += dx * push; y += dy * push;
      } else {
        y -= r; // dead centre: push up out of the roof
      }
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

// A random point on a road, for spawning traffic and pedestrians.
export function randomRoadPoint(rng, city, margin = 60) {
  const horizontal = rng() < 0.5;
  if (horizontal) {
    const row = Math.floor(rng() * (ROWS + 1));
    return { x: margin + rng() * (city.W - margin * 2), y: row * BLOCK + (rng() < 0.5 ? -9 : 9), axis: 'h', road: row };
  }
  const col = Math.floor(rng() * (COLS + 1));
  return { x: col * BLOCK + (rng() < 0.5 ? -9 : 9), y: margin + rng() * (city.H - margin * 2), axis: 'v', road: col };
}

export function roadPointNear(x, y, rng, city, radius = 500) {
  for (let i = 0; i < 24; i++) {
    const p = randomRoadPoint(rng, city);
    if (Math.hypot(p.x - x, p.y - y) > radius && Math.hypot(p.x - x, p.y - y) < radius * 3) return p;
  }
  return randomRoadPoint(rng, city);
}
