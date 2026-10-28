import * as THREE from "three";
import { TILE, PATROL_CELLS, cellCenter, cellAt, hasLineOfSight, isWallWorld, nextStepWorld } from "./world.js";

/* ============================================================
   Дежурная: фигура (процедурная модель) и конечный автомат ИИ
   patrol → investigate → hunt → search
   ============================================================ */

/** Процедурная модель фигуры дежурной. ghost=true — вариант привидения. */
export function createDutyFigure({ ghost = false } = {}) {
  const g = new THREE.Group();
  const parts = {};

  const cloth = ghost
    ? new THREE.MeshStandardMaterial({ color: 0xdde5ee, emissive: 0x93a8bc, emissiveIntensity: 1.35, transparent: true, opacity: 0.4, roughness: 1, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.97 });
  const blouse = ghost ? cloth : new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 0.92 });
  const skin = ghost
    ? new THREE.MeshStandardMaterial({ color: 0xf2f7fb, emissive: 0xb9cbdc, emissiveIntensity: 1.5, transparent: true, opacity: 0.5, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0x7a6b5b, roughness: 0.88 });
  const hair = ghost ? cloth : new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });

  // Юбка-колокол (дежурная «плывёт» по коридору).
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.46, 1.15, 14), cloth);
  skirt.position.y = 0.6;
  skirt.castShadow = true;
  g.add(skirt);
  parts.skirt = skirt;

  // Торс.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 6, 12), blouse);
  torso.position.y = 1.42;
  torso.castShadow = true;
  g.add(torso);
  parts.torso = torso;

  // Голова.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 14), skin);
  head.position.y = 1.87;
  head.scale.set(0.92, 1.08, 0.95);
  head.castShadow = true;
  g.add(head);
  parts.head = head;

  // Волосы — чёлка и пучок.
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
  hairCap.position.y = 1.9;
  hairCap.scale.set(1, 1.05, 1);
  g.add(hairCap);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), hair);
  bun.position.set(0, 1.93, 0.15);
  g.add(bun);

  // Глаза.
  const eyeMat = new THREE.MeshBasicMaterial({ color: ghost ? 0xffffff : 0xe8dfd0 });
  const eyeGeo = new THREE.SphereGeometry(0.026, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.06, 1.89, -0.145);
  eyeR.position.set(0.06, 1.89, -0.145);
  g.add(eyeL, eyeR);
  parts.eyeL = eyeL;
  parts.eyeR = eyeR;
  parts.eyeMat = eyeMat;

  // Руки.
  const armGeo = new THREE.CapsuleGeometry(0.055, 0.62, 4, 8);
  const armL = new THREE.Mesh(armGeo, blouse);
  const armR = new THREE.Mesh(armGeo, blouse);
  armL.position.set(-0.26, 1.35, 0);
  armR.position.set(0.26, 1.35, 0);
  armL.castShadow = true;
  armR.castShadow = true;
  g.add(armL, armR);
  parts.armL = armL;
  parts.armR = armR;

  if (!ghost) {
    // Ведомость в руке — она всё ещё на смене.
    const clipboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.27, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x6b5f43, roughness: 0.9 })
    );
    clipboard.position.set(0.03, -0.34, -0.07);
    clipboard.rotation.x = -0.3;
    armR.add(clipboard);
  }

  g.userData.parts = parts;
  return g;
}

export class Enemy {
  constructor(scene, world) {
    this.world = world;
    this.mesh = createDutyFigure();
    this.mesh.visible = true;
    scene.add(this.mesh);

    this.x = 0;
    this.z = 0;
    this.angle = 0;
    this.state = "patrol";
    this.target = null;
    this.memory = 0;
    this.searchTimer = 0;
    this.patrolIndex = 0;
    this.speed = 0;
    this.moving = false;
    this.time = Math.random() * 10;
    this.twitchTimer = 2;
    this.sawPlayerHide = false;
    this.lastKnown = null;
    this.blockedTimer = 0;
    this._lastX = 0;
    this._lastZ = 0;
    this.reset();
  }

  reset() {
    const start = cellCenter(PATROL_CELLS[0]);
    this.x = start.x;
    this.z = start.z;
    this.angle = Math.PI;
    this.state = "patrol";
    this.target = null;
    this.memory = 0;
    this.searchTimer = 0;
    this.patrolIndex = 0;
    this.sawPlayerHide = false;
    this.lastKnown = null;
    this.speed = 0;
    this.moving = false;
    this.blockedTimer = 0;
    this.mesh.position.set(this.x, 0, this.z);
  }

  get position() {
    return { x: this.x, z: this.z };
  }

  hear(x, z, memory = 2.4) {
    this.state = "investigate";
    this.target = { x, z };
    this.lastKnown = { x, z };
    this.memory = memory;
  }

  hunt(x, z, memory = 3.6) {
    this.state = "hunt";
    this.target = { x, z };
    this.lastKnown = { x, z };
    this.memory = memory;
  }

  /**
   * @param ctx {player, collected, dt, gameState, onKill, audio}
   */
  update(dt, ctx) {
    const { player } = ctx;
    this.time += dt;

    const dist = Math.hypot(player.x - this.x, player.z - this.z);
    const los = hasLineOfSight(this.x, this.z, player.x, player.z);

    /* ---------- восприятие ---------- */
    const fovCos = Math.cos(this.state === "patrol" ? Math.PI / 3 : Math.PI * 0.55);
    const toPlayerX = player.x - this.x;
    const toPlayerZ = player.z - this.z;
    const facingX = Math.sin(this.angle);
    const facingZ = Math.cos(this.angle);
    const dot = dist > 0.001 ? (toPlayerX * facingX + toPlayerZ * facingZ) / dist : -1;

    let sightRange = player.flashOn ? 11 : 7.5;
    if (player.crouch) sightRange *= 0.62;
    if (player.hidden) sightRange = 0;

    // Луч фонаря, направленный в неё, выдаёт игрока издалека.
    const lightAlert = player.flashOn && player.battery > 0 && los && dist < 16 &&
      this.isLitByPlayer(player);

    const canSee =
      !player.hidden &&
      dist < sightRange &&
      los &&
      (dot > fovCos || dist < 2.2 || lightAlert);

    const heardRadius = 3 + player.noise * 11;
    const canHear = !player.hidden && player.noise > 0.32 && dist < heardRadius;

    if (canSee) {
      this.state = "hunt";
      this.target = { x: player.x, z: player.z };
      this.lastKnown = { x: player.x, z: player.z };
      this.memory = 3.8;
      this.sawPlayerHide = false;
    } else if (canHear) {
      if (this.state !== "hunt") {
        this.state = "investigate";
        this.target = { x: player.x, z: player.z };
        this.lastKnown = { x: player.x, z: player.z };
        this.memory = 2.4;
      } else {
        this.target = { x: player.x, z: player.z };
        this.memory = Math.max(this.memory, 2.4);
      }
    } else if (this.memory > 0) {
      this.memory -= dt;
    } else if (this.state === "hunt" || this.state === "investigate" || this.state === "search") {
      this.state = "patrol";
      this.target = null;
      this.sawPlayerHide = false; // потеряла след — шкафчик больше не интересен
    }

    // Игрок затаил дыхание — память о шкафчике тает быстрее.
    if (player.hidden && player.holdingBreath && this.state === "hunt" && this.memory > 0) {
      this.memory -= dt * 1.6;
    }

    // Игрок нырнул в шкафчик у неё на глазах — она знает, где он.
    if (player.hidden && player.hideSeenThisFrame && dist < 7 && los) {
      this.sawPlayerHide = true;
      this.state = "hunt";
      this.target = { x: player.x, z: player.z };
      this.lastKnown = { x: player.x, z: player.z };
      this.memory = 7;
    }

    /* ---------- цель и движение ---------- */
    let speed = 1.62;
    if (this.state === "hunt") {
      speed = 2.95 + ctx.collected * 0.13 + player.noise * 0.22;
      if (player.hidden && this.sawPlayerHide) this.target = { x: player.x, z: player.z };
    } else if (this.state === "investigate") {
      speed = 2.3;
    } else if (this.state === "search") {
      speed = 1.9;
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) {
        this.state = "patrol";
        this.target = null;
      }
    }

    let moveTarget = this.target;
    if (this.state === "patrol") {
      const p = cellCenter(PATROL_CELLS[this.patrolIndex]);
      moveTarget = p;
      speed = 1.62;
      if (Math.hypot(p.x - this.x, p.z - this.z) < TILE * 0.55) {
        this.patrolIndex = (this.patrolIndex + 1) % PATROL_CELLS.length;
      }
    }

    this.moving = false;
    if (moveTarget) {
      const atTarget = Math.hypot(moveTarget.x - this.x, moveTarget.z - this.z) < TILE * 0.5;
      if (atTarget && this.state !== "patrol") {
        // Дошла — ищет вокруг последней известной точки.
        if (this.state === "hunt") {
          this.state = "search";
          this.searchTimer = 3.4;
          this.target = null;
          this.sawPlayerHide = this.sawPlayerHide && player.hidden;
        } else if (this.state === "investigate") {
          this.state = "search";
          this.searchTimer = 2.2;
          this.target = null;
        }
      } else if (!atTarget) {
        const step = nextStepWorld(this.x, this.z, moveTarget.x, moveTarget.z);
        const angle = Math.atan2(step.x - this.x, step.z - this.z);
        this.angle = angle;
        const dx = Math.sin(angle) * speed * dt;
        const dz = Math.cos(angle) * speed * dt;
        const oldX = this.x;
        const oldZ = this.z;
        this.move(dx, dz);
        this.moving = Math.hypot(this.x - oldX, this.z - oldZ) > 0.001;
      }
    }

    // Застряла — пропускаем точку патруля.
    if (Math.hypot(this.x - this._lastX, this.z - this._lastZ) < 0.02 && this.moving) {
      this.blockedTimer += dt;
      if (this.blockedTimer > 1.2) {
        this.patrolIndex = (this.patrolIndex + 1) % PATROL_CELLS.length;
        this.blockedTimer = 0;
      }
    } else {
      this.blockedTimer = 0;
    }
    this._lastX = this.x;
    this._lastZ = this.z;

    /* ---------- контакт ---------- */
    if (dist < 1.0 && !player.hidden) {
      ctx.onKill();
      return;
    }
    // Нашла в шкафчике — только если точно знает, где ты спрятался.
    if (player.hidden && this.sawPlayerHide && dist < 1.35) {
      ctx.onKill("Она медленно открыла дверцу шкафчика…");
      return;
    }

    // На точке поиска осматривается по сторонам.
    if (this.state === "search" && !this.moving) {
      this.angle += dt * (this.sawPlayerHide ? 1.6 : 1.0);
    }

    /* ---------- анимация ---------- */
    this.animate(dt, player);
  }

  isLitByPlayer(player) {
    // Направлен ли взгляд игрока (фонарь) на дежурную.
    const dx = this.x - player.x;
    const dz = this.z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const dot = (dx / len) * fx + (dz / len) * fz;
    return dot > Math.cos(0.5);
  }

  move(dx, dz) {
    const r = 0.42;
    const nx = this.x + dx;
    const nz = this.z + dz;
    if (!this.collides(nx, this.z, r)) this.x = nx;
    if (!this.collides(this.x, nz, r)) this.z = nz;
  }

  collides(x, z, r) {
    if (
      isWallWorld(x - r, z - r) ||
      isWallWorld(x + r, z - r) ||
      isWallWorld(x - r, z + r) ||
      isWallWorld(x + r, z + r)
    ) {
      return true;
    }
    for (const c of this.world.colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  animate(dt, player) {
    const parts = this.mesh.userData.parts;
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
    this.mesh.rotation.y = this.angle + Math.PI; // модель смотрит в -Z

    const pace = this.state === "hunt" ? 8.5 : 5;
    const bob = this.moving ? Math.sin(this.time * pace) * 0.035 : Math.sin(this.time * 1.4) * 0.012;
    this.mesh.position.y = bob;

    if (this.moving) {
      const swing = Math.sin(this.time * pace) * (this.state === "hunt" ? 0.75 : 0.4);
      parts.armL.rotation.x = swing;
      parts.armR.rotation.x = -swing * 0.6;
      this.mesh.rotation.z = Math.sin(this.time * pace * 0.5) * 0.04;
    } else {
      parts.armL.rotation.x *= 0.9;
      parts.armR.rotation.x *= 0.9;
      this.mesh.rotation.z = 0;
    }

    // Голова иногда резко поворачивается к игроку при охоте.
    this.twitchTimer -= dt;
    if (this.twitchTimer <= 0) {
      this.twitchTimer = this.state === "hunt" ? 0.7 + Math.random() * 1.2 : 3 + Math.random() * 4;
      if (this.state === "hunt") {
        parts.head.rotation.y = (Math.random() - 0.5) * 0.9;
      } else {
        parts.head.rotation.y = (Math.random() - 0.5) * 0.4;
      }
    }

    // Глаза наливаются кровью при охоте.
    const hunting = this.state === "hunt";
    const glow = hunting ? 1 : 0.75 + Math.sin(this.time * 3) * 0.1;
    if (hunting) parts.eyeMat.color.setRGB(1 * glow, 0.14 * glow, 0.08);
    else parts.eyeMat.color.setRGB(0.91 * glow, 0.87 * glow, 0.8 * glow);
  }
}
