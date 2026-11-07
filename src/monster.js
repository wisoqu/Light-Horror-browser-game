import * as THREE from "three";

/* ============================================================
   ДЕЖУРНАЯ — модель.
   ------------------------------------------------------------
   Долговязая фигура в тёмном школьном платье, слишком длинные
   руки с длинными пальцами, бледная кожа, мокрые волосы, лица
   почти не видно — только провалы глаз и щель рта.

   Контракт с enemy.js (не менять имена):
     parts.armL / parts.armR — группы в плече (rotation.x = мах)
     parts.head            — группа в шее (rotation.y = поворот)
     parts.eyeMat          — материал глаз (цвет меняется в охоте)
   ============================================================ */

function noiseTexture(size, base, spots, alpha) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i += 1) {
    g.fillStyle = spots;
    g.globalAlpha = alpha * (0.3 + Math.random() * 0.7);
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 9, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeMaterials(ghost) {
  if (ghost) {
    return {
      skin: new THREE.MeshStandardMaterial({
        color: 0xe8eef4,
        emissive: 0xa9c2d6,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.38,
        roughness: 1,
        depthWrite: false
      }),
      dress: new THREE.MeshStandardMaterial({
        color: 0xd7e2ec,
        emissive: 0x8fa6ba,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.26,
        roughness: 1,
        depthWrite: false
      }),
      hair: new THREE.MeshStandardMaterial({
        color: 0xc8d6e2,
        emissive: 0x7e94a8,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.3,
        depthWrite: false
      }),
      eye: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
      mouth: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 })
    };
  }

  const skinTex = noiseTexture(256, "#b7b1a2", "#6f6a60", 0.14);
  return {
    skin: new THREE.MeshStandardMaterial({
      map: skinTex,
      color: 0xb9b3a4,
      roughness: 0.78,
      metalness: 0.02,
      emissive: 0x2a2c2e,
      emissiveIntensity: 0.35
    }),
    dress: new THREE.MeshStandardMaterial({
      color: 0x2a3038,
      roughness: 0.95,
      metalness: 0.02,
      emissive: 0x101318,
      emissiveIntensity: 0.7
    }),
    hair: new THREE.MeshStandardMaterial({
      color: 0x08090b,
      roughness: 1,
      metalness: 0
    }),
    eye: new THREE.MeshBasicMaterial({ color: 0xe9e2d2 }),
    mouth: new THREE.MeshBasicMaterial({ color: 0x050506 })
  };
}

/* --------------------------- голова --------------------------- */

function makeHead(mats, { jumpscare = false } = {}) {
  const head = new THREE.Group();

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 18), mats.skin);
  skull.scale.set(0.88, 1.22, 0.98);
  skull.position.y = 0.13;
  skull.castShadow = true;
  head.add(skull);

  // Челюсть — тяжёлая, выдвинутая вперёд.
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.1), mats.skin);
  jaw.position.set(0, 0.04, 0.11);
  jaw.scale.set(1, 1, 1);
  head.add(jaw);

  // Глазницы: чёрные провалы, внутри — тусклый блик.
  const socketGeo = new THREE.SphereGeometry(0.042, 12, 10);
  const socketL = new THREE.Mesh(socketGeo, mats.mouth);
  const socketR = new THREE.Mesh(socketGeo, mats.mouth);
  socketL.position.set(-0.055, 0.16, 0.128);
  socketR.position.set(0.055, 0.16, 0.128);
  socketL.scale.set(1, 1.25, 0.6);
  socketR.scale.set(1, 1.25, 0.6);
  head.add(socketL, socketR);

  const eyeGeo = new THREE.SphereGeometry(jumpscare ? 0.026 : 0.014, 10, 8);
  const eyeL = new THREE.Mesh(eyeGeo, mats.eye);
  const eyeR = new THREE.Mesh(eyeGeo, mats.eye);
  eyeL.position.set(-0.055, 0.158, 0.155);
  eyeR.position.set(0.055, 0.158, 0.155);
  head.add(eyeL, eyeR);

  // Нос — почти отсутствует, только тень.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.055, 6), mats.skin);
  nose.rotation.x = Math.PI * 0.52;
  nose.position.set(0, 0.105, 0.16);
  head.add(nose);

  // Рот: у скримера — разинутая пасть с зубами.
  if (jumpscare) {
    const maw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), mats.mouth);
    maw.scale.set(1.1, 1.5, 0.7);
    maw.position.set(0, -0.005, 0.135);
    head.add(maw);
    for (let i = 0; i < 7; i += 1) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.035, 4), new THREE.MeshBasicMaterial({ color: 0xd8d2bd }));
      tooth.position.set(-0.06 + i * 0.02, 0.045, 0.175);
      tooth.rotation.x = Math.PI;
      head.add(tooth);
      const lower = tooth.clone();
      lower.position.y = -0.05;
      lower.rotation.x = 0;
      head.add(lower);
    }
  } else {
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.02), mats.mouth);
    mouth.position.set(0, 0.035, 0.165);
    head.add(mouth);
  }

  // Волосы: шапка и пряди, закрывающие лицо.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.163, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.66), mats.hair);
  cap.position.y = 0.15;
  cap.scale.set(0.94, 1.2, 1.0);
  head.add(cap);

  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), mats.hair);
  bun.position.set(0, 0.17, -0.16);
  head.add(bun);

  const strands = [
    [-0.1, 0.05, 0.12, 0.3],
    [0.09, 0.02, 0.13, -0.35],
    [0.0, 0.0, 0.15, 0.1],
    [-0.05, 0.08, 0.14, 0.55],
    [0.13, 0.09, 0.1, -0.6]
  ];
  for (const [x, y, z, tilt] of strands) {
    const strand = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.3), mats.hair);
    strand.position.set(x, y - 0.04, z);
    strand.rotation.set(0.1, tilt * 0.4, tilt * 0.15);
    head.add(strand);
  }

  return head;
}

/* --------------------------- рука --------------------------- */

function makeArm(mats, side, pivotY = 1.52) {
  const arm = new THREE.Group(); // точка вращения — плечо
  arm.position.set(side * 0.2, pivotY, 0);

  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.42, 4, 8), mats.dress);
  upper.position.y = -0.25;
  upper.castShadow = true;
  arm.add(upper);

  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.dress);
  elbow.position.y = -0.48;
  arm.add(elbow);

  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.42, 4, 8), mats.skin);
  fore.position.y = -0.72;
  fore.castShadow = true;
  arm.add(fore);

  // Кисть.
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.035), mats.skin);
  palm.position.y = -0.98;
  arm.add(palm);

  // Слишком длинные пальцы.
  for (let i = 0; i < 5; i += 1) {
    const len = 0.11 + Math.random() * 0.05;
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, len, 3, 6), mats.skin);
    finger.position.set(-0.03 + i * 0.015, -1.04 - len / 2, 0.005);
    finger.rotation.z = (i - 2) * 0.06;
    arm.add(finger);
  }

  return arm;
}

/* --------------------------- фигура --------------------------- */

export function createDutyFigure({ ghost = false } = {}) {
  const g = new THREE.Group();
  const parts = {};
  const mats = makeMaterials(ghost);

  // Платье-колокол: она не идёт, а перетекает по коридору.
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.44, 1.15, 18, 1, true), mats.dress);
  skirt.position.y = 0.58;
  skirt.castShadow = true;
  g.add(skirt);
  parts.skirt = skirt;

  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.02, 6, 20), mats.dress);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.01;
  g.add(hem);

  // Торс.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 6, 12), mats.dress);
  torso.position.y = 1.32;
  torso.scale.set(1, 1, 0.78);
  torso.castShadow = true;
  g.add(torso);
  parts.torso = torso;

  // Воротник и пуговицы.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.06, 12), mats.dress);
  collar.position.y = 1.55;
  g.add(collar);
  for (let i = 0; i < 4; i += 1) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), mats.hair);
    button.position.set(0, 1.26 - i * 0.12, 0.145);
    g.add(button);
  }

  // Шея.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 8), mats.skin);
  neck.position.y = 1.63;
  g.add(neck);

  // Голова на своей группе — чтобы enemy.js мог крутить её отдельно.
  const head = makeHead(mats);
  head.position.set(0, 1.66, 0);
  g.add(head);
  parts.head = head;

  // Руки — группы в плечах.
  const armL = makeArm(mats, -1);
  const armR = makeArm(mats, 1);
  g.add(armL, armR);
  parts.armL = armL;
  parts.armR = armR;

  // Ведомость в правой руке: она всё ещё на смене.
  const clipboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.24, 0.015),
    new THREE.MeshStandardMaterial({ color: 0x6b5f43, roughness: 0.9 })
  );
  clipboard.position.set(0.01, -1.02, 0.05);
  clipboard.rotation.x = -0.35;
  armR.add(clipboard);

  if (!ghost) {
    // Бейдж.
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xc8bfa2 })
    );
    badge.position.set(0.1, 1.36, 0.13);
    badge.rotation.y = -0.25;
    g.add(badge);
  }

  parts.eyeMat = mats.eye;
  parts.mats = mats;
  g.userData.parts = parts;
  return g;
}

/* --------------------------- скример --------------------------- */

/* --------------------------- кисть --------------------------- */

function makeHand(mats) {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.13, 0.04), mats.skin);
  hand.add(palm);
  for (let i = 0; i < 5; i += 1) {
    const len = 0.16 + Math.random() * 0.06;
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, len, 3, 6), mats.skin);
    finger.position.set(-0.032 + i * 0.016, 0.07 + len / 2, 0.002);
    finger.rotation.z = (i - 2) * 0.13;
    hand.add(finger);
  }
  return hand;
}

/**
 * Голова и тянущиеся руки для скримера. Лицом в +Z.
 * Возвращает {group, head, hands} — анимацией управляет jumpscare.js.
 */
export function createJumpscareRig() {
  const mats = makeMaterials(false);
  mats.eye = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const group = new THREE.Group();

  const head = makeHead(mats, { jumpscare: true });
  head.scale.setScalar(1.55);
  head.position.y = -0.24;
  group.add(head);

  const hands = new THREE.Group();
  for (const side of [-1, 1]) {
    const hand = makeHand(mats);
    hand.scale.setScalar(1.8);
    hand.position.set(side * 0.46, -0.42, 0.12);
    hand.rotation.z = side * 0.42;
    hand.rotation.x = -0.35;
    hands.add(hand);
  }
  group.add(hands);

  return { group, head, hands };
}
