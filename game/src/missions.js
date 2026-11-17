// Five story jobs for fixer Mara Voss, plus the taxi-fare side activity.
// A mission is a list of stages; a stage completes when the player reaches
// its target, waits out its timer, or grabs the right car. Rewards pay out
// when the last stage clears.
import { G, say } from './state.js';
import { dist, fmtCash } from './util.js';
import { addWanted, makeCar, spawnPolice } from './actors.js';
import { sfxMission, sfxChime } from './audio.js';

export const MISSIONS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    intro: 'Mara Voss: "Danny. A client needs a ride from the plaza to Hotel Marisol. Get a car, pick him up, and don\'t keep him waiting."',
    reward: 150,
    stages: [
      { text: 'Get in a car', kind: 'car' },
      { text: 'Pick up the client at Plaza del Sol', kind: 'goto', zone: 'plaza', radius: 70 },
      { text: 'Drive the client to Hotel Marisol', kind: 'goto', zone: 'hotel', radius: 80 },
    ],
  },
  {
    id: 'repo-man',
    title: 'Repo Man',
    intro: 'Mara Voss: "A red sports coupe is parked by the airfield. The owner stopped paying. Bring it to Lube & Tune — and if the cops notice, lose them."',
    reward: 400,
    stages: [
      { text: 'Steal the red coupe at the airfield', kind: 'steal', zone: 'airport', radius: 90, carType: 'sports', carColor: '#d92638' },
      { text: 'Deliver the coupe to Lube & Tune', kind: 'deliver', zone: 'garage', radius: 80 },
    ],
  },
  {
    id: 'hot-package',
    title: 'Hot Package',
    intro: 'Mara Voss: "A package is waiting at the docks. The police are already sniffing around — grab it and get it to the safehouse in 90 seconds."',
    reward: 600,
    stages: [
      { text: 'Collect the package at the docks', kind: 'goto', zone: 'docks', radius: 80, wanted: 2 },
      { text: 'Deliver it to the safehouse — 90 seconds!', kind: 'goto', zone: 'safehouse', radius: 80, timer: 90 },
    ],
  },
  {
    id: 'solmar-savings',
    title: 'Solmar Savings',
    intro: 'Mara Voss: "The bank keeps its Friday cash in the back room. Walk in, hold the room for five seconds, then get out and lose the whole department."',
    reward: 1200,
    stages: [
      { text: 'Reach Solmar Savings Bank', kind: 'goto', zone: 'bank', radius: 80 },
      { text: 'Hold the back room — stay inside 5 seconds', kind: 'wait', zone: 'bank', radius: 70, wait: 5, wanted: 3 },
      { text: 'Escape to the safehouse', kind: 'goto', zone: 'safehouse', radius: 80 },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    intro: 'Mara Voss: "Last one, Danny. A crate at the docks, a ledger at the hotel, then the safehouse. The whole city will be looking for you. Make it count."',
    reward: 3000,
    stages: [
      { text: 'Grab the crate at the docks', kind: 'goto', zone: 'docks', radius: 80, wanted: 2 },
      { text: 'Pick up the ledger at Hotel Marisol', kind: 'goto', zone: 'hotel', radius: 80 },
      { text: 'Reach the safehouse with the score', kind: 'goto', zone: 'safehouse', radius: 80, wanted: 4 },
    ],
  },
];

export function startMission(index) {
  const def = MISSIONS[index];
  if (!def) return false;
  G.mission = { def, stage: 0, timer: 0, waitT: 0, targetCar: null };
  G.missionIndex = index;
  say(def.title + ' — ' + def.intro, 7);
  G.objective = def.stages[0].text;
  return true;
}

// Where the beacon and the minimap blip should point right now.
export function missionTarget() {
  if (!G.mission) return null;
  const st = G.mission.def.stages[G.mission.stage];
  if (!st) return null;
  if (st.kind === 'steal' && G.mission.targetCar) {
    return { x: G.mission.targetCar.x, y: G.mission.targetCar.y, text: st.text };
  }
  if (st.zone) {
    const z = G.city.zones[st.zone];
    return { x: z.x, y: z.y, text: st.text, name: z.name };
  }
  return null;
}

function targetPos(st) {
  if (st.kind === 'steal' && G.mission.targetCar) {
    return { x: G.mission.targetCar.x, y: G.mission.targetCar.y };
  }
  if (st.zone) {
    const z = G.city.zones[st.zone];
    return { x: z.x, y: z.y };
  }
  return null;
}

export function updateMission(dt) {
  const m = G.mission;
  if (!m || G.mode !== 'play') return;
  const st = m.def.stages[m.stage];
  if (!st) return;
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;

  // One-time setup for this stage: heat, the target car, the countdown.
  if (!st._setup) {
    st._setup = true;
    if (st.wanted && G.wanted < st.wanted) {
      G.wanted = st.wanted;
      spawnPolice();
    }
    if (st.kind === 'steal') {
      const z = G.city.zones[st.zone];
      const c = makeCar(st.carType || 'sports', z.x + 30, z.y, 0, 'parked');
      c.color = st.carColor || '#d92638';
      c.missionCar = true;
      G.cars.push(c);
      m.targetCar = c;
    }
    if (st.timer) m.timer = st.timer;
    G.objective = st.text;
  }

  if (st.timer) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission('Out of time — the job fell through.');
      return;
    }
  }

  if (st.kind === 'car') {
    if (p.car) advanceStage();
    return;
  }
  if (st.kind === 'steal') {
    if (p.car && p.car.missionCar) advanceStage();
    return;
  }
  if (st.kind === 'deliver') {
    const t = targetPos(st);
    if (p.car && p.car.missionCar) {
      if (dist(px, py, t.x, t.y) < st.radius) advanceStage();
    } else if (!p.car) {
      // The job car is gone: Mara sends another one, back a stage.
      say('You lost the coupe — Mara sent another one to the airfield.', 4);
      m.stage = Math.max(0, m.stage - 1);
      m.def.stages[m.stage]._setup = false;
      m.targetCar = null;
    }
    return;
  }
  if (st.kind === 'wait') {
    const t = targetPos(st);
    if (dist(px, py, t.x, t.y) < st.radius) {
      m.waitT += dt;
      G.objective = st.text + ' (' + Math.ceil(st.wait - m.waitT) + 's)';
      if (m.waitT >= st.wait) advanceStage();
    } else {
      m.waitT = 0;
    }
    return;
  }
  // Plain "go here" stage.
  const t = targetPos(st);
  if (t && dist(px, py, t.x, t.y) < st.radius) advanceStage();
}

function advanceStage() {
  const m = G.mission;
  const st = m.def.stages[m.stage];
  st._setup = false;
  m.waitT = 0;
  m.stage++;
  sfxChime();
  if (m.stage >= m.def.stages.length) {
    finishMission();
  } else {
    const next = m.def.stages[m.stage];
    G.objective = next.text;
    say('Done — ' + next.text, 4);
  }
}

function finishMission() {
  const m = G.mission;
  G.cash += m.def.reward;
  G.missionsDone++;
  sfxMission();
  say(m.def.title + ' complete! +' + fmtCash(m.def.reward), 5);
  G.mission = null;
  G.objective = '';
  G.missionIndex++;
  if (G.missionIndex >= MISSIONS.length) {
    G.storyDone = true;
    if (!G.freeRoam) {
      G.mode = 'complete';
      document.getElementById('endStats').textContent =
        'Jobs finished: ' + G.missionsDone + '  •  Cash: ' + fmtCash(G.cash) +
        '  •  Cars stolen: ' + G.stats.stolen + '  •  Fares driven: ' + G.stats.fares;
      document.getElementById('endScreen').classList.remove('hidden');
    }
  } else {
    setTimeout(() => {
      if (G.mode === 'play' && !G.mission) startMission(G.missionIndex);
    }, 2500);
  }
}

export function failMission(why) {
  const m = G.mission;
  if (!m) return;
  say(why + ' Talk to Mara at the safehouse to try again.', 5);
  G.mission = null;
  G.objective = '';
  G.retryMission = m.def;
}

// A taxi fare starts when the player, in a car, stops near a pedestrian.
export function tryStartFare() {
  if (G.fare || !G.player.car) return;
  for (const ped of G.peds) {
    if (ped.dead || ped.cop || ped.waiting) continue;
    if (dist(ped.x, ped.y, G.player.car.x, G.player.car.y) < 70) {
      ped.waiting = true;
      G.farePed = ped;
      const zones = Object.values(G.city.zones);
      const z = zones[Math.floor(Math.random() * zones.length)];
      G.fare = { tx: z.x, ty: z.y, name: z.name, paid: 40 + Math.floor(Math.random() * 60), timer: 75 };
      say('Fare! Take them to ' + z.name + ' — ' + fmtCash(G.fare.paid), 4);
      G.objective = 'Taxi fare: ' + z.name;
      return;
    }
  }
}

export function updateFare(dt) {
  if (!G.fare) return;
  const p = G.player;
  if (!p.car) {
    dropFare('You left the car — the fare walked away.');
    return;
  }
  G.fare.timer -= dt;
  if (G.fare.timer <= 0) {
    dropFare('Too slow — the fare got out.');
    return;
  }
  if (dist(p.car.x, p.car.y, G.fare.tx, G.fare.ty) < 80) {
    G.cash += G.fare.paid;
    G.stats.fares++;
    say('Fare paid +' + fmtCash(G.fare.paid), 3);
    sfxChime();
    if (G.farePed) {
      G.farePed.waiting = false;
      G.peds = G.peds.filter((q) => q !== G.farePed);
    }
    G.fare = null;
    G.farePed = null;
    if (!G.mission) G.objective = '';
  }
}

function dropFare(why) {
  say(why, 3);
  if (G.farePed) G.farePed.waiting = false;
  G.fare = null;
  G.farePed = null;
  if (!G.mission) G.objective = '';
}
