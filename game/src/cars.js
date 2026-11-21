// Cars in Sunset Bay: the player's driven car with arcade acceleration and
// steering, and traffic cars that follow the road grid in lanes, turn at
// intersections and slow for the car ahead.
import { collideCircle } from './world.js';

export const CAR_COLORS = ['#d94f4f', '#4f7ad9', '#e8c84c', '#7ad94f', '#d94fb5', '#e8e8e8', '#3a3a3a', '#e87b4c', '#4fd9c9'];

const LANE = 16;
const DIRS = ['N', 'S', 'E', 'W'];
const DIR_ANGLE = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

export function makeCar(x, y, angle, color, kind) {
  return {
    x, y, angle, speed: 0, color, kind, // kind: 'traffic' | 'parked' | 'player' | 'police'
    dir: 'E', targetI: 0, targetJ: 0,
    hitCd: 0, brakeLight: false, ramCd: 0,
  };
}

function laneCoord(world, car) {
  // The coordinate across the road for the car's lane (right-hand traffic).
  if (car.dir === 'E') return { x: car.x, y: world.roadY[car.targetJ] + LANE };
  if (car.dir === 'W') return { x: car.x, y: world.roadY[car.targetJ] - LANE };
  if (car.dir === 'S') return { x: world.roadX[car.targetI] + LANE, y: car.y };
  return { x: world.roadX[car.targetI] - LANE, y: car.y };
}

function pickNextLeg(world, car, rng) {
  const i = car.targetI;
  const j = car.targetJ;
  const options = [];
  // Keep going straight, or turn left / right; never U-turn.
  const straight = { N: 'N', S: 'S', E: 'E', W: 'W' }[car.dir];
  const left = { N: 'W', S: 'E', E: 'N', W: 'S' }[car.dir];
  const right = { N: 'E', S: 'W', E: 'S', W: 'N' }[car.dir];
  const can = (d) => (d === 'N' && j > 0) || (d === 'S' && j < world.roadY.length - 1) || (d === 'W' && i > 0) || (d === 'E' && i < world.roadX.length - 1);
  if (can(straight)) { options.push(straight, straight, straight); }
  if (can(left)) options.push(left);
  if (can(right)) options.push(right);
  const next = options.length ? options[Math.floor(rng.next() * options.length)] : straight;
  car.dir = next;
  if (next === 'N') { car.targetI = i; car.targetJ = j - 1; }
  if (next === 'S') { car.targetI = i; car.targetJ = j + 1; }
  if (next === 'W') { car.targetI = i - 1; car.targetJ = j; }
  if (next === 'E') { car.targetI = i + 1; car.targetJ = j; }
}

export function spawnTraffic(world, rng, count) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    const vertical = rng.next() < 0.5;
    const dir = vertical ? (rng.next() < 0.5 ? 'S' : 'N') : (rng.next() < 0.5 ? 'E' : 'W');
    const i = rng.int(0, world.roadX.length - 1);
    const j = rng.int(0, world.roadY.length - 1);
    const car = makeCar(0, 0, DIR_ANGLE[dir], rng.pick(CAR_COLORS), 'traffic');
    car.dir = dir;
    car.targetI = i;
    car.targetJ = j;
    if (dir === 'S') { car.x = world.roadX[i] + LANE; car.y = world.roadY[j]; }
    if (dir === 'N') { car.x = world.roadX[i] - LANE; car.y = world.roadY[j]; }
    if (dir === 'E') { car.x = world.roadX[i]; car.y = world.roadY[j] + LANE; }
    if (dir === 'W') { car.x = world.roadX[i]; car.y = world.roadY[j] - LANE; }
    car.speed = rng.range(110, 160);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(world, rng, count) {
  const cars = [];
  // A few parked cars along road edges, plus a row in the open lot.
  for (let n = 0; n < count; n++) {
    const i = rng.int(0, world.roadX.length - 1);
    const j = rng.int(0, world.roadY.length - 1);
    const along = rng.next() < 0.5;
    const x = along ? world.roadX[i] + (rng.next() < 0.5 ? 26 : -26) : world.roadX[i] + rng.range(-140, 140);
    const y = along ? world.roadY[j] + rng.range(-140, 140) : world.roadY[j] + (rng.next() < 0.5 ? 26 : -26);
    const car = makeCar(x, y, along ? (rng.next() < 0.5 ? 0 : Math.PI) : (rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2), rng.pick(CAR_COLORS), 'parked');
    cars.push(car);
  }
  for (let n = 0; n < 5; n++) {
    cars.push(makeCar(world.lot.x - 70 + n * 34, world.lot.y - 30, Math.PI / 2, rng.pick(CAR_COLORS), 'parked'));
  }
  return cars;
}

function carAheadInLane(car, cars, range) {
  let best = null;
  let bestD = range;
  for (const o of cars) {
    if (o === car || o.kind === 'parked') continue;
    if (o.dir !== car.dir) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const along = car.dir === 'E' ? dx : car.dir === 'W' ? -dx : car.dir === 'S' ? dy : -dy;
    const across = car.dir === 'E' || car.dir === 'W' ? Math.abs(dy) : Math.abs(dx);
    if (along > 0 && along < bestD && across < 26) { best = o; bestD = along; }
  }
  return best;
}

export function updateTraffic(dt, world, cars, rng) {
  for (const car of cars) {
    if (car.kind !== 'traffic') continue;
    if (car.hitCd > 0) car.hitCd -= dt;
    let target = 150;
    const ahead = carAheadInLane(car, cars, 78);
    if (ahead) target = Math.max(0, ahead.speed - 30);
    car.speed += Math.sign(target - car.speed) * 240 * dt;
    if (car.speed < 0) car.speed = 0;
    const step = car.speed * dt;
    if (car.dir === 'E') car.x += step;
    if (car.dir === 'W') car.x -= step;
    if (car.dir === 'S') car.y += step;
    if (car.dir === 'N') car.y -= step;
    // Ease across the road into the lane for the current direction.
    const lane = laneCoord(world, car);
    const ease = Math.min(1, 8 * dt);
    if (car.dir === 'E' || car.dir === 'W') car.y += (lane.y - car.y) * ease;
    else car.x += (lane.x - car.x) * ease;
    car.angle = DIR_ANGLE[car.dir];
    const tx = world.roadX[car.targetI];
    const ty = world.roadY[car.targetJ];
    if (Math.abs(car.x - tx) < 16 && Math.abs(car.y - ty) < 16) pickNextLeg(world, car, rng);
    if (collideCircle(world, car, 24)) car.speed *= 0.5;
  }
  // Gentle separation so cars do not sit inside each other.
  for (let a = 0; a < cars.length; a++) {
    for (let b = a + 1; b < cars.length; b++) {
      const ca = cars[a];
      const cb = cars[b];
      if (ca.kind === 'parked' && cb.kind === 'parked') continue;
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 44 * 44 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (44 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        if (ca.kind !== 'parked') { ca.x -= nx * push; ca.y -= ny * push; }
        if (cb.kind !== 'parked') { cb.x += nx * push; cb.y += ny * push; }
      }
    }
  }
}

// Arcade driving for the car the player is in. Returns an event string when
// the car hits something hard: 'crash' | null.
export function updatePlayerCar(dt, car, input, world) {
  const accel = input.held('KeyW', 'ArrowUp');
  const brake = input.held('KeyS', 'ArrowDown');
  const steer = (input.held('KeyA', 'ArrowLeft') ? -1 : 0) + (input.held('KeyD', 'ArrowRight') ? 1 : 0);
  if (accel) car.speed += 460 * dt;
  if (brake) car.speed -= (car.speed > 0 ? 640 : 300) * dt;
  car.speed = Math.max(-170, Math.min(540, car.speed));
  car.speed -= car.speed * 0.3 * dt;
  if (!accel && !brake && Math.abs(car.speed) < 12) car.speed = 0;
  car.brakeLight = brake && car.speed > 0;
  const turnRate = 2.5 * Math.min(1, Math.abs(car.speed) / 170);
  car.angle += steer * turnRate * Math.sign(car.speed || 1) * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  let event = null;
  if (collideCircle(world, car, 24)) {
    if (Math.abs(car.speed) > 260) event = 'crash';
    car.speed *= 0.35;
  }
  return event;
}

export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(-19, -9, 40, 24);
  // Body.
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-20, -11, 40, 22, 6);
  ctx.fill();
  // Roof and windshield.
  ctx.fillStyle = 'rgba(20, 24, 40, 0.85)';
  ctx.beginPath();
  ctx.roundRect(-6, -9, 14, 18, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(180, 210, 235, 0.7)';
  ctx.fillRect(8, -8, 4, 16);
  // Headlights and brake lights.
  ctx.fillStyle = '#fff2b0';
  ctx.fillRect(18, -9, 3, 4);
  ctx.fillRect(18, 5, 3, 4);
  ctx.fillStyle = car.brakeLight ? '#ff2a2a' : '#8a2020';
  ctx.fillRect(-21, -9, 3, 4);
  ctx.fillRect(-21, 5, 3, 4);
  if (car.kind === 'police') {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-2, -11, 10, 22);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 3, 2);
    // Flashing light bar.
    const flash = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
    ctx.fillRect(-4, -12, 5, 4);
    ctx.fillStyle = flash ? '#2a6bff' : '#ff2a2a';
    ctx.fillRect(-4, 8, 5, 4);
  }
  ctx.restore();
}
