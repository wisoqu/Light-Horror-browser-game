import * as THREE from "three";
import {
  TILE,
  WALL_H,
  MAP_W,
  MAP_H,
  MAP_ROWS,
  ROOMS,
  DOORS,
  HALL_OPENING,
  SPAWN_CELL,
  EXIT_CELL,
  FUSE_CELLS,
  LOCKER_CELLS,
  PATROL_CELLS,
  NOTE_SPOTS,
  BATTERY_SPOTS,
  roomAtCell,
  roomById,
  cellAt,
  cellCenter,
  isWallCell
} from "./map42.js";
import { createSchoolMaterials, ROOM_FLOOR, ROOM_WALL, FLOOR_UV_SCALE } from "./textures.js";
import * as Props from "./props.js";
import { Kit, mergeGeometries } from "./props.js";

export {
  TILE,
  WALL_H,
  MAP_W,
  MAP_H,
  MAP_ROWS,
  SPAWN_CELL,
  EXIT_CELL,
  FUSE_CELLS,
  LOCKER_CELLS,
  PATROL_CELLS,
  NOTE_SPOTS,
  BATTERY_SPOTS,
  cellAt,
  cellCenter,
  isWallCell,
  roomAtCell,
  roomById
};

/* ============================================================
   Мир школы: геометрия, свет, коллизии, поиск пути.
   Логика навигации не менялась — менялось только «мясо».
   ============================================================ */

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

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

/** Кратчайшее расстояние между клетками. */
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

/* --------------------------- утилиты --------------------------- */

// Поворот, при котором локальный +Z смотрит В КОМНАТУ.
// north — стена сверху, комната снизу (+Z)  → 0
const SIDE_ROT = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };
// Поворот «лицом в коридор» (для табличек над дверью).
const SIDE_ROT_OUT = { north: Math.PI, south: 0, west: -Math.PI / 2, east: Math.PI / 2 };

/**
 * Точка на стене рядом с клеткой.
 * side — с какой стороны стена. Возвращает мировые координаты
 * центра стены и поворот, при котором +Z смотрит в комнату.
 */
function wallSpot(cell, side) {
  const cx = (cell.x + 0.5) * TILE;
  const cz = (cell.y + 0.5) * TILE;
  if (side === "north") return { x: cx, z: cell.y * TILE, rotY: SIDE_ROT.north, nx: 0, nz: 1 };
  if (side === "south") return { x: cx, z: (cell.y + 1) * TILE, rotY: SIDE_ROT.south, nx: 0, nz: -1 };
  if (side === "west") return { x: cell.x * TILE, z: cz, rotY: SIDE_ROT.west, nx: 1, nz: 0 };
  return { x: (cell.x + 1) * TILE, z: cz, rotY: SIDE_ROT.east, nx: -1, nz: 0 };
}

/** Дополнительная AABB-коллизия. */
function addCollider(colliders, cx, cz, w, d) {
  colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
}

function roomBounds(room) {
  const [x0, y0, x1, y1] = room.rects[0];
  return {
    x0,
    y0,
    x1,
    y1,
    left: x0 * TILE,
    right: (x1 + 1) * TILE,
    top: y0 * TILE,
    bottom: (y1 + 1) * TILE,
    cx: ((x0 + x1 + 1) / 2) * TILE,
    cz: ((y0 + y1 + 1) / 2) * TILE,
    w: (x1 - x0 + 1) * TILE,
    d: (y1 - y0 + 1) * TILE
  };
}

/* --------------------------- пол и потолок --------------------------- */

function buildFloors(materials) {
  const buckets = new Map();
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      if (isWallCell(x, y)) continue;
      const roomId = roomAtCell(x, y);
      const key = ROOM_FLOOR[roomId] || "floorLinoleum";
      const scale = FLOOR_UV_SCALE[key] || 4;
      const geo = new THREE.PlaneGeometry(TILE, TILE);
      geo.rotateX(-Math.PI / 2);
      geo.translate((x + 0.5) * TILE, 0, (y + 0.5) * TILE);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i += 1) {
        uv.setXY(i, pos.getX(i) / scale, pos.getZ(i) / scale);
      }
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(geo);
    }
  }
  const group = new THREE.Group();
  for (const [key, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), materials[key]);
    mesh.receiveShadow = true;
    mesh.name = `floor:${key}`;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }
  return group;
}

function buildCeiling(materials) {
  const map = materials.ceiling.map;
  map.repeat.set((MAP_W * TILE) / 4.4, (MAP_H * TILE) / 4.4);
  const geo = new THREE.PlaneGeometry(MAP_W * TILE, MAP_H * TILE);
  const mesh = new THREE.Mesh(geo, materials.ceiling);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set((MAP_W * TILE) / 2, WALL_H, (MAP_H * TILE) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

/* --------------------------- стены --------------------------- */

function buildWalls(materials, colliders) {
  const buckets = new Map();
  const panelGeo = new THREE.BoxGeometry(TILE, WALL_H, 0.22);

  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      if (!isWallCell(x, y)) continue;
      for (const dir of DIRS) {
        const nx = x + dir.x;
        const ny = y + dir.y;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (isWallCell(nx, ny)) continue;
        const roomId = roomAtCell(nx, ny);
        const key = ROOM_WALL[roomId] || "corridorWall";
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({
          x: (x + 0.5) * TILE + (dir.x * TILE) / 2,
          z: (y + 0.5) * TILE + (dir.y * TILE) / 2,
          rotY: Math.atan2(dir.x, dir.y)
        });
      }
    }
  }

  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (const [key, panels] of buckets) {
    const mesh = new THREE.InstancedMesh(panelGeo, materials[key], panels.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `walls:${key}`;
    panels.forEach((p, i) => {
      dummy.position.set(p.x, WALL_H / 2, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const v = 0.9 + Math.random() * 0.12;
      tint.setRGB(v, v, v * 0.99);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  return group;
}

/* --------------------------- окна --------------------------- */

function buildWindows(materials, colliders) {
  const kit = new Kit();
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0x8fb4d6,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const moonGroup = new THREE.Group();
  const anchors = [];

  for (const room of ROOMS) {
    if (!room.window) continue;
    const b = roomBounds(room);
    const side = room.window;
    const count = Math.max(2, Math.round(b.w / 4.4));
    const step = b.w / count;
    // В вестибюле окна только по краям — по центру входная дверь.
    const xs = room.id === "hall"
      ? [b.left + 1.5, b.right - 1.5]
      : Array.from({ length: count }, (_, i) => b.left + step * (i + 0.5));

    for (let i = 0; i < xs.length; i += 1) {
      const wx = xs[i];
      const wz = side === "north" ? TILE : (MAP_H - 1) * TILE;
      const ry = side === "north" ? 0 : Math.PI;

      kit.begin(wx, wz, ry);
      // Рама и подоконник.
      kit.box("white", 1.9, 0.08, 0.16, 0, 0.92, 0.08);
      kit.box("white", 1.9, 0.08, 0.16, 0, 2.5, 0.08);
      kit.box("white", 0.09, 1.66, 0.16, -0.9, 1.71, 0.08);
      kit.box("white", 0.09, 1.66, 0.16, 0.9, 1.71, 0.08);
      kit.box("white", 0.05, 1.58, 0.1, 0, 1.71, 0.08);
      kit.box("white", 1.9, 0.05, 0.1, 0, 1.71, 0.08);
      kit.plane("glass", 1.78, 1.58, 0, 1.71, 0.02);
      // Форточка.
      kit.box("white", 0.62, 0.04, 0.08, 0.55, 2.18, 0.1);
      // Подоконник изнутри.
      kit.box("woodLight", 2.0, 0.06, 0.3, 0, 0.88, 0.19);
      kit.end();

      anchors.push({ x: wx, z: wz, rotY: ry });

      // Лунный свет на полу — просто светлое пятно, без источника.
      const moonGeo = new THREE.PlaneGeometry(2.0, 3.0);
      const moon = new THREE.Mesh(moonGeo, moonMat);
      moon.rotation.x = -Math.PI / 2;
      moon.rotation.z = ry;
      moon.position.set(wx, 0.015, wz + (side === "north" ? 1.6 : -1.6));
      moonGroup.add(moon);
    }
  }

  // Радиаторы под окнами.
  for (const room of ROOMS) {
    if (!room.window) continue;
    const b = roomBounds(room);
    const side = room.window;
    const z = side === "north" ? TILE + 0.18 : (MAP_H - 1) * TILE - 0.18;
    const ry = side === "north" ? 0 : Math.PI;
    const count = Math.max(2, Math.round(b.w / 4.4));
    const xs = room.id === "hall"
      ? [b.left + 1.5, b.right - 1.5]
      : Array.from({ length: count }, (_, i) => b.left + (b.w / count) * (i + 0.5));
    for (const wx of xs) {
      Props.radiator(kit, wx, z, ry, 1.5);
      addCollider(colliders, wx, z + (side === "north" ? 0.1 : -0.1), 1.6, 0.35);
    }
  }

  const group = kit.build(materials, { castShadow: false, receiveShadow: true });
  group.add(moonGroup);
  return { group, anchors };
}

/* --------------------------- двери --------------------------- */

function makePlateTexture(label) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "#2b3238";
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = "rgba(230, 225, 210, 0.35)";
  g.lineWidth = 2;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = "#ded6c2";
  g.font = "bold 26px Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, 128, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildDoors(materials, colliders) {
  const kit = new Kit();
  const plates = new THREE.Group();

  for (const door of DOORS) {
    const cx = (door.x + 0.5) * TILE;
    const cz = (door.y + 0.5) * TILE;
    // Локальный +Z смотрит в комнату.
    const ry = door.side === "north" ? Math.PI : door.side === "south" ? 0 : door.side === "east" ? -Math.PI / 2 : Math.PI / 2;
    const horizontal = door.axis === "h";

    kit.begin(cx, cz, ry);
    // Закладки по бокам проёма: превращают клетку стены в узкую дверь.
    kit.box("corridorWall", 0.5, WALL_H, 0.34, -0.85, WALL_H / 2, 0);
    kit.box("corridorWall", 0.5, WALL_H, 0.34, 0.85, WALL_H / 2, 0);
    // Перемычка.
    kit.box("corridorWall", 1.2, WALL_H - 2.1, 0.34, 0, (WALL_H + 2.1) / 2, 0);
    // Наличник.
    kit.box("woodDark", 0.1, 2.14, 0.42, -0.62, 1.07, 0);
    kit.box("woodDark", 0.1, 2.14, 0.42, 0.62, 1.07, 0);
    kit.box("woodDark", 1.34, 0.1, 0.42, 0, 2.16, 0);
    // Порог.
    kit.box("metalDark", 1.2, 0.03, 0.45, 0, 0.015, 0);

    // Полотно, распахнутое в комнату почти под 100°.
    const theta = (100 * Math.PI) / 180;
    const leafW = 1.08;
    const hinge = -0.56;
    const lx = hinge + (leafW / 2) * Math.cos(theta);
    const lz = (leafW / 2) * Math.sin(theta);
    kit.add("wood", new THREE.BoxGeometry(leafW, 2.02, 0.05), {
      pos: [lx, 1.02, lz],
      rot: [0, -theta, 0]
    });
    // Ручка.
    kit.add("metal", new THREE.SphereGeometry(0.035, 8, 8), {
      pos: [hinge + leafW * 0.86 * Math.cos(theta), 1.02, lz + 0.06]
    });
    kit.end();

    // Табличка над дверью со стороны коридора.
    if (door.label) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.26),
        new THREE.MeshBasicMaterial({ map: makePlateTexture(door.label) })
      );
      const off = 0.19;
      const dirZ = door.side === "north" ? 1 : door.side === "south" ? -1 : 0;
      const dirX = door.side === "east" ? -1 : door.side === "west" ? 1 : 0;
      plate.position.set(cx + dirX * off, 2.34, cz + dirZ * off);
      plate.rotation.y = SIDE_ROT_OUT[door.side] ?? 0;
      plates.add(plate);
    }

    // Коллизии боковых закладок.
    if (horizontal) {
      addCollider(colliders, cx - 0.85, cz, 0.52, 0.4);
      addCollider(colliders, cx + 0.85, cz, 0.52, 0.4);
    } else {
      addCollider(colliders, cx, cz - 0.85, 0.4, 0.52);
      addCollider(colliders, cx, cz + 0.85, 0.4, 0.52);
    }
  }

  // Широкая арка в вестибюль: перемычка над проёмом и колонны по краям.
  for (const cell of HALL_OPENING) {
    kit.begin((cell.x + 0.5) * TILE, (cell.y + 0.5) * TILE, 0);
    kit.box("hallWall", TILE, WALL_H - 2.5, 0.34, 0, (WALL_H + 2.5) / 2, 0);
    kit.end();
  }
  if (HALL_OPENING.length) {
    const first = HALL_OPENING[0];
    const last = HALL_OPENING[HALL_OPENING.length - 1];
    for (const cell of [first, last]) {
      const cx = (cell.x + 0.5) * TILE + (cell === first ? -TILE / 2 : TILE / 2);
      kit.begin(cx, (cell.y + 0.5) * TILE, 0);
      kit.box("hallWall", 0.4, 2.5, 0.34, 0, 1.25, 0);
      kit.box("woodDark", 0.5, 0.12, 0.4, 0, 2.56, 0);
      kit.end();
    }
  }

  const group = kit.build(materials);
  group.add(plates);
  return group;
}

/* --------------------------- лампы --------------------------- */

function lampCells() {
  const cells = [];
  // Рекреация: каждые три клетки.
  for (let x = 2; x <= 29; x += 3) cells.push({ x, y: 7 });
  for (let x = 3; x <= 29; x += 3) cells.push({ x, y: 8 });

  for (const room of ROOMS) {
    if (room.id === "corridor") continue;
    const b = roomBounds(room);
    const cols = Math.max(1, Math.round(b.w / 5.5));
    const rows = Math.max(1, Math.round(b.d / 5.5));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const x = b.x0 + ((i + 0.5) * (b.x1 - b.x0 + 1)) / cols;
        const y = b.y0 + ((j + 0.5) * (b.y1 - b.y0 + 1)) / rows;
        cells.push({ x: Math.floor(x), y: Math.floor(y) });
      }
    }
  }
  return cells;
}

function buildLamps(materials) {
  const cells = lampCells();
  const lamps = [];
  const lampBodyGeo = new THREE.BoxGeometry(1.24, 0.1, 0.4);
  const bodies = new THREE.InstancedMesh(lampBodyGeo, materials.metal, cells.length);
  const tubeGeo = new THREE.BoxGeometry(1.06, 0.05, 0.12);
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tubes = new THREE.InstancedMesh(tubeGeo, tubeMat, cells.length);
  tubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);

  const dummy = new THREE.Object3D();
  cells.forEach((cell, i) => {
    const x = (cell.x + 0.5) * TILE;
    const z = (cell.y + 0.5) * TILE;
    dummy.position.set(x, WALL_H - 0.07, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    dummy.position.y = WALL_H - 0.12;
    dummy.updateMatrix();
    tubes.setMatrixAt(i, dummy.matrix);
    tubes.setColorAt(i, new THREE.Color(0, 0, 0));
    lamps.push({
      x,
      z,
      cell,
      powered: false,
      lit: 0,
      flickerSeed: Math.random() * 100,
      index: i,
      fuseIndex: 0
    });
  });
  tubes.instanceColor.needsUpdate = true;
  bodies.castShadow = false;
  bodies.receiveShadow = true;

  // Ближайший щиток «отвечает» за лампу.
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

  const group = new THREE.Group();
  group.add(bodies, tubes);
  return { lamps, tubes, group };
}

/* --------------------------- щитки --------------------------- */

function buildFuses(materials, colliders) {
  return FUSE_CELLS.map((cell) => {
    const spot = wallSpot(cell, cell.side);
    const g = new THREE.Group();
    g.position.set(spot.x, 0, spot.z);
    g.rotation.y = spot.rotY;

    // Корпус шкафа.
    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x39424a, roughness: 0.5, metalness: 0.5 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.86, 0.22), cabinetMat);
    box.position.set(0, 1.5, 0.13);
    box.castShadow = true;
    box.receiveShadow = true;
    g.add(box);

    // Приоткрытая дверца.
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c343a, roughness: 0.45, metalness: 0.6 });
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.8, 0.03), doorMat);
    doorMesh.position.set(0.3, 1.5, 0.26);
    doorMesh.rotation.y = -0.5;
    g.add(doorMesh);

    // Автоматы.
    for (let i = 0; i < 3; i += 1) {
      const breaker = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: 0.6, metalness: 0.4 })
      );
      breaker.position.set(-0.18 + i * 0.18, 1.55, 0.24);
      g.add(breaker);
    }

    // Рубильник, который двигает игрок.
    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.3, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7, metalness: 0.2 })
    );
    lever.position.set(-0.12, 1.2, 0.28);
    g.add(lever);

    // Светодиод.
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xd8352a });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), ledMat);
    led.position.set(0.2, 1.78, 0.26);
    g.add(led);

    // Гофра и предупреждающая табличка.
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8),
      materials.metalDark
    );
    conduit.position.set(0.05, 2.42, 0.14);
    g.add(conduit);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xd7c25a })
    );
    sign.position.set(-0.34, 1.9, 0.15);
    sign.rotation.y = 0;
    g.add(sign);
    const bolt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.26),
      new THREE.MeshBasicMaterial({ color: 0xc8b64a })
    );
    bolt.position.set(0.44, 1.9, 0.15);
    g.add(bolt);

    // Коллизия.
    addCollider(colliders, spot.x, spot.z, 0.5, 0.5);

    return {
      cell,
      group: g,
      led,
      lever,
      anchor: new THREE.Vector3(spot.x, 1.45, spot.z)
    };
  });
}

/* --------------------------- шкафчики --------------------------- */

function buildLockers(materials, colliders) {
  return LOCKER_CELLS.map((cell) => {
    const spot = wallSpot(cell, cell.side);
    const g = new THREE.Group();
    g.position.set(spot.x, 0, spot.z);
    g.rotation.y = spot.rotY;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x39444c, roughness: 0.55, metalness: 0.45 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x151a1e, roughness: 0.8, metalness: 0.3 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.05, 0.5), bodyMat);
    body.position.set(0, 1.02, 0.27);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const doors = [];
    for (let d = -1; d <= 1; d += 1) {
      const x = d * 0.49;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.9, 0.04), bodyMat);
      door.position.set(x, 1.05, 0.53);
      g.add(door);
      doors.push(door);
      // Вентиляционные щели.
      for (let v = 0; v < 3; v += 1) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.02), darkMat);
        vent.position.set(x, 1.72 - v * 0.08, 0.555);
        g.add(vent);
      }
      // Ручка и номерок.
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.18, 0.035), darkMat);
      handle.position.set(x + 0.18, 1.05, 0.57);
      g.add(handle);
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 0.07),
        new THREE.MeshBasicMaterial({ color: 0xb8ad8e })
      );
      plate.position.set(x, 1.86, 0.556);
      g.add(plate);
    }

    // AABB зависит от стены: вдоль неё шкафчик длинный, а в комнату — тонкий.
    const alongZ = cell.side === "west" || cell.side === "east";
    addCollider(colliders, spot.x, spot.z, alongZ ? 0.7 : 1.6, alongZ ? 1.6 : 0.7);

    return {
      cell,
      group: g,
      doors,
      pos: new THREE.Vector3(spot.x + spot.nx * 0.75, 1.4, spot.z + spot.nz * 0.75),
      rotY: spot.rotY,
      spot
    };
  });
}

/* --------------------------- записки и батарейки --------------------------- */

function buildNotes(materials) {
  const paperMat = new THREE.MeshStandardMaterial({
    map: materials.paper.map,
    roughness: 0.95,
    emissive: 0x50493a,
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide
  });
  return NOTE_SPOTS.map((cell) => {
    const spot = wallSpot(cell, cell.side);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.38), paperMat);
    paper.position.set(spot.x + spot.nx * 0.04, 1.42, spot.z + spot.nz * 0.04);
    paper.rotation.y = spot.rotY;
    paper.castShadow = false;
    return { cell, mesh: paper, pos: paper.position.clone() };
  });
}

function buildBatteries(materials) {
  return BATTERY_SPOTS.map((cell) => {
    const c = cellCenter(cell);
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.24, 12),
      new THREE.MeshStandardMaterial({ color: 0x8f9b4a, roughness: 0.4, metalness: 0.5, emissive: 0x2c3614, emissiveIntensity: 0.6 })
    );
    shell.rotation.z = Math.PI / 2;
    shell.position.y = 0.12;
    g.add(shell);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10),
      materials.metal
    );
    cap.rotation.z = Math.PI / 2;
    cap.position.set(0.14, 0.12, 0);
    g.add(cap);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xc9e08a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.position.y = 0.14;
    g.add(glow);
    return { cell, group: g, pos: new THREE.Vector3(c.x, 0.4, c.z), glow };
  });
}

/* --------------------------- мебель --------------------------- */

function furnishRoom(kit, colliders, room, boards) {
  const b = roomBounds(room);
  const add = (fn, ...args) => fn(kit, ...args);

  switch (room.type) {
    case "classroom":
    case "lab":
    case "computer": {
      // Доска на западной стене.
      add(Props.blackboard, b.left + 0.13, b.cz, Math.PI / 2, Math.min(4.4, b.d - 2.4));
      if (boards) boards.push({ x: b.left + 0.16, z: b.cz, rotY: Math.PI / 2, room: room.id });
      add(Props.teacherTable, b.left + 2.1, b.cz, Math.PI / 2);
      addCollider(colliders, b.left + 2.1, b.cz, 1.5, 0.9);

      if (room.type === "lab") {
        // Лабораторные столы вдоль юга и севера.
        add(Props.labBench, b.left + 5.4, b.top + 1.5, 0);
        add(Props.labBench, b.left + 8.6, b.top + 1.5, 0);
        add(Props.labBench, b.left + 5.4, b.bottom - 1.5, Math.PI);
        add(Props.fumeHood, b.right - 0.5, b.top + 2.4, -Math.PI / 2);
        addCollider(colliders, b.right - 0.5, b.top + 2.4, 0.9, 1.6);
      } else if (room.type === "computer") {
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 2; col += 1) {
            const x = b.left + 4.2 + row * 1.9;
            const z = b.top + 3.0 + col * 4.2;
            add(Props.computerDesk, x, z, -Math.PI / 2);
            addCollider(colliders, x + 0.35, z, 1.35, 1.7);
          }
        }
      } else {
        // Парты: четыре ряда по две.
        for (let row = 0; row < 4; row += 1) {
          const x = b.left + 3.9 + row * 1.85;
          for (let col = 0; col < 2; col += 1) {
            const z = b.cz + (col === 0 ? -1.9 : 1.9);
            add(Props.desk, x, z, -Math.PI / 2);
            addCollider(colliders, x + 0.3, z, 1.4, 1.25);
          }
        }
      }

      // Шкаф у восточной стены и мелочь.
      add(Props.cabinet, b.right - 0.24, b.top + 1.4, -Math.PI / 2, { width: 1.0, height: 2.0 });
      addCollider(colliders, b.right - 0.24, b.top + 1.4, 0.5, 1.1);
      add(Props.bin, b.right - 0.7, b.bottom - 0.8);
      add(Props.plant, b.right - 0.8, b.top + 0.8);
      add(Props.noticeBoard, b.right - 2.4, b.bottom - 0.12, Math.PI, { width: 1.5, height: 0.95 });
      break;
    }

    case "canteen": {
      // Раздача вдоль восточной стены.
      add(Props.counter, b.right - 0.75, b.cz - 2.2, -Math.PI / 2, 3.2);
      addCollider(colliders, b.right - 0.75, b.cz - 2.2, 1.1, 3.3);
      // Столы в восточной половине, запад оставляем свободным.
      for (let index = 0; index < 4; index += 1) {
        const x = b.left + 5.4 + (index % 2) * 2.6;
        const z = b.top + 3.8 + Math.floor(index / 2) * 3.2;
        add(Props.canteenTable, x, z, 0, { length: 2.0 });
        addCollider(colliders, x, z, 2.1, 1.8);
      }
      // Меню на северной стене.
      add(Props.noticeBoard, b.left + 2.4, b.top + 0.12, 0, { width: 1.8, height: 1.1 });
      add(Props.bin, b.left + 1.0, b.bottom - 0.8);
      break;
    }

    case "medical": {
      add(Props.medicalBed, b.right - 1.2, b.top + 1.6, -Math.PI / 2);
      addCollider(colliders, b.right - 1.2, b.top + 1.6, 0.9, 2.0);
      add(Props.cabinet, b.left + 0.25, b.cz + 2.4, Math.PI / 2, { width: 1.0, height: 1.9 });
      addCollider(colliders, b.left + 0.25, b.cz + 2.4, 0.5, 1.1);
      add(Props.teacherTable, b.right - 1.3, b.bottom - 1.5, Math.PI);
      addCollider(colliders, b.right - 1.3, b.bottom - 1.5, 1.5, 0.8);
      add(Props.divider, b.right - 1.2, b.top + 3.6, -Math.PI / 2);
      add(Props.plant, b.left + 0.8, b.bottom - 0.9);
      add(Props.noticeBoard, b.left + 0.14, b.top + 1.6, Math.PI / 2, { width: 1.2, height: 0.9 });
      break;
    }

    case "electrical": {
      // Рядом с интерактивным щитком — ещё три «мёртвых» шкафа.
      for (let i = 0; i < 3; i += 1) {
        const z = b.top + 1.4 + i * 2.6;
        kit.begin(b.left + 0.14, z, Math.PI / 2);
        kit.box("metalDark", 0.5, 0.84, 0.2, 0, 1.5, 0.1);
        kit.box("metal", 0.44, 0.7, 0.03, 0, 1.5, 0.21);
        for (let k = 0; k < 3; k += 1) {
          kit.box("black", 0.09, 0.1, 0.05, -0.13 + k * 0.13, 1.56, 0.24);
        }
        kit.end();
      }
      add(Props.extinguisher, b.right - 0.4, b.bottom - 1.0, -Math.PI / 2);
      add(Props.bin, b.left + 0.7, b.bottom - 0.7);
      break;
    }

    case "library": {
      // Стеллажи вдоль западной стены.
      for (let i = 0; i < 3; i += 1) {
        const z = b.top + 1.6 + i * 3.1;
        add(Props.shelf, b.left + 0.32, z, Math.PI / 2, { width: 2.6, height: 2.1 });
        addCollider(colliders, b.left + 0.32, z, 0.5, 2.7);
      }
      add(Props.shelf, b.right - 0.32, b.top + 2.2, -Math.PI / 2, { width: 2.4, height: 2.1 });
      addCollider(colliders, b.right - 0.32, b.top + 2.2, 0.5, 2.5);
      // Читальный стол.
      add(Props.teacherTable, b.left + 4.6, b.cz, Math.PI / 2);
      addCollider(colliders, b.left + 4.6, b.cz, 1.6, 0.9);
      add(Props.chair, b.left + 5.6, b.cz - 0.8, 0);
      add(Props.chair, b.left + 3.6, b.cz + 0.8, Math.PI);
      add(Props.plant, b.right - 0.9, b.bottom - 0.9);
      add(Props.noticeBoard, b.right - 0.14, b.cz, Math.PI / 2, { width: 1.2, height: 0.8 });
      break;
    }

    case "gym": {
      add(Props.wallBars, b.left + 0.2, b.top + 2.2, Math.PI / 2, { width: 2.8, height: 2.6 });
      add(Props.wallBars, b.left + 0.2, b.top + 5.6, Math.PI / 2, { width: 2.8, height: 2.6 });
      addCollider(colliders, b.left + 0.2, b.top + 2.2, 0.5, 2.9);
      addCollider(colliders, b.left + 0.2, b.top + 5.6, 0.5, 2.9);
      add(Props.gymMat, b.left + 4.2, b.top + 4.0, 0);
      add(Props.gymMat, b.left + 4.2, b.top + 8.2, 0);
      add(Props.gymHorse, b.left + 3.0, b.top + 10.4, 0);
      addCollider(colliders, b.left + 3.0, b.top + 10.4, 1.5, 0.6);
      add(Props.bench, b.right - 1.0, b.top + 3.2, -Math.PI / 2, 2.0);
      add(Props.bench, b.right - 1.0, b.top + 8.0, -Math.PI / 2, 2.0);
      add(Props.courtMarkings, b.cx, b.cz, b.w - 1.6, b.d - 1.6);
      // Баскетбольное кольцо.
      kit.begin(b.right - 0.05, b.top + 5.0, -Math.PI / 2);
      kit.box("metal", 1.2, 0.8, 0.06, 0, 2.9, 0.03);
      kit.cyl("metal", 0.03, 0.12, 0, 2.55, 0.24);
      kit.add("paintRed", new THREE.TorusGeometry(0.22, 0.02, 6, 16), { pos: [0, 2.4, 0.42], rot: [Math.PI / 2, 0, 0] });
      kit.end();
      add(Props.plant, b.right - 0.8, b.bottom - 0.7);
      break;
    }

    case "locker": {
      add(Props.bench, b.cx + 0.5, b.bottom - 0.9, 0, 1.4);
      addCollider(colliders, b.cx + 0.5, b.bottom - 0.9, 1.5, 0.5);
      add(Props.shower, b.left + 0.5, b.top + 1.2, Math.PI / 2);
      add(Props.shower, b.right - 0.5, b.top + 1.2, -Math.PI / 2);
      add(Props.extinguisher, b.right - 0.35, b.bottom - 0.7, -Math.PI / 2);
      break;
    }

    case "hall": {
      // Гардероб вдоль северной стены, слева от арки.
      add(Props.coatRack, b.left + 1.7, b.top + 0.24, 0, 3.2);
      addCollider(colliders, b.left + 1.7, b.top + 0.24, 3.3, 0.7);
      // Вахта у входа.
      add(Props.receptionDesk, b.right - 1.6, b.bottom - 1.1, Math.PI);
      addCollider(colliders, b.right - 1.6, b.bottom - 1.1, 1.9, 0.8);
      add(Props.bench, b.right - 0.9, b.cz, -Math.PI / 2, 2.0);
      addCollider(colliders, b.right - 0.9, b.cz, 0.5, 2.1);
      add(Props.plant, b.left + 0.7, b.bottom - 0.8);
      add(Props.plant, b.right - 0.7, b.top + 0.7);
      // Баннер на восточной стене, стенд на западной.
      add(Props.banner, b.right - 0.14, b.top + 2.6, -Math.PI / 2, { width: 3.6, height: 0.9 });
      add(Props.noticeBoard, b.left + 0.14, b.top + 2.2, Math.PI / 2, { width: 1.5, height: 1.0 });
      break;
    }

    default:
      break;
  }
}

function buildCorridorProps(kit, colliders) {
  // Стенды, часы, огнетушители, урны и растения вдоль рекреации.
  const northFace = 7 * TILE; // грань стены, выходящая в коридор
  const southFace = 9 * TILE;

  const boards = [6.0, 12.0, 24.0];
  for (const x of boards) {
    Props.noticeBoard(kit, x, northFace + 0.02, 0, { width: 1.6, height: 1.0 });
  }
  Props.noticeBoard(kit, 4.4, southFace - 0.02, Math.PI, { width: 1.4, height: 0.9 });

  for (const x of [10.0, 22.0]) Props.clock(kit, x, northFace + 0.02, 0);
  for (const x of [8.0, 20.0]) Props.extinguisher(kit, x, southFace - 0.02, Math.PI);

  // Растения и урны — без коллизий: это мелочь, сквозь неё можно пройти.
  for (const x of [17.6, 28.4]) Props.plant(kit, x, northFace + 0.55, 0);
  for (const x of [3.0, 11.5, 23.5]) Props.bin(kit, x, southFace - 0.55);
  // Скамья у окна в конце рекреации — вдоль стены, не поперёк прохода.
  Props.bench(kit, 29.7, northFace + 0.36, Math.PI, 1.6);
}

/* --------------------------- вход --------------------------- */

function buildEntrance(materials, colliders) {
  const cell = EXIT_CELL;
  const cx = (cell.x + 0.5) * TILE;
  const z = (cell.y + 1) * TILE;

  const group = new THREE.Group();
  group.position.set(cx, 0, z);
  group.rotation.y = Math.PI; // смотрит внутрь вестибюля

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.6, metalness: 0.35 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.7, metalness: 0.1 });

  // Двустворчатая дверь с тамбурной рамой.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.7, 0.16), frameMat);
  frame.position.set(0, 1.35, 0.08);
  group.add(frame);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.32, 0.08), doorMat);
  door.position.set(-0.55, 1.18, 0.19);
  group.add(door);
  const door2 = door.clone();
  door2.position.x = 0.55;
  group.add(door2);

  const glassMat = new THREE.MeshBasicMaterial({ color: 0x0a1018 });
  for (const dx of [-0.55, 0.55]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.02), glassMat);
    pane.position.set(dx, 1.62, 0.15);
    group.add(pane);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), materials.steel);
    handle.position.set(dx + (dx < 0 ? 0.34 : -0.34), 1.05, 0.24);
    group.add(handle);
  }

  // Светящаяся табличка «ВЫХОД».
  const signMat = new THREE.MeshBasicMaterial({ color: 0x1d6b33 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.08), signMat);
  sign.position.set(0, 2.72, 0.2);
  group.add(sign);

  // Коврик и порог.
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 1 })
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.012, 0.9);
  group.add(mat);

  return {
    group,
    doorMesh: door,
    exitSignMat: signMat,
    anchor: new THREE.Vector3(cx, 1.1, z - 0.2)
  };
}

/* --------------------------- сборка --------------------------- */

export function buildSchool() {
  const materials = createSchoolMaterials();
  const group = new THREE.Group();
  const colliders = [];

  // Подложка под полами — чтобы не было щелей у стен.
  const subfloor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W * TILE + 8, MAP_H * TILE + 8),
    new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 1 })
  );
  subfloor.rotation.x = -Math.PI / 2;
  subfloor.position.set((MAP_W * TILE) / 2, -0.06, (MAP_H * TILE) / 2);
  group.add(subfloor);

  group.add(buildFloors(materials));
  group.add(buildCeiling(materials));
  group.add(buildWalls(materials, colliders));

  const windows = buildWindows(materials, colliders);
  group.add(windows.group);

  group.add(buildDoors(materials, colliders));

  const { lamps, tubes, group: lampGroup } = buildLamps(materials);
  group.add(lampGroup);

  // Динамические источники: фиксированное количество.
  const pointLights = [];
  for (let i = 0; i < 10; i += 1) {
    const light = new THREE.PointLight(0xd9d2b4, 0, 12, 1.8);
    light.position.set(-100, -100, -100);
    group.add(light);
    pointLights.push(light);
  }

  const fuseAnchors = buildFuses(materials, colliders);
  const lockerAnchors = buildLockers(materials, colliders);
  const noteAnchors = buildNotes(materials);
  const batteryAnchors = buildBatteries(materials);

  for (const note of noteAnchors) group.add(note.mesh);
  for (const battery of batteryAnchors) group.add(battery.group);
  for (const fuse of fuseAnchors) group.add(fuse.group);
  for (const locker of lockerAnchors) group.add(locker.group);

  // Мебель: один склеенный меш на материал.
  const kit = new Kit();
  const blackboardAnchors = [];
  for (const room of ROOMS) {
    if (room.id === "corridor") continue;
    furnishRoom(kit, colliders, room, blackboardAnchors);
  }
  buildCorridorProps(kit, colliders);
  const furniture = kit.build(materials);
  group.add(furniture);

  const entrance = buildEntrance(materials, colliders);
  group.add(entrance.group);

  return {
    group,
    materials,
    colliders,
    lamps,
    pointLights,
    lampTubes: tubes,
    fuseAnchors,
    lockerAnchors,
    noteAnchors,
    batteryAnchors,
    windowAnchors: windows.anchors,
    blackboardAnchors,
    rooms: ROOMS,
    exitAnchor: entrance.anchor,
    exitSignMat: entrance.exitSignMat,
    doorMesh: entrance.doorMesh
  };
}
