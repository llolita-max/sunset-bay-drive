// Sunset Bay: boot and the one loop. The game moves between four screens —
// title, playing, paused and busted — and the loop advances the world, the
// traffic, the pedestrians, the police and the mission chain every frame.
//
// Scenario query params (for play-testing and screenshots; they only set up
// the opening state, the render is always the game's own):
//   ?scene=play   start playing at once instead of the title screen
//   ?seed=N       fix the city seed
//   ?driving=1    start inside a car
//   ?wanted=N     start with that wanted level
//   ?mission=N    start on mission N (0-based)
//   ?place=X      start at spawn | lot | park | docks | delivery
//   ?still=1      render the opening state without advancing the simulation
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { makeRng } from './rng.js';
import { buildWorld, drawWorld, collideCircle } from './world.js';
import { Player } from './player.js';
import { spawnTraffic, spawnParked, updateTraffic, updatePlayerCar, drawCar } from './cars.js';
import { spawnPeds, updatePeds, drawPed } from './pedestrians.js';
import { updatePolice, drawPolice } from './police.js';
import { Missions } from './missions.js';
import * as hud from './hud.js';

const SAVE_KEY = 'sunset-bay-save-v1';
const MAX_FRAME = 0.05;

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function resize() {
  canvas.width = Math.floor(window.innerWidth);
  canvas.height = Math.floor(window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

const saveData = readSave();
const rng = makeRng(seed);
const world = buildWorld(seed);
const input = new Input();
const audio = new AudioEngine();

const game = {
  world,
  rng,
  input,
  audio,
  mode: 'title', // title | playing | paused | busted
  time: 0,
  cash: saveData ? saveData.cash : 0,
  bestCash: saveData ? saveData.bestCash || saveData.cash : 0,
  wanted: 0,
  health: 100,
  lastCrime: -100,
  wantedDecay: 0,
  decayTimer: 0,
  bustedTimer: 0,
  bustedReason: '',
  nearestPolice: Infinity,
  storyDone: false,
  saveData,
  toasts: [],
  particles: [],
  camera: { x: world.spawn.x, y: world.spawn.y },
  player: null,
  cars: [],
  police: [],
  peds: [],
  missions: null,
  frozen: params.get('still') === '1',
};

game.player = new Player(world);
game.cars = [...spawnTraffic(world, rng, 10), ...spawnParked(world, rng, 6)];
game.peds = spawnPeds(world, rng, 22);
game.missions = new Missions(saveData ? Math.min(saveData.missionIndex, 3) : 0);

game.toast = function toast(text) {
  game.toasts.push({ text, life: 3.2 });
  if (game.toasts.length > 3) game.toasts.shift();
};

game.addParticles = function addParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rng.next() * Math.PI * 2;
    const s = rng.range(40, 160);
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.4, 0.9), max: 0.9, color, size: rng.range(2, 5) });
  }
  if (game.particles.length > 240) game.particles.splice(0, game.particles.length - 240);
};

game.raiseWanted = function raiseWanted(n, why) {
  game.wanted = Math.min(5, game.wanted + n);
  game.lastCrime = game.time;
  game.decayTimer = 0;
  if (why) game.toast(`Wanted +${n} — ${why}`);
};

game.damage = function damage(n, why) {
  game.health = Math.max(0, game.health - n);
  if (game.health <= 0) game.busted(why === 'rammed by police' ? 'Your ride was wrecked by the PD.' : 'You were taken down.');
};

game.busted = function busted(reason) {
  if (game.mode !== 'playing') return;
  game.mode = 'busted';
  game.bustedReason = reason;
  game.bustedTimer = 0;
  game.audio.busted();
  game.audio.setSiren(false);
  game.audio.setEngine(0, false);
};

game.save = function save() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.cash,
      missionIndex: game.missions.done ? 4 : game.missions.index,
      bestCash: game.bestCash,
    }));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
};

function announce(message) {
  status.textContent = message;
}

function startGame() {
  game.mode = 'playing';
  game.missions.start(game);
  audio.ensure();
  announce(`Playing. ${game.missions.def ? game.missions.def.title : 'Free roam'}.`);
}

function restartAfterBusted() {
  game.health = 100;
  game.wanted = 0;
  game.police = [];
  game.bustedTimer = 0;
  if (game.player.inCar) game.player.exitCar(game);
  game.player.x = game.world.spawn.x;
  game.player.y = game.world.spawn.y;
  game.mode = 'playing';
  game.missions.start(game);
  announce('Back on the streets.');
}

// The player running over a pedestrian while driving.
function checkCarPedestrianHits() {
  const car = game.player.inCar;
  if (!car || Math.abs(car.speed) < 90) return;
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 34) {
      ped.state = 'down';
      ped.downT = 4;
      game.raiseWanted(1, 'pedestrian hit');
      game.audio.thud();
      game.addParticles(ped.x, ped.y, '#ffd94f', 10);
      car.speed *= 0.7;
    }
  }
}

function update(dt) {
  game.time += dt;
  // Toasts and particles always age, even on the title screen.
  for (const t of game.toasts) t.life -= dt;
  game.toasts = game.toasts.filter((t) => t.life > 0);
  for (const p of game.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
  }
  game.particles = game.particles.filter((p) => p.life > 0);

  if (game.mode === 'title') {
    // Slow drift over the city behind the title screen.
    game.camera.x = world.W / 2 + Math.cos(game.time * 0.05) * 320;
    game.camera.y = world.H_LAND / 2 + Math.sin(game.time * 0.04) * 260;
    updateTraffic(dt, world, game.cars, rng);
    updatePeds(dt, world, game.peds, game);
    return;
  }
  if (game.mode !== 'playing') return;

  const player = game.player;
  player.update(dt, input, game);
  if (player.inCar) {
    const event = updatePlayerCar(dt, player.inCar, input, world);
    if (event === 'crash') {
      game.damage(6, 'crash');
      game.audio.thud();
      game.addParticles(player.inCar.x, player.inCar.y, '#ffb14f', 10);
    }
    checkCarPedestrianHits();
    // Skid dust when steering hard at speed.
    if (Math.abs(player.inCar.speed) > 300 && (input.held('KeyA', 'ArrowLeft') || input.held('KeyD', 'ArrowRight'))) {
      game.particles.push({
        x: player.inCar.x - Math.cos(player.inCar.angle) * 18,
        y: player.inCar.y - Math.sin(player.inCar.angle) * 18,
        vx: 0, vy: 0, life: 0.5, max: 0.5, color: 'rgba(120, 110, 120, 0.5)', size: 5,
      });
    }
  }
  if (input.wasPressed('KeyE')) {
    if (player.inCar) player.exitCar(game);
    else player.tryEnterCar(game);
  }
  if (input.wasPressed('Space')) player.punch(game);

  updateTraffic(dt, world, game.cars, rng);
  updatePeds(dt, world, game.peds, game);
  updatePolice(dt, game);
  game.missions.update(dt, game);

  // Wanted decays when the player stays out of trouble and out of sight.
  if (game.wanted > 0 && game.time - game.lastCrime > 10 && game.nearestPolice > 450) {
    game.decayTimer += dt;
    if (game.decayTimer > 5) {
      game.decayTimer = 0;
      game.wanted = Math.max(0, game.wanted - 1);
    }
  } else {
    game.decayTimer = 0;
  }

  // Health slowly recovers when the player is safe.
  if (game.wanted === 0 && game.health < 100) game.health = Math.min(100, game.health + 2 * dt);

  // Camera follows the player or the driven car.
  const fx = player.inCar ? player.inCar.x : player.x;
  const fy = player.inCar ? player.inCar.y : player.y;
  game.camera.x += (fx - game.camera.x) * Math.min(1, 6 * dt);
  game.camera.y += (fy - game.camera.y) * Math.min(1, 6 * dt);

  // Sound follows the game.
  audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) / 540 : 0, !!player.inCar);
  audio.setSiren(game.police.length > 0);
  audio.update(dt);
}

function render() {
  const W = canvas.width;
  const H = canvas.height;
  const cam = game.camera;
  const view = { x: cam.x - W / 2, y: cam.y - H / 2, w: W, h: H };
  // Clamp the camera so the view never leaves the city.
  view.x = Math.max(-40, Math.min(world.W - W + 40, view.x));
  view.y = Math.max(-40, Math.min(world.H - H + 40, view.y));
  cam.x = view.x + W / 2;
  cam.y = view.y + H / 2;

  ctx.fillStyle = '#1c1420';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-view.x, -view.y);
  drawWorld(ctx, world, view, game.time);

  // Mission marker: a pulsing beacon in the world.
  const target = game.missions.target(game);
  if (target && game.mode === 'playing') {
    const pulse = 10 + Math.sin(game.time * 5) * 4;
    ctx.fillStyle = 'rgba(255, 217, 79, 0.25)';
    ctx.beginPath();
    ctx.arc(target.x, target.y, pulse + 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd94f';
    ctx.beginPath();
    ctx.moveTo(target.x, target.y - 18);
    ctx.lineTo(target.x + 12, target.y);
    ctx.lineTo(target.x, target.y + 18);
    ctx.lineTo(target.x - 12, target.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a2a00';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const ped of game.peds) drawPed(ctx, ped);
  for (const car of game.cars) drawCar(ctx, car, game.time);
  drawPolice(ctx, game.police, game.time);
  game.player.draw(ctx);

  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // A warm sunset vignette over everything.
  const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  grad.addColorStop(0, 'rgba(255, 140, 60, 0)');
  grad.addColorStop(1, 'rgba(255, 110, 40, 0.16)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (game.mode === 'playing' || game.mode === 'paused' || game.mode === 'busted') {
    // HUD draws on every in-game screen.
    hud.drawHUD(ctx, game, { width: W, height: H });
    if (game.mode === 'paused') hud.drawPaused(ctx, { width: W, height: H });
    if (game.mode === 'busted') hud.drawBusted(ctx, game, { width: W, height: H });
  }
  if (game.mode === 'title') {
    hud.drawTitle(ctx, game, { width: W, height: H });
  }
}

function handleKeys() {
  if (input.wasPressed('Enter', 'Space') && game.mode === 'title') startGame();
  if (input.wasPressed('KeyR') && game.mode === 'busted') restartAfterBusted();
  if (input.wasPressed('KeyP', 'Escape') && (game.mode === 'playing' || game.mode === 'paused')) {
    game.mode = game.mode === 'playing' ? 'paused' : 'playing';
    announce(game.mode === 'paused' ? 'Paused.' : 'Playing.');
  }
  if (input.wasPressed('KeyM')) {
    const muted = audio.toggleMute();
    game.toast(muted ? 'Sound off' : 'Sound on');
  }
  if (input.wasPressed('Enter') && game.mode === 'playing' && game.missions.done) {
    game.toast('Free roam — the city is yours.');
  }
}

// Apply the scenario query params, then start the loop.
function applyScenario() {
  const missionParam = Number.parseInt(params.get('mission') ?? '', 10);
  if (Number.isInteger(missionParam) && missionParam >= 0 && missionParam < 4) {
    game.missions.index = missionParam;
  }
  const place = params.get('place');
  if (place === 'lot' || place === 'park' || place === 'docks' || place === 'delivery' || place === 'spawn') {
    const spot = place === 'lot' ? game.world.lot
      : place === 'park' ? game.world.hideout
      : place === 'docks' ? game.world.docks
      : place === 'delivery' ? game.world.delivery
      : game.world.spawn;
    game.player.x = spot.x;
    game.player.y = spot.y;
    game.camera.x = spot.x;
    game.camera.y = spot.y;
  }
  if (params.get('scene') === 'play') {
    game.mode = 'playing';
    game.missions.start(game);
    audio.ensure();
  }
  if (params.get('driving') === '1') {
    const car = game.cars.find((c) => c.kind === 'parked') || game.cars[0];
    if (car) {
      car.x = game.player.x + 60;
      car.y = game.player.y;
      car.angle = 0;
      game.player.inCar = car;
      car.kind = 'player';
      car.stolen = true;
      car.speed = 0;
    }
  }
  const wantedParam = Number.parseInt(params.get('wanted') ?? '', 10);
  if (Number.isInteger(wantedParam)) {
    game.wanted = Math.max(0, Math.min(5, wantedParam));
    game.lastCrime = game.time;
  }
}

applyScenario();

let last = performance.now();
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  handleKeys();
  if (!game.frozen) update(dt);
  else game.time += dt;
  render();
  input.endFrame(); // one-shot presses are consumed once per frame, never twice
  frames += 1;
  if (frames === 3) window.__shotReady = true;
}

window.__game = game;
announce('Sunset Bay. Press Enter to start.');
requestAnimationFrame(frame);
