// Sunset Bay's city: a deterministic grid of blocks, roads, a park and a
// waterfront, generated from a seed so every run plays the same streets.
// The city is drawn top-down in a warm sunset palette: sand sidewalks,
// dusk-purple asphalt, varied building colours, a green park and blue water
// with orange reflection streaks along the southern docks.
import { makeRng } from './rng.js';

export const ROAD = 64;
export const BLOCK = 200;
export const COLS = 7;
export const ROWS = 7;
export const WATER_H = 210;

const BUILDING_COLORS = ['#d96b4f', '#e8a34c', '#7a9bb5', '#b56576', '#c97b4a', '#8a7fb5', '#5d8a6a', '#d9c25a', '#a85f6e', '#6b8cae'];
const ROOF_COLORS = ['#7a4234', '#5f4f3d', '#3f4f5f', '#4f3d4a'];

export function buildWorld(seed) {
  const rng = makeRng(seed);
  const roadX = [];
  const roadY = [];
  for (let i = 0; i <= COLS; i++) roadX.push(ROAD / 2 + i * (BLOCK + ROAD));
  for (let j = 0; j <= ROWS; j++) roadY.push(ROAD / 2 + j * (BLOCK + ROAD));
  const W = roadX[COLS] + ROAD / 2;
  const H_LAND = roadY[ROWS] + ROAD / 2;
  const H = H_LAND + WATER_H;

  const buildings = [];
  const trees = [];
  const PARK = { bi: 2, bj: 2 };
  const LOT = { bi: 4, bj: 4 };
  const park = {
    x: roadX[PARK.bi] + ROAD / 2,
    y: roadY[PARK.bj] + ROAD / 2,
    w: BLOCK,
    h: BLOCK,
    cx: roadX[PARK.bi] + ROAD / 2 + BLOCK / 2,
    cy: roadY[PARK.bj] + ROAD / 2 + BLOCK / 2,
  };

  for (let bi = 0; bi < COLS; bi++) {
    for (let bj = 0; bj < ROWS; bj++) {
      const bx = roadX[bi] + ROAD / 2;
      const by = roadY[bj] + ROAD / 2;
      if (bi === PARK.bi && bj === PARK.bj) {
        for (let t = 0; t < 16; t++) {
          trees.push({ x: bx + rng.range(26, BLOCK - 26), y: by + rng.range(26, BLOCK - 26), r: rng.range(9, 15) });
        }
        continue;
      }
      if (bi === LOT.bi && bj === LOT.bj) continue; // open lot: parked cars, no buildings
      const n = rng.int(1, 3);
      let placed = 0;
      let tries = 0;
      while (placed < n && tries < 24) {
        tries += 1;
        const w = rng.range(70, 150);
        const h = rng.range(60, 130);
        const x = bx + rng.range(12, BLOCK - 12 - w);
        const y = by + rng.range(12, BLOCK - 12 - h);
        const clash = buildings.some((b) => b.x < x + w + 18 && b.x + b.w > x - 18 && b.y < y + h + 18 && b.y + b.h > y - 18);
        if (clash) continue;
        buildings.push({
          x, y, w, h,
          color: rng.pick(BUILDING_COLORS),
          roof: rng.pick(ROOF_COLORS),
          shade: rng.range(6, 16),
        });
        placed += 1;
      }
    }
  }

  // Piers jutting into the water along the southern shore.
  const piers = [];
  for (let p = 0; p < 4; p++) {
    piers.push({ x: 220 + p * 420, y: H_LAND - 6, w: 60, h: 120 });
  }

  const world = {
    seed, W, H, H_LAND, roadX, roadY, buildings, trees, park, piers,
    hideout: { x: park.cx, y: park.cy },
    delivery: { x: roadX[6], y: roadY[0] },
    docks: { x: Math.round(W * 0.55), y: H_LAND - 44 },
    spawn: { x: roadX[3], y: roadY[4] },
    lot: { x: roadX[LOT.bi] + ROAD / 2 + BLOCK / 2, y: roadY[LOT.bj] + ROAD / 2 + BLOCK / 2 },
  };
  return world;
}

// Push a circle (player, car, pedestrian) out of buildings and the world
// edge. Mutates p in place; returns true when a collision happened.
export function collideCircle(world, p, r) {
  let hit = false;
  if (p.x < r) { p.x = r; hit = true; }
  if (p.x > world.W - r) { p.x = world.W - r; hit = true; }
  if (p.y < r) { p.y = r; hit = true; }
  if (p.y > world.H_LAND - r) { p.y = world.H_LAND - r; hit = true; }
  for (const b of world.buildings) {
    const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.y = cy + (dy / d) * r;
      } else {
        p.y = b.y - r;
      }
      hit = true;
    }
  }
  return hit;
}

export function nearestRoadPoint(world, x, y) {
  let bx = world.roadX[0];
  let by = world.roadY[0];
  for (const rx of world.roadX) if (Math.abs(rx - x) < Math.abs(bx - x)) bx = rx;
  for (const ry of world.roadY) if (Math.abs(ry - y) < Math.abs(by - y)) by = ry;
  return { x: bx, y: by };
}

// Draw the city inside the camera's view rectangle. view is {x, y, w, h}
// in world coordinates; time drives the water shimmer.
export function drawWorld(ctx, world, view, time) {
  const { x: vx, y: vy, w: vw, h: vh } = view;
  // Ground: warm sand sidewalks everywhere, roads and water drawn over it.
  ctx.fillStyle = '#c99a63';
  ctx.fillRect(vx, vy, vw, vh);

  // Water along the southern shore, with slow sunset reflection streaks.
  if (vy + vh > world.H_LAND) {
    const wy = Math.max(vy, world.H_LAND);
    ctx.fillStyle = '#2e6f8e';
    ctx.fillRect(vx, wy, vw, vy + vh - wy);
    ctx.strokeStyle = 'rgba(255, 178, 92, 0.4)';
    ctx.lineWidth = 3;
    for (let s = 0; s < 8; s++) {
      const sy = world.H_LAND + 24 + s * 22;
      if (sy < vy || sy > vy + vh) continue;
      const off = Math.sin(time * 0.7 + s * 1.7) * 26;
      ctx.beginPath();
      ctx.moveTo(vx + ((s * 173 + off) % 300), sy);
      ctx.lineTo(vx + ((s * 173 + off) % 300) + 130, sy);
      ctx.stroke();
    }
    // Piers.
    for (const pier of world.piers) {
      ctx.fillStyle = '#8a6a4a';
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.fillStyle = '#6b4f36';
      for (let plank = 0; plank < 5; plank++) ctx.fillRect(pier.x, pier.y + 12 + plank * 22, pier.w, 3);
    }
    // Shoreline.
    ctx.fillStyle = '#e8c98a';
    ctx.fillRect(vx, world.H_LAND - 4, vw, 8);
  }

  // Roads: dusk asphalt bands with dashed centre lines.
  ctx.fillStyle = '#3d3a4a';
  for (const rx of world.roadX) {
    if (rx + ROAD / 2 < vx || rx - ROAD / 2 > vx + vw) continue;
    ctx.fillRect(rx - ROAD / 2, vy, ROAD, vh);
  }
  for (const ry of world.roadY) {
    if (ry + ROAD / 2 < vy || ry - ROAD / 2 > vy + vh) continue;
    ctx.fillRect(vx, ry - ROAD / 2, vw, ROAD);
  }
  ctx.strokeStyle = 'rgba(232, 217, 160, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (const rx of world.roadX) {
    if (rx < vx || rx > vx + vw) continue;
    ctx.beginPath();
    ctx.moveTo(rx, vy);
    ctx.lineTo(rx, vy + vh);
    ctx.stroke();
  }
  for (const ry of world.roadY) {
    if (ry < vy || ry > vy + vh) continue;
    ctx.beginPath();
    ctx.moveTo(vx, ry);
    ctx.lineTo(vx + vw, ry);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // The park: green lawn, a crossing path, trees and the hideout cabin.
  const park = world.park;
  ctx.fillStyle = '#6fa860';
  ctx.fillRect(park.x, park.y, park.w, park.h);
  ctx.fillStyle = '#c9a06b';
  ctx.fillRect(park.x + park.w / 2 - 8, park.y, 16, park.h);
  ctx.fillRect(park.x, park.y + park.h / 2 - 8, park.w, 16);
  // Hideout cabin at the park's heart.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(park.cx - 14, park.cy - 8, 44, 34);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(park.cx - 20, park.cy - 14, 44, 34);
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(park.cx - 20, park.cy - 14, 44, 10);
  for (const t of world.trees) {
    if (t.x < vx - 20 || t.x > vx + vw + 20 || t.y < vy - 20 || t.y > vy + vh + 20) continue;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f7a3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d9a4a';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buildings: a sunset shadow, the coloured body, a darker roof and lit windows.
  for (const b of world.buildings) {
    if (b.x > vx + vw || b.x + b.w < vx || b.y > vy + vh || b.y + b.h < vy) continue;
    ctx.fillStyle = 'rgba(60, 20, 20, 0.28)';
    ctx.fillRect(b.x + b.shade, b.y + b.shade, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(255, 220, 150, 0.55)';
    for (let wx = b.x + 16; wx < b.x + b.w - 10; wx += 20) {
      for (let wy = b.y + 16; wy < b.y + b.h - 10; wy += 24) {
        if (((wx * 7 + wy * 13) % 5) !== 0) ctx.fillRect(wx, wy, 7, 9);
      }
    }
  }
}
