import { TILE, PATROL_CELLS, cellCenter, hasLineOfSight, isWallWorld, nextStepWorld, randomOpenNear, randomFarCell, clearPathWorld } from "./world.js";
import { createDutyFigure } from "./monster.js";

export { createDutyFigure };

/* ============================================================
   Дежурная: конечный автомат ИИ
   patrol → investigate → hunt → search

   ВАЖНО: модель фигуры живёт в monster.js. Имена частей, которые
   крутит animate(), — контракт: parts.armL, parts.armR, parts.head,
   parts.eyeMat. Логику ИИ в этом файле менять не нужно, чтобы
   переделать внешний вид.
   ============================================================ */

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
    this.hideKnown = 0; // секунд, в течение которых она «помнит» шкафчик
    this.opening = 0; // сколько уже стоит у дверцы и тянется к ней
    this.lastKnown = null;
    this.blockedTimer = 0;
    this._sideSign = 1;
    this.alertTimer = 0;
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
    this.roamTarget = null;
    this.sawPlayerHide = false;
    this.hideKnown = 0;
    this.lastKnown = null;
    this.speed = 0;
    this.moving = false;
    this.blockedTimer = 0;
    this._sideSign = 1;
    this.alertTimer = 0;
    this.mesh.position.set(this.x, 0, this.z);
  }

  /** Запомнить шкафчик на несколько секунд (увидела, как ты залез, или услышала вдох). */
  markHidden(seconds = 11) {
    this.hideKnown = Math.max(this.hideKnown, seconds);
    this.sawPlayerHide = true;
    this.state = "hunt";
    this.target = { x: this._hideX ?? this.target?.x ?? this.x, z: this._hideZ ?? this.target?.z ?? this.z };
    this.memory = Math.max(this.memory, 3.6);
  }

  /** Забыть про шкафчик (игрок вышел или переждал). */
  forgetHidden() {
    this.hideKnown = 0;
    this.sawPlayerHide = false;
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

    // Она ГЛУХАЯ: шаги и бег её не привлекают. Только зрение.
    const canHear = false;

    if (canSee) {
      // Первый кадр погони — она замирает и смотрит: даёт игроку ужаснуться
      // и рвануть, вместо мгновенного «телепорта в лицо».
      if (this.state !== "hunt") this.alertTimer = 0.5;
      this.state = "hunt";
      this.target = { x: player.x, z: player.z };
      this.lastKnown = { x: player.x, z: player.z };
      this.memory = 3.2;
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
      this.hideKnown = 0;
    }

    // Память о шкафчике живёт ограниченное время и тает, пока ты держишь
    // дыхание. Раньше это был вечный флаг — из-за него смерть в шкафу была
    // неизбежной, даже с зажатой B.
    if (this.hideKnown > 0) {
      const decay = player.hidden && player.holdingBreath ? 2.4 : 1;
      this.hideKnown = Math.max(0, this.hideKnown - dt * decay);
      if (this.hideKnown === 0) {
        this.sawPlayerHide = false;
        if (this.state === "search" && !player.hidden) {
          this.state = "patrol";
          this.target = null;
        }
      }
    }

    // Игрок нырнул в шкафчик у неё на глазах — она это запомнила.
    if (player.hidden && player.hideSeenThisFrame && dist < 6 && los) {
      this._hideX = player.x;
      this._hideZ = player.z;
      this.markHidden(12);
      this.lastKnown = { x: player.x, z: player.z };
    }

    /* ---------- цель и движение ---------- */
    let speed = 1.45;
    if (this.state === "hunt") {
      // Никогда не быстрее бега игрока (4.5): её можно перебежать.
      speed = Math.min(3.35, 3.15 + ctx.collected * 0.05);
      if (player.hidden && this.sawPlayerHide) this.target = { x: player.x, z: player.z };
    } else if (this.state === "investigate") {
      speed = 2.0;
    } else if (this.state === "search") {
      speed = 1.7;
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) {
        // Не нашла — проверяет ещё одну точку рядом, и только потом уходит.
        const spot = Math.random() < 0.55 ? randomOpenNear(this.x, this.z, 2.5, 7) : null;
        if (spot) {
          this.state = "investigate";
          this.target = spot;
          this.memory = 2.4;
        } else {
          this.state = "patrol";
          this.target = null;
        }
      }
    }

    if (this.alertTimer > 0) {
      this.alertTimer = Math.max(0, this.alertTimer - dt);
      speed = 0;
    }
    this.speed = speed; // фактическая скорость — для отладки и HUD

    let moveTarget = this.target;
    if (this.state === "patrol") {
      speed = 1.45;
      // Обход всей школы, а не только коридора: чаще заворачивает в случайное
      // помещение, иногда возвращается на маршрут.
      if (!this.roamTarget) {
        // randomFarCell, а не randomOpenNear: видимость ограничивала её одной
        // комнатой, и она никогда не выходила из коридора.
        this.roamTarget = Math.random() < 0.7 ? randomFarCell(this.x, this.z, 8, 34) : null;
        if (!this.roamTarget) this.roamTarget = cellCenter(PATROL_CELLS[this.patrolIndex]);
      }
      moveTarget = this.roamTarget;
      if (Math.hypot(moveTarget.x - this.x, moveTarget.z - this.z) < TILE * 0.55) {
        this.roamTarget = null;
        this.patrolIndex = (this.patrolIndex + 1) % PATROL_CELLS.length;
      }
    }

    this.moving = false;
    if (this.opening > 0) {
      // Стоит у дверцы: не двигается, смотрит на шкафчик.
      this.angle = Math.atan2(player.x - this.x, player.z - this.z);
      moveTarget = null;
    }
    if (moveTarget) {
      // «Дошла» — только если цель это забытая точка. Пока игрок на виду,
      // остановка на 1.1 м означала, что она бросала погоню в шаге от него.
      const atTarget = Math.hypot(moveTarget.x - this.x, moveTarget.z - this.z) < TILE * 0.5;
      if (atTarget && this.state !== "patrol" && !canSee) {
        // Дошла — ищет вокруг последней известной точки.
        if (this.state === "hunt") {
          this.state = "search";
          this.searchTimer = 3.4;
          this.target = null;
          this.sawPlayerHide = this.sawPlayerHide && player.hidden;
          if (player.hidden) this.searchTimer = Math.max(this.searchTimer, 2.2);
        } else if (this.state === "investigate") {
          this.state = "search";
          this.searchTimer = 2.2;
          this.target = null;
        }
      } else if (!atTarget || canSee) {
        // Прямой путь свободен — идёт точно на цель. Иначе nextStepWorld в
        // пределах одной клетки возвращал её же центр, и в погоне она танцевала
        // вокруг игрока, не сокращая дистанцию.
        const step = clearPathWorld(this.x, this.z, moveTarget.x, moveTarget.z)
          ? moveTarget
          : nextStepWorld(this.x, this.z, moveTarget.x, moveTarget.z);
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

    // Застряла: путь по клеткам не знает про мебель, поэтому она упирается
    // в стол или шкафчик. Считаем застревание по «хотела идти, но не сдвинулась»,
    // обходим боком, а потом меняем цель. Раньше счётчик обнулялся ровно в этот
    // момент (проверка была завязана на this.moving) и она стояла вечно.
    const wantsMove = Boolean(moveTarget) && this.state !== "patrol"
      ? !(Math.hypot(moveTarget.x - this.x, moveTarget.z - this.z) < TILE * 0.5)
      : (this.state === "patrol" && Boolean(moveTarget));
    const progressed = Math.hypot(this.x - this._lastX, this.z - this._lastZ) > 0.02;

    if (wantsMove && !progressed && speed > 0 && this.opening <= 0) {
      this.blockedTimer += dt;
      this._sideSign = this._sideSign || 1;
      if (this.blockedTimer > 0.3) {
        // Боковой шаг: обходит угол стола, а не таранит его.
        const side = this._sideSign;
        const step = speed * 0.6 * dt;
        this.move(Math.cos(this.angle) * step * side, -Math.sin(this.angle) * step * side);
      }
      if (this.blockedTimer > 1.3) {
        this.blockedTimer = 0;
        this._sideSign = -this._sideSign;
        if (this.state === "patrol") {
          this.patrolIndex = (this.patrolIndex + 1) % PATROL_CELLS.length;
          this.roamTarget = null;
        } else {
          const spot = randomOpenNear(this.x, this.z, 2, 8) || randomFarCell(this.x, this.z, 6, 20);
          this.target = spot || null;
          if (!spot) this.state = "patrol";
        }
      }
    } else {
      this.blockedTimer = 0;
    }
    this._lastX = this.x;
    this._lastZ = this.z;

    /* ---------- контакт ---------- */
    if (dist < 0.85 && !player.hidden && los) {
      ctx.onKill();
      return;
    }
    // У шкафчика: сначала она тянется к дверце (1,2 с) — этого времени
    // хватает, чтобы зажать B. Затаился — отходит и забывает.
    const atLocker = player.hidden && this.hideKnown > 0 && dist < 1.35 && los;
    if (!atLocker) {
      this.opening = 0;
    } else if (player.holdingBreath) {
      // Затаился — она теряет уверенность и не тянется к дверце.
      this.opening = 0;
      this.hideKnown = Math.max(0, this.hideKnown - dt * 1.6);
    } else {
      this.opening += dt;
      if (this.opening > 1.2) {
        ctx.onKill("Она медленно открыла дверцу шкафчика…");
        return;
      }
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
    this.mesh.rotation.y = this.angle; // модель в monster.js смотрит в +Z

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
