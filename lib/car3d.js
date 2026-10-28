// CAR3D — ночной город для «Кресла у руля»: парковка гипермаркета, дорога, перекрёсток, остановка, машина каршеринга, салон.
// Сцена — функция состояния: const W = CAR3D.create(canvas, { base: "assets/" }); tl.to(W.state, {...}); W.render().
// Метры, Y вверх. Парковка у начала координат, гипермаркет на z = -40, дорога вдоль x на z = 30, перекрёсток на x = 160.
// Реалистичные модели (glb) подхватываются, если лежат в assets/models/: car.glb, hood.glb, busstop.glb. Иначе — процедурные.
(function () {
  const T = THREE;
  const RES = 1;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
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

  // объёмный конус света от фонаря (аддитивный, мягкие края)
  const coneMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { uColor: { value: new T.Color(0xffa64d) }, uStr: { value: 0.22 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStr; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 2.0); float a = edge * pow(vY, 1.6) * uStr; gl_FragColor = vec4(uColor * a, a); }`,
  });

  function glowSprite(color, size) {
    const tex = canvasTex(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.15, "rgba(255,255,255,0.6)"); r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    s.scale.set(size, size, 1);
    return s;
  }

  // вертикальная световая дорожка на мокром асфальте (кладётся на землю, разворачивается к камере)
  let streakTex = null;
  function streak(color, w, len) {
    if (!streakTex) streakTex = canvasTex(64, 256, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.15, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const gx = g.createLinearGradient(0, 0, W, 0);
      gx.addColorStop(0, "rgba(0,0,0,1)"); gx.addColorStop(0.5, "rgba(0,0,0,0)"); gx.addColorStop(1, "rgba(0,0,0,1)");
      g.globalCompositeOperation = "destination-out"; g.fillStyle = gx; g.fillRect(0, 0, W, H);
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, len), new T.MeshBasicMaterial({ map: streakTex, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8 }));
    m.rotation.x = -Math.PI / 2;
    m.userData.len = len;
    return m;
  }

  function create(canvas, opt = {}) {
    const base = opt.base || "assets/";
    canvas.width = Math.round(1080 * RES);
    canvas.height = Math.round(1920 * RES);
    const ren = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    ren.setSize(canvas.width, canvas.height, false);
    ren.outputEncoding = T.sRGBEncoding;
    ren.toneMapping = T.ACESFilmicToneMapping;
    ren.toneMappingExposure = 1.0;
    ren.shadowMap.enabled = true;
    ren.shadowMap.type = T.PCFSoftShadowMap;
    ren.physicallyCorrectLights = true;
    ren.localClippingEnabled = true;

    const sc = new T.Scene();
    sc.background = new T.Color(0x070a12);
    sc.fog = new T.FogExp2(0x0b0f18, 0.018);
    const cam = new T.PerspectiveCamera(42, 1080 / 1920, 0.03, 600);
    const r = rng(opt.seed || 7);
    const waits = [];

    // окружение: ночное HDRI — только для отражений (кузов, мокрый асфальт)
    const pmrem = new T.PMREMGenerator(ren);
    waits.push(new Promise((res) => {
      new T.RGBELoader().load(base + "lib/tex/night_env.hdr", (hdr) => {
        hdr.mapping = T.EquirectangularReflectionMapping;
        sc.environment = pmrem.fromEquirectangular(hdr).texture;
        res();
      }, undefined, () => res());
    }));

    const hemiL = new T.HemisphereLight(0x3a4a70, 0x0b0b0c, 0.25);
    sc.add(hemiL);
    const moon = new T.DirectionalLight(0x8fa6d8, 0.25);
    moon.position.set(-40, 60, 30);
    sc.add(moon);

    // ---------- земля: мокрый асфальт ----------
    const asph = pbr(base, "asphalt_02", [60, 60], { roughness: 1, color: 0x8a8a8a, envMapIntensity: 0.9 });
    asph.onBeforeCompile = (s) => {
      // лужи: местами асфальт почти зеркальный
      s.fragmentShader = s.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        vec2 wp = vRoughnessMapUv * 3.1;
        float pud = smoothstep(0.55, 0.75, fract(sin(dot(floor(wp), vec2(12.9898,78.233)))*43758.5453) * 0.6 + 0.4 * sin(wp.x*1.7)*sin(wp.y*1.3));
        roughnessFactor = mix(roughnessFactor * 0.55, 0.06, pud);`);
    };
    const ground = new T.Mesh(new T.PlaneGeometry(800, 800), asph);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    sc.add(ground);

    // разметка парковки
    const paint = new T.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.6, transparent: true, opacity: 0.85 });
    const lines = new T.Group();
    for (let row = 0; row < 3; row++) {
      for (let k = -8; k <= 8; k++) {
        const m = new T.Mesh(new T.PlaneGeometry(0.12, 5), paint);
        m.rotation.x = -Math.PI / 2;
        m.position.set(k * 2.7, 0.012, -6 - row * 12);
        lines.add(m);
      }
    }
    sc.add(lines);

    // бордюры, разделители
    const conc = pbr(base, "concrete_layers_02", [4, 1], { roughness: 1 });
    for (let k = 0; k < 2; k++) {
      const b = new T.Mesh(new T.BoxGeometry(60, 0.18, 0.4), conc);
      b.position.set(0, 0.09, 20 - k * 0.1);
      b.receiveShadow = true;
      if (k === 0) sc.add(b);
    }

    // ---------- гипермаркет ----------
    const mall = new T.Group();
    const wall = pbr(base, "concrete_floor_worn_001", [20, 3], { color: 0x9aa0a8, roughness: 1 });
    const body = new T.Mesh(new T.BoxGeometry(110, 14, 30), wall);
    body.position.set(0, 7, -62);
    body.receiveShadow = true;
    mall.add(body);
    // фриз-короб с вывеской
    const fascia = new T.Mesh(new T.BoxGeometry(70, 4, 1.2), new T.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.5, metalness: 0.3 }));
    fascia.position.set(0, 12, -46.5);
    mall.add(fascia);
    const signTex = canvasTex(2048, 256, (g, w, h) => {
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
      g.font = "900 190px Montserrat, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#ff3b3b"; g.fillText("ГИПЕРМАРКЕТ", w / 2, h / 2 + 8);
    });
    const sign = new T.Mesh(new T.PlaneGeometry(52, 6.5), new T.MeshBasicMaterial({ map: signTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    sign.position.set(0, 12, -45.85);
    mall.add(sign);
    const signLight = new T.PointLight(0xff3030, 120, 45, 2);
    signLight.position.set(0, 11, -42);
    mall.add(signLight);
    // витрины: тёплый свет изнутри, часть погашена
    for (let k = -6; k <= 6; k++) {
      const on = Math.abs(k) < 2 || r() < 0.35;
      const g = new T.Mesh(new T.PlaneGeometry(6.2, 5.5), new T.MeshStandardMaterial({
        color: 0x0c1218, roughness: 0.05, metalness: 0.6, emissive: on ? 0xffd9a0 : 0x0a0e14, emissiveIntensity: on ? 0.22 : 0.1 }));
      g.position.set(k * 7.6, 3.2, -46.95);
      mall.add(g);
    }
    const doorL = new T.PointLight(0xffd8a8, 60, 25, 2);
    doorL.position.set(0, 3, -44);
    mall.add(doorL);
    sc.add(mall);

    // ---------- фонари парковки ----------
    const poleMat = new T.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.7 });
    const lamps = [];
    const streaks = [];
    function lamp(x, z, color, shadow, real = true) {
      const g = new T.Group();
      const pole = new T.Mesh(new T.CylinderGeometry(0.09, 0.13, 9, 10), poleMat);
      pole.position.y = 4.5;
      g.add(pole);
      const arm = new T.Mesh(new T.BoxGeometry(1.6, 0.12, 0.16), poleMat);
      arm.position.set(0.8, 8.95, 0);
      g.add(arm);
      const head = new T.Mesh(new T.BoxGeometry(0.8, 0.18, 0.4), poleMat);
      head.position.set(1.5, 8.85, 0);
      g.add(head);
      const bulb = new T.Mesh(new T.PlaneGeometry(0.7, 0.3), new T.MeshBasicMaterial({ color: 0xffd9a0 }));
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(1.5, 8.75, 0);
      g.add(bulb);
      const glow = glowSprite(new T.Color(color), 3.2);
      glow.position.set(1.5, 8.6, 0);
      g.add(glow);
      const sp = new T.SpotLight(color, 900, 34, 0.75, 0.55, 2);
      sp.position.set(1.5, 8.7, 0);
      sp.target.position.set(1.5, 0, 0);
      if (real) g.add(sp, sp.target);
      if (shadow) { sp.castShadow = true; sp.shadow.mapSize.set(512, 512); sp.shadow.bias = -0.0004; }
      const cone = new T.Mesh(new T.CylinderGeometry(0.2, 5.2, 8.6, 32, 1, true), coneMat.clone());
      cone.material.uniforms.uColor.value = new T.Color(color);
      cone.position.set(1.5, 4.4, 0);
      g.add(cone);
      g.position.set(x, 0, z);
      sc.add(g);
      const st = streak(new T.Color(color).multiplyScalar(0.7), 1.4, 16);
      sc.add(st);
      streaks.push({ m: st, x: x + 1.5, z });
      lamps.push({ g, sp, glow, cone, bulb });
      return g;
    }
    const SODIUM = 0xff9a3c;
    lamp(-9, 2, SODIUM, true);
    lamp(9, -12, SODIUM, false);
    lamp(-9, -26, SODIUM, false);
    lamp(14, 12, SODIUM, false);
    // вдоль дороги
    for (let k = 0; k < 12; k++) lamp(30 + k * 26, 24, SODIUM, false, k >= 6 && k <= 8);

    // ---------- дорога к перекрёстку ----------
    const roadMat = new T.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.4, metalness: 0.0, envMapIntensity: 1.2 });
    const road = new T.Mesh(new T.PlaneGeometry(400, 14), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(160, 0.008, 31);
    road.receiveShadow = true;
    sc.add(road);
    const dash = new T.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.5 });
    for (let k = 0; k < 60; k++) {
      const m = new T.Mesh(new T.PlaneGeometry(3, 0.15), dash);
      m.rotation.x = -Math.PI / 2;
      m.position.set(-20 + k * 7, 0.015, 31);
      sc.add(m);
    }
    // поперечная улица и зебра
    const cross = new T.Mesh(new T.PlaneGeometry(14, 400), roadMat);
    cross.rotation.x = -Math.PI / 2;
    cross.position.set(220, 0.009, 31);
    sc.add(cross);
    for (let k = 0; k < 8; k++) {
      const m = new T.Mesh(new T.PlaneGeometry(0.6, 4), dash);
      m.rotation.x = -Math.PI / 2;
      m.position.set(209, 0.016, 25.4 + k * 1.6);
      m.rotation.z = Math.PI / 2;
      sc.add(m);
    }

    // светофор у перекрёстка
    const tlight = new T.Group();
    const tpole = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 4.2, 10), poleMat);
    tpole.position.y = 2.1;
    tlight.add(tpole);
    const tbox = new T.Mesh(new T.BoxGeometry(0.36, 1.1, 0.3), new T.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5 }));
    tbox.position.y = 4.6;
    tlight.add(tbox);
    const tl3 = [0xff2020, 0xffb000, 0x20ff60].map((c, i) => {
      const m = new T.Mesh(new T.CircleGeometry(0.11, 20), new T.MeshBasicMaterial({ color: c }));
      m.position.set(0, 4.95 - i * 0.34, 0.16);
      tlight.add(m);
      const gl = glowSprite(new T.Color(c), 1.4);
      gl.position.copy(m.position).add(new T.Vector3(0, 0, 0.05));
      tlight.add(gl);
      return { m, gl };
    });
    const redL = new T.PointLight(0xff2020, 30, 14, 2);
    redL.position.set(0, 4.95, 0.6);
    tlight.add(redL);
    tlight.position.set(208, 0, 23.5);
    tlight.rotation.y = -Math.PI / 2;
    sc.add(tlight);

    // остановка за перекрёстком
    const stop = new T.Group();
    const glass = new T.MeshStandardMaterial({ color: 0x8aa0b0, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.25 });
    const frame = new T.MeshStandardMaterial({ color: 0x3c4f5a, roughness: 0.5, metalness: 0.6 });
    const roof = new T.Mesh(new T.BoxGeometry(5, 0.12, 1.8), frame);
    roof.position.y = 2.6;
    stop.add(roof);
    [[-2.4, 0.8], [2.4, 0.8], [-2.4, -0.8], [2.4, -0.8]].forEach(([x, z]) => {
      const p = new T.Mesh(new T.BoxGeometry(0.08, 2.6, 0.08), frame);
      p.position.set(x, 1.3, z);
      stop.add(p);
    });
    const back = new T.Mesh(new T.PlaneGeometry(4.8, 2.2), glass);
    back.position.set(0, 1.4, -0.85);
    stop.add(back);
    const bench = new T.Mesh(new T.BoxGeometry(3.4, 0.08, 0.45), new T.MeshStandardMaterial({ color: 0x6b3a2a, roughness: 0.7 }));
    bench.position.set(0, 0.5, -0.5);
    stop.add(bench);
    const stopLamp = new T.PointLight(0xdfe8ff, 40, 10, 2);
    stopLamp.position.set(0, 2.4, 0);
    stop.add(stopLamp);
    const adTex = canvasTex(512, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#1d6fd8"); gr.addColorStop(1, "#78c0ff"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const ad = new T.Mesh(new T.PlaneGeometry(1.2, 2), new T.MeshBasicMaterial({ map: adTex }));
    ad.position.set(2.3, 1.3, 0);
    ad.rotation.y = -Math.PI / 2;
    stop.add(ad);
    stop.position.set(232, 0, 19);
    stop.rotation.y = Math.PI;
    sc.add(stop);

    // спальный район на горизонте: панельки с редкими окнами
    const winTex = canvasTex(512, 1024, (g, w, h) => {
      g.fillStyle = "#0c0f16"; g.fillRect(0, 0, w, h);
      const rr = rng(5);
      for (let y = 20; y < h - 20; y += 44) for (let x = 14; x < w - 20; x += 34) {
        const on = rr() < 0.12;
        g.fillStyle = on ? (rr() < 0.7 ? "#ffcf86" : "#a8c6ff") : "#141924";
        g.fillRect(x, y, 20, 26);
      }
    });
    for (let k = 0; k < 14; k++) {
      const hgt = 30 + r() * 25;
      const m = new T.Mesh(new T.BoxGeometry(40 + r() * 30, hgt, 14), new T.MeshStandardMaterial({ color: 0x0c0f16, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9, roughness: 0.9 }));
      m.position.set(-120 + k * 45 + r() * 10, hgt / 2, 120 + r() * 40);
      sc.add(m);
      const m2 = m.clone();
      m2.position.set(260 + r() * 40, hgt / 2, -100 + k * 30);
      sc.add(m2);
    }

    // ---------- машина каршеринга ----------
    const car = new T.Group();
    const carBody = new T.Group();
    car.add(carBody);
    const paintMat = new T.MeshPhysicalMaterial({ color: 0xe9ecef, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
    const glassMat = new T.MeshPhysicalMaterial({ color: 0x0a0d12, metalness: 0.1, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.55, envMapIntensity: 1.5 });
    const tyre = new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.85 });
    const rim = new T.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.3 });
    function procCar() {
      // упрощённый седан (если нет glb): нижний объём + кабина + колёса
      const shape = new T.Shape();
      shape.moveTo(-2.25, 0.35); shape.lineTo(2.25, 0.35); shape.quadraticCurveTo(2.3, 0.75, 2.05, 0.9);
      shape.lineTo(1.0, 1.0); shape.quadraticCurveTo(0.5, 1.45, 0.1, 1.46); shape.lineTo(-0.9, 1.44);
      shape.quadraticCurveTo(-1.5, 1.3, -1.9, 1.02); shape.lineTo(-2.25, 0.95); shape.quadraticCurveTo(-2.35, 0.6, -2.25, 0.35);
      const geo = new T.ExtrudeGeometry(shape, { depth: 1.72, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 18 });
      geo.translate(0, 0, -0.86);
      const b = new T.Mesh(geo, paintMat);
      b.castShadow = b.receiveShadow = true;
      carBody.add(b);
      const win = new T.Mesh(new T.BoxGeometry(1.9, 0.38, 1.76), glassMat);
      win.position.set(-0.15, 1.2, 0);
      carBody.add(win);
      [[1.4, 0.82], [-1.45, 0.82], [1.4, -0.82], [-1.45, -0.82]].forEach(([x, z]) => {
        const w = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.24, 28), tyre);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.33, z);
        carBody.add(w);
        const rr = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.25, 20), rim);
        rr.rotation.x = Math.PI / 2;
        rr.position.copy(w.position);
        carBody.add(rr);
      });
      // ливрея каршеринга: полоса по борту
      const stripe = new T.MeshStandardMaterial({ color: 0x23b14d, roughness: 0.4 });
      [0.95, -0.95].forEach((z) => {
        const s = new T.Mesh(new T.PlaneGeometry(3.6, 0.16), stripe);
        s.position.set(0, 0.62, z * 0.99);
        if (z < 0) s.rotation.y = Math.PI;
        carBody.add(s);
      });
    }
    // фары и стопы
    const headL = [], tailL = [];
    [0.62, -0.62].forEach((z) => {
      const sp = new T.SpotLight(0xf2f6ff, 0, 60, 0.42, 0.45, 1.6);
      sp.position.set(2.2, 0.75, z);
      sp.target.position.set(14, 0, z * 3);
      car.add(sp, sp.target);
      headL.push(sp);
      const g = glowSprite(new T.Color(0xeef4ff), 0.7);
      g.position.set(2.3, 0.75, z);
      car.add(g);
      headL.push(g);
      const tg = glowSprite(new T.Color(0xff1010), 0.9);
      tg.position.set(-2.32, 0.85, z);
      car.add(tg);
      tailL.push(tg);
    });
    // тени от фар не считаем — дорого в программном рендере
    const tailLight = new T.PointLight(0xff1010, 0, 6, 2);
    tailLight.position.set(-2.6, 0.8, 0);
    car.add(tailLight);
    sc.add(car);

    // ---------- салон (вид водителя): торпедо, руль, экран, кресла ----------
    const cabin = new T.Group();
    const dashMat = new T.MeshStandardMaterial({ color: 0x18191b, roughness: 0.75 });
    const leather = new T.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.85 });
    const dashShape = new T.Mesh(new T.BoxGeometry(0.75, 0.24, 1.5), dashMat);
    dashShape.position.set(1.0, 0.98, 0);
    cabin.add(dashShape);
    const dashTop = new T.Mesh(new T.BoxGeometry(0.5, 0.06, 1.48), dashMat);
    dashTop.position.set(0.82, 1.1, 0);
    dashTop.rotation.z = -0.25;
    cabin.add(dashTop);
    // руль
    const wheel = new T.Group();
    const rimW = new T.Mesh(new T.TorusGeometry(0.19, 0.022, 14, 48), new T.MeshStandardMaterial({ color: 0x141416, roughness: 0.55 }));
    wheel.add(rimW);
    const hub = new T.Mesh(new T.CylinderGeometry(0.06, 0.07, 0.06, 24), new T.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.3 }));
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    [0, 2.2, -2.2].forEach((a) => {
      const sp = new T.Mesh(new T.BoxGeometry(0.17, 0.03, 0.02), rimW.material);
      sp.position.set(Math.cos(a - Math.PI / 2) * 0.09, Math.sin(a - Math.PI / 2) * 0.09, 0);
      sp.rotation.z = a - Math.PI / 2;
      wheel.add(sp);
    });
    wheel.rotation.y = Math.PI / 2;
    wheel.rotation.x = 0;
    const wheelPivot = new T.Group();
    wheelPivot.position.set(0.62, 0.98, -0.37);
    wheelPivot.rotation.z = 0.42;
    wheelPivot.add(wheel);
    cabin.add(wheelPivot);
    // экран навигатора
    const navCanvas = document.createElement("canvas");
    navCanvas.width = 640; navCanvas.height = 400;
    const navTex = new T.CanvasTexture(navCanvas);
    navTex.encoding = T.sRGBEncoding;
    const nav = new T.Mesh(new T.PlaneGeometry(0.26, 0.16), new T.MeshBasicMaterial({ map: navTex, toneMapped: false }));
    nav.position.set(0.74, 1.08, 0.0);
    nav.rotation.y = -Math.PI / 2;
    nav.rotation.x = 0;
    nav.rotateX(-0.25);
    cabin.add(nav);
    const navGlow = new T.PointLight(0x7fb6ff, 0.6, 1.2, 2);
    navGlow.position.set(0.6, 1.05, 0);
    cabin.add(navGlow);
    // кресла: водительское и пассажирское (спинка + подушка), задний диван
    function seat() {
      const s = new T.Group();
      const cush = new T.Mesh(new T.BoxGeometry(0.52, 0.12, 0.52), leather);
      cush.position.set(0, 0.45, 0);
      const backr = new T.Mesh(new T.BoxGeometry(0.12, 0.7, 0.5), leather);
      backr.position.set(-0.3, 0.83, 0);
      backr.rotation.z = 0.12;
      const head = new T.Mesh(new T.BoxGeometry(0.1, 0.2, 0.26), leather);
      head.position.set(-0.36, 1.3, 0);
      s.add(cush, backr, head);
      s.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
      return s;
    }
    const seatD = seat();
    seatD.position.set(0.15, 0, -0.37);
    cabin.add(seatD);
    const seatP = seat();
    seatP.position.set(-0.05, 0, 0.37);
    cabin.add(seatP);
    const rear = new T.Mesh(new T.BoxGeometry(0.55, 0.14, 1.36), leather);
    rear.position.set(-0.85, 0.45, 0);
    cabin.add(rear);
    const rearBack = new T.Mesh(new T.BoxGeometry(0.14, 0.7, 1.36), leather);
    rearBack.position.set(-1.12, 0.85, 0);
    rearBack.rotation.z = 0.15;
    cabin.add(rearBack);
    const roofIn = new T.Mesh(new T.BoxGeometry(2.4, 0.04, 1.5), new T.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.95 }));
    roofIn.position.set(-0.1, 1.48, 0);
    cabin.add(roofIn);
    // стойки и двери изнутри — тёмные
    const pillar = new T.MeshStandardMaterial({ color: 0x101114, roughness: 0.8 });
    [[0.75, 0.74], [0.75, -0.74]].forEach(([x, z]) => {
      const p = new T.Mesh(new T.BoxGeometry(0.08, 0.5, 0.08), pillar);
      p.position.set(x, 1.25, z);
      p.rotation.z = 0.7;
      cabin.add(p);
    });
    [0.8, -0.8].forEach((z) => {
      const d = new T.Mesh(new T.BoxGeometry(2.2, 0.5, 0.06), pillar);
      d.position.set(-0.1, 0.8, z);
      cabin.add(d);
    });
    // фигура на заднем сиденье (в капюшоне) — подменяется сканом, если есть hood.glb
    const fig = new T.Group();
    const hoodMat = new T.MeshStandardMaterial({ color: 0x15161a, roughness: 0.95 });
    const torso = new T.Mesh(new T.CapsuleGeometry(0.2, 0.35, 6, 16), hoodMat);
    torso.position.set(0, 0.85, 0);
    const headF = new T.Mesh(new T.SphereGeometry(0.13, 24, 16), new T.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 }));
    headF.position.set(0.02, 1.26, 0);
    const hood = new T.Mesh(new T.SphereGeometry(0.16, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hoodMat);
    hood.position.set(-0.01, 1.28, 0);
    hood.rotation.z = 0.35;
    fig.add(torso, headF, hood);
    fig.traverse((o) => o.isMesh && (o.castShadow = true));
    fig.position.set(-0.62, 0, -0.37);
    cabin.add(fig);
    const cabinLamp = new T.PointLight(0x9fb8ff, 0, 2.2, 2);
    cabinLamp.position.set(-0.3, 1.35, 0);
    cabin.add(cabinLamp);
    const dashLamp = new T.PointLight(0xffb070, 0, 1.4, 2);
    dashLamp.position.set(0.55, 1.0, -0.3);
    cabin.add(dashLamp);
    const redFill = new T.PointLight(0xff2020, 0, 4, 2);
    redFill.position.set(1.6, 1.3, 0);
    cabin.add(redFill);
    car.add(cabin);

    // ---------- загрузка glb (если есть) ----------
    function loadGLB(name) {
      return new Promise((res) => {
        new T.GLTFLoader().load(base + "models/" + name, (g) => res(g.scene), undefined, () => res(null));
      });
    }
    // модель из glb: длина length по оси X, перед (фары) — в +X, низ на y = 0, центр в нуле
    function fit(m, length, frontHint) {
      m.updateMatrixWorld(true);
      let box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3());
      if (size.z > size.x) { m.rotation.y = Math.PI / 2; m.updateMatrixWorld(true); }
      box = new T.Box3().setFromObject(m); size = box.getSize(new T.Vector3());
      const k = length / size.x;
      m.scale.multiplyScalar(k);
      m.updateMatrixWorld(true);
      box = new T.Box3().setFromObject(m);
      const c = box.getCenter(new T.Vector3());
      m.position.x -= c.x; m.position.z -= c.z; m.position.y -= box.min.y;
      m.updateMatrixWorld(true);
      if (frontHint) {
        // где фары: если сзади — разворачиваем на 180°
        const hb = new T.Box3();
        m.traverse((o) => { if (o.isMesh && o.material && frontHint.test(o.material.name || "")) hb.expandByObject(o); });
        if (!hb.isEmpty() && hb.getCenter(new T.Vector3()).x < 0) {
          const g = new T.Group(); g.add(m); g.rotation.y = Math.PI; return g;
        }
      }
      return m;
    }
    const carGLB = { head: [], tail: [], paint: [] };
    const carReady = loadGLB("car.glb").then((m) => {
      if (!m) { procCar(); return; }
      const g = fit(m, 4.48, /HeadLights/i);
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        const mt = o.material, n = (mt && mt.name) || "";
        if (!mt) return;
        mt.envMapIntensity = 1.3;
        if (/Lime_Kick/i.test(n)) { mt.color.set(opt.paint || 0xeef0f2); mt.metalness = 0.35; mt.roughness = 0.28; carGLB.paint.push(mt); }
        if (/HeadLights1|HeadLights2/i.test(n)) { mt.emissive = new T.Color(0xf4f8ff); carGLB.head.push(mt); }
        if (/Tailights_Glass/i.test(n)) { mt.emissive = new T.Color(0xff1010); carGLB.tail.push(mt); }
        if (/Windows/i.test(n)) { mt.transparent = true; mt.opacity = 0.35; mt.depthWrite = false; }
      });
      carBody.add(g);
      // процедурный салон больше не нужен — остаются экран навигатора и фигура
      [dashShape, dashTop, wheelPivot, seatD, seatP, rear, rearBack, roofIn].forEach((o) => (o.visible = false));
      cabin.children.forEach((o) => { if (o.isMesh && o.material === pillar) o.visible = false; });
      hasGLB = true;
    });
    let hasGLB = false;
    // человек в худи (3D-скан): «сидит» сзади — стоячий скан опущен в кресло, ноги уходят под пол
    const figReady = loadGLB("hood.glb").then((m) => {
      if (!m) return;
      m.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3());
      m.scale.multiplyScalar(1.78 / size.y);
      m.updateMatrixWorld(true);
      const b2 = new T.Box3().setFromObject(m), c = b2.getCenter(new T.Vector3());
      m.position.set(-c.x, -b2.min.y, -c.z);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.envMapIntensity = 0.12; o.material.clippingPlanes = [floorClip]; if (opt.hoodTint) o.material.color.multiplyScalar(opt.hoodTint); } });
      const holder = new T.Group();
      holder.add(m);
      holder.rotation.y = opt.hoodYaw == null ? Math.PI / 2 : opt.hoodYaw; // лицом вперёд по машине (+X)
      fig.children.forEach((o) => (o.visible = false));
      fig.add(holder);
      figHolder = holder;
    });
    let figHolder = null;
    const floorClip = new T.Plane(new T.Vector3(0, 1, 0), -0.32); // всё, что ниже пола машины, не рисуется
    waits.push(figReady);
    waits.push(loadGLB("busstop.glb").then((m) => {
      if (!m) return;
      const g = fit(m, 5.2);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      stop.children.forEach((o) => { if (o.isMesh) o.visible = false; });
      g.rotation.y += Math.PI;
      stop.add(g);
    }));
    waits.push(carReady);

    // ---------- дождь ----------
    const rainN = 2500;
    const rainGeo = new T.BufferGeometry();
    const rp = new Float32Array(rainN * 6);
    const rs = new Float32Array(rainN);
    for (let i = 0; i < rainN; i++) { rs[i] = r(); }
    rainGeo.setAttribute("position", new T.BufferAttribute(rp, 3));
    const rain = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: 0x9fb0c8, transparent: true, opacity: 0.35 }));
    rain.frustumCulled = false;
    sc.add(rain);

    // ---------- состояние ----------
    const state = {
      camX: 6, camY: 1.7, camZ: 12, tgtX: 0, tgtY: 1, tgtZ: 0, fov: 40, roll: 0, shake: 0,
      carX: 0, carZ: 0, carYaw: 0, wheelSteer: 0,
      head: 0, tail: 0, cabin: 1, figure: 0, figX: -0.62, figY: -0.5, figZ: -0.37, figDrive: 0,
      seat: 0.0, push: 0, lampFlick: 0, cabinLight: 0.3, dashLight: 1, redIn: 0, navX: 0.52, navY: 0.99, navZ: 0.0, navOn: 0, blink: 0, hemi: 1, red: 1, green: 0, rain: 0.6, exposure: 1.0,
      navMode: 0, navMin: 11, phone: 0,
    };

    function drawNav(t) {
      const g = navCanvas.getContext("2d"), w = 640, h = 400;
      g.fillStyle = "#0e1726"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#1f3049"; g.lineWidth = 10;
      for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(-50 + k * 90, 0); g.lineTo(k * 90 + 40, h); g.stroke(); }
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, k * 80); g.lineTo(w, k * 80 + 30); g.stroke(); }
      if (state.navMode > 0) {
        g.strokeStyle = "#3d9bff"; g.lineWidth = 14; g.lineJoin = "round";
        g.beginPath(); g.moveTo(320, 380); g.lineTo(320, 250); g.lineTo(420, 170); g.lineTo(420, 60); g.lineTo(560, 30); g.stroke();
        g.fillStyle = "#fff"; g.beginPath(); g.moveTo(320, 330); g.lineTo(300, 370); g.lineTo(340, 370); g.fill();
        g.fillStyle = "rgba(10,16,26,0.9)"; g.fillRect(0, 0, w, 90);
        g.fillStyle = "#fff"; g.font = "700 46px Montserrat, Arial"; g.fillText("Дом", 24, 60);
        g.fillStyle = "#62e08a"; g.font = "800 46px Montserrat, Arial"; g.textAlign = "right";
        g.fillText(Math.round(state.navMin) + " мин", w - 24, 60); g.textAlign = "left";
      } else {
        g.fillStyle = "#fff"; g.font = "700 40px Montserrat, Arial"; g.fillText("Куда едем?", 24, 60);
      }
      navTex.needsUpdate = true;
    }

    const tmp = new T.Vector3();
    function render(t) {
      t = t || 0;
      const s = state;
      // машина
      car.position.set(s.carX, 0, s.carZ);
      car.rotation.y = s.carYaw;
      cabin.visible = s.cabin > 0.01;
      headL.forEach((l) => (l.isSpotLight ? (l.intensity = 130 * s.head) : (l.material.opacity = Math.max(s.head, s.blink > 0 && Math.sin(t * 18) > 0 ? s.blink : 0))));
      tailL.forEach((l) => (l.material.opacity = s.tail));
      tailLight.intensity = 8 * s.tail;
      // кресло водителя: вперёд к рулю (seat 0 = нормально, 1 = вплотную), толчок сзади
      seatD.position.x = 0.15 + 0.22 * s.seat + 0.08 * s.push;
      seatD.rotation.z = -0.12 * s.push;
      fig.visible = s.figure > 0.01;
      fig.position.set(s.figX + 0.1 * s.push, s.figY, s.figZ);
      cabinLamp.intensity = 1.2 * s.cabinLight;
      dashLamp.intensity = 0.8 * s.dashLight;
      redFill.intensity = 6 * s.redIn;
      nav.position.set(s.navX, s.navY, s.navZ);
      nav.visible = s.navOn > 0;
      const bl = s.blink > 0 ? (Math.sin(t * 18) > 0 ? 1 : 0) * s.blink : 0;
      carGLB.head.forEach((m) => (m.emissiveIntensity = 3 * Math.max(s.head, bl)));
      hemiL.intensity = 0.25 * s.hemi;
      carGLB.tail.forEach((m) => (m.emissiveIntensity = 2 * s.tail));
      fig.traverse((o) => { if (o.isMesh) { o.material.transparent = s.figure < 1; o.material.opacity = s.figure; } });
      wheel.rotation.x = s.wheelSteer;
      // фонари: мерцание
      lamps.forEach((L, i) => {
        const f = i === 0 ? 1 - s.lampFlick * (0.5 + 0.5 * Math.sin(t * 53.0) * Math.sin(t * 17.0)) : 1;
        L.sp.intensity = 900 * f;
        L.glow.material.opacity = f;
        L.cone.material.uniforms.uStr.value = 0.22 * f;
      });
      // светофор
      tl3[0].m.material.color.setScalar(0).setRGB(s.red, 0.05 * s.red, 0.05 * s.red);
      tl3[0].gl.material.opacity = s.red;
      redL.intensity = 30 * s.red;
      tl3[2].m.material.color.setRGB(0.05 * s.green, s.green, 0.35 * s.green);
      tl3[2].gl.material.opacity = s.green;
      tl3[1].gl.material.opacity = 0;
      tl3[1].m.material.color.setRGB(0.12, 0.08, 0.0);
      // дождь вокруг камеры
      const P = rainGeo.attributes.position.array;
      for (let i = 0; i < rainN; i++) {
        const a = rs[i];
        const x = s.camX + ((a * 9301.0) % 1 - 0.5) * 30;
        const z = s.camZ + ((a * 49297.0) % 1 - 0.5) * 30;
        const y = 14 - ((t * 11 + a * 140) % 15);
        P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = z;
        P[i * 6 + 3] = x + 0.03; P[i * 6 + 4] = y - 0.45; P[i * 6 + 5] = z;
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.material.opacity = 0.32 * s.rain;
      drawNav(t);
      // камера: координаты в мире; сдвиг + тряска
      const sh = s.shake * 0.02;
      cam.position.set(s.camX + Math.sin(t * 37) * sh, s.camY + Math.sin(t * 29 + 1) * sh, s.camZ + Math.sin(t * 41 + 2) * sh);
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(tmp.set(s.tgtX, s.tgtY, s.tgtZ));
      cam.rotateZ(s.roll);
      // дорожки отражений: вдоль направления «огонь → камера» по земле
      streaks.forEach((o) => {
        const dx = s.camX - o.x, dz = s.camZ - o.z, d = Math.hypot(dx, dz) || 1;
        o.m.position.set(o.x + dx / d * o.m.userData.len * 0.5, 0.02, o.z + dz / d * o.m.userData.len * 0.5);
        o.m.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
      });
      fin.uniforms.uExp.value = s.exposure;
      fin.uniforms.uTime.value = t * 37.0;
      comp.render();
    }

    // точки в системе координат машины → мир (для камеры внутри салона)
    function local(x, y, z) {
      const v = new T.Vector3(x, y, z);
      v.applyAxisAngle(new T.Vector3(0, 1, 0), state.carYaw);
      return { x: v.x + state.carX, y: v.y, z: v.z + state.carZ };
    }

    // постобработка
    ren.toneMapping = T.NoToneMapping;
    const rt = new T.WebGLRenderTarget(canvas.width, canvas.height, { type: T.HalfFloatType, samples: 0 });
    const comp = new T.EffectComposer(ren, rt);
    comp.addPass(new T.RenderPass(sc, cam));
    const bloom = new T.UnrealBloomPass(new T.Vector2(canvas.width / 4, canvas.height / 4), 0.55, 0.65, 0.9);
    comp.addPass(bloom);
    const fin = new T.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uExp: { value: 1 }, uTime: { value: 0 }, uVig: { value: 0.55 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uExp, uTime, uVig; varying vec2 vUv;
        vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb * uExp;
          c = aces(c);
          c = pow(c, vec3(1.0/2.2));
          vec2 q = vUv - 0.5; c *= 1.0 - uVig * dot(q*vec2(1.0,0.75), q*vec2(1.0,0.75)) * 2.2;
          c = mix(c, c * vec3(0.92, 1.0, 1.08), 0.35);                    // холодный тон в тенях
          c += (h(vUv * 1080.0 + uTime) - 0.5) * 0.035;                   // зерно
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    comp.addPass(fin);

    const ready = Promise.all(waits).then(() => ren.compile(sc, cam));
    return { state, render, ready, local, scene: sc, camera: cam, renderer: ren };
  }

  window.CAR3D = { create };
})();
