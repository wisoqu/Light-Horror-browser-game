import * as THREE from "three";

/* ============================================================
   Дежурная.
   ------------------------------------------------------------
   Собрана не из кубов: платье — латекс с вертикальными складками,
   торс — сужающийся к талии профиль, голова — череп с глазницами,
   провалом рта и длинными прядями волос, руки с локтями и кистями.

   Контракт для enemy.js:
     group.userData.parts = { skirt, torso, head, armL, armR, eyeMat, mats }
     armL/armR — группы с точкой вращения в плече (rotation.x = шаг)
     head      — группа с точкой вращения на шее (rotation.y = поворот)
     eyeMat    — материал зрачков (enemy.js красит их в красный при охоте)
   ============================================================ */

const SKIN = 0xc4b6a6;
const SKIN_SHADE = 0x9d8f80;
const DRESS = 0x1c2026;
const DRESS_DEEP = 0x14171b;
const HAIR = 0x07080a;
const EYE_WHITE = 0xd8cfbe;

function makeMaterials(ghost) {
  const base = (color, rough, opts = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: 0.02,
    ...opts
  });

  const mats = {
    dress: base(DRESS, 0.94, { emissive: 0x0b0d11, emissiveIntensity: 0.75 }),
    dressDeep: base(DRESS_DEEP, 0.96),
    skin: base(SKIN, 0.86, { emissive: 0x0a0806, emissiveIntensity: 0.35 }),
    skinShade: base(SKIN_SHADE, 0.9),
    hair: base(HAIR, 0.72, { emissive: 0x04050a, emissiveIntensity: 0.5 }),
    collar: base(0x9a9384, 0.95),
    void: new THREE.MeshBasicMaterial({ color: 0x030304 }),
    eyeWhite: new THREE.MeshBasicMaterial({ color: EYE_WHITE }),
    eye: new THREE.MeshBasicMaterial({ color: 0x141414 }),
    blood: new THREE.MeshBasicMaterial({ color: 0x4a0b0e })
  };

  if (ghost) {
    const ghostly = (m, opacity, emissive) => {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
      if (m.emissive) {
        m.emissive = new THREE.Color(emissive);
        m.emissiveIntensity = 1.2;
      }
      return m;
    };
    ghostly(mats.dress, 0.5, 0x1a2028);
    ghostly(mats.dressDeep, 0.5, 0x101418);
    ghostly(mats.skin, 0.62, 0x2a2720);
    ghostly(mats.skinShade, 0.6, 0x201d18);
    ghostly(mats.hair, 0.45, 0x080a10);
    ghostly(mats.collar, 0.35, 0x2a2a26);
    mats.void = new THREE.MeshBasicMaterial({ color: 0x05060a, transparent: true, opacity: 0.55, depthWrite: false });
    mats.eyeWhite = new THREE.MeshBasicMaterial({ color: 0xbfc6c2, transparent: true, opacity: 0.8 });
    mats.eye = new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.9 });
  }

  return mats;
}

/* --------------------------- утилиты --------------------------- */

/**
 * Тело вращения по профилю [[y, r], ...] с вертикальными складками.
 * Складки сделаны модуляцией радиуса: ткань, а не конус.
 */
function latheGeometry(profile, segments = 34, folds = 0, foldAmp = 0) {
  const geom = new THREE.LatheGeometry(
    profile.map(([y, r]) => new THREE.Vector2(Math.max(0.0001, r), y)),
    segments
  );
  if (folds > 0 && foldAmp > 0) {
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const a = Math.atan2(x, z);
      const k = 1 + Math.cos(a * folds) * foldAmp;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }
  return geom;
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/* --------------------------- голова --------------------------- */

/** Голова с лицом. Лицом в +Z, точка вращения — основание шеи. */
function makeHead(mats, { jumpscare = false } = {}) {
  const head = new THREE.Group();

  // Череп: узкий, вытянутый, чуть сдавленный с боков.
  const skull = mesh(new THREE.SphereGeometry(0.1, 26, 22), mats.skin, 0, 0.082, 0);
  skull.scale.set(0.9, 1.14, 0.96);

  // Затылок.
  const back = mesh(new THREE.SphereGeometry(0.094, 20, 16), mats.skin, 0, 0.07, -0.018);
  back.scale.set(0.96, 1.06, 1.0);

  // Нижняя часть лица — скулы и подбородок, уже черепа.
  const jaw = mesh(new THREE.SphereGeometry(0.074, 18, 14), mats.skin, 0, 0.028, 0.012);
  jaw.scale.set(0.86, 0.86, 0.9);
  const chin = mesh(new THREE.SphereGeometry(0.032, 12, 10), mats.skin, 0, -0.018, 0.036);
  chin.scale.set(0.9, 0.72, 0.8);

  // Глазницы: две раздельные чёрные впадины (не одна маска).
  const sockets = new THREE.Group();
  const eyes = [];
  for (const side of [-1, 1]) {
    const sx = side * 0.047;

    const shadow = mesh(new THREE.SphereGeometry(0.031, 14, 12), mats.void, sx, 0.078, 0.066);
    shadow.scale.set(1, 1.1, 0.55);
    sockets.add(shadow);

    const white = mesh(new THREE.SphereGeometry(0.0158, 12, 10), mats.eyeWhite, sx, 0.078, 0.077);
    white.scale.set(1, 1, 0.7);
    sockets.add(white);

    const pupil = mesh(new THREE.SphereGeometry(0.0088, 10, 8), mats.eye, sx, 0.078, 0.089);
    pupil.scale.set(1, 1, 0.5);
    sockets.add(pupil);
    eyes.push(pupil);
  }

  // Нос — узкий клин.
  const nose = mesh(new THREE.ConeGeometry(0.016, 0.058, 7), mats.skinShade, 0, 0.048, 0.098);
  nose.rotation.x = Math.PI * 0.53;
  nose.scale.set(0.95, 1, 0.7);

  // Рот — тонкая тёмная щель.
  const mouth = mesh(new THREE.SphereGeometry(0.026, 16, 12), mats.void, 0, 0.012, 0.078);
  mouth.scale.set(0.95, 0.28, 0.34);
  const lip = mesh(new THREE.SphereGeometry(0.03, 14, 10), mats.skinShade, 0, -0.004, 0.074);
  lip.scale.set(0.9, 0.18, 0.3);

  // Волосы: шапка на затылок, чёлка, пряди по бокам до подбородка.
  const hair = new THREE.Group();
  // Шапка только на макушку: лицо остаётся открытым.
  const cap = mesh(
    new THREE.SphereGeometry(0.105, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.40),
    mats.hair, 0, 0.088, -0.006
  );
  cap.scale.set(1.03, 1.16, 1.05);
  hair.add(cap);

  // Объём на затылке и по бокам — «каре» вокруг лица.
  const backMass = mesh(new THREE.SphereGeometry(0.095, 18, 14), mats.hair, 0, 0.05, -0.05);
  backMass.scale.set(1.0, 1.3, 0.74);
  hair.add(backMass);
  for (const side of [-1, 1]) {
    const sideMass = mesh(new THREE.SphereGeometry(0.052, 14, 12), mats.hair, side * 0.082, 0.06, -0.012);
    sideMass.scale.set(0.72, 1.9, 1.35);
    hair.add(sideMass);
  }

  // Чёлка: короткие пряди поперёк лба, до бровей.
  for (let i = 0; i < 9; i += 1) {
    const t = (i / 8 - 0.5) * 2;
    const len = 0.045 + Math.random() * 0.02;
    const lock = mesh(new THREE.CapsuleGeometry(0.009, len, 3, 5), mats.hair,
      t * 0.072, 0.145 - len * 0.35, 0.058 - Math.abs(t) * 0.016);
    lock.rotation.z = t * 0.28;
    lock.rotation.x = 0.12;
    hair.add(lock);
  }

  // Боковые пряди — до плеч, неровные.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const len = 0.2 + Math.random() * 0.22;
      const strand = mesh(new THREE.CapsuleGeometry(0.012, len, 3, 5), mats.hair,
        side * (0.072 + i * 0.016), 0.0 - len * 0.42, -0.01 - i * 0.012);
      strand.rotation.z = side * (0.1 + i * 0.05);
      strand.rotation.x = -0.06 - i * 0.04;
      hair.add(strand);
    }
  }

  // Шея — короткая, в тени.
  const neck = mesh(new THREE.CylinderGeometry(0.037, 0.048, 0.07, 10), mats.skinShade, 0, -0.05, 0.002);

  head.add(back, skull, jaw, chin, sockets, nose, mouth, lip, neck, hair);

  if (jumpscare) {
    // Для скримера: рот раскрыт, глаза распахнуты, из глазниц течёт.
    mouth.scale.set(1.05, 1.45, 0.55);
    mouth.position.set(0, 0.006, 0.072);
    for (const e of eyes) e.scale.set(0.55, 0.55, 0.45);
    for (const side of [-1, 1]) {
      const tear = mesh(new THREE.CapsuleGeometry(0.004, 0.085, 3, 5), mats.blood,
        side * 0.046, 0.03, 0.083);
      tear.rotation.z = side * 0.06;
      head.add(tear);
    }
    head.userData.mouth = mouth;
  }
  head.userData.eyes = eyes;
  return head;
}

/* --------------------------- руки --------------------------- */

function makeHand(mats, scale = 1) {
  const hand = new THREE.Group();
  const palm = mesh(new THREE.BoxGeometry(0.07, 0.088, 0.03), mats.skin, 0, 0, 0);
  palm.scale.setScalar(scale);
  hand.add(palm);

  for (let i = 0; i < 4; i += 1) {
    const len = (0.066 + Math.random() * 0.022) * scale;
    const finger = mesh(new THREE.CapsuleGeometry(0.0095 * scale, len, 3, 6), mats.skin,
      (-0.021 + i * 0.014) * scale, -(0.045 + len / 2) * scale, 0.002);
    finger.rotation.z = (i - 1.5) * 0.06;
    hand.add(finger);
  }
  const thumb = mesh(new THREE.CapsuleGeometry(0.0085 * scale, 0.06 * scale, 3, 6), mats.skin,
    -0.032 * scale, -0.03 * scale, 0.008);
  thumb.rotation.z = 0.85;
  hand.add(thumb);
  return hand;
}

function makeArm(mats, side, pivotY = 1.5) {
  const arm = new THREE.Group();
  arm.position.set(side * 0.178, pivotY, 0);

  const upper = mesh(new THREE.CapsuleGeometry(0.042, 0.24, 4, 10), mats.dress, 0, -0.17, 0);
  upper.scale.set(1, 1, 0.92);
  const elbow = mesh(new THREE.SphereGeometry(0.036, 12, 10), mats.dress, 0, -0.315, 0);
  const forearm = mesh(new THREE.CylinderGeometry(0.031, 0.023, 0.3, 10), mats.skin, 0, -0.47, 0);
  const cuff = mesh(new THREE.CylinderGeometry(0.036, 0.033, 0.05, 10), mats.dress, 0, -0.335, 0);

  const hand = makeHand(mats, 1);
  hand.position.set(0, -0.64, 0.004);
  hand.rotation.x = 0.12;

  arm.add(upper, cuff, elbow, forearm, hand);
  arm.userData.hand = hand;
  return arm;
}

/* --------------------------- фигура --------------------------- */

export function createDutyFigure({ ghost = false } = {}) {
  const mats = makeMaterials(ghost);
  const group = new THREE.Group();
  group.name = ghost ? "apparition" : "duty";

  // Платье: от пола до талии, с вертикальными складками и подолом.
  const skirt = mesh(latheGeometry([
    [0.0, 0.3],
    [0.02, 0.315],
    [0.06, 0.318],
    [0.26, 0.29],
    [0.5, 0.245],
    [0.74, 0.205],
    [0.94, 0.178],
    [1.04, 0.168]
  ], 44, 11, 0.045), mats.dress, 0, 0, 0);
  skirt.scale.set(1, 1, 0.82);

  // Торс: от талии к плечам, спереди площе.
  const torso = mesh(latheGeometry([
    [0, 0.168],
    [0.1, 0.158],
    [0.24, 0.163],
    [0.36, 0.172],
    [0.46, 0.19],
    [0.52, 0.196]
  ], 34, 9, 0.028), mats.dress, 0, 1.0, 0);
  torso.scale.set(1, 1, 0.74);

  // Плечи и воротник.
  const shoulders = new THREE.Group();
  for (const side of [-1, 1]) {
    const s = mesh(new THREE.SphereGeometry(0.055, 14, 12), mats.dress, side * 0.168, 1.5, 0);
    s.scale.set(1, 0.9, 0.85);
    shoulders.add(s);
  }
  const collar = mesh(new THREE.CylinderGeometry(0.052, 0.064, 0.05, 12), mats.dressDeep, 0, 1.535, 0.004);
  collar.scale.set(1, 1, 0.9);

  // Пояс — линия талии.
  const belt = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 28), mats.dressDeep, 0, 1.0, 0);
  belt.scale.set(1, 1, 0.8);

  const head = makeHead(mats);
  head.position.set(0, 1.585, 0.004);
  head.scale.setScalar(1.08);

  const armL = makeArm(mats, -1);
  const armR = makeArm(mats, 1);

  group.add(skirt, torso, belt, shoulders, collar, head, armL, armR);

  group.userData.parts = {
    skirt,
    torso,
    head,
    armL,
    armR,
    eyeMat: mats.eye,
    mats
  };
  return group;
}

/* --------------------------- скример --------------------------- */

export function createJumpscareRig() {
  const mats = makeMaterials(false);
  const group = new THREE.Group();

  const head = makeHead(mats, { jumpscare: true });
  head.scale.setScalar(1.5);
  head.position.set(0, -0.06, 0);
  group.add(head);

  // Руки, тянущиеся к лицу с двух сторон кадра.
  const hands = new THREE.Group();
  for (const side of [-1, 1]) {
    const arm = makeArm(mats, side, 0);
    arm.scale.setScalar(1.25);
    arm.position.set(side * 0.3, 0.16, 0.1);
    arm.rotation.x = -1.05;
    arm.rotation.z = side * 0.5;
    hands.add(arm);
  }
  group.add(hands);

  return { group, head, hands };
}
