// Save / load through localStorage. Autosave runs after each mission and
// every 30 seconds of play; Continue on the title screen restores a save.
import { G } from './state.js';
import { spawnWorld } from './actors.js';
import { buildCity } from './city.js';

const KEY = 'solmar-heat-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function saveGame() {
  if (!G.player) return false;
  try {
    const data = {
      v: 1, cash: G.cash, health: G.health, ammo: G.ammo, hasPistol: G.hasPistol,
      shells: G.shells, shellIds: G.city.shells.filter(s => s.taken).map(s => s.id),
      missionsDone: G.missionsDone, missionIndex: G.missionIndex,
      clock: G.clock, px: G.player.x, py: G.player.y, angle: G.player.angle,
      stats: G.stats, savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

// Apply a loaded save onto a fresh world. Returns true when a save existed.
export function applySave(data) {
  if (!data) return false;
  G.city = buildCity(G.seed);
  spawnWorld();
  G.cash = data.cash ?? 250;
  G.health = data.health ?? 100;
  G.ammo = data.ammo ?? 0;
  G.hasPistol = !!data.hasPistol;
  G.shells = data.shells ?? 0;
  G.missionsDone = data.missionsDone ?? 0;
  G.missionIndex = data.missionIndex ?? 0;
  G.clock = data.clock ?? 14 * 60 + 20;
  G.stats = Object.assign({ stolen: 0, fares: 0, shots: 0, kos: 0, distance: 0 }, data.stats);
  for (const s of G.city.shells) if ((data.shellIds || []).includes(s.id)) s.taken = true;
  G.player = {
    x: data.px ?? G.city.zones.safehouse.x,
    y: data.py ?? G.city.zones.safehouse.y,
    angle: data.angle ?? 0, speed: 0, car: null, walkPhase: 0, punchT: 0, shootT: 0,
  };
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  G.wanted = 0;
  G.mission = null;
  G.objective = '';
  return true;
}
