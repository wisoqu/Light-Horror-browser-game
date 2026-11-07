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

/* --------------------------- стены --------------------------- */

/**
 * Стена школы: штукатурка сверху, масляная панель снизу, плинтус.
 * panel — доля высоты под панель (0.36 ≈ 1.2 м при высоте 3.35 м).
 */
function wallTex({ upper, lower, panel = 0.36, tiles = 0, trim = "#2b2b26", wear = 1 }) {
  return tex(256, 512, (g, w, h) => {
    g.fillStyle = upper;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 420, "#6f6754", 2.2, 0.07);

    // Потёртости и потёки сверху.
    grime(g, w, h, 12, 0.1);
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
    speckle(g, w, panelTop * 0.9, 260, "#1e2a20", 2.4, 0.09);

    // Блик по верхней кромке панели.
    g.fillStyle = "rgba(255, 255, 240, 0.12)";
    g.fillRect(0, panelTop, w, 2);

    // Плинтус.
    g.fillStyle = trim;
    g.fillRect(0, h - 22, w, 22);
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fillRect(0, h - 22, w, 2);

    // Царапины и следы от стульев.
    for (let i = 0; i < 26 * wear; i += 1) {
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
    grime(g, w, h, 22, 0.16);
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
    speckle(g, w, h, 900, "#241a10", 1.2, 0.12);
    grime(g, w, h, 20, 0.2);
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
    grime(g, w, h, 26, 0.14);
    speckle(g, w, h, 1400, "#2e2c26", 1.2, 0.1);
  });
}

function gymFloorTex() {
  return tex(512, 512, (g, w, h) => {
    g.fillStyle = "#8b6234";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) {
      const shade = 0.85 + Math.random() * 0.22;
      const c = new THREE.Color(0xa87844).multiplyScalar(shade);
      g.fillStyle = `#${c.getHexString()}`;
      g.fillRect(0, y, w, 40);
      g.strokeStyle = "rgba(48, 30, 16, 0.5)";
      g.strokeRect(0, y, w, 40);
      for (let x = 0; x < w; x += 180) {
        g.fillStyle = "rgba(40, 26, 14, 0.35)";
        g.fillRect(x + Math.random() * 40, y, 2, 40);
      }
    }
    speckle(g, w, h, 1200, "#3a2412", 1.4, 0.12);
    grime(g, w, h, 18, 0.16);
  });
}

function concreteTex() {
  return tex(256, 256, (g, w, h) => {
    g.fillStyle = "#5b5b58";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1600, "#3a3a38", 1.6, 0.16);
    speckle(g, w, h, 700, "#8a8a84", 1.4, 0.1);
    grime(g, w, h, 20, 0.18);
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
