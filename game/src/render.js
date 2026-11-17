// All canvas drawing: the city, cars, people, police, effects, HUD and minimap.
import { G } from './state.js';
import { clamp, lerp, dist, fmtCash, fmtClock, TAU } from './util.js';
import { BLOCK, COLS, ROWS, inBeach, inWater } from './city.js';
import { missionTarget } from './missions.js';

const VW = 1280, VH = 720;

function drawCar(ctx, c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-c.len / 2 + 3, -c.wid / 2 + 4, c.len, c.wid);
  // Body.
  ctx.fillStyle = c.color;
  roundRect(ctx, -c.len / 2, -c.wid / 2, c.len, c.wid, 7);
  ctx.fill();
  // Hood / trunk shading.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, c.len / 2 - 12, -c.wid / 2 + 2, 10, c.wid - 4, 4);
  ctx.fill();
  // Cabin + windshield.
  ctx.fillStyle = '#20293a';
  roundRect(ctx, -8, -c.wid / 2 + 3, 18, c.wid - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,255,0.85)';
  ctx.fillRect(6, -c.wid / 2 + 4, 4, c.wid - 8);
  // Wheels.
  ctx.fillStyle = '#141414';
  const wy = c.wid / 2 - 1;
  ctx.fillRect(-c.len / 2 + 6, -wy - 2, 9, 4);
  ctx.fillRect(-c.len / 2 + 6, wy - 2, 9, 4);
  ctx.fillRect(c.len / 2 - 15, -wy - 2, 9, 4);
  ctx.fillRect(c.len / 2 - 15, wy - 2, 9, 4);
  // Headlights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(c.len / 2 - 1, -c.wid / 2 + 3, 2, 4);
  ctx.fillRect(c.len / 2 - 1, c.wid / 2 - 7, 2, 4);
  // Taxi sign / police markings.
  if (c.type === 'taxi') {
    ctx.fillStyle = '#10131f';
    ctx.fillRect(-6, -5, 12, 10);
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
  }
  if (c.driver === 'police') {
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(-c.len / 2 + 8, -c.wid / 2 + 2, c.len - 16, 4);
    const on = c.flash < 0.35;
    ctx.fillStyle = on ? '#ff3b30' : '#2f7bff';
    ctx.fillRect(-4, -c.wid / 2 - 3, 8, 5);
    ctx.fillStyle = on ? '#2f7bff' : '#ff3b30';
    ctx.fillRect(-4, c.wid / 2 - 2, 8, 5);
  }
  if (c.missionCar) {
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 2;
    ctx.strokeRect(-c.len / 2 - 4, -c.wid / 2 - 4, c.len + 8, c.wid + 8);
  }
  ctx.restore();
}

function drawPed(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  const bob = ped.panic > 0 ? Math.sin(time * 18) * 2 : Math.sin(ped.walk) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(1, 4, 8, 4, 0, 0, TAU); ctx.fill();
  // Legs (two dots alternating with the walk cycle).
  ctx.fillStyle = '#23232e';
  const s = Math.sin(ped.walk) * 3;
  ctx.beginPath(); ctx.arc(-2 + s * 0.4, 5, 2.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(2 - s * 0.4, 5, 2.4, 0, TAU); ctx.fill();
  // Body.
  ctx.fillStyle = ped.cop ? '#1c2436' : ped.color;
  ctx.beginPath(); ctx.arc(0, bob * 0.4, 8, 0, TAU); ctx.fill();
  // Head.
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath(); ctx.arc(0, -2 + bob * 0.4, 5, 0, TAU); ctx.fill();
  if (ped.cop) {
    ctx.fillStyle = '#10131f';
    ctx.beginPath(); ctx.arc(0, -4 + bob * 0.4, 5, Math.PI, 0); ctx.fill();
  }
  // Waiting fare flag.
  if (ped.waiting) {
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI?', 0, -22 + Math.sin(time * 4) * 2);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function draw(ctx) {
  const city = G.city;
  const cam = G.cam;
  const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
  const shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
  const ox = VW / 2 - cam.x + shakeX;
  const oy = VH / 2 - cam.y + shakeY;

  // Sky-tinted base: grass.
  ctx.fillStyle = '#7fae62';
  ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.translate(ox, oy);

  // Beach + sea (south edge).
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(-60, 16 * BLOCK, city.W + 120, 2 * BLOCK);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(-60, 17 * BLOCK + 60, city.W + 120, BLOCK - 60);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 0; x < city.W; x += 90) {
    ctx.fillRect(x + ((G.time * 12) % 90), 17 * BLOCK + 66, 46, 3);
  }

  // City ground.
  ctx.fillStyle = '#8fae6b';
  ctx.fillRect(0, 0, city.W, 16 * BLOCK);
  // Docks ground (east).
  ctx.fillStyle = '#9a8f7a';
  ctx.fillRect(22 * BLOCK, 0, 2 * BLOCK, 16 * BLOCK);
  ctx.fillStyle = '#6e7f92';
  for (let y = 60; y < 16 * BLOCK; y += 200) ctx.fillRect(22 * BLOCK + 130, y, 30, 120);

  // Roads.
  ctx.fillStyle = '#3a3f4a';
  for (let r = 0; r <= ROWS; r++) ctx.fillRect(-40, r * BLOCK - 19, city.W + 80, 38);
  for (let c = 0; c <= COLS; c++) ctx.fillRect(c * BLOCK - 19, -40, 38, city.H + 80);
  // Lane dashes.
  ctx.fillStyle = '#e8d44f';
  for (let r = 0; r <= ROWS; r++) {
    for (let x = 0; x < city.W; x += 64) ctx.fillRect(x, r * BLOCK - 1.5, 30, 3);
  }
  for (let c = 0; c <= COLS; c++) {
    for (let y = 0; y < city.H; y += 64) ctx.fillRect(c * BLOCK - 1.5, y, 3, 30);
  }
  // Sidewalks.
  ctx.strokeStyle = '#c9c2b0';
  ctx.lineWidth = 5;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * BLOCK - 22); ctx.lineTo(city.W, r * BLOCK - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, r * BLOCK + 22); ctx.lineTo(city.W, r * BLOCK + 22); ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * BLOCK - 22, 0); ctx.lineTo(c * BLOCK - 22, city.H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c * BLOCK + 22, 0); ctx.lineTo(c * BLOCK + 22, city.H); ctx.stroke();
  }

  // Parks.
  for (const pk of city.parks) {
    ctx.fillStyle = '#5d9b4a';
    ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6fae56';
    ctx.beginPath(); ctx.arc(pk.x - 12, pk.y - 8, pk.r * 0.6, 0, TAU); ctx.fill();
  }
  // Trees.
  for (const t of city.trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3f7d3a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#57a047';
    ctx.beginPath(); ctx.arc(t.x - 2, t.y - 2, t.r * 0.6, 0, TAU); ctx.fill();
  }
  // Parking lots.
  for (const lot of city.lots) {
    ctx.fillStyle = '#555b66';
    ctx.fillRect(lot.x - lot.w / 2, lot.y - lot.h / 2, lot.w, lot.h);
    ctx.strokeStyle = '#e8e4d8';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) ctx.strokeRect(lot.x + i * 34 - 12, lot.y - 34, 24, 68);
  }

  // Buildings with height shading + windows.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = `rgba(255,255,255,${0.10 * b.shade})`;
    ctx.fillRect(b.x, b.y, b.w, 6);
    // Rooftop.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    // Windows.
    ctx.fillStyle = 'rgba(32,48,72,0.85)';
    const cols = Math.max(2, Math.floor(b.w / 22));
    const rows = Math.max(2, Math.floor(b.h / 22));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 3 + b.floors) % 4 === 0) ctx.fillStyle = 'rgba(255,230,140,0.9)';
        else ctx.fillStyle = 'rgba(32,48,72,0.85)';
        ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 8, 9);
      }
    }
  }

  // Zone labels + markers.
  ctx.textAlign = 'center';
  for (const z of Object.values(city.zones)) {
    ctx.fillStyle = 'rgba(16,19,31,0.75)';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(z.name.toUpperCase(), z.x, z.y - 58);
  }
  // Garage / bank / arms icons.
  drawZoneIcon(ctx, city.zones.garage.x, city.zones.garage.y, '#ffd75e', '🔧');
  drawZoneIcon(ctx, city.zones.bank.x, city.zones.bank.y, '#7dff9a', '$');
  drawZoneIcon(ctx, city.zones.arms.x, city.zones.arms.y, '#ff9a3c', '✚');

  // Golden shells.
  for (const s of city.shells) {
    if (s.taken) continue;
    const pulse = 1 + Math.sin(G.time * 4 + s.id) * 0.15;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b8860b';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('$', 0, 3.5);
    ctx.restore();
  }

  // Mission target beacon.
  const tgt = missionTarget();
  const fareT = G.fare ? { x: G.fare.tx, y: G.fare.ty } : null;
  const mark = tgt || fareT;
  if (mark) {
    const bob = Math.sin(G.time * 5) * 6;
    ctx.save();
    ctx.translate(mark.x, mark.y - 30 + bob);
    ctx.fillStyle = tgt ? '#ffd75e' : '#5eb2ff';
    ctx.beginPath();
    ctx.moveTo(0, 14); ctx.lineTo(-11, -8); ctx.lineTo(11, -8); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -8, 13, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,215,94,0.25)';
    ctx.beginPath(); ctx.arc(mark.x, mark.y, (tgt && tgt.name ? 60 : 70), 0, TAU); ctx.fill();
  }

  // Cars (parked/traffic first, player + police on top).
  for (const c of G.cars) if (c.driver !== 'player' && c.driver !== 'police') drawCar(ctx, c);
  for (const c of G.cars) if (c.driver === 'police') drawCar(ctx, c);
  if (G.player && G.player.car) drawCar(ctx, G.player.car);

  // Pedestrians.
  for (const ped of G.peds) if (!ped.dead) drawPed(ctx, ped, G.time);

  // Player on foot.
  if (G.player && !G.player.car) drawPlayer(ctx, G.player);

  // Bullets (tracers).
  ctx.strokeStyle = '#ffe27a';
  ctx.lineWidth = 2;
  for (const b of G.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(b.angle) * 18, b.y - Math.sin(b.angle) * 18);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const pt of G.particles) {
    ctx.globalAlpha = clamp(pt.life * 2.4, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Waypoint arrow at screen edge when the target is off-screen.
  if (mark) {
    const sx = mark.x + ox, sy = mark.y + oy;
    if (sx < 30 || sx > VW - 30 || sy < 30 || sy > VH - 30) {
      const cx = VW / 2, cy = VH / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ex = cx + Math.cos(a) * 300, ey = cy + Math.sin(a) * 250;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = tgt ? '#ffd75e' : '#5eb2ff';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(dist(G.player.x, G.player.y, mark.x, mark.y)) + 'm', ex, ey + 28);
    }
  }

  // Golden-hour tint.
  const hour = (G.clock / 60) % 24;
  const warm = clamp(1 - Math.abs(hour - 17) / 4, 0.25, 1);
  ctx.fillStyle = `rgba(255,150,60,${0.05 * warm})`;
  ctx.fillRect(0, 0, VW, VH);
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(255,40,50,${G.flash * 0.9})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  // Vignette.
  const vg = ctx.createRadialGradient(640, 360, 320, 640, 360, 760);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VW, VH);

  drawHUD(ctx);
}

function drawZoneIcon(ctx, x, y, color, glyph) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill();
  ctx.fillStyle = '#10131f';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(glyph, x, y + 4.5);
}

function drawPlayer(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(1, 5, 9, 4.5, 0, 0, TAU); ctx.fill();
  const s = Math.sin(p.walkPhase) * 3;
  ctx.fillStyle = '#23232e';
  ctx.beginPath(); ctx.arc(-2 + s * 0.4, 6, 2.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(2 - s * 0.4, 6, 2.6, 0, TAU); ctx.fill();
  // Danny Rook: teal jacket, dark jeans.
  ctx.fillStyle = '#0f8a7a';
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath(); ctx.arc(0, -3, 5.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#10131f';
  ctx.beginPath(); ctx.arc(0, -5, 5.5, Math.PI, 0); ctx.fill();
  // Facing gun.
  if (G.hasPistol) {
    ctx.rotate(p.angle);
    ctx.fillStyle = '#222';
    ctx.fillRect(8, -2, 10, 4);
  }
  ctx.restore();
}

function drawHUD(ctx) {
  // Top-left: cash, health, wanted.
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = 'rgba(10,14,30,0.62)';
  roundRect(ctx, 12, 12, 250, 96, 10); ctx.fill();
  ctx.fillStyle = '#7dff9a';
  ctx.fillText(fmtCash(G.cash), 26, 44);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.fillText('SHELL ' + G.shells + '/' + G.shellsTotal + '   •   ' + fmtClock(G.clock), 26, 66);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(26, 76, 180, 10);
  ctx.fillStyle = G.health > 40 ? '#7dff9a' : '#ff4d5e';
  ctx.fillRect(26, 76, 180 * clamp(G.health / 100, 0, 1), 10);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('HP ' + Math.ceil(G.health), 212, 85);
  // Wanted stars.
  ctx.font = '26px sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < G.wanted ? '#ffd75e' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', 272 + i * 26, 40);
  }
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.fillText(G.wanted > 0 ? 'WANTED — LOSE THE COPS' : 'CLEAN', 272, 62);

  // Objective panel (top centre).
  const obj = G.objective || (G.mission ? G.mission.def.title : (G.storyDone ? 'Free roam — Solmar Bay is yours' : 'Drive to the safehouse to start your first job'));
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10,14,30,0.62)';
  const ow = Math.min(560, ctx.measureText(obj).width + 90);
  roundRect(ctx, 640 - ow / 2, 12, ow, 44, 10); ctx.fill();
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(G.mission ? '★ ' + G.mission.def.title.toUpperCase() : 'SOLMAR BAY', 640, 30);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.fillText(obj.length > 72 ? obj.slice(0, 72) + '…' : obj, 640, 48);

  // Fare timer.
  if (G.fare) {
    ctx.fillStyle = 'rgba(10,14,30,0.62)';
    roundRect(ctx, 640 - 110, 62, 220, 26, 8); ctx.fill();
    ctx.fillStyle = '#5eb2ff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('FARE ' + fmtCash(G.fare.paid) + '  •  ' + Math.ceil(G.fare.timer) + 's', 640, 80);
  }

  // Speed + car state (bottom right).
  if (G.player && G.player.car) {
    const c = G.player.car;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(10,14,30,0.62)';
    roundRect(ctx, 1050, 640, 218, 66, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(Math.round(Math.abs(c.speed) * 0.55) + ' mph', 1252, 672);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(c.type.toUpperCase() + (c.missionCar ? '  •  JOB CAR' : ''), 1252, 694);
  }

  // Controls hint (bottom left).
  ctx.textAlign = 'left';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('WASD drive/walk   E enter car   Click shoot   F punch   Space handbrake   P pause', 16, 700);

  // Toast message.
  if (G.messageT > 0 && G.message) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,14,30,0.72)';
    const mw = Math.min(760, ctx.measureText(G.message).width + 60);
    roundRect(ctx, 640 - mw / 2, 610, mw, 34, 8); ctx.fill();
    ctx.fillStyle = '#ffe27a';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(G.message.length > 96 ? G.message.slice(0, 96) + '…' : G.message, 640, 632);
  }

  // Help overlay.
  if (G.help) {
    ctx.fillStyle = 'rgba(8,10,24,0.82)';
    ctx.fillRect(340, 150, 600, 380);
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 2;
    ctx.strokeRect(340, 150, 600, 380);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('SOLMAR HEAT — QUICK GUIDE', 370, 190);
    ctx.fillStyle = '#d7e3f4';
    ctx.font = '15px sans-serif';
    const lines = [
      'WASD / Arrows — walk and drive. Shift — sprint.',
      'E — steal / enter / exit a car. Space — handbrake.',
      'Mouse — aim. Click — shoot (needs a pistol). F — punch.',
      'Yellow marker — your next job. Follow the arrow.',
      'Stars — wanted level. Lose the cops or pay at Lube & Tune.',
      'Buy a pistol and ammo at Ironclad Arms ($350 / $2 per bullet).',
      'Taxi fares: stop near a waving pedestrian while driving.',
      'Golden shells: 20 hidden around the bay, $50 each.',
      'P — pause & save.  M — mute.  H — close this guide.',
    ];
    lines.forEach((l, i) => ctx.fillText(l, 370, 226 + i * 30));
  }
}

// Minimap on its own small canvas: roads, water, blips.
export function drawMinimap(mctx) {
  const S = 180;
  const sx = S / G.city.W, sy = S / G.city.H;
  mctx.clearRect(0, 0, S, S);
  mctx.fillStyle = '#0e1424';
  mctx.fillRect(0, 0, S, S);
  mctx.fillStyle = '#22425e';
  mctx.fillRect(0, 16 * BLOCK * sy, S, S - 16 * BLOCK * sy);
  mctx.fillStyle = '#e8d29a';
  mctx.fillRect(0, 16 * BLOCK * sy, S, 6);
  mctx.strokeStyle = '#8b98ad';
  mctx.lineWidth = 2;
  for (let r = 0; r <= ROWS; r++) { mctx.beginPath(); mctx.moveTo(0, r * BLOCK * sy); mctx.lineTo(S, r * BLOCK * sy); mctx.stroke(); }
  for (let c = 0; c <= COLS; c++) { mctx.beginPath(); mctx.moveTo(c * BLOCK * sx, 0); mctx.lineTo(c * BLOCK * sx, S); mctx.stroke(); }
  // Buildings faint.
  mctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (const b of G.city.buildings) mctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  // Mission / fare blip.
  const tgt = missionTarget();
  const mark = tgt || (G.fare ? { x: G.fare.tx, y: G.fare.ty } : null);
  if (mark) {
    mctx.fillStyle = tgt ? '#ffd75e' : '#5eb2ff';
    mctx.beginPath(); mctx.arc(mark.x * sx, mark.y * sy, 4 + Math.sin(G.time * 5), 0, TAU); mctx.fill();
  }
  // Police blips.
  for (const c of G.cars) {
    if (c.driver !== 'police') continue;
    mctx.fillStyle = c.flash < 0.35 ? '#ff3b30' : '#2f7bff';
    mctx.beginPath(); mctx.arc(c.x * sx, c.y * sy, 3, 0, TAU); mctx.fill();
  }
  // Player arrow.
  const p = G.player;
  if (p) {
    const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
    const a = p.car ? p.car.angle : p.angle;
    mctx.save();
    mctx.translate(px * sx, py * sy);
    mctx.rotate(a);
    mctx.fillStyle = '#fff';
    mctx.beginPath(); mctx.moveTo(7, 0); mctx.lineTo(-5, -4.5); mctx.lineTo(-5, 4.5); mctx.closePath(); mctx.fill();
    mctx.restore();
    // View box.
    mctx.strokeStyle = 'rgba(255,255,255,0.5)';
    mctx.strokeRect((G.cam.x - 640) * sx, (G.cam.y - 360) * sy, 1280 * sx, 720 * sy);
  }
}
