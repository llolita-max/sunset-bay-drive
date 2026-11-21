// Sunset Bay's story: a four-mission chain. Each mission names an objective
// on screen, points at a map marker and pays cash on completion, then starts
// the next one. Failing a timed mission restarts that mission.
export const MISSION_DEFS = [
  {
    title: '1 — Hotwire a Ride',
    brief: 'Mara needs wheels. Take any car on the street — press E beside one.',
    reward: 150,
  },
  {
    title: '2 — Sunset Delivery',
    brief: 'Package in the trunk. Drive it to Marina Heights before the timer runs out.',
    reward: 300,
    timer: 90,
  },
  {
    title: '3 — Lose the Heat',
    brief: 'The PD is on you. Reach the hideout cabin in the park and stay out of sight until the heat dies.',
    reward: 400,
  },
  {
    title: '4 — Dockside Getaway',
    brief: 'One last run: get to the docks with the whole city chasing you.',
    reward: 600,
    timer: 150,
  },
];

export class Missions {
  constructor(startIndex) {
    this.index = startIndex || 0;
    this.timer = 0;
    this.timerMax = 0;
    this.hidden = false; // mission 3: the player is hiding at the hideout
    this.done = false;
  }

  get def() {
    return MISSION_DEFS[this.index] || null;
  }

  start(game) {
    const def = this.def;
    if (!def) return;
    this.timerMax = def.timer || 0;
    this.timer = this.timerMax;
    this.hidden = false;
    if (this.index === 2) {
      game.wanted = 3;
      game.lastCrime = game.time;
      game.toast('The PD is on you — 3 stars!');
    }
    if (this.index === 3) {
      game.wanted = 4;
      game.lastCrime = game.time;
      game.toast('Full pursuit — get to the docks!');
    }
    // The banner already shows the brief; the toast names the job only.
    game.toast(def.title);
  }

  // The mission's current map target, or null when no mission is active.
  target(game) {
    const world = game.world;
    const player = game.player;
    if (this.done || !this.def) return null;
    if (this.index === 0) {
      // The nearest car the player can take.
      let best = null;
      let bestD = Infinity;
      for (const car of game.cars) {
        if (car.kind === 'police' || car === player.inCar) continue;
        const d = Math.hypot(car.x - player.x, car.y - player.y);
        if (d < bestD) { best = car; bestD = d; }
      }
      if (!best) return null;
      return { x: best.x, y: best.y, label: 'Take a car' };
    }
    if (this.index === 1) return { x: world.delivery.x, y: world.delivery.y, label: 'Marina Heights' };
    if (this.index === 2) return { x: world.hideout.x, y: world.hideout.y, label: 'Hideout' };
    return { x: world.docks.x, y: world.docks.y, label: 'The Docks' };
  }

  update(dt, game) {
    if (this.done || !this.def) return;
    const player = game.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const py = player.inCar ? player.inCar.y : player.y;

    if (this.timerMax > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        game.toast('Too slow — the job is still open. Try again.');
        game.audio.thud();
        this.start(game);
        return;
      }
    }

    if (this.index === 0) {
      if (player.inCar) this.complete(game);
      return;
    }
    if (this.index === 1) {
      if (Math.hypot(px - game.world.delivery.x, py - game.world.delivery.y) < 78) this.complete(game);
      return;
    }
    if (this.index === 2) {
      const atHideout = Math.hypot(px - game.world.hideout.x, py - game.world.hideout.y) < 95;
      if (atHideout) {
        if (!this.hidden) {
          this.hidden = true;
          game.toast('Hidden. Stay put until the heat dies down…');
        }
        game.wantedDecay = (game.wantedDecay || 0) + dt;
        if (game.wantedDecay > 1.1) {
          game.wantedDecay = 0;
          game.wanted = Math.max(0, game.wanted - 1);
        }
        if (game.wanted === 0) this.complete(game);
      } else {
        this.hidden = false;
      }
      return;
    }
    if (this.index === 3) {
      if (Math.hypot(px - game.world.docks.x, py - game.world.docks.y) < 85) this.complete(game);
    }
  }

  complete(game) {
    const def = this.def;
    game.cash += def.reward;
    game.audio.cash();
    game.addParticles(game.player.x, game.player.y, '#ffd94f', 18);
    game.toast(`Job done — +$${def.reward}`);
    game.bestCash = Math.max(game.bestCash || 0, game.cash);
    this.index += 1;
    if (this.index >= MISSION_DEFS.length) {
      this.done = true;
      game.storyDone = true;
      // The banner announces the story's end; no toast needed.
      game.save();
      return;
    }
    game.save();
    this.start(game);
  }
}
