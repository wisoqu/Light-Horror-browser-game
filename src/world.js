import * as THREE from "three";

/* ============================================================
   Мир школы: карта, геометрия, текстуры, коллизии, поиск пути
   ============================================================ */

export const TILE = 2.2;
export const WALL_H = 3.0;

// Карта родом из 2D-версии — та же планировка, теперь в пространстве.
export const MAP_ROWS = [
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

export const MAP_H = MAP_ROWS.length;
export const MAP_W = MAP_ROWS[0].length;

export const SPAWN_CELL = { x: 1, y: 1 };
export const EXIT_CELL = { x: 1, y: 1 };

export const FUSE_CELLS = [
  { x: 20, y: 1, label: "щиток в кабинете труда" },
  { x: 3, y: 9, label: "щиток в раздевалке" },
  { x: 12, y: 13, label: "щиток у медкабинета" },
  { x: 21, y: 15, label: "главный рубильник" }
];

export const LOCKER_CELLS = [
  { x: 5, y: 5 },
  { x: 17, y: 3 },
  { x: 7, y: 13 },
  { x: 17, y: 11 }
];

export const PATROL_CELLS = [
  { x: 21, y: 14 },
  { x: 11, y: 15 },
  { x: 11, y: 9 },
  { x: 3, y: 9 },
  { x: 2, y: 3 },
  { x: 13, y: 3 },
  { x: 20, y: 1 }
];

export const NOTE_SPOTS = [
  { x: 2, y: 7 },
  { x: 13, y: 1 },
  { x: 20, y: 13 },
  { x: 6, y: 5 },
  { x: 10, y: 15 }
];

export const BATTERY_SPOTS = [
  { x: 21, y: 7 },
  { x: 9, y: 11 },
  { x: 4, y: 15 },
  { x: 16, y: 9 }
];

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

export function cellAt(x, z) {
  return { x: Math.floor(x / TILE), y: Math.floor(z / TILE) };
}

export function cellCenter(cell) {
  return { x: (cell.x + 0.5) * TILE, z: (cell.y + 0.5) * TILE };
}

export function isWallCell(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return true;
  return MAP_ROWS[cy][cx] === "#";
}

export function isWallWorld(x, z) {
  return isWallCell(Math.floor(x / TILE), Math.floor(z / TILE));
}

export function hasLineOfSight(ax, az, bx, bz) {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.floor(dist / 0.45));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (isWallWorld(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

/** BFS: первый шаг от клетки к клетке (в координатах мира). */
export function nextStepWorld(fromX, fromZ, toX, toZ) {
  const start = cellAt(fromX, fromZ);
  const goal = cellAt(toX, toZ);
  const key = (x, y) => `${x},${y}`;
  const queue = [start];
  const cameFrom = new Map([[key(start.x, start.y), null]]);
  let found = false;

  while (queue.length) {
    const current = queue.shift();
    if (current.x === goal.x && current.y === goal.y) {
      found = true;
      break;
    }
    for (const dir of DIRS) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const nextKey = key(next.x, next.y);
      if (cameFrom.has(nextKey)) continue;
      if (isWallCell(next.x, next.y)) continue;
      cameFrom.set(nextKey, current);
      queue.push(next);
    }
  }

  if (!found) return { x: toX, z: toZ };

  let current = goal;
  let previous = cameFrom.get(key(goal.x, goal.y));
  while (previous && !(previous.x === start.x && previous.y === start.y)) {
    current = previous;
    previous = cameFrom.get(key(current.x, current.y));
  }
  return cellCenter(current);
}

/** Кратчайшее расстояние между клетками (для выбора ближайшей точки). */
export function bfsDistance(fromCell, toCell) {
  if (fromCell.x === toCell.x && fromCell.y === toCell.y) return 0;
  const key = (x, y) => `${x},${y}`;
  const queue = [{ ...fromCell, d: 0 }];
  const seen = new Set([key(fromCell.x, fromCell.y)]);
  while (queue.length) {
    const cur = queue.shift();
    for (const dir of DIRS) {
      const nx = cur.x + dir.x;
      const ny = cur.y + dir.y;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (isWallCell(nx, ny)) continue;
      if (nx === toCell.x && ny === toCell.y) return cur.d + 1;
      seen.add(k);
      queue.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return Infinity;
}

export function randomOpenNear(x, z, minDist, maxDist) {
  for (let i = 0; i < 32; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const px = x + Math.cos(angle) * dist;
    const pz = z + Math.sin(angle) * dist;
    if (!isWallWorld(px, pz) && hasLineOfSight(x, z, px, pz)) return { x: px, z: pz };
  }
  return null;
}

/* --------------------------- текстуры --------------------------- */

function makeTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function speckle(g, w, h, count, color, maxR) {
  for (let i = 0; i < count; i += 1) {
    g.fillStyle = color;
    g.globalAlpha = 0.03 + Math.random() * 0.1;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * maxR, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function wallTexture() {
  return makeTexture(256, 256, (g, w, h) => {
    // Верх — бежевая штукатурка, низ — institutional зелёная краска.
    g.fillStyle = "#9d957f";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 260, "#6d6754", 3);

    const paintH = h * 0.58;
    g.fillStyle = "#4a5c48";
    g.fillRect(0, h - paintH, w, paintH);
    speckle(g, w, paintH, 200, "#2f3c30", 3);

    // Полоса раздела и плинтус.
    g.fillStyle = "#39473a";
    g.fillRect(0, h - paintH - 6, w, 6);
    g.fillStyle = "#232b24";
    g.fillRect(0, h - 14, w, 14);

    // Потёртости и грязь у низа.
    for (let i = 0; i < 26; i += 1) {
      g.fillStyle = `rgba(20, 24, 20, ${0.05 + Math.random() * 0.16})`;
      const bw = 6 + Math.random() * 40;
      g.fillRect(Math.random() * w, h - paintH + Math.random() * paintH, bw, 3 + Math.random() * 16);
    }
    // Трещины сверху.
    g.strokeStyle = "rgba(60, 55, 45, 0.35)";
    for (let i = 0; i < 5; i += 1) {
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * (h - paintH);
      g.moveTo(x, y);
      for (let s = 0; s < 5; s += 1) {
        x += (Math.random() - 0.5) * 26;
        y += 6 + Math.random() * 16;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

function floorTexture() {
  return makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#54514a";
    g.fillRect(0, 0, w, h);
    // Линолеум в клетку.
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        g.fillStyle = (x + y) % 2 ? "#575449" : "#4b4842";
        g.fillRect(x * 64, y * 64, 64, 64);
      }
    }
    g.strokeStyle = "rgba(20, 20, 18, 0.5)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, h);
      g.moveTo(0, i * 64);
      g.lineTo(w, i * 64);
      g.stroke();
    }
    speckle(g, w, h, 340, "#2c2a26", 4);
    // Пятна.
    for (let i = 0; i < 14; i += 1) {
      g.fillStyle = `rgba(30, 28, 24, ${0.08 + Math.random() * 0.18})`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 6 + Math.random() * 30, 4 + Math.random() * 18, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, MAP_W * 2, MAP_H * 2);
}

function ceilingTexture() {
  return makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#6d6a60";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 300, "#4d4a42", 5);
    g.strokeStyle = "rgba(40, 38, 34, 0.6)";
    g.lineWidth = 3;
    for (let i = 0; i <= 2; i += 1) {
      g.beginPath();
      g.moveTo(i * 128, 0);
      g.lineTo(i * 128, h);
      g.moveTo(0, i * 128);
      g.lineTo(w, i * 128);
      g.stroke();
    }
    // Подтёки ржавчины.
    for (let i = 0; i < 8; i += 1) {
      g.fillStyle = `rgba(92, 62, 34, ${0.06 + Math.random() * 0.12})`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 26, 5 + Math.random() * 14, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, MAP_W, MAP_H);
}

function noticeTexture() {
  return makeTexture(128, 160, (g, w, h) => {
    g.fillStyle = "#8b8471";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#6f6959";
    g.fillRect(6, 6, w - 12, h - 12);
    // «Текст» объявлений.
    for (let i = 0; i < 9; i += 1) {
      g.fillStyle = `rgba(38, 35, 30, ${0.5 + Math.random() * 0.3})`;
      const lw = 30 + Math.random() * 60;
      g.fillRect(16 + Math.random() * 14, 22 + i * 14, lw, 4);
    }
    g.fillStyle = "rgba(120, 30, 30, 0.55)";
    g.fillRect(34, 10, w - 68, 7);
    speckle(g, w, h, 70, "#4d4738", 2);
  });
}

function paperTexture() {
  return makeTexture(96, 128, (g, w, h) => {
    g.fillStyle = "#cfc6ad";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 11; i += 1) {
      g.fillStyle = `rgba(50, 46, 38, ${0.55 + Math.random() * 0.3})`;
      g.fillRect(12, 14 + i * 9, 26 + Math.random() * 46, 3);
    }
    g.fillStyle = "rgba(110, 30, 30, 0.7)";
    g.fillRect(20, 6, w - 40, 5);
  });
}

/* --------------------------- структуры --------------------------- */

function hash(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return Math.abs(n ^ (n >> 16));
}

/** Сторона стены, к которой примыкает клетка (детали вешаем на неё). */
function wallSideFor(cell) {
  const sides = [
    { nx: 0, ny: -1, rotY: 0 },
    { nx: 0, ny: 1, rotY: Math.PI },
    { nx: -1, ny: 0, rotY: Math.PI / 2 },
    { nx: 1, ny: 0, rotY: -Math.PI / 2 }
  ];
  // Приоритет: север, юг, запад, восток — детерминированно.
  for (const s of sides) {
    if (isWallCell(cell.x + s.nx, cell.y + s.ny)) {
      const cx = (cell.x + 0.5 + s.nx * 0.5) * TILE;
      const cz = (cell.y + 0.5 + s.ny * 0.5) * TILE;
      return { x: cx, z: cz, rotY: s.rotY };
    }
  }
  return { x: (cell.x + 0.5) * TILE, z: (cell.y + 0.5) * TILE, rotY: 0 };
}

/**
 * Строит сцену школы. Возвращает:
 * colliders[], lamps[], fuseAnchors[], lockerAnchors[], exitAnchor,
 * noteAnchors[], batteryAnchors[], materials (для мигания), group
 */
export function buildSchool() {
  const group = new THREE.Group();
  const colliders = [];

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.92, metalness: 0.02 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.65, metalness: 0.04 });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.96, metalness: 0 });

  // Пол и потолок.
  const planeGeo = new THREE.PlaneGeometry(MAP_W * TILE, MAP_H * TILE);
  const floor = new THREE.Mesh(planeGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((MAP_W * TILE) / 2, 0, (MAP_H * TILE) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  const ceil = new THREE.Mesh(planeGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((MAP_W * TILE) / 2, WALL_H, (MAP_H * TILE) / 2);
  ceil.receiveShadow = true;
  group.add(ceil);

  // Стены одним InstancedMesh.
  const wallCells = [];
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      if (MAP_ROWS[y][x] === "#") wallCells.push({ x, y });
    }
  }
  const wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  walls.castShadow = true;
  walls.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  wallCells.forEach((cell, i) => {
    dummy.position.set((cell.x + 0.5) * TILE, WALL_H / 2, (cell.y + 0.5) * TILE);
    dummy.updateMatrix();
    walls.setMatrixAt(i, dummy.matrix);
    const v = 0.86 + (hash(cell.x, cell.y) % 28) / 100;
    tint.setRGB(v, v, v * 0.98);
    walls.setColorAt(i, tint);
  });
  walls.instanceMatrix.needsUpdate = true;
  if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
  group.add(walls);

  // Декор: объявления на стенах.
  const noticeMat = new THREE.MeshStandardMaterial({ map: noticeTexture(), roughness: 0.9 });
  const noticeGeo = new THREE.PlaneGeometry(0.62, 0.78);
  for (let y = 1; y < MAP_H - 1; y += 1) {
    for (let x = 1; x < MAP_W - 1; x += 1) {
      if (MAP_ROWS[y][x] === "#") continue;
      const h = hash(x, y);
      if (h % 9 !== 0) continue;
      const side = wallSideFor({ x, y });
      const notice = new THREE.Mesh(noticeGeo, noticeMat);
      const off = 0.03;
      notice.position.set(side.x + Math.sin(side.rotY) * off, 1.62, side.z + Math.cos(side.rotY) * off);
      notice.rotation.y = side.rotY;
      notice.receiveShadow = true;
      group.add(notice);
    }
  }

  /* ------------------------ лампы ------------------------ */
  const lamps = [];
  for (let y = 1; y < MAP_H - 1; y += 1) {
    for (let x = 1; x < MAP_W - 1; x += 1) {
      if (MAP_ROWS[y][x] === "#") continue;
      if (hash(x, y) % 5 !== 0) continue;
      if (lamps.length >= 46) break;
      lamps.push({
        x: (x + 0.5) * TILE,
        z: (y + 0.5) * TILE,
        cell: { x, y },
        powered: false,
        lit: 0,
        flickerSeed: Math.random() * 100
      });
    }
  }

  // Корпуса ламп — статичные, светящиеся трубки — InstancedMesh с instanceColor.
  const lampBodyGeo = new THREE.BoxGeometry(1.15, 0.09, 0.34);
  const lampBodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.7, metalness: 0.4 });
  const lampBodies = new THREE.InstancedMesh(lampBodyGeo, lampBodyMat, lamps.length);

  const tubeGeo = new THREE.BoxGeometry(1.0, 0.05, 0.1);
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tubes = new THREE.InstancedMesh(tubeGeo, tubeMat, lamps.length);
  tubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lamps.length * 3), 3);

  lamps.forEach((lamp, i) => {
    dummy.position.set(lamp.x, WALL_H - 0.12, lamp.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    lampBodies.setMatrixAt(i, dummy.matrix);
    dummy.position.y = WALL_H - 0.17;
    dummy.updateMatrix();
    tubes.setMatrixAt(i, dummy.matrix);
    tubes.setColorAt(i, new THREE.Color(0, 0, 0));
    lamp.index = i;
  });
  tubes.instanceColor.needsUpdate = true;
  lampBodies.castShadow = false;
  group.add(lampBodies, tubes);

  // Настольные лампы включаются по щиткам: назначаем ближайший щиток.
  for (const lamp of lamps) {
    let best = 0;
    let bestD = Infinity;
    FUSE_CELLS.forEach((fuse, i) => {
      const d = Math.hypot(fuse.x - lamp.cell.x, fuse.y - lamp.cell.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    lamp.fuseIndex = best;
  }

  // Динамические источники света (фиксированное количество — без пересборки шейдеров).
  const pointLights = [];
  for (let i = 0; i < 8; i += 1) {
    const light = new THREE.PointLight(0xd9d2b4, 0, 13, 1.6);
    light.position.set(-100, -100, -100);
    group.add(light);
    pointLights.push(light);
  }

  /* ------------------------ щитки ------------------------ */
  const fuseAnchors = FUSE_CELLS.map((cell) => {
    const side = wallSideFor(cell);
    const g = new THREE.Group();
    g.position.set(side.x, 0, side.z);
    g.rotation.y = side.rotY;

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.72, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.55, metalness: 0.45 })
    );
    box.position.y = 1.45;
    box.position.z = 0.09;
    box.castShadow = true;
    box.receiveShadow = true;
    g.add(box);

    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.26, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x54616a, roughness: 0.4, metalness: 0.7 })
    );
    lever.position.set(0, 1.42, 0.2);
    g.add(lever);

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xd8352a })
    );
    led.position.set(0.16, 1.7, 0.18);
    g.add(led);

    group.add(g);
    colliders.push({
      minX: side.x - 0.4,
      maxX: side.x + 0.4,
      minZ: side.z - 0.4,
      maxZ: side.z + 0.4
    });

    return { cell, group, led, lever, anchor: new THREE.Vector3(side.x, 1.45, side.z) };
  });

  /* ------------------------ шкафчики ------------------------ */
  const lockerMat = new THREE.MeshStandardMaterial({ color: 0x37434c, roughness: 0.6, metalness: 0.5 });
  const lockerDark = new THREE.MeshStandardMaterial({ color: 0x14191d, roughness: 0.8, metalness: 0.3 });
  const lockerAnchors = LOCKER_CELLS.map((cell) => {
    const side = wallSideFor(cell);
    const g = new THREE.Group();
    g.position.set(side.x, 0, side.z);
    g.rotation.y = side.rotY;

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.0, 0.52), lockerMat);
    body.position.y = 1.0;
    body.position.z = 0.28;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    for (let d = -1; d <= 1; d += 1) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.8, 0.02), lockerDark);
      seam.position.set(d * 0.41 + 0.205, 1.0, 0.55);
      g.add(seam);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.02), lockerDark);
      vent.position.set(d * 0.41 + 0.205, 1.62, 0.55);
      g.add(vent);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), lockerDark);
      handle.position.set(d * 0.41 + 0.34, 1.05, 0.56);
      g.add(handle);
    }

    group.add(g);
    colliders.push({
      minX: side.x - 0.75,
      maxX: side.x + 0.75,
      minZ: side.z + 0.0,
      maxZ: side.z + 0.62
    });

    return {
      cell,
      group,
      pos: new THREE.Vector3(side.x + Math.sin(side.rotY) * 0.4, 1.4, side.z + Math.cos(side.rotY) * 0.4),
      rotY: side.rotY
    };
  });

  // Коллизии шкафчиков зависят от поворота — пересобираем AABB корректно.
  colliders.length = 0;
  for (const fuse of fuseAnchors) {
    const p = fuse.group.position;
    colliders.push({ minX: p.x - 0.42, maxX: p.x + 0.42, minZ: p.z - 0.42, maxZ: p.z + 0.42 });
  }
  for (const locker of lockerAnchors) {
    const p = locker.group.position;
    const halfW = 0.72;
    const halfD = 0.62;
    const cos = Math.abs(Math.cos(locker.rotY));
    const sin = Math.abs(Math.sin(locker.rotY));
    colliders.push({
      minX: p.x - (halfW * cos + halfD * sin),
      maxX: p.x + (halfW * cos + halfD * sin),
      minZ: p.z - (halfW * sin + halfD * cos),
      maxZ: p.z + (halfW * sin + halfD * cos)
    });
  }

  /* ------------------------ входная дверь ------------------------ */
  const exitSide = wallSideFor(EXIT_CELL); // стена (1,0) над точкой спавна
  const exitAnchor = new THREE.Vector3(exitSide.x, 1.1, exitSide.z + Math.cos(exitSide.rotY) * 0.04);

  const doorGroup = new THREE.Group();
  doorGroup.position.set(exitSide.x, 0, exitSide.z);
  doorGroup.rotation.y = exitSide.rotY;
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.25, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x4b3826, roughness: 0.75, metalness: 0.05 })
  );
  door.position.y = 1.13;
  door.position.z = 0.06;
  door.castShadow = true;
  door.receiveShadow = true;
  doorGroup.add(door);
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x9a8b56, roughness: 0.35, metalness: 0.8 })
  );
  handle.position.set(0.42, 1.05, 0.13);
  doorGroup.add(handle);

  const signMat = new THREE.MeshBasicMaterial({ color: 0x1d6b33 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.05), signMat);
  sign.position.set(0, 2.5, 0.08);
  doorGroup.add(sign);
  group.add(doorGroup);

  /* ------------------------ записки и батарейки ------------------------ */
  const paperMat = new THREE.MeshStandardMaterial({
    map: paperTexture(),
    roughness: 0.9,
    emissive: 0x6a6250,
    emissiveIntensity: 0.12
  });
  const noteAnchors = NOTE_SPOTS.map((cell) => {
    const side = wallSideFor(cell);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), paperMat);
    paper.position.set(side.x + Math.sin(side.rotY) * 0.035, 1.35, side.z + Math.cos(side.rotY) * 0.035);
    paper.rotation.y = side.rotY;
    group.add(paper);
    return { cell, mesh: paper, pos: paper.position.clone() };
  });

  const batteryAnchors = BATTERY_SPOTS.map((cell) => {
    const c = cellCenter(cell);
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    const cellMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0x93a04f, roughness: 0.4, metalness: 0.5, emissive: 0x36421a, emissiveIntensity: 0.5 })
    );
    cellMesh.rotation.z = Math.PI / 2;
    cellMesh.position.y = 0.14;
    g.add(cellMesh);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xc9e08a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.position.y = 0.16;
    g.add(glow);
    group.add(g);
    return { cell, group: g, pos: new THREE.Vector3(c.x, 0.4, c.z), glow };
  });

  /* ------------------------ мусорные корзины ------------------------ */
  const binMat = new THREE.MeshStandardMaterial({ color: 0x2f3632, roughness: 0.7, metalness: 0.35 });
  for (let y = 1; y < MAP_H - 1; y += 1) {
    for (let x = 1; x < MAP_W - 1; x += 1) {
      if (MAP_ROWS[y][x] === "#") continue;
      if (hash(x + 7, y + 3) % 23 !== 0) continue;
      const side = wallSideFor({ x, y });
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.5, 12), binMat);
      const bx = side.x + Math.sin(side.rotY) * 0.3;
      const bz = side.z + Math.cos(side.rotY) * 0.3;
      bin.position.set(bx, 0.25, bz);
      bin.castShadow = true;
      bin.receiveShadow = true;
      group.add(bin);
      colliders.push({ minX: bx - 0.22, maxX: bx + 0.22, minZ: bz - 0.22, maxZ: bz + 0.22 });
    }
  }

  return {
    group,
    colliders,
    lamps,
    pointLights,
    lampTubes: tubes,
    fuseAnchors,
    lockerAnchors,
    noteAnchors,
    batteryAnchors,
    exitAnchor,
    exitSignMat: signMat,
    doorMesh: door
  };
}
