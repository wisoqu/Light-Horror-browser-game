import { createJumpscareRig } from "./monster.js";

/* ============================================================
   Скример: не картинка, а сама дежурная, которая бросается в
   объектив. Живёт в камере, поэтому всегда перед лицом.
   ============================================================ */

export class JumpScare {
  constructor(camera) {
    const rig = createJumpscareRig();
    this.rig = rig;
    this.group = rig.group;
    this.group.visible = false;
    this.group.renderOrder = 10;
    camera.add(this.group);
    this.active = false;
    this.t = 0;
  }

  start() {
    this.active = true;
    this.t = 0;
    this.group.visible = true;
    this.group.position.set(0, -0.32, -2.6);
    this.group.rotation.set(0.1, 0.5, 0.08);
    this.group.scale.setScalar(0.85);
    this.rig.hands.position.y = -0.45;
    this.rig.hands.rotation.z = 0;
  }

  /** Возвращает true, пока идёт сцена. */
  update(dt) {
    if (!this.active) return false;
    this.t += dt;

    // Рывок к лицу за 0.22 с.
    const lunge = Math.min(1, this.t / 0.22);
    const eased = 1 - Math.pow(1 - lunge, 3);
    this.group.position.z = -2.6 + 2.12 * eased;
    this.group.position.y = -0.32 + 0.3 * eased;
    this.group.scale.setScalar(0.85 + 0.55 * eased);

    // Голова дёргается, руки поднимаются.
    if (this.t > 0.15) {
      const twitch = Math.sin(this.t * 37) * 0.05 + Math.sin(this.t * 13) * 0.03;
      this.group.rotation.z = twitch;
      // Смотрит прямо в объектив, голова мелко дёргается.
      this.group.rotation.y = 0.12 - Math.min(0.2, (this.t - 0.15) * 0.3) + twitch * 0.5;
      this.group.rotation.x = 0.06 - this.t * 0.1;
      if (this.rig.head) {
        this.rig.head.rotation.z = Math.sin(this.t * 23) * 0.05;
        this.rig.head.rotation.x = Math.sin(this.t * 17) * 0.04;
      }
      this.rig.hands.position.y = -0.45 + Math.min(1, this.t * 3) * 0.35;
      this.rig.hands.rotation.z = Math.sin(this.t * 8) * 0.06;
    }

    if (this.t > 1.05) {
      this.active = false;
      this.group.visible = false;
      return false;
    }
    return true;
  }

  stop() {
    this.active = false;
    this.group.visible = false;
  }
}
