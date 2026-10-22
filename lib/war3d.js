// Мир эпизода «Двести четырнадцать» (three.js r149): посёлок у линии фронта, кухня мамы, подвал.
// const W = WAR3D.create(canvas, { seed }); W.state — камера, свет, постобработка, события;
// W.chars — персонажи (PEOPLE3D), W.render(t) — кадр. Метры; дорога посёлка идёт вдоль z.
// Постобработка своя (один проход): HDR-цель с мипмапами → глубина резкости по глубине,
// свечение ярких мест, хроматическая аберрация, ACES, цветокор, виньетка, тепловизор, вспышка.
window.WAR3D = (function () {
  const T = THREE;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function tex(w, h, draw, rep, srgb) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    if (srgb !== false) t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }
  function speckle(c, w, h, r, rgb, a, n, sz) {
    for (let i = 0; i < n; i++) {
      c.fillStyle = "rgba(" + rgb + "," + a * r() + ")";
      const s = 1 + r() * (sz || 3);
      c.fillRect(r() * w, r() * h, s, s);
    }
  }
  function blotch(c, w, h, r, rgb, a, n, rmax) {
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, rr = 4 + r() * rmax;
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, "rgba(" + rgb + "," + a * (0.4 + r() * 0.6) + ")");
      g.addColorStop(1, "rgba(" + rgb + ",0)");
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  function create(canvas, opt) {
    opt = opt || {};
    // цвета материалов — в sRGB (иначе тёмные оттенки выходят блёклыми); только для этого мира
    T.ColorManagement.legacyMode = false;
    const RES = opt.res || 0.62;
    canvas.width = Math.round(1080 * RES);
    canvas.height = Math.round(1920 * RES);
    const W = canvas.width, H = canvas.height;
    const r = rng(opt.seed || 214);
    const ren = new T.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    ren.setSize(W, H, false);
    ren.physicallyCorrectLights = true;
    ren.outputEncoding = T.LinearEncoding;
    ren.toneMapping = T.NoToneMapping;
    ren.shadowMap.enabled = true;
    ren.shadowMap.type = T.PCFSoftShadowMap;

    const sc = new T.Scene();
    const cam = new T.PerspectiveCamera(40, W / H, 0.03, 600);
    const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
    const add = (geo, mat, x, y, z, parent, o) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = !(o && o.noCast);
      m.receiveShadow = !(o && o.noRecv);
      (parent || sc).add(m);
      return m;
    };
    const group = (parent, x, y, z) => {
      const g = new T.Group();
      g.position.set(x || 0, y || 0, z || 0);
      (parent || sc).add(g);
      return g;
    };
    const box = (w, h, d) => new T.BoxGeometry(w, h, d);

    // ================= текстуры =================
    const mudTex = tex(512, 512, (c, w, h) => {
      c.fillStyle = "#3d3326";
      c.fillRect(0, 0, w, h);
      blotch(c, w, h, r, "28,22,16", 0.55, 90, 60);
      blotch(c, w, h, r, "86,72,52", 0.35, 70, 50);
      blotch(c, w, h, r, "70,74,52", 0.3, 40, 40); // пожухлая трава
      speckle(c, w, h, r, "15,12,9", 0.6, 9000, 2);
      speckle(c, w, h, r, "120,104,80", 0.4, 4000, 2);
    }, [60, 60]);
    const roadTex = tex(256, 1024, (c, w, h) => {
      c.fillStyle = "#3a3127";
      c.fillRect(0, 0, w, h);
      blotch(c, w, h, r, "22,18,13", 0.6, 70, 40);
      // колеи
      [0.28, 0.72].forEach((u) => {
        const g = c.createLinearGradient(w * u - 20, 0, w * u + 20, 0);
        g.addColorStop(0, "rgba(20,16,12,0)");
        g.addColorStop(0.5, "rgba(20,16,12,0.75)");
        g.addColorStop(1, "rgba(20,16,12,0)");
        c.fillStyle = g;
        c.fillRect(w * u - 20, 0, 40, h);
      });
      speckle(c, w, h, r, "130,115,95", 0.5, 5000, 3);
      speckle(c, w, h, r, "10,8,6", 0.6, 5000, 2);
    }, [1, 20]);
    const plaster = (base, seed) => tex(256, 256, (c, w, h) => {
      const rr = rng(seed);
      c.fillStyle = base;
      c.fillRect(0, 0, w, h);
      blotch(c, w, h, rr, "60,55,48", 0.25, 30, 50);
      // подтёки от крыши
      for (let i = 0; i < 18; i++) {
        const x = rr() * w;
        const g = c.createLinearGradient(0, 0, 0, h * (0.3 + rr() * 0.5));
        g.addColorStop(0, "rgba(40,36,30,0.45)");
        g.addColorStop(1, "rgba(40,36,30,0)");
        c.fillStyle = g;
        c.fillRect(x, 0, 3 + rr() * 8, h);
      }
      // осыпавшаяся штукатурка — кирпич под ней
      for (let i = 0; i < 5; i++) {
        const x = rr() * w, y = rr() * h, ww = 20 + rr() * 50, hh = 12 + rr() * 30;
        c.fillStyle = "#7a4a36";
        c.fillRect(x, y, ww, hh);
        c.strokeStyle = "rgba(40,25,20,0.7)";
        for (let yy = y; yy < y + hh; yy += 6) {
          c.beginPath();
          c.moveTo(x, yy);
          c.lineTo(x + ww, yy);
          c.stroke();
        }
      }
      // трещины
      c.strokeStyle = "rgba(30,26,22,0.6)";
      for (let i = 0; i < 8; i++) {
        let x = rr() * w, y = rr() * h;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (rr() - 0.5) * 30;
          y += rr() * 20;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      // цоколь
      c.fillStyle = "rgba(50,46,42,0.85)";
      c.fillRect(0, h * 0.86, w, h * 0.14);
      speckle(c, w, h, rr, "30,28,25", 0.4, 2500, 2);
    });
    const plasterTex = [plaster("#bdb5a4", 3), plaster("#a9b2b5", 5), plaster("#c7b99a", 8), plaster("#9aa39c", 11)];
    const slateTex = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#7d7f7d";
      c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        const g = c.createLinearGradient(x, 0, x + 16, 0);
        g.addColorStop(0, "rgba(255,255,255,0.12)");
        g.addColorStop(0.5, "rgba(0,0,0,0.22)");
        g.addColorStop(1, "rgba(255,255,255,0.12)");
        c.fillStyle = g;
        c.fillRect(x, 0, 16, h);
      }
      for (let y = 0; y < h; y += 64) {
        c.fillStyle = "rgba(20,20,20,0.5)";
        c.fillRect(0, y, w, 3);
      }
      blotch(c, w, h, r, "60,70,40", 0.4, 25, 30); // мох
      blotch(c, w, h, r, "30,30,30", 0.4, 25, 30);
    }, [3, 2]);
    const brickTex = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#5a3d30";
      c.fillRect(0, 0, w, h);
      for (let y = 0, row = 0; y < h; y += 16, row++) {
        for (let x = (row % 2) * -16; x < w; x += 32) {
          const v = 100 + Math.floor(r() * 50);
          c.fillStyle = "rgb(" + (v + 30) + "," + Math.floor(v * 0.55) + "," + Math.floor(v * 0.42) + ")";
          c.fillRect(x + 1, y + 1, 30, 14);
        }
      }
      speckle(c, w, h, r, "20,15,12", 0.5, 3000, 2);
      blotch(c, w, h, r, "25,20,18", 0.4, 20, 40);
    }, [2, 2]);
    const woodTex = tex(128, 256, (c, w, h) => {
      c.fillStyle = "#5b4a3a";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        c.strokeStyle = "rgba(" + (r() < 0.5 ? "30,22,15" : "110,95,75") + "," + r() * 0.5 + ")";
        c.beginPath();
        const x = r() * w;
        c.moveTo(x, 0);
        c.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.6, x + 3, h);
        c.stroke();
      }
    });
    const blueMetal = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#2f63a8";
      c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 22) {
        c.fillStyle = "rgba(0,0,0,0.18)";
        c.fillRect(x, 0, 5, h);
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.fillRect(x + 6, 0, 3, h);
      }
      blotch(c, w, h, r, "120,60,30", 0.75, 30, 26); // ржавчина
      blotch(c, w, h, r, "170,190,210", 0.25, 20, 20); // выгоревшая краска
      speckle(c, w, h, r, "90,45,20", 0.6, 1500, 3);
      // следы осколков
      for (let i = 0; i < 14; i++) {
        c.fillStyle = "rgba(15,10,8,0.9)";
        c.beginPath();
        c.arc(r() * w, r() * h, 1.5 + r() * 3, 0, 6.283);
        c.fill();
      }
    });
    const profTex = tex(256, 128, (c, w, h) => {
      c.fillStyle = "#6c705f";
      c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.fillRect(x, 0, 4, h);
      }
      blotch(c, w, h, r, "110,60,35", 0.6, 25, 22);
    }, [4, 1]);
    const glowTex = tex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.2, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    const smokeTex = tex(128, 128, (c) => {
      const rr = rng(77);
      for (let i = 0; i < 26; i++) {
        const x = 30 + rr() * 68, y = 30 + rr() * 68, rad = 14 + rr() * 26;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, "rgba(255,255,255,0.32)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
      }
    });

    // ================= посёлок =================
    const village = group();
    const kitchen = group(null, 200, 0, 0);
    const basement = group(null, -200, 0, 0);

    const ground = new T.PlaneGeometry(420, 420, 120, 120);
    {
      const p = ground.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        const roadMask = Math.min(1, Math.abs(x) / 5);
        p.setZ(i, (Math.sin(x * 0.21) * Math.cos(y * 0.17) * 0.12 + Math.sin(x * 0.9 + y * 0.7) * 0.04) * roadMask + (Math.hypot(x, y) > 90 ? (Math.sin(x * 0.03) + Math.cos(y * 0.04)) * 1.2 : 0));
      }
      ground.computeVertexNormals();
    }
    add(ground, std({ map: mudTex, roughness: 0.97 }), 0, 0, 0, village, { noCast: true }).rotation.x = -Math.PI / 2;
    add(new T.PlaneGeometry(6.5, 260), std({ map: roadTex, roughness: 0.88 }), 0, 0.02, -40, village, { noCast: true }).rotation.x = -Math.PI / 2;
    // лужи — глянцевые, в них отражается небо
    const puddleMat = std({ color: 0x14171b, roughness: 0.08, metalness: 0.9, envMapIntensity: 0.45 });
    [[1.2, 6], [-1.5, -5], [0.6, 15], [-0.8, -18], [1.5, -30], [-1.2, 26]].forEach(([x, z], i) => {
      const pd = add(new T.CircleGeometry(0.8 + r() * 0.9, 20), puddleMat, x, 0.035, z, village, { noCast: true });
      pd.rotation.x = -Math.PI / 2;
      pd.scale.set(1, 1.6 + r(), 1);
    });
    // воронки: тёмная чаша и вывороченный край
    const craterMat = std({ color: 0x1f1a14, roughness: 1 });
    const rimMat = std({ map: mudTex, color: 0x8a7a66, roughness: 1 });
    function crater(x, z, rad, parent) {
      const g = group(parent || village, x, 0, z);
      const bowl = add(new T.SphereGeometry(rad, 20, 8, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), craterMat, 0, rad * 0.55, 0, g, { noCast: true });
      bowl.material.side = T.DoubleSide;
      const rim = add(new T.TorusGeometry(rad * 1.02, rad * 0.18, 6, 20), rimMat, 0, 0.04, 0, g);
      rim.rotation.x = Math.PI / 2;
      rim.scale.z = 0.5;
      for (let i = 0; i < 10; i++) {
        const a = r() * 6.28, d = rad * (1.2 + r() * 0.8);
        add(new T.DodecahedronGeometry(0.08 + r() * 0.18, 0), rimMat, Math.cos(a) * d, 0.05, Math.sin(a) * d, g);
      }
      return g;
    }
    [[1.0, -9, 1.2], [-1.6, 19, 1.5], [7.5, -16, 2.2], [-7, 30, 1.8], [14, -34, 2.6], [-16, 18, 2.0], [2, 34, 1.1], [-20, -30, 3]].forEach(([x, z, rr]) => crater(x, z, rr));

    // --- дом: стены (с поворотом у основания — для обрушения), окна, двускатная шиферная крыша
    const frameMats = [std({ color: 0xd8d4c8 }), std({ color: 0x3f6fa8 }), std({ color: 0x5a4636 })];
    const glassMat = std({ color: 0x0b0d10, roughness: 0.1, metalness: 0.7 });
    const holeMat = std({ color: 0x050505, roughness: 1 });
    const plyMat = std({ map: woodTex, color: 0xb9a07a });
    const filmMat = std({ color: 0xcfd6d8, roughness: 0.35, transparent: true, opacity: 0.55 });
    const slateMat = std({ map: slateTex, roughness: 0.85 });
    const brickMat = std({ map: brickTex });
    const woodMat = std({ map: woodTex });
    function house(o) {
      const rr = rng(o.seed || 1);
      const g = group(village, o.x, 0, o.z);
      g.rotation.y = o.ry || 0;
      const w = o.w || 7.5, d = o.d || 6, h = o.h || 2.8, rise = 1.7;
      const wall = std({ map: plasterTex[o.tex !== undefined ? o.tex : Math.floor(rr() * 4)].clone() });
      wall.map.needsUpdate = true;
      wall.map.repeat.set(w / 3, h / 3);
      const parts = [];
      // стена как поворотная панель: pivot у основания
      function panel(px, pz, len, ry, windows) {
        const pv = group(g, px, 0, pz);
        pv.rotation.y = ry;
        add(box(len, h, 0.32), wall, 0, h / 2, 0, pv);
        (windows || []).forEach((wx) => {
          const wg = group(pv, wx, 1.45, 0.17);
          const fm = frameMats[o.frame !== undefined ? o.frame : Math.floor(rr() * 3)];
          add(box(1.15, 1.3, 0.06), fm, 0, 0, 0, wg);
          const st = rr();
          if (o.damage > 0.5 && st < 0.4) add(box(0.98, 1.12, 0.07), holeMat, 0, 0, 0.005, wg);
          else if (st < 0.65) add(box(0.98, 1.12, 0.07), glassMat, 0, 0, 0.005, wg);
          else if (st < 0.85) {
            add(box(0.98, 1.12, 0.07), holeMat, 0, 0, 0.004, wg);
            for (let k = 0; k < 3; k++) add(box(1.15, 0.24, 0.04), plyMat, 0, -0.38 + k * 0.38 + rr() * 0.06, 0.05, wg).rotation.z = (rr() - 0.5) * 0.15;
          } else add(box(0.98, 1.12, 0.07), filmMat, 0, 0, 0.006, wg);
          add(box(0.04, 1.12, 0.08), fm, 0, 0, 0.01, wg);
          add(box(1.3, 0.06, 0.18), fm, 0, -0.68, 0.06, wg); // отлив
        });
        parts.push({ g: pv, kind: "wall" });
        return pv;
      }
      const half = w / 2 - 0.16, hd = d / 2 - 0.16;
      // фасад и тыл — две половины каждая (для обрушения)
      panel(-w / 4, hd, w / 2, 0, [-0.6]);
      panel(w / 4, hd, w / 2, 0, [0.4]);
      panel(-w / 4, -hd, w / 2, Math.PI, [0.6]);
      panel(w / 4, -hd, w / 2, Math.PI, []);
      panel(half, 0, d, Math.PI / 2, [0]);
      panel(-half, 0, d, -Math.PI / 2, [-0.8]);
      // фронтоны
      const triShape = new T.Shape();
      triShape.moveTo(-d / 2, 0);
      triShape.lineTo(d / 2, 0);
      triShape.lineTo(0, rise);
      triShape.lineTo(-d / 2, 0);
      const tri = new T.ExtrudeGeometry(triShape, { depth: 0.25, bevelEnabled: false });
      [-1, 1].forEach((sd) => {
        const pv = group(g, sd * half, h, 0);
        pv.rotation.y = Math.PI / 2;
        add(tri, wall, 0, 0, -0.12, pv);
        parts.push({ g: pv, kind: "gable" });
      });
      // крыша: листы шифера полосами; на повреждённых — дыры и голые стропила
      const slope = Math.hypot(d / 2 + 0.4, rise), ang = Math.atan2(rise, d / 2 + 0.4);
      const strips = 5;
      [-1, 1].forEach((sd) => {
        for (let i = 0; i < strips; i++) {
          const sx = -w / 2 - 0.3 + (i + 0.5) * ((w + 0.6) / strips);
          const missing = o.damage > 0 && rr() < o.damage * 0.45;
          const pv = group(g, sx, h + rise / 2, sd * (d / 4 + 0.1));
          pv.rotation.x = sd * ang;
          if (!missing) add(box((w + 0.6) / strips - 0.02, 0.05, slope), slateMat, 0, 0, 0, pv);
          else for (let k = -1; k <= 1; k += 2) add(box(0.08, 0.1, slope), woodMat, k * 0.35, -0.05, 0, pv);
          parts.push({ g: pv, kind: "roof" });
        }
      });
      // труба
      const ch = group(g, w * 0.22, h + rise * 0.6, -0.6);
      add(box(0.45, 1.4, 0.45), brickMat, 0, 0.4, 0, ch);
      parts.push({ g: ch, kind: "chimney" });
      if (o.burnt) wall.color.setHex(0x55504a);
      g.userData.parts = parts;
      return g;
    }
    const sonyaHouse = house({ x: -12.5, z: -1, ry: Math.PI / 2, tex: 1, frame: 1, damage: 0.15, seed: 31 });
    const houses = [
      { x: -12.5, z: -17, ry: Math.PI / 2, damage: 0.6, seed: 2 },
      { x: -13, z: 15, ry: Math.PI / 2, damage: 0.9, seed: 3 },
      { x: -12, z: 30, ry: Math.PI / 2, damage: 0.3, seed: 4 },
      { x: -12.5, z: -33, ry: Math.PI / 2, damage: 1, seed: 5, burnt: true },
      { x: 12.5, z: 3, ry: -Math.PI / 2, damage: 0.5, seed: 6 },
      { x: 13, z: -12, ry: -Math.PI / 2, damage: 0.8, seed: 7, burnt: true },
      { x: 12.5, z: 18, ry: -Math.PI / 2, damage: 0.4, seed: 8 },
      { x: 12, z: -28, ry: -Math.PI / 2, damage: 1, seed: 9 },
      { x: 13, z: 33, ry: -Math.PI / 2, damage: 0.7, seed: 10 },
      { x: -26, z: 6, ry: Math.PI / 2, damage: 0.5, seed: 11 },
      { x: 27, z: -4, ry: -Math.PI / 2, damage: 0.6, seed: 12 },
    ].map(house);
    // разрушенный до стен дом с обгоревшими краями
    houses[3].userData.parts.forEach((p) => p.kind === "roof" && (p.g.visible = false));
    houses[7].userData.parts.forEach((p) => (p.kind === "roof" || p.kind === "gable") && (p.g.visible = false));

    // --- заборы: профлист, штакетник; у Сони — синие ворота с калиткой между кирпичными столбами
    function fenceRun(x, z0, z1, kind) {
      const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
      if (kind === "prof") {
        add(box(0.04, 1.9, len), std({ map: profTex.clone(), roughness: 0.7, metalness: 0.3 }), x, 0.95, zc, village).material.map.repeat.set(len / 2, 1);
      } else {
        const n = Math.floor(len / 0.18);
        const inst = new T.InstancedMesh(box(0.025, 1.3, 0.1), woodMat, n);
        const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
        for (let i = 0; i < n; i++) {
          const lean = r() < 0.12 ? (r() - 0.5) * 0.9 : (r() - 0.5) * 0.06;
          e.set(0, 0, lean);
          q.setFromEuler(e);
          m4.compose(new T.Vector3(x, 0.6 + r() * 0.08, Math.min(z0, z1) + i * 0.18), q, new T.Vector3(1, r() < 0.06 ? 0.4 : 1, 1));
          inst.setMatrixAt(i, m4);
        }
        inst.castShadow = inst.receiveShadow = true;
        village.add(inst);
        add(box(0.05, 0.07, len), woodMat, x - 0.03, 0.95, zc, village);
        add(box(0.05, 0.07, len), woodMat, x - 0.03, 0.35, zc, village);
      }
    }
    const GX = -5.6;
    fenceRun(GX, 1.9, 8, "prof");
    fenceRun(GX, -8, -1.9, "prof");
    fenceRun(GX, -24, -10, "pick");
    fenceRun(GX, 10, 22, "pick");
    fenceRun(5.6, -6, 9, "pick");
    fenceRun(5.6, 12, 24, "prof");
    fenceRun(5.6, -20, -8, "prof");
    const gates = group(village, GX, 0, 0);
    [-1.9, 1.9].forEach((zz) => add(box(0.45, 2.2, 0.45), brickMat, 0, 1.1, zz, gates));
    const gateMat = std({ map: blueMetal, roughness: 0.6, metalness: 0.35 });
    const leafL = group(gates, 0, 0, -1.67), leafR = group(gates, 0, 0, 1.67);
    add(box(0.05, 1.95, 1.62), gateMat, 0, 1.05, 0.81, leafL);
    add(box(0.05, 1.95, 1.62), gateMat, 0, 1.05, -0.81, leafR);
    add(box(0.08, 0.06, 1.6), std({ color: 0x1c3f6e }), 0.03, 1.8, 0.81, leafL);
    add(box(0.08, 0.06, 1.6), std({ color: 0x1c3f6e }), 0.03, 1.8, -0.81, leafR);
    // бельевая верёвка во дворе: детские вещи
    const line = add(new T.CylinderGeometry(0.006, 0.006, 6, 4), std({ color: 0x777777 }), -9, 1.85, 4, village, { noCast: true });
    line.rotation.x = Math.PI / 2;
    [[0xe86a9a, 0.4, 0.45], [0xf0f0e8, 0.35, 0.5], [0x6a8fd0, 0.3, 0.55], [0xe86a9a, 0.22, 0.6], [0xd8c050, 0.3, 0.35]].forEach(([col, ww, hh], i) => {
      const cl = add(box(ww, hh, 0.01), std({ color: col, roughness: 1, side: T.DoubleSide }), -9, 1.85 - hh / 2, 2 + i * 0.95, village);
      cl.rotation.y = Math.PI / 2;
      cl.rotation.x = (r() - 0.5) * 0.15;
    });
    // колодец-журавль во дворе соседей: сруб, крыша, ворот, ведро
    const well = group(village, -4.2, 0, 11);
    add(box(1.1, 0.8, 1.1), woodMat, 0, 0.4, 0, well);
    add(box(0.9, 0.82, 0.9), holeMat, 0, 0.42, 0, well, { noCast: true });
    [-0.5, 0.5].forEach((xx) => add(box(0.08, 1.6, 0.08), woodMat, xx, 1.2, 0, well));
    const wr = add(box(1.4, 0.04, 0.9), woodMat, 0, 2.05, -0.22, well);
    wr.rotation.x = 0.55;
    const wr2 = add(box(1.4, 0.04, 0.9), woodMat, 0, 2.05, 0.22, well);
    wr2.rotation.x = -0.55;
    add(new T.CylinderGeometry(0.11, 0.09, 0.22, 12), std({ color: 0x6d6f6e, metalness: 0.6, roughness: 0.5 }), 0.2, 0.92, 0.3, well);
    // столбы ЛЭП вдоль дороги, провисшие провода; один столб сломан, провод лежит на земле
    const poleMat = std({ color: 0x4a4038 });
    const wireMat = new T.MeshBasicMaterial({ color: 0x0b0b0b });
    const poles = [];
    for (let z = -60, k = 0; z <= 60; z += 20, k++) {
      const broken = k === 4;
      const pg = group(village, 4.4, 0, z);
      add(new T.CylinderGeometry(0.12, 0.16, 8, 8), poleMat, 0, 4, 0, pg);
      add(box(1.4, 0.1, 0.1), poleMat, 0, 7.4, 0, pg);
      if (broken) {
        pg.rotation.z = 0.85;
        pg.rotation.x = 0.2;
      }
      poles.push({ z, broken, g: pg });
    }
    function wire(a, b, sag, thick) {
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const k = i / 16;
        pts.push(new T.Vector3(lerp(a.x, b.x, k), lerp(a.y, b.y, k) - Math.sin(k * Math.PI) * sag, lerp(a.z, b.z, k)));
      }
      const m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, thick || 0.012, 4), wireMat);
      village.add(m);
      return m;
    }
    for (let i = 0; i < poles.length - 1; i++) {
      for (const dx of [-0.6, 0.6]) {
        const a = new T.Vector3(4.4 + dx, 7.45, poles[i].z), b = new T.Vector3(4.4 + dx, 7.45, poles[i + 1].z);
        if (poles[i + 1].broken) wire(a, new T.Vector3(4.4 + dx * 2, 0.05, poles[i + 1].z - 2), 1.5);
        else if (poles[i].broken) wire(new T.Vector3(4.4 + dx * 2, 0.05, poles[i].z + 2), b, 1.2);
        else wire(a, b, 0.6);
      }
    }
    // голые обгоревшие деревья
    const barkMat = std({ color: 0x2a241f });
    function tree(x, z, hgt, seed) {
      const tr = rng(seed);
      const g = group(village, x, 0, z);
      add(new T.CylinderGeometry(0.1, 0.22, hgt, 7), barkMat, 0, hgt / 2, 0, g);
      for (let i = 0; i < 7; i++) {
        const b = add(new T.CylinderGeometry(0.02, 0.07, hgt * (0.3 + tr() * 0.3), 5), barkMat, 0, hgt * (0.45 + tr() * 0.5), 0, g);
        b.rotation.set((tr() - 0.5) * 1.6, tr() * 6.28, (tr() - 0.5) * 1.6);
        b.translateY(hgt * 0.15);
      }
      return g;
    }
    [[-7.5, -11, 6, 1], [8, 9, 7, 2], [-8, 21, 5, 3], [8.5, -24, 6.5, 4], [-18, -8, 8, 5], [19, 12, 7, 6], [-21, 26, 6, 7], [22, -20, 7.5, 8], [-30, -20, 9, 9], [30, 25, 8, 10], [-6.5, -4.5, 5.5, 11]].forEach((a) => tree(...a));
    // сгоревшая легковушка
    const car = group(village, 3.6, 0, -22);
    car.rotation.y = 0.35;
    const burnt = std({ color: 0x2b2420, roughness: 0.8, metalness: 0.3 });
    const rust = std({ color: 0x5a3324, roughness: 0.9 });
    add(box(1.7, 0.6, 4.1), burnt, 0, 0.45, 0, car);
    add(box(1.5, 0.55, 2.0), rust, 0, 1.0, -0.2, car);
    add(box(1.42, 0.5, 1.9), holeMat, 0, 1.0, -0.2, car, { noCast: true });
    [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]].forEach(([xx, zz]) => {
      const wh = add(new T.CylinderGeometry(0.3, 0.3, 0.18, 12), std({ color: 0x151515 }), xx, 0.22, zz, car);
      wh.rotation.z = Math.PI / 2;
    });
    // зелёные ящики у дома напротив — на них сидят солдаты
    const crateMat = std({ color: 0x4a5536, roughness: 0.8, map: woodTex });
    [[3.62, 4.62, 0.1], [3.7, 3.7, -0.2], [4.3, 4.3, 0.5]].forEach(([x, z, ry]) => {
      const cr = add(box(0.75, 0.4, 0.45), crateMat, x, 0.2, z, village);
      cr.rotation.y = ry;
    });
    // остановка: бетонный павильон, крыша посечена; цветы, игрушка, свеча
    const stop = group(village, 4.8, 0, 44);
    stop.rotation.y = -Math.PI / 2;
    const concrete = std({ color: 0x8e8c86, roughness: 0.95, map: plasterTex[3] });
    add(box(3.4, 2.3, 0.18), concrete, 0, 1.15, -0.8, stop);
    add(box(0.18, 2.3, 1.6), concrete, -1.6, 1.15, 0, stop);
    add(box(0.18, 2.3, 1.6), concrete, 1.6, 1.15, 0, stop);
    const sroof = add(box(3.8, 0.14, 2.0), concrete, 0, 2.35, 0, stop);
    sroof.rotation.z = 0.08;
    add(box(2.6, 0.08, 0.4), woodMat, 0, 0.45, -0.55, stop);
    const flowerCols = [0xd8263a, 0xe8e2d0, 0xd8263a, 0xf0c040, 0xd8263a];
    flowerCols.forEach((col, i) => {
      const f = group(stop, -0.9 + i * 0.35, 0, 0.5 + r() * 0.2);
      add(new T.CylinderGeometry(0.006, 0.006, 0.45, 4), std({ color: 0x2f5a2a }), 0, 0.12, 0, f, { noCast: true }).rotation.z = 1.35;
      add(new T.SphereGeometry(0.045, 8, 6), std({ color: col, roughness: 0.7 }), 0.22, 0.05, 0, f);
    });
    const teddy = group(stop, 0.6, 0, 0.1);
    const plush = std({ color: 0xb08a62, roughness: 1 });
    add(new T.SphereGeometry(0.12, 12, 10), plush, 0, 0.13, 0, teddy).scale.set(1, 1.15, 0.9);
    add(new T.SphereGeometry(0.09, 12, 10), plush, 0, 0.32, 0.02, teddy);
    [-0.06, 0.06].forEach((xx) => add(new T.SphereGeometry(0.035, 8, 6), plush, xx, 0.4, 0.0, teddy));
    const lamp = add(new T.CylinderGeometry(0.035, 0.035, 0.08, 10), std({ color: 0xb02020, roughness: 0.4, transparent: true, opacity: 0.85 }), -0.2, 0.04, 0.35, stop);
    const stopCandle = new T.PointLight(0xff9a40, 0, 3, 2);
    stopCandle.position.set(-0.2, 0.15, 0.35);
    stop.add(stopCandle);
    // антидроновые сетки над дорогой за посёлком
    const netTex = tex(128, 128, (c, w, h) => {
      c.strokeStyle = "rgba(30,34,28,0.95)";
      c.lineWidth = 2;
      for (let i = -128; i < 256; i += 12) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + 128, h);
        c.stroke();
        c.beginPath();
        c.moveTo(i + 128, 0);
        c.lineTo(i, h);
        c.stroke();
      }
    }, [20, 2]);
    const netMat = new T.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: T.DoubleSide, roughness: 1 });
    netTex.encoding = T.sRGBEncoding;
    const netLen = 70, netZ = -95;
    [-3.4, 3.4].forEach((xx) => {
      const s = add(new T.PlaneGeometry(netLen, 4.2), netMat, xx, 2.1, netZ, village, { noRecv: true });
      s.rotation.y = Math.PI / 2;
      for (let z = netZ - netLen / 2; z <= netZ + netLen / 2; z += 6) add(new T.CylinderGeometry(0.06, 0.07, 4.4, 6), poleMat, xx, 2.2, z, village);
    });
    const netTop = add(new T.PlaneGeometry(6.8, netLen), netMat, 0, 4.3, netZ, village, { noRecv: true });
    netTop.rotation.x = Math.PI / 2;
    // сгоревшая «таблетка» эвакуации на дороге под сетками
    const van = group(village, -0.8, 0, -84);
    van.rotation.y = 0.25;
    add(box(2.0, 1.9, 4.6), burnt, 0, 1.15, 0, van);
    add(box(1.9, 0.6, 1.4), holeMat, 0, 1.55, 2.0, van, { noCast: true });
    [[-0.9, 1.4], [0.9, 1.4], [-0.9, -1.5], [0.9, -1.5]].forEach(([xx, zz]) => {
      const wh = add(new T.CylinderGeometry(0.38, 0.38, 0.22, 12), std({ color: 0x121212 }), xx, 0.3, zz, van);
      wh.rotation.z = Math.PI / 2;
    });
    crater(0.4, -79, 1.3);

    // обломки дома Сони: куча кирпича, балки, шифер — вырастает при обрушении
    const heap = group(village, -12.5, 0, -1);
    const heapMat = std({ map: brickTex, color: 0xa89888, roughness: 1 });
    const heapCore = add(new T.SphereGeometry(4.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), heapMat, 0, 0, 0, heap);
    heapCore.scale.set(1, 0.3, 0.85);
    {
      const p = heapCore.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y > 0.1) p.setY(i, y + (Math.sin(p.getX(i) * 3.1) * Math.cos(p.getZ(i) * 2.7)) * 0.35);
      }
      heapCore.geometry.computeVertexNormals();
    }
    const bricks = new T.InstancedMesh(box(0.25, 0.08, 0.12), brickMat, 260);
    const slabs = new T.InstancedMesh(box(0.9, 0.04, 0.6), slateMat, 40);
    const beams = new T.InstancedMesh(box(0.14, 0.14, 3), woodMat, 10);
    {
      const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3();
      const put = (inst, n, rad, ymax) => {
        for (let i = 0; i < n; i++) {
          const a = r() * 6.28, d = Math.sqrt(r()) * rad;
          let x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85;
          // пятно, где лежит Соня и стоит Денис, — без обломков сверху
          if (Math.hypot(x - 3.9, z - 1.3) < 1.4 || Math.hypot(x - 3.2, z - 2.2) < 0.8) {
            x -= 2.2;
            z -= 1.6;
          }
          const y = Math.max(0.05, Math.sqrt(Math.max(0, 1 - (d / 4.2) ** 2)) * 1.22) + (r() - 0.5) * 0.15;
          e.set(r() * 3, r() * 3, r() * 3);
          q.setFromEuler(e);
          m4.compose(v.set(x, Math.min(y, ymax), z), q, new T.Vector3(1, 1, 1));
          inst.setMatrixAt(i, m4);
        }
        inst.castShadow = inst.receiveShadow = true;
        heap.add(inst);
      };
      put(bricks, 260, 4.6, 2);
      put(slabs, 40, 4, 2);
      put(beams, 10, 3.5, 2);
    }
    // балка, под которой Соня (поднимается отдельно)
    const sonyaBeam = add(box(0.18, 0.18, 2.6), woodMat, 3.55, 0.6, 1.3, heap);
    sonyaBeam.rotation.set(0.1, 0.25, 0.12);
    // платок бабушки на кирпичах
    const scarfOnHeap = add(new T.PlaneGeometry(0.55, 0.45, 6, 6), std({ map: PEOPLE3D.scarfTex(), color: 0xb8b0a8, side: T.DoubleSide, roughness: 1 }), 2.3, 0.86, -1.6, heap, { noCast: true });
    scarfOnHeap.rotation.set(-1.25, 0.3, 0.2);
    heap.visible = false;

    // ================= небо, дым, пыль =================
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color(0x2a3442) }, hor: { value: new T.Color(0x8a8f96) }, glow: { value: new T.Color(0xff7a30) }, glowK: { value: 0.0 }, t: { value: 0 } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: [
        "uniform vec3 top; uniform vec3 hor; uniform vec3 glow; uniform float glowK; uniform float t; varying vec3 vP;",
        "float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }",
        "float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }",
        "float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }",
        "void main(){",
        "  float y = clamp(vP.y, -0.1, 1.0);",
        "  vec3 c = mix(hor, top, pow(clamp(y*1.6,0.0,1.0), 0.6));",
        "  vec2 uv = vP.xz / (0.25 + vP.y) * 1.3 + vec2(t*0.01, 0.0);",
        "  float cl = fbm(uv);",
        "  c = mix(c, c*0.55, smoothstep(0.45, 0.8, cl) * smoothstep(0.0, 0.3, y));",
        "  c = mix(c, c*1.25, smoothstep(0.55, 0.3, cl) * smoothstep(0.0, 0.4, y) * 0.5);",
        "  float g = exp(-abs(vP.y) * 9.0) * (0.6 + 0.4 * fbm(vP.xz * 3.0 + t*0.02));",
        "  c += glow * glowK * g;",
        "  gl_FragColor = vec4(c, 1.0);",
        "}",
      ].join("\n"),
    });
    const sky = new T.Mesh(new T.SphereGeometry(400, 32, 16), skyMat);
    sky.renderOrder = -1;
    village.add(sky);
    sc.fog = new T.FogExp2(0x777c82, 0.014);

    // столбы дыма на горизонте и над посёлком
    const smokeSprites = [];
    function smokeColumn(x, z, n, size, dark) {
      for (let i = 0; i < n; i++) {
        const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, color: dark ? 0x2a2622 : 0x6a6662, transparent: true, depthWrite: false, opacity: 0.0 }));
        sp.userData = { x, z, k: i / n, size, ph: r() * 6.28, dark };
        village.add(sp);
        smokeSprites.push(sp);
      }
    }
    smokeColumn(-80, -150, 22, 26, true);
    smokeColumn(60, -190, 18, 30, true);
    smokeColumn(-160, 40, 16, 34, false);
    // дымок из печной трубы Сони — в посёлке ещё живут
    const chimneySmoke = [];
    for (let i = 0; i < 12; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, color: 0x9a9894, transparent: true, depthWrite: false, opacity: 0 }));
      village.add(sp);
      chimneySmoke.push(sp);
    }
    // пыль в воздухе — ловит свет
    const dustN = 1400;
    const dustGeo = new T.BufferGeometry();
    const dustPos = new Float32Array(dustN * 3), dustSeed = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) {
      dustSeed[i * 3] = r();
      dustSeed[i * 3 + 1] = r();
      dustSeed[i * 3 + 2] = r();
    }
    dustGeo.setAttribute("position", new T.BufferAttribute(dustPos, 3));
    const dustMat = new T.PointsMaterial({ map: glowTex, color: 0xd8c8b0, size: 0.035, transparent: true, depthWrite: false, opacity: 0, blending: T.AdditiveBlending });
    const dust = new T.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    sc.add(dust);

    // ================= взрыв и бомба =================
    const fx = group(village, -12.5, 0, -1);
    const fireball = add(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, fog: false }), 0, 1, 0, fx, { noCast: true, noRecv: true });
    const ring = add(new T.TorusGeometry(1, 0.35, 8, 40), new T.MeshBasicMaterial({ color: 0x8a7a66, transparent: true, opacity: 0, depthWrite: false }), 0, 0.4, 0, fx, { noCast: true, noRecv: true });
    ring.rotation.x = Math.PI / 2;
    const blastLight = new T.PointLight(0xffa050, 0, 140, 1.6);
    blastLight.position.set(0, 4, 0);
    fx.add(blastLight);
    const blastSmoke = [];
    for (let i = 0; i < 70; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, color: 0x4e443a, transparent: true, depthWrite: false, opacity: 0 }));
      const a = r() * 6.28;
      sp.userData = { a, up: 0.3 + r() * 1.2, out: 0.3 + r() * 1.2, s: 5 + r() * 7, ph: r() };
      fx.add(sp);
      blastSmoke.push(sp);
    }
    const debrisN = 120;
    const debris = new T.InstancedMesh(box(0.22, 0.09, 0.14), heapMat, debrisN);
    const debrisV = [];
    for (let i = 0; i < debrisN; i++) {
      const a = r() * 6.28, sp = 6 + r() * 16;
      debrisV.push([Math.cos(a) * sp * 0.6, 6 + r() * 18, Math.sin(a) * sp * 0.6, r() * 10, r() * 10]);
    }
    debris.castShadow = true;
    fx.add(debris);
    const bomb = group(village);
    bomb.scale.setScalar(1.6);
    {
      const bm = std({ color: 0x3e443c, roughness: 0.6, metalness: 0.4 });
      const body = add(new T.CylinderGeometry(0.22, 0.22, 2.6, 16), bm, 0, 0, 0, bomb);
      body.rotation.x = Math.PI / 2;
      const nose = add(new T.ConeGeometry(0.22, 0.7, 16), bm, 0, 0, 1.65, bomb);
      nose.rotation.x = Math.PI / 2;
      add(box(2.6, 0.03, 0.35), bm, 0, 0.25, 0.1, bomb); // крылья модуля
      [0, 1, 2, 3].forEach((k) => {
        const f = add(box(0.02, 0.45, 0.35), bm, 0, 0, -1.25, bomb);
        f.rotation.z = (k * Math.PI) / 2 + Math.PI / 4;
        f.translateY(0.25);
      });
    }
    bomb.visible = false;

    // ================= дроны =================
    function drone() {
      const g = group(village);
      const fr = std({ color: 0x151617, roughness: 0.5, metalness: 0.3 });
      [0.78, -0.78].forEach((a) => add(box(0.36, 0.015, 0.035), fr, 0, 0, 0, g).rotation.y = a);
      add(box(0.09, 0.04, 0.13), fr, 0, 0.03, 0, g);
      add(box(0.06, 0.05, 0.05), std({ color: 0x242424 }), 0, 0.02, 0.09, g);
      const props = [];
      [[0.12, 0.12], [-0.12, 0.12], [0.12, -0.12], [-0.12, -0.12]].forEach(([x, z]) => {
        add(new T.CylinderGeometry(0.018, 0.018, 0.03, 10), fr, x, 0.02, z, g);
        const p = add(new T.CircleGeometry(0.065, 16), new T.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }), x, 0.04, z, g, { noCast: true });
        p.rotation.x = -Math.PI / 2;
        // лопасти — видны, когда дрон стоит на земле
        const bl = add(box(0.13, 0.004, 0.016), std({ color: 0x1a1a1a, roughness: 0.4 }), x, 0.042, z, g, { noCast: true });
        bl.rotation.y = x * z * 40;
        p.userData.blade = bl;
        props.push(p);
      });
      const led = add(new T.SphereGeometry(0.012, 6, 6), new T.MeshBasicMaterial({ color: 0xff2020 }), 0, 0.01, -0.08, g, { noCast: true });
      const ledGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xff2a20, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      ledGlow.scale.set(0.25, 0.25, 0.25);
      ledGlow.position.set(0, 0.01, -0.08);
      g.add(ledGlow);
      g.scale.setScalar(1.6);
      g.visible = false;
      return { g, props, led, ledGlow };
    }
    const drones = [drone(), drone()];

    // ================= кот Барсик =================
    function cat(parent) {
      const g = group(parent);
      const fur = std({ color: 0xc8823e, roughness: 1 });
      const furD = std({ color: 0x9a5a28, roughness: 1 });
      const body = add(new T.SphereGeometry(0.13, 16, 12), fur, 0, 0.14, -0.02, g);
      body.scale.set(0.95, 1.25, 1.1);
      add(new T.SphereGeometry(0.1, 16, 12), fur, 0, 0.06, 0.06, g).scale.set(1.2, 0.6, 1); // лапы
      const head = group(g, 0, 0.33, 0.06);
      add(new T.SphereGeometry(0.085, 16, 12), fur, 0, 0, 0, head).scale.set(1.1, 0.95, 1);
      [-1, 1].forEach((sd) => {
        const ear = add(new T.ConeGeometry(0.035, 0.07, 8), furD, sd * 0.05, 0.075, -0.01, head);
        ear.rotation.z = -sd * 0.25;
      });
      const tailPts = [new T.Vector3(0, 0.06, -0.14), new T.Vector3(0.12, 0.02, -0.12), new T.Vector3(0.2, 0.02, 0.05), new T.Vector3(0.15, 0.02, 0.15)];
      add(new T.TubeGeometry(new T.CatmullRomCurve3(tailPts), 16, 0.025, 6), fur, 0, 0, 0, g);
      return { g, head };
    }

    // ================= кухня мамы =================
    const KW = 3.4, KD = 3.6, KH = 2.55;
    const wallpaper = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#b9ad8e";
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 42) for (let x = (y / 42) % 2 ? 21 : 0; x < w; x += 42) {
        c.fillStyle = "rgba(140,110,80,0.45)";
        for (let k = 0; k < 4; k++) {
          c.beginPath();
          c.ellipse(x + Math.cos(k * 1.57) * 6, y + Math.sin(k * 1.57) * 6, 5, 3, k * 1.57, 0, 6.283);
          c.fill();
        }
        c.fillStyle = "rgba(90,110,80,0.4)";
        c.fillRect(x - 1, y + 8, 2, 10);
      }
      blotch(c, w, h, r, "90,80,60", 0.15, 10, 60);
    }, [4, 3]);
    const linoleum = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#7a5a3e";
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
        c.fillStyle = (x + y) % 64 ? "rgba(255,230,190,0.12)" : "rgba(0,0,0,0.1)";
        c.fillRect(x, y, 32, 32);
      }
      speckle(c, w, h, r, "40,30,20", 0.3, 2000, 2);
    }, [4, 4]);
    const oilcloth = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#e9e2d2";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(170,50,50,0.55)";
      for (let i = 0; i < w; i += 32) {
        c.fillRect(i, 0, 12, h);
        c.fillRect(0, i, w, 12);
      }
    }, [3, 3]);
    const kmat = std({ map: wallpaper });
    add(box(KW, KH, 0.1), kmat, 0, KH / 2, -KD / 2, kitchen);
    add(box(0.1, KH, KD), kmat, -KW / 2, KH / 2, 0, kitchen);
    add(box(0.1, KH, KD), kmat, KW / 2, KH / 2, 0, kitchen);
    // передняя стена с дверным проёмом в прихожую
    add(box(1.0, KH, 0.1), kmat, -KW / 2 + 0.5, KH / 2, KD / 2, kitchen);
    add(box(1.4, KH, 0.1), kmat, KW / 2 - 0.7, KH / 2, KD / 2, kitchen);
    add(box(1.0, 0.45, 0.1), kmat, -0.2, KH - 0.22, KD / 2, kitchen);
    add(new T.PlaneGeometry(KW, KD + 3), std({ map: linoleum, roughness: 0.6 }), 0, 0.001, 1.2, kitchen, { noCast: true }).rotation.x = -Math.PI / 2;
    add(new T.PlaneGeometry(KW, KD + 3), std({ color: 0xd8d4cc }), 0, KH, 1.2, kitchen, { noCast: true }).rotation.x = Math.PI / 2;
    // прихожая: стены и входная дверь, у которой сидит Барсик
    add(box(KW, KH, 0.1), std({ color: 0x8a7d66 }), 0, KH / 2, KD / 2 + 2.4, kitchen);
    add(box(0.9, 2.0, 0.06), std({ color: 0x4a3426, roughness: 0.6 }), -0.2, 1.0, KD / 2 + 2.32, kitchen);
    add(new T.SphereGeometry(0.03, 8, 6), std({ color: 0xc0a060, metalness: 0.9, roughness: 0.3 }), 0.15, 1.0, KD / 2 + 2.28, kitchen);
    // окно: ночь, тюль
    add(box(1.3, 1.4, 0.06), std({ color: 0xe8e4dc }), KW / 2 - 0.05, 1.5, -0.4, kitchen).rotation.y = Math.PI / 2;
    const night = add(new T.PlaneGeometry(1.15, 1.25), new T.MeshBasicMaterial({ color: 0x0c1424 }), KW / 2 - 0.09, 1.5, -0.4, kitchen, { noCast: true });
    night.rotation.y = -Math.PI / 2;
    const tulle = add(new T.PlaneGeometry(1.6, 1.9, 12, 1), std({ color: 0xf2efe6, transparent: true, opacity: 0.38, side: T.DoubleSide, roughness: 1 }), KW / 2 - 0.18, 1.45, -0.4, kitchen, { noCast: true });
    tulle.rotation.y = -Math.PI / 2;
    {
      const p = tulle.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 14) * 0.03);
      tulle.geometry.computeVertexNormals();
    }
    // стол с клеёнкой, табуретки, холодильник, плита, икона в углу, календарь
    const table = group(kitchen, 0.2, 0, -0.6);
    add(box(1.2, 0.04, 0.8), std({ map: oilcloth, roughness: 0.35 }), 0, 0.74, 0, table);
    add(box(1.22, 0.12, 0.82), std({ color: 0xd9d2c2, roughness: 0.4 }), 0, 0.68, 0, table, { noCast: true });
    [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]].forEach(([x, z]) => add(box(0.04, 0.7, 0.04), std({ color: 0x8a7a68 }), x, 0.35, z, table));
    const stoolMat = std({ color: 0x6a4a32, roughness: 0.7 });
    [[0.2, 0.15], [-0.6, -0.55]].forEach(([x, z]) => {
      const st = group(kitchen, x, 0, z);
      add(box(0.36, 0.04, 0.36), stoolMat, 0, 0.46, 0, st);
      [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].forEach(([a, b]) => add(box(0.03, 0.44, 0.03), stoolMat, a, 0.22, b, st));
    });
    add(box(0.6, 1.6, 0.62), std({ color: 0xe8e6e0, roughness: 0.35 }), -KW / 2 + 0.38, 0.8, -KD / 2 + 0.4, kitchen);
    add(box(0.55, 0.85, 0.55), std({ color: 0xdedbd4, roughness: 0.4 }), -KW / 2 + 1.05, 0.43, -KD / 2 + 0.35, kitchen);
    add(box(0.12, 0.16, 0.02), std({ color: 0xc8a050, metalness: 0.5, roughness: 0.4 }), KW / 2 - 0.25, 2.05, -KD / 2 + 0.12, kitchen).rotation.y = -0.6;
    add(box(0.36, 0.5, 0.01), std({ color: 0xf2efe8 }), -0.6, 1.6, -KD / 2 + 0.06, kitchen);
    // фото сына с траурной лентой на стене
    const photoTex = tex(160, 200, (c, w, h) => {
      c.fillStyle = "#c9bca2";
      c.fillRect(0, 0, w, h);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#9aa3a0");
      g.addColorStop(1, "#5a5e58");
      c.fillStyle = g;
      c.fillRect(10, 10, w - 20, h - 20);
      c.fillStyle = "#4b4f3a";
      c.beginPath();
      c.ellipse(80, 200, 60, 70, 0, 0, 6.283);
      c.fill();
      c.fillStyle = "#c79a80";
      c.beginPath();
      c.ellipse(80, 98, 30, 38, 0, 0, 6.283);
      c.fill();
      c.fillStyle = "#2b211b";
      c.beginPath();
      c.ellipse(80, 72, 31, 16, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = "#2a1f1a";
      c.fillRect(64, 92, 9, 4);
      c.fillRect(88, 92, 9, 4);
      c.strokeStyle = "#7a4a40";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(80, 112, 9, 0.3, Math.PI - 0.3);
      c.stroke();
      // траурная лента
      c.fillStyle = "#0b0b0b";
      c.beginPath();
      c.moveTo(w - 50, 0);
      c.lineTo(w, 0);
      c.lineTo(w, 50);
      c.closePath();
      c.fill();
    });
    const photo = group(kitchen, 0.5, 1.62, -KD / 2 + 0.07);
    add(box(0.28, 0.35, 0.025), std({ color: 0x2a1c14 }), 0, 0, 0, photo);
    add(new T.PlaneGeometry(0.24, 0.31), std({ map: photoTex, roughness: 0.5 }), 0, 0, 0.014, photo, { noCast: true });
    // абажур и лампа
    const lampG = group(kitchen, 0.2, KH - 0.55, -0.6);
    add(new T.CylinderGeometry(0.004, 0.004, 0.5, 4), std({ color: 0x111111 }), 0, 0.3, 0, lampG, { noCast: true });
    const shade = add(new T.ConeGeometry(0.28, 0.2, 24, 1, true), std({ color: 0xc8823e, side: T.DoubleSide, emissive: new T.Color(0xff9a40), emissiveIntensity: 0.4 }), 0, 0, 0, lampG, { noCast: true });
    const bulb = add(new T.SphereGeometry(0.045, 10, 8), new T.MeshBasicMaterial({ color: 0xfff0d0 }), 0, -0.07, 0, lampG, { noCast: true });
    const kLamp = new T.SpotLight(0xffc68a, 0, 9, 1.0, 0.65, 1.6);
    kLamp.position.set(0.2, KH - 0.62, -0.6);
    kLamp.target.position.set(0.2, 0, -0.6);
    kLamp.castShadow = true;
    kLamp.shadow.mapSize.set(1024, 1024);
    kLamp.shadow.bias = -0.0005;
    kitchen.add(kLamp, kLamp.target);
    const kFill = new T.PointLight(0xffb070, 0, 8, 2);
    kFill.position.set(0.2, 1.7, 0.4);
    kitchen.add(kFill);
    const kHall = new T.PointLight(0x8090b0, 0, 5, 2);
    kHall.position.set(-0.2, 2.2, KD / 2 + 1.3);
    kitchen.add(kHall);
    const kAmb = new T.HemisphereLight(0x405070, 0x2a1d14, 0);
    kitchen.add(kAmb);
    // телефон сына в пакете с биркой, кабель от розетки
    const phone = group(kitchen, 0.45, 0.765, -0.45);
    phone.rotation.y = 0.35;
    add(box(0.078, 0.009, 0.16), std({ color: 0x0c0c0d, roughness: 0.3, metalness: 0.5 }), 0, 0, 0, phone);
    const screenMat = new T.MeshBasicMaterial({ color: 0x000000 });
    const screen = add(new T.PlaneGeometry(0.07, 0.15), screenMat, 0, 0.0052, 0, phone, { noCast: true });
    screen.rotation.x = -Math.PI / 2;
    const bag = add(box(0.12, 0.016, 0.22), std({ color: 0xffffff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.09, depthWrite: false }), 0, 0.004, 0.015, phone, { noCast: true });
    const tag = add(box(0.045, 0.002, 0.03), std({ color: 0xe8e2d2 }), 0.035, 0.013, 0.105, phone);
    tag.rotation.y = 0.2;
    const cableCurve = new T.CatmullRomCurve3([new T.Vector3(0.45, 0.77, -0.37), new T.Vector3(0.62, 0.77, -0.2), new T.Vector3(0.8, 0.6, -0.1), new T.Vector3(KW / 2 - 0.08, 0.35, -0.9)]);
    add(new T.TubeGeometry(cableCurve, 30, 0.004, 5), std({ color: 0xeeeeee }), 0, 0, 0, kitchen);
    // кружка, чайник
    add(new T.CylinderGeometry(0.045, 0.04, 0.1, 14), std({ color: 0xe8e0d0, roughness: 0.3 }), -0.05, 0.81, -0.75, kitchen);
    add(new T.SphereGeometry(0.12, 14, 10), std({ color: 0xb0b4b8, metalness: 0.8, roughness: 0.25 }), -KW / 2 + 1.05, 0.95, -KD / 2 + 0.35, kitchen).scale.y = 0.8;
    const barsik = cat(kitchen);
    barsik.g.position.set(-0.2, 0, KD / 2 + 1.95);
    barsik.g.rotation.y = 0; // сидит у входной двери и ждёт

    // ================= подвал =================
    const BW = 3.6, BD = 4.2, BH = 2.1;
    const bbrick = std({ map: brickTex.clone(), color: 0x9a8a7a });
    bbrick.map.needsUpdate = true;
    bbrick.map.repeat.set(3, 2);
    add(box(BW, BH, 0.2), bbrick, 0, BH / 2, -BD / 2, basement);
    add(box(0.2, BH, BD), bbrick, -BW / 2, BH / 2, 0, basement);
    add(box(0.2, BH, BD), bbrick, BW / 2, BH / 2, 0, basement);
    add(box(BW, BH, 0.2), bbrick, 0, BH / 2, BD / 2, basement);
    add(new T.PlaneGeometry(BW, BD), std({ map: mudTex.clone(), color: 0x8a7a6a }), 0, 0.001, 0, basement, { noCast: true }).rotation.x = -Math.PI / 2;
    add(box(BW, 0.12, BD), std({ color: 0x3a342c }), 0, BH + 0.06, 0, basement, { noCast: true });
    // полки с банками
    const shelfMat = std({ map: woodTex });
    for (let k = 0; k < 3; k++) add(box(0.32, 0.03, 2.6), shelfMat, -BW / 2 + 0.26, 0.55 + k * 0.48, -0.3, basement);
    const jarCols = [0xb8432a, 0x6a8a3a, 0xd8a040, 0x8a2a3a, 0xc8b070];
    const jarGlass = new T.MeshStandardMaterial({ color: 0xdde8e0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.35 });
    for (let k = 0; k < 3; k++) for (let i = 0; i < 9; i++) {
      if (r() < 0.25) continue;
      const jx = -BW / 2 + 0.26, jy = 0.57 + k * 0.48, jz = -1.5 + i * 0.27;
      const fill = add(new T.CylinderGeometry(0.06, 0.06, 0.15, 10), std({ color: jarCols[Math.floor(r() * 5)], roughness: 0.4 }), jx, jy + 0.08, jz, basement);
      add(new T.CylinderGeometry(0.066, 0.066, 0.2, 12), jarGlass, jx, jy + 0.1, jz, basement, { noCast: true });
      add(new T.CylinderGeometry(0.05, 0.05, 0.02, 10), std({ color: 0x9a9a92, metalness: 0.8, roughness: 0.3 }), jx, jy + 0.21, jz, basement);
    }
    // лаз и лестница, дневной свет сверху
    add(box(0.5, 0.06, 2.0), woodMat, 1.2, 1.0, 1.4, basement).rotation.x = 0.85;
    const hatch = new T.SpotLight(0xb8c8e0, 0, 8, 0.45, 0.6, 1.5);
    hatch.position.set(1.2, BH + 0.5, 1.9);
    hatch.target.position.set(0.8, 0, 1.0);
    basement.add(hatch, hatch.target);
    const shaft = add(new T.ConeGeometry(0.7, 2.4, 24, 1, true), new T.MeshBasicMaterial({ color: 0x9ab0c8, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }), 1.0, BH / 2, 1.5, basement, { noCast: true, noRecv: true });
    shaft.rotation.z = 0.2;
    // матрас, ящик, свеча; золотое спасательное одеяло
    add(box(0.8, 0.12, 1.7), std({ color: 0x5a6a7a, roughness: 1 }), 0.4, 0.06, -0.6, basement);
    add(box(0.4, 0.35, 0.3), woodMat, 1.35, 0.17, -1.5, basement);
    const candle = group(basement, 1.35, 0.35, -1.5);
    add(new T.CylinderGeometry(0.025, 0.025, 0.1, 10), std({ color: 0xf0ead8 }), 0, 0.05, 0, candle);
    const flame = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffb050, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    flame.scale.set(0.12, 0.2, 0.12);
    flame.position.set(0, 0.14, 0);
    candle.add(flame);
    const candleL = new T.PointLight(0xff9a48, 0, 6, 2);
    candleL.position.set(1.35, 0.6, -1.5);
    candleL.castShadow = true;
    candleL.shadow.mapSize.set(512, 512);
    candleL.shadow.bias = -0.006;
    candleL.shadow.normalBias = 0.04;
    basement.add(candleL);
    const headlamp = new T.PointLight(0xff3020, 0, 5, 2);
    headlamp.position.set(-0.5, 1.6, 0.6);
    basement.add(headlamp);
    const bAmb = new T.HemisphereLight(0x302820, 0x100c08, 0);
    basement.add(bAmb);
    const foilGeo = new T.PlaneGeometry(0.75, 0.86, 18, 22);
    {
      const p = foilGeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, (Math.sin(p.getX(i) * 31 + p.getY(i) * 7) * 0.012 + Math.sin(p.getY(i) * 23) * 0.01) + 0.11 * Math.cos(p.getX(i) * 3.2));
      foilGeo.computeVertexNormals();
    }
    const foil = add(foilGeo, std({ color: 0xd8a848, metalness: 0.25, roughness: 0.45, emissive: new T.Color(0x3a2808), side: T.DoubleSide }), 0.42, 0.26, -0.34, basement, { noCast: true });
    foil.rotation.x = -Math.PI / 2;

    // ================= свет посёлка =================
    const hemi = new T.HemisphereLight(0xa8b2c0, 0x3d342a, 1.2);
    village.add(hemi);
    const sun = new T.DirectionalLight(0xd8dde6, 2.2);
    sun.position.set(30, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -26;
    sun.shadow.camera.right = sun.shadow.camera.top = 26;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    village.add(sun, sun.target);
    const fireL = new T.PointLight(0xff7a30, 0, 60, 1.8);
    fireL.position.set(-30, 4, -40);
    village.add(fireL);
    const warmWin = new T.PointLight(0xffb060, 0, 6, 2); // огонёк в окне Сони (печка)
    warmWin.position.set(-10.2, 1.4, -1);
    village.add(warmWin);

    // окружение для отражений (лужи, металл, фольга): небо в PMREM
    const pm = new T.PMREMGenerator(ren);
    const envScene = new T.Scene();
    envScene.add(new T.Mesh(new T.SphereGeometry(10, 16, 8), skyMat));
    const envMap = pm.fromScene(envScene, 0.04).texture;
    sc.environment = envMap;
    foil.material.envMap = envMap;
    foil.material.envMapIntensity = 0.6;

    // ================= персонажи =================
    const P = PEOPLE3D;
    const chars = {
      denis: P.make({ kind: "soldier", seed: 22, wide: 0.94, scale: 0.97 }),
      shah: P.make({ kind: "soldier", seed: 5, wide: 1.1, scale: 1.04, backpack: true }),
      ded: P.make({ kind: "soldier", seed: 48, wide: 1.06, rifle: true }),
      s4: P.make({ kind: "soldier", seed: 11, rifle: true, backpack: true }),
      s5: P.make({ kind: "soldier", seed: 13, scale: 1.02, rifle: true }),
      medic: P.make({ kind: "medic", seed: 31 }),
      sonya: P.make({ kind: "girl", seed: 6 }),
      valya: P.make({ kind: "granny", seed: 71 }),
      mom: P.make({ kind: "mother", seed: 52 }),
    };
    Object.values(chars).forEach((c) => {
      c.s.visible = 0;
      sc.add(c.root);
    });
    chars.ded.s.sad = 0.3;
    // рисунок Сони — плоскость, которую Денис кладёт в карман
    const drawingTex = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#f4f2ec";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(90,130,200,0.35)";
      for (let i = 0; i < w; i += 16) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, h);
        c.stroke();
        c.beginPath();
        c.moveTo(0, i);
        c.lineTo(w, i);
        c.stroke();
      }
      c.strokeStyle = "rgba(230,130,40,0.75)";
      c.lineWidth = 6;
      c.beginPath();
      c.ellipse(128, 150, 55, 45, 0, 0, 6.283);
      c.stroke();
      c.beginPath();
      c.arc(128, 85, 32, 0, 6.283);
      c.stroke();
    });
    const drawing = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), std({ map: drawingTex, side: T.DoubleSide, roughness: 1 }));
    drawing.visible = false;
    sc.add(drawing);
    // шоколадка из сухпайка
    const choco = new T.Mesh(box(0.11, 0.012, 0.05), std({ color: 0x3f5a2a, roughness: 0.6 }));
    // телефон в руке: светящийся экран
    const handPhone = new T.Group();
    add(box(0.072, 0.15, 0.009), std({ color: 0x0c0c0d, roughness: 0.3, metalness: 0.5 }), 0, 0, 0, handPhone, { noCast: true });
    add(new T.PlaneGeometry(0.064, 0.138), new T.MeshBasicMaterial({ color: 0xbcd0ff }), 0, 0, 0.0052, handPhone, { noCast: true });
    const phoneGlow = new T.PointLight(0x9ab8ff, 0.2, 1.0, 2);
    phoneGlow.position.set(0, 0, 0.12);
    handPhone.add(phoneGlow);
    handPhone.visible = false;
    choco.visible = false;
    sc.add(choco);

    // ключевой свет сбоку от камеры и контровой из-за героя — для крупных планов
    const key = new T.SpotLight(0xffe2c4, 0, 12, 0.5, 0.7, 1.6);
    const rim = new T.SpotLight(0xa8c0e0, 0, 12, 0.6, 0.7, 1.6);
    sc.add(key, key.target, rim, rim.target);
    const vR = new T.Vector3(), vU = new T.Vector3(0, 1, 0), vF = new T.Vector3(), vT = new T.Vector3();

    // ================= постобработка =================
    const rt = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter, generateMipmaps: true, samples: 4 });
    rt.depthTexture = new T.DepthTexture(W, H);
    rt.depthTexture.type = T.UnsignedIntType;
    const post = new T.ShaderMaterial({
      glslVersion: T.GLSL3,
      depthTest: false, depthWrite: false,
      uniforms: {
        tCol: { value: rt.texture }, tDep: { value: rt.depthTexture },
        near: { value: cam.near }, far: { value: cam.far },
        focus: { value: 3 }, aperture: { value: 0 }, bloom: { value: 0.35 }, thr: { value: 0.9 },
        exposure: { value: 1 }, desat: { value: 0 }, sepia: { value: 0 }, flash: { value: 0 }, vig: { value: 0.45 },
        chroma: { value: 0.0015 }, thermal: { value: 0 }, lift: { value: new T.Vector3(0.0, 0.006, 0.016) }, contrast: { value: 0.35 }, gain: { value: new T.Vector3(1.04, 1.0, 0.94) },
        t: { value: 0 }, res: { value: new T.Vector2(W, H) }, red: { value: 0 },
      },
      vertexShader: "out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: [
        "precision highp float;",
        "in vec2 vUv; out vec4 outC;",
        "uniform sampler2D tCol; uniform sampler2D tDep;",
        "uniform float near, far, focus, aperture, bloom, thr, exposure, desat, sepia, flash, vig, chroma, thermal, t, red, contrast;",
        "uniform vec3 lift, gain; uniform vec2 res;",
        "float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }",
        "vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }",
        "vec3 sampleLod(vec2 uv, float l){",
        "  vec2 o = exp2(l) / res * 0.5;",
        "  return 0.25 * (textureLod(tCol, uv + vec2(o.x, o.y), l).rgb + textureLod(tCol, uv + vec2(-o.x, o.y), l).rgb",
        "       + textureLod(tCol, uv + vec2(o.x, -o.y), l).rgb + textureLod(tCol, uv + vec2(-o.x, -o.y), l).rgb);",
        "}",
        "float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + t) * 43758.5453); }",
        "void main(){",
        "  vec2 uv = vUv;",
        "  float z = lin(texture(tDep, uv).r);",
        "  float coc = clamp(aperture * abs(z - focus) / max(z, 0.05), 0.0, 4.5);",
        "  vec2 dc = (uv - 0.5) * chroma;",
        "  vec3 c;",
        "  if (coc < 0.05) c = vec3(texture(tCol, uv + dc).r, texture(tCol, uv).g, texture(tCol, uv - dc).b);",
        "  else { float l0 = floor(coc); vec3 a = l0 < 0.5 ? texture(tCol, uv).rgb : sampleLod(uv, l0); vec3 b = sampleLod(uv, l0 + 1.0); c = mix(a, b, coc - l0); }",
        "  vec3 bl = vec3(0.0);",
        "  bl += max(sampleLod(uv, 2.0) - thr, 0.0) * 0.35;",
        "  bl += max(sampleLod(uv, 3.0) - thr, 0.0) * 0.3;",
        "  bl += max(sampleLod(uv, 4.0) - thr * 0.8, 0.0) * 0.25;",
        "  bl += max(sampleLod(uv, 5.5) - thr * 0.7, 0.0) * 0.3;",
        "  c += bl * bloom;",
        "  c *= exposure;",
        "  c = aces(c);",
        "  c = pow(c, vec3(1.0/2.2));",
        "  c = c * gain + lift * (1.0 - c);",
        "  c = mix(c, c * c * (3.0 - 2.0 * c), contrast);",
        "  float L = dot(c, vec3(0.299, 0.587, 0.114));",
        "  c = mix(c, vec3(L), desat);",
        "  c = mix(c, vec3(L * 1.08, L * 0.92, L * 0.72) + vec3(0.04, 0.02, 0.0), sepia);",
        "  if (thermal > 0.0) {",
        "    float th = 0.18 + 0.82 * smoothstep(0.02, 0.55, L);",
        "    float scan = 0.94 + 0.06 * sin(uv.y * res.y * 1.2 + t * 30.0);",
        "    vec3 tc = vec3(th) * scan + (hash(uv * 400.0) - 0.5) * 0.12;",
        "    c = mix(c, tc, thermal);",
        "  }",
        "  vec2 q = uv - 0.5; q.x *= res.x / res.y;",
        "  c *= mix(1.0, smoothstep(0.95, 0.25, length(q)), vig);",
        "  c = mix(c, vec3(1.0, 0.25, 0.2) * L * 1.4, red);",
        "  c = mix(c, vec3(1.0, 0.97, 0.9), flash);",
        "  outC = vec4(c, 1.0);",
        "}",
      ].join("\n"),
    });
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), post);
    const postScene = new T.Scene();
    postScene.add(quad);
    const postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ================= состояние =================
    const state = {
      set: "village",
      camX: 0, camY: 1.7, camZ: 10, tgtX: 0, tgtY: 1.5, tgtZ: 0, fov: 40, roll: 0, shake: 0, hand: 1,
      focus: 6, aperture: 0, bloom: 0.4, exposure: 1, desat: 0.12, sepia: 0, flash: 0, vig: 0.5, chroma: 0.0015, thermal: 0, red: 0,
      contrast: 0.35, warm: -0.5, key: 0, keySide: 1, keyUp: 0.6, keyCol: 0xffe2c4, rim: 0, rimCol: 0xa8c0e0, day: 1, glow: 0.25, fire: 0, smoke: 1, chimney: 1, airDust: 0.2, dustX: -10, dustZ: 0,
      gate: 0, collapse: 0, heap: 0, blast: -1, bombK: -1, beamUp: 0, scarf: 0,
      d1: 0, d1x: 0, d1y: 25, d1z: 0, d2: 0, d2x: 0, d2y: 30, d2z: 0,
      kLamp: 1, phoneScreen: 0, phoneVib: 0, catTurn: 0,
      candle: 1, headlampRed: 0, hatch: 1,
      drawing: 0, drawHand: 0, drawX: 0, drawY: 0, drawZ: 0, drawRx: 0, drawRy: 0, choco: 0, chocoX: 0, chocoY: 0, chocoZ: 0,
      stopCandle: 0, warmWin: 0.6,
    };

    // части дома Сони: случайные траектории обрушения
    const sParts = sonyaHouse.userData.parts.map((p) => {
      const g = p.g;
      return {
        g, kind: p.kind, p0: g.position.clone(), r0: g.rotation.clone(),
        d: r() * 0.25, dr: new T.Vector3((r() - 0.5) * 1.2, (r() - 0.5) * 0.8, (r() - 0.5) * 1.2),
        drop: p.kind === "roof" ? 2.6 + r() * 0.8 : p.kind === "gable" ? 2.8 : p.kind === "chimney" ? 3.5 : 0,
        fall: p.kind === "wall" ? (1.2 + r() * 0.35) * (r() < 0.5 ? 1 : -1) : 0,
      };
    });

    const tv = new T.Vector3();
    const m4 = new T.Matrix4(), q4 = new T.Quaternion(), e4 = new T.Euler(), v4 = new T.Vector3(), s4 = new T.Vector3(1, 1, 1);

    function render(t) {
      const s = state;
      village.visible = s.set === "village";
      kitchen.visible = s.set === "kitchen";
      basement.visible = s.set === "basement";
      const off = s.set === "kitchen" ? 200 : s.set === "basement" ? -200 : 0;

      // камера: ручная тряска + удар
      const hx = Math.sin(t * 1.3) * 0.012 + Math.sin(t * 2.9 + 1) * 0.006;
      const hy = Math.sin(t * 1.7 + 2) * 0.01 + Math.sin(t * 3.7) * 0.004;
      const sh = s.shake;
      cam.position.set(s.camX + off + (hx + Math.sin(t * 37) * 0.06 * sh) * s.hand, s.camY + (hy + Math.sin(t * 43 + 1) * 0.06 * sh) * s.hand, s.camZ);
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(s.tgtX + off + Math.sin(t * 29) * 0.04 * sh, s.tgtY + Math.sin(t * 31) * 0.04 * sh, s.tgtZ);
      cam.rotateZ(s.roll + Math.sin(t * 0.9) * 0.004 * s.hand + Math.sin(t * 23) * 0.02 * sh);

      // посёлок: свет дня, небо, туман
      const day = s.day;
      hemi.intensity = 0.15 + 0.75 * day;
      sun.intensity = 0.1 + 1.5 * day;
      sun.position.set(s.dustX + 30, 40, s.dustZ + 25);
      sun.target.position.set(s.dustX, 0, s.dustZ);
      skyMat.uniforms.top.value.setRGB(lerp(0.015, 0.13, day), lerp(0.02, 0.15, day), lerp(0.04, 0.19, day));
      skyMat.uniforms.hor.value.setRGB(lerp(0.05, 0.36, day), lerp(0.05, 0.37, day), lerp(0.07, 0.4, day));
      skyMat.uniforms.glowK.value = s.glow;
      skyMat.uniforms.t.value = t;
      sc.fog.color.setRGB(lerp(0.035, 0.3, day), lerp(0.037, 0.31, day), lerp(0.045, 0.335, day));
      sc.fog.density = s.set === "village" ? 0.012 + s.airDust * 0.012 : 0.02;
      if (s.set !== "village") sc.fog.color.setRGB(0.02, 0.018, 0.016);
      fireL.intensity = 400 * s.fire * (0.8 + 0.2 * Math.sin(t * 13));
      warmWin.intensity = 3 * s.warmWin * (0.85 + 0.15 * Math.sin(t * 9));
      stopCandle.intensity = 1.2 * s.stopCandle * (0.85 + 0.15 * Math.sin(t * 11));

      // ворота
      leafL.rotation.y = -s.gate * 1.2;
      leafR.rotation.y = s.gate * 0.3;

      // дым
      smokeSprites.forEach((sp) => {
        const u = sp.userData, k = (u.k + t * 0.012) % 1;
        sp.position.set(u.x + Math.sin(k * 3 + u.ph) * 4 + k * 18, k * 70, u.z);
        const sz = u.size * (0.5 + k * 1.4);
        sp.scale.set(sz, sz, 1);
        sp.material.opacity = s.smoke * Math.sin(k * Math.PI) * (u.dark ? 0.75 : 0.5);
        sp.material.color.setScalar(u.dark ? 0.12 + 0.12 * day : 0.25 + 0.3 * day);
      });
      chimneySmoke.forEach((sp, i) => {
        const k = (i / chimneySmoke.length + t * 0.08) % 1;
        sp.position.set(-12.5 + 0.0 + k * 1.5, 5.2 + k * 4, -1 - 0.6 + Math.sin(k * 5 + t) * 0.3);
        const sz = 0.6 + k * 2.6;
        sp.scale.set(sz, sz, 1);
        sp.material.opacity = s.chimney * Math.sin(k * Math.PI) * 0.35 * (1 - s.collapse);
        sp.material.color.setScalar(0.3 + 0.35 * day);
      });

      // пыль в воздухе вокруг точки интереса
      const dp = dust.geometry.attributes.position.array;
      const dx0 = s.set === "village" ? s.dustX : off, dz0 = s.set === "village" ? s.dustZ : 0;
      const span = s.set === "village" ? 14 : 3.5;
      for (let i = 0; i < dustN; i++) {
        const a = dustSeed[i * 3], b = dustSeed[i * 3 + 1], c = dustSeed[i * 3 + 2];
        dp[i * 3] = dx0 + (((a + t * 0.01 * (b - 0.5)) % 1) - 0.5) * span;
        dp[i * 3 + 1] = ((b + t * 0.006 * (c + 0.2)) % 1) * (s.set === "village" ? 6 : 2.2);
        dp[i * 3 + 2] = dz0 + (((c + t * 0.008) % 1) - 0.5) * span;
      }
      dust.geometry.attributes.position.needsUpdate = true;
      dustMat.opacity = s.airDust;
      dustMat.size = s.set === "village" ? 0.05 : 0.018;

      // обрушение дома Сони
      sParts.forEach((p) => {
        const k = ease(clamp01((s.collapse - p.d) / 0.7));
        p.g.visible = s.heap < 0.98 || k < 1;
        p.g.position.set(p.p0.x, p.p0.y - p.drop * k, p.p0.z);
        p.g.rotation.set(p.r0.x + p.dr.x * k, p.r0.y + p.dr.y * k * 0.3, p.r0.z + p.dr.z * k);
        if (p.kind === "wall") p.g.rotation.x = p.r0.x + p.fall * k;
        p.g.scale.y = 1 - 0.55 * k;
      });
      heap.visible = s.heap > 0.01;
      heap.scale.set(1, Math.max(0.01, ease(s.heap)), 1);
      // балку поднимают и отваливают на кучу
      sonyaBeam.position.set(3.55 - s.beamUp * 1.6, 0.6 + Math.sin(s.beamUp * Math.PI) * 0.5 + s.beamUp * 0.35, 1.3 - s.beamUp * 0.6);
      sonyaBeam.rotation.set(0.1 - s.beamUp * 0.3, 0.25 + s.beamUp * 0.6, 0.12);
      scarfOnHeap.visible = s.scarf > 0.5;

      // бомба: планирует к дому по прямой
      bomb.visible = s.bombK >= 0 && s.bombK < 1;
      if (bomb.visible) {
        const k = s.bombK;
        bomb.position.set(lerp(-12.5 + 90, -12.5, k), lerp(70, 1.5, k), lerp(-1 - 240, -1, k));
        bomb.lookAt(-12.5, 0, -1);
      }
      // взрыв
      const b = s.blast;
      fx.visible = b >= 0;
      if (b >= 0) {
        const fk = clamp01(b / 0.35);
        fireball.scale.setScalar(1 + 9 * ease(fk));
        fireball.material.opacity = b < 0.35 ? 1 - fk * 0.4 : Math.max(0, 0.6 - (b - 0.35) * 1.5);
        fireball.material.color.setRGB(1, 0.65 - fk * 0.3, 0.35 - fk * 0.25);
        ring.scale.setScalar(1 + b * 30);
        ring.material.opacity = Math.max(0, 0.8 - b * 0.7);
        blastLight.intensity = 60000 * Math.exp(-b * 6);
        blastSmoke.forEach((sp) => {
          const u = sp.userData, k = clamp01(b / 2.5);
          const rad = u.out * 14 * (1 - Math.exp(-b * 2));
          sp.position.set(Math.cos(u.a) * rad, 1 + u.up * 16 * (1 - Math.exp(-b * 0.9)) + u.ph * 2, Math.sin(u.a) * rad);
          const sz = u.s * (0.5 + Math.min(b, 3) * 0.55);
          sp.scale.set(sz, sz, 1);
          sp.material.opacity = Math.min(0.75, b * 3) * (1 - k * 0.45);
          sp.material.color.setRGB(0.16 + 0.6 * Math.exp(-b * 3), 0.14 + 0.3 * Math.exp(-b * 3), 0.12);
        });
        for (let i = 0; i < debrisN; i++) {
          const v = debrisV[i];
          let tt = Math.min(b * 1.4, 3);
          let y = 1 + v[1] * tt - 4.9 * tt * tt;
          const land = y < 0.05;
          if (land) y = 0.05;
          const kk = land ? (v[1] + Math.sqrt(v[1] * v[1] + 4 * 4.9)) / (2 * 4.9) : tt;
          e4.set(v[3] * kk, v[4] * kk, 0);
          q4.setFromEuler(e4);
          m4.compose(v4.set(v[0] * kk, y, v[2] * kk), q4, s4);
          debris.setMatrixAt(i, m4);
        }
        debris.instanceMatrix.needsUpdate = true;
      } else blastLight.intensity = 0;

      // дроны
      [[s.d1, s.d1x, s.d1y, s.d1z], [s.d2, s.d2x, s.d2y, s.d2z]].forEach(([on, x, y, z], i) => {
        const d = drones[i];
        d.g.visible = on > 0.01 && s.set === "village";
        const air = y > 0.4 ? 1 : 0; // на земле — «ждун»: не шевелится, винты стоят
        d.g.position.set(x + Math.sin(t * 1.3 + i) * 0.15 * air, y + Math.sin(t * 2.1 + i) * 0.1 * air, z);
        d.g.rotation.set(Math.sin(t * 1.1) * 0.08 * air, air ? t * 0.2 + i : 0.4, Math.sin(t * 0.9) * 0.08 * air);
        d.props.forEach((p, k) => (p.rotation.z = air ? t * 90 + k : k));
        d.props.forEach((p) => {
          p.visible = !!air;
          p.userData.blade.visible = !air;
        });
        const blink = Math.sin(t * 6 + i * 2) > 0.2 ? 1 : 0.15;
        d.ledGlow.material.opacity = blink;
      });

      // кухня
      kLamp.intensity = 7 * s.kLamp;
      kFill.intensity = 1.2 * s.kLamp;
      kHall.intensity = 0.8 + 2.2 * (1 - s.kLamp);
      kAmb.intensity = 0.25;
      shade.material.emissiveIntensity = 0.5 * s.kLamp;
      const vib = s.phoneVib > 0 ? Math.sin(t * 160) * 0.0012 * s.phoneVib : 0;
      phone.position.set(0.45 + vib, 0.765 + Math.abs(vib) * 0.4, -0.45 + vib * 0.5);
      phone.rotation.y = 0.35 + vib * 2;
      screenMat.color.setRGB(0.55 * s.phoneScreen, 0.62 * s.phoneScreen, 0.75 * s.phoneScreen);
      barsik.head.rotation.y = s.catTurn * 0.9;

      // подвал
      const fl = 0.8 + 0.12 * Math.sin(t * 17) + 0.08 * Math.sin(t * 31 + 1);
      candleL.intensity = 4 * s.candle * fl;
      flame.material.opacity = s.candle;
      flame.scale.set(0.12, 0.2 * fl, 0.12);
      headlamp.intensity = 3 * s.headlampRed;
      hatch.intensity = 18 * s.hatch;
      shaft.material.opacity = 0.05 * s.hatch;
      bAmb.intensity = 0.3;

      // предметы в руках
      drawing.visible = s.drawing > 0.5;
      if (s.drawHand > 0.5) {
        // рисунок в правой руке Дениса
        chars.denis.update(t);
        chars.denis.root.updateMatrixWorld(true);
        chars.denis.hands[1].getWorldPosition(drawing.position);
        drawing.position.y -= 0.08;
        drawing.position.x += off;
        drawing.quaternion.copy(chars.denis.root.quaternion);
        drawing.rotateX(-0.4);
      } else {
        drawing.position.set(s.drawX + off, s.drawY, s.drawZ);
        drawing.rotation.set(s.drawRx, s.drawRy, 0);
      }
      choco.visible = s.choco > 0.5;
      choco.position.set(s.chocoX + off, s.chocoY, s.chocoZ);

      Object.values(chars).forEach((c) => {
        c.s.thermal = s.thermal;
        c.update(t);
        c.root.position.x += off;
      });
      sc.environment = s.set === "village" ? envMap : null;

      vT.set(s.tgtX + off, s.tgtY, s.tgtZ);
      vF.subVectors(vT, cam.position).normalize();
      vR.crossVectors(vF, vU).normalize();
      key.position.copy(cam.position).addScaledVector(vR, s.keySide * 1.4).addScaledVector(vU, s.keyUp).addScaledVector(vF, 0.3);
      key.target.position.copy(vT);
      key.intensity = s.key * 14;
      key.color.setHex(s.keyCol);
      rim.position.copy(vT).addScaledVector(vF, 2.2).addScaledVector(vU, 1.2).addScaledVector(vR, -s.keySide * 0.8);
      rim.target.position.copy(vT);
      rim.intensity = s.rim * 26;
      rim.color.setHex(s.rimCol);

      // кадр в HDR-цель → постобработка на экран
      ren.setRenderTarget(rt);
      ren.render(sc, cam);
      ren.setRenderTarget(null);
      const u = post.uniforms;
      u.focus.value = s.focus;
      u.aperture.value = s.aperture;
      u.bloom.value = s.bloom;
      u.exposure.value = s.exposure;
      u.desat.value = s.desat;
      u.sepia.value = s.sepia;
      u.flash.value = s.flash;
      u.vig.value = s.vig;
      u.chroma.value = s.chroma + s.shake * 0.006;
      u.thermal.value = s.thermal;
      u.red.value = s.red;
      u.t.value = t;
      u.contrast.value = s.contrast;
      u.gain.value.set(1 + 0.05 * s.warm, 1, 1 - 0.07 * s.warm);
      u.lift.value.set(0.004 * Math.max(0, s.warm), 0.006, 0.02 * Math.max(0, -s.warm) + 0.004);
      ren.render(postScene, postCam);
    }

    return { state, render, chars, cam, scene: sc, parts: { scarfOnHeap, drawing, choco, heap, gates, handPhone } };
  }
  return { create };
})();
