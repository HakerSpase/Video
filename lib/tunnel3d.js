// 3D-тоннель метро (three.js r149): тюбинги, путь, контактный рельс, головной вагон,
// аварийный телефон, толпа с фонариками и те, кто возвращается в темноте.
// Сцена — функция состояния: const W = TUNNEL3D.create(canvas); tl.to(W.state, {...});
// tl.eventCallback("onUpdate", () => W.render(tl.time())). Метры; поезд смотрит в −z, кабина в z = 0.
window.TUNNEL3D = (function () {
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

  function tex(w, h, draw, rep) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }

  function speckle(c, w, h, r, a, n) {
    for (let i = 0; i < n; i++) {
      const v = Math.floor(r() * 255);
      c.fillStyle = "rgba(" + v + "," + v + "," + v + "," + a * r() + ")";
      c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  }

  function create(canvas, opt) {
    opt = opt || {};
    const r = rng(opt.seed || 9);
    const W = canvas.width, H = canvas.height;
    const ren = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    ren.setSize(W, H, false);
    ren.physicallyCorrectLights = true;
    ren.outputEncoding = T.sRGBEncoding;
    ren.toneMapping = T.ACESFilmicToneMapping;
    ren.toneMappingExposure = 1.0;
    ren.shadowMap.enabled = true;
    ren.shadowMap.type = T.PCFSoftShadowMap;

    const sc = new T.Scene();
    sc.background = new T.Color(0x010204);
    sc.fog = new T.FogExp2(0x020306, 0.045);
    const cam = new T.PerspectiveCamera(55, W / H, 0.05, 260);
    const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o));
    const add = (geo, mat, x, y, z, o) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = !(o && o.noCast);
      m.receiveShadow = true;
      ((o && o.parent) || sc).add(m);
      return m;
    };

    // --- тоннель: чугунные тюбинги, кольцо каждые 1 м, болты
    const R = 2.8, CY = 1.75, LEN = 240, Z0 = 30;
    // плитка = 1/8 окружности × одно кольцо (1 м): кольцевой шов сверху, радиальный слева, болты
    const ringTex = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#3b3e41";
      c.fillRect(0, 0, w, h);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(0,0,0,0.35)");
      g.addColorStop(0.15, "rgba(255,255,255,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0.15)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(8,8,10,0.9)";
      c.fillRect(0, 0, w, 10);
      c.fillRect(0, 0, 6, h);
      c.fillStyle = "rgba(150,150,150,0.2)";
      c.fillRect(0, 10, w, 2);
      for (let x = 20; x < w; x += 40) {
        c.fillStyle = "rgba(25,22,18,0.9)";
        c.beginPath();
        c.arc(x, 22, 5, 0, 6.283);
        c.fill();
      }
      c.fillStyle = "rgba(110,80,40,0.18)";
      for (let i = 0; i < 6; i++) c.fillRect(r() * w, r() * h, 2 + r() * 6, 20 + r() * 80);
      speckle(c, w, h, r, 0.25, 2500);
    }, [8, LEN]);
    const tube = add(new T.CylinderGeometry(R, R, LEN, 48, 1, true), std({ map: ringTex, side: T.BackSide, roughness: 0.9, metalness: 0.2 }), 0, CY, Z0 - LEN / 2, { noCast: true });
    tube.rotation.x = Math.PI / 2;

    // путевое основание и лотки
    const bedTex = tex(256, 256, (c, w, h) => {
      c.fillStyle = "#26282a";
      c.fillRect(0, 0, w, h);
      speckle(c, w, h, r, 0.35, 6000);
      c.fillStyle = "rgba(0,0,0,0.5)";
      c.fillRect(0, h / 2 - 6, w, 12);
    }, [3, LEN / 4]);
    add(new T.PlaneGeometry(4.4, LEN), std({ map: bedTex, roughness: 0.95 }), 0, 0, Z0 - LEN / 2, { noCast: true }).rotation.x = -Math.PI / 2;

    // шпалы (инстансы), рельсы
    const SL = Math.floor(LEN / 0.55);
    const sleepers = new T.InstancedMesh(new T.BoxGeometry(2.6, 0.12, 0.22), std({ color: 0x3b3128, roughness: 0.95 }), SL);
    const m4 = new T.Matrix4();
    for (let i = 0; i < SL; i++) {
      m4.makeTranslation(0, 0.06, Z0 - i * 0.55);
      sleepers.setMatrixAt(i, m4);
    }
    sleepers.receiveShadow = true;
    sc.add(sleepers);
    const steel = std({ color: 0x8a8f96, roughness: 0.35, metalness: 0.85 });
    [-0.76, 0.76].forEach((x) => add(new T.BoxGeometry(0.075, 0.16, LEN), steel, x, 0.2, Z0 - LEN / 2));

    // контактный рельс справа под защитным коробом, кронштейны каждые 5 м
    const third = add(new T.BoxGeometry(0.09, 0.11, LEN), std({ color: 0x6d6a66, roughness: 0.5, metalness: 0.8, emissive: new T.Color(0x66b3ff), emissiveIntensity: 0 }), 1.55, 0.33, Z0 - LEN / 2);
    add(new T.BoxGeometry(0.34, 0.03, LEN), std({ color: 0x9b8a5a, roughness: 0.8 }), 1.6, 0.45, Z0 - LEN / 2);
    const brMat = std({ color: 0xc9b23a, roughness: 0.6 });
    for (let z = Z0; z > Z0 - LEN; z -= 5) add(new T.BoxGeometry(0.12, 0.3, 0.12), brMat, 1.72, 0.22, z);

    // кабели вдоль стен
    const cable = std({ color: 0x141414, roughness: 0.6 });
    [[-2.55, 1.2], [-2.5, 1.38], [-2.42, 1.56], [2.55, 1.2], [2.5, 1.38]].forEach(([x, y]) => {
      const c = add(new T.CylinderGeometry(0.035, 0.035, LEN, 8), cable, x, y, Z0 - LEN / 2, { noCast: true });
      c.rotation.x = Math.PI / 2;
    });
    // светильники тоннеля (выключены, тускло светятся при «свете»)
    const lampMat = std({ color: 0x222222, emissive: new T.Color(0xfff1c8), emissiveIntensity: 0 });
    const lampLights = [];
    for (let z = Z0; z > Z0 - LEN; z -= 12) {
      add(new T.BoxGeometry(0.25, 0.12, 0.5), lampMat, -2.2, 2.75, z, { noCast: true });
      if (z < 6 && z > -50) {
        const l = new T.PointLight(0xffe7b8, 0, 14, 2);
        l.position.set(-1.9, 2.5, z);
        sc.add(l);
        lampLights.push(l);
      }
    }
    // отражающие пикетные таблички
    const plate = std({ color: 0xdedede, emissive: new T.Color(0x888888), emissiveIntensity: 0.05 });
    for (let z = Z0 - 10; z > Z0 - LEN; z -= 20) add(new T.BoxGeometry(0.02, 0.18, 0.3), plate, -2.62, 1.9, z, { noCast: true });

    // аварийный телефон на левой стене
    const PZ = -18;
    const phone = new T.Group();
    add(new T.BoxGeometry(0.12, 0.6, 0.45), std({ color: 0x7a2e0c, roughness: 0.7 }), 0, 0, 0, { parent: phone });
    add(new T.BoxGeometry(0.06, 0.25, 0.08), std({ color: 0x111111 }), 0.08, 0.05, 0.08, { parent: phone });
    const phoneLamp = add(new T.SphereGeometry(0.05, 12, 8), std({ color: 0x330000, emissive: new T.Color(0xff2a1a), emissiveIntensity: 0 }), 0.04, 0.38, 0, { parent: phone, noCast: true });
    phone.position.set(-2.55, 1.45, PZ);
    sc.add(phone);
    const phoneLight = new T.PointLight(0xff3020, 0, 4, 2);
    phoneLight.position.set(-2.3, 1.85, PZ);
    sc.add(phoneLight);

    // --- головной вагон: кабина в z = 0, состав уходит в +z
    const train = new T.Group();
    const bodyTex = tex(512, 256, (c, w, h) => {
      c.fillStyle = "#2c4f7c";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#cfd6de";
      c.fillRect(0, h * 0.62, w, h * 0.12);
      speckle(c, w, h, r, 0.12, 3000);
    });
    const body = std({ map: bodyTex, roughness: 0.55, metalness: 0.3 });
    add(new T.BoxGeometry(2.7, 2.65, 19), body, 0, 1.9, 9.6, { parent: train });
    add(new T.BoxGeometry(2.6, 2.45, 0.5), std({ color: 0x1f3a5c, roughness: 0.5, metalness: 0.3 }), 0, 1.85, 0.05, { parent: train });
    const glass = std({ color: 0x05070a, roughness: 0.1, metalness: 0.6, emissive: new T.Color(0xffc27a), emissiveIntensity: 0 });
    add(new T.BoxGeometry(2.1, 0.85, 0.05), glass, 0, 2.45, -0.21, { parent: train, noCast: true });
    const headMat = std({ color: 0x222222, emissive: new T.Color(0xffffff), emissiveIntensity: 0 });
    [-0.85, 0.85].forEach((x) => add(new T.CylinderGeometry(0.11, 0.11, 0.06, 16), headMat, x, 1.05, -0.22, { parent: train, noCast: true }).rotation.x = Math.PI / 2);
    // окна и двери вдоль борта: тёплый аварийный свет изнутри
    const winMat = std({ color: 0x080808, emissive: new T.Color(0xffb35a), emissiveIntensity: 0 });
    const doorMat = std({ color: 0x080808, emissive: new T.Color(0xffb35a), emissiveIntensity: 0 });
    const doorPanels = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const z = 2.2 + k * 4.4;
        add(new T.BoxGeometry(0.04, 1.85, 1.3), doorMat, side * 1.36, 1.55, z, { parent: train, noCast: true });
        const pl = add(new T.BoxGeometry(0.05, 1.85, 0.64), body, side * 1.39, 1.55, z - 0.32, { parent: train });
        const pr = add(new T.BoxGeometry(0.05, 1.85, 0.64), body, side * 1.39, 1.55, z + 0.32, { parent: train });
        doorPanels.push([pl, pr, z]);
        if (k < 3) add(new T.BoxGeometry(0.04, 0.8, 2.4), winMat, side * 1.36, 2.3, z + 2.2, { parent: train, noCast: true });
      }
    }
    add(new T.BoxGeometry(2.4, 0.55, 18), std({ color: 0x15171a, roughness: 0.8, metalness: 0.4 }), 0, 0.45, 9.6, { parent: train });
    sc.add(train);

    const headL = [-0.85, 0.85].map((x) => {
      const l = new T.SpotLight(0xf3f6ff, 0, 60, 0.38, 0.5, 1.6);
      l.position.set(x, 1.05, -0.3);
      l.target.position.set(x * 0.3, 0.6, -40);
      l.castShadow = x < 0;
      l.shadow.mapSize.set(1024, 1024);
      sc.add(l, l.target);
      return l;
    });
    const emerg = new T.PointLight(0xffa95a, 0, 9, 2);
    emerg.position.set(0, 2.3, -0.8);
    sc.add(emerg);
    const sideGlow = [-1, 1].map((s) => {
      const l = new T.PointLight(0xffa95a, 0, 6, 2);
      l.position.set(s * 1.9, 1.8, 3);
      sc.add(l);
      return l;
    });
    // аварийный тёплый свет из кабины вперёд — в нём видны силуэты тех, кто возвращается
    const cabGlow = new T.SpotLight(0xffa95a, 0, 30, 0.6, 0.8, 1.4);
    cabGlow.position.set(0, 2.2, -0.4);
    cabGlow.target.position.set(0, 1.0, -20);
    sc.add(cabGlow, cabGlow.target);
    const amb = new T.HemisphereLight(0x223048, 0x0b0806, 0.12);
    sc.add(amb);
    // фонарь в руке зрителя
    const hand = new T.SpotLight(0xfff0d6, 0, 25, 0.42, 0.6, 1.8);
    hand.castShadow = true;
    hand.shadow.mapSize.set(1024, 1024);
    sc.add(hand, hand.target);

    // --- люди: уходящие с фонариками и возвращающиеся без света
    const glowTex = tex(64, 64, (c, w, h) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,248,225,1)");
      g.addColorStop(0.25, "rgba(255,240,200,0.6)");
      g.addColorStop(1, "rgba(255,240,200,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    const coat = [0x23262d, 0x2d2622, 0x1d2430, 0x302a2a, 0x262b26].map((c) => std({ color: c, roughness: 0.95 }));
    const skin = std({ color: 0x8a6f60, roughness: 0.8 });
    function person(parent, i) {
      const g = new T.Group();
      add(new T.CapsuleGeometry(0.2, 0.85, 4, 10), coat[i % coat.length], 0, 0.95, 0, { parent: g });
      add(new T.SphereGeometry(0.13, 12, 10), skin, 0, 1.68, 0, { parent: g });
      parent.add(g);
      return g;
    }
    const crowd = [];
    const crowdG = new T.Group();
    sc.add(crowdG);
    for (let i = 0; i < 40; i++) {
      const p = person(crowdG, i);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xfff2d8, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      sp.scale.set(0.8, 0.8, 0.8);
      sp.position.set(0.18, 1.35, -0.2);
      p.add(sp);
      crowd.push({ g: p, sp, x: (r() - 0.5) * 2.0, z0: -4 - r() * 11, ph: r() * 6.28, sp0: 1.15 + r() * 0.35, off: r() });
    }
    const crowdLights = [0, 1, 2].map(() => {
      const l = new T.PointLight(0xfff0d0, 0, 14, 2);
      sc.add(l);
      return l;
    });
    const ret = [];
    const retG = new T.Group();
    sc.add(retG);
    const shadowMat = std({ color: 0x0c0c0e, roughness: 0.9 });
    for (let i = 0; i < 41; i++) {
      const p = person(retG, i + 3);
      p.children.forEach((m) => (m.material = shadowMat)); // силуэты: ни лиц, ни цвета
      ret.push({ g: p, x: ((i % 4) - 1.5) * 0.55 + (r() - 0.5) * 0.15, row: Math.floor(i / 4) });
    }

    const state = {
      camX: 0, camY: 1.7, camZ: -6, tgtX: 0, tgtY: 1.6, tgtZ: 6, fov: 55, roll: 0,
      head: 1, emerg: 0, tunnelLamps: 1, doors: 0, exposure: 1.0,
      crowd: 0, walked: 0, lit: 40, ret: 0, retDist: 60, retStep: 0,
      rail: 0, phone: 0, hand: 0, aimX: 0, aimY: 1, aimZ: -20,
    };
    const tmp = new T.Vector3();

    function render(t) {
      const s = state;
      cam.position.set(s.camX, s.camY, s.camZ);
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(s.tgtX, s.tgtY, s.tgtZ);
      cam.rotateZ(s.roll);
      ren.toneMappingExposure = s.exposure;

      headL.forEach((l) => (l.intensity = 80 * s.head));
      headMat.emissiveIntensity = 3 * s.head;
      lampMat.emissiveIntensity = 1.5 * s.tunnelLamps;
      lampLights.forEach((l) => (l.intensity = 9 * s.tunnelLamps));
      amb.intensity = 0.04 + 0.4 * s.tunnelLamps;
      emerg.intensity = 6 * s.emerg;
      sideGlow.forEach((l) => (l.intensity = 3 * s.emerg));
      cabGlow.intensity = 12 * s.emerg;
      glass.emissiveIntensity = 0.12 * s.emerg;
      winMat.emissiveIntensity = 0.9 * s.emerg;
      doorMat.emissiveIntensity = 1.2 * s.emerg * s.doors;
      doorPanels.forEach(([pl, pr, z]) => {
        pl.position.z = z - 0.32 - 0.6 * s.doors;
        pr.position.z = z + 0.32 + 0.6 * s.doors;
      });
      third.material.emissiveIntensity = s.rail * (0.6 + 0.4 * Math.sin(t * 40));

      phoneLamp.material.emissiveIntensity = s.phone * (0.6 + 0.4 * Math.sin(t * 6));
      phoneLight.intensity = 1.5 * s.phone * (0.6 + 0.4 * Math.sin(t * 6));

      tmp.set(0.2, -0.15, 0).applyQuaternion(cam.quaternion);
      hand.position.copy(cam.position).add(tmp);
      hand.target.position.set(s.aimX, s.aimY, s.aimZ);
      hand.intensity = 45 * s.hand;

      // уходящие: идут по шпалам в −z; фонарики гаснут «один за другим» — по порядку off
      crowdG.visible = s.crowd > 0.01;
      let cx = 0, cz = 0, n = 0;
      crowd.forEach((c, i) => {
        const z = c.z0 - s.walked * c.sp0;
        const bob = Math.abs(Math.sin(t * 5.2 + c.ph)) * 0.05;
        c.g.position.set(c.x + Math.sin(t * 0.7 + c.ph) * 0.05, bob, z);
        c.g.rotation.y = Math.PI + Math.sin(t * 2.6 + c.ph) * 0.06;
        const on = i < s.lit;
        c.sp.visible = on;
        c.sp.material.opacity = on ? 0.7 + 0.3 * Math.sin(t * 9 + c.ph * 3) : 0;
        if (on) {
          cx += c.g.position.x;
          cz += z;
          n++;
        }
      });
      crowdLights.forEach((l, k) => {
        if (!n || !crowdG.visible) {
          l.intensity = 0;
          return;
        }
        l.position.set(cx / n + (k - 1) * 0.8, 1.4, cz / n + (k - 1) * 3);
        l.intensity = 12 * (n / 40);
      });

      // возвращающиеся: колонна по 4, без света, все в ногу (одна фаза шага)
      retG.visible = s.ret > 0.01;
      const stepPh = s.retStep * Math.PI * 2;
      ret.forEach((p) => {
        p.g.position.set(p.x, Math.abs(Math.sin(stepPh)) * 0.06, -s.retDist - p.row * 1.1);
        p.g.rotation.z = Math.sin(stepPh) * 0.03;
      });
      ren.render(sc, cam);
    }
    return { state, render, renderer: ren, PZ };
  }
  return { create };
})();
