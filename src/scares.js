import * as THREE from "three";
import { hasLineOfSight, randomOpenNear, roomAtCell, TILE } from "./world.js";

/* ============================================================
   Режиссёр страха.
   ------------------------------------------------------------
   Раз в 8–15 секунд в школе что-то происходит: привидение в
   конце коридора, лицо в окне, волна погасшего света, мел на
   доске, хлопок шкафчика за спиной.

   Модуль НЕ трогает игровую логику: он только показывает и
   пугает. Управление — update(dt, ctx) и trigger(kind).
   Контракт для main.js: scares.group, scares.update, scares.reset,
   scares.trigger, scares.spawnApparition.
   ============================================================ */

function chalkTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 1024, 256);
  g.font = "italic 76px Georgia, 'Times New Roman', serif";
  g.fillStyle = "rgba(226, 228, 216, 0.82)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 512, 132);
  // Крошки мела.
  for (let i = 0; i < 240; i += 1) {
    g.fillStyle = `rgba(226, 228, 216, ${Math.random() * 0.25})`;
    g.fillRect(Math.random() * 1024, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function faceGroup() {
  const group = new THREE.Group();
  const mats = [];
  const skin = new THREE.MeshStandardMaterial({
    color: 0xc4bdae,
    roughness: 0.9,
    transparent: true,
    opacity: 0
  });
  const hole = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
  mats.push(skin, hole);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 14), skin);
  skull.scale.set(0.9, 1.2, 0.9);
  group.add(skull);
  for (const sx of [-0.055, 0.055]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), hole);
    socket.position.set(sx, 0.04, 0.13);
    socket.scale.set(1, 1.3, 0.5);
    group.add(socket);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.02), hole);
  mouth.position.set(0, -0.075, 0.14);
  group.add(mouth);

  // Мокрые волосы по краям.
  for (let i = 0; i < 6; i += 1) {
    const strand = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.32), skin);
    strand.position.set(-0.12 + i * 0.048, -0.04, 0.1);
    strand.rotation.z = (i - 2.5) * 0.08;
    group.add(strand);
  }

  return { group, mats };
}

export class ScareDirector {
  constructor({ world, audio, player, ghost, say, fx }) {
    this.world = world;
    this.audio = audio;
    this.player = player;
    this.ghost = ghost;
    this.say = say || (() => {});
    this.fx = fx || { shake: () => {}, flash: () => {} };

    this.group = new THREE.Group();
    this.group.name = "scares";

    this.timer = 16;
    this.cooldowns = {};
    this.chainTimer = 0;
    this.apparition = null;
    this.windowScare = null;
    this.chalkScare = null;
    this.lockerScare = null;
    this.recent = [];
    this.lastKind = null;

    this.ghostMats = new Set();
    if (this.ghost) {
      this.ghost.traverse((o) => {
        if (o.isMesh && o.material) this.ghostMats.add(o.material);
      });
    }

    this.windowFace = faceGroup();
    this.windowFace.group.visible = false;
    this.group.add(this.windowFace.group);
  }

  reset() {
    this.timer = 16;
    this.cooldowns = {};
    this.chainTimer = 0;
    this.recent = [];
    this.apparition = null;
    this.windowScare = null;
    if (this.ghost) this.ghost.visible = false;
    if (this.chalkScare) {
      this.group.remove(this.chalkScare.mesh);
      this.chalkScare.mesh.geometry.dispose();
      this.chalkScare.mesh.material.map.dispose();
      this.chalkScare.mesh.material.dispose();
      this.chalkScare = null;
    }
    if (this.windowFace) this.windowFace.group.visible = false;
    if (this.lockerScare) {
      for (const door of this.lockerScare.locker.doors) door.rotation.y = 0;
      this.lockerScare = null;
    }
  }

  update(dt, ctx = {}) {
    const time = performance.now() / 1000;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 11 + Math.random() * 8;
      this.pick(ctx);
    }
    // Изредка — «двойной» страх: второй удар через пару секунд после первого.
    if (this.chainTimer > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) {
        this.chainTimer = 0;
        this.pick(ctx, true);
      }
    }
    // Она рядом: фонарь начинает мигать, свет предаёт.
    this.flickerCooldown = (this.flickerCooldown || 0) - dt;
    if (ctx.enemyDist > 0 && ctx.enemyDist < 6.5 && this.flickerCooldown <= 0) {
      this.flickerCooldown = 5 + Math.random() * 4;
      this.audio.flicker();
      for (const lamp of this.world.lamps || []) {
        if (Math.hypot(lamp.x - this.player.x, lamp.z - this.player.z) < 8) {
          lamp.darkUntil = performance.now() / 1000 + 0.12 + Math.random() * 0.2;
        }
      }
    }

    this.updateApparition(dt, time);
    this.updateWindow(dt, time);
    this.updateChalk(dt, time);
    this.updateLocker(dt, time);
  }

  /* ------------------------ выбор события ------------------------ */

  pick(ctx, chained = false) {
    const options = [
      { kind: "apparition", weight: 3, cooldown: 22 },
      { kind: "window", weight: 2, cooldown: 26 },
      { kind: "lights", weight: 2, cooldown: 20 },
      { kind: "chalk", weight: 2, cooldown: 40 },
      { kind: "locker", weight: 2, cooldown: 24 },
      { kind: "whisper", weight: 3, cooldown: 12 },
      { kind: "behind", weight: 2, cooldown: 18 },
      { kind: "slam", weight: 2, cooldown: 16 }
    ];

    const ready = options.filter(
      (o) => (this.cooldowns[o.kind] || 0) <= 0 && o.kind !== this.lastKind
    );
    const pool = ready.length ? ready : options;
    let total = 0;
    for (const o of pool) total += o.weight;
    let roll = Math.random() * total;
    let chosen = pool[0];
    for (const o of pool) {
      roll -= o.weight;
      if (roll <= 0) {
        chosen = o;
        break;
      }
    }

    if (!chained && Math.random() < 0.22) this.chainTimer = 1.4 + Math.random() * 1.6;
    this.cooldowns[chosen.kind] = chosen.cooldown;
    this.lastKind = chosen.kind;
    for (const key of Object.keys(this.cooldowns)) {
      if (key !== chosen.kind) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - 4);
    }
    this.trigger(chosen.kind, ctx);
  }

  /* ------------------------ события ------------------------ */

  trigger(kind, ctx = {}) {
    switch (kind) {
      case "apparition":
        return this.spawnApparition();
      case "window":
        return this.spawnWindowFace();
      case "lights":
        return this.lightsOut();
      case "chalk":
        return this.chalkWriting();
      case "locker":
        return this.lockerRattle();
      case "whisper":
        return this.whisper();
      case "behind":
        return this.behindYou();
      case "slam":
        return this.doorSlam();
      default:
        return null;
    }
  }

  spawnApparition() {
    const place = randomOpenNear(this.player.x, this.player.z, 7, 16);
    if (!place) return null;
    this.apparition = { x: place.x, z: place.z, t: 0, life: 1.8 };
    if (this.ghost) {
      this.ghost.visible = true;
      this.ghost.position.set(place.x, 0, place.z);
      this.ghost.rotation.y = Math.atan2(this.player.x - place.x, this.player.z - place.z);
      for (const m of this.ghostMats) m.opacity = 0;
    }
    this.audio.stinger();
    this.fx.shake(5);
    this.fx.flash(0.22);
    return this.apparition;
  }

  updateApparition(dt, time) {
    if (!this.apparition) return;
    this.apparition.t += dt;
    const a = this.apparition;
    const progress = a.t / a.life;
    if (progress >= 1) {
      this.apparition = null;
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const alpha = Math.sin(Math.min(1, progress) * Math.PI) * 0.8;
    for (const m of this.ghostMats) m.opacity = alpha;
    if (this.ghost) {
      this.ghost.position.y = Math.sin(time * 2.1) * 0.05;
      // Идёт прямо на игрока — медленно, но неотвратимо.
      const dx = this.player.x - this.ghost.position.x;
      const dz = this.player.z - this.ghost.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const step = Math.min(d - 1.1, 2.1 * dt);
      if (step > 0) {
        this.ghost.position.x += (dx / d) * step;
        this.ghost.position.z += (dz / d) * step;
        this.ghost.rotation.y = Math.atan2(dx, dz);
      }
      this.ghost.rotation.z = Math.sin(time * 3.1) * 0.02;
    }
  }

  spawnWindowFace() {
    const anchors = this.world.windowAnchors || [];
    if (!anchors.length) return null;
    // Ближайшее окно в поле зрения.
    let best = null;
    let bestScore = Infinity;
    for (const w of anchors) {
      const dx = w.x - this.player.x;
      const dz = w.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.2 || dist > 14) continue;
      const fx = -Math.sin(this.player.yaw);
      const fz = -Math.cos(this.player.yaw);
      const dot = (dx / dist) * fx + (dz / dist) * fz;
      if (dot < 0.25) continue;
      if (!hasLineOfSight(this.player.x, this.player.z, w.x, w.z)) continue;
      const score = dist - dot * 4;
      if (score < bestScore) {
        bestScore = score;
        best = w;
      }
    }
    if (!best) return this.whisper();

    const face = this.windowFace.group;
    face.position.set(best.x, 1.62, best.z + (best.rotY === 0 ? 0.06 : -0.06));
    face.rotation.y = best.rotY === 0 ? 0 : Math.PI;
    face.visible = true;
    this.windowScare = { t: 0, life: 1.6 };
    this.audio.thud();
    this.fx.shake(3);
    return this.windowScare;
  }

  updateWindow(dt, time) {
    if (!this.windowScare) return;
    this.windowScare.t += dt;
    const p = this.windowScare.t / this.windowScare.life;
    if (p >= 1) {
      this.windowScare = null;
      this.windowFace.group.visible = false;
      return;
    }
    const alpha = Math.sin(Math.min(1, p) * Math.PI);
    for (const m of this.windowFace.mats) m.opacity = alpha * (m === this.windowFace.mats[0] ? 0.85 : 0.95);
    this.windowFace.group.position.y = 1.62 + Math.sin(time * 6) * 0.01;
  }

  lightsOut() {
    const lamps = this.world.lamps || [];
    const near = lamps
      .filter((l) => Math.hypot(l.x - this.player.x, l.z - this.player.z) < 16)
      .sort((a, b) => Math.hypot(a.x - this.player.x, a.z - this.player.z) - Math.hypot(b.x - this.player.x, b.z - this.player.z));
    if (!near.length) return null;
    const now = performance.now() / 1000;
    near.slice(0, 10).forEach((lamp, i) => {
      lamp.darkUntil = now + 0.5 + i * 0.09;
    });
    this.audio.flicker();
    this.audio.thud();
    this.fx.shake(4);
    return true;
  }

  chalkWriting() {
    const roomId = roomAtCell(
      Math.floor(this.player.x / TILE),
      Math.floor(this.player.z / TILE)
    );
    const room = (this.world.rooms || []).find((r) => r.id === roomId);
    if (!room) return this.whisper();
    const anchor = (this.world.blackboardAnchors || []).find((a) => a.room === room.id);
    if (!anchor) return this.whisper();

    const texts = ["НЕ ОГЛЯДЫВАЙСЯ", "ТЫ ЗДЕСЬ", "1987", "ОНА СЧИТАЕТ"];
    const text = texts[Math.floor(Math.random() * texts.length)];
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({
        map: chalkTexture(text),
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    mesh.position.set(anchor.x, 2.02, anchor.z);
    mesh.rotation.y = anchor.rotY;
    mesh.translateZ(0.04);
    this.group.add(mesh);
    this.chalkScare = { mesh, t: 0, life: 3.6 };
    this.audio.paper();
    this.audio.whisper();
    this.fx.shake(2);
    return this.chalkScare;
  }

  updateChalk(dt, time) {
    if (!this.chalkScare) return;
    this.chalkScare.t += dt;
    const p = this.chalkScare.t / this.chalkScare.life;
    if (p >= 1) {
      this.group.remove(this.chalkScare.mesh);
      this.chalkScare.mesh.geometry.dispose();
      this.chalkScare.mesh.material.map.dispose();
      this.chalkScare.mesh.material.dispose();
      this.chalkScare = null;
      return;
    }
    this.chalkScare.mesh.material.opacity = Math.min(1, p * 3) * (1 - Math.max(0, p - 0.75) * 4);
  }

  lockerRattle() {
    const lockers = this.world.lockerAnchors || [];
    let best = null;
    let bestDist = Infinity;
    for (const locker of lockers) {
      const d = Math.hypot(locker.spot.x - this.player.x, locker.spot.z - this.player.z);
      if (d < 9 && d < bestDist) {
        bestDist = d;
        best = locker;
      }
    }
    if (!best) return this.doorSlam();
    this.lockerScare = { locker: best, t: 0, life: 1.2 };
    this.audio.locker(true);
    this.audio.thud();
    this.fx.shake(2);
    return this.lockerScare;
  }

  updateLocker(dt, time) {
    if (!this.lockerScare) return;
    this.lockerScare.t += dt;
    const p = this.lockerScare.t / this.lockerScare.life;
    if (p >= 1) {
      for (const door of this.lockerScare.locker.doors) door.rotation.y = 0;
      this.lockerScare = null;
      return;
    }
    const shake = Math.sin(p * Math.PI * 9) * Math.exp(-p * 3) * 0.09;
    this.lockerScare.locker.doors.forEach((door, i) => {
      door.rotation.y = shake * (i === 1 ? 1 : 0.4);
    });
  }

  whisper() {
    this.audio.whisper();
    const _lines = [
      "Шёпот прямо в ухо: «Ещё немного, и я тебя найду».",
      "Кто-то повторяет за тобой шаги. С отставанием в один.",
      "В динамике щёлкнуло, и гимн заиграл наоборот.",
      "Ты слышишь, как в темноте перелистывают журнал."
    ];
    return true;
  }

  behindYou() {
    this.audio.gasp();
    this.audio.noise(0.4, { peak: 0.09, freq: 300, q: 1.4, filter: "bandpass", slideTo: 160 });
    this.fx.shake(7);
    this.fx.flash(0.12);
    return true;
  }

  doorSlam() {
    this.audio.thud();
    this.audio.doorRattle();
    this.fx.shake(9);
    return true;
  }
}
