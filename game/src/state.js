// The single shared game state object. Every module imports G and reads/mutates it.
export const G = {
  mode: 'title', // title | play | paused | busted | wasted | complete
  time: 0, // seconds since game start
  clock: 14 * 60 + 20, // minutes since midnight; golden afternoon
  cash: 250,
  health: 100,
  wanted: 0,
  wantedTimer: 0, // counts down while hidden to decay a star
  crimeCooldown: 0,
  ammo: 0,
  hasPistol: false,
  shells: 0,
  shellsTotal: 20,
  missionsDone: 0,
  mission: null, // active mission runtime {def, stage, timer, target}
  missionIndex: 0,
  storyDone: false,
  freeRoam: false,
  player: null, // {x,y,angle,speed,car}
  cam: { x: 0, y: 0, zoom: 1 },
  city: null,
  cars: [], // traffic + parked + police cars
  peds: [],
  bullets: [],
  particles: [],
  fare: null, // active taxi fare {ped, tx, ty, paid, timer}
  farePed: null,
  keys: {},
  mouse: { x: 640, y: 360, down: false, worldX: 0, worldY: 0 },
  muted: false,
  help: false,
  seed: 20261117,
  stats: { stolen: 0, fares: 0, shots: 0, kos: 0, distance: 0 },
  message: '',
  messageT: 0,
  objective: '',
  shotMode: null, // set by ?shot= for deterministic screenshots
  shotReady: false,
  shake: 0,
  flash: 0,
};

export function say(text, seconds = 4) {
  G.message = text;
  G.messageT = seconds;
}
