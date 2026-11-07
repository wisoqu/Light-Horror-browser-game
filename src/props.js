import * as THREE from "three";

/* ============================================================
   Школьная мебель и декор. Всё собирается из примитивов и
   склеивается в один меш на материал — сотни предметов обходятся
   в считанные draw calls.

   Локальная система координат каждого предмета:
     +Z — «лицо» (туда, куда смотрит доска, дверца, спинка);
     y = 0 — уровень пола.
   ============================================================ */

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 12, 10);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

export function mergeGeometries(list) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const geo of list) {
    vertexCount += geo.attributes.position.count;
    indexCount += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  let vOff = 0;
  let iOff = 0;
  for (const geo of list) {
    position.set(geo.attributes.position.array, vOff * 3);
    normal.set(geo.attributes.normal.array, vOff * 3);
    if (geo.attributes.uv) uv.set(geo.attributes.uv.array, vOff * 2);
    const gi = geo.index;
    if (gi) {
      for (let i = 0; i < gi.count; i += 1) index[iOff + i] = gi.array[i] + vOff;
      iOff += gi.count;
    } else {
      const n = geo.attributes.position.count;
      for (let i = 0; i < n; i += 1) index[iOff + i] = i + vOff;
      iOff += n;
    }
    vOff += geo.attributes.position.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(position, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}

export class Kit {
  constructor() {
    this.buckets = new Map();
    this.frame = new THREE.Matrix4();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  /** Начать систему координат предмета. */
  begin(x, z, ry = 0) {
    this.frame.makeRotationY(ry);
    this.frame.setPosition(x, 0, z);
    return this;
  }

  end() {
    this.frame.identity();
    return this;
  }

  add(key, baseGeo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    const geo = baseGeo.clone();
    this._e.set(rot[0], rot[1], rot[2]);
    this._q.setFromEuler(this._e);
    this._p.set(pos[0], pos[1], pos[2]);
    this._s.set(scale[0], scale[1], scale[2]);
    this._m.compose(this._p, this._q, this._s);
    this._m.premultiply(this.frame);
    geo.applyMatrix4(this._m);
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(geo);
    return this;
  }

  box(key, w, h, d, x, y, z, ry = 0) {
    return this.add(key, UNIT_BOX, { pos: [x, y, z], rot: [0, ry, 0], scale: [w, h, d] });
  }

  cyl(key, r, h, x, y, z, rx = 0, rz = 0) {
    return this.add(key, UNIT_CYL, { pos: [x, y, z], rot: [rx, 0, rz], scale: [r * 2, h, r * 2] });
  }

  sphere(key, r, x, y, z, sy = 1) {
    return this.add(key, UNIT_SPHERE, { pos: [x, y, z], scale: [r * 2, r * 2 * sy, r * 2] });
  }

  /** Плоскость, «лицом» в +Z. */
  plane(key, w, h, x, y, z, rx = 0, ry = 0) {
    return this.add(key, UNIT_PLANE, { pos: [x, y, z], rot: [rx, ry, 0], scale: [w, h, 1] });
  }

  isEmpty() {
    return this.buckets.size === 0;
  }

  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [key, geos] of this.buckets) {
      const material = materials[key];
      if (!material) continue;
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
      for (const geo of geos) geo.dispose();
    }
    this.buckets.clear();
    return group;
  }
}

/* ============================================================
   Предметы
   ============================================================ */

export function radiator(kit, x, z, ry, width = 1.4) {
  kit.begin(x, z, ry);
  kit.box("metal", width, 0.5, 0.14, 0, 0.55, 0.09);
  for (let i = 0; i < 8; i += 1) {
    kit.box("metal", 0.06, 0.46, 0.18, -width / 2 + 0.12 + (i * (width - 0.24)) / 7, 0.55, 0.1);
  }
  kit.cyl("metalDark", 0.03, 0.3, -width / 2 + 0.1, 0.25, 0.12);
  kit.cyl("metalDark", 0.03, 0.3, width / 2 - 0.1, 0.25, 0.12);
  return kit.end();
}

export function blackboard(kit, x, z, ry, width = 4.2) {
  kit.begin(x, z, ry);
  kit.box("woodDark", width + 0.16, 0.16, 0.09, 0, 1.62 - width * 0.0, 0.06);
  kit.box("woodDark", width + 0.16, 0.1, 0.09, 0, 2.62, 0.06);
  kit.box("board", width, 1.0, 0.04, 0, 2.1, 0.07);
  kit.box("woodDark", 0.12, 1.2, 0.1, -width / 2 - 0.02, 2.1, 0.07);
  kit.box("woodDark", 0.12, 1.2, 0.1, width / 2 + 0.02, 2.1, 0.07);
  // Лоток, мел, тряпка.
  kit.box("woodDark", width, 0.06, 0.16, 0, 1.58, 0.13);
  kit.box("chalk", 0.16, 0.02, 0.02, -width * 0.3, 1.62, 0.16);
  kit.box("chalk", 0.1, 0.02, 0.02, -width * 0.22, 1.62, 0.16);
  kit.box("fabric", 0.24, 0.02, 0.12, width * 0.35, 1.62, 0.16);
  return kit.end();
}

export function teacherTable(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("woodLight", 1.4, 0.06, 0.66, 0, 0.75, 0);
  kit.box("woodLight", 1.36, 0.62, 0.04, 0, 0.44, 0.28);
  kit.box("woodLight", 0.06, 0.72, 0.6, -0.66, 0.36, 0);
  kit.box("woodLight", 0.06, 0.72, 0.6, 0.66, 0.36, 0);
  // Журнал и стакан с карандашами — мелочь, которая делает кабинет жилым.
  kit.box("paper", 0.32, 0.03, 0.24, 0.1, 0.79, 0.05);
  kit.cyl("metal", 0.04, 0.1, -0.4, 0.82, -0.05);
  chair(kit, 0, -0.72, 0);
  return kit.end();
}

export function chair(kit, x, z, ry) {
  kit.box("woodLight", 0.44, 0.05, 0.42, x, 0.46, z, ry);
  kit.box("woodLight", 0.42, 0.5, 0.05, x, 0.72, z - 0.19, ry);
  kit.cyl("metal", 0.02, 0.44, x - 0.18, 0.22, z - 0.17);
  kit.cyl("metal", 0.02, 0.44, x + 0.18, 0.22, z - 0.17);
  kit.cyl("metal", 0.02, 0.44, x - 0.18, 0.22, z + 0.17);
  kit.cyl("metal", 0.02, 0.44, x + 0.18, 0.22, z + 0.17);
  return kit;
}

export function desk(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("woodLight", 1.4, 0.05, 0.62, 0, 0.74, 0);
  kit.box("woodLight", 1.36, 0.34, 0.03, 0, 0.56, 0.28);
  kit.cyl("metal", 0.022, 0.72, -0.62, 0.37, -0.24);
  kit.cyl("metal", 0.022, 0.72, 0.62, 0.37, -0.24);
  kit.cyl("metal", 0.022, 0.72, -0.62, 0.37, 0.24);
  kit.cyl("metal", 0.022, 0.72, 0.62, 0.37, 0.24);
  // Стул ученика — позади парты (в локальных -Z).
  chair(kit, 0, -0.62, 0);
  return kit.end();
}

export function cabinet(kit, x, z, ry, { width = 0.9, height = 2.0 } = {}) {
  kit.begin(x, z, ry);
  kit.box("woodDark", width, height, 0.42, 0, height / 2, 0.21);
  kit.box("woodLight", width - 0.08, height - 0.12, 0.02, 0, height / 2, 0.43);
  kit.box("metal", 0.02, 0.16, 0.03, -0.08, height / 2, 0.44);
  kit.box("metal", 0.02, 0.16, 0.03, 0.08, height / 2, 0.44);
  return kit.end();
}

export function shelf(kit, x, z, ry, { width = 1.2, height = 2.0, depth = 0.36, books = true } = {}) {
  kit.begin(x, z, ry);
  kit.box("woodDark", width, height, 0.04, 0, height / 2, 0.02);
  kit.box("woodDark", 0.05, height, depth, -width / 2, height / 2, depth / 2);
  kit.box("woodDark", 0.05, height, depth, width / 2, height / 2, depth / 2);
  const rows = 5;
  for (let i = 0; i <= rows; i += 1) {
    const y = 0.1 + (i * (height - 0.2)) / rows;
    kit.box("woodDark", width, 0.04, depth, 0, y, depth / 2);
    if (books && i < rows) {
      let cursor = -width / 2 + 0.08;
      const palette = ["fabric", "paintRed", "paintGreen", "paintBlue", "paintYellow", "paper"];
      while (cursor < width / 2 - 0.1) {
        const w = 0.03 + Math.random() * 0.05;
        const h = 0.18 + Math.random() * 0.1;
        kit.box(palette[Math.floor(Math.random() * palette.length)], w, h, 0.2, cursor + w / 2, y + h / 2 + 0.02, depth / 2 + 0.02);
        cursor += w + 0.006;
      }
    }
  }
  return kit.end();
}

export function computerDesk(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("woodLight", 1.3, 0.05, 0.66, 0, 0.74, 0);
  kit.box("woodLight", 0.05, 0.72, 0.6, -0.6, 0.36, 0);
  kit.box("woodLight", 0.05, 0.72, 0.6, 0.6, 0.36, 0);
  // Монитор: экран слабо светится в темноте.
  kit.box("metalDark", 0.46, 0.32, 0.04, 0, 1.02, -0.12);
  kit.plane("screen", 0.4, 0.26, 0, 1.02, -0.096);
  kit.box("metalDark", 0.06, 0.12, 0.06, 0, 0.84, -0.12);
  kit.box("plastic", 0.42, 0.03, 0.16, 0, 0.78, 0.1);
  kit.box("metalDark", 0.2, 0.42, 0.4, 0.52, 0.22, 0.05);
  chair(kit, 0, -0.7, 0);
  return kit.end();
}

export function labBench(kit, x, z, ry, width = 2.6) {
  kit.begin(x, z, ry);
  kit.box("woodLight", width, 0.06, 0.86, 0, 0.82, 0);
  kit.box("woodDark", width - 0.1, 0.7, 0.74, 0, 0.42, 0);
  // Мойка и кран.
  kit.box("metal", 0.5, 0.03, 0.44, width / 2 - 0.42, 0.85, 0.1);
  kit.cyl("metal", 0.02, 0.28, width / 2 - 0.42, 0.99, -0.08);
  kit.box("metal", 0.03, 0.03, 0.14, width / 2 - 0.42, 1.12, -0.02);
  // Штатив с пробирками.
  kit.cyl("metalDark", 0.03, 0.34, -width / 2 + 0.3, 0.99, -0.1);
  kit.cyl("glass", 0.03, 0.16, -width / 2 + 0.3, 1.0, 0.06);
  return kit.end();
}

export function fumeHood(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("metalDark", 1.4, 2.1, 0.6, 0, 1.05, 0.3);
  kit.box("glass", 1.2, 0.7, 0.03, 0, 1.5, 0.61);
  kit.box("metal", 1.44, 0.1, 0.66, 0, 2.14, 0.3);
  kit.box("metal", 0.3, 0.5, 0.02, 0, 1.5, 0.63);
  return kit.end();
}

export function canteenTable(kit, x, z, ry, { length = 2.6 } = {}) {
  kit.begin(x, z, ry);
  kit.box("woodLight", length, 0.06, 0.86, 0, 0.74, 0);
  kit.cyl("metal", 0.03, 0.72, -length / 2 + 0.2, 0.37, 0);
  kit.cyl("metal", 0.03, 0.72, length / 2 - 0.2, 0.37, 0);
  // Лавки с двух сторон.
  for (const side of [-1, 1]) {
    kit.box("woodLight", length, 0.05, 0.3, 0, 0.45, side * 0.72);
    kit.cyl("metal", 0.025, 0.44, -length / 2 + 0.3, 0.22, side * 0.72);
    kit.cyl("metal", 0.025, 0.44, length / 2 - 0.3, 0.22, side * 0.72);
  }
  // Поднос и стакан.
  kit.box("metal", 0.42, 0.015, 0.3, -0.2, 0.78, 0);
  kit.cyl("glass", 0.04, 0.11, 0.35, 0.79, 0.02);
  return kit.end();
}

export function counter(kit, x, z, ry, length = 3.4) {
  kit.begin(x, z, ry);
  kit.box("metal", length, 0.06, 0.94, 0, 0.95, 0);
  kit.box("metalDark", length, 0.9, 0.8, 0, 0.45, 0.04);
  kit.box("steel", length, 0.3, 0.03, 0, 1.25, 0.46);
  // Кастрюли и мармит.
  for (let i = -1; i <= 1; i += 1) {
    kit.cyl("steel", 0.22, 0.26, i * 0.9, 1.08, 0);
    kit.cyl("steel", 0.23, 0.04, i * 0.9, 1.23, 0);
  }
  return kit.end();
}

export function medicalBed(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("metal", 1.9, 0.06, 0.8, 0, 0.6, 0);
  kit.box("white", 1.84, 0.14, 0.74, 0, 0.7, 0);
  kit.box("white", 0.4, 0.1, 0.5, -0.66, 0.82, 0);
  kit.cyl("metal", 0.03, 0.58, -0.85, 0.3, -0.34);
  kit.cyl("metal", 0.03, 0.58, 0.85, 0.3, -0.34);
  kit.cyl("metal", 0.03, 0.58, -0.85, 0.3, 0.34);
  kit.cyl("metal", 0.03, 0.58, 0.85, 0.3, 0.34);
  return kit.end();
}

export function divider(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("fabric", 1.6, 1.7, 0.04, 0, 1.0, 0);
  kit.box("metal", 1.62, 0.03, 0.06, 0, 1.86, 0);
  kit.cyl("metal", 0.02, 0.2, -0.7, 0.1, 0);
  kit.cyl("metal", 0.02, 0.2, 0.7, 0.1, 0);
  return kit.end();
}

export function wallBars(kit, x, z, ry, { width = 2.6, height = 2.6 } = {}) {
  kit.begin(x, z, ry);
  kit.box("woodLight", 0.08, height, 0.06, -width / 2, height / 2, 0.03);
  kit.box("woodLight", 0.08, height, 0.06, width / 2, height / 2, 0.03);
  const rungs = 9;
  for (let i = 1; i <= rungs; i += 1) {
    kit.cyl("woodLight", 0.026, width, 0, (i * height) / (rungs + 1), 0.1, 0, Math.PI / 2);
  }
  return kit.end();
}

export function gymHorse(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("fabric", 1.4, 0.34, 0.5, 0, 1.0, 0);
  kit.box("woodDark", 1.3, 0.1, 0.44, 0, 0.8, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.cyl("metal", 0.035, 0.8, sx * 0.5, 0.4, sz * 0.16, sz * 0.12, sx * 0.1);
    }
  }
  return kit.end();
}

export function gymMat(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("fabric", 1.8, 0.12, 1.0, 0, 0.06, 0);
  kit.box("paintBlue", 1.82, 0.02, 1.02, 0, 0.13, 0);
  return kit.end();
}

export function bench(kit, x, z, ry, length = 1.6) {
  kit.begin(x, z, ry);
  kit.box("woodLight", length, 0.06, 0.42, 0, 0.45, 0);
  kit.box("woodLight", length, 0.3, 0.05, 0, 0.72, -0.2);
  kit.cyl("metal", 0.025, 0.44, -length / 2 + 0.15, 0.22, -0.14);
  kit.cyl("metal", 0.025, 0.44, length / 2 - 0.15, 0.22, -0.14);
  kit.cyl("metal", 0.025, 0.44, -length / 2 + 0.15, 0.22, 0.14);
  kit.cyl("metal", 0.025, 0.44, length / 2 - 0.15, 0.22, 0.14);
  return kit.end();
}

export function plant(kit, x, z, ry = 0) {
  kit.begin(x, z, ry);
  kit.cyl("pot", 0.22, 0.36, 0, 0.18, 0);
  kit.cyl("black", 0.19, 0.04, 0, 0.37, 0);
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + Math.random();
    const r = 0.12 + Math.random() * 0.16;
    const h = 0.5 + Math.random() * 0.7;
    kit.add("leaf", UNIT_PLANE, {
      pos: [Math.cos(a) * r * 0.5, 0.4 + h / 2, Math.sin(a) * r * 0.5],
      rot: [0.25 * Math.cos(a), -a, 0.2 * Math.sin(a)],
      scale: [0.16, h, 1]
    });
  }
  return kit.end();
}

export function bin(kit, x, z) {
  kit.begin(x, z, 0);
  kit.cyl("metalDark", 0.2, 0.5, 0, 0.25, 0);
  kit.cyl("black", 0.19, 0.03, 0, 0.5, 0);
  kit.box("paper", 0.16, 0.12, 0.16, 0.05, 0.52, 0.02);
  return kit.end();
}

export function clock(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.cyl("white", 0.19, 0.05, 0, 2.6, 0.03, Math.PI / 2, 0);
  kit.cyl("metalDark", 0.02, 0.02, -0.06, 2.68, 0.06, Math.PI / 2, 0);
  kit.cyl("metalDark", 0.016, 0.14, 0.02, 2.56, 0.06, Math.PI / 2, -0.5);
  kit.cyl("metalDark", 0.016, 0.1, 0.06, 2.6, 0.06, Math.PI / 2, 1.2);
  return kit.end();
}

export function noticeBoard(kit, x, z, ry, { width = 1.5, height = 1.1 } = {}) {
  kit.begin(x, z, ry);
  kit.box("woodDark", width + 0.08, height + 0.08, 0.05, 0, 1.6, 0.025);
  kit.plane("notice", width, height, 0, 1.6, 0.055);
  return kit.end();
}

export function poster(kit, x, z, ry, { width = 0.7, height = 0.95 } = {}) {
  kit.begin(x, z, ry);
  kit.plane("paper", width, height, 0, 1.75, 0.03);
  return kit.end();
}

export function extinguisher(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.cyl("paintRed", 0.11, 0.55, 0, 0.52, 0);
  kit.cyl("black", 0.05, 0.1, 0, 0.85, 0);
  kit.box("black", 0.03, 0.26, 0.03, 0, 0.9, 0.1);
  kit.box("metal", 0.1, 0.16, 0.02, 0, 1.2, 0.03);
  return kit.end();
}

export function coatRack(kit, x, z, ry, length = 3.2) {
  kit.begin(x, z, ry);
  kit.cyl("metal", 0.03, 1.75, -length / 2, 0.87, 0);
  kit.cyl("metal", 0.03, 1.75, length / 2, 0.87, 0);
  kit.cyl("metal", 0.03, length, 0, 1.74, 0, 0, Math.PI / 2);
  // Пальто и куртки — тёмные силуэты, которые в темноте легко принять за людей.
  const palette = ["uniform", "fabric", "paintBlue", "woodDark", "paintGreen"];
  for (let i = 0; i < 7; i += 1) {
    const cx = -length / 2 + 0.3 + (i * (length - 0.6)) / 6;
    const c = palette[i % palette.length];
    kit.box(c, 0.34, 0.9 + Math.random() * 0.2, 0.14, cx, 1.25, 0.02);
    kit.cyl("metal", 0.015, 0.06, cx, 1.76, 0);
  }
  return kit.end();
}

export function receptionDesk(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.box("woodDark", 1.8, 0.06, 0.7, 0, 0.78, 0);
  kit.box("woodDark", 1.74, 0.74, 0.06, 0, 0.38, 0.32);
  kit.box("woodDark", 0.06, 0.78, 0.66, -0.86, 0.4, 0);
  kit.box("woodDark", 0.06, 0.78, 0.66, 0.86, 0.4, 0);
  // Настольная лампа.
  kit.cyl("metalDark", 0.03, 0.28, -0.5, 0.95, -0.1);
  kit.add("lampGlow", UNIT_SPHERE, { pos: [-0.5, 1.12, -0.1], scale: [0.2, 0.16, 0.2] });
  kit.box("paper", 0.3, 0.02, 0.22, 0.3, 0.82, 0);
  return kit.end();
}

export function banner(kit, x, z, ry, { width = 4.2, height = 1.0 } = {}) {
  kit.begin(x, z, ry);
  kit.plane("banner", width, height, 0, 2.6, 0.03);
  kit.box("metal", width + 0.06, 0.04, 0.04, 0, 2.6 + height / 2 + 0.02, 0.03);
  return kit.end();
}

export function courtMarkings(kit, x, z, w, d) {
  kit.begin(x, z, 0);
  kit.box("chalk", w, 0.01, 0.06, 0, 0.012, -d / 2 + 0.4);
  kit.box("chalk", w, 0.01, 0.06, 0, 0.012, d / 2 - 0.4);
  kit.box("chalk", 0.06, 0.01, d, -w / 2 + 0.4, 0.012, 0);
  kit.box("chalk", 0.06, 0.01, d, w / 2 - 0.4, 0.012, 0);
  kit.box("chalk", w, 0.01, 0.06, 0, 0.012, 0);
  return kit.end();
}

export function shower(kit, x, z, ry) {
  kit.begin(x, z, ry);
  kit.cyl("metal", 0.02, 1.0, 0, 1.9, 0.06);
  kit.cyl("metal", 0.02, 0.18, 0.08, 2.4, 0.06, 0, Math.PI / 2);
  kit.cyl("metal", 0.09, 0.05, 0.16, 2.4, 0.06, Math.PI / 2, 0);
  kit.box("white", 0.5, 1.2, 0.04, 0, 1.6, -0.28);
  return kit.end();
}

export function ceilingLamp(kit, x, z, ry = 0) {
  kit.begin(x, z, ry);
  kit.box("metalDark", 1.2, 0.08, 0.36, 0, 3.2, 0);
  return kit.end();
}
