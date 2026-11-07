/* ============================================================
   ГИМНАЗИЯ № 42 — первый этаж (игровая интерпретация)
   ------------------------------------------------------------
   Реальное здание: Барнаул, Красноармейский пр-т, 133 —
   четырёхэтажная школа 1976 года постройки, профили: физико-
   математический, химико-биологический, гуманитарный, информатика.

   Здесь — первый этаж: вестибюль с гардеробом и вахтой, длинная
   рекреация, кабинеты по обе стороны, столовая, медпункт,
   электрощитовая, библиотека и спортивный блок с раздевалками.

   Файл содержит ТОЛЬКО данные: сетку, комнаты, точки интереса.
   Никакой игровой логики здесь нет. Карта собирается кодом
   (прямоугольники + двери), чтобы её нельзя было «сломать» одной
   опечаткой в ASCII-арте.

   Контракт для других модулей:
     MAP_ROWS[y][x] === "#" — стена, "." — проходимая клетка.
   ============================================================ */

export const TILE = 2.2;
export const WALL_H = 3.35;

export const MAP_W = 38;
export const MAP_H = 16;

/* --------------------------- комнаты ---------------------------
   rects  — прямоугольники [x0, y0, x1, y1] (включительно, в клетках)
   type   — тип для расстановки мебели
   floor  — ключ материала пола
   wall   — ключ материала стен
   window — сторона света с окнами: "north" | "south" | null
   --------------------------------------------------------------- */

export const ROOMS = [
  {
    id: "corridor",
    name: "Рекреация",
    type: "corridor",
    rects: [[1, 7, 30, 8]],
    floor: "linoleum",
    wall: "corridor"
  },
  {
    id: "hall",
    name: "Вестибюль",
    type: "hall",
    rects: [[16, 10, 23, 14]],
    floor: "marble",
    wall: "hall",
    window: "south"
  },

  /* ------------------------- северное крыло ------------------------- */
  { id: "physics", name: "Кабинет физики", number: "101", type: "lab", subject: "Физика", rects: [[1, 1, 5, 5]], floor: "parquet", wall: "classroom", window: "north" },
  { id: "chemistry", name: "Кабинет химии", number: "102", type: "lab", subject: "Химия", rects: [[7, 1, 11, 5]], floor: "parquet", wall: "classroom", window: "north" },
  { id: "biology", name: "Кабинет биологии", number: "103", type: "classroom", subject: "Биология", rects: [[13, 1, 17, 5]], floor: "parquet", wall: "classroom", window: "north" },
  { id: "math", name: "Кабинет математики", number: "104", type: "classroom", subject: "Математика", rects: [[19, 1, 23, 5]], floor: "parquet", wall: "classroom", window: "north" },
  { id: "informatics", name: "Кабинет информатики", number: "105", type: "computer", subject: "Информатика", rects: [[25, 1, 29, 5]], floor: "parquet", wall: "classroom", window: "north" },

  /* ------------------------- южное крыло ------------------------- */
  { id: "canteen", name: "Столовая", type: "canteen", rects: [[1, 10, 5, 14]], floor: "tile", wall: "canteen", window: "south" },
  { id: "medical", name: "Медпункт", type: "medical", rects: [[7, 10, 11, 14]], floor: "tile", wall: "medical", window: "south" },
  { id: "electrical", name: "Электрощитовая", type: "electrical", rects: [[13, 10, 14, 14]], floor: "concrete", wall: "tech", window: null },
  { id: "library", name: "Библиотека", type: "library", rects: [[25, 10, 29, 14]], floor: "parquet", wall: "library", window: "south" },

  /* ------------------------- спортивный блок ------------------------- */
  { id: "gym", name: "Спортзал", type: "gym", rects: [[32, 1, 36, 9]], floor: "gymfloor", wall: "gym", window: "north" },
  { id: "lockerA", name: "Раздевалка", type: "locker", rects: [[32, 11, 33, 14]], floor: "tile", wall: "gym", window: null },
  { id: "lockerB", name: "Душевая", type: "locker", rects: [[35, 11, 36, 14]], floor: "tile", wall: "gym", window: null }
];

/* ---------------------------- двери ----------------------------
   Дверь вырезается в клетке стены (x, y).
   axis: "h" — стена идёт вдоль X, "v" — вдоль Z.
   room: id комнаты, в которую ведёт дверь.
   side: с какой стороны от двери находится комната ("north"|"south"|"east"|"west").
   label: надпись на табличке.
   --------------------------------------------------------------- */

export const DOORS = [
  { x: 3, y: 6, axis: "h", side: "north", room: "physics", label: "101  Физика" },
  { x: 9, y: 6, axis: "h", side: "north", room: "chemistry", label: "102  Химия" },
  { x: 15, y: 6, axis: "h", side: "north", room: "biology", label: "103  Биология" },
  { x: 21, y: 6, axis: "h", side: "north", room: "math", label: "104  Математика" },
  { x: 27, y: 6, axis: "h", side: "north", room: "informatics", label: "105  Информатика" },

  { x: 3, y: 9, axis: "h", side: "south", room: "canteen", label: "Столовая" },
  { x: 9, y: 9, axis: "h", side: "south", room: "medical", label: "Медпункт" },
  { x: 13, y: 9, axis: "h", side: "south", room: "electrical", label: "Щитовая" },
  { x: 27, y: 9, axis: "h", side: "south", room: "library", label: "Библиотека" },

  { x: 31, y: 8, axis: "v", side: "east", room: "gym", label: "Спортзал" },

  // Проходные двери между помещениями: дают круговые маршруты, а не тупики.
  { x: 24, y: 13, axis: "v", side: "east", room: "library", label: "Библиотека" },
  { x: 34, y: 12, axis: "v", side: "east", room: "lockerB", label: "" },
  { x: 32, y: 10, axis: "h", side: "south", room: "lockerA", label: "" },
  { x: 35, y: 10, axis: "h", side: "south", room: "lockerB", label: "Душ" }
];

/** Широкий проём из рекреации в вестибюль (без двери). */
export const HALL_OPENING = [
  { x: 17, y: 9 },
  { x: 18, y: 9 },
  { x: 19, y: 9 },
  { x: 20, y: 9 },
  { x: 21, y: 9 },
  { x: 22, y: 9 }
];

/* --------------------------- сетка --------------------------- */

const grid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill("#"));

function carve(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) grid[y][x] = ".";
    }
  }
}

for (const room of ROOMS) {
  for (const [x0, y0, x1, y1] of room.rects) carve(x0, y0, x1, y1);
}
for (const door of DOORS) grid[door.y][door.x] = ".";
for (const cell of HALL_OPENING) grid[cell.y][cell.x] = ".";

export const MAP_ROWS = grid.map((row) => row.join(""));

/* --------------------- принадлежность клеток --------------------- */

/** id комнаты для каждой клетки (null — стена). */
export const ROOM_INDEX = grid.map((row) => row.map(() => null));

for (const room of ROOMS) {
  for (const [x0, y0, x1, y1] of room.rects) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) ROOM_INDEX[y][x] = room.id;
    }
  }
}
// Дверные проёмы и арка в вестибюль — «коридорные» клетки.
for (const door of DOORS) ROOM_INDEX[door.y][door.x] = "corridor";
for (const cell of HALL_OPENING) ROOM_INDEX[cell.y][cell.x] = "hall";

export function roomAtCell(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return ROOM_INDEX[y][x];
}

export function roomById(id) {
  return ROOMS.find((r) => r.id === id) || null;
}

/* --------------------------- точки --------------------------- */

export const SPAWN_CELL = { x: 19, y: 14 };
export const EXIT_CELL = { x: 19, y: 14 };

/** Четыре щитка: электрощитовая, спортзал, пищеблок, главный рубильник. */
export const FUSE_CELLS = [
  { x: 13, y: 12, side: "west", label: "щитовая у медпункта" },
  { x: 36, y: 5, side: "east", label: "спортзал" },
  { x: 1, y: 12, side: "west", label: "пищеблок столовой" },
  { x: 23, y: 11, side: "east", label: "главный рубильник в вестибюле" }
];

/** Шкафчики: гардероб, рекреация, две раздевалки. */
export const LOCKER_CELLS = [
  { x: 16, y: 12, side: "west" },
  { x: 2, y: 7, side: "north" },
  { x: 32, y: 12, side: "west" },
  { x: 36, y: 12, side: "east" },
  // Рекреация: шкафчики по обе стороны, между дверями кабинетов.
  { x: 6, y: 7, side: "north" },
  { x: 12, y: 7, side: "north" },
  { x: 24, y: 7, side: "north" },
  { x: 6, y: 8, side: "south" },
  { x: 16, y: 8, side: "south" },
  { x: 24, y: 8, side: "south" },
  // Спортзал, вестибюль и библиотека.
  { x: 36, y: 4, side: "east" },
  { x: 32, y: 3, side: "west" },
  { x: 16, y: 11, side: "west" },
  { x: 1, y: 13, side: "west" },
  { x: 29, y: 13, side: "east" }
];

/** Маршрут дежурной: рекреация — вестибюль — столовая. */
export const PATROL_CELLS = [
  // Старт — дальний западный конец рекреации: до входа в вестибюль
  // ей идти полшколы, игрок не встречает её на первых секундах.
  { x: 3, y: 8 },
  { x: 3, y: 12 },
  { x: 10, y: 8 },
  { x: 19, y: 8 },
  { x: 19, y: 13 },
  { x: 27, y: 8 },
  { x: 30, y: 8 },
  { x: 27, y: 8 },
  { x: 19, y: 8 },
  { x: 9, y: 8 }
];

/** Пять записок с лором — по одной в разных крыльях школы. */
export const NOTE_SPOTS = [
  { x: 1, y: 4, side: "west" },
  { x: 17, y: 7, side: "north" },
  { x: 23, y: 5, side: "south" },
  { x: 11, y: 12, side: "east" },
  { x: 29, y: 12, side: "east" }
];

export const BATTERY_SPOTS = [
  { x: 5, y: 14 },
  { x: 34, y: 3 },
  { x: 28, y: 13 },
  { x: 13, y: 8 }
];

/* --------------------- вспомогательное --------------------- */


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
