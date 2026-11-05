// SNOW3D — зимнее СНТ ночью для «Следов не обратно»: улица в снегу, дачи, забор, ели, луна, дым из трубы,
// настоящие вдавленные следы (рельеф), машина с зеркалом заднего вида, комната за окном, амбарный замок.
// const W = SNOW3D.create(canvas, { base: "assets/" }); tl.to(W.state, {...}); W.render(t).
// Метры, Y вверх. Улица вдоль X (z≈0). Наш участок к северу (z<0): калитка (0,-3.5), дом (0,-14), сарай (6.5,-9).
// Лес — в конце улицы (x<-46). Машина стоит развёрнутой у калитки: (3.6, 2.6), нос на +Z.
(function () {
  const T = THREE;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  // гладкий шум для рельефа снега
  function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.2; }
  // высота снежного покрова (без следов)
  function baseH(x, z) {
    let h = 0.05 * (fbm(x * 0.13 + 3, z * 0.13 - 7) - 0.5) + 0.012 * (vnoise(x * 1.1, z * 1.1) - 0.5);
    // сугробы вдоль заборов (z = -3.5 и z = 3.5 — фронт участков) и у стен
    const f1 = Math.exp(-Math.pow((z + 3.75) / 0.6, 2)), f2 = Math.exp(-Math.pow((z - 6.9) / 0.6, 2));
    h += 0.16 * (f1 + f2) * (0.6 + 0.4 * vnoise(x * 0.7, 1.3));
    // колея не чистится — посередине улицы ровно
    return h;
  }

  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  function pbr(base, name, rep, opt = {}) {
    const L = new T.TextureLoader();
    const ld = (s, srgb) => {
      const t = L.load(base + "lib/tex/" + name + "_" + s + ".jpg");
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(rep[0], rep[1]);
      t.anisotropy = 8;
      if (srgb) t.encoding = T.sRGBEncoding;
      return t;
    };
    return new T.MeshStandardMaterial(Object.assign({ map: ld("d", true), normalMap: ld("n"), roughnessMap: ld("r") }, opt));
  }

  // карта нормалей из функции высоты (для мелкой фактуры снега)
  function normalTex(size, hf, strength) {
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = hf(x / size, y / size);
    return canvasTex(size, size, (g) => {
      const im = g.createImageData(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)];
        const u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
        let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
        const k = 1 / Math.hypot(nx, ny, nz);
        const i = (y * size + x) * 4;
        im.data[i] = (nx * k * 0.5 + 0.5) * 255; im.data[i + 1] = (ny * k * 0.5 + 0.5) * 255; im.data[i + 2] = (nz * k * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }, false);
  }

  function softTex(inner) {
    return canvasTex(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(inner || 0.25, "rgba(255,255,255,0.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    });
  }

  // клуб дыма: мягкое пятно с фактурой
  function smokeTex() {
    return canvasTex(256, 256, (g) => {
      const im = g.createImageData(256, 256);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const dx = (x - 128) / 128, dy = (y - 128) / 128, d = Math.hypot(dx, dy);
        const n = fbm(x / 22, y / 22) * 0.7 + fbm(x / 9 + 9, y / 9) * 0.3;
        const a = Math.max(0, 1 - d) ** 1.6 * (0.35 + 0.9 * n);
        const i = (y * 256 + x) * 4;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.min(255, a * 255);
      }
      g.putImageData(im, 0, 0);
    });
  }

  // иней на стекле: кристаллы-«папоротники» от краёв к центру
  function frostTex(seed) {
    const r = rng(seed);
    return canvasTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const edge = g.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.72);
      edge.addColorStop(0, "rgba(255,255,255,0)"); edge.addColorStop(1, "rgba(255,255,255,0.55)");
      g.fillStyle = edge; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineCap = "round";
      function fern(x, y, a, len, depth) {
        if (depth <= 0 || len < 3) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.lineWidth = Math.max(0.6, depth * 0.55);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        const n = 5;
        for (let k = 1; k <= n; k++) {
          const px = x + (x2 - x) * k / (n + 1), py = y + (y2 - y) * k / (n + 1);
          fern(px, py, a + 0.9 + (r() - 0.5) * 0.3, len * 0.38, depth - 1);
          fern(px, py, a - 0.9 + (r() - 0.5) * 0.3, len * 0.38, depth - 1);
        }
        fern(x2, y2, a + (r() - 0.5) * 0.5, len * 0.6, depth - 1);
      }
      for (let k = 0; k < 26; k++) {
        const side = k % 4;
        const t = r();
        const x = side === 0 ? t * w : side === 1 ? w : side === 2 ? t * w : 0;
        const y = side === 0 ? 0 : side === 1 ? t * h : side === 2 ? h : t * h;
        const a = Math.atan2(h / 2 - y, w / 2 - x) + (r() - 0.5) * 1.2;
        fern(x, y, a, 60 + r() * 90, 4);
      }
    });
  }

  // ---------------- след ботинка: локальная высота (u — вдоль стопы, вперёд; v — поперёк) ----------------
  function printH(u, v) {
    const ds = Math.hypot((u - 0.045) / 0.135, v / 0.052) - 1;
    const dh = Math.hypot((u + 0.115) / 0.058, v / 0.047) - 1;
    const dn = Math.min(ds * 0.052, dh * 0.047); // ~метры до края
    const inside = 1 - smooth(-0.008, 0.01, dn);
    let h = -0.1 * inside;
    // протектор на дне
    h += inside * 0.006 * (Math.sin(u * 160) > 0.3 ? 1 : 0) * (dn < -0.012 ? 1 : 0);
    // валик выдавленного снега по краю
    h += 0.02 * Math.exp(-Math.pow((dn - 0.018) / 0.014, 2));
    // выброс снега перед носком
    if (u > 0.12) h += 0.012 * Math.exp(-Math.pow((u - 0.22) / 0.05, 2) - Math.pow(v / 0.07, 2));
    return h;
  }
  function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // полилиния → функции положения по длине
  function pathOf(pts) {
    const P = pts.map((p) => new T.Vector2(p[0], p[1]));
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + P[i].distanceTo(P[i - 1]));
    const total = L[L.length - 1];
    // сглаживание: CatmullRom по точкам
    const curve = new T.CatmullRomCurve3(P.map((p) => new T.Vector3(p.x, 0, p.y)), false, "centripetal");
    const len = curve.getLength();
    return {
      len,
      at(s) { const u = Math.min(1, Math.max(0, s / len)); const p = curve.getPointAt(u); const tg = curve.getTangentAt(u); return { x: p.x, z: p.z, tx: tg.x, tz: tg.z }; },
      total,
    };
  }

  // цепочка следов вдоль пути: шаг stride, левая/правая нога
  function stepsAlong(path, opt) {
    const out = [];
    const stride = opt.stride || 0.72, r = rng(opt.seed || 3);
    let side = 1;
    for (let s = opt.from || 0.2; s < path.len - (opt.endGap || 0.2); s += stride * (0.94 + r() * 0.12)) {
      const p = path.at(s);
      const nx = -p.tz, nz = p.tx; // нормаль влево
      const off = 0.11 * side + (r() - 0.5) * 0.03;
      const ang = Math.atan2(p.tz, p.tx) + side * 0.09 + (r() - 0.5) * 0.06;
      out.push({ s, x: p.x + nx * off, z: p.z + nz * off, a: ang });
      side = -side;
    }
    return out;
  }

  // полоса рельефа вдоль пути (вершины каждые ds), высота = снег + следы + колеи
  function ribbon(path, width, prints, ruts, ds, vcol) {
    const nU = Math.ceil(path.len / ds) + 1, nV = Math.ceil(width / ds) + 1;
    const pos = new Float32Array(nU * nV * 3), col = new Float32Array(nU * nV * 3);
    const byS = prints.slice().sort((a, b) => a.s - b.s);
    let k = 0;
    for (let i = 0; i < nU; i++) {
      const s = Math.min(path.len, i * ds);
      const p = path.at(s);
      const nx = -p.tz, nz = p.tx;
      for (let j = 0; j < nV; j++) {
        const o = -width / 2 + (j / (nV - 1)) * width;
        const x = p.x + nx * o, z = p.z + nz * o;
        let h = baseH(x, z), dep = 0;
        for (const f of byS) {
          if (f.s < s - 0.6) continue;
          if (f.s > s + 0.6) break;
          const dx = x - f.x, dz = z - f.z;
          const c = Math.cos(f.a), sn = Math.sin(f.a);
          const u = dx * c + dz * sn, v = -dx * sn + dz * c;
          if (Math.abs(u) > 0.35 || Math.abs(v) > 0.2) continue;
          const ph = printH(u, v);
          h += ph; dep = Math.min(dep, ph);
        }
        if (ruts) {
          const fade = smooth(path.len, path.len - (ruts.fade || 0.01), s);
          for (const ro of ruts.offsets) {
            const d = Math.abs(o - ro);
            const groove = smooth(0.11, 0.07, d) * fade;
            const tread = Math.sin(s * 40 + (ro > 0 ? 1 : 0)) > 0.2 ? 0.006 : 0;
            const ph = -0.07 * groove + tread * groove + 0.025 * fade * Math.exp(-Math.pow((d - 0.14) / 0.04, 2));
            h += ph; dep = Math.min(dep, ph);
          }
        }
        pos[k * 3] = x; pos[k * 3 + 1] = h + 0.004; pos[k * 3 + 2] = z;
        // в глубине — синее и темнее (свет рассеивается в снегу)
        const d = Math.min(1, -dep / 0.1);
        col[k * 3] = 1 - 0.32 * d; col[k * 3 + 1] = 1 - 0.2 * d; col[k * 3 + 2] = 1 - 0.02 * d;
        k++;
      }
    }
    const idx = [];
    for (let i = 0; i < nU - 1; i++) for (let j = 0; j < nV - 1; j++) {
      const a = i * nV + j, b = a + 1, c = a + nV, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("color", new T.BufferAttribute(col, 3));
    const uv = new Float32Array(nU * nV * 2);
    for (let i = 0; i < nU * nV; i++) { uv[i * 2] = pos[i * 3] * 0.5; uv[i * 2 + 1] = pos[i * 3 + 2] * 0.5; }
    g.setAttribute("uv", new T.BufferAttribute(uv, 2));
    g.setIndex(nU * nV > 65535 ? new T.Uint32BufferAttribute(idx, 1) : new T.Uint16BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }

  // ---------------- ель: ярусы «юбок» с рваным краем, снег сверху ----------------
  function spruceGeo(h, rad, seed, detail) {
    const r = rng(seed);
    const parts = [];
    const tiers = detail ? 24 : 10, segs = detail ? 30 : 12;
    const dark = new T.Color(0x101a14), dark2 = new T.Color(0x18261c), snow = new T.Color(0xb9c4d6);
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers;
      const y = h * (0.1 + 0.86 * f);
      const R = rad * Math.pow(1 - f, 0.95) * (0.85 + r() * 0.3) + 0.08;
      const th = h / tiers * 1.7;
      const g = new T.CylinderGeometry(R * 0.12, R, th, segs, 2, true);
      const p = g.attributes.position;
      const c = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), yy = p.getY(k), z = p.getZ(k);
        const a = Math.atan2(z, x);
        const rr = Math.hypot(x, z);
        const jag = 1 + 0.3 * Math.sin(a * 7 + i * 1.7 + seed) * Math.sin(a * 3.3 + seed) + 0.18 * Math.sin(a * 17 + i) + (r() - 0.5) * 0.35;
        const bottom = yy < -th * 0.25;
        const kk = bottom ? jag : 1;
        p.setXYZ(k, x * kk, yy - (bottom ? rr * 0.25 * (jag - 0.7) : 0), z * kk);
        // снег на верхней стороне яруса, пятнами
        const sn = !bottom && vnoise(a * 2.2 + i, yy + i * 3.1) > 0.5 ? 1 : 0;
        const base = r() < 0.5 ? dark : dark2;
        const col = sn ? snow : base;
        c[k * 3] = col.r; c[k * 3 + 1] = col.g; c[k * 3 + 2] = col.b;
      }
      g.setAttribute("color", new T.BufferAttribute(c, 3));
      g.translate(0, y, 0);
      g.computeVertexNormals();
      parts.push(g);
    }
    const trunk = new T.CylinderGeometry(rad * 0.05, rad * 0.09, h * 0.35, 6, 1, true);
    trunk.translate(0, h * 0.17, 0);
    const tc = new Float32Array(trunk.attributes.position.count * 3).fill(0.08);
    trunk.setAttribute("color", new T.BufferAttribute(tc, 3));
    parts.push(trunk);
    const tip = new T.ConeGeometry(0.06 * rad, h * 0.08, 5);
    tip.translate(0, h * 0.99, 0);
    const pc = new Float32Array(tip.attributes.position.count * 3);
    for (let k = 0; k < pc.length; k += 3) { pc[k] = dark.r; pc[k + 1] = dark.g; pc[k + 2] = dark.b; }
    tip.setAttribute("color", new T.BufferAttribute(pc, 3));
    parts.push(tip);
    return T.BufferGeometryUtils.mergeBufferGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  }

  // береза: белый ствол с чёрными пятнами и голыми ветками
  function birchGeo(h, seed) {
    const r = rng(seed);
    const parts = [];
    const trunk = new T.CylinderGeometry(0.06, 0.13, h, 8, 6, true);
    trunk.translate(0, h / 2, 0);
    parts.push(trunk);
    for (let k = 0; k < 9; k++) {
      const y = h * (0.45 + 0.5 * r()), L = 0.8 + r() * 1.6, a = r() * Math.PI * 2;
      const b = new T.CylinderGeometry(0.008, 0.03, L, 4, 1, true);
      b.translate(0, L / 2, 0);
      b.rotateZ(0.6 + r() * 0.5);
      b.rotateY(a);
      b.translate(0, y, 0);
      parts.push(b);
    }
    return T.BufferGeometryUtils.mergeBufferGeometries(parts.map((g) => g.toNonIndexed()), false);
  }

  function create(canvas, opt = {}) {
    const base = opt.base || "assets/";
    const RES = opt.res || 1;
    canvas.width = Math.round(1080 * RES);
    canvas.height = Math.round(1920 * RES);
    const ren = new T.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    ren.setSize(canvas.width, canvas.height, false);
    ren.outputEncoding = T.sRGBEncoding;
    ren.shadowMap.enabled = true;
    ren.shadowMap.type = T.PCFSoftShadowMap;
    ren.physicallyCorrectLights = true;
    ren.localClippingEnabled = true;

    const sc = new T.Scene();
    sc.background = new T.Color(0x060a14);
    sc.fog = new T.FogExp2(0x101a2c, 0.013);
    const cam = new T.PerspectiveCamera(42, 1080 / 1920, 0.01, 900);
    const r = rng(opt.seed || 11);
    const waits = [];
    const MOON = new T.Vector3(-0.42, 0.36, -0.83).normalize();

    // отражения: ночное HDRI
    const pmrem = new T.PMREMGenerator(ren);
    waits.push(new Promise((res) => {
      new T.RGBELoader().load(base + "lib/tex/night_env.hdr", (hdr) => {
        hdr.mapping = T.EquirectangularReflectionMapping;
        sc.environment = pmrem.fromEquirectangular(hdr).texture;
        res();
      }, undefined, () => res());
    }));

    // ---------- небо: градиент, звёзды, луна с ореолом, тонкие облака ----------
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { uMoon: { value: MOON }, uTime: { value: 0 }, uMoonK: { value: 1 } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 uMoon; uniform float uTime, uMoonK; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main(){
          vec3 d = normalize(vD);
          float y = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(vec3(0.055,0.085,0.15), vec3(0.008,0.014,0.03), pow(max(y,0.0), 0.45));
          float md = dot(d, uMoon);
          // звёзды
          vec3 q = d * 420.0; vec3 cell = floor(q);
          float s = h(cell); float tw = 0.6 + 0.4*sin(uTime*2.0 + s*60.0);
          col += vec3(0.75,0.82,1.0) * step(0.9965, s) * smoothstep(0.5, 0.0, length(fract(q)-0.5)) * tw * smoothstep(0.02, 0.25, y) * 1.4;
          // облака — тонкие полосы, подсвеченные луной
          float c = n3(d*vec3(3.0,9.0,3.0) + vec3(uTime*0.01,0.0,0.0))*0.6 + n3(d*vec3(7.0,18.0,7.0))*0.4;
          c = smoothstep(0.52, 0.85, c) * smoothstep(0.03, 0.3, y) * (1.0 - smoothstep(0.55, 0.9, y));
          col = mix(col, vec3(0.11,0.13,0.18) + vec3(0.35,0.4,0.5)*pow(max(md,0.0), 12.0), c*0.85);
          // луна и ореол
          float disc = smoothstep(0.99955, 0.99975, md);
          float mare = n3(d*900.0)*0.25 + n3(d*2600.0)*0.12;
          col += uMoonK * (vec3(1.0,0.98,0.92) * disc * (2.6 - mare*2.0) + vec3(0.25,0.32,0.5) * pow(max(md,0.0), 400.0) * 0.9 + vec3(0.06,0.09,0.16) * pow(max(md,0.0), 18.0));
          // дымка у горизонта
          col = mix(col, vec3(0.07,0.1,0.17), smoothstep(0.12, -0.02, d.y));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new T.Mesh(new T.SphereGeometry(800, 48, 24), skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    sc.add(sky);

    // ---------- свет ----------
    const hemiL = new T.HemisphereLight(0x5b77b8, 0x1d2536, 0.55);
    sc.add(hemiL);
    const moon = new T.DirectionalLight(0xb8ccff, 1.25);
    moon.position.copy(MOON).multiplyScalar(60);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.02;
    const shc = moon.shadow.camera;
    shc.left = -22; shc.right = 22; shc.top = 22; shc.bottom = -22; shc.near = 1; shc.far = 160;
    sc.add(moon, moon.target);

    // фонарик (телефон/ручной) — в руке у камеры
    const torch = new T.SpotLight(0xf3f6ff, 0, 30, 0.42, 0.55, 2);
    torch.castShadow = true;
    torch.shadow.mapSize.set(1024, 1024);
    torch.shadow.bias = -0.0005;
    torch.shadow.camera.near = 0.05;
    torch.map = canvasTex(256, 256, (g) => {
      const rr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      rr.addColorStop(0, "#fff"); rr.addColorStop(0.18, "#f4f4f4"); rr.addColorStop(0.22, "#9a9a9a"); rr.addColorStop(0.42, "#7a7a7a"); rr.addColorStop(0.46, "#9a9a9a"); rr.addColorStop(1, "#303030");
      g.fillStyle = rr; g.fillRect(0, 0, 256, 256);
    });
    sc.add(torch, torch.target);

    // ---------- снег: основа (дырявая там, где лежат полосы со следами) ----------
    const snowN = normalTex(256, (u, v) => fbm(u * 24, v * 24) * 0.7 + vnoise(u * 90, v * 90) * 0.3, 3.0);
    snowN.wrapS = snowN.wrapT = T.RepeatWrapping;
    // маска полос: R — первая цепочка + колеи, G — финальная цепочка (от сарая)
    const MASK = { x0: -60, z0: -30, w: 110, h: 60, px: 20 };
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = MASK.w * MASK.px; maskCanvas.height = MASK.h * MASK.px;
    const mg = maskCanvas.getContext("2d");
    mg.fillStyle = "#000"; mg.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    const maskTex = new T.CanvasTexture(maskCanvas);
    maskTex.minFilter = T.LinearFilter; maskTex.generateMipmaps = false; maskTex.flipY = false;
    function maskPath(path, width, color) {
      mg.strokeStyle = color; mg.lineWidth = width * MASK.px; mg.lineCap = "butt"; mg.lineJoin = "round";
      mg.globalCompositeOperation = "lighter";
      mg.beginPath();
      for (let s = 0; s <= path.len; s += 0.1) {
        const p = path.at(s);
        const X = (p.x - MASK.x0) * MASK.px, Y = (p.z - MASK.z0) * MASK.px;
        if (s === 0) mg.moveTo(X, Y); else mg.lineTo(X, Y);
      }
      mg.stroke();
      mg.globalCompositeOperation = "source-over";
    }

    const sparkle = (sh, withMask) => {
      sh.uniforms.uMask = { value: maskTex };
      sh.uniforms.uShowB = U.showB;
      sh.uniforms.uTorchPos = U.torchPos;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
        varying vec3 vWP; uniform sampler2D uMask; uniform float uShowB; uniform vec3 uTorchPos;
        float hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }`)
        .replace("void main() {", `void main() {
          ${withMask ? `vec2 mUv = vec2((vWP.x - (${MASK.x0.toFixed(1)})) / ${MASK.w.toFixed(1)}, (vWP.z - (${MASK.z0.toFixed(1)})) / ${MASK.h.toFixed(1)});
          if (mUv.x > 0.0 && mUv.x < 1.0 && mUv.y > 0.0 && mUv.y < 1.0) { vec4 mk = texture2D(uMask, mUv); if (mk.r > 0.5 || (mk.g > 0.5 && uShowB > 0.5)) discard; }` : ""}`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          // искры: редкие кристаллы, вспыхивающие под углом к луне / фонарику
          vec3 cell = floor(vWP * 260.0);
          float g = hh(cell);
          vec3 V = normalize(cameraPosition - vWP);
          vec3 Hm = normalize(V + normalize(vec3(${MOON.x.toFixed(3)}, ${MOON.y.toFixed(3)}, ${MOON.z.toFixed(3)})));
          vec3 Ht = normalize(V + normalize(uTorchPos - vWP));
          float face = hh(cell + 7.0);
          float spark = step(0.992, g) * (pow(max(dot(Hm, normalize(vec3(face-0.5, 1.0, hh(cell+3.0)-0.5))), 0.0), 60.0) * 3.0
                       + pow(max(dot(Ht, normalize(vec3(face-0.5, 1.0, hh(cell+3.0)-0.5))), 0.0), 40.0) * 6.0 * step(length(uTorchPos - vWP), 12.0));
          float dist = length(cameraPosition - vWP);
          totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * spark * smoothstep(25.0, 3.0, dist) * smoothstep(0.3, 1.5, dist);`);
    };
    const U = { showB: { value: 0 }, torchPos: { value: new T.Vector3() } };
    const snowMat = new T.MeshStandardMaterial({ color: 0xe9eef8, roughness: 0.82, metalness: 0, normalMap: snowN, normalScale: new T.Vector2(0.45, 0.45), envMapIntensity: 0.25 });
    snowMat.onBeforeCompile = (sh) => sparkle(sh, true);
    const trackMat = new T.MeshStandardMaterial({ color: 0xe9eef8, roughness: 0.82, metalness: 0, vertexColors: true, normalMap: snowN, normalScale: new T.Vector2(0.35, 0.35), envMapIntensity: 0.25 });
    trackMat.onBeforeCompile = (sh) => sparkle(sh, false);

    // земля
    const GW = 240, GH = 200, GS = 1.0;
    const gGeo = new T.PlaneGeometry(GW, GH, GW / GS, GH / GS);
    gGeo.rotateX(-Math.PI / 2);
    gGeo.translate(-20, 0, 0);
    {
      const p = gGeo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setY(k, baseH(p.getX(k), p.getZ(k)) - 0.002);
      gGeo.computeVertexNormals();
      const uv = gGeo.attributes.uv;
      for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) * 0.5, p.getZ(k) * 0.5);
    }
    const ground = new T.Mesh(gGeo, snowMat);
    ground.receiveShadow = true;
    sc.add(ground);

    // ---------- пути ----------
    const GATE = { x: 0, z: -3.5 }, HOUSE = { x: 0, z: -15 }, SHED = { x: 6.5, z: -9.5 };
    const CAR = { x: 3.6, z: 2.6, yaw: -Math.PI / 2 }; // нос на +Z
    // A: из леса по улице к калитке и к крыльцу
    const pathA = pathOf([[-50, 0.4], [-36, 0.1], [-22, -0.3], [-10, -0.5], [-3.2, -1.2], [-0.6, -2.6], [0, -3.6], [0.05, -6.5], [-0.1, -10], [0.2, -11.6]]);
    const printsA = stepsAlong(pathA, { seed: 5, endGap: 0.35 });
    // B: от сарая, через забор (сбит снег), к задней двери машины
    const pathB = pathOf([[6.0, -8.3], [5.6, -6], [4.9, -4.2], [4.6, -2.6], [4.4, -0.6], [4.75, 0.9]]);
    const printsB = stepsAlong(pathB, { seed: 9, endGap: 0.3, from: 0.3 });
    // колеи: машина приехала с +X и развернулась
    const pathC = pathOf([[60, 0.9], [30, 0.8], [14, 1.0], [7, 1.6]]);
    const ribA = new T.Mesh(ribbon(pathA, 0.9, printsA, null, 0.022), trackMat);
    const ribB = new T.Mesh(ribbon(pathB, 0.9, printsB, null, 0.022), trackMat);
    const ribC = new T.Mesh(ribbon(pathC, 2.6, [], { offsets: [-0.76, 0.76], fade: 4 }, 0.05), trackMat);
    [ribA, ribB, ribC].forEach((m) => { m.receiveShadow = true; sc.add(m); });
    maskPath(pathA, 0.78, "#f00");
    maskPath(pathC, 2.45, "#f00");
    maskPath(pathB, 0.78, "#0f0");
    maskTex.needsUpdate = true;

    // ---------- материалы построек ----------
    const planks = (tint, rep) => pbr(base, "weathered_brown_planks", rep || [0.5, 0.5], { color: tint, roughness: 1 });
    const wallMat = planks(0x9a8a78);
    const wallGreen = planks(0x5f7a62), wallBlue = planks(0x5d6f86), wallRed = planks(0x8a5a4a);
    const trimMat = new T.MeshStandardMaterial({ color: 0xd9dcd6, roughness: 0.7 });
    const darkMat = new T.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.9 });
    const roofSnow = new T.MeshStandardMaterial({ color: 0xe6ecf7, roughness: 0.85, normalMap: snowN, normalScale: new T.Vector2(0.3, 0.3) });
    roofSnow.onBeforeCompile = (sh) => sparkle(sh, false);
    const roofEdge = new T.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.5, metalness: 0.6 });
    const brick = pbr(base, "red_brick_03", [1, 2], { roughness: 1, color: 0xa08070 });
    const iceMat = new T.MeshStandardMaterial({ color: 0xcfe4ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.75, envMapIntensity: 1.2 });
    const glassDark = new T.MeshStandardMaterial({ color: 0x05070a, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.0 });
    const fenceMat = pbr(base, "weathered_brown_planks", [0.3, 1], { color: 0x6f8a70, roughness: 1 });

    // стена с проёмами (ExtrudeGeometry, uv в метрах)
    function wallWithHoles(w, h, holes, depth, mat, gable) {
      const s = new T.Shape();
      s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h);
      if (gable) s.lineTo(0, h + gable);
      s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
      holes.forEach(([x, y, hw, hh]) => {
        const p = new T.Path();
        p.moveTo(x - hw / 2, y - hh / 2); p.lineTo(x - hw / 2, y + hh / 2); p.lineTo(x + hw / 2, y + hh / 2); p.lineTo(x + hw / 2, y - hh / 2); p.lineTo(x - hw / 2, y - hh / 2);
        s.holes.push(p);
      });
      const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: false });
      const m = new T.Mesh(g, mat);
      m.castShadow = m.receiveShadow = true;
      return m;
    }

    // окно: рама + наличник + стекло (+иней)
    function windowUnit(wW, wH, glassMat, frost) {
      const g = new T.Group();
      const fw = 0.07;
      const bar = (w, h, x, y, d) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d || 0.08), trimMat); m.position.set(x, y, 0); m.castShadow = true; g.add(m); return m; };
      bar(wW + fw * 2, fw, 0, wH / 2 + fw / 2); bar(wW + fw * 2, fw, 0, -wH / 2 - fw / 2);
      bar(fw, wH, -wW / 2 - fw / 2, 0); bar(fw, wH, wW / 2 + fw / 2, 0);
      bar(0.05, wH, 0, 0, 0.06); bar(wW / 2, 0.05, -wW / 4, wH * 0.18, 0.06);
      // наличник: верхняя доска с «короной»
      const crown = new T.Shape();
      crown.moveTo(-wW / 2 - 0.16, 0); crown.lineTo(wW / 2 + 0.16, 0); crown.lineTo(wW / 2 + 0.1, 0.1); crown.lineTo(0, 0.24); crown.lineTo(-wW / 2 - 0.1, 0.1); crown.lineTo(-wW / 2 - 0.16, 0);
      const cm = new T.Mesh(new T.ExtrudeGeometry(crown, { depth: 0.04, bevelEnabled: false }), trimMat);
      cm.position.set(0, wH / 2 + fw, 0.01);
      cm.castShadow = true;
      g.add(cm);
      const sill = new T.Mesh(new T.BoxGeometry(wW + 0.34, 0.05, 0.2), trimMat);
      sill.position.set(0, -wH / 2 - fw - 0.02, 0.06);
      g.add(sill);
      const sillSnow = new T.Mesh(new T.CapsuleGeometry(0.04, wW + 0.18, 4, 8), roofSnow);
      sillSnow.rotation.z = Math.PI / 2; sillSnow.scale.set(1, 1, 1.6);
      sillSnow.position.set(0, -wH / 2 - fw + 0.02, 0.07);
      g.add(sillSnow);
      const glass = new T.Mesh(new T.PlaneGeometry(wW, wH), glassMat);
      glass.position.z = -0.01;
      g.add(glass);
      g.userData.glass = glass;
      if (frost) {
        const fr = new T.Mesh(new T.PlaneGeometry(wW, wH), new T.MeshStandardMaterial({ color: 0xb8c4d4, map: frost, transparent: true, opacity: 0.55, roughness: 0.75, depthWrite: false }));
        fr.position.z = -0.005;
        g.add(fr);
        g.userData.frost = fr;
      }
      return g;
    }

    // дом: фронтон на улицу (+Z), крыша двускатная, труба, крыльцо
    function house(opt) {
      const g = new T.Group();
      const W0 = opt.w || 6, D0 = opt.d || 5, H0 = opt.h || 2.6, gab = W0 * 0.42;
      const mat = opt.mat || wallMat;
      const doorX = opt.doorX == null ? -1.6 : opt.doorX, winX = 1.1;
      // фундамент засыпан, стены начинаются чуть ниже снега
      const front = wallWithHoles(W0, H0, [[doorX, 0.95, 0.9, 1.9], [winX, 1.45, 1.1, 1.2], [0, H0 + gab * 0.4, 0.6, 0.6]], 0.15, mat, gab);
      front.position.set(0, -0.3, D0 / 2 - 0.15);
      g.add(front);
      const back = wallWithHoles(W0, H0, [], 0.15, mat, gab);
      back.position.set(0, -0.3, -D0 / 2);
      g.add(back);
      // боковая стена: форма вдоль -Z, толщина вдоль +X (окно в центре стены по длине → z = -a)
      const side = (x, holes) => { const m = wallWithHoles(D0, H0, holes, 0.15, mat); m.rotation.y = Math.PI / 2; m.position.set(x, -0.3, 0); g.add(m); return m; };
      side(-W0 / 2, [[0.3, 1.45, 1.0, 1.1]]); side(W0 / 2 - 0.15, [[0.3, 1.45, 1.0, 1.1]]);
      // боковые окна — тёмные
      [[-W0 / 2 - 0.02, -0.3, -Math.PI / 2], [W0 / 2 + 0.02, -0.3, Math.PI / 2]].forEach(([x, z, ry]) => {
        const w = windowUnit(1.0, 1.1, glassDark);
        w.position.set(x, -0.3 + 1.45, z); w.rotation.y = ry; g.add(w);
      });
      // крыша: два ската снега с кромкой, сосульки
      const rafterL = Math.hypot(W0 / 2 + 0.45, gab + 0.35);
      const ang = Math.atan2(gab + 0.35, W0 / 2 + 0.45);
      [-1, 1].forEach((sd) => {
        const slab = new T.Mesh(new T.BoxGeometry(rafterL + 0.1, 0.06, D0 + 0.9), roofEdge);
        slab.position.set(sd * (W0 / 4 + 0.22) - sd * 0.02, -0.3 + H0 + gab / 2 - 0.12, 0);
        slab.rotation.z = -sd * ang;
        slab.castShadow = slab.receiveShadow = true;
        g.add(slab);
        const sn = new T.Mesh(new T.BoxGeometry(rafterL + 0.05, 0.26, D0 + 0.85, 1, 1, 1), roofSnow);
        sn.position.copy(slab.position).add(new T.Vector3(-sd * Math.sin(ang) * -0.16, Math.cos(ang) * 0.16, 0));
        sn.rotation.z = -sd * ang;
        sn.castShadow = sn.receiveShadow = true;
        g.add(sn);
        // снежный козырёк у карниза
        const cor = new T.Mesh(new T.CapsuleGeometry(0.14, D0 + 0.7, 4, 10), roofSnow);
        cor.rotation.x = Math.PI / 2;
        cor.position.set(sd * (W0 / 2 + 0.45), -0.3 + H0 - 0.33, 0);
        cor.scale.set(1.2, 1, 0.8);
        cor.castShadow = true;
        g.add(cor);
        // сосульки
        for (let k = 0; k < 14; k++) {
          const L = 0.06 + r() * r() * 0.5;
          const ic = new T.Mesh(new T.ConeGeometry(0.018 + L * 0.04, L, 6), iceMat);
          ic.rotation.x = Math.PI;
          ic.position.set(sd * (W0 / 2 + 0.43), -0.3 + H0 - 0.42 - L / 2, -D0 / 2 + (k + r()) * (D0 + 0.4) / 14);
          g.add(ic);
        }
      });
      // фронтонные доски
      // труба
      const ch = new T.Mesh(new T.BoxGeometry(0.52, 1.5, 0.52), brick);
      ch.position.set(opt.chimX == null ? 0.9 : opt.chimX, -0.3 + H0 + gab - 0.2, -0.6);
      ch.castShadow = true;
      g.add(ch);
      const cap = new T.Mesh(new T.CylinderGeometry(0.2, 0.34, 0.12, 12), roofSnow);
      cap.scale.set(1, 1, 1);
      cap.position.set(ch.position.x - 0.13, ch.position.y + 0.8, ch.position.z);
      cap.visible = !opt.smoke;
      g.add(cap);
      const hole = new T.Mesh(new T.BoxGeometry(0.3, 0.02, 0.3), darkMat);
      hole.position.set(ch.position.x, ch.position.y + 0.751, ch.position.z);
      g.add(hole);
      g.userData.chimneyTop = new T.Vector3(ch.position.x, ch.position.y + 0.78, ch.position.z);
      // фронтальное окно и окошко мансарды
      const fw = windowUnit(1.1, 1.2, opt.frontGlass || glassDark, opt.frost);
      fw.position.set(winX, -0.3 + 1.45, D0 / 2 + 0.01);
      g.add(fw);
      g.userData.frontWin = fw;
      const aw = windowUnit(0.6, 0.6, glassDark);
      aw.position.set(0, -0.3 + H0 + gab * 0.4, D0 / 2 + 0.01);
      g.add(aw);
      // дверь
      const door = new T.Mesh(new T.BoxGeometry(0.9, 1.9, 0.06), planks(0x7a6a5a, [0.5, 1]));
      door.position.set(doorX, -0.3 + 0.95, D0 / 2 - 0.08);
      door.castShadow = door.receiveShadow = true;
      g.add(door);
      g.userData.door = door;
      // крыльцо: ступени под снегом
      for (let k = 0; k < 3; k++) {
        const st = new T.Mesh(new T.BoxGeometry(1.5, 0.2, 0.4), planks(0x6a5a4a, [0.6, 0.2]));
        st.position.set(doorX, -0.3 + 0.1 + k * 0.18 + 0.06, D0 / 2 + 0.9 - k * 0.35);
        st.castShadow = st.receiveShadow = true;
        g.add(st);
        const ss = new T.Mesh(new T.BoxGeometry(1.46, 0.06, 0.38), roofSnow);
        ss.position.copy(st.position).add(new T.Vector3(0, 0.12, 0));
        ss.receiveShadow = true;
        if (!(opt.steps && k > 0)) g.add(ss);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return g;
    }

    // ---------- наш дом ----------
    const frost = frostTex(4);
    const glassMain = new T.MeshStandardMaterial({ color: 0x9fb4c8, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.18, envMapIntensity: 1.4, depthWrite: false });
    const home = house({ w: 6, d: 5, h: 2.6, frontGlass: glassMain, frost, smoke: true, steps: true, doorX: -1.6 });
    home.position.set(HOUSE.x + 1.6, 0, HOUSE.z);
    sc.add(home);
    home.userData.frontWin.userData.glass.castShadow = false;
    if (home.userData.frontWin.userData.frost) home.userData.frontWin.userData.frost.castShadow = false;

    // комната за окном (видна только через стекло): стол, клеёнка, две тарелки с супом, табуреты, печь, календарь
    const room = new T.Group();
    const RW = 5.6, RD = 4.6, RH = 2.5;
    const inMat = pbr(base, "wood_table_worn", [2, 1], { color: 0x8a7258, roughness: 0.9, side: T.BackSide });
    const roomBox = new T.Mesh(new T.BoxGeometry(RW, RH, RD), inMat);
    roomBox.position.set(0, RH / 2, 0);
    roomBox.receiveShadow = true;
    room.add(roomBox);
    const oil = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#e8e2d4"; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) { g.fillStyle = "rgba(170,40,40,0.75)"; g.fillRect(x * 64, y * 64, 64, 64); }
      g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 6;
      for (let k = 0; k < 16; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32, h); g.stroke(); }
    });
    oil.wrapS = oil.wrapT = T.RepeatWrapping; oil.repeat.set(2, 1.4);
    const table = new T.Group();
    const top = new T.Mesh(new T.BoxGeometry(1.6, 0.04, 0.9), new T.MeshStandardMaterial({ map: oil, roughness: 0.35 }));
    top.position.y = 0.76;
    table.add(top);
    const legM = pbr(base, "wood_table_worn", [0.2, 1], { roughness: 0.9 });
    [[-0.72, -0.38], [0.72, -0.38], [-0.72, 0.38], [0.72, 0.38]].forEach(([x, z]) => { const l = new T.Mesh(new T.BoxGeometry(0.06, 0.74, 0.06), legM); l.position.set(x, 0.37, z); table.add(l); });
    // тарелки: профиль вращения, суп внутри
    const plateProf = [[0, 0], [0.07, 0], [0.09, 0.01], [0.11, 0.035], [0.125, 0.05], [0.13, 0.052], [0.124, 0.047], [0.105, 0.032], [0.085, 0.012], [0, 0.012]].map(([x, y]) => new T.Vector2(x, y));
    const plateGeo = new T.LatheGeometry(plateProf, 40);
    const china = new T.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.18, metalness: 0, envMapIntensity: 0.8 });
    const soupMat = new T.MeshStandardMaterial({ color: 0x8a2416, roughness: 0.12, metalness: 0, envMapIntensity: 1.0 });
    const steamPts = [];
    [[-0.4, 0.12], [0.4, -0.12]].forEach(([x, z], i) => {
      const p = new T.Mesh(plateGeo, china);
      p.position.set(x, 0.78, z);
      p.castShadow = p.receiveShadow = true;
      table.add(p);
      const s = new T.Mesh(new T.CircleGeometry(0.098, 32), soupMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.78 + 0.034, z);
      table.add(s);
      // сметана
      const sm = new T.Mesh(new T.SphereGeometry(0.022, 12, 8), new T.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.4 }));
      sm.scale.y = 0.35; sm.position.set(x + 0.02, 0.78 + 0.037, z - 0.01);
      table.add(sm);
      // ложка
      const sp = new T.Mesh(new T.BoxGeometry(0.17, 0.006, 0.018), new T.MeshStandardMaterial({ color: 0xbfc4c8, roughness: 0.25, metalness: 1 }));
      sp.position.set(x + (i ? -0.17 : 0.17), 0.785, z + 0.02);
      sp.rotation.y = 0.2;
      table.add(sp);
      steamPts.push(new T.Vector3(x, 0.84, z));
    });
    // хлеб на доске
    const board = new T.Mesh(new T.BoxGeometry(0.3, 0.02, 0.18), legM);
    board.position.set(-0.45, 0.79, -0.32);
    table.add(board);
    const bread = new T.Mesh(new T.CapsuleGeometry(0.05, 0.14, 4, 10), new T.MeshStandardMaterial({ color: 0x6b4022, roughness: 0.8 }));
    bread.rotation.z = Math.PI / 2; bread.scale.set(1, 1, 1.3);
    bread.position.set(-0.45, 0.845, -0.32);
    table.add(bread);
    table.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    table.position.set(1.05, 0, RD / 2 - 0.75);
    room.add(table);
    // табуреты: один придвинут, второй отодвинут — «для гостя»
    const stoolMat = pbr(base, "wood_table_worn", [0.4, 0.4], { roughness: 0.9, color: 0x9a8064 });
    function stool() {
      const s = new T.Group();
      const t = new T.Mesh(new T.BoxGeometry(0.36, 0.04, 0.36), stoolMat); t.position.y = 0.46; s.add(t);
      [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].forEach(([x, z]) => { const l = new T.Mesh(new T.BoxGeometry(0.04, 0.46, 0.04), stoolMat); l.position.set(x, 0.23, z); s.add(l); });
      s.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      return s;
    }
    const st1 = stool(); st1.position.set(1.05 - 0.45, 0, RD / 2 - 0.75 - 0.6); room.add(st1);
    const st2 = stool(); st2.position.set(1.05 + 1.12, 0, RD / 2 - 0.75 + 0.1); st2.rotation.y = 0.5; room.add(st2);
    // печь с тлеющими щелями
    const stove = new T.Mesh(new T.BoxGeometry(1.1, 1.9, 1.0), pbr(base, "painted_plaster_wall", [1, 2], { color: 0xd8d2c8 }));
    stove.position.set(-1.6, 0.95, -RD / 2 + 0.6);
    stove.castShadow = stove.receiveShadow = true;
    room.add(stove);
    const fdoor = new T.Mesh(new T.BoxGeometry(0.34, 0.26, 0.02), new T.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.8, emissive: 0xff5a10, emissiveIntensity: 0 }));
    fdoor.position.set(-1.6, 0.5, -RD / 2 + 1.11);
    room.add(fdoor);
    const fire = new T.PointLight(0xff7a2a, 0, 4, 2);
    fire.position.set(-1.6, 0.5, -RD / 2 + 1.4);
    room.add(fire);
    // календарь на стене
    const calTex = canvasTex(256, 360, (g, w, h) => {
      g.fillStyle = "#f2eee4"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#b02020"; g.font = "800 34px Montserrat, Arial"; g.textAlign = "center"; g.fillText("ЯНВАРЬ", w / 2, 50);
      g.fillStyle = "#333"; g.font = "600 22px Montserrat, Arial";
      for (let d = 1; d <= 31; d++) { const c = (d + 2) % 7, rr = Math.floor((d + 2) / 7); g.fillText(String(d), 28 + c * 33, 100 + rr * 46); }
      g.strokeStyle = "#c01818"; g.lineWidth = 4; g.beginPath(); g.ellipse(28 + 3 * 33, 92 + 2 * 46, 20, 18, 0, 0, Math.PI * 2); g.stroke();
    });
    const cal = new T.Mesh(new T.PlaneGeometry(0.34, 0.48), new T.MeshStandardMaterial({ map: calTex, roughness: 0.8 }));
    cal.position.set(2.3, 1.55, -RD / 2 + 0.01);
    room.add(cal);
    room.position.set(home.position.x, 0.2, home.position.z);
    sc.add(room);
    // пар над тарелками
    const steamTex = smokeTex();
    const steam = [];
    for (let i = 0; i < 24; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: steamTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      sp.userData = { k: i, src: i % 2 };
      sc.add(sp);
      steam.push(sp);
    }
    const tableWorld = (v) => v.clone().add(table.position).add(room.position);

    // керосиновая лампа на столе (Poly Haven)
    function loadGLTF(path) {
      return new Promise((res) => new T.GLTFLoader().load(base + path, (g) => res(g.scene), undefined, () => res(null)));
    }
    waits.push(loadGLTF("models/Lantern_01/Lantern_01.gltf").then((m) => {
      if (!m) return;
      m.scale.setScalar(0.8);
      m.position.set(-0.55, 0.78, -0.25);
      m.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      table.add(m);
    }));
    waits.push(loadGLTF("models/wooden_bucket_01/wooden_bucket_01.gltf").then((m) => {
      if (!m) return;
      m.position.set(HOUSE.x - 0.5, -0.12, HOUSE.z + 3.1);
      m.rotation.z = 0.25;
      m.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      sc.add(m);
    }));
    waits.push(loadGLTF("models/wooden_crate_01/wooden_crate_01.gltf").then((m) => {
      if (!m) return;
      m.position.set(SHED.x - 1.9, -0.15, SHED.z + 0.6);
      m.rotation.y = 0.4;
      m.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      sc.add(m);
    }));

    // ---------- амбарный замок на двери ----------
    const door = home.userData.door;
    const doorW = new T.Vector3();
    door.getWorldPosition(doorW);
    const LOCK = new T.Vector3(doorW.x + 0.36, -0.3 + 1.08 + 0, doorW.z + 0.06);
    const lockG = new T.Group();
    lockG.position.copy(LOCK);
    const rustM = pbr(base, "rust_coarse_01", [0.15, 0.15], { color: 0x8f8a86, metalness: 0.7, roughness: 0.62 });
    const steelM = new T.MeshStandardMaterial({ color: 0x6c7176, metalness: 1, roughness: 0.45, envMapIntensity: 0.8 });
    const cutM = new T.MeshStandardMaterial({ color: 0xf1f4f8, metalness: 1, roughness: 0.12, envMapIntensity: 2.0, emissive: 0x30363e, emissiveIntensity: 0.4 });
    {
      const s = new T.Shape();
      const bw = 0.085, bh = 0.075, rr = 0.012;
      s.moveTo(-bw / 2 + rr, -bh); s.lineTo(bw / 2 - rr, -bh); s.quadraticCurveTo(bw / 2, -bh, bw / 2, -bh + rr);
      s.lineTo(bw / 2, -rr); s.quadraticCurveTo(bw / 2, 0, bw / 2 - rr, 0); s.lineTo(-bw / 2 + rr, 0); s.quadraticCurveTo(-bw / 2, 0, -bw / 2, -rr);
      s.lineTo(-bw / 2, -bh + rr); s.quadraticCurveTo(-bw / 2, -bh, -bw / 2 + rr, -bh);
      const body = new T.Mesh(new T.ExtrudeGeometry(s, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 }), rustM);
      body.position.z = -0.014;
      lockG.add(body);
      const kh = new T.Mesh(new T.CircleGeometry(0.006, 16), darkMat);
      kh.position.set(0, -0.045, 0.0175);
      lockG.add(kh);
      const ks = new T.Mesh(new T.PlaneGeometry(0.004, 0.012), darkMat);
      ks.position.set(0, -0.053, 0.0175);
      lockG.add(ks);
      // дужка: U из трубки; левая нога перепилена (зазор)
      const rS = 0.0055, half = 0.026, legH = 0.045;
      const arc = new T.Mesh(new T.TorusGeometry(half, rS, 12, 24, Math.PI), steelM);
      arc.position.y = legH;
      lockG.add(arc);
      const legR = new T.Mesh(new T.CylinderGeometry(rS, rS, legH + 0.01, 12), steelM);
      legR.position.set(half, legH / 2 - 0.005, 0);
      lockG.add(legR);
      // левая нога: верхний кусок (с дугой) и нижний обрубок, между ними — срез
      const gapY = 0.03, gap = 0.0045;
      const legLt = new T.Mesh(new T.CylinderGeometry(rS, rS, legH - gapY - gap / 2, 12), steelM);
      legLt.position.set(-half, gapY + gap / 2 + (legH - gapY - gap / 2) / 2, 0);
      lockG.add(legLt);
      const stub = new T.Group();
      const legLb = new T.Mesh(new T.CylinderGeometry(rS, rS, gapY - gap / 2 + 0.005, 12), steelM);
      legLb.position.set(0, (gapY - gap / 2 - 0.005) / 2, 0);
      stub.add(legLb);
      stub.position.set(-half, 0, 0);
      lockG.add(stub);
      [[gapY + gap / 2 - 0.0002, -1], [gapY - gap / 2 + 0.0002, 1]].forEach(([y, d]) => {
        const c = new T.Mesh(new T.CircleGeometry(rS * 1.02, 16), cutM);
        c.rotation.x = d * Math.PI / 2 * -1;
        c.position.set(-half, y, 0);
        lockG.add(c);
      });
      lockG.userData.stub = stub;
      lockG.userData.legLt = legLt;
      // снежная шапка на корпусе и на дуге
      const capS = new T.Mesh(new T.SphereGeometry(0.05, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), roofSnow);
      capS.scale.set(1.0, 0.32, 0.42);
      capS.position.set(0.004, 0.0, 0.002);
      lockG.add(capS);
      const capA = new T.Mesh(new T.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), roofSnow);
      capA.scale.set(1.15, 0.3, 0.35);
      capA.position.set(0.004, legH + half + rS * 0.6, 0);
      lockG.add(capA);
      // металлические опилки на снегу шапки
      const fil = new T.Group();
      for (let k = 0; k < 40; k++) {
        const f = new T.Mesh(new T.BoxGeometry(0.0012, 0.0006, 0.0012), cutM);
        f.position.set(-0.03 + r() * 0.03, 0.0155, -0.01 + r() * 0.02);
        f.rotation.y = r() * 3;
        fil.add(f);
      }
      lockG.add(fil);
      // пробой (скоба) на двери и проушина на косяке
      const hasp = new T.Mesh(new T.BoxGeometry(0.16, 0.035, 0.006), rustM);
      hasp.position.set(-0.04, legH + 0.02, -0.03);
      lockG.add(hasp);
      const eye = new T.Mesh(new T.TorusGeometry(0.014, 0.004, 8, 16), rustM);
      eye.position.set(-half, legH + 0.02, -0.022);
      eye.rotation.y = Math.PI / 2;
      lockG.add(eye);
    }
    lockG.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    sc.add(lockG);

    // ---------- сарай ----------
    const shed = new T.Group();
    {
      const sw = 3, sd = 2.4, sh = 2.1;
      const box = new T.Mesh(new T.BoxGeometry(sw, sh, sd), planks(0x7a6c5e, [0.4, 0.4]));
      box.position.y = sh / 2 - 0.3;
      shed.add(box);
      const rf = new T.Mesh(new T.BoxGeometry(sw + 0.5, 0.06, sd + 0.6), roofEdge);
      rf.position.y = sh - 0.2; rf.rotation.x = 0.18;
      shed.add(rf);
      const rs = new T.Mesh(new T.BoxGeometry(sw + 0.45, 0.24, sd + 0.55), roofSnow);
      rs.position.y = sh - 0.05; rs.rotation.x = 0.18;
      shed.add(rs);
      // дверь приоткрыта — чёрная щель
      const gapM = new T.Mesh(new T.PlaneGeometry(0.16, 1.7), new T.MeshBasicMaterial({ color: 0x000000 }));
      gapM.position.set(-0.55, 0.55, sd / 2 + 0.006);
      shed.add(gapM);
      const sdoor = new T.Mesh(new T.BoxGeometry(0.8, 1.75, 0.05), planks(0x6a5c50, [0.4, 0.8]));
      sdoor.position.set(-0.1 + 0.1, 0.57, sd / 2 + 0.12);
      sdoor.rotation.y = -0.35;
      shed.add(sdoor);
      shed.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    }
    shed.position.set(SHED.x, 0, SHED.z);
    shed.rotation.y = -0.25;
    sc.add(shed);

    // ---------- заборы-штакетник ----------
    const picketShape = new T.Shape();
    picketShape.moveTo(-0.045, 0); picketShape.lineTo(0.045, 0); picketShape.lineTo(0.045, 1.25); picketShape.lineTo(0, 1.34); picketShape.lineTo(-0.045, 1.25); picketShape.lineTo(-0.045, 0);
    const picketGeo = new T.ExtrudeGeometry(picketShape, { depth: 0.02, bevelEnabled: false });
    const picketCap = new T.SphereGeometry(0.04, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    picketCap.scale(0.9, 0.6, 0.5);
    const pickets = [], caps = [];
    const railsG = new T.Group();
    function fenceLine(x0, z0, x1, z1, skip, knock) {
      const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
      const n = Math.floor(L / 0.15);
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if (skip && skip(x, z)) continue;
        const tilt = (r() - 0.5) * 0.05, ph = 0.95 + r() * 0.12;
        pickets.push({ x, z, a, tilt, h: ph });
        const knocked = knock && knock(x, z);
        if (!knocked && r() < 0.85) caps.push({ x, z, a, h: -0.32 + 1.27 * ph });
      }
      [0.25, 0.95].forEach((y) => {
        const rail = new T.Mesh(new T.BoxGeometry(L, 0.08, 0.04), fenceMat);
        rail.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        rail.rotation.y = -a;
        rail.translateZ(-0.03);
        rail.castShadow = rail.receiveShadow = true;
        railsG.add(rail);
        if (y > 0.5) {
          const rsn = new T.Mesh(new T.BoxGeometry(L, 0.035, 0.05), roofSnow);
          rsn.position.copy(rail.position); rsn.position.y += 0.055;
          rsn.rotation.y = -a;
          if (!knock) railsG.add(rsn);
          else {
            // снег с перекладины сбит там, где перелезали
            const kx = 4.75, gapW = 0.9;
            const left = new T.Mesh(new T.BoxGeometry(Math.max(0.1, kx - gapW / 2 - x0), 0.035, 0.05), roofSnow);
            left.position.set((x0 + kx - gapW / 2) / 2, rsn.position.y, rsn.position.z);
            const right = new T.Mesh(new T.BoxGeometry(Math.max(0.1, x1 - kx - gapW / 2), 0.035, 0.05), roofSnow);
            right.position.set((x1 + kx + gapW / 2) / 2, rsn.position.y, rsn.position.z);
            railsG.add(left, right);
          }
        }
      });
    }
    // фронт улицы: калитки у каждого участка (наша — x = 0), у нас перелезали на x = 4.75
    fenceLine(-60, -3.5, 60, -3.5, (x) => [0, -24, 24, -48, 48].some((g) => Math.abs(x - g) < 0.55), (x) => Math.abs(x - 4.75) < 0.45);
    [-36, -12, 12, 36].forEach((x) => fenceLine(x, -3.5, x, -30));
    fenceLine(-60, 6.9, 60, 6.9, (xx) => [-12, 12, 34, -34].some((g) => Math.abs(xx - g) < 0.5));
    [-24, 0, 23, 46].forEach((x) => fenceLine(x, 6.9, x, 30));
    {
      const pm = new T.InstancedMesh(picketGeo, fenceMat, pickets.length);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
      pickets.forEach((p, i) => {
        e.set(p.tilt, -p.a, 0, "YXZ");
        q.setFromEuler(e);
        m4.compose(new T.Vector3(p.x, -0.32, p.z), q, new T.Vector3(1, p.h, 1));
        pm.setMatrixAt(i, m4);
      });
      pm.castShadow = pm.receiveShadow = true;
      sc.add(pm);
      const cm = new T.InstancedMesh(picketCap, roofSnow, caps.length);
      caps.forEach((p, i) => {
        q.setFromEuler(e.set(0, -p.a, 0));
        m4.compose(new T.Vector3(p.x, p.h + 0.02, p.z + 0.01), q, new T.Vector3(1, 1, 1));
        cm.setMatrixAt(i, m4);
      });
      sc.add(cm);
      sc.add(railsG);
    }
    // калитка — закрыта, створка из штакетника
    const gate = new T.Group();
    for (let k = 0; k < 7; k++) {
      const p = new T.Mesh(picketGeo, fenceMat);
      p.position.set(-0.45 + k * 0.15, -0.2, 0);
      p.scale.y = 0.95;
      gate.add(p);
    }
    [0.3, 0.95].forEach((y) => { const b = new T.Mesh(new T.BoxGeometry(1.0, 0.07, 0.03), fenceMat); b.position.set(0, y, -0.02); gate.add(b); });
    gate.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    gate.position.set(GATE.x, 0, GATE.z);
    gate.rotation.y = -0.5; // приоткрыта внутрь
    sc.add(gate);

    // ---------- соседние дачи (тёмные) ----------
    const neigh = [
      { x: -24, z: -15, mat: wallGreen }, { x: 24, z: -16, mat: wallBlue }, { x: -48, z: -14, mat: wallRed },
      { x: 48, z: -15, mat: wallMat }, { x: -12, z: 17, mat: wallBlue, flip: 1 }, { x: 12, z: 18, mat: wallGreen, flip: 1 }, { x: 34, z: 17, mat: wallRed, flip: 1 }, { x: -34, z: 18, mat: wallMat, flip: 1 },
    ];
    neigh.forEach((n, i) => {
      const h = house({ w: 5 + (i % 3), d: 4.6 + (i % 2), h: 2.5, mat: n.mat, doorX: i % 2 ? 1.4 : -1.4, chimX: i % 2 ? -0.8 : 0.8 });
      h.position.set(n.x, 0, n.z);
      if (n.flip) h.rotation.y = Math.PI;
      sc.add(h);
    });

    // ---------- столбы и провода ----------
    const poleM = pbr(base, "weathered_brown_planks", [0.1, 2], { color: 0x5a4e44, roughness: 1 });
    const wireM = new T.MeshBasicMaterial({ color: 0x050608 });
    const poles = [];
    for (let x = -60; x <= 60; x += 26) {
      const p = new T.Mesh(new T.CylinderGeometry(0.11, 0.14, 8.5, 8), poleM);
      p.position.set(x + 7, 4.0, 5.6);
      p.rotation.z = (r() - 0.5) * 0.06;
      p.castShadow = true;
      sc.add(p);
      const arm = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 1.4), poleM);
      arm.position.set(x + 7, 7.7, 5.6);
      sc.add(arm);
      poles.push(new T.Vector3(x + 7, 7.75, 5.6));
    }
    for (let i = 0; i < poles.length - 1; i++) {
      [-0.6, 0, 0.6].forEach((dz) => {
        const a = poles[i].clone().add(new T.Vector3(0, 0.08, dz)), b = poles[i + 1].clone().add(new T.Vector3(0, 0.08, dz));
        const pts = [];
        for (let k = 0; k <= 16; k++) { const t = k / 16; const p = a.clone().lerp(b, t); p.y -= 0.9 * 4 * t * (1 - t); pts.push(p); }
        const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 0.012, 4, false), wireM);
        sc.add(tube);
      });
    }

    // ---------- лес и деревья ----------
    const needles = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, w, h);
      const rn = rng(77);
      for (let k = 0; k < 2600; k++) { const x = rn() * w, y = rn() * h, l = 6 + rn() * 14, v = 60 + rn() * 195; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rn() - 0.5) * 4, y + l); g.stroke(); }
    });
    needles.wrapS = needles.wrapT = T.RepeatWrapping; needles.repeat.set(6, 3);
    const treeMat = new T.MeshStandardMaterial({ vertexColors: true, map: needles, roughness: 0.95, metalness: 0 });
    const spruceHi = [spruceGeo(14, 3.0, 1, true), spruceGeo(11, 2.6, 2, true)];
    const spruceLo = [spruceGeo(16, 3.2, 3, false), spruceGeo(12, 2.6, 4, false), spruceGeo(19, 3.6, 5, false)];
    function forest(geos, list) {
      const per = geos.map(() => []);
      list.forEach((t, i) => per[i % geos.length].push(t));
      geos.forEach((g, gi) => {
        const im = new T.InstancedMesh(g, treeMat, per[gi].length);
        const m4 = new T.Matrix4(), q = new T.Quaternion();
        per[gi].forEach((t, i) => {
          q.setFromAxisAngle(new T.Vector3(0, 1, 0), t.ry);
          m4.compose(new T.Vector3(t.x, -0.4, t.z), q, new T.Vector3(t.s, t.s * (0.9 + 0.2 * ((i * 7) % 5) / 5), t.s));
          im.setMatrixAt(i, m4);
        });
        im.castShadow = true;
        im.receiveShadow = true;
        sc.add(im);
      });
    }
    const near = [], far = [];
    // стена леса в конце улицы (x < -52) и за участками
    for (let k = 0; k < 900; k++) {
      const zone = r();
      let x, z;
      if (zone < 0.45) { x = -54 - r() * 70; z = -50 + r() * 100; }
      else if (zone < 0.75) { x = -60 + r() * 140; z = -34 - r() * 50; }
      else { x = -60 + r() * 140; z = 30 + r() * 50; }
      const t = { x, z, ry: r() * 6.28, s: 0.7 + r() * 0.6 };
      if (Math.hypot(x + 52, z) < 14 || (Math.abs(z) < 34 && x > -60)) near.push(t); else far.push(t);
    }
    // одна большая ель у нашего дома, пара на участках
    near.push({ x: -5.5, z: -19, ry: 1, s: 1.15 }, { x: 9.5, z: -21, ry: 2, s: 0.9 }, { x: -20, z: -24, ry: 3, s: 1.0 }, { x: 17, z: -26, ry: 4, s: 1.1 }, { x: -27, z: 25, ry: 5, s: 1.0 });
    forest(spruceHi, near);
    forest(spruceLo, far);
    // берёзы
    const birchM = new T.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.8 });
    birchM.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vOP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvOP = position;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vOP;\nfloat hb(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float band = step(0.82, hb(vec2(floor(vOP.y*9.0), floor(atan(vOP.z, vOP.x)*2.0))));
          diffuseColor.rgb *= mix(1.0, 0.12, band);`);
    };
    const birch = birchGeo(9, 3);
    [[-8.5, -6.5], [8.8, -5.5], [-15, 9.5], [20, -6.2], [-30, -6]].forEach(([x, z], i) => {
      const b = new T.Mesh(birch, birchM);
      b.position.set(x, -0.3, z); b.rotation.y = i * 1.3; b.scale.setScalar(0.85 + (i % 3) * 0.12);
      b.castShadow = true;
      sc.add(b);
    });

    // ---------- машина ----------
    const car = new T.Group();
    car.position.set(CAR.x, -0.1, CAR.z);
    car.rotation.y = CAR.yaw;
    sc.add(car);
    const carBody = new T.Group();
    car.add(carBody);
    const tailGlow = new T.PointLight(0xff1a10, 0, 6, 2);
    tailGlow.position.set(-2.6, 0.7, 0);
    car.add(tailGlow);
    const headSp = [];
    [-0.6, 0.6].forEach((z) => {
      const sp = new T.SpotLight(0xe8f0ff, 0, 40, 0.42, 0.6, 2);
      sp.position.set(2.2, 0.7, z);
      sp.target.position.set(12, -0.6, z * 3);
      car.add(sp, sp.target);
      headSp.push(sp);
    });
    const cabinLamp = new T.PointLight(0x9fb8ff, 0, 2.0, 2);
    cabinLamp.position.set(0.1, 1.3, 0);
    car.add(cabinLamp);
    const dashLamp = new T.PointLight(0xffb070, 0, 1.4, 2);
    dashLamp.position.set(0.7, 1.0, -0.3);
    car.add(dashLamp);
    function fit(m, length, frontHint) {
      m.updateMatrixWorld(true);
      let box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3());
      if (size.z > size.x) { m.rotation.y = Math.PI / 2; m.updateMatrixWorld(true); }
      box = new T.Box3().setFromObject(m); size = box.getSize(new T.Vector3());
      m.scale.multiplyScalar(length / size.x);
      m.updateMatrixWorld(true);
      box = new T.Box3().setFromObject(m);
      const c = box.getCenter(new T.Vector3());
      m.position.x -= c.x; m.position.z -= c.z; m.position.y -= box.min.y;
      m.updateMatrixWorld(true);
      if (frontHint) {
        const hb = new T.Box3();
        m.traverse((o) => { if (o.isMesh && o.material && frontHint.test(o.material.name || "")) hb.expandByObject(o); });
        if (!hb.isEmpty() && hb.getCenter(new T.Vector3()).x < 0) { const g = new T.Group(); g.add(m); g.rotation.y = Math.PI; return g; }
      }
      return m;
    }
    const carGLB = { head: [], tail: [] };
    let mirrorInfo = null;
    waits.push(loadGLTF("models/car.glb").then((m) => {
      if (!m) return;
      const g = fit(m, 4.48, /HeadLights/i);
      carBody.add(g);
      car.updateMatrixWorld(true);
      const inv = new T.Matrix4().copy(car.matrixWorld).invert();
      let best = null;
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        const mt = o.material, n = (mt && mt.name) || "";
        if (!mt) return;
        mt.envMapIntensity = 1.2;
        if (/Lime_Kick/i.test(n)) { mt.color.set(0xe9ecef); mt.metalness = 0.35; mt.roughness = 0.3; }
        if (/HeadLights1|HeadLights2/i.test(n)) { mt.emissive = new T.Color(0xf4f8ff); carGLB.head.push(mt); }
        if (/Tailights_Glass/i.test(n)) { mt.emissive = new T.Color(0xff1010); carGLB.tail.push(mt); }
        if (/Windows/i.test(n)) { mt.transparent = true; mt.opacity = 0.22; mt.depthWrite = false; o.castShadow = false; o.receiveShadow = false; }
        if (/Mirrors/i.test(n)) {
          const b = new T.Box3().setFromObject(o).applyMatrix4(inv);
          const c = b.getCenter(new T.Vector3());
          if (Math.abs(c.z) < 0.25 && (!best || c.y > best.c.y)) best = { c, b };
        }
      });
      // внутреннее зеркало: если не нашли — типичное место
      // внутреннее зеркало этой модели (найдено лучом из глаз водителя): стекло на x≈0.451, y≈1.30
      mirrorInfo = { c: new T.Vector3(0.452, 1.302, -0.01), size: new T.Vector3(0.02, 0.085, 0.25) };
      buildMirror();
    }));
    // фигура на заднем сиденье (3D-скан), «лежит» и поднимается
    const floorClip = new T.Plane(new T.Vector3(0, 1, 0), -0.24);
    const fig = new T.Group();
    fig.visible = false;
    car.add(fig);
    let figHolder = null;
    waits.push(loadGLTF("models/hood.glb").then((m) => {
      if (!m) return;
      m.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3());
      m.scale.multiplyScalar(1.78 / size.y);
      m.updateMatrixWorld(true);
      const b2 = new T.Box3().setFromObject(m), c = b2.getCenter(new T.Vector3());
      m.position.set(-c.x, -b2.min.y, -c.z);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.envMapIntensity = 0.1; o.material.clippingPlanes = [floorClip]; o.material.color.multiplyScalar(0.4); } });
      const holder = new T.Group();
      holder.add(m);
      holder.rotation.y = Math.PI / 2;
      fig.add(holder);
      figHolder = holder;
    }));

    // зеркало заднего вида: отдельная камера рендерит отражение в текстуру
    const mirrorRT = new T.WebGLRenderTarget(900, 306, { type: T.HalfFloatType });
    const mirrorCam = new T.PerspectiveCamera(30, 3, 0.05, 400);
    let mirrorMesh = null;
    const mirrorMat = new T.ShaderMaterial({
      uniforms: { tMap: { value: mirrorRT.texture }, uK: { value: 1 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: "uniform sampler2D tMap; uniform float uK; varying vec2 vUv; void main(){ vec2 u = vec2(1.0 - vUv.x, vUv.y); vec3 c = texture2D(tMap, u).rgb * uK; vec2 q = vUv - 0.5; c *= 1.0 - 1.4*dot(q*vec2(0.6,1.4), q*vec2(0.6,1.4)); gl_FragColor = vec4(c, 1.0); }",
    });
    function buildMirror() {
      const c = mirrorInfo.c;
      const w = mirrorInfo.size.z, h = mirrorInfo.size.y;
      mirrorMesh = new T.Mesh(new T.PlaneGeometry(w, h), mirrorMat);
      mirrorMesh.position.set(c.x - 0.004, c.y, c.z);
      mirrorMesh.rotation.y = -Math.PI / 2; // смотрит назад, на водителя
      mirrorMesh.visible = false;
      car.add(mirrorMesh);
    }

    // ---------- дым из трубы ----------
    const smokeT = smokeTex();
    const smoke = [];
    const SMN = 46;
    for (let i = 0; i < SMN; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeT, color: 0x9aa8c0, transparent: true, depthWrite: false, opacity: 0, fog: true }));
      sp.material.rotation = r() * 6.28;
      sp.userData = { k: i / SMN, j: r() };
      sc.add(sp);
      smoke.push(sp);
    }
    home.updateMatrixWorld(true);
    const chimW = home.localToWorld(home.userData.chimneyTop.clone());

    // ---------- падающий снег ----------
    const FL = 5000;
    const flGeo = new T.BufferGeometry();
    const seeds = new Float32Array(FL * 3);
    for (let i = 0; i < FL * 3; i++) seeds[i] = r();
    flGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(FL * 3), 3));
    flGeo.setAttribute("seed", new T.BufferAttribute(seeds, 3));
    const flMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 2600 }, uT: { value: 0 }, uCam: { value: new T.Vector3() }, uK: { value: 1 }, uTorch: { value: 0 }, uTP: { value: new T.Vector3() }, uTD: { value: new T.Vector3(0, 0, -1) }, uWind: { value: 0.4 } },
      vertexShader: `attribute vec3 seed; uniform float uScale, uT, uK, uTorch, uWind; uniform vec3 uCam, uTP, uTD; varying float vA; varying float vLit;
        void main(){
          float B = 18.0;
          vec3 p = seed * B;
          p.y = mod(seed.y * B - uT * (0.55 + seed.x * 0.5), B);
          p.x += uT * uWind + sin(uT * (0.6 + seed.z) + seed.x * 30.0) * 0.25;
          p.z += sin(uT * (0.5 + seed.x) + seed.z * 20.0) * 0.2;
          vec3 c = uCam - vec3(B*0.5, B*0.5, B*0.5);
          p = c + mod(p - c, B);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          gl_PointSize = clamp((0.01 + seed.z * 0.016) * uScale / max(d, 0.05), 1.0, 60.0);
          vec3 tp = normalize(p - uTP);
          vLit = uTorch * smoothstep(0.86, 0.95, dot(tp, uTD)) * smoothstep(14.0, 1.0, length(p - uTP));
          vA = uK * smoothstep(0.15, 0.8, d) * smoothstep(B*0.5, B*0.25, d);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; varying float vLit;
        void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)); gl_FragColor = vec4(vec3(0.75,0.8,0.9) + vLit*1.5, a * vA * (0.55 + vLit)); }`,
    });
    const flakes = new T.Points(flGeo, flMat);
    flakes.frustumCulled = false;
    sc.add(flakes);

    // пар изо рта — перед камерой
    const breathSp = [];
    for (let i = 0; i < 7; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeT, color: 0xcfd8e8, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      sp.material.rotation = i * 1.7;
      sp.renderOrder = 50;
      cam.add(sp);
      breathSp.push(sp);
    }
    sc.add(cam);

    // ---------- состояние ----------
    const state = {
      camX: 0, camY: 1.7, camZ: 10, tgtX: 0, tgtY: 1, tgtZ: 0, fov: 40, roll: 0, shake: 0, hand: 0,
      exposure: 1.0, moonK: 1, snow: 1, wind: 0.4,
      torch: 0, torchAim: 0, torchX: 0, torchY: 0, torchZ: 0,
      breath: -10, smoke: 1, steam: 0, fire: 0.3,
      head: 0, tail: 0.4, cabin: 0, dash: 0,
      showB: 0, figure: 0, figUp: 0, mirror: 0, lockShift: 0, mirTX: 2.0, mirTY: 1.2, mirTZ: -10,
    };

    const tmp = new T.Vector3(), fwd = new T.Vector3();
    function render(t) {
      t = t || 0;
      const s = state;
      // камера
      const sh = s.shake * 0.02, hd = s.hand * 0.01;
      cam.position.set(
        s.camX + Math.sin(t * 37) * sh + Math.sin(t * 1.3) * hd + Math.sin(t * 2.9 + 1) * hd * 0.5,
        s.camY + Math.sin(t * 29 + 1) * sh + Math.sin(t * 1.7 + 2) * hd * 0.6,
        s.camZ + Math.sin(t * 41 + 2) * sh + Math.sin(t * 1.1 + 4) * hd);
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(tmp.set(s.tgtX + Math.sin(t * 0.9) * hd * 0.6, s.tgtY + Math.sin(t * 1.4 + 1) * hd * 0.4, s.tgtZ));
      cam.rotateZ(s.roll);
      cam.updateMatrixWorld(true);
      cam.getWorldDirection(fwd);
      // луна: тень следует за камерой
      const fc = tmp.set(s.camX, 0, s.camZ).addScaledVector(new T.Vector3(fwd.x, 0, fwd.z).normalize(), 12);
      moon.target.position.copy(fc);
      moon.position.copy(fc).addScaledVector(MOON, 70);
      moon.intensity = 1.25 * s.moonK;
      skyMat.uniforms.uTime.value = t;
      skyMat.uniforms.uMoonK.value = s.moonK;
      sky.position.copy(cam.position);
      // фонарик: из руки чуть ниже и правее камеры, светит в цель (или в torchX/Y/Z)
      const right = new T.Vector3().crossVectors(fwd, cam.up).normalize();
      torch.position.copy(cam.position).addScaledVector(right, 0.18).add(new T.Vector3(0, -0.14, 0));
      if (s.torchAim > 0.5) torch.target.position.set(s.torchX + Math.sin(t * 2.1) * 0.03, s.torchY + Math.sin(t * 1.7) * 0.02, s.torchZ);
      else torch.target.position.copy(cam.position).addScaledVector(fwd, 6);
      torch.intensity = 60 * s.torch;
      torch.visible = s.torch > 0.001;
      U.torchPos.value.copy(torch.position);
      // дым
      for (let i = 0; i < SMN; i++) {
        const p = smoke[i], k = (p.userData.k + t * 0.085) % 1;
        const age = k * 11; // секунды жизни
        p.position.set(chimW.x + age * 0.33 * (0.7 + s.wind) + Math.sin(age * 0.8 + p.userData.j * 6) * 0.15 * age * 0.2, chimW.y + age * 0.55 - age * age * 0.01, chimW.z + Math.sin(age * 0.5 + p.userData.j * 9) * 0.25);
        const sz = 0.35 + age * 0.38;
        p.scale.set(sz, sz, 1);
        p.material.opacity = s.smoke * 0.42 * smooth(0, 0.06, k) * (1 - smooth(0.4, 1, k));
        p.material.rotation += 0;
      }
      // пар над супом
      steam.forEach((sp) => {
        const d = sp.userData, k = ((d.k / 12) + t * 0.22) % 1;
        const src = tableWorld(steamPts[d.src]);
        sp.position.set(src.x + Math.sin(k * 6 + d.k) * 0.03, src.y + k * 0.45, src.z + Math.cos(k * 5 + d.k) * 0.02);
        const z = 0.06 + k * 0.22;
        sp.scale.set(z, z * 1.4, 1);
        sp.material.opacity = s.steam * 0.22 * smooth(0, 0.15, k) * (1 - smooth(0.5, 1, k));
      });
      fdoor.material.emissiveIntensity = 2.5 * s.fire * (0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.3));
      fire.intensity = 1.6 * s.fire * (0.85 + 0.15 * Math.sin(t * 7));
      // снег
      flMat.uniforms.uT.value = t;
      flMat.uniforms.uScale.value = canvas.height / (2 * Math.tan(s.fov * Math.PI / 360));
      flMat.uniforms.uCam.value.copy(cam.position);
      flMat.uniforms.uK.value = s.snow;
      flMat.uniforms.uWind.value = s.wind;
      flMat.uniforms.uTorch.value = s.torch;
      flMat.uniforms.uTP.value.copy(torch.position);
      flMat.uniforms.uTD.value.copy(torch.target.position).sub(torch.position).normalize();
      // дыхание: облачко на 1.6 с после s.breath
      const bt = t - s.breath;
      breathSp.forEach((sp, i) => {
        const k = bt - i * 0.06;
        const on = k > 0 && k < 1.8;
        sp.visible = on;
        if (!on) return;
        sp.position.set(-0.02 + i * 0.012 + k * 0.05, -0.12 + k * 0.08, -0.35 - k * 0.25);
        const z = 0.12 + k * 0.35;
        sp.scale.set(z, z, 1);
        sp.material.opacity = 0.32 * smooth(0, 0.25, k) * (1 - smooth(0.5, 1.8, k));
      });
      // машина
      headSp.forEach((l) => (l.intensity = 120 * s.head));
      carGLB.head.forEach((m) => (m.emissiveIntensity = 3 * s.head));
      carGLB.tail.forEach((m) => (m.emissiveIntensity = 2.2 * s.tail));
      tailGlow.intensity = 7 * s.tail;
      cabinLamp.intensity = 1.2 * s.cabin;
      dashLamp.intensity = 0.8 * s.dash;
      // финальные следы
      U.showB.value = s.showB;
      ribB.visible = s.showB > 0.5;
      // замок: обрубок дужки сдвигается
      lockG.userData.stub.position.x = -0.026 + 0.0012 + 0.0016 * s.lockShift;
      lockG.userData.stub.position.z = 0.001;
      lockG.userData.stub.rotation.z = 0.06 * s.lockShift;
      // фигура сзади: лежит (ниже окон) → садится
      fig.visible = s.figure > 0.01 && !!figHolder;
      fig.position.set(-0.66, -0.5 - 0.6 * (1 - s.figUp), 0.0);
      fig.rotation.z = 0;
      // зеркало
      if (mirrorMesh) {
        mirrorMesh.visible = s.mirror > 0.01;
        if (mirrorMesh.visible) {
          car.updateMatrixWorld(true);
          const mp = mirrorMesh.getWorldPosition(new T.Vector3());
          // отражённая камера: глаз водителя, отражённый в плоскости зеркала
          // зеркало повёрнуто к водителю: нормаль — биссектриса «на глаз» и «на цель сзади»
          const eye = cam.position.clone();
          const n = eye.clone().sub(mp).normalize().add(new T.Vector3(s.mirTX, s.mirTY, s.mirTZ).sub(mp).normalize()).normalize();
          const dd = eye.clone().sub(mp).dot(n);
          const virt = eye.clone().addScaledVector(n, -2 * dd);
          mirrorCam.position.copy(virt);
          const look = mp.clone().sub(eye);
          look.addScaledVector(n, -2 * look.dot(n));
          mirrorCam.up.set(0, 1, 0);
          mirrorCam.lookAt(virt.clone().add(look));
          mirrorCam.near = Math.max(0.05, mp.clone().sub(virt).dot(look.clone().normalize()) + 0.06); // за корпусом зеркала
          const w = mirrorMesh.geometry.parameters.width, h = mirrorMesh.geometry.parameters.height;
          const dist = Math.max(0.1, eye.distanceTo(mp));
          mirrorCam.fov = 3.4 * 2 * Math.atan(h / 2 / dist) * 180 / Math.PI; // чуть выпуклое — видно больше
          mirrorCam.aspect = w / h;
          mirrorCam.updateProjectionMatrix();
          mirrorMesh.visible = false;
          const fogD = sc.fog.density;
          ren.setRenderTarget(mirrorRT);
          ren.render(sc, mirrorCam);
          ren.setRenderTarget(null);
          sc.fog.density = fogD;
          mirrorMesh.visible = true;
          mirrorMat.uniforms.uK.value = s.mirror;
        }
      }
      fin.uniforms.uExp.value = s.exposure;
      fin.uniforms.uTime.value = t * 37.0;
      comp.render();
    }

    // точка в системе машины → мир
    function local(x, y, z) {
      const v = new T.Vector3(x, y, z).applyAxisAngle(new T.Vector3(0, 1, 0), CAR.yaw);
      return { x: v.x + CAR.x, y: v.y - 0.1, z: v.z + CAR.z };
    }

    // постобработка
    ren.toneMapping = T.NoToneMapping;
    const rt = new T.WebGLRenderTarget(canvas.width, canvas.height, { type: T.HalfFloatType, samples: 0 });
    const comp = new T.EffectComposer(ren, rt);
    comp.addPass(new T.RenderPass(sc, cam));
    const bloom = new T.UnrealBloomPass(new T.Vector2(canvas.width / 4, canvas.height / 4), 0.6, 0.7, 0.85);
    comp.addPass(bloom);
    const fin = new T.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uExp: { value: 1 }, uTime: { value: 0 }, uVig: { value: 0.6 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uExp, uTime, uVig; varying vec2 vUv;
        vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb * uExp;
          c = aces(c);
          c = pow(c, vec3(1.0/2.2));
          vec2 q = vUv - 0.5; c *= 1.0 - uVig * dot(q*vec2(1.0,0.75), q*vec2(1.0,0.75)) * 2.2;
          float l = dot(c, vec3(0.3,0.59,0.11));
          c = mix(c, c * vec3(0.86, 0.97, 1.12), 0.55 * (1.0 - l));           // лунный холод в тенях
          c += (h(vUv * 1080.0 + uTime) - 0.5) * 0.04;                      // зерно
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    comp.addPass(fin);

    // отражения — из самой сцены (снег, луна, дома), а не из чужого HDRI с зелёной травой
    const ready = Promise.all(waits).then(() => {
      sc.position.set(-2, -1.6, 1.5);
      sky.position.set(0, 0, 0);
      sc.updateMatrixWorld(true);
      const fl = flakes.visible; flakes.visible = false;
      smoke.forEach((p) => (p.visible = false));
      sc.environment = null;
      try { sc.environment = pmrem.fromScene(sc, 0.02, 0.1, 1000).texture; } catch (e) { /* остаётся без отражений */ }
      flakes.visible = fl;
      smoke.forEach((p) => (p.visible = true));
      sc.position.set(0, 0, 0);
      sc.updateMatrixWorld(true);
      ren.compile(sc, cam);
    });
    return { state, render, ready, local, scene: sc, camera: cam, renderer: ren, P: { GATE, HOUSE, SHED, CAR, LOCK, CHIM: chimW, WIN: home.localToWorld(home.userData.frontWin.position.clone()), TABLE: () => tableWorld(new T.Vector3(0, 0.8, 0)), STOOL: () => st2.position.clone().add(room.position), pathA, pathB, printsA, printsB } };
  }

  window.SNOW3D = { create };
})();
