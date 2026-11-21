// The player on foot: WASD / arrow movement, getting in and out of cars,
// and the punch. The player is a circle that slides around buildings.
import { collideCircle } from './world.js';

const WALK_SPEED = 235;

export class Player {
  constructor(world) {
    this.x = world.spawn.x;
    this.y = world.spawn.y;
    this.r = 14;
    this.angle = -Math.PI / 2;
    this.inCar = null; // the car object being driven, or null
    this.punchCd = 0;
    this.punchAnim = 0;
    this.moving = false;
  }

  update(dt, input, game) {
    if (this.punchCd > 0) this.punchCd -= dt;
    if (this.punchAnim > 0) this.punchAnim -= dt;
    if (this.inCar) return; // driving is handled by cars.js
    const ix = (input.held('KeyD', 'ArrowRight') ? 1 : 0) - (input.held('KeyA', 'ArrowLeft') ? 1 : 0);
    const iy = (input.held('KeyS', 'ArrowDown') ? 1 : 0) - (input.held('KeyW', 'ArrowUp') ? 1 : 0);
    this.moving = ix !== 0 || iy !== 0;
    if (this.moving) {
      const len = Math.hypot(ix, iy);
      const nx = ix / len;
      const ny = iy / len;
      this.angle = Math.atan2(ny, nx);
      this.x += nx * WALK_SPEED * dt;
      this.y += ny * WALK_SPEED * dt;
      collideCircle(game.world, this, this.r);
    }
  }

  // E near a car: climb in. Stealing a car is a crime.
  tryEnterCar(game) {
    if (this.inCar) return false;
    let best = null;
    let bestD = 84;
    for (const car of game.cars) {
      if (car.kind === 'police') continue;
      const d = Math.hypot(car.x - this.x, car.y - this.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return false;
    this.inCar = best;
    best.kind = 'player';
    best.speed = 0;
    // Stealing a car is a crime; getting back into a car already taken is not.
    if (!best.stolen) {
      best.stolen = true;
      game.raiseWanted(1, 'car stolen');
    }
    game.audio.blip();
    return true;
  }

  exitCar(game) {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    car.kind = 'parked';
    car.speed = 0;
    this.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    this.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    collideCircle(game.world, this, this.r);
  }

  // Space: punch the nearest pedestrian in front of the player.
  punch(game) {
    if (this.inCar || this.punchCd > 0) return false;
    this.punchCd = 0.45;
    this.punchAnim = 0.22;
    game.audio.punch();
    let best = null;
    let bestD = 56;
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - this.x;
      const dy = ped.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > bestD) continue;
      const dot = (dx * Math.cos(this.angle) + dy * Math.sin(this.angle)) / (d || 1);
      if (dot < 0.2) continue;
      best = ped;
      bestD = d;
    }
    if (best) {
      best.state = 'down';
      best.downT = 4;
      game.raiseWanted(1, 'pedestrian hit');
      game.addParticles(best.x, best.y, '#ffd94f', 10);
      return true;
    }
    return false;
  }

  draw(ctx) {
    if (this.inCar) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body: teal jacket, dark trousers, with a white ring so the player
    // reads clearly against the street.
    ctx.fillStyle = '#2a9d8f';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(7, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    // Punching arm.
    if (this.punchAnim > 0) {
      ctx.fillStyle = '#2a9d8f';
      ctx.fillRect(8, -3, 14, 6);
    }
    ctx.restore();
  }
}
