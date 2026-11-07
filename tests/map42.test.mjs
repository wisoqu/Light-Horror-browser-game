import test from "node:test";
import assert from "node:assert/strict";

import {
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
  NOTE_SPOTS,
  BATTERY_SPOTS,
  PATROL_CELLS,
  isWallCell,
  cellAt,
  cellCenter,
  TILE
} from "../src/map42.js";

const walkable = (x, y) => !isWallCell(x, y);

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

function flood(start) {
  const seen = new Set();
  const key = (x, y) => `${x},${y}`;
  const queue = [start];
  seen.add(key(start.x, start.y));
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (!walkable(nx, ny)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

test("карта прямоугольная и непустая", () => {
  assert.equal(MAP_ROWS.length, MAP_H);
  for (const row of MAP_ROWS) assert.equal(row.length, MAP_W);
  assert.ok(MAP_W >= 24 && MAP_H >= 12, "школа должна быть просторной");
});

test("периметр закрыт стенами", () => {
  for (let x = 0; x < MAP_W; x += 1) {
    assert.equal(MAP_ROWS[0][x], "#");
    assert.equal(MAP_ROWS[MAP_H - 1][x], "#");
  }
  for (let y = 0; y < MAP_H; y += 1) {
    assert.equal(MAP_ROWS[y][0], "#");
    assert.equal(MAP_ROWS[y][MAP_W - 1], "#");
  }
});

test("комнаты не пересекаются и отделены стенами", () => {
  const owner = new Map();
  for (const room of ROOMS) {
    for (const [x0, y0, x1, y1] of room.rects) {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const k = `${x},${y}`;
          assert.ok(!owner.has(k), `клетка ${k} принадлежит двум комнатам: ${room.id}`);
          owner.set(k, room.id);
        }
      }
    }
  }
  // Между разными комнатами должна быть хотя бы одна стена/дверь.
  for (const [k, id] of owner) {
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of DIRS) {
      const nk = `${x + dx},${y + dy}`;
      if (!owner.has(nk)) continue;
      if (owner.get(nk) === id) continue;
      const a = Math.min(id, owner.get(nk));
      const b = Math.max(id, owner.get(nk));
      assert.ok(
        ["corridor"].includes(a) || ["corridor", "hall"].includes(b),
        `комнаты ${a} и ${b} соприкасаются без стены`
      );
    }
  }
});

test("все точки достижимы от входа", () => {
  const reachable = flood(SPAWN_CELL);
  const points = [
    ...FUSE_CELLS.map((c) => ["щиток", c]),
    ...LOCKER_CELLS.map((c) => ["шкафчик", c]),
    ...NOTE_SPOTS.map((c) => ["записка", c]),
    ...BATTERY_SPOTS.map((c) => ["батарейка", c]),
    ...PATROL_CELLS.map((c) => ["патруль", c]),
    ...ROOMS.flatMap((r) =>
      r.rects.map(([x0, y0, x1, y1]) => ["комната " + r.id, { x: Math.floor((x0 + x1) / 2), y: Math.floor((y0 + y1) / 2) }])
    )
  ];
  for (const [name, cell] of points) {
    assert.ok(
      reachable.has(`${cell.x},${cell.y}`),
      `${name} в (${cell.x},${cell.y}) недостижим от входа`
    );
  }
});

test("все проходимые клетки принадлежат одной связной области", () => {
  const reachable = flood(SPAWN_CELL);
  let total = 0;
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      if (walkable(x, y)) total += 1;
    }
  }
  assert.equal(reachable.size, total, "есть изолированные карманы");
});

test("двери соединяют комнату и коридор", () => {
  for (const door of DOORS) {
    assert.ok(walkable(door.x, door.y), `дверь ${door.x},${door.y} не вырезана`);
    const horizontal = door.axis === "h";
    const sides = horizontal
      ? [
          { x: door.x, y: door.y - 1 },
          { x: door.x, y: door.y + 1 }
        ]
      : [
          { x: door.x - 1, y: door.y },
          { x: door.x + 1, y: door.y }
        ];
    for (const cell of sides) {
      assert.ok(
        walkable(cell.x, cell.y),
        `дверь ${door.x},${door.y} ведёт в стену (${cell.x},${cell.y})`
      );
    }
  }
});

test("дверные проёмы не слипаются", () => {
  const keys = new Set(DOORS.map((d) => `${d.x},${d.y}`));
  for (const door of DOORS) {
    for (const [dx, dy] of DIRS) {
      const k = `${door.x + dx},${door.y + dy}`;
      if (!keys.has(k)) continue;
      // Соседние двери допустимы только в одной стене (широкий проём).
      const other = DOORS.find((d) => d.x === door.x + dx && d.y === door.y + dy);
      assert.equal(other.axis, door.axis, "двери разных стен в соседних клетках");
    }
  }
});

test("щитки и записки висят на стене", () => {
  for (const item of [...FUSE_CELLS, ...NOTE_SPOTS, ...LOCKER_CELLS]) {
    assert.ok(walkable(item.x, item.y), `точка ${item.x},${item.y} внутри стены`);
    const normal = {
      north: [0, -1],
      south: [0, 1],
      west: [-1, 0],
      east: [1, 0]
    }[item.side];
    assert.ok(normal, `у точки ${item.x},${item.y} не задана сторона`);
    assert.ok(
      !walkable(item.x + normal[0], item.y + normal[1]),
      `за точкой ${item.x},${item.y} (${item.side}) нет стены`
    );
  }
});

test("точки не загораживают друг друга", () => {
  const all = [
    ...FUSE_CELLS.map((c) => ["щиток", c]),
    ...LOCKER_CELLS.map((c) => ["шкафчик", c]),
    ...NOTE_SPOTS.map((c) => ["записка", c]),
    ...BATTERY_SPOTS.map((c) => ["батарейка", c])
  ];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const [nameA, a] = all[i];
      const [nameB, b] = all[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d > 0.5, `${nameA} и ${nameB} в одной клетке`);
    }
  }
});

test("мировые координаты клеток совпадают с центрами", () => {
  const center = cellCenter({ x: 3, y: 4 });
  assert.equal(center.x, 3.5 * TILE);
  assert.equal(center.z, 4.5 * TILE);
  assert.deepEqual(cellAt(center.x, center.z), { x: 3, y: 4 });
});

test("арка в вестибюль не перекрыта", () => {
  for (const cell of HALL_OPENING) {
    assert.ok(walkable(cell.x, cell.y));
  }
});
