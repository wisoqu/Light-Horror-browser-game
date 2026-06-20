const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startButton = document.getElementById("startButton");
const messageEl = document.getElementById("message");
const objectiveEl = document.getElementById("objective");
const noiseMeter = document.getElementById("noiseMeter");
const panicMeter = document.getElementById("panicMeter");

const TILE = 48;
const W = canvas.width;
const H = canvas.height;
const TAU = Math.PI * 2;

const rawMap = [
  "########################",
  "#S.....................#",
  "#..####....#####....#..#",
  "#..#..#....#...#....#..#",
  "#..#..######.#.####.#..#",
  "#..#..........#.....#..#",
  "#..######..##########..#",
  "#.......#..............#",
  "#.#####.#.############.#",
  "#.#.....#..............#",
  "#.#.##########..######.#",
  "#.#............#.....#.#",
  "#.#.########..######.#.#",
  "#.#......#....#......#.#",
  "#.######.#.####..####..#",
  "#....................F.#",
  "########################"
].map((row) => row.padEnd(24, "#"));

const mapH = rawMap.length;
const mapW = rawMap[0].length;

const fuses = [
  { x: 20.5 * TILE, y: 1.5 * TILE, done: false, label: "щиток в кабинете труда" },
  { x: 3.5 * TILE, y: 9.5 * TILE, done: false, label: "щиток в раздевалке" },
  { x: 12.5 * TILE, y: 13.5 * TILE, done: false, label: "щиток у медкабинета" },
  { x: 21.5 * TILE, y: 15.5 * TILE, done: false, label: "главный рубильник" }
];

const hidingSpots = [
  { x: 5.5 * TILE, y: 5.5 * TILE },
  { x: 17.5 * TILE, y: 3.5 * TILE },
  { x: 7.5 * TILE, y: 13.5 * TILE },
  { x: 17.5 * TILE, y: 11.5 * TILE }
];

const keys = new Set();
let audio;
let lastTime = 0;
let gameState = "title";
let cameraShake = 0;
let flash = 0;
let subtitleTimer = 0;
let nextWhisper = 7;
let nextEvent = 13;
let collected = 0;
let endingTimer = 0;
let apparition = null;

const player = {
  x: 1.5 * TILE,
  y: 1.5 * TILE,
  r: 12,
  angle: 0,
  speed: 150,
  noise: 0,
  panic: 0,
  hidden: false,
  footstep: 0
};

const enemy = {
  x: 21.5 * TILE,
  y: 14.5 * TILE,
  r: 15,
  angle: Math.PI,
  speed: 86,
  state: "patrol",
  target: null,
  memory: 0,
  pulse: 0
};

const patrolPoints = [
  { x: 21.5 * TILE, y: 14.5 * TILE },
  { x: 11.5 * TILE, y: 15.5 * TILE },
  { x: 11.5 * TILE, y: 9.5 * TILE },
  { x: 3.5 * TILE, y: 9.5 * TILE },
  { x: 2.5 * TILE, y: 3.5 * TILE },
  { x: 13.5 * TILE, y: 3.5 * TILE },
  { x: 20.5 * TILE, y: 1.5 * TILE }
];
let patrolIndex = 0;

const lines = [
  "Где-то за стеной включился школьный звонок. Но уроков давно нет.",
  "В динамике шепчет твое имя, хотя радиорубка заперта.",
  "На стекле проступает ладонь с внутренней стороны.",
  "Дежурная считает шаги. Сейчас она сбилась.",
  "Не беги. Пол помнит каждый звук."
];

function tileAtPixel(x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return "#";
  return rawMap[ty][tx];
}

function isWall(x, y) {
  return tileAtPixel(x, y) === "#";
}

function hasLineOfSight(ax, ay, bx, by) {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.floor(dist / 10));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (isWall(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

function moveCircle(entity, dx, dy) {
  const nx = entity.x + dx;
  const ny = entity.y + dy;
  if (!collides(nx, entity.y, entity.r)) entity.x = nx;
  if (!collides(entity.x, ny, entity.r)) entity.y = ny;
}

function collides(x, y, r) {
  return (
    isWall(x - r, y - r) ||
    isWall(x + r, y - r) ||
    isWall(x - r, y + r) ||
    isWall(x + r, y + r)
  );
}

function cellFromPixel(x, y) {
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
}

function centerOfCell(cell) {
  return { x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 };
}

function nextStepToward(fromX, fromY, toX, toY) {
  const start = cellFromPixel(fromX, fromY);
  const goal = cellFromPixel(toX, toY);
  const key = (x, y) => `${x},${y}`;
  const queue = [start];
  const cameFrom = new Map([[key(start.x, start.y), null]]);
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  while (queue.length) {
    const current = queue.shift();
    if (current.x === goal.x && current.y === goal.y) break;
    for (const dir of dirs) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const nextKey = key(next.x, next.y);
      if (cameFrom.has(nextKey)) continue;
      if (next.x < 0 || next.y < 0 || next.x >= mapW || next.y >= mapH) continue;
      if (rawMap[next.y][next.x] === "#") continue;
      cameFrom.set(nextKey, current);
      queue.push(next);
    }
  }

  const goalKey = key(goal.x, goal.y);
  if (!cameFrom.has(goalKey)) return { x: toX, y: toY };

  let current = goal;
  let previous = cameFrom.get(goalKey);
  while (previous && !(previous.x === start.x && previous.y === start.y)) {
    current = previous;
    previous = cameFrom.get(key(current.x, current.y));
  }
  return centerOfCell(current);
}

function nearest(list, x, y, predicate = () => true) {
  let best = null;
  let bestDist = Infinity;
  for (const item of list) {
    if (!predicate(item)) continue;
    const dist = Math.hypot(item.x - x, item.y - y);
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return { item: best, dist: bestDist };
}

function randomOpenNear(x, y, minDist, maxDist) {
  for (let i = 0; i < 28; i += 1) {
    const angle = Math.random() * TAU;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const px = x + Math.cos(angle) * dist;
    const py = y + Math.sin(angle) * dist;
    if (!isWall(px, py) && hasLineOfSight(x, y, px, py)) return { x: px, y: py };
  }
  return null;
}

function setMessage(text, seconds = 3.2) {
  messageEl.textContent = text;
  subtitleTimer = seconds;
}

function ensureAudio() {
  if (audio) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audio = new AudioContext();
  audio.master = audio.createGain();
  audio.master.gain.value = 0.22;
  audio.master.connect(audio.destination);

  audio.drone = audio.createOscillator();
  audio.drone.type = "sawtooth";
  audio.drone.frequency.value = 39;
  audio.droneGain = audio.createGain();
  audio.droneGain.gain.value = 0.035;
  audio.drone.connect(audio.droneGain);
  audio.droneGain.connect(audio.master);
  audio.drone.start();

  audio.lfo = audio.createOscillator();
  audio.lfo.frequency.value = 0.09;
  audio.lfoGain = audio.createGain();
  audio.lfoGain.gain.value = 9;
  audio.lfo.connect(audio.lfoGain);
  audio.lfoGain.connect(audio.drone.frequency);
  audio.lfo.start();
}

function beep(freq, duration, type = "sine", gain = 0.08) {
  if (!audio) return;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  osc.connect(g);
  g.connect(audio.master);
  osc.start();
  osc.stop(audio.currentTime + duration);
}

function thud() {
  beep(62, 0.16, "triangle", 0.12);
  setTimeout(() => beep(44, 0.2, "sawtooth", 0.1), 90);
}

function startGame() {
  ensureAudio();
  if (audio.state === "suspended") audio.resume();
  gameState = "play";
  startButton.classList.add("hidden");
  setMessage("Смена началась. Найди 4 щитка и не шуми.", 4);
}

function restartGame() {
  player.x = 1.5 * TILE;
  player.y = 1.5 * TILE;
  player.noise = 0;
  player.panic = 0;
  player.hidden = false;
  enemy.x = 21.5 * TILE;
  enemy.y = 14.5 * TILE;
  enemy.state = "patrol";
  enemy.memory = 0;
  enemy.target = null;
  patrolIndex = 0;
  collected = 0;
  endingTimer = 0;
  apparition = null;
  for (const fuse of fuses) fuse.done = false;
  gameState = "play";
  startButton.classList.add("hidden");
  setMessage("Ты снова у входа. На этот раз тише.", 3);
}

function update(dt) {
  if (gameState === "title") {
    player.angle += dt * 0.08;
    return;
  }

  if (subtitleTimer > 0) {
    subtitleTimer -= dt;
    if (subtitleTimer <= 0) messageEl.textContent = "";
  }

  cameraShake = Math.max(0, cameraShake - dt * 18);
  flash = Math.max(0, flash - dt * 1.8);
  if (apparition) {
    apparition.timer -= dt;
    if (apparition.timer <= 0) apparition = null;
  }

  if (gameState === "dead") {
    player.panic = Math.min(1, player.panic + dt * 0.4);
    return;
  }

  if (gameState === "win") {
    endingTimer += dt;
    if (endingTimer > 1) player.panic = Math.max(0, player.panic - dt * 0.2);
    return;
  }

  handlePlayer(dt);
  handleInteractions();
  handleEnemy(dt);
  handleEvents(dt);
  updateHud();
}

function handlePlayer(dt) {
  const mx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  const my = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const hide = keys.has("KeyE") && nearest(hidingSpots, player.x, player.y).dist < 35;
  player.hidden = hide && !moving;

  const mouseAngle = player.angle;
  if (moving && !player.hidden) {
    const len = Math.hypot(mx, my);
    const speed = player.speed * (sprint ? 1.55 : 1) * (player.panic > 0.82 ? 0.83 : 1);
    moveCircle(player, (mx / len) * speed * dt, (my / len) * speed * dt);
    player.angle = Math.atan2(my, mx);
    player.footstep -= dt * (sprint ? 2.3 : 1.3);
    if (player.footstep <= 0) {
      player.footstep = sprint ? 0.18 : 0.34;
      beep(sprint ? 96 : 82, 0.025, "square", sprint ? 0.035 : 0.018);
    }
  } else {
    player.angle = mouseAngle;
  }

  if (keys.has("KeyQ")) player.angle -= dt * 2.7;
  if (keys.has("KeyR")) player.angle += dt * 2.7;

  const noiseTarget = player.hidden ? 0.02 : moving ? (sprint ? 1 : 0.42) : 0.08;
  player.noise += (noiseTarget - player.noise) * Math.min(1, dt * 6);

  const distEnemy = Math.hypot(enemy.x - player.x, enemy.y - player.y);
  const seen = distEnemy < 260 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y);
  const panicTarget = seen ? 1 : Math.max(0, 1 - distEnemy / 360) * 0.55;
  player.panic += (panicTarget - player.panic) * Math.min(1, dt * (seen ? 2.4 : 0.8));

  if (distEnemy < 24 && !player.hidden) die();
}

function handleInteractions() {
  if (!keys.has("Space")) return;
  const nearFuse = nearest(fuses, player.x, player.y, (fuse) => !fuse.done);
  if (nearFuse.item && nearFuse.dist < 42) {
    nearFuse.item.done = true;
    collected += 1;
    flash = 0.7;
    cameraShake = 8;
    thud();
    setMessage(`Щиток щелкнул: ${nearFuse.item.label}. Осталось ${4 - collected}.`, 3.4);
    enemy.target = { x: player.x, y: player.y };
    enemy.state = "hunt";
    enemy.memory = 5 + collected * 1.4;
    if (collected === fuses.length) win();
  }
}

function handleEnemy(dt) {
  const distPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  const canSeePlayer = !player.hidden && distPlayer < 300 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y);
  const canHearPlayer = !player.hidden && player.noise > 0.35 && distPlayer < 180 + player.noise * 150;

  if (canSeePlayer || canHearPlayer) {
    enemy.state = "hunt";
    enemy.target = { x: player.x, y: player.y };
    enemy.memory = canSeePlayer ? 3.6 : 2.2;
  } else if (enemy.memory > 0) {
    enemy.memory -= dt;
  } else if (enemy.state === "hunt") {
    enemy.state = "patrol";
    enemy.target = null;
  }

  let target = enemy.target;
  let speed = enemy.speed;
  if (enemy.state === "patrol") {
    target = patrolPoints[patrolIndex];
    speed = enemy.speed * 0.72;
    if (Math.hypot(target.x - enemy.x, target.y - enemy.y) < 18) {
      patrolIndex = (patrolIndex + 1) % patrolPoints.length;
    }
  } else {
    speed = enemy.speed * (1.05 + collected * 0.08 + player.noise * 0.2);
  }

  if (target) {
    const step = nextStepToward(enemy.x, enemy.y, target.x, target.y);
    const angle = Math.atan2(step.y - enemy.y, step.x - enemy.x);
    enemy.angle = angle;
    const dx = Math.cos(angle) * speed * dt;
    const dy = Math.sin(angle) * speed * dt;
    moveCircle(enemy, dx, dy);
  }

  enemy.pulse += dt * (enemy.state === "hunt" ? 7 : 2.5);
  if (distPlayer < 34 && !player.hidden) die();
}

function handleEvents(dt) {
  nextWhisper -= dt;
  nextEvent -= dt;
  if (nextWhisper <= 0) {
    nextWhisper = 7 + Math.random() * 11 - collected;
    const line = lines[Math.floor(Math.random() * lines.length)];
    setMessage(line, 3.8);
    beep(180 + Math.random() * 50, 0.22, "sawtooth", 0.026);
  }
  if (nextEvent <= 0) {
    nextEvent = 12 + Math.random() * 14;
    flash = 0.45;
    cameraShake = 5 + collected;
    thud();
    const place = randomOpenNear(player.x, player.y, 120, 260);
    if (place) apparition = { x: place.x, y: place.y, timer: 1.25 + Math.random() * 0.7 };
    if (Math.random() < 0.62) {
      enemy.target = { x: player.x + (Math.random() - 0.5) * 120, y: player.y + (Math.random() - 0.5) * 120 };
      enemy.state = "hunt";
      enemy.memory = 2.1;
    }
  }
  if (audio) {
    audio.droneGain.gain.value = 0.025 + player.panic * 0.07 + collected * 0.004;
    audio.drone.frequency.value = 38 + player.panic * 9;
  }
}

function die() {
  if (gameState !== "play") return;
  gameState = "dead";
  cameraShake = 18;
  flash = 1;
  thud();
  setMessage("Она нашла тебя. Нажми Enter, если школа отпустит.", 999);
  startButton.textContent = "Вернуться к входу";
  startButton.classList.remove("hidden");
}

function win() {
  gameState = "win";
  cameraShake = 12;
  flash = 1;
  thud();
  setMessage("Свет вернулся. В коридоре стало видно, что ты был здесь не один.", 999);
  startButton.textContent = "Сыграть еще раз";
  startButton.classList.remove("hidden");
}

function updateHud() {
  noiseMeter.style.width = `${Math.round(player.noise * 100)}%`;
  panicMeter.style.width = `${Math.round(player.panic * 100)}%`;
  objectiveEl.textContent = collected < fuses.length
    ? `Восстанови питание: ${collected}/4`
    : "Иди к выходу. Не оглядывайся.";
}

function draw() {
  const shakeX = (Math.random() - 0.5) * cameraShake;
  const shakeY = (Math.random() - 0.5) * cameraShake;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-20, -20, W + 40, H + 40);

  const camX = clamp(player.x - W / 2, 0, mapW * TILE - W);
  const camY = clamp(player.y - H / 2, 0, mapH * TILE - H);
  drawWorld(camX, camY);
  drawEntities(camX, camY);
  drawLight(camX, camY);
  drawVignette();
  if (flash > 0) drawFlash();
  if (gameState === "title") drawTitle();
  if (gameState === "dead") drawDeath();
  if (gameState === "win") drawWin();
  ctx.restore();
}

function drawWorld(camX, camY) {
  ctx.fillStyle = "#121313";
  ctx.fillRect(0, 0, W, H);

  const startX = Math.max(0, Math.floor(camX / TILE) - 1);
  const endX = Math.min(mapW, Math.ceil((camX + W) / TILE) + 1);
  const startY = Math.max(0, Math.floor(camY / TILE) - 1);
  const endY = Math.min(mapH, Math.ceil((camY + H) / TILE) + 1);

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const px = x * TILE - camX;
      const py = y * TILE - camY;
      if (rawMap[y][x] === "#") {
        ctx.fillStyle = "#272a28";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = "rgba(151, 42, 38, 0.08)";
        ctx.fillRect(px + 2, py + 2, TILE - 4, 4);
        ctx.strokeStyle = "rgba(216, 205, 187, 0.08)";
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = (x + y) % 2 ? "#171918" : "#141615";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = "rgba(216, 205, 187, 0.025)";
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  for (const spot of hidingSpots) {
    drawLocker(spot.x - camX, spot.y - camY);
  }

  for (const fuse of fuses) {
    if (fuse.done) continue;
    const x = fuse.x - camX;
    const y = fuse.y - camY;
    ctx.fillStyle = "#20272a";
    ctx.fillRect(x - 13, y - 18, 26, 36);
    ctx.fillStyle = "#798a70";
    ctx.fillRect(x - 8, y - 12, 16, 5);
    ctx.fillStyle = `rgba(195, 218, 137, ${0.35 + Math.sin(performance.now() * 0.006) * 0.18})`;
    ctx.beginPath();
    ctx.arc(x, y + 7, 5, 0, TAU);
    ctx.fill();
  }
}

function drawLocker(x, y) {
  ctx.fillStyle = "#273035";
  ctx.fillRect(x - 16, y - 24, 32, 48);
  ctx.fillStyle = "rgba(216, 205, 187, 0.13)";
  ctx.fillRect(x - 10, y - 17, 20, 3);
  ctx.fillRect(x - 10, y - 8, 20, 3);
  ctx.fillStyle = "#0c0d0e";
  ctx.fillRect(x + 7, y - 2, 3, 8);
}

function drawEntities(camX, camY) {
  if (!player.hidden) {
    ctx.save();
    ctx.translate(player.x - camX, player.y - camY);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#cfc4b0";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#0d0f10";
    ctx.fillRect(6, -4, 10, 8);
    ctx.restore();
  }

  const ex = enemy.x - camX;
  const ey = enemy.y - camY;
  const glow = 0.45 + Math.sin(enemy.pulse) * 0.25;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(enemy.angle);
  ctx.fillStyle = `rgba(140, 15, 24, ${0.36 + glow * 0.18})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 24, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#060607";
  ctx.beginPath();
  ctx.ellipse(-2, 0, 9, 18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(232, 223, 206, ${0.6 + glow * 0.3})`;
  ctx.fillRect(9, -8, 4, 4);
  ctx.fillRect(9, 4, 4, 4);
  ctx.restore();

  if (apparition) {
    const ax = apparition.x - camX;
    const ay = apparition.y - camY;
    const alpha = clamp(apparition.timer, 0, 1);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.globalAlpha = alpha * (0.55 + Math.random() * 0.22);
    ctx.fillStyle = "#020203";
    ctx.beginPath();
    ctx.ellipse(0, -10, 12, 27, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(238, 230, 214, 0.86)";
    ctx.fillRect(-5, -18, 3, 3);
    ctx.fillRect(4, -18, 3, 3);
    ctx.strokeStyle = "rgba(165, 30, 38, 0.62)";
    ctx.beginPath();
    ctx.moveTo(-14, 14);
    ctx.lineTo(14, 18);
    ctx.stroke();
    ctx.restore();
  }
}

function drawLight(camX, camY) {
  const px = player.x - camX;
  const py = player.y - camY;

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${0.84 - collected * 0.045})`;
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.moveTo(px, py);
  ctx.arc(px, py, 250 + collected * 8, player.angle - 0.58, player.angle + 0.58);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill("evenodd");
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const lamp = ctx.createRadialGradient(px, py, 0, px, py, 230);
  lamp.addColorStop(0, "rgba(225, 218, 182, 0.2)");
  lamp.addColorStop(0.55, "rgba(225, 218, 182, 0.06)");
  lamp.addColorStop(1, "rgba(225, 218, 182, 0)");
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, 235, player.angle - 0.52, player.angle + 0.52);
  ctx.closePath();
  ctx.fillStyle = lamp;
  ctx.fill();
  ctx.restore();
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.82);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.72, "rgba(0,0,0,0.46)");
  gradient.addColorStop(1, "rgba(0,0,0,0.9)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(96, 0, 12, ${player.panic * 0.16})`;
  ctx.fillRect(0, 0, W, H);
}

function drawFlash() {
  ctx.fillStyle = `rgba(235, 229, 207, ${flash * 0.22})`;
  ctx.fillRect(0, 0, W, H);
}

function drawTitle() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e0d6c4";
  ctx.font = "700 54px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.fillText("ДЕЖУРНАЯ НЕ УШЛА", W / 2, 230);
  ctx.font = "18px Segoe UI, Arial";
  ctx.fillStyle = "rgba(224, 214, 196, 0.78)";
  ctx.fillText("WASD - идти, Shift - бежать, Q/R - повернуть фонарь, Space - чинить, E - прятаться у шкафчиков", W / 2, 282);
  ctx.fillText("Играй в наушниках. Она слышит бег.", W / 2, 314);
}

function drawDeath() {
  ctx.fillStyle = "rgba(65, 0, 8, 0.44)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(238, 230, 214, 0.9)";
  ctx.font = "700 48px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.fillText("НЕ ОТКРЫВАЙ ГЛАЗА", W / 2, H / 2 - 60);
}

function drawWin() {
  ctx.fillStyle = "rgba(226, 218, 190, 0.08)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(238, 230, 214, 0.92)";
  ctx.font = "700 42px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.fillText("СВЕТ ВКЛЮЧЕН", W / 2, H / 2 - 60);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Enter" && gameState === "dead") restartGame();
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  const y = ((event.clientY - rect.top) / rect.height) * H;
  const camX = clamp(player.x - W / 2, 0, mapW * TILE - W);
  const camY = clamp(player.y - H / 2, 0, mapH * TILE - H);
  player.angle = Math.atan2(y + camY - player.y, x + camX - player.x);
});

startButton.addEventListener("click", () => {
  if (gameState === "title") startGame();
  else restartGame();
});

updateHud();
requestAnimationFrame(loop);
