import * as THREE from "three";

/* ============================================================
   Материалы школы. Всё процедурное: ни одного файла-текстуры.
   Один материал = один слой реальности: краска, линолеум,
   паркет, плитка, мел, металл, стекло.

   Экспортируется словарь материалов. Ключи — контракт для
   props.js и world.js: добавляешь новый ключ — добавь материал.
   ============================================================ */

function tex(w, h, draw, { repeat = [1, 1] } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  draw(g, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  return texture;
}

function speckle(g, w, h, count, color, maxR, alpha = 0.1) {
  for (let i = 0; i < count; i += 1) {
    g.fillStyle = color;
    g.globalAlpha = alpha * (0.3 + Math.random() * 0.7);
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 0.5 + Math.random() * maxR, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function grime(g, w, h, count, alpha = 0.12) {
  for (let i = 0; i < count; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 8 + Math.random() * 40;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(20, 18, 14, ${alpha})`);
    grad.addColorStop(1, "rgba(20, 18, 14, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}


/* ----------------------- старение поверхностей ----------------------- */

/** Неровное пятно: скол краски, выступившая штукатурка, замена плитки. */
function blot(g, w, h, cx, cy, r, fill, edge, alpha = 0.9, squash = 0.85) {
  const n = 9 + Math.floor(Math.random() * 6);
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.55 + Math.random() * 0.8);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * squash]);
  }
  const copies = r > 14
    ? [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h], [-w, -h], [w, h], [-w, h], [w, -h]]
    : [[0, 0]];
  for (const [ox, oy] of copies) {
    const x0 = cx + ox;
    const y0 = cy + oy;
    if (x0 < -r * 2 || x0 > w + r * 2 || y0 < -r * 2 || y0 > h + r * 2) continue;
    g.beginPath();
    g.moveTo(x0 + pts[0][0], y0 + pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) g.lineTo(x0 + pts[i][0], y0 + pts[i][1]);
    g.closePath();
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    g.fill();
    if (edge) {
      g.globalAlpha = 1;
      g.strokeStyle = edge;
      g.lineWidth = 1.2;
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}

/** Облупившаяся краска: пятна штукатурки, сконцентрированные у панели и углов. */
function peeling(g, w, h, { plaster, edge, count = 9, maxR = 34, top = 0.15, bottom = 0.9 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const cx = Math.random() * w;
    const bias = Math.random() < 0.55 ? 0.75 + Math.random() * 0.25 : Math.random();
    const cy = h * (top + (bottom - top) * bias);
    const r = 6 + Math.random() * maxR;
    blot(g, w, h, cx, cy, r, plaster, edge, 0.28 + Math.random() * 0.3);
    // Крошки по краю.
    for (let k = 0; k < 6; k += 1) {
      g.globalAlpha = 0.25 + Math.random() * 0.4;
      g.fillStyle = plaster;
      g.beginPath();
      g.arc(cx + (Math.random() - 0.5) * r * 2.2, cy + (Math.random() - 0.5) * r * 1.8, 0.8 + Math.random() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

/** Ветвящаяся трещина. */
function crack(g, x, y, angle, len, depth, alpha = 0.3) {
  let cx = x;
  let cy = y;
  let a = angle;
  g.beginPath();
  g.moveTo(cx, cy);
  const steps = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < steps; i += 1) {
    a += (Math.random() - 0.5) * 0.7;
    const l = len / steps;
    cx += Math.cos(a) * l;
    cy += Math.sin(a) * l;
    g.lineTo(cx, cy);
  }
  g.strokeStyle = `rgba(26, 24, 20, ${alpha})`;
  g.lineWidth = 1 + (depth > 0 ? 0.4 : 0);
  g.stroke();
  if (depth > 0) {
    crack(g, cx, cy, a + 0.6, len * 0.55, depth - 1, alpha * 0.85);
    crack(g, cx, cy, a - 0.5, len * 0.5, depth - 1, alpha * 0.85);
  }
}

/** Потёки от протечек: сверху вниз, ржаво-бурые. */
function streaks(g, w, h, count = 5, from = 0) {
  for (let i = 0; i < count; i += 1) {
    const x = Math.random() * w;
    const lenH = h * (0.15 + Math.random() * 0.5);
    const wd = 2 + Math.random() * 9;
    const grad = g.createLinearGradient(x, from, x, from + lenH);
    grad.addColorStop(0, `rgba(74, 58, 34, ${0.1 + Math.random() * 0.14})`);
    grad.addColorStop(0.7, "rgba(74, 58, 34, 0.05)");
    grad.addColorStop(1, "rgba(74, 58, 34, 0)");
    g.fillStyle = grad;
    g.fillRect(x, from, wd, lenH);
  }
}

/** Тёмная грязь у пола и по кромкам. */
function edgeDirt(g, w, h, height = 60, alpha = 0.3) {
  const grad = g.createLinearGradient(0, h - height, 0, h);
  grad.addColorStop(0, "rgba(18, 16, 12, 0)");
  grad.addColorStop(1, `rgba(18, 16, 12, ${alpha})`);
  g.fillStyle = grad;
  g.fillRect(0, h - height, w, height);
}

/** Тёплый налёт старости поверх всего. */
function agedTint(g, w, h, alpha = 0.1) {
  g.globalAlpha = alpha;
  g.fillStyle = "#7a6640";
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
}

/** Затёртости пола: каблуки, волочение мебели, сколы. */
function floorWear(g, w, h, { scuffs = 40, cracks = 6 } = {}) {
  for (let i = 0; i < scuffs; i += 1) {
    g.globalAlpha = 0.05 + Math.random() * 0.13;
    g.fillStyle = Math.random() < 0.6 ? "#1a1814" : "#cfc7b2";
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 10 + Math.random() * 70;
    g.save();
    g.translate(x, y);
    g.rotate((Math.random() - 0.5) * 0.9);
    g.fillRect(0, 0, len, 0.8 + Math.random() * 1.6);
    g.restore();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < cracks; i += 1) {
    crack(g, Math.random() * w, Math.random() * h, Math.random() * Math.PI * 2, 30 + Math.random() * 60, 1, 0.16);
  }
  grime(g, w, h, 26, 0.2);
}

/* --------------------------- стены --------------------------- */

/**
 * Стена школы: штукатурка сверху, масляная панель снизу, плинтус.
 * panel — доля высоты под панель (0.36 ≈ 1.2 м при высоте 3.35 м).
 */
function wallTex({ upper, lower, panel = 0.36, tiles = 0, trim = "#2b2b26", wear = 1 }) {
  return tex(256, 512, (g, w, h) => {
    g.fillStyle = upper;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 700, "#6f6754", 2.6, 0.1);
    speckle(g, w, h, 220, "#2c2a22", 3.4, 0.06);

    // Стена пожила: тёплый налёт, потёки, трещины, облупившаяся краска.
    agedTint(g, w, h, 0.12);
    streaks(g, w, h, 6 + Math.floor(wear * 4));
    for (let i = 0; i < 3 + wear * 2; i += 1) {
      crack(g, Math.random() * w, Math.random() * h * 0.16, Math.PI * (0.4 + Math.random() * 0.2), 60 + Math.random() * 120, 2, 0.24);
    }
    peeling(g, w, h, {
      plaster: `#${new THREE.Color(upper).lerp(new THREE.Color("#a9a493"), 0.22).getHexString()}`,
      edge: "rgba(58, 50, 38, 0.32)",
      count: 5 + Math.floor(wear * 4),
      maxR: 15,
      top: 0.05,
      bottom: 0.62
    });

    // Потёртости и потёки сверху.
    grime(g, w, h, 20, 0.14);
    for (let i = 0; i < 7; i += 1) {
      g.fillStyle = `rgba(70, 64, 52, ${0.04 * wear})`;
      g.fillRect(0, Math.random() * h * 0.5, w, 2 + Math.random() * 5);
    }

    const panelTop = h * (1 - panel);

    if (tiles > 0) {
      // Кафель до панели: мелкая плитка 15×15 см.
      const tileH = (h - panelTop) / tiles;
      for (let row = 0; row < tiles; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const shade = 0.9 + Math.random() * 0.12;
          const c = new THREE.Color(lower).multiplyScalar(shade);
          g.fillStyle = `#${c.getHexString()}`;
          g.fillRect(col * (w / 3) + 1, panelTop + row * tileH + 1, w / 3 - 2, tileH - 2);
        }
      }
      g.fillStyle = "rgba(40, 46, 42, 0.35)";
      g.fillRect(0, panelTop, w, 3);
    }

    g.fillStyle = lower;
    g.fillRect(0, panelTop, w, h - panelTop);
    speckle(g, w, panelTop * 0.9, 420, "#1e2a20", 2.4, 0.11);
    // Панель облезает у плинтуса и на углах — там, где её били ногами.
    peeling(g, w, h, {
      plaster: `#${new THREE.Color(lower).lerp(new THREE.Color("#8e8978"), 0.28).getHexString()}`,
      edge: "rgba(26, 22, 16, 0.38)",
      count: 4 + Math.floor(wear * 3),
      maxR: 12,
      top: 1 - panel * 0.85,
      bottom: 0.99
    });
    edgeDirt(g, w, h, 46, 0.32);

    // Блик по верхней кромке панели.
    g.fillStyle = "rgba(255, 255, 240, 0.12)";
    g.fillRect(0, panelTop, w, 2);

    // Плинтус.
    g.fillStyle = trim;
    g.fillRect(0, h - 22, w, 22);
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fillRect(0, h - 22, w, 2);

    // Каракули шариковой ручкой на панели — школа, а не декорация.
    for (let i = 0; i < 5; i += 1) {
      const sx = Math.random() * w;
      const sy = panelTop + 8 + Math.random() * (h - panelTop - 26);
      g.strokeStyle = `rgba(18, 18, 20, ${0.14 + Math.random() * 0.16})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(sx, sy);
      let px = sx;
      let py = sy;
      for (let k = 0; k < 6; k += 1) {
        px += (Math.random() - 0.3) * 12;
        py += (Math.random() - 0.5) * 8;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    // Потёртости у дверных ручек.
    for (let i = 0; i < 3; i += 1) {
      blot(g, w, h, Math.random() * w, panelTop + (h - panelTop) * (0.3 + Math.random() * 0.3), 7 + Math.random() * 8, "#101410", null, 0.16);
    }

    // Царапины и следы от стульев.
    for (let i = 0; i < 40 * wear; i += 1) {
      g.fillStyle = `rgba(18, 18, 16, ${0.04 + Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, panelTop + Math.random() * (h - panelTop), 2 + Math.random() * 26, 1 + Math.random() * 3);
    }
    // Мелкие трещины.
    g.strokeStyle = "rgba(60, 54, 44, 0.22)";
    g.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      let x = Math.random() * w;
      let y = Math.random() * panelTop;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s += 1) {
        x += (Math.random() - 0.5) * 24;
        y += 8 + Math.random() * 18;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/* --------------------------- полы --------------------------- */

function linoleumTex() {
  return tex(512, 512, (g, w, h) => {
    g.fillStyle = "#6b6a5f";
    g.fillRect(0, 0, w, h);
    const cell = 128;
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const v = 0.94 + Math.random() * 0.1;
        const c = new THREE.Color(0x6b6a5f).multiplyScalar(v);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    g.strokeStyle = "rgba(30, 30, 26, 0.55)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath();
      g.moveTo(i * cell, 0);
      g.lineTo(i * cell, h);
      g.moveTo(0, i * cell);
      g.lineTo(w, i * cell);
      g.stroke();
    }
    // Мраморная крошка в линолеуме.
    speckle(g, w, h, 2600, "#3c3b35", 1.4, 0.16);
    speckle(g, w, h, 900, "#b9b3a2", 1.2, 0.14);
    floorWear(g, w, h, { scuffs: 55, cracks: 5 });
    // Отставшие и залитые клеем кромки листов.
    for (let i = 0; i < 6; i += 1) {
      blot(g, w, h, Math.random() * w, (Math.floor(Math.random() * 4) + 0.5) * cell, 5 + Math.random() * 10, "#2f2e28", null, 0.4);
    }
    // Затёртая дорожка по центру.
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(200, 195, 180, 0)");
    grad.addColorStop(0.5, "rgba(200, 195, 180, 0.08)");
    grad.addColorStop(1, "rgba(200, 195, 180, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function parquetTex() {
  return tex(512, 512, (g, w, h) => {
    g.fillStyle = "#4a3826";
    g.fillRect(0, 0, w, h);
    const plankW = 64;
    const plankH = 170;
    for (let y = -plankH; y < h + plankH; y += 44) {
      for (let x = -plankW; x < w + plankW; x += plankW * 2) {
        const offset = ((Math.floor(y / 44) % 2) * plankW) / 2;
        const shade = 0.82 + Math.random() * 0.28;
        const c = new THREE.Color(0x8a6034).multiplyScalar(shade);
        g.save();
        g.translate(x + offset, y);
        g.rotate(Math.PI / 4);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(0, 0, plankW * 0.9, plankH * 0.24);
        g.strokeStyle = "rgba(30, 20, 12, 0.5)";
        g.lineWidth = 1;
        g.strokeRect(0, 0, plankW * 0.9, plankH * 0.24);
        g.restore();
      }
    }
    speckle(g, w, h, 1100, "#241a10", 1.4, 0.14);
    // Выщербленные планки.
    for (let i = 0; i < 4; i += 1) {
      blot(g, w, h, Math.random() * w, Math.random() * h, 8 + Math.random() * 20, "rgba(52, 38, 24, 0.75)", null, 0.75);
    }
    floorWear(g, w, h, { scuffs: 45, cracks: 4 });
    // Лак.
    g.fillStyle = "rgba(255, 230, 180, 0.04)";
    g.fillRect(0, 0, w, h);
  });
}

function tileFloorTex({ a = "#d8d4c6", b = "#a8b2a4", count = 6 } = {}) {
  return tex(512, 512, (g, w, h) => {
    const s = w / count;
    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        g.fillStyle = (x + y) % 2 === 0 ? a : b;
        g.fillRect(x * s, y * s, s, s);
        g.fillStyle = "rgba(255,255,255,0.05)";
        g.fillRect(x * s, y * s, s, 2);
      }
    }
    g.strokeStyle = "rgba(60, 58, 50, 0.45)";
    g.lineWidth = 2;
    for (let i = 0; i <= count; i += 1) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, h);
      g.moveTo(0, i * s);
      g.lineTo(w, i * s);
      g.stroke();
    }
    // Затирка потемнела, часть плиток заменили — они другого оттенка.
    g.globalAlpha = 0.35;
    g.strokeStyle = "#3a382f";
    g.lineWidth = 3;
    for (let i = 0; i <= count; i += 1) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, h);
      g.moveTo(0, i * s);
      g.lineTo(w, i * s);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 3; i += 1) {
      const tx = Math.floor(Math.random() * count) * s;
      const ty = Math.floor(Math.random() * count) * s;
      g.globalAlpha = 0.5;
      g.fillStyle = "#b9b3a0";
      g.fillRect(tx + 2, ty + 2, s - 4, s - 4);
      g.globalAlpha = 1;
    }
    floorWear(g, w, h, { scuffs: 40, cracks: 5 });
    speckle(g, w, h, 1400, "#2e2c26", 1.2, 0.1);
  });
}

function gymFloorTex() {
  return tex(512, 512, (g, w, h) => {
    g.fillStyle = "#4f5347";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) {
      const shade = 0.8 + Math.random() * 0.24;
      const c = new THREE.Color(0x6b6d5a).multiplyScalar(shade);
      g.fillStyle = `#${c.getHexString()}`;
      g.fillRect(0, y, w, 40);
      g.strokeStyle = "rgba(48, 30, 16, 0.5)";
      g.strokeRect(0, y, w, 40);
      for (let x = 0; x < w; x += 180) {
        g.fillStyle = "rgba(40, 26, 14, 0.35)";
        g.fillRect(x + Math.random() * 40, y, 2, 40);
      }
    }
    speckle(g, w, h, 1200, "#2c2e26", 1.4, 0.14);
    // Стёртый лак и протоптанные дорожки.
    floorWear(g, w, h, { scuffs: 70, cracks: 4 });
    g.globalAlpha = 0.1;
    g.fillStyle = "#d8d2b8";
    g.fillRect(0, h * 0.46, w, 3);
    g.fillRect(0, h * 0.54, w, 3);
    g.globalAlpha = 1;
  });
}

function concreteTex() {
  return tex(256, 256, (g, w, h) => {
    g.fillStyle = "#5b5b58";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1600, "#3a3a38", 1.6, 0.16);
    speckle(g, w, h, 700, "#8a8a84", 1.4, 0.1);
    grime(g, w, h, 26, 0.22);
    streaks(g, w, h, 3);
    for (let i = 0; i < 5; i += 1) {
      g.strokeStyle = "rgba(24,24,22,0.28)";
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s += 1) {
        x += (Math.random() - 0.5) * 50;
        y += (Math.random() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

function marbleTex() {
  return tex(512, 512, (g, w, h) => {
    const s = 256;
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        const shade = 0.9 + Math.random() * 0.14;
        const c = new THREE.Color(0x9c968a).multiplyScalar(shade);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(x * s, y * s, s, s);
      }
    }
    // Прожилки.
    for (let i = 0; i < 18; i += 1) {
      g.strokeStyle = `rgba(60, 58, 52, ${0.06 + Math.random() * 0.12})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.moveTo(x, y);
      for (let s2 = 0; s2 < 6; s2 += 1) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = "rgba(40, 40, 36, 0.5)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, s, s);
    g.strokeRect(s, 0, s, s);
    g.strokeRect(0, s, s, s);
    g.strokeRect(s, s, s, s);
    grime(g, w, h, 16, 0.08);
  });
}

function ceilingTex() {
  return tex(512, 512, (g, w, h) => {
    g.fillStyle = "#b9b7ac";
    g.fillRect(0, 0, w, h);
    const s = 128;
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const shade = 0.93 + Math.random() * 0.1;
        const c = new THREE.Color(0xbdbbb0).multiplyScalar(shade);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
        // Перфорация.
        g.fillStyle = "rgba(90, 88, 80, 0.35)";
        for (let py = 0; py < 6; py += 1) {
          for (let px = 0; px < 6; px += 1) {
            g.beginPath();
            g.arc(x * s + 16 + px * 18, y * s + 16 + py * 18, 1.4, 0, Math.PI * 2);
            g.fill();
          }
        }
        // Ржавые разводы.
        if (Math.random() < 0.35) {
          const cx = x * s + 20 + Math.random() * (s - 40);
          const cy = y * s + 20 + Math.random() * (s - 40);
          const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 30);
          grad.addColorStop(0, "rgba(112, 82, 40, 0.22)");
          grad.addColorStop(1, "rgba(112, 82, 40, 0)");
          g.fillStyle = grad;
          g.beginPath();
          g.arc(cx, cy, 30, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.strokeStyle = "rgba(70, 68, 60, 0.55)";
    g.lineWidth = 4;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, h);
      g.moveTo(0, i * s);
      g.lineTo(w, i * s);
      g.stroke();
    }
    grime(g, w, h, 20, 0.1);
    // Потолок тоже пожил: протечки, жёлтые разводы, трещины по швам.
    agedTint(g, w, h, 0.16);
    streaks(g, w, h, 4);
    for (let i = 0; i < 3; i += 1) {
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      const r = 30 + Math.random() * 70;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(96, 78, 44, 0.22)");
      grad.addColorStop(0.6, "rgba(96, 78, 44, 0.1)");
      grad.addColorStop(1, "rgba(96, 78, 44, 0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(88, 70, 38, 0.16)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 4; i += 1) {
      crack(g, Math.random() * w, Math.random() * h, Math.random() * Math.PI, 40 + Math.random() * 90, 1, 0.18);
    }
    grime(g, w, h, 14, 0.12);
  });
}

/* --------------------------- мебель --------------------------- */

function woodTex({ base = 0x6b4a2a, grain = 0.16, planks = 0 } = {}) {
  return tex(256, 256, (g, w, h) => {
    const c = new THREE.Color(base);
    g.fillStyle = `#${c.getHexString()}`;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i += 1) {
      const shade = 0.7 + Math.random() * 0.5;
      const cc = c.clone().multiplyScalar(shade);
      g.strokeStyle = `rgba(${Math.round(cc.r * 255)}, ${Math.round(cc.g * 255)}, ${Math.round(cc.b * 255)}, ${grain})`;
      g.lineWidth = 0.6 + Math.random() * 2;
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
      g.stroke();
    }
    if (planks) {
      g.strokeStyle = "rgba(24, 16, 8, 0.45)";
      g.lineWidth = 2;
      for (let y = 0; y < h; y += h / planks) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
    }
    grime(g, w, h, 8, 0.12);
  });
}

function metalTex(base = 0x5a6064, brushed = true) {
  return tex(128, 128, (g, w, h) => {
    const c = new THREE.Color(base);
    g.fillStyle = `#${c.getHexString()}`;
    g.fillRect(0, 0, w, h);
    if (brushed) {
      for (let i = 0; i < 220; i += 1) {
        g.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.06})`;
        g.beginPath();
        const y = Math.random() * h;
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
    }
    grime(g, w, h, 6, 0.16);
  });
}

function boardTex() {
  return tex(512, 256, (g, w, h) => {
    g.fillStyle = "#20352b";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, "#0e1a14", 1.6, 0.18);
    // Стёртые меловые следы.
    for (let i = 0; i < 24; i += 1) {
      g.strokeStyle = `rgba(220, 226, 214, ${0.02 + Math.random() * 0.05})`;
      g.lineWidth = 1 + Math.random() * 8;
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(Math.random() * w, y);
      g.lineTo(Math.random() * w, y + (Math.random() - 0.5) * 30);
      g.stroke();
    }
    // Остатки мела в лотке.
    g.fillStyle = "#d9d6c6";
    g.fillRect(w * 0.1, h - 6, 14, 4);
    g.fillRect(w * 0.75, h - 6, 22, 4);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, h - 14, w, 14);
  });
}

function paperTex() {
  return tex(256, 256, (g, w, h) => {
    g.fillStyle = "#cfc6a8";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 22; i += 1) {
      g.fillStyle = `rgba(52, 46, 36, ${0.45 + Math.random() * 0.35})`;
      g.fillRect(18, 26 + i * 9, 30 + Math.random() * 150, 2.4);
    }
    g.fillStyle = "rgba(120, 30, 26, 0.7)";
    g.fillRect(18, 12, w - 36, 5);
    speckle(g, w, h, 120, "#8a8064", 1.4, 0.2);
  });
}

function noticeTex() {
  return tex(256, 320, (g, w, h) => {
    g.fillStyle = "#6b5a3c";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#c9c0a6";
    g.fillRect(10, 10, w - 20, h - 20);
    g.fillStyle = "#8a2a22";
    g.fillRect(10, 10, w - 20, 26);
    g.fillStyle = "#e6ddc2";
    g.font = "bold 15px Arial";
    g.fillText("РАСПИСАНИЕ", 24, 30);
    for (let i = 0; i < 9; i += 1) {
      g.fillStyle = `rgba(40, 36, 30, ${0.4 + Math.random() * 0.3})`;
      g.fillRect(20, 48 + i * 26, 70 + Math.random() * 120, 4);
    }
    for (let i = 0; i < 3; i += 1) {
      g.fillStyle = "rgba(250, 246, 226, 0.92)";
      const x = 18 + Math.random() * 150;
      const y = 40 + Math.random() * 220;
      const pw = 50 + Math.random() * 50;
      const ph = 40 + Math.random() * 40;
      g.fillRect(x, y, pw, ph);
      g.strokeStyle = "rgba(60, 60, 50, 0.4)";
      g.strokeRect(x, y, pw, ph);
    }
    speckle(g, w, h, 120, "#4a4234", 1.6, 0.14);
  });
}

function glassTex() {
  return tex(256, 256, (g, w, h) => {
    // Ночное стекло: почти чёрное, с отражением фонаря и ветками.
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0a1420");
    grad.addColorStop(0.6, "#060a10");
    grad.addColorStop(1, "#03060a");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(90, 110, 130, 0.18)";
    g.lineWidth = 2;
    for (let i = 0; i < 10; i += 1) {
      g.beginPath();
      let x = Math.random() * w;
      let y = 0;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s += 1) {
        x += (Math.random() - 0.5) * 50;
        y += 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = "rgba(190, 210, 225, 0.05)";
    g.fillRect(0, h * 0.25, w, 10);
  });
}

function bannerTex() {
  return tex(512, 128, (g, w, h) => {
    g.fillStyle = "#7d1f1c";
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,255,255,0.12)");
    grad.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#e9dfc6";
    g.font = "bold 46px Georgia, serif";
    g.textAlign = "center";
    g.fillText("ГИМНАЗИЯ № 42", w / 2, h / 2 + 16);
    g.strokeStyle = "rgba(233, 223, 198, 0.5)";
    g.lineWidth = 3;
    g.strokeRect(12, 12, w - 24, h - 24);
  });
}

function skinTex() {
  return tex(256, 256, (g, w, h) => {
    g.fillStyle = "#b9b3a4";
    g.fillRect(0, 0, w, h);
    // Мраморность и трупные пятна.
    for (let i = 0; i < 40; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 10 + Math.random() * 50;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(96, 90, 88, ${0.05 + Math.random() * 0.12})`);
      grad.addColorStop(1, "rgba(96, 90, 88, 0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // Вены.
    for (let i = 0; i < 14; i += 1) {
      g.strokeStyle = `rgba(70, 78, 86, ${0.12 + Math.random() * 0.15})`;
      g.lineWidth = 1;
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.moveTo(x, y);
      for (let s = 0; s < 8; s += 1) {
        x += (Math.random() - 0.5) * 26;
        y += (Math.random() - 0.5) * 26;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    speckle(g, w, h, 500, "#7e7568", 1.6, 0.12);
  });
}

function hairTex() {
  return tex(128, 256, (g, w, h) => {
    g.fillStyle = "#0a0a0c";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      g.strokeStyle = `rgba(${30 + Math.random() * 40}, ${28 + Math.random() * 36}, ${30 + Math.random() * 40}, ${0.15 + Math.random() * 0.4})`;
      g.lineWidth = 0.6 + Math.random() * 1.4;
      g.beginPath();
      const x = Math.random() * w;
      g.moveTo(x, -10);
      g.bezierCurveTo(x + 20, h * 0.3, x - 20, h * 0.7, x + (Math.random() - 0.5) * 30, h + 10);
      g.stroke();
    }
  });
}

function uniformTex() {
  return tex(128, 256, (g, w, h) => {
    g.fillStyle = "#20242a";
    g.fillRect(0, 0, w, h);
    // Ткань: диагональное плетение.
    for (let i = 0; i < 260; i += 1) {
      g.strokeStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.03})`;
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.lineTo(w, y + 6);
      g.stroke();
    }
    grime(g, w, h, 10, 0.2);
  });
}

function doorTex() {
  return tex(256, 512, (g, w, h) => {
    const base = new THREE.Color(0x6a4a2c);
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, w, h);
    // Две филёнки.
    g.fillStyle = "rgba(30, 18, 8, 0.35)";
    g.fillRect(22, 40, w - 44, h * 0.34);
    g.fillRect(22, h * 0.48, w - 44, h * 0.44);
    g.strokeStyle = "rgba(240, 220, 180, 0.14)";
    g.lineWidth = 3;
    g.strokeRect(22, 40, w - 44, h * 0.34);
    g.strokeRect(22, h * 0.48, w - 44, h * 0.44);
    // Царапины.
    for (let i = 0; i < 40; i += 1) {
      g.fillStyle = `rgba(24, 14, 6, ${0.08 + Math.random() * 0.2})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 8 + Math.random() * 40);
    }
    grime(g, w, h, 12, 0.2);
  });
}

/* --------------------------- материалы --------------------------- */

export function createSchoolMaterials() {
  const m = {};

  const std = (map, opts = {}) =>
    new THREE.MeshStandardMaterial({
      map,
      roughness: 0.9,
      metalness: 0.02,
      ...opts
    });

  m.corridorWall = std(wallTex({ upper: "#a99f87", lower: "#3f5b45", panel: 0.38, wear: 1.3 }));
  m.classroomWall = std(wallTex({ upper: "#b3a88f", lower: "#7d8a70", panel: 0.3, wear: 0.9 }));
  m.hallWall = std(wallTex({ upper: "#b6ab92", lower: "#5c6a58", panel: 0.42, wear: 1.1 }));
  m.gymWall = std(wallTex({ upper: "#a8b3b3", lower: "#3f6470", panel: 0.55, wear: 0.8 }));
  m.canteenWall = std(wallTex({ upper: "#c4bfa9", lower: "#c9c8ba", panel: 0.62, tiles: 9, wear: 1 }));
  m.medicalWall = std(wallTex({ upper: "#c9c9bd", lower: "#b9c3be", panel: 0.66, tiles: 10, wear: 0.7 }));
  m.techWall = std(wallTex({ upper: "#7c7a72", lower: "#565650", panel: 0.5, wear: 1.4 }));
  m.libraryWall = std(wallTex({ upper: "#b0a184", lower: "#6b5236", panel: 0.34, wear: 1 }));

  m.floorLinoleum = std(linoleumTex(), { roughness: 0.6, metalness: 0.05 });
  m.floorParquet = std(parquetTex(), { roughness: 0.55, metalness: 0.02 });
  m.floorTile = std(tileFloorTex(), { roughness: 0.35, metalness: 0.04 });
  m.floorGym = std(gymFloorTex(), { roughness: 0.6, metalness: 0.02 });
  m.floorConcrete = std(concreteTex(), { roughness: 0.95, metalness: 0 });
  m.floorMarble = std(marbleTex(), { roughness: 0.3, metalness: 0.06 });
  m.ceiling = std(ceilingTex(), { roughness: 0.96, metalness: 0 });

  m.wood = std(doorTex(), { roughness: 0.7, metalness: 0.04 });
  m.woodLight = std(woodTex({ base: 0x9c7444, grain: 0.12 }), { roughness: 0.85 });
  m.woodDark = std(woodTex({ base: 0x4a2f1a, grain: 0.2, planks: 4 }), { roughness: 0.8 });
  m.metal = std(metalTex(0x646b70), { roughness: 0.45, metalness: 0.65 });
  m.metalDark = std(metalTex(0x2f3538), { roughness: 0.55, metalness: 0.55 });
  m.steel = std(metalTex(0x8a9297), { roughness: 0.3, metalness: 0.8 });
  m.board = std(boardTex(), { roughness: 0.8, metalness: 0 });
  m.paper = std(paperTex(), { roughness: 0.95 });
  m.notice = std(noticeTex(), { roughness: 0.9 });
  m.banner = std(bannerTex(), { roughness: 0.9 });
  m.fabric = new THREE.MeshStandardMaterial({ color: 0x5a1f1c, roughness: 1 });
  m.curtain = new THREE.MeshStandardMaterial({ color: 0x3b3630, roughness: 1, side: THREE.DoubleSide });
  m.plastic = new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.6 });
  m.rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  m.chalk = new THREE.MeshBasicMaterial({ color: 0xd7d9ca });
  m.black = new THREE.MeshBasicMaterial({ color: 0x030405 });
  m.glass = new THREE.MeshBasicMaterial({ map: glassTex(), transparent: true, opacity: 0.95 });
  m.screen = new THREE.MeshBasicMaterial({ color: 0x2b4b58 });
  m.ledRed = new THREE.MeshBasicMaterial({ color: 0xd8352a });
  m.ledGreen = new THREE.MeshBasicMaterial({ color: 0x51d06a });
  m.lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff6dd });
  m.pot = new THREE.MeshStandardMaterial({ color: 0x6a4a36, roughness: 0.9 });
  m.leaf = new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.95, side: THREE.DoubleSide });
  m.paintRed = new THREE.MeshStandardMaterial({ color: 0x8f2b22, roughness: 0.9 });
  m.paintGreen = new THREE.MeshStandardMaterial({ color: 0x2e5c37, roughness: 0.9 });
  m.paintBlue = new THREE.MeshStandardMaterial({ color: 0x2f4a63, roughness: 0.9 });
  m.paintYellow = new THREE.MeshStandardMaterial({ color: 0x9a8330, roughness: 0.9 });
  m.white = new THREE.MeshStandardMaterial({ color: 0xc9c6b8, roughness: 0.85 });
  m.skin = std(skinTex(), { roughness: 0.85, metalness: 0 });
  m.hair = std(hairTex(), { roughness: 1, metalness: 0 });
  m.uniform = std(uniformTex(), { roughness: 0.98, metalness: 0 });

  return m;
}

/** Размер текстуры в метрах (для непрерывной укладки пола). */
export const FLOOR_UV_SCALE = {
  floorLinoleum: 4.4,
  floorParquet: 3.4,
  floorTile: 2.4,
  floorGym: 4.2,
  floorConcrete: 3.0,
  floorMarble: 5.0
};

/** Ключи комнат → материалы стен/пола. */
export const ROOM_FLOOR = {
  corridor: "floorLinoleum",
  hall: "floorMarble",
  physics: "floorParquet",
  chemistry: "floorParquet",
  biology: "floorParquet",
  math: "floorParquet",
  informatics: "floorParquet",
  canteen: "floorTile",
  medical: "floorTile",
  electrical: "floorConcrete",
  library: "floorParquet",
  gym: "floorGym",
  lockerA: "floorTile",
  lockerB: "floorTile"
};

export const ROOM_WALL = {
  corridor: "corridorWall",
  hall: "hallWall",
  physics: "classroomWall",
  chemistry: "classroomWall",
  biology: "classroomWall",
  math: "classroomWall",
  informatics: "classroomWall",
  canteen: "canteenWall",
  medical: "medicalWall",
  electrical: "techWall",
  library: "libraryWall",
  gym: "gymWall",
  lockerA: "gymWall",
  lockerB: "gymWall"
};
