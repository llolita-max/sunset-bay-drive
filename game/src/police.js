// The wanted system and the Bay City police: patrol cars spawn to match the
// wanted level, chase the player and ram the player's car. On foot, police
// who stay close at wanted 3 or higher bust the player. Wanted decays when
// the player stays out of trouble and out of sight.
import { makeCar, drawCar } from './cars.js';
import { collideCircle } from './world.js';

const POLICE_MAX_SPEED = 565;

export function updatePolice(dt, game) {
  const { world, player, police } = game;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;

  // Spawn police to match the wanted level, at road points away from the player.
  const want = Math.min(game.wanted, 5);
  let guard = 0;
  while (police.length < want && guard < 8) {
    guard += 1;
    const i = Math.floor(game.rng.next() * world.roadX.length);
    const j = Math.floor(game.rng.next() * world.roadY.length);
    const x = world.roadX[i];
    const y = world.roadY[j];
    if (Math.hypot(x - px, y - py) < 520) continue;
    const car = makeCar(x, y, 0, '#f2f2f2', 'police');
    car.speed = 200;
    police.push(car);
  }
  // When the heat is off, the extra cars leave.
  while (police.length > want) police.pop();

  let nearest = Infinity;
  for (const car of police) {
    if (car.ramCd > 0) car.ramCd -= dt;
    const dx = px - car.x;
    const dy = py - car.y;
    const dist = Math.hypot(dx, dy) || 1;
    nearest = Math.min(nearest, dist);
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-2.8, Math.min(2.8, diff * 3));
    car.angle += turn * dt;
    const targetSpeed = dist > 320 ? POLICE_MAX_SPEED : 430;
    car.speed += Math.sign(targetSpeed - car.speed) * 420 * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (collideCircle(world, car, 24)) car.speed *= 0.5;

    if (dist < 52) {
      if (player.inCar) {
        // Ram the player's car: shove it and damage the player.
        if (car.ramCd <= 0) {
          car.ramCd = 0.9;
          game.damage(6, 'rammed by police');
          game.audio.thud();
          game.addParticles(player.inCar.x, player.inCar.y, '#ffb14f', 8);
          const push = 130;
          player.inCar.x += (dx / dist) * -push * 0.12;
          player.inCar.y += (dy / dist) * -push * 0.12;
          player.inCar.speed *= 0.6;
        }
      } else if (game.wanted >= 3) {
        // On foot with the heat on: being caught means BUSTED.
        game.bustedTimer += dt;
        if (game.bustedTimer >= 3) game.busted('Caught by the Bay City PD');
      }
    }
  }
  if (nearest > 90 || game.wanted < 3) game.bustedTimer = Math.max(0, game.bustedTimer - dt * 2);
  game.nearestPolice = nearest;
}

export function drawPolice(ctx, police, time) {
  for (const car of police) drawCar(ctx, car, time);
}
