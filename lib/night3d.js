// NIGHT3D — мир части 2 «Девять часов»: подвал, двор с завалом, дорога с «таблеткой», лесополоса,
// точка эвакуации, море (воспоминание), утро. Люди — HUMAN3D (MakeHuman), поверхности — фототекстуры Poly Haven (CC0).
// const W = NIGHT3D.create(canvas, { res }); W.ready → Promise; W.state.* → W.render(t).
// Камера и персонажи задаются в координатах текущей локации (state.set); локации разнесены по x.
window.NIGHT3D = (function () {
  const T = THREE;
  const TEX = "assets/lib/tex/";
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => x * x * (3 - 2 * x);
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvasTex(w, h, draw, srgb) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    if (srgb !== false) t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  // слить несколько геометрий (позиции, нормали, uv) в одну
  function merge(geos) {
    let nv = 0, ni = 0;
    for (const g of geos) {
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, ov * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, ov * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2);
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
      else for (let i = 0; i < n; i++) idx[oi + i] = ov + i;
      oi += g.index ? g.index.count : n;
      ov += n;
    }
    const out = new T.BufferGeometry();
    out.setAttribute("position", new T.BufferAttribute(pos, 3));
    out.setAttribute("normal", new T.BufferAttribute(nor, 3));
    out.setAttribute("uv", new T.BufferAttribute(uv, 2));
    out.setIndex(new T.BufferAttribute(idx, 1));
    return out;
  }
  function bend(geo, fn) {
    const a = geo.attributes.position;
    const v = new T.Vector3();
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      fn(v, i);
      a.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // поза из полей who; pose2 — только настоящая поза (gsap превращает null в 0/"null")
  const okPose = (p) => (typeof p === "string" ? window.HUMAN3D.POSES[p] : p && typeof p === "object" ? p : null);
  const poseOf = (w) => {
    const a = okPose(w.pose) || "stand", b = okPose(w.pose2);
    return b ? window.HUMAN3D.mix(a, b, w.pk || 0) : a;
  };
  function create(canvas, opt) {
    opt = opt || {};
    T.ColorManagement.legacyMode = false;
    const RES = opt.res || 0.62;
    canvas.width = Math.round(1080 * RES);
    canvas.height = Math.round(1920 * RES);
    const W = canvas.width, H = canvas.height;
    const r = rng(opt.seed || 2142);
    const ren = new T.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    ren.setSize(W, H, false);
    ren.physicallyCorrectLights = true;
    ren.outputEncoding = T.LinearEncoding;
    ren.toneMapping = T.NoToneMapping;
    ren.shadowMap.enabled = true;
    ren.shadowMap.type = T.PCFSoftShadowMap;
    const sc = new T.Scene();
    sc.fog = new T.FogExp2(0x05070a, 0.02);
    const cam = new T.PerspectiveCamera(40, W / H, 0.02, 900);
    const pending = [];

    // ---------- фототекстуры ----------
    const loader = new T.TextureLoader();
    const texCache = {};
    function ltex(file, srgb, rep) {
      const key = file + "|" + (rep || "");
      if (texCache[key]) return texCache[key];
      const t = loader.load(TEX + file);
      pending.push(new Promise((res) => {
        const img = new Image();
        img.onload = img.onerror = () => res();
        img.src = TEX + file;
      }));
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.anisotropy = 8;
      if (rep) t.repeat.set(rep[0], rep[1]);
      if (srgb) t.encoding = T.sRGBEncoding;
      texCache[key] = t;
      return t;
    }
    // материал из набора Poly Haven: name_d/_n/_r.jpg; rep — повторы; color — множитель цвета
    const matCache = {};
    function pbr(name, rep, o) {
      o = o || {};
      const rp = Array.isArray(rep) ? rep : [rep || 1, rep || 1];
      const key = name + "|" + rp + "|" + JSON.stringify(o);
      if (matCache[key]) return matCache[key];
      const m = new T.MeshStandardMaterial({
        map: ltex(name + "_d.jpg", true, rp), normalMap: ltex(name + "_n.jpg", false, rp), roughnessMap: ltex(name + "_r.jpg", false, rp),
        color: o.color != null ? o.color : 0xffffff, roughness: o.roughness != null ? o.roughness : 1, metalness: o.metal || 0,
        normalScale: new T.Vector2(o.ns || 1, -(o.ns || 1)), side: o.side || T.FrontSide,
      });
      matCache[key] = m;
      return m;
    }
    const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
    const add = (geo, mat, x, y, z, parent, o) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = !(o && o.noCast);
      m.receiveShadow = !(o && o.noRecv);
      if (o && o.heat != null) m.userData.heat = o.heat;
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
    // коробка с uv в метрах (текстура не тянется)
    function mbox(w, h, d, tile) {
      const g = new T.BoxGeometry(w, h, d);
      const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
      const k = 1 / (tile || 1);
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (nx > 0.5) uv.setXY(i, z * k, y * k);
        else if (ny > 0.5) uv.setXY(i, x * k, z * k);
        else uv.setXY(i, x * k, y * k);
      }
      return g;
    }

    const glowTex = canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    const smokeTex = canvasTex(128, 128, (c) => {
      const rr = rng(77);
      for (let i = 0; i < 30; i++) {
        const x = 28 + rr() * 72, y = 28 + rr() * 72, rad = 12 + rr() * 28;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, "rgba(255,255,255,0.3)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
      }
    });
    const flameTex = canvasTex(64, 128, (c) => {
      const g = c.createRadialGradient(32, 84, 2, 32, 74, 40);
      g.addColorStop(0, "rgba(255,255,240,1)");
      g.addColorStop(0.25, "rgba(255,210,120,0.95)");
      g.addColorStop(0.6, "rgba(255,120,30,0.5)");
      g.addColorStop(1, "rgba(255,80,0,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(32, 4);
      c.bezierCurveTo(50, 50, 58, 90, 32, 124);
      c.bezierCurveTo(6, 90, 14, 50, 32, 4);
      c.fill();
    });

    // небо: панорама на большой сфере (фон), яркость — state.skyK
    function skyDome(file, parent) {
      const t = ltex(file, true);
      t.wrapS = T.RepeatWrapping;
      const m = new T.MeshBasicMaterial({ map: t, side: T.BackSide, fog: false, depthWrite: false, color: 0xffffff });
      const s = new T.Mesh(new T.SphereGeometry(800, 64, 32), m);
      s.renderOrder = -10;
      parent.add(s);
      return s;
    }

    // ---------- общие предметы ----------
    const metalDark = std({ color: 0x1b1c1a, roughness: 0.55, metalness: 0.6 });
    const polymer = std({ color: 0x141414, roughness: 0.7 });
    const woodStock = pbr("wood_table_worn", 0.3, { color: 0x6a4a34 });
    function rifle(parent) {
      const g = new T.Group();
      add(box(0.05, 0.075, 0.26), metalDark, 0, 0, 0, g);
      add(new T.CylinderGeometry(0.009, 0.009, 0.42, 8), metalDark, 0, 0.012, 0.33, g).rotation.x = Math.PI / 2;
      add(new T.CylinderGeometry(0.011, 0.011, 0.24, 8), metalDark, 0, 0.042, 0.2, g).rotation.x = Math.PI / 2;
      add(box(0.052, 0.06, 0.2), woodStock, 0, 0.0, 0.2, g);
      const mag = add(new T.TorusGeometry(0.16, 0.017, 6, 12, 0.85), polymer, 0, -0.2, 0.18, g);
      mag.rotation.set(0, Math.PI / 2, 2.1);
      add(box(0.04, 0.09, 0.03), polymer, 0, -0.07, -0.08, g).rotation.x = 0.35;
      const st = add(box(0.035, 0.07, 0.3), polymer, 0, -0.03, -0.27, g);
      st.rotation.x = 0.12;
      (parent || sc).add(g);
      return g;
    }
    // рисунок Сони: лист в клетку, рыжий кот фломастером, «ДЕНИСУ»
    const drawingTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = "#ece7dc";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(80,120,190,0.28)";
      c.lineWidth = 2;
      for (let i = 0; i <= w; i += 24) {
        c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke();
        c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke();
      }
      c.lineCap = "round";
      c.strokeStyle = "rgba(225,120,30,0.85)";
      c.lineWidth = 9;
      c.beginPath(); c.ellipse(250, 300, 110, 85, 0, 0, 6.283); c.stroke();
      c.beginPath(); c.arc(250, 175, 62, 0, 6.283); c.stroke();
      c.beginPath(); c.moveTo(200, 130); c.lineTo(190, 80); c.lineTo(232, 118); c.stroke();
      c.beginPath(); c.moveTo(300, 130); c.lineTo(312, 80); c.lineTo(270, 118); c.stroke();
      c.beginPath(); c.moveTo(355, 330); c.quadraticCurveTo(440, 320, 420, 230); c.stroke();
      c.strokeStyle = "rgba(30,30,30,0.85)";
      c.lineWidth = 6;
      c.beginPath(); c.moveTo(225, 168); c.lineTo(226, 178); c.moveTo(275, 168); c.lineTo(276, 178); c.stroke();
      c.beginPath(); c.moveTo(232, 198); c.quadraticCurveTo(250, 210, 268, 198); c.stroke();
      c.strokeStyle = "rgba(210,50,45,0.85)";
      c.lineWidth = 7;
      c.beginPath(); c.moveTo(410, 120); c.bezierCurveTo(380, 85, 350, 120, 410, 160); c.bezierCurveTo(470, 120, 440, 85, 410, 120); c.stroke();
      c.fillStyle = "rgba(50,85,170,0.9)";
      c.font = "bold 58px 'Comic Sans MS', sans-serif";
      c.fillText("ДЕНИСУ", 120, 470);
      // сгибы
      c.strokeStyle = "rgba(0,0,0,0.12)";
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    });
    const drawing = new T.Mesh(bend(new T.PlaneGeometry(0.2, 0.2, 8, 8), (v) => { v.z = Math.abs(v.x) * 0.08 + Math.abs(v.y) * 0.03; }), std({ map: drawingTex, side: T.DoubleSide, roughness: 0.95 }));
    drawing.castShadow = true;
    sc.add(drawing);
    // телефон
    const phone = new T.Group();
    add(box(0.072, 0.152, 0.009), std({ color: 0x0b0b0c, roughness: 0.3, metalness: 0.5 }), 0, 0, 0, phone, { noCast: true });
    const phoneScr = add(new T.PlaneGeometry(0.066, 0.142), new T.MeshBasicMaterial({ color: 0xbcd0ff }), 0, 0, 0.0052, phone, { noCast: true });
    const phoneGlow = new T.PointLight(0xaabfff, 0, 1.2, 2);
    phoneGlow.position.set(0, 0, 0.15);
    phone.add(phoneGlow);
    sc.add(phone);

    // ---------- частицы: огонь, дым, пар ----------
    function sprites(n, tex, blending, parent) {
      const arr = [];
      for (let i = 0; i < n; i++) {
        const m = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: blending || T.NormalBlending, fog: true });
        const s = new T.Sprite(m);
        s.userData = { a: r(), b: r(), c: r(), d: r() };
        (parent || sc).add(s);
        arr.push(s);
      }
      return arr;
    }
    // огонь + дым над точкой (x,y,z) в группе parent
    function fireAt(parent, x, y, z, size) {
      const g = group(parent, x, y, z);
      const flames = sprites(26, glowTex, T.AdditiveBlending, g);
      const smoke = sprites(30, smokeTex, T.NormalBlending, g);
      const light = new T.PointLight(0xff7a2a, 0, 40 * size, 2);
      light.position.set(0, 1.2 * size, 0);
      light.castShadow = false;
      g.add(light);
      return { g, flames, smoke, light, size };
    }
    function updateFire(f, t, k) {
      f.g.visible = k > 0.001;
      if (!f.g.visible) return;
      const S = f.size;
      f.flames.forEach((s, i) => {
        const u = s.userData, ph = (u.a + t * (0.9 + u.b)) % 1;
        s.position.set((u.c - 0.5) * 1.6 * S * (1 - ph * 0.5), ph * 2.4 * S, (u.d - 0.5) * 1.0 * S);
        const sz = S * (0.9 - ph * 0.6) * (0.8 + u.b * 0.6);
        s.scale.set(sz, sz * 1.5, 1);
        s.material.opacity = k * Math.sin(ph * Math.PI) * 0.9;
        s.material.color.setRGB(1, 0.42 + 0.3 * (1 - ph), 0.12 * (1 - ph));
      });
      f.smoke.forEach((s) => {
        const u = s.userData, ph = (u.a + t * 0.06 * (0.7 + u.b)) % 1;
        s.position.set((u.c - 0.5) * S + ph * 6 * S, 1.5 * S + ph * 18 * S, (u.d - 0.5) * S);
        const sz = S * (1.5 + ph * 7);
        s.scale.set(sz, sz, 1);
        s.material.opacity = k * Math.sin(ph * Math.PI) * 0.55;
        s.material.color.setScalar(0.05 + 0.08 * (1 - ph));
      });
      f.light.intensity = k * 900 * S * S * (0.8 + 0.2 * Math.sin(t * 13) + 0.1 * Math.sin(t * 29));
    }
    // пар изо рта
    const breath = sprites(14, smokeTex, T.NormalBlending);

    // ================= ЛОКАЦИИ =================
    const sets = {};
    const OFF = { cellar: 0, yard: 100, road: 300, field: 600, evac: 900, sea: 1200, morning: 1500 };
    for (const k in OFF) sets[k] = group(null, OFF[k], 0, 0);

    // ---------- подвал ----------
    const C = sets.cellar;
    {
      const brick = pbr("red_brick_03", [2, 1.1], { color: 0x9a8880 });
      const conc = pbr("concrete_layers_02", [2, 1], { color: 0x9a948c });
      const floorM = pbr("concrete_floor_worn_001", [2.5, 3], { color: 0x8a847c });
      const ceilM = pbr("cracked_concrete_wall", [2, 2.5], { color: 0x6f6a64 });
      const planks = pbr("weathered_brown_planks", [1, 1], { color: 0x9a8a78 });
      const ply = pbr("plywood", [1, 1], { color: 0x8a7a62 });
      add(new T.PlaneGeometry(4.2, 5.2), floorM, 0, 0, 0, C, { noCast: true }).rotation.x = -Math.PI / 2;
      const wb = add(new T.PlaneGeometry(4.2, 2.2), brick, 0, 1.1, -2.6, C, { noCast: true });
      const wl = add(new T.PlaneGeometry(5.2, 2.2), brick, -2.1, 1.1, 0, C, { noCast: true });
      wl.rotation.y = Math.PI / 2;
      const wr = add(new T.PlaneGeometry(5.2, 2.2), conc, 2.1, 1.1, 0, C, { noCast: true });
      wr.rotation.y = -Math.PI / 2;
      const wf = add(new T.PlaneGeometry(4.2, 2.2), conc, 0, 1.1, 2.6, C, { noCast: true });
      wf.rotation.y = Math.PI;
      // потолок с проёмом люка (x 1.1..1.9, z 1.0..1.9)
      const ceil = (x0, x1, z0, z1) => {
        const p = add(new T.PlaneGeometry(x1 - x0, z1 - z0), ceilM, (x0 + x1) / 2, 2.2, (z0 + z1) / 2, C, { noCast: true });
        p.rotation.x = Math.PI / 2;
      };
      ceil(-2.1, 1.1, -2.6, 2.6);
      ceil(1.1, 2.1, -2.6, 1.0);
      ceil(1.1, 2.1, 1.9, 2.6);
      ceil(1.9, 2.1, 1.0, 1.9);
      for (const z of [-1.6, -0.4, 0.8]) add(mbox(4.2, 0.16, 0.14, 1), planks, 0, 2.12, z, C);
      // лестница к люку
      for (let i = 0; i < 7; i++) add(mbox(0.75, 0.04, 0.24, 1), planks, 1.5, 0.28 + i * 0.28, 0.5 + i * 0.2, C);
      for (const x of [1.1, 1.9]) {
        const s = add(mbox(0.05, 2.5, 0.12, 1), planks, x, 1.12, 1.1, C);
        s.rotation.x = 0.62;
      }
      // небо в люке и столб света
      add(new T.PlaneGeometry(0.8, 0.9), new T.MeshBasicMaterial({ color: 0x1c2738, fog: false }), 1.5, 2.6, 1.45, C, { noCast: true }).rotation.x = Math.PI / 2;
      const hatchSpot = new T.SpotLight(0x8aa0c8, 0, 6, 0.55, 0.8, 1.5);
      hatchSpot.position.set(1.5 + OFF.cellar, 2.6, 1.45);
      hatchSpot.target.position.set(1.2 + OFF.cellar, 0, 0.9);
      sc.add(hatchSpot, hatchSpot.target);
      sets.cellar.userData.hatch = hatchSpot;
      // полки с банками
      const glass = new T.MeshPhysicalMaterial({ color: 0xcfd8d0, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.35, clearcoat: 1 });
      const jamCols = [0x5a1a14, 0x6b4a14, 0x3a4a1c, 0x7a2a18, 0x4a3018];
      for (let s = 0; s < 3; s++) {
        add(mbox(2.2, 0.03, 0.3, 1), planks, -0.6, 0.55 + s * 0.48, -2.43, C);
        for (let j = 0; j < 9; j++) {
          if (r() < 0.25) continue;
          const x = -1.6 + j * 0.24 + r() * 0.05, hh = 0.14 + r() * 0.08;
          add(new T.CylinderGeometry(0.05, 0.05, hh, 14), glass, x, 0.57 + s * 0.48 + hh / 2, -2.43, C);
          add(new T.CylinderGeometry(0.045, 0.045, hh * 0.8, 10), std({ color: jamCols[(j + s) % 5], roughness: 0.4 }), x, 0.57 + s * 0.48 + hh * 0.4, -2.43, C);
          add(new T.CylinderGeometry(0.052, 0.052, 0.015, 14), std({ color: 0x8a8f90, metalness: 0.8, roughness: 0.4 }), x, 0.57 + s * 0.48 + hh + 0.007, -2.43, C);
        }
      }
      // мешки с картошкой
      const sackM = std({ color: 0x6e604a, roughness: 1 });
      for (let i = 0; i < 4; i++) {
        const s = add(bend(new T.SphereGeometry(0.3, 16, 12), (v) => { v.y = v.y < -0.1 ? -0.2 : v.y * (1 + Math.sin(v.x * 30) * 0.03); v.x *= 0.9; }), sackM, -1.75 + (i % 2) * 0.35, 0.2, 1.6 + Math.floor(i / 2) * 0.5, C);
        s.rotation.y = r() * 3;
      }
      // ящики
      const crate = (x, y, z, w, h, d, ry) => { const b = add(mbox(w, h, d, 0.6), planks, x, y + h / 2, z, C); b.rotation.y = ry || 0; return b; };
      crate(-0.4, 0, -0.6, 0.5, 0.36, 0.4, 0.2); // ящик со свечой
      crate(1.6, 0, -1.75, 0.6, 0.42, 0.45, -0.1); // на нём сидит медик
      crate(1.75, 0, -2.3, 0.5, 0.3, 0.3, 0.15);
      crate(-1.65, 0, -0.9, 0.55, 0.4, 0.45, 0.4);
      // матрас на поддоне
      const pallet = add(mbox(0.95, 0.13, 1.95, 1), ply, -1.25, 0.065, 0.1, C);
      const tick = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = "#8e8a80"; c.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 16) { c.fillStyle = "rgba(60,70,90,0.45)"; c.fillRect(x, 0, 5, h); }
        const rr = rng(5);
        for (let i = 0; i < 30; i++) { c.fillStyle = "rgba(70,50,30," + rr() * 0.3 + ")"; c.beginPath(); c.arc(rr() * w, rr() * h, 6 + rr() * 30, 0, 6.28); c.fill(); }
      });
      tick.wrapS = tick.wrapT = T.RepeatWrapping;
      tick.repeat.set(2, 4);
      const mattress = add(bend(new T.BoxGeometry(0.9, 0.14, 1.9, 8, 2, 16), (v) => { if (v.y > 0) v.y += Math.sin(v.x * 9) * 0.008 + Math.sin(v.z * 7) * 0.01; }), std({ map: tick, roughness: 1 }), -1.25, 0.2, 0.1, C);
      // старое одеяло
      const wool = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = "#5a3b33"; c.fillRect(0, 0, w, h);
        c.strokeStyle = "rgba(200,170,120,0.35)"; c.lineWidth = 10;
        for (let y = 20; y < h; y += 60) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        const rr = rng(9);
        for (let i = 0; i < 4000; i++) { c.fillStyle = "rgba(0,0,0," + rr() * 0.15 + ")"; c.fillRect(rr() * w, rr() * h, 2, 2); }
      });
      const blanket = add(bend(new T.PlaneGeometry(1.0, 1.1, 20, 20), (v) => { v.z = Math.sin(v.x * 8 + v.y * 3) * 0.02 + Math.max(0, Math.abs(v.x) - 0.42) * -0.6; }), std({ map: wool, roughness: 1, side: T.DoubleSide }), -1.25, 0.29, 0.55, C);
      blanket.rotation.x = -Math.PI / 2;
      // фольга-одеяло (спасательное): мятое золото
      const foilGeo = bend(new T.PlaneGeometry(1.2, 1.4, 40, 40), (v) => {
        v.z = (Math.sin(v.x * 37) * Math.cos(v.y * 29) + Math.sin(v.x * 71 + v.y * 53) * 0.5) * 0.012;
      });
      const foilMat = std({ color: 0xd8b060, metalness: 1, roughness: 0.28, side: T.DoubleSide });
      sets.cellar.userData.foilMat = foilMat;
      // свеча
      const candleG = group(C, -0.38, 0.36, -0.5);
      add(new T.CylinderGeometry(0.022, 0.024, 0.11, 14), std({ color: 0xe8dcc0, roughness: 0.6, emissive: 0xff9a40, emissiveIntensity: 0.35 }), 0, 0.055, 0, candleG);
      add(new T.CylinderGeometry(0.05, 0.05, 0.008, 18), std({ color: 0x8a8a84, metalness: 0.7, roughness: 0.4 }), 0, 0.004, 0, candleG);
      const flame = new T.Sprite(new T.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      flame.position.set(0, 0.14, 0);
      candleG.add(flame);
      const candleL = new T.PointLight(0xffbc80, 0, 9, 2);
      candleL.position.set(0, 0.16, 0);
      candleL.castShadow = true;
      candleL.shadow.mapSize.set(1024, 1024);
      candleL.shadow.bias = -0.002;
      candleL.shadow.radius = 4;
      candleG.add(candleL);
      C.userData.candle = { flame, light: candleL, g: candleG };
      // рация на ящике
      const radio = group(C, -1.62, 0.4, -0.92);
      add(box(0.07, 0.16, 0.04), std({ color: 0x23251f, roughness: 0.6 }), 0, 0.08, 0, radio);
      add(new T.CylinderGeometry(0.004, 0.006, 0.22, 6), polymer, 0.022, 0.27, 0, radio);
      const led = add(new T.SphereGeometry(0.004, 6, 6), new T.MeshBasicMaterial({ color: 0x40ff60 }), -0.02, 0.15, 0.021, radio, { noCast: true });
      C.userData.radio = { g: radio, led };
      // аптечка на ветоши: шприц, бинты, жгут
      const kit = group(C, 1.05, 0.005, -1.05);
      add(new T.PlaneGeometry(0.55, 0.4), std({ color: 0x4a4a38, roughness: 1 }), 0, 0.002, 0, kit, { noCast: true }).rotation.x = -Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const b = add(new T.CylinderGeometry(0.035, 0.035, 0.08, 16), std({ color: 0xe8e4da, roughness: 1 }), -0.15 + i * 0.09, 0.035, -0.08, kit);
        b.rotation.z = Math.PI / 2;
      }
      const syr = group(kit, 0.05, 0.012, 0.08);
      add(new T.CylinderGeometry(0.008, 0.008, 0.09, 10), new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.55 }), 0, 0, 0, syr).rotation.z = Math.PI / 2;
      add(new T.CylinderGeometry(0.0015, 0.0015, 0.03, 6), metalDark, 0.06, 0, 0, syr).rotation.z = Math.PI / 2;
      add(new T.CylinderGeometry(0.01, 0.01, 0.004, 10), std({ color: 0xd04040 }), -0.047, 0, 0, syr).rotation.z = Math.PI / 2;
      const tq = add(box(0.2, 0.012, 0.035), std({ color: 0x151515, roughness: 0.8 }), 0.14, 0.008, -0.02, kit);
      tq.rotation.y = 0.5;
      C.userData.syringe = syr;
      C.userData.kit = kit;
      // термометр на стене
      const thermo = group(C, -0.4, 1.35, -2.58);
      add(box(0.06, 0.24, 0.012), std({ color: 0xd8d2c4, roughness: 0.7 }), 0, 0, 0, thermo);
      add(new T.CylinderGeometry(0.003, 0.003, 0.17, 6), std({ color: 0xc02020, emissive: 0x200000 }), 0, -0.01, 0.009, thermo);
      // автоматы у стены, каска на полу
      const r1 = rifle(C);
      r1.position.set(1.95, 0.48, -0.6);
      r1.rotation.set(-1.25, Math.PI / 2, 0.08);
      const r2 = rifle(C);
      r2.position.set(1.95, 0.48, -0.25);
      r2.rotation.set(-1.3, Math.PI / 2, -0.05);
      // пыль в свете свечи
    }

    // ---------- двор: завал дома, люк в подвал ----------
    const Y = sets.yard;
    const fires = {};
    {
      const mud = pbr("brown_mud_leaves_01", [40, 40], { color: 0x8a8070 });
      const g = bend(new T.PlaneGeometry(200, 200, 120, 120), (v) => { v.z = Math.sin(v.x * 0.3) * Math.cos(v.y * 0.25) * 0.15 + Math.sin(v.x * 1.3 + v.y * 0.9) * 0.04; });
      add(g, mud, 0, 0, 0, Y, { noCast: true }).rotation.x = -Math.PI / 2;
      // куча обломков: холм из щебня + кирпичи + балки + листы кровли
      const rubbleM = pbr("rubble", [3, 3], { color: 0x9a8a80 });
      const heapG = bend(new T.SphereGeometry(4, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), (v) => {
        const n = Math.sin(v.x * 1.7) * Math.cos(v.z * 1.3) * 0.25 + Math.sin(v.x * 4.1 + v.z * 3.7) * 0.12;
        v.y = v.y * 0.42 + n * (v.y > 0.1 ? 1 : 0);
      });
      add(heapG, rubbleM, 0, 0, -6, Y);
      const brickM = pbr("red_brick_03", [0.6, 0.6], { color: 0xa08070 });
      const bricks = new T.InstancedMesh(mbox(0.25, 0.065, 0.12, 0.6), brickM, 260);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3();
      for (let i = 0; i < 260; i++) {
        const a = r() * 6.28, rr = Math.sqrt(r()) * 4.6;
        const x = Math.cos(a) * rr, z = -6 + Math.sin(a) * rr;
        const h = Math.max(0, 1.6 * (1 - (rr / 4.2) ** 2)) + 0.03;
        e.set(r() * 3, r() * 3, r() * 3);
        q.setFromEuler(e);
        m4.compose(v.set(x, h, z), q, new T.Vector3(1, 1, 1));
        bricks.setMatrixAt(i, m4);
      }
      bricks.castShadow = bricks.receiveShadow = true;
      Y.add(bricks);
      const planks = pbr("weathered_brown_planks", [1, 1], { color: 0x6a5a4a });
      for (let i = 0; i < 9; i++) {
        const b = add(mbox(0.16, 0.14, 3 + r() * 2, 1), planks, (r() - 0.5) * 6, 0.9 + r() * 0.6, -6 + (r() - 0.5) * 5, Y);
        b.rotation.set((r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.6);
      }
      const roofM = pbr("rust_coarse_01", [2, 1], { color: 0x8a8a84, metal: 0.3 });
      for (let i = 0; i < 4; i++) {
        const s = add(bend(new T.PlaneGeometry(2.2, 1.1, 22, 4), (vv) => { vv.z = Math.sin(vv.x * 28) * 0.02; }), roofM, (r() - 0.5) * 5, 1.2 + r() * 0.8, -6 + (r() - 0.5) * 4, Y);
        s.material.side = T.DoubleSide;
        s.rotation.set(-1.2 + r() * 0.8, r() * 3, (r() - 0.5));
      }
      // уцелевшие куски стен
      const wallM = pbr("red_brick_03", [1.5, 1.2], { color: 0xa08a80 });
      const wall = (x, z, w, h, ry) => {
        const g2 = bend(mbox(w, h, 0.38, 1.2), (vv) => {
          if (vv.y > 0) vv.y -= Math.abs(Math.sin(vv.x * 2.3) + Math.sin(vv.x * 5.1) * 0.5) * h * 0.25;
        });
        const m = add(g2, wallM, x, h / 2, z, Y);
        m.rotation.y = ry || 0;
      };
      wall(-3.6, -7.5, 2.8, 2.4, 0.1);
      wall(3.2, -8.6, 2.2, 1.6, -0.3);
      wall(-4.6, -5.5, 1.6, 1.3, 1.5);
      // платок бабушки на завале
      const scarf = canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = "#3a2228"; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 16; i++) { c.fillStyle = "rgba(150,120,90,0.35)"; c.beginPath(); c.arc((i % 4) * 32 + 16, Math.floor(i / 4) * 32 + 16, 5, 0, 6.28); c.fill(); }
        c.fillStyle = "rgba(40,30,25,0.6)"; for (let i = 0; i < 400; i++) c.fillRect((i * 37) % w, (i * 53) % h, 3, 3);
      });
      const sc1 = add(bend(new T.PlaneGeometry(0.6, 0.5, 8, 8), (vv) => { vv.z = Math.sin(vv.x * 9) * 0.03; }), std({ map: scarf, side: T.DoubleSide, roughness: 1 }), 1.2, 1.25, -4.2, Y);
      sc1.rotation.set(-1.1, 0.3, 0.2);
      // люк подвала: деревянная рама и откинутая крышка, рядом — бетонный оголовок
      const concM = pbr("concrete_layers_02", [1, 0.5], { color: 0x8a8680 });
      add(mbox(1.3, 0.35, 1.4, 1), concM, 0, 0.17, 2, Y);
      add(box(0.85, 0.36, 0.95), std({ color: 0x050505, roughness: 1 }), 0, 0.18, 2, Y, { noCast: true });
      const lid = add(mbox(0.9, 0.05, 1.0, 1), planks, 0, 0.36, 2.5, Y);
      lid.position.set(0, 0.85, 2.5);
      lid.rotation.x = -1.35;
      Y.userData.hatchGlow = new T.PointLight(0xff2a1a, 0, 4, 2);
      Y.userData.hatchGlow.position.set(OFF.yard, 0.5, 2);
      sc.add(Y.userData.hatchGlow);
      // забор и столб
      const fenceM = pbr("weathered_brown_planks", [0.5, 1], { color: 0x5a4a3c });
      for (let i = 0; i < 14; i++) {
        if (r() < 0.25) continue;
        const p = add(mbox(0.12, 1.5 + r() * 0.2, 0.03, 1), fenceM, -9 + i * 0.4, 0.75, 6, Y);
        p.rotation.z = (r() - 0.5) * 0.2;
      }
      fires.far = fireAt(Y, 120, 0, -900, 9); // горящая машина за километр — на горизонте
      fires.far.g.position.set(140, 0, -950);
    }
    skyDome("sky_night_d.jpg", sets.yard);

    // ---------- дорога и «таблетка» (УАЗ-452) ----------
    const R = sets.road;
    function uaz(parent) {
      const g = group(parent);
      const paint = std({ color: 0x3f4a33, roughness: 0.55, metalness: 0.2 });
      const burnt = pbr("rust_coarse_01", [1, 1], { color: 0x3a2e28, metal: 0.4 });
      // кузов — скруглённый короб
      const body = add(bend(new T.BoxGeometry(1.95, 1.6, 4.4, 8, 6, 16), (v) => {
        const fz = v.z / 2.2, fx = v.x / 0.975, fy = (v.y + 0.8) / 1.6;
        const rr = 0.18;
        v.x *= 1 - rr * Math.pow(Math.max(0, fy - 0.6) / 0.4, 2) * 0.3;
        if (fz > 0.75) v.y -= Math.pow((fz - 0.75) / 0.25, 2) * 0.25 * fy; // скат морды
        v.z *= 1 - 0.04 * Math.pow(Math.abs(fx), 4);
      }), paint, 0, 1.3, 0, g);
      body.userData.heat = 0.35;
      // окна
      const glassM = std({ color: 0x0c1014, roughness: 0.15, metalness: 0.6, emissive: 0xff5a10, emissiveIntensity: 0 });
      add(box(1.7, 0.5, 0.02), glassM, 0, 1.75, 2.18, g).rotation.x = -0.32;
      for (const sx of [-1, 1]) for (const z of [1.5, 0.2, -1.1]) add(box(0.02, 0.4, 0.8), glassM, sx * 0.985, 1.75, z, g);
      // красный крест на белом круге
      const cross = canvasTex(128, 128, (c) => {
        c.fillStyle = "#e8e4dc"; c.beginPath(); c.arc(64, 64, 60, 0, 6.28); c.fill();
        c.fillStyle = "#b8231e"; c.fillRect(50, 18, 28, 92); c.fillRect(18, 50, 92, 28);
      });
      for (const sx of [-1, 1]) {
        const p = add(new T.CircleGeometry(0.32, 24), std({ map: cross, roughness: 0.6, transparent: true }), sx * 0.99, 1.45, -0.6, g, { noCast: true });
        p.rotation.y = sx * Math.PI / 2;
      }
      // колёса
      const tire = std({ color: 0x111111, roughness: 0.9 });
      for (const sx of [-1, 1]) for (const z of [1.35, -1.35]) {
        const w = add(new T.CylinderGeometry(0.42, 0.42, 0.28, 20), tire, sx * 0.85, 0.42, z, g);
        w.rotation.z = Math.PI / 2;
        w.userData.heat = 0.5;
      }
      const head = new T.SpotLight(0xffe0b0, 0, 40, 0.5, 0.6, 1.5);
      head.position.set(0, 1, 2.3);
      head.target.position.set(0, 0, 12);
      g.add(head, head.target);
      g.userData = { body, paint, burnt, head, glassM };
      return g;
    }
    {
      const field = pbr("forest_ground_04", [60, 60], { color: 0x7a7468 });
      add(bend(new T.PlaneGeometry(400, 400, 100, 100), (v) => { v.z = Math.sin(v.x * 0.11) * Math.cos(v.y * 0.13) * 0.4; }), field, 0, -0.02, 0, R, { noCast: true }).rotation.x = -Math.PI / 2;
      const road = pbr("rocky_trail", [1.5, 60], { color: 0x8a8070 });
      add(new T.PlaneGeometry(5, 400), road, 0, 0.02, 0, R, { noCast: true, heat: 0.09 }).rotation.x = -Math.PI / 2;
      R.userData.van = uaz(R);
      fires.van = fireAt(R, 0, 1.5, 0, 1.6);
    }
    skyDome("sky_night_d.jpg", sets.road);

    // ---------- деревья (голые, зима) ----------
    const barkM = pbr("weathered_brown_planks", [0.3, 2], { color: 0x3a342c });
    function treeGeo(seed, hgt) {
      const rr = rng(seed);
      const parts = [];
      function branch(x, y, z, dx, dy, dz, len, rad, depth) {
        const g = new T.CylinderGeometry(rad * 0.65, rad, len, 5, 1, true);
        g.translate(0, len / 2, 0);
        const dir = new T.Vector3(dx, dy, dz).normalize();
        g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir));
        g.translate(x, y, z);
        parts.push(g);
        if (depth <= 0 || rad < 0.012) return;
        const ex = x + dir.x * len, ey = y + dir.y * len, ez = z + dir.z * len;
        const n = depth > 2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = rr() * 6.28;
          branch(ex, ey, ez, dir.x + Math.cos(a) * 0.7, dir.y + 0.25, dir.z + Math.sin(a) * 0.7, len * (0.62 + rr() * 0.2), rad * 0.62, depth - 1);
        }
      }
      branch(0, 0, 0, (rr() - 0.5) * 0.1, 1, (rr() - 0.5) * 0.1, hgt * 0.38, hgt * 0.025, 5);
      return merge(parts);
    }
    const treeGeos = [0, 1, 2, 3, 4, 5].map((i) => treeGeo(100 + i, 9 + i));
    function treeRow(parent, x0, z0, z1, n, spread, seed) {
      const rr = rng(seed);
      for (let i = 0; i < n; i++) {
        const t = add(treeGeos[i % treeGeos.length], barkM, x0 + (rr() - 0.5) * spread, 0, lerp(z0, z1, i / n) + (rr() - 0.5) * 2, parent, { heat: 0.12 });
        t.rotation.y = rr() * 6.28;
        t.scale.setScalar(0.7 + rr() * 0.6);
      }
    }
    treeRow(sets.road, -14, -150, 150, 70, 6, 3);
    treeRow(sets.road, 16, -150, 150, 60, 6, 4);
    treeRow(sets.yard, -16, -40, 30, 20, 8, 5);

    // ---------- лесополоса: дорожка вдоль посадки ----------
    const F = sets.field;
    {
      const field = pbr("forest_leaves_03", [50, 50], { color: 0x6a6258 });
      add(bend(new T.PlaneGeometry(400, 400, 100, 100), (v) => { v.z = Math.sin(v.x * 0.07) * Math.cos(v.y * 0.09) * 0.5; }), field, 0, -0.02, 0, F, { noCast: true }).rotation.x = -Math.PI / 2;
      const track = pbr("brown_mud_dry", [1, 50], { color: 0x8a8070 });
      add(new T.PlaneGeometry(2.4, 400), track, 0, 0.02, 0, F, { noCast: true, heat: 0.09 }).rotation.x = -Math.PI / 2;
      treeRow(F, -4.5, -200, 200, 160, 3, 7);
      treeRow(F, -8, -200, 200, 120, 4, 8);
      // кусты у кромки
      const bushM = std({ color: 0x2a2620, roughness: 1 });
      for (let i = 0; i < 90; i++) {
        const b = add(bend(new T.IcosahedronGeometry(0.8, 1), (v) => { v.multiplyScalar(0.7 + Math.sin(v.x * 9 + i) * 0.2); v.y = Math.abs(v.y); }), bushM, -2.6 + (r() - 0.5) * 1.5, 0, -200 + i * 4.4, F);
        b.scale.set(1 + r(), 0.6 + r() * 0.6, 1 + r());
      }
    }
    skyDome("sky_night_d.jpg", sets.field);

    // ---------- точка эвакуации: бронемашина ----------
    const E = sets.evac;
    {
      const ground = pbr("rocky_trail", [40, 40], { color: 0x7a7268 });
      add(new T.PlaneGeometry(300, 300), ground, 0, 0, 0, E, { noCast: true }).rotation.x = -Math.PI / 2;
      const armor = pbr("green_metal_rust", [2, 1], { color: 0x5a6048, metal: 0.3 });
      const veh = group(E, 0, 0, -3);
      add(mbox(2.5, 1.9, 5.2, 1), armor, 0, 1.75, 0, veh).userData.heat = 0.3;
      const nose = add(mbox(2.4, 1.1, 1.6, 1), armor, 0, 1.25, 3.2, veh);
      nose.userData.heat = 0.7;
      // проём задней двери и красный свет внутри
      add(box(1.2, 1.5, 0.05), std({ color: 0x080606, roughness: 1 }), 0, 1.65, -2.61, veh, { noCast: true });
      const door = add(mbox(1.2, 1.5, 0.08, 1), armor, 0.95, 1.65, -3.2, veh);
      door.rotation.y = -1.4;
      const tire = std({ color: 0x101010, roughness: 0.9 });
      for (const sx of [-1, 1]) for (const z of [2.6, 0.2, -1.6]) {
        const w = add(new T.CylinderGeometry(0.6, 0.6, 0.45, 24), tire, sx * 1.25, 0.6, z, veh);
        w.rotation.z = Math.PI / 2;
      }
      const red = new T.PointLight(0xff2014, 0, 7, 2);
      red.position.set(0, 1.8, -2.2);
      veh.add(red);
      E.userData.red = red;
      // маскировочная сеть на ветках рядом
      treeRow(E, -9, -40, 40, 30, 6, 11);
      treeRow(E, 10, -40, 40, 26, 6, 12);
    }
    skyDome("sky_night_d.jpg", sets.evac);

    // ---------- море (воспоминание): серое, спокойное ----------
    const S = sets.sea;
    const seaU = { t: { value: 0 } };
    {
      const sea = new T.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.18, metalness: 0.1 });
      sea.onBeforeCompile = (sh) => {
        sh.uniforms.uT = seaU.t;
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uT;")
          .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
            vec3 wp = -vViewPosition;
            float wv = sin(vViewPosition.x * 1.3 + uT * 1.1) * 0.5 + sin(vViewPosition.z * 2.1 - uT * 0.8 + vViewPosition.x * 0.7) * 0.3;
            normal = normalize(normal + vec3(dFdx(wv), dFdy(wv), 0.0) * 6.0);`);
      };
      add(new T.PlaneGeometry(2000, 2000, 1, 1), sea, 0, 0, 0, S, { noCast: true }).rotation.x = -Math.PI / 2;
      const sand = pbr("brown_mud_dry", [30, 6], { color: 0xb0a490 });

    }
    skyDome("sky_day_d.jpg", sets.sea);

    // ---------- утро: дорога в тумане ----------
    const M = sets.morning;
    {
      const ground = pbr("brown_mud_leaves_01", [50, 50], { color: 0x8a8278 });
      add(new T.PlaneGeometry(400, 400), ground, 0, 0, 0, M, { noCast: true }).rotation.x = -Math.PI / 2;
      const track = pbr("rocky_trail", [1.5, 60], { color: 0x8a8070 });
      add(new T.PlaneGeometry(4, 400), track, 0, 0.02, 0, M, { noCast: true }).rotation.x = -Math.PI / 2;
      treeRow(M, -7, -200, 200, 90, 5, 21);
      treeRow(M, 8, -200, 200, 70, 5, 22);
    }
    skyDome("sky_day_d.jpg", sets.morning);

    // ================= люди =================
    const H3 = window.HUMAN3D;
    const chars = {
      denis: H3.make("denis", { seed: 1 }),
      sonya: H3.make("sonya", { seed: 2 }),
      medic: H3.make("soldier2", { seed: 3, helmet: false, skin: { tone: 0x9a7058, beard: 1 } }),
      shah: H3.make("soldier2", { seed: 4, skin: { tone: 0x8a6048, beard: 1, hair: 0x101010 } }),
      extra: H3.make("soldier2", { seed: 5, skin: { tone: 0xa07860 } }),
      extra2: H3.make("denis", { seed: 6, skin: { tone: 0x9a7460 } }),
    };
    Object.values(chars).forEach((c) => sc.add(c.root));
    // фольга вокруг Сони (когда её несут)
    const foil = new T.Mesh(new T.SphereGeometry(1, 28, 20), std({ color: 0xd4ad5c, metalness: 1, roughness: 0.3, side: T.DoubleSide }));
    foil.material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        float cr = sin(vViewPosition.x * 180.0 + vViewPosition.y * 140.0) * sin(vViewPosition.y * 220.0 - vViewPosition.z * 90.0);
        normal = normalize(normal + vec3(dFdx(cr), dFdy(cr), 0.0) * 1.5);`);
    };
    foil.castShadow = true;
    sc.add(foil);

    // ================= постобработка (как в части 1, + зерно) =================
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
        t: { value: 0 }, res: { value: new T.Vector2(W, H) }, red: { value: 0 }, grain: { value: 0.05 }, signal: { value: 0 },
      },
      vertexShader: "out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: [
        "precision highp float;",
        "in vec2 vUv; out vec4 outC;",
        "uniform sampler2D tCol; uniform sampler2D tDep;",
        "uniform float near, far, focus, aperture, bloom, thr, exposure, desat, sepia, flash, vig, chroma, thermal, t, red, contrast, grain, signal;",
        "uniform vec3 lift, gain; uniform vec2 res;",
        "float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }",
        "vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }",
        "vec3 sampleLod(vec2 uv, float l){",
        "  vec2 o = exp2(l) / res * 0.5;",
        "  return 0.25 * (textureLod(tCol, uv + vec2(o.x, o.y), l).rgb + textureLod(tCol, uv + vec2(-o.x, o.y), l).rgb",
        "       + textureLod(tCol, uv + vec2(o.x, -o.y), l).rgb + textureLod(tCol, uv + vec2(-o.x, -o.y), l).rgb);",
        "}",
        "float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + t * 3.7) * 43758.5453); }",
        "void main(){",
        "  vec2 uv = vUv;",
        "  if (signal > 0.0) {", // помехи сигнала дрона
        "    float row = floor(uv.y * 90.0);",
        "    float jit = (hash(vec2(row, floor(t * 24.0))) - 0.5) * 0.06 * signal * step(0.6, hash(vec2(row * 0.3, floor(t * 12.0))));",
        "    uv.x += jit;",
        "  }",
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
        "    float th = 0.08 + 0.92 * smoothstep(0.02, 0.6, L);",
        "    float scan = 0.95 + 0.05 * sin(uv.y * res.y * 1.3 + t * 30.0);",
        "    vec3 tc = vec3(th) * scan + (hash(uv * 500.0) - 0.5) * 0.1;",
        "    c = mix(c, tc, thermal);",
        "  }",
        "  if (signal > 0.0) { c = mix(c, vec3(hash(uv * 700.0)), signal * 0.35 * step(0.8, hash(vec2(floor(uv.y * 60.0), floor(t * 20.0))))); }",
        "  vec2 q = uv - 0.5; q.x *= res.x / res.y;",
        "  c *= mix(1.0, smoothstep(0.95, 0.25, length(q)), vig);",
        "  c = mix(c, vec3(1.0, 0.25, 0.2) * L * 1.4, red);",
        "  c += (hash(uv * res) - 0.5) * grain;",
        "  c = mix(c, vec3(1.0, 0.97, 0.9), flash);",
        "  outC = vec4(c, 1.0);",
        "}",
      ].join("\n"),
    });
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), post);
    const postScene = new T.Scene();
    postScene.add(quad);
    const postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ключевой и контровой свет — для крупных планов (следуют за камерой)
    const key = new T.SpotLight(0xffe2c4, 0, 12, 0.5, 0.7, 1.6);
    const rim = new T.SpotLight(0xa8c0e0, 0, 12, 0.6, 0.7, 1.6);
    sc.add(key, key.target, rim, rim.target);
    const moon = new T.DirectionalLight(0x8090b0, 0);
    moon.position.set(30, 60, 20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = moon.shadow.camera.bottom = -25;
    moon.shadow.camera.right = moon.shadow.camera.top = 25;
    sc.add(moon, moon.target);
    const hemi = new T.HemisphereLight(0x6a7890, 0x1a1612, 0);
    sc.add(hemi);
    const vR = new T.Vector3(), vU = new T.Vector3(0, 1, 0), vF = new T.Vector3(), vT = new T.Vector3();

    // ================= тепловизор: замена материалов =================
    const thermalMats = {};
    const thermalMat = (heat) => {
      const k = Math.round(heat * 20) / 20;
      if (!thermalMats[k]) thermalMats[k] = new T.MeshBasicMaterial({ color: new T.Color().setScalar(0.006 + Math.pow(k, 1.6) * 0.9) });
      return thermalMats[k];
    };
    let thermalOn = false;
    function setThermal(on) {
      if (on === thermalOn) return;
      thermalOn = on;
      sc.traverse((o) => {
        if (!o.isMesh || o.isSprite) return;
        if (on) {
          o.userData.mat0 = o.material;
          let heat = o.userData.heat;
          if (heat == null) {
            let p = o;
            while (p && p.userData.heat == null) p = p.parent;
            heat = p ? p.userData.heat : 0.05;
          }
          o.material = Array.isArray(o.material) ? o.material.map(() => thermalMat(heat)) : thermalMat(heat);
        } else if (o.userData.mat0) o.material = o.userData.mat0;
      });
    }
    Object.values(chars).forEach((c) => (c.root.userData.heat = 0.95));
    foil.userData.heat = 0.25;

    // ================= состояние =================
    const state = {
      set: "cellar",
      camX: 0, camY: 1.2, camZ: 2, tgtX: 0, tgtY: 0.8, tgtZ: 0, fov: 40, roll: 0, shake: 0, hand: 1,
      focus: 2, aperture: 0, bloom: 0.5, exposure: 1, desat: 0.15, sepia: 0, flash: 0, vig: 0.55, chroma: 0.0015, thermal: 0, red: 0, grain: 0.05, signal: 0,
      contrast: 0.35, warm: 0, key: 0, keySide: 1, keyUp: 0.6, keyCol: 0xffe2c4, rim: 0, rimCol: 0x8aa0c8,
      fog: 0.02, fogCol: 0x05070a, sky: 1, moon: 0, hemi: 0,
      candle: 1, hatch: 0, radioLed: 0, hatchRed: 0, redLight: 0,
      vanZ: 0, vanOn: 1, vanBurn: 0, vanHead: 0, farFire: 0,
      foil: 0, breath: 0, breathWho: "sonya",
      drawing: 0, drawWho: "", drawX: 0, drawY: 0, drawZ: 0, drawRx: 0, drawRy: 0, drawRz: 0,
      phone: 0, phoneScr: 0, syringe: 1, seaT: 0,
    };
    // персонаж: положение, поворот, поза, мимика, видимость (задаются из world.html)
    const who = {};
    // pose — имя/объект; pose2 + pk — плавный переход; cad > 0 — шаг (walkBase — поза рук при ходьбе);
    // мимика: sad, closed, slit, frown, open (0..1)
    Object.keys(chars).forEach((k) => (who[k] = { on: 0, set: "cellar", x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, pose: "stand", pose2: null, pk: 0, cad: 0, amp: 1, walkBase: null, sad: 0, closed: 0, slit: 0, frown: 0, open: 0, gear: null, held: null, heldBy: "denis" }));

    const tmpV = new T.Vector3(), tmpQ = new T.Quaternion();

    function render(t) {
      const s = state;
      for (const k in sets) sets[k].visible = k === s.set;
      const off = OFF[s.set] || 0;

      // камера: дыхание оператора + тряска
      const hx = Math.sin(t * 1.3) * 0.01 + Math.sin(t * 2.9 + 1) * 0.005;
      const hy = Math.sin(t * 1.7 + 2) * 0.008 + Math.sin(t * 3.7) * 0.003;
      const sh = s.shake;
      cam.position.set(s.camX + off + (hx + Math.sin(t * 37) * 0.06 * sh) * s.hand, s.camY + (hy + Math.sin(t * 43 + 1) * 0.06 * sh) * s.hand, s.camZ);
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(s.tgtX + off + Math.sin(t * 29) * 0.04 * sh, s.tgtY + Math.sin(t * 31) * 0.04 * sh, s.tgtZ);
      cam.rotateZ(s.roll + Math.sin(t * 0.9) * 0.004 * s.hand + Math.sin(t * 23) * 0.02 * sh);

      sc.fog.density = s.thermal > 0.5 ? Math.min(s.fog, 0.003) : s.fog;
      sc.fog.color.setHex(s.fogCol);
      moon.intensity = s.moon;
      moon.position.set(off + 30, 60, 20);
      moon.target.position.set(off, 0, 0);
      hemi.intensity = s.hemi;
      Object.values(sets).forEach((g) => g.children.forEach((c) => { if (c.material && c.material.side === T.BackSide && c.material.map) c.material.color.setScalar(s.sky); }));

      // подвал
      const cd = C.userData.candle;
      const fl = 0.82 + 0.1 * Math.sin(t * 17) + 0.06 * Math.sin(t * 31 + 1) + 0.04 * Math.sin(t * 53);
      cd.light.intensity = 3.2 * s.candle * fl;
      cd.flame.material.opacity = Math.min(1, s.candle);
      cd.flame.scale.set(0.035, 0.07 * fl, 1);
      C.userData.hatch.intensity = 30 * s.hatch;
      if (!thermalOn) C.userData.radio.led.material.color.setRGB(0.1 + 0.9 * s.radioLed * (Math.sin(t * 9) > 0 ? 1 : 0.2), 1 * s.radioLed + 0.1, 0.2);
      C.userData.syringe.visible = s.syringe > 0.5;
      Y.userData.hatchGlow.intensity = 8 * s.hatchRed;
      E.userData.red.intensity = 14 * s.redLight;

      // дорога, «таблетка»
      const van = R.userData.van;
      van.visible = s.vanOn > 0.5;
      van.position.set(0.9, 0, s.vanZ);
      if (s.thermal < 0.5) van.userData.body.material = s.vanBurn > 0.3 ? van.userData.burnt : van.userData.paint;
      van.userData.head.intensity = 60 * s.vanHead;
      van.userData.glassM.emissiveIntensity = s.vanBurn * (2.5 + 0.8 * Math.sin(t * 11));
      fires.van.g.position.set(0.9, 1.5, s.vanZ);
      updateFire(fires.van, t, s.vanBurn);
      updateFire(fires.far, t, s.farFire);
      seaU.t.value = t;

      // люди
      Object.keys(chars).forEach((k) => {
        const c = chars[k], w = who[k];
        c.root.visible = w.on > 0.5 && w.set === s.set;
        if (!c.root.visible) return;
        c.root.position.set(w.x + off, w.y, w.z);
        c.root.rotation.set(w.rx, w.ry, w.rz, "YXZ");
        let p = poseOf(w);
        if (w.cad > 0) p = H3.walk((t * w.cad) % 1, w.amp, okPose(w.walkBase));
        c.pose(p);
        c.face({ sad: w.sad, closed: w.closed, slit: w.slit, frown: w.frown, open: w.open });
        if (c.gear.helmet && w.gear) {
          c.gear.helmet.visible = w.gear === "helmet";
          if (c.gear.cap) c.gear.cap.visible = w.gear === "cap";
        }
      });
      // Соня на руках у Дениса: крепим к его груди
      if (Array.isArray(who.sonya.held) && chars[who.sonya.heldBy] && chars[who.sonya.heldBy].root.visible) {
        const d = chars[who.sonya.heldBy];
        d.root.updateMatrixWorld(true);
        const sp = d.bones.spine03;
        sp.getWorldPosition(tmpV);
        sp.getWorldQuaternion(tmpQ);
        const so = chars.sonya;
        so.root.visible = true;
        const h = who.sonya.held;
        so.pose(poseOf(who.sonya));
        so.face({ sad: who.sonya.sad, closed: who.sonya.closed, slit: who.sonya.slit });
        const o = new T.Vector3(h[0], h[1], h[2]).applyQuaternion(tmpQ);
        so.root.position.copy(tmpV).add(o);
        so.root.quaternion.copy(tmpQ).multiply(new T.Quaternion().setFromEuler(new T.Euler(h[3] || 0, h[4] || Math.PI, h[5] || 0)));
        so.root.updateMatrixWorld(true);
      }
      // фольга
      foil.visible = s.foil > 0.5 && chars.sonya.root.visible;
      if (foil.visible) {
        const so = chars.sonya;
        so.root.updateMatrixWorld(true);
        so.bones.spine03.getWorldPosition(foil.position);
        so.bones.spine03.getWorldQuaternion(foil.quaternion);
        const k = so.height / 1.13;
        foil.scale.set(0.2 * k, 0.36 * k, 0.17 * k);
        foil.position.y -= 0.05 * k;
      }
      // пар изо рта
      breath.forEach((b, i) => {
        b.visible = s.breath > 0.01;
        if (!b.visible) return;
        const c = chars[s.breathWho];
        if (!c || !c.root.visible) { b.visible = false; return; }
        c.bones.head.getWorldPosition(tmpV);
        c.bones.head.getWorldQuaternion(tmpQ);
        const u = b.userData, ph = (u.a + t * 0.35) % 1;
        const kk = c.height / 1.71;
        b.position.set((u.c - 0.5) * 0.02, 0.03 * kk + ph * 0.05, (0.1 + ph * 0.22) * kk);
        c.bones.head.localToWorld(b.position);
        const sz = (0.025 + ph * 0.13) * kk;
        b.scale.set(sz, sz, 1);
        // выдох раз в ~3 с
        const cyc = (t * 0.33 + u.b * 0.1) % 1;
        b.material.opacity = s.breath * 0.045 * Math.sin(ph * Math.PI) * Math.max(0, Math.sin(cyc * Math.PI * 2));
        b.material.color.setScalar(0.8);
      });
      // рисунок
      drawing.visible = s.drawing > 0.5;
      if (drawing.visible) {
        if (s.drawWho && chars[s.drawWho] && chars[s.drawWho].root.visible) {
          const c = chars[s.drawWho];
          c.root.updateMatrixWorld(true);
          c.bones["wrist.R"].getWorldPosition(drawing.position);
          c.bones["wrist.R"].getWorldQuaternion(drawing.quaternion);
          drawing.rotateX(s.drawRx);
          drawing.rotateY(s.drawRy);
          drawing.rotateZ(s.drawRz);
          drawing.translateZ(0.03);
          drawing.translateY(-0.06);
        } else {
          drawing.position.set(s.drawX + off, s.drawY, s.drawZ);
          drawing.rotation.set(s.drawRx, s.drawRy, s.drawRz);
        }
      }
      // телефон в руках Дениса
      phone.visible = s.phone > 0.5;
      if (phone.visible) {
        const c = chars.denis;
        c.root.updateMatrixWorld(true);
        c.bones["wrist.R"].getWorldPosition(phone.position);
        c.bones["wrist.L"].getWorldPosition(tmpV);
        phone.position.add(tmpV).multiplyScalar(0.5);
        c.bones.head.getWorldPosition(tmpV);
        phone.lookAt(tmpV);
        phone.translateZ(0.02);
        if (!thermalOn) phoneScr.material.color.setRGB(0.6 * s.phoneScr, 0.68 * s.phoneScr, 0.85 * s.phoneScr);
        phoneGlow.intensity = 0.1 * s.phoneScr;
      }

      setThermal(s.thermal > 0.5);
      sc.environment = s.set === "sea" || s.set === "morning" ? envDay : s.set === "cellar" ? null : envNight;

      // свет для крупных планов
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
      u.grain.value = s.grain;
      u.signal.value = s.signal;
      u.contrast.value = s.contrast;
      u.gain.value.set(1 + 0.05 * s.warm, 1, 1 - 0.07 * s.warm);
      u.lift.value.set(0.004 * Math.max(0, s.warm), 0.006, 0.02 * Math.max(0, -s.warm) + 0.004);
      ren.render(postScene, postCam);
    }

    // где окажется кость персонажа при заданных полях who (координаты локации) — для наведения камеры
    function probe(name, w, bone, local) {
      const c = chars[name];
      const ww = Object.assign({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, pose: "stand" }, w);
      c.root.position.set(ww.x, ww.y, ww.z);
      c.root.rotation.set(ww.rx, ww.ry, ww.rz, "YXZ");
      c.pose(poseOf(ww));
      c.root.updateMatrixWorld(true);
      const k = c.height / 1.71;
      const b = c.bones[bone === "face" ? "head" : bone];
      const v = new T.Vector3();
      if (bone === "face") v.set(0, 0.045 * k, 0.07 * k);
      if (local) v.add(new T.Vector3(local[0], local[1], local[2]));
      return b.localToWorld(v);
    }
    // то же для Сони на руках: holder — кто держит (его поля who), held — смещение, sw — поля Сони
    function probeHeld(holder, hw, held, sw, bone) {
      probe(holder, hw, "head");
      const d = chars[holder];
      const p = new T.Vector3(), q = new T.Quaternion();
      d.bones.spine03.getWorldPosition(p);
      d.bones.spine03.getWorldQuaternion(q);
      const so = chars.sonya;
      so.pose(poseOf(sw));
      so.root.position.copy(p).add(new T.Vector3(held[0], held[1], held[2]).applyQuaternion(q));
      so.root.quaternion.copy(q).multiply(new T.Quaternion().setFromEuler(new T.Euler(held[3] || 0, held[4] || Math.PI, held[5] || 0)));
      so.root.updateMatrixWorld(true);
      const k = so.height / 1.71;
      const v = new T.Vector3();
      if (bone === "face") v.set(0, 0.045 * k, 0.07 * k);
      return so.bones[bone === "face" ? "head" : bone].localToWorld(v);
    }
    const pmrem = new T.PMREMGenerator(ren);
    let envNight = null, envDay = null;
    const ready = Promise.all([H3.ready, Promise.all(pending)]).then(() => Promise.all(pending)).then(() => {
      const n = ltex("sky_night_d.jpg", true), d = ltex("sky_day_d.jpg", true);
      n.mapping = d.mapping = T.EquirectangularReflectionMapping;
      envNight = pmrem.fromEquirectangular(n).texture;
      envDay = pmrem.fromEquirectangular(d).texture;
      n.mapping = d.mapping = T.UVMapping;
    });
    return { state, who, render, chars, cam, scene: sc, ready, sets, OFF, probe, probeHeld, parts: { drawing, phone, foil } };
  }
  return { create };
})();
