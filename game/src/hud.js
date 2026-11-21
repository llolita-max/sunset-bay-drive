// The HUD and the screens: wanted stars, cash, health, speed, the mission
// banner, the minimap, toasts, and the title / pause / busted overlays. All
// of it is drawn on the same canvas as the game.

function drawStar(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd94f' : 'rgba(0, 0, 0, 0.45)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(12, 12, 24, 0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
}

export function drawHUD(ctx, game, view) {
  const { width: W, height: H } = view;
  ctx.textBaseline = 'alphabetic';

  // Wanted stars, top-left.
  panel(ctx, 12, 12, 168, 40);
  for (let i = 0; i < 5; i++) drawStar(ctx, 34 + i * 30, 32, 11, i < game.wanted);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(game.wanted > 0 ? 'WANTED' : 'CLEAN', 12 + 168 + 10, 36);

  // Cash and health, below the stars.
  panel(ctx, 12, 60, 168, 62);
  ctx.fillStyle = '#7de87d';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(`$${game.cash}`, 24, 88);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('HEALTH', 24, 110);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(82, 100, 84, 10);
  ctx.fillStyle = game.health > 30 ? '#7de87d' : '#ff5a4f';
  ctx.fillRect(82, 100, Math.max(0, 84 * (game.health / 100)), 10);

  // Mission banner, top-centre.
  const missions = game.missions;
  if (!missions.done && missions.def) {
    const def = missions.def;
    ctx.font = 'bold 15px system-ui, sans-serif';
    const titleW = ctx.measureText(def.title).width;
    ctx.font = '13px system-ui, sans-serif';
    const briefW = ctx.measureText(def.brief).width;
    const bw = Math.max(titleW, briefW) + 32;
    const bx = (W - bw) / 2;
    const bh = missions.timerMax > 0 ? 78 : 58;
    panel(ctx, bx, 12, bw, bh);
    ctx.fillStyle = '#ffd94f';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(def.title, W / 2, 33);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(def.brief, W / 2, 54);
    if (missions.timerMax > 0) {
      ctx.fillStyle = missions.timer < 15 ? '#ff5a4f' : '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(`${Math.ceil(missions.timer)}s left`, W / 2, 72);
    }
  } else if (missions.done) {
    panel(ctx, W / 2 - 190, 12, 380, 34);
    ctx.fillStyle = '#ffd94f';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★ STORY COMPLETE — free roam ★', W / 2, 35);
  }

  // Minimap, top-right.
  drawMinimap(ctx, game, view);

  // Speed, bottom-right, while driving.
  if (game.player.inCar) {
    const mph = Math.round(Math.abs(game.player.inCar.speed) * 0.12);
    panel(ctx, W - 132, H - 64, 120, 52);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${mph}`, W - 52, H - 28);
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('mph', W - 24, H - 28);
  }

  // Controls hint, bottom-left, fading after the first seconds.
  if (game.time < 14) {
    ctx.globalAlpha = Math.max(0, Math.min(1, (14 - game.time) / 2));
    panel(ctx, 12, H - 64, 400, 52);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('WASD / arrows — move & drive    E — enter / exit car', 24, H - 44);
    ctx.fillText('Space — punch    P — pause    M — mute', 24, H - 24);
    ctx.globalAlpha = 1;
  }

  // Toasts, under the banner.
  ctx.textAlign = 'center';
  let ty = 112;
  for (const toast of game.toasts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, toast.life / 0.8));
    ctx.font = 'bold 15px system-ui, sans-serif';
    const tw = ctx.measureText(toast.text).width + 28;
    panel(ctx, (W - tw) / 2, ty, tw, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(toast.text, W / 2, ty + 20);
    ty += 38;
  }
  ctx.globalAlpha = 1;

  // Busted warning while police close in on foot.
  if (game.bustedTimer > 0 && !game.player.inCar) {
    ctx.fillStyle = '#ff5a4f';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THEY ARE ON YOU — RUN!', W / 2, H - 96);
  }

  // Off-screen mission marker arrow.
  const target = missions.target(game);
  if (target) {
    const px = game.player.inCar ? game.player.inCar.x : game.player.x;
    const py = game.player.inCar ? game.player.inCar.y : game.player.y;
    const dx = target.x - px;
    const dy = target.y - py;
    const dist = Math.hypot(dx, dy);
    const sx = W / 2 + dx;
    const sy = H / 2 + dy;
    if (sx < 60 || sx > W - 60 || sy < 60 || sy > H - 60) {
      const ax = Math.max(50, Math.min(W - 50, sx));
      const ay = Math.max(90, Math.min(H - 90, sy));
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd94f';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -10);
      ctx.lineTo(-10, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd94f';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const labelX = Math.max(110, Math.min(W - 110, ax));
      ctx.fillText(`${target.label} — ${Math.round(dist / 10) * 10}m`, labelX, ay + 26);
    }
  }
}

function drawMinimap(ctx, game, view) {
  const { width: W } = view;
  const world = game.world;
  const mw = 200;
  const mh = Math.round((mw * world.H) / world.W);
  const mx = W - mw - 12;
  const my = 12;
  const s = mw / world.W;
  panel(ctx, mx - 6, my - 6, mw + 12, mh + 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(mx, my, mw, mh);
  // Water.
  ctx.fillStyle = '#2e6f8e';
  ctx.fillRect(mx, my + world.H_LAND * s, mw, mh - world.H_LAND * s);
  // Roads.
  ctx.strokeStyle = '#3d3a4a';
  ctx.lineWidth = 5;
  for (const rx of world.roadX) {
    ctx.beginPath();
    ctx.moveTo(mx + rx * s, my);
    ctx.lineTo(mx + rx * s, my + mh);
    ctx.stroke();
  }
  for (const ry of world.roadY) {
    ctx.beginPath();
    ctx.moveTo(mx, my + ry * s);
    ctx.lineTo(mx + mw, my + ry * s);
    ctx.stroke();
  }
  // Park.
  ctx.fillStyle = '#6fa860';
  ctx.fillRect(mx + world.park.x * s, my + world.park.y * s, world.park.w * s, world.park.h * s);
  // Mission marker.
  const target = game.missions.target(game);
  if (target) {
    const pulse = 3 + Math.sin(game.time * 5) * 1.5;
    ctx.fillStyle = '#ffd94f';
    ctx.beginPath();
    ctx.arc(mx + target.x * s, my + target.y * s, pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cars and pedestrians as dots.
  ctx.fillStyle = 'rgba(230, 230, 230, 0.8)';
  for (const car of game.cars) ctx.fillRect(mx + car.x * s - 1, my + car.y * s - 1, 2, 2);
  const flash = Math.floor(game.time * 4) % 2 === 0;
  ctx.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
  for (const car of game.police) {
    ctx.beginPath();
    ctx.arc(mx + car.x * s, my + car.y * s, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = game.player.inCar ? game.player.inCar.x : game.player.x;
  const py = game.player.inCar ? game.player.inCar.y : game.player.y;
  const ang = game.player.inCar ? game.player.inCar.angle : game.player.angle;
  ctx.save();
  ctx.translate(mx + px * s, my + py * s);
  ctx.rotate(ang);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function overlay(ctx, view, alpha) {
  ctx.fillStyle = `rgba(10, 8, 20, ${alpha})`;
  ctx.fillRect(0, 0, view.width, view.height);
}

function centred(ctx, view, y, text, font, color) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(text, view.width / 2, y);
}

export function drawTitle(ctx, game, view) {
  overlay(ctx, view, 0.55);
  const W = view.width;
  const blink = Math.floor(game.time * 2) % 2 === 0;
  centred(ctx, view, 170, 'SUNSET BAY', 'bold 84px system-ui, sans-serif', '#ffb14f');
  centred(ctx, view, 210, 'an open-world crime story', 'italic 22px system-ui, sans-serif', '#ffd9a0');
  centred(ctx, view, 280, 'Dusk is falling on Sunset Bay. Mara Vale is out of cash, out of luck,', '17px system-ui, sans-serif', '#fff');
  centred(ctx, view, 306, 'and one stolen car away from the biggest night of her life.', '17px system-ui, sans-serif', '#fff');
  centred(ctx, view, 380, 'WASD / arrows — move and drive      E — enter / exit a car', '16px system-ui, sans-serif', '#e8e8e8');
  centred(ctx, view, 408, 'Space — punch      P — pause      M — mute sound', '16px system-ui, sans-serif', '#e8e8e8');
  centred(ctx, view, 452, 'Steal cars, dodge the Bay City PD, run four jobs — and don\'t get busted.', '16px system-ui, sans-serif', '#e8e8e8');
  if (game.saveData && game.saveData.missionIndex > 0) {
    centred(ctx, view, 500, `Saved: mission ${game.saveData.missionIndex + 1} of 4 — $${game.saveData.cash} in the pocket`, 'bold 16px system-ui, sans-serif', '#7de87d');
  }
  if (blink) centred(ctx, view, 560, 'PRESS ENTER TO START', 'bold 24px system-ui, sans-serif', '#ffd94f');
}

export function drawPaused(ctx, view) {
  overlay(ctx, view, 0.6);
  centred(ctx, view, 320, 'PAUSED', 'bold 56px system-ui, sans-serif', '#fff');
  centred(ctx, view, 370, 'Press P or Esc to keep playing', '18px system-ui, sans-serif', '#e8e8e8');
}

export function drawBusted(ctx, game, view) {
  overlay(ctx, view, 0.62);
  centred(ctx, view, 300, 'BUSTED', 'bold 72px system-ui, sans-serif', '#ff5a4f');
  centred(ctx, view, 350, game.bustedReason || 'The Bay City PD caught up with you.', '18px system-ui, sans-serif', '#fff');
  centred(ctx, view, 400, `Cash kept: $${game.cash}  ·  Mission ${Math.min(game.missions.index + 1, 4)} of 4`, '16px system-ui, sans-serif', '#e8e8e8');
  if (Math.floor(game.time * 2) % 2 === 0) {
    centred(ctx, view, 470, 'PRESS R TO GET BACK OUT THERE', 'bold 22px system-ui, sans-serif', '#ffd94f');
  }
}
