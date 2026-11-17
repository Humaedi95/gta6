// The one shared game state. Every module imports G and reads or mutates it.
export const G = {
  mode: 'title', // title | play | paused | busted | wasted | complete
  time: 0, // seconds since this run started
  clock: 14 * 60 + 20, // in-game minutes since midnight; a golden afternoon
  cash: 250,
  health: 100,
  wanted: 0, // 0..5 stars
  wantedTimer: 0, // seconds hidden from the police; a star fades after 12s
  crimeCooldown: 0, // short grace window before a new crime adds heat
  ammo: 0,
  hasPistol: false,
  shells: 0,
  shellsTotal: 20,
  missionsDone: 0,
  missionIndex: 0,
  storyDone: false,
  freeRoam: false,
  retryMission: null, // mission def to restart from the safehouse after a fail
  mission: null, // active mission runtime { def, stage, timer, waitT, targetCar }
  player: null, // { x, y, angle, speed, car, walkPhase, punchT, shootT }
  cam: { x: 0, y: 0 },
  city: null,
  cars: [], // traffic + parked + police cars
  peds: [],
  bullets: [],
  particles: [],
  fare: null, // active taxi fare { tx, ty, name, paid, timer }
  farePed: null,
  keys: {},
  mouse: { x: 640, y: 360, down: false },
  muted: false,
  help: false,
  seed: 20261117,
  stats: { stolen: 0, fares: 0, shots: 0, kos: 0, distance: 0 },
  message: '',
  messageT: 0,
  objective: '',
  shotMode: null, // set from ?shot= for deterministic screenshots
  shotReady: false,
  shake: 0,
  flash: 0,
};

// Show a short toast line at the bottom of the screen.
export function say(text, seconds = 4) {
  G.message = text;
  G.messageT = seconds;
}
