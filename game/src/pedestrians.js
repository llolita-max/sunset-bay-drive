// Pedestrians: ordinary people walking the sidewalk loops around the city
// blocks. They flee from a punch or a speeding car, and a knocked-down
// pedestrian stays down for a few seconds before getting back up.
import { BLOCK } from './world.js';

const SHIRTS = ['#e8e8e8', '#d94f4f', '#4f7ad9', '#e8c84c', '#7ad94f', '#b56576', '#8a7fb5', '#e87b4c'];

export function spawnPeds(world, rng, count) {
  const peds = [];
  for (let n = 0; n < count; n++) {
    const bi = rng.int(0, 6);
    const bj = rng.int(0, 6);
    if (bi === 2 && bj === 2) continue;
    const bx = world.roadX[bi] + 64 / 2;
    const by = world.roadY[bj] + 64 / 2;
    peds.push({
      bi, bj, bx, by,
      t: rng.range(0, 800),
      dir: rng.next() < 0.5 ? 1 : -1,
      speed: rng.range(32, 58),
      color: rng.pick(SHIRTS),
      state: 'walk',
      downT: 0,
      fleeT: 0,
      x: bx, y: by,
      fx: 0, fy: 0,
    });
  }
  return peds;
}

// Position on the sidewalk loop around a block, from the loop parameter t.
function loopPoint(ped, t) {
  const inset = 12;
  const x0 = ped.bx + inset;
  const y0 = ped.by + inset;
  const w = BLOCK - inset * 2;
  const h = BLOCK - inset * 2;
  const per = 2 * (w + h);
  let s = ((t % per) + per) % per;
  if (s < w) return { x: x0 + s, y: y0 };
  s -= w;
  if (s < h) return { x: x0 + w, y: y0 + s };
  s -= h;
  if (s < w) return { x: x0 + w - s, y: y0 + h };
  s -= w;
  return { x: x0, y: y0 + h - s };
}

export function updatePeds(dt, world, peds, game) {
  const player = game.player;
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) ped.state = 'walk';
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      ped.x += ped.fx * 150 * dt;
      ped.y += ped.fy * 150 * dt;
      ped.x = Math.max(20, Math.min(world.W - 20, ped.x));
      ped.y = Math.max(20, Math.min(world.H_LAND - 20, ped.y));
      if (ped.fleeT <= 0) {
        // Rejoin the nearest sidewalk loop.
        ped.state = 'walk';
        const dx = Math.max(0, Math.min(176, ped.x - ped.bx - 12));
        const dy = Math.max(0, Math.min(176, ped.y - ped.by - 12));
        ped.t = dx + dy;
      }
      continue;
    }
    // Flee from a nearby threat: a punching player or a fast car.
    let threat = null;
    const pd = Math.hypot(player.x - ped.x, player.y - ped.y);
    if (!player.inCar && pd < 70 && player.punchAnim > 0) threat = player;
    if (player.inCar) {
      const car = player.inCar;
      if (Math.hypot(car.x - ped.x, car.y - ped.y) < 90 && Math.abs(car.speed) > 120) threat = car;
    }
    if (threat) {
      const d = Math.hypot(ped.x - threat.x, ped.y - threat.y) || 1;
      ped.fx = (ped.x - threat.x) / d;
      ped.fy = (ped.y - threat.y) / d;
      ped.state = 'flee';
      ped.fleeT = 1.6;
      continue;
    }
    ped.t += ped.speed * ped.dir * dt;
    const pos = loopPoint(ped, ped.t);
    ped.x = pos.x;
    ped.y = pos.y;
  }
}

export function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(1.2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(11, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(0, -2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
