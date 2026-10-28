import * as THREE from "three";
import {
  TILE,
  WALL_H,
  MAP_W,
  MAP_H,
  SPAWN_CELL,
  FUSE_CELLS,
  cellCenter,
  cellAt,
  isWallWorld,
  hasLineOfSight,
  randomOpenNear,
  buildSchool
} from "./world.js";
import { GameAudio } from "./audio.js";
import { Enemy, createDutyFigure } from "./enemy.js";

/* ============================================================
   «Дежурная не ушла» — 3D-хоррор от первого лица
   ============================================================ */

const CONFIG = {
  walkSpeed: 2.7,
  sprintSpeed: 4.5,
  crouchSpeed: 1.2,
  playerRadius: 0.35,
  eyeHeight: 1.6,
  crouchEye: 1.02,
  mouseSens: 0.0021,
  batteryDrain: 1.2, // % в секунду
  batteryPickup: 40,
  spotIntensity: 46,
  pointIntensity: 16,
  hemiIntensity: 0.3,
  fuseHold: 1.6, // секунд удержания Space
  interactRadius: 1.5,
  killRadius: 1.0
};

/* --------------------------- DOM --------------------------- */

const canvas = document.getElementById("game");
const hudEl = document.getElementById("hud");
const noiseMeter = document.getElementById("noiseMeter");
const panicMeter = document.getElementById("panicMeter");
const batteryMeter = document.getElementById("batteryMeter");
const staminaMeter = document.getElementById("staminaMeter");
const objectiveEl = document.getElementById("objective");
const statsCorner = document.getElementById("statsCorner");
const promptEl = document.getElementById("prompt");
const interactEl = document.getElementById("interact");
const ringFg = document.getElementById("ringFg");
const interactLabel = document.getElementById("interactLabel");
const subtitlesEl = document.getElementById("subtitles");
const slatsEl = document.getElementById("slats");
const breathHintEl = document.getElementById("breathHint");
const lockHintEl = document.getElementById("lockHint");
const flashEl = document.getElementById("flash");
const bloodEl = document.getElementById("blood");

const screenTitle = document.getElementById("screenTitle");
const screenPause = document.getElementById("screenPause");
const screenDeath = document.getElementById("screenDeath");
const screenWin = document.getElementById("screenWin");
const jumpscareEl = document.getElementById("jumpscare");
const startButton = document.getElementById("startButton");
const resumeButton = document.getElementById("resumeButton");
const restartButton = document.getElementById("restartButton");
const againButton = document.getElementById("againButton");
const deathText = document.getElementById("deathText");
const deathStats = document.getElementById("deathStats");
const winStats = document.getElementById("winStats");
const deviceNote = document.getElementById("deviceNote");

if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
  deviceNote.classList.remove("hidden");
}

/* --------------------------- сцена --------------------------- */

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.058);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 90);
camera.rotation.order = "YXZ";
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x33405a, 0x0a0a0c, CONFIG.hemiIntensity);
scene.add(hemi);

// Слабая подсветка у лица — чтобы в темноте было хоть что-то видно.
const fill = new THREE.PointLight(0x7e8da8, 2.4, 5.5, 2);
camera.add(fill);

// Фонарь.
const flashLight = new THREE.SpotLight(0xfff1cf, 0, 32, 0.46, 0.5, 1.15);
flashLight.castShadow = true;
flashLight.shadow.mapSize.set(1024, 1024);
flashLight.shadow.camera.near = 0.2;
flashLight.shadow.camera.far = 34;
flashLight.shadow.bias = -0.0016;
scene.add(flashLight);
scene.add(flashLight.target);

const world = buildSchool();
scene.add(world.group);

const enemy = new Enemy(scene, world);

/* --------------------------- привидение --------------------------- */

const ghost = createDutyFigure({ ghost: true });
ghost.visible = false;
scene.add(ghost);
const ghostMats = new Set();
ghost.traverse((o) => {
  if (o.isMesh && o.material) ghostMats.add(o.material);
});
let ghostTimer = 0;
let apparition = null;

/* --------------------------- пыль --------------------------- */

const DUST_N = 360;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i += 1) {
  dustPos[i * 3] = SPAWN_CELL.x * TILE + (Math.random() - 0.5) * 24;
  dustPos[i * 3 + 1] = Math.random() * WALL_H;
  dustPos[i * 3 + 2] = SPAWN_CELL.y * TILE + (Math.random() - 0.5) * 24;
}
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    color: 0xd8cfb6,
    size: 0.035,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
scene.add(dust);

/* --------------------------- состояние --------------------------- */

const audio = new GameAudio();

const player = {
  x: 0,
  z: 0,
  yaw: Math.PI,
  pitch: 0,
  speed: 0,
  noise: 0,
  panic: 0,
  battery: 100,
  stamina: 100,
  exhausted: false,
  crouch: false,
  hidden: false,
  flashOn: true,
  noiseBoost: 0,
  noiseBoostVal: 0,
  bob: 0,
  footstep: 0,
  preHide: null,
  wasFlashOn: true,
  hideSeenThisFrame: false,
  holdingBreath: false,
  breathHold: 0,
  breathTimer: 2.4,
  suppressHold: 0
};

let fuses = [];
let notes = [];
let batteries = [];
let collected = 0;
let notesFound = 0;
let fuseProgress = 0;
let playTime = 0;

let gameState = "title"; // title | play | pause | dead | win
let lookMode = "lock"; // lock | drag
let dragging = false;
let subtitleTimer = 0;
let nextWhisper = 7;
let nextEvent = 13;
let shake = 0;
let flash = 0;
let deadTimer = 0;
let winTimer = 0;
let blackoutTimer = 0;
let flickerTimer = 0;
let rattleCooldown = 0;
let hintTimer = 0;
let lookGraceUntil = 0;
let lastTime = performance.now();

const keys = new Set();
const pressed = new Set();

/* --------------------------- контент --------------------------- */

const lines = [
  "Где-то за стеной включился школьный звонок. Но уроков давно нет.",
  "В динамике шепчет твоё имя, хотя радиорубка заперта.",
  "На стекле проступает ладонь с внутренней стороны.",
  "Дежурная считает шаги. Сейчас она сбилась.",
  "Не беги. Пол помнит каждый звук.",
  "В методкабинете кто-то перелистывает журнал. Страницы мокрые.",
  "Свет в третьем коридоре гаснет по одному — как будто кто-то идёт навстречу.",
  "Шкафчик за спиной медленно открывается. Не оборачивайся.",
  "Кто-то пишет мелом на доске. Мел сухой, доска мокрая.",
  "Пахнет мелом и чем-то тёплым, как в больнице."
];

const noteTexts = [
  "График дежурств, ноябрь. В графе «ночь» чужая фамилия — её уволили ещё в мае.",
  "Памятка охраны: после 23:00 кабинет труда не открывать. Дверь снова открыта.",
  "Детский рисунок: две фигуры, одна выше. Подпись: «мама работает ночью и не спит».",
  "Протокол аварии 1987: освещение корпуса Б вышло из строя. Пострадавших нет. Не найдено: 1.",
  "Записка на методкабинете: «Если она не спит — значит, дежурит. Не говори, что видел»."
];

/* --------------------------- инициализация объектов --------------------------- */

function spawnWorldObjects() {
  for (const g of world.group.children) g.visible = true;

  fuses = world.fuseAnchors.map((a, i) => ({
    ...a,
    done: false,
    label: FUSE_CELLS[i].label
  }));

  notes = world.noteAnchors.map((n, i) => ({
    ...n,
    text: noteTexts[i],
    found: false
  }));

  batteries = world.batteryAnchors.map((b) => ({ ...b, taken: false }));

  for (const f of fuses) {
    f.led.material.color.setHex(0xd8352a);
    f.lever.rotation.z = 0;
  }
  for (const n of notes) n.mesh.visible = true;
  for (const b of batteries) b.group.visible = true;
  world.exitSignMat.color.setHex(0x1d6b33);
  world.doorMesh.material.emissive?.setHex?.(0x000000);
}

function resetGame() {
  const spawn = cellCenter(SPAWN_CELL);
  player.x = spawn.x;
  player.z = spawn.z;
  player.yaw = Math.PI;
  player.pitch = 0;
  player.speed = 0;
  player.noise = 0;
  player.panic = 0;
  player.battery = 100;
  player.stamina = 100;
  player.exhausted = false;
  player.crouch = false;
  player.hidden = false;
  player.flashOn = true;
  player.noiseBoost = 0;
  player.bob = 0;
  player.preHide = null;
  player.wasFlashOn = true;
  player.holdingBreath = false;
  player.breathHold = 0;
  player.suppressHold = 0;
  player.breathTimer = 2.4;

  enemy.reset();
  spawnWorldObjects();
  collected = 0;
  notesFound = 0;
  fuseProgress = 0;
  playTime = 0;
  pressed.clear();
  keys.clear();
  deadTimer = 0;
  winTimer = 0;
  shake = 0;
  flash = 0;
  blackoutTimer = 0;
  apparition = null;
  ghost.visible = false;
  ghostTimer = 0;
  nextWhisper = 7;
  nextEvent = 13;
  rattleCooldown = 0;
  subtitlesEl.textContent = "";
  slatsEl.classList.add("hidden");
  breathHintEl.classList.add("hidden");
  interactEl.classList.add("hidden");
  promptEl.classList.add("hidden");
  jumpscareEl.classList.remove("active");
  bloodEl.style.opacity = 0;
  updateHud();
}

/* --------------------------- ввод --------------------------- */

function requestLook() {
  if (lookMode !== "lock") return;
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        lookMode = "drag";
        showLockHint("Зажми ЛКМ и веди мышь — осмотреться");
      });
    }
  } catch {
    lookMode = "drag";
    showLockHint("Зажми ЛКМ и веди мышь — осмотреться");
  }
}

function showLockHint(text) {
  lockHintEl.textContent = text;
  lockHintEl.classList.remove("hidden");
  hintTimer = 5;
}

canvas.addEventListener("pointerlockerror", () => {
  if (gameState === "play" && lookMode === "lock") {
    lookMode = "drag";
    showLockHint("Зажми ЛКМ и веди мышь — осмотреться");
  }
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas) {
    // Браузер шлёт крупные «прыгающие» движения курсора сразу после захвата.
    lookGraceUntil = performance.now() + 1500;
  } else if (gameState === "play" && lookMode === "lock") {
    // Esc в браузере снимает захват — ставим паузу.
    pauseGame();
  }
});

window.addEventListener("keydown", (e) => {
  if (!e.repeat) pressed.add(e.code);
  keys.add(e.code);

  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();

  if (e.code === "Enter" && gameState === "dead") restartGame();
  if (e.code === "Enter" && gameState === "win") restartGame();
  if (e.code === "Escape" && gameState === "play" && lookMode === "drag") pauseGame();
});

let muted = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyM" && gameState === "play") {
    muted = !muted;
    audio.setMaster(muted);
    setMessage(muted ? "Звук выключен." : "Звук включён.", 1.4);
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

window.addEventListener("mousemove", (e) => {
  if (gameState !== "play") return;
  const locked = document.pointerLockElement === canvas;
  if (!locked && !(dragging && lookMode === "drag")) return;

  let mx = e.movementX || 0;
  let my = e.movementY || 0;

  // В окно после захвата отбрасываем крупные скачки — это телепорт курсора,
  // а не движение руки. Обычные маленькие повороты разрешены сразу.
  if (performance.now() < lookGraceUntil && Math.max(Math.abs(mx), Math.abs(my)) > 90) return;

  // Кламп защищает от одиночного телепорта в любой момент.
  mx = Math.max(-240, Math.min(240, mx));
  my = Math.max(-240, Math.min(240, my));

  player.yaw -= mx * CONFIG.mouseSens;
  player.pitch -= my * CONFIG.mouseSens;
  player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch));
});

canvas.addEventListener("mousedown", () => {
  if (gameState !== "play") return;
  if (lookMode === "lock" && document.pointerLockElement !== canvas) {
    requestLook();
    return;
  }
  dragging = true;
});
window.addEventListener("mouseup", () => (dragging = false));

window.addEventListener("blur", () => {
  keys.clear();
  if (gameState === "play") pauseGame();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameState === "play") pauseGame();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* --------------------------- экраны / поток --------------------------- */

function startGame() {
  audio.init();
  audio.resume();
  resetGame();
  gameState = "play";
  lookGraceUntil = performance.now() + 1500;
  screenTitle.classList.add("hidden");
  screenDeath.classList.add("hidden");
  screenWin.classList.add("hidden");
  screenPause.classList.add("hidden");
  hudEl.classList.remove("hidden");
  lookMode = lookMode === "drag" ? "drag" : "lock";
  requestLook();
  if (lookMode === "lock") showLockHint("Esc — пауза · M — звук");
  setMessage("Смена началась. Найди 4 щитка и не шуми.", 4.2);
}

function pauseGame() {
  if (gameState !== "play") return;
  gameState = "pause";
  screenPause.classList.remove("hidden");
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function resumeGame() {
  if (gameState !== "pause") return;
  gameState = "play";
  screenPause.classList.add("hidden");
  audio.resume();
  requestLook();
}

function restartGame() {
  startGame();
}

function killPlayer(reason) {
  if (gameState !== "play") return;
  gameState = "dead";
  deadTimer = 0;
  shake = 24;
  flash = 0.9;
  audio.scream();
  deathText.textContent = reason || "Она нашла тебя.";
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function winGame() {
  if (gameState !== "play") return;
  gameState = "win";
  winTimer = 0;
  flash = 0.8;
  shake = 10;
  audio.winChime();
  world.exitSignMat.color.setHex(0x3ade6e);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", restartGame);
againButton.addEventListener("click", restartGame);
resumeButton.addEventListener("click", resumeGame);

function setMessage(text, seconds = 3.2) {
  subtitlesEl.textContent = text;
  subtitleTimer = seconds;
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statsLine() {
  return `Щитки ${collected}/4 · записки ${notesFound}/5 · время ${formatTime(playTime)}`;
}

/* --------------------------- взаимодействие --------------------------- */

function nearestOf(list, x, z, maxDist, filter = () => true) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    if (!filter(item)) continue;
    const p = item.anchor || item.pos || item.group?.position;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return bestD <= maxDist ? { item: best, dist: bestD } : { item: null, dist: bestD };
}

function noiseBoost(val, secs) {
  player.noiseBoost = Math.max(player.noiseBoost, secs);
  player.noiseBoostVal = val;
}

function handleInteractionInput(dt) {
  const nearFuse = nearestOf(fuses, player.x, player.z, CONFIG.interactRadius, (f) => !f.done);
  const nearNote = nearestOf(notes, player.x, player.z, 1.4, (n) => !n.found);
  const nearLocker = nearestOf(world.lockerAnchors, player.x, player.z, 1.7);
  const nearBatt = nearestOf(batteries, player.x, player.z, 0.9, (b) => !b.taken);
  const exitD = Math.hypot(world.exitAnchor.x - player.x, world.exitAnchor.z - player.z);

  /* --- батарейки подбираются автоматом --- */
  if (nearBatt.item && !player.hidden) {
    nearBatt.item.taken = true;
    nearBatt.item.group.visible = false;
    player.battery = Math.min(100, player.battery + CONFIG.batteryPickup);
    audio.pickup();
    setMessage(`Батарейка (+${CONFIG.batteryPickup}%)`, 1.8);
  }

  /* --- шкафчик: E спрятаться / выйти --- */
  if (pressed.has("KeyE") && player.hidden) {
    exitLocker();
    return;
  }
  if (pressed.has("KeyE") && !player.hidden) {
    if (nearLocker.item && nearFuse.item === null && nearNote.item === null) {
      player.hidden = true;
      player.preHide = { x: player.x, z: player.z };
      const lp = nearLocker.item.pos;
      player.x = lp.x;
      player.z = lp.z;
      // Смотрим в коридор сквозь вентиляцию.
      player.yaw = nearLocker.item.rotY + Math.PI;
      player.pitch = 0;
      player.hideSeenThisFrame = true;
      player.breathTimer = 2.2;
      player.breathHold = 0;
      player.wasFlashOn = player.flashOn;
      player.flashOn = false;
      audio.locker(true);
      slatsEl.classList.remove("hidden");
      breathHintEl.classList.remove("hidden");
      promptEl.classList.add("hidden");
      return;
    }
  }

  /* --- записки --- */
  if (pressed.has("KeyE") && nearNote.item && !player.hidden && !nearFuse.item) {
    nearNote.item.found = true;
    nearNote.item.mesh.visible = false;
    notesFound += 1;
    audio.paper();
    setMessage(`Записка (${notesFound}/5): ${nearNote.item.text}`, 7);
    return;
  }

  /* --- щиток: удержание Space --- */
  if (nearFuse.item && !player.hidden) {
    if (keys.has("Space") && player.speed < 0.35) {
      fuseProgress += dt / CONFIG.fuseHold;
      interactEl.classList.remove("hidden");
      interactLabel.textContent = "Восстановление…";
      ringFg.style.strokeDashoffset = String(163.4 * (1 - Math.min(1, fuseProgress)));
      if (fuseProgress >= 1) fixFuse(nearFuse.item);
      return;
    }
    fuseProgress = Math.max(0, fuseProgress - dt * 0.7);
  } else {
    fuseProgress = Math.max(0, fuseProgress - dt * 1.5);
  }
  if (fuseProgress <= 0.001) interactEl.classList.add("hidden");

  /* --- промпты --- */
  if (player.hidden) {
    promptEl.innerHTML = "<b>E</b> выйти из шкафчика";
    promptEl.classList.remove("hidden");
  } else if (nearFuse.item) {
    promptEl.innerHTML = "<b>SPACE</b> удерживать — чинить щиток";
    promptEl.classList.remove("hidden");
  } else if (nearNote.item) {
    promptEl.innerHTML = "<b>E</b> прочитать записку";
    promptEl.classList.remove("hidden");
  } else if (nearLocker.item) {
    promptEl.innerHTML = "<b>E</b> спрятаться в шкафчике";
    promptEl.classList.remove("hidden");
  } else if (exitD < 1.8) {
    if (collected >= 4) {
      promptEl.innerHTML = "<b>E</b> уйти из школы";
      promptEl.classList.remove("hidden");
      if (pressed.has("KeyE")) winGame();
    } else if (collected > 0) {
      promptEl.innerHTML = "<b>ЗАПЕРТО</b> щитки " + collected + "/4";
      promptEl.classList.remove("hidden");
      if (rattleCooldown <= 0 && pressed.has("KeyE")) {
        audio.doorRattle();
        setMessage("Дверь не поддаётся. Сначала свет.", 2.4);
        rattleCooldown = 1.6;
      }
    } else {
      promptEl.classList.add("hidden");
    }
  } else {
    promptEl.classList.add("hidden");
  }

  // Добравшись до двери с четырьмя щитками — уходишь.
  if (collected >= 4 && exitD < 1.5 && !player.hidden) winGame();
}

function exitLocker() {
  if (!player.hidden) return;
  player.hidden = false;
  if (player.preHide) {
    player.x = player.preHide.x;
    player.z = player.preHide.z;
    player.preHide = null;
  }
  player.holdingBreath = false;
  player.breathHold = 0;
  player.flashOn = player.wasFlashOn && player.battery > 0;
  // Она больше не знает, где ты.
  enemy.sawPlayerHide = false;
  audio.locker(false);
  noiseBoost(0.3, 0.6);
  slatsEl.classList.add("hidden");
  breathHintEl.classList.add("hidden");
  interactEl.classList.add("hidden");
}

function fixFuse(fuse) {
  fuse.done = true;
  fuseProgress = 0;
  collected += 1;
  interactEl.classList.add("hidden");
  flash = 0.7;
  shake = 9;
  audio.fuseFix();
  audio.spark();
  fuse.led.material.color.setHex(0x51d06a);
  fuse.lever.rotation.z = -0.7;
  setMessage(`Щиток щёлкнул: ${fuse.label}. Осталось ${4 - collected}.`, 3.6);

  // Она слышит щелчок.
  enemy.hunt(player.x, player.z, 5 + collected * 1.4);
  enemy.sawPlayerHide = false;

  if (collected >= 4) {
    world.exitSignMat.color.setHex(0x3ade6e);
    setMessage("Все щитки в сети. Дверь на входе открыта. Беги — она теперь знает.", 5.5);
    shake = 14;
    audio.stinger();
  }
}

/* --------------------------- движение игрока --------------------------- */

function movePlayer(dx, dz) {
  const r = CONFIG.playerRadius;
  const nx = player.x + dx;
  const nz = player.z + dz;

  if (!isWallWorld(nx - r, player.z - r) && !isWallWorld(nx + r, player.z - r) &&
      !isWallWorld(nx - r, player.z + r) && !isWallWorld(nx + r, player.z + r)) {
    player.x = nx;
  }
  if (!isWallWorld(player.x - r, nz - r) && !isWallWorld(player.x + r, nz - r) &&
      !isWallWorld(player.x - r, nz + r) && !isWallWorld(player.x + r, nz + r)) {
    player.z = nz;
  }

  // Выталкивание из AABB-пропсов.
  for (const c of world.colliders) {
    const cx = Math.max(c.minX, Math.min(player.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(player.z, c.maxZ));
    const dx2 = player.x - cx;
    const dz2 = player.z - cz;
    const d2 = dx2 * dx2 + dz2 * dz2;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        player.x = cx + (dx2 / d) * r;
        player.z = cz + (dz2 / d) * r;
      } else {
        // Центр внутри бокса — выталкиваем по кратчайшей грани.
        const left = player.x - c.minX;
        const right = c.maxX - player.x;
        const top = player.z - c.minZ;
        const bottom = c.maxZ - player.z;
        const min = Math.min(left, right, top, bottom);
        if (min === left) player.x = c.minX - r;
        else if (min === right) player.x = c.maxX + r;
        else if (min === top) player.z = c.minZ - r;
        else player.z = c.maxZ + r;
      }
    }
  }
}

function handlePlayer(dt) {
  const wantFwd = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  const wantSide = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);

  player.crouch = (keys.has("KeyC") || keys.has("ControlLeft") || keys.has("ControlRight")) && !player.hidden;

  const wantSprint = (keys.has("ShiftLeft") || keys.has("ShiftRight")) && !player.crouch && !player.hidden;
  const moving = (wantFwd !== 0 || wantSide !== 0) && !player.hidden;

  if (player.exhausted && player.stamina > 32) player.exhausted = false;

  let speed = CONFIG.walkSpeed;
  const sprinting = moving && wantSprint && !player.exhausted && player.stamina > 1;
  if (sprinting) {
    speed = CONFIG.sprintSpeed;
    player.stamina = Math.max(0, player.stamina - 23 * dt);
    if (player.stamina <= 0) player.exhausted = true;
  } else if (player.crouch) {
    speed = CONFIG.crouchSpeed;
    player.stamina = Math.min(100, player.stamina + 13 * dt);
  } else {
    player.stamina = Math.min(100, player.stamina + (moving ? 10 : 17) * dt);
  }

  if (moving) {
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const rx = Math.cos(player.yaw);
    const rz = -Math.sin(player.yaw);
    let mx = fx * wantFwd + rx * wantSide;
    let mz = fz * wantFwd + rz * wantSide;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len;
    mz /= len;
    const panicSlow = player.panic > 0.82 ? 0.86 : 1;
    movePlayer(mx * speed * panicSlow * dt, mz * speed * panicSlow * dt);
    player.speed = speed;

    // Шаги и покачивание.
    player.bob += dt * speed * 2.6;
    player.footstep -= dt * (sprinting ? 2.4 : 1.3);
    if (player.footstep <= 0) {
      player.footstep = sprinting ? 0.26 : player.crouch ? 0.75 : 0.48;
      audio.step(sprinting, player.crouch);
    }
  } else {
    player.speed = 0;
    player.bob += dt * 0.7;
  }

  /* --- фонарь --- */
  if (pressed.has("KeyF") && player.battery > 0) {
    player.flashOn = !player.flashOn;
    audio.flicker();
  }
  if (player.battery <= 0) player.flashOn = false;
  if (player.flashOn && !player.hidden) player.battery = Math.max(0, player.battery - CONFIG.batteryDrain * dt);
  if (player.battery <= 0 && pressed.has("KeyF")) setMessage("Батарейка села.", 2);

  /* --- шум --- */
  let noiseTarget;
  if (player.hidden) noiseTarget = 0.02;
  else if (player.noiseBoost > 0) noiseTarget = player.noiseBoostVal;
  else if (moving && sprinting) noiseTarget = 1;
  else if (moving && player.crouch) noiseTarget = 0.16;
  else if (moving) noiseTarget = 0.42;
  else noiseTarget = 0.08;
  if (player.noiseBoost > 0) player.noiseBoost -= dt;
  player.noise += (noiseTarget - player.noise) * Math.min(1, dt * 6);

  /* --- дыхание в шкафчике --- */
  if (player.hidden) {
    player.holdingBreath = keys.has("KeyB") && player.suppressHold <= 0;
    if (player.suppressHold > 0) player.suppressHold -= dt;

    if (player.holdingBreath) {
      player.breathHold += dt;
      player.panic = Math.min(1, player.panic + dt * 0.05);
      if (player.breathHold > 7) {
        player.breathHold = 0;
        player.suppressHold = 2.2;
        audio.gasp();
        noiseBoost(0.9, 1.1);
        setMessage("Ты сорвался и громко вдохнул!", 2.2);
        hearAtPlayer(1.0);
      }
    } else {
      player.breathHold = Math.max(0, player.breathHold - dt * 0.6);
      player.breathTimer -= dt;
      if (player.breathTimer <= 0) {
        player.breathTimer = 2.6;
        audio.breath();
        noiseBoost(0.4, 0.7);
        hearAtPlayer(0.4);
      }
    }
  } else {
    player.holdingBreath = false;
    player.breathHold = 0;
  }

  /* --- паника --- */
  const distE = Math.hypot(enemy.x - player.x, enemy.z - player.z);
  const losE = hasLineOfSight(enemy.x, enemy.z, player.x, player.z);
  const seen = !player.hidden && distE < 9.5 && losE;
  let panicTarget = seen ? 1 : Math.max(0, 1 - distE / 13) * 0.5;
  if (player.hidden && distE < 8) panicTarget = Math.max(panicTarget, (1 - distE / 8) * 0.55);
  if (player.battery <= 0) panicTarget = Math.max(panicTarget, 0.3);
  player.panic += (panicTarget - player.panic) * Math.min(1, dt * (seen ? 2.6 : 0.8));

  if (distE < CONFIG.killRadius && !player.hidden) killPlayer();
}

/** Дежурная слышит дыхание игрока (пока тот в шкафчике). */
function hearAtPlayer(strength) {
  const distE = Math.hypot(enemy.x - player.x, enemy.z - player.z);
  const los = hasLineOfSight(enemy.x, enemy.z, player.x, player.z);
  const radius = (3 + strength * 11) * (los ? 1 : 0.55);
  if (distE < radius) {
    // Память достаточно длинная, чтобы добраться до шкафчика.
    enemy.hear(player.x, player.z, Math.max(3.6, distE / 2.0 + 1.5));
    enemy.sawPlayerHide = true;
  }
}

/* --------------------------- события и атмосфера --------------------------- */

function handleEvents(dt) {
  nextWhisper -= dt;
  nextEvent -= dt;
  rattleCooldown -= dt;
  if (hintTimer > 0) {
    hintTimer -= dt;
    if (hintTimer <= 0) lockHintEl.classList.add("hidden");
  }

  if (nextWhisper <= 0) {
    nextWhisper = 8 + Math.random() * 11 - collected;
    setMessage(lines[Math.floor(Math.random() * lines.length)], 4.2);
    audio.whisper();
  }

  if (nextEvent <= 0) {
    nextEvent = 13 + Math.random() * 14;
    const roll = Math.random();
    if (roll < 0.3) {
      spawnApparition();
    } else if (roll < 0.5) {
      blackoutTimer = 0.55 + Math.random() * 0.5;
      audio.thud();
      shake = 6;
      flash = 0.35;
      setMessage("Свет мигнул. Кто-то включил его раньше тебя.", 2.6);
    } else if (roll < 0.7) {
      audio.thud();
      shake = 5 + collected;
      setMessage("Где-то хлопнула дверь.", 2.2);
    } else if (roll < 0.85) {
      audio.flicker();
      flickerTimer = 0.7;
      if (player.flashOn) setMessage("Фонарь мигнул. Проверь батарейку.", 2.2);
    }
    // Иногда она слышит случайный звук рядом с тобой.
    if (Math.random() < 0.62) {
      const place = randomOpenNear(player.x, player.z, 3, 9);
      if (place) enemy.hunt(place.x, place.z, 2.2);
    }
  }

  if (blackoutTimer > 0) blackoutTimer -= dt;
  if (flickerTimer > 0) flickerTimer -= dt;
}

function spawnApparition() {
  const place = randomOpenNear(player.x, player.z, 6.5, 14);
  if (!place) return;
  apparition = { x: place.x, z: place.z, timer: 1.5 + Math.random() * 0.8, total: 0 };
  apparition.total = apparition.timer;
  ghost.visible = true;
  ghost.position.set(place.x, 0, place.z);
  ghost.rotation.y = Math.atan2(-(player.x - place.x), -(player.z - place.z));
  audio.stinger();
  shake = Math.max(shake, 5);
  flash = Math.max(flash, 0.3);
  return apparition;
}

function updateGhost(dt) {
  if (!apparition) {
    ghost.visible = false;
    return;
  }
  apparition.timer -= dt;
  if (apparition.timer <= 0) {
    apparition = null;
    ghost.visible = false;
    return;
  }
  const t = apparition.timer / apparition.total;
  const alpha = Math.sin(Math.min(1, t) * Math.PI); // плавно появляется и гаснет
  for (const m of ghostMats) m.opacity = alpha * 0.72;
  ghost.position.y = Math.sin(performance.now() * 0.002) * 0.06;
}

/* --------------------------- свет, лампы, щитки --------------------------- */

const tubeColor = new THREE.Color();
function updateLights(dt, time) {
  const allDone = collected >= 4;

  for (const lamp of world.lamps) {
    lamp.powered = fuses[lamp.fuseIndex]?.done || allDone;
    let target = lamp.powered && blackoutTimer <= 0 ? 1 : 0;
    if (target > 0) {
      // Лёгкое мерцание подмигивает.
      const s = Math.sin(time * 2.7 + lamp.flickerSeed * 9.1);
      if (s > 0.965) target *= 0.25 + Math.random() * 0.5;
      else target *= 0.9 + 0.1 * Math.sin(time * 21 + lamp.flickerSeed);
    }
    lamp.lit += (target - lamp.lit) * Math.min(1, dt * 14);
    tubeColor.setRGB(1, 0.94, 0.8).multiplyScalar(lamp.lit * 1.6);
    world.lampTubes.setColorAt(lamp.index, tubeColor);
  }
  world.lampTubes.instanceColor.needsUpdate = true;

  // Фиксированное число точечных светильников — переназначаем ближайшие.
  const byDist = world.lamps
    .filter((l) => l.lit > 0.05)
    .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
  world.pointLights.forEach((light, i) => {
    const lamp = byDist[i];
    if (lamp) {
      light.position.set(lamp.x, WALL_H - 0.45, lamp.z);
      light.intensity = lamp.lit * CONFIG.pointIntensity;
    } else {
      light.intensity = 0;
    }
  });

  // Фонарь.
  const camPos = camera.position;
  flashLight.position.copy(camPos);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  flashLight.target.position.copy(camPos).add(dir.multiplyScalar(12));

  let intensity = 0;
  if (player.flashOn && player.battery > 0) {
    intensity = CONFIG.spotIntensity;
    if (flickerTimer > 0) intensity *= 0.35 + Math.random() * 0.6;
    if (player.battery < 14) intensity *= 0.5 + 0.5 * Math.sin(time * 13) ** 2;
    if (blackoutTimer > 0) intensity *= 0.15;
  }
  flashLight.intensity = intensity;
}

function updateFuseVisuals(time) {
  for (const f of fuses) {
    if (!f.done) {
      const blink = 0.45 + 0.55 * Math.sin(time * 4.5 + f.cell.x);
      f.led.material.color.setRGB(0.85 * blink + 0.1, 0.08, 0.05);
    }
  }
}

/* --------------------------- пыль --------------------------- */

function updateDust(dt) {
  const arr = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_N; i += 1) {
    const ix = i * 3;
    arr[ix + 1] -= dt * 0.045;
    let dx = arr[ix] - player.x;
    let dz = arr[ix + 2] - player.z;
    let dy = arr[ix + 1] - camera.position.y;
    if (dx > 13) arr[ix] -= 26;
    else if (dx < -13) arr[ix] += 26;
    if (dz > 13) arr[ix + 2] -= 26;
    else if (dz < -13) arr[ix + 2] += 26;
    if (dy < -5) arr[ix + 1] += WALL_H;
    else if (dy > 5) arr[ix + 1] -= WALL_H;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

/* --------------------------- HUD --------------------------- */

function updateHud() {
  noiseMeter.style.width = `${Math.round(player.noise * 100)}%`;
  panicMeter.style.width = `${Math.round(player.panic * 100)}%`;
  batteryMeter.style.width = `${Math.round(player.battery)}%`;
  staminaMeter.style.width = `${Math.round(player.stamina)}%`;
  batteryMeter.style.filter = player.battery < 25 ? "hue-rotate(-40deg) saturate(2)" : "";
  objectiveEl.textContent =
    collected < 4
      ? `Восстанови питание: ${collected}/4`
      : "Иди к входной двери. Не оглядывайся.";
  statsCorner.textContent = `${formatTime(playTime)} · записки ${notesFound}/5`;
}

/* --------------------------- обновление --------------------------- */

function updateCameraAndFx(dt, time) {
  subtitleTimer -= dt;
  if (subtitleTimer <= 0 && subtitlesEl.textContent) subtitlesEl.textContent = "";

  shake = Math.max(0, shake - dt * 18);
  flash = Math.max(0, flash - dt * 1.8);

  // Покачивание головы.
  const bobAmp = player.speed > 0.1 && !player.hidden ? Math.min(0.05, player.speed * 0.011) : 0.004;
  const eye = player.crouch && !player.hidden ? CONFIG.crouchEye : CONFIG.eyeHeight;
  const bobY = Math.sin(player.bob * 2) * bobAmp;
  const bobX = Math.cos(player.bob) * bobAmp * 0.5;

  const rx = Math.cos(player.yaw);
  const rz = -Math.sin(player.yaw);

  camera.position.set(
    player.x + rx * bobX,
    eye + bobY,
    player.z + rz * bobX
  );

  const shakeAmt = shake * 0.0011;
  const roll =
    (player.panic > 0.6 ? (player.panic - 0.6) * 0.05 : 0) +
    Math.sin(time * 1.2) * 0.006 * player.panic +
    (Math.random() - 0.5) * shakeAmt;

  camera.rotation.set(
    player.pitch + (Math.random() - 0.5) * shakeAmt,
    player.yaw + (Math.random() - 0.5) * shakeAmt,
    roll
  );

  flashEl.style.opacity = String(flash * 0.4);
  bloodEl.style.opacity = String(Math.max(0, Math.min(0.85, (player.panic - 0.35) * 1.3)));
}

function updateDead(dt) {
  deadTimer += dt;
  // Дёрнит взглядом к ней.
  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const targetYaw = Math.atan2(-dx, -dz);
  const dist = Math.hypot(dx, dz) || 1;
  const targetPitch = Math.atan2(1.85 - CONFIG.eyeHeight, dist);
  const k = Math.min(1, dt * 7);
  let dy = targetYaw - player.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  player.yaw += dy * k;
  player.pitch += (targetPitch - player.pitch) * k;
  player.panic = Math.min(1, player.panic + dt * 0.5);

  if (deadTimer > 0.42 && !jumpscareEl.classList.contains("active")) {
    jumpscareEl.classList.add("active");
  }
  if (deadTimer > 1.9 && screenDeath.classList.contains("hidden")) {
    deathStats.textContent = statsLine();
    screenDeath.classList.remove("hidden");
    hudEl.classList.add("hidden");
  }
}

function updateWin(dt) {
  winTimer += dt;
  player.panic = Math.max(0, player.panic - dt * 0.3);
  // Свет разгорается.
  for (const lamp of world.lamps) lamp.lit = Math.min(1, lamp.lit + dt * 1.5);
  if (winTimer > 1.3 && screenWin.classList.contains("hidden")) {
    winStats.textContent = statsLine() + (notesFound === 5 ? " · все записки найдены" : "");
    screenWin.classList.remove("hidden");
    hudEl.classList.add("hidden");
  }
}

function update(dt, time) {
  try {
    updateInner(dt, time);
  } finally {
    pressed.clear();
  }
}

function updateInner(dt, time) {
  if (gameState === "title") {
    // Медленный обзор за титульным экраном.
    player.yaw = Math.PI + Math.sin(time * 0.12) * 0.35;
    player.x = cellCenter(SPAWN_CELL).x;
    player.z = cellCenter(SPAWN_CELL).z;
    updateCameraAndFx(dt, time);
    updateLights(dt, time);
    updateDust(dt);
    return;
  }

  if (gameState === "pause") return;

  if (gameState === "dead") {
    updateDead(dt);
    updateCameraAndFx(dt, time);
    audio.update(dt, { panic: player.panic, enemyDist: 0, enemyLos: false, hunted: true });
    return;
  }

  if (gameState === "win") {
    updateWin(dt);
    updateCameraAndFx(dt, time);
    updateLights(dt, time);
    return;
  }

  /* ---- основной игровой цикл ---- */
  playTime += dt;

  player.hideSeenThisFrame = false;
  handlePlayer(dt);
  handleInteractionInput(dt);

  enemy.update(dt, {
    player,
    collected,
    onKill: killPlayer
  });

  handleEvents(dt);
  updateGhost(dt);
  updateLights(dt, time);
  updateFuseVisuals(time);
  updateDust(dt);
  updateCameraAndFx(dt, time);
  updateHud();

  // Шаги дежурной.
  const distE = Math.hypot(enemy.x - player.x, enemy.z - player.z);
  const losE = hasLineOfSight(enemy.x, enemy.z, player.x, player.z);
  if (enemy.moving && distE < 13) {
    enemyStepTimer -= dt * (enemy.state === "hunt" ? 2.7 : 1.7);
    if (enemyStepTimer <= 0) {
      enemyStepTimer = 1;
      const vol = Math.max(0, 1 - distE / 13) * (losE ? 1 : 0.45);
      audio.tone(42, 0.13, { type: "triangle", peak: 0.04 + vol * 0.1 });
    }
  }

  audio.update(dt, {
    panic: player.panic,
    enemyDist: distE,
    enemyLos: losE,
    hunted: enemy.state === "hunt"
  });
}

let enemyStepTimer = 0;

/* --------------------------- цикл --------------------------- */

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  const time = now / 1000;

  update(dt, time);
  if (gameState !== "pause") renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

resetGame();
gameState = "title";
requestAnimationFrame(loop);

/* Отладочный интерфейс (для автотестов и консоли разработчика). */
window.__lh = {
  get player() {
    return player;
  },
  get enemy() {
    return enemy;
  },
  get camera() {
    return camera;
  },
  get gameState() {
    return gameState;
  },
  get collected() {
    return collected;
  },
  get notesFound() {
    return notesFound;
  },
  get lookMode() {
    return lookMode;
  },
  get ghost() {
    return ghost;
  },
  get apparition() {
    return apparition;
  },
  teleport(cx, cy) {
    const c = cellCenter({ x: cx, y: cy });
    player.x = c.x;
    player.z = c.z;
    player.hidden = false;
    slatsEl.classList.add("hidden");
    breathHintEl.classList.add("hidden");
  },
  placeEnemy(cx, cy) {
    const c = cellCenter({ x: cx, y: cy });
    enemy.x = c.x;
    enemy.z = c.z;
  },
  look(yaw, pitch = 0) {
    player.yaw = yaw;
    player.pitch = pitch;
  },
  fixAll() {
    fuses.forEach((f) => {
      f.done = true;
      f.led.material.color.setHex(0x51d06a);
      f.lever.rotation.z = -0.7;
    });
    collected = 4;
    world.exitSignMat.color.setHex(0x3ade6e);
  },
  kill: killPlayer,
  win: winGame,
  spawnApparition,
  setMessage
};
