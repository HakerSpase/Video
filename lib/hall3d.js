// 3D-прихожая с антресолью (three.js r149). Сцена — функция состояния:
//   const H = HALL3D.create(canvas);  tl.to(H.state, {...});  tl.eventCallback("onUpdate", () => H.render(tl.time()));
// Координаты: метры. Входная дверь в стене z = 0, камера смотрит на неё из коридора (z > 0).
window.HALL3D = (function () {
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

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
  }

  function noise(ctx, w, h, r, amount, n) {
    for (let i = 0; i < n; i++) {
      const v = Math.floor(r() * 255);
      ctx.fillStyle = "rgba(" + v + "," + v + "," + v + "," + amount * r() + ")";
      ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  }

  // Советские обои: бежевый фон, вертикальные полосы, мелкий узор, грязь у пола.
  function wallpaper(r) {
    return canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = "#b9a98c";
      c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) {
        c.fillStyle = "rgba(120,96,64,0.18)";
        c.fillRect(x, 0, 10, h);
        c.fillStyle = "rgba(255,240,210,0.12)";
        c.fillRect(x + 30, 0, 4, h);
      }
      c.fillStyle = "rgba(110,80,50,0.28)";
      for (let y = 16; y < h; y += 48) for (let x = 46; x < w; x += 64) {
        c.beginPath();
        c.ellipse(x + ((y / 48) % 2) * 4, y, 5, 9, 0, 0, 6.283);
        c.fill();
      }
      noise(c, w, h, r, 0.18, 9000);
    }, [3, 2]);
  }

  function laminate(r) {
    return canvasTex(512, 512, (c, w, h) => {
      for (let i = 0; i < 8; i++) {
        const base = 70 + Math.floor(r() * 25);
        c.fillStyle = "rgb(" + (base + 28) + "," + (base + 8) + "," + (base - 18) + ")";
        c.fillRect(0, i * 64, w, 64);
        for (let k = 0; k < 40; k++) {
          c.strokeStyle = "rgba(40,24,10," + (0.08 + r() * 0.12) + ")";
          c.beginPath();
          const y = i * 64 + r() * 64;
          c.moveTo(0, y);
          c.bezierCurveTo(w * 0.3, y + r() * 6 - 3, w * 0.7, y + r() * 6 - 3, w, y + r() * 4 - 2);
          c.stroke();
        }
        c.fillStyle = "rgba(20,12,6,0.6)";
        c.fillRect(0, i * 64, w, 2);
        c.fillRect(((i * 97) % 5) * 100, i * 64, 2, 64);
      }
      noise(c, w, h, r, 0.15, 6000);
    }, [2, 4]);
  }

  // Дверь, обитая дерматином: стёганые ромбы.
  function leather(r) {
    return canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = "#3a2116";
      c.fillRect(0, 0, w, h);
      for (let y = -32; y < h + 32; y += 64) for (let x = -32; x < w + 32; x += 64) {
        const g = c.createRadialGradient(x + 32, y + 32, 4, x + 32, y + 32, 40);
        g.addColorStop(0, "rgba(120,70,45,0.55)");
        g.addColorStop(1, "rgba(0,0,0,0.4)");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x + 32, y);
        c.lineTo(x + 64, y + 32);
        c.lineTo(x + 32, y + 64);
        c.lineTo(x, y + 32);
        c.fill();
        c.fillStyle = "#c9a35c";
        c.beginPath();
        c.arc(x + 32, y, 2.5, 0, 6.283);
        c.fill();
      }
      noise(c, w, h, r, 0.12, 3000);
    });
  }

  function plywood(r) {
    return canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = "#8c7b5f";
      c.fillRect(0, 0, w, h);
      for (let k = 0; k < 60; k++) {
        c.strokeStyle = "rgba(60,44,24," + (0.06 + r() * 0.1) + ")";
        c.beginPath();
        const x = r() * w;
        c.moveTo(x, 0);
        c.bezierCurveTo(x + r() * 10 - 5, h * 0.3, x + r() * 10 - 5, h * 0.7, x + r() * 8 - 4, h);
        c.stroke();
      }
      noise(c, w, h, r, 0.2, 2500);
    });
  }

  function quilt() {
    return canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = "#59683c";
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        const g = c.createLinearGradient(0, y, 0, y + 32);
        g.addColorStop(0, "rgba(0,0,0,0.45)");
        g.addColorStop(0.5, "rgba(255,255,255,0.12)");
        g.addColorStop(1, "rgba(0,0,0,0.45)");
        c.fillStyle = g;
        c.fillRect(0, y, w, 32);
      }
    }, [2, 1]);
  }

  function create(canvas, opt) {
    opt = opt || {};
    // внутреннее разрешение 3D: 0.6 от кадра — в ~3 раза быстрее рендер на CPU, на глаз (с зерном) не видно
    const RES = opt.res || 0.6;
    canvas.width = Math.round(1080 * RES);
    canvas.height = Math.round(1920 * RES);
    const r = rng(opt.seed || 3);
    const W = canvas.width, H = canvas.height;
    const ren = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    ren.setSize(W, H, false);
    ren.physicallyCorrectLights = true;
    ren.outputEncoding = T.sRGBEncoding;
    ren.toneMapping = T.ACESFilmicToneMapping;
    ren.toneMappingExposure = 1.15;
    ren.shadowMap.enabled = true;
    ren.shadowMap.type = T.PCFShadowMap;

    const sc = new T.Scene();
    sc.background = new T.Color(0x020306);
    sc.fog = new T.FogExp2(0x05070c, 0.13);
    const cam = new T.PerspectiveCamera(52, W / H, 0.05, 40);

    const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o));
    const add = (geo, mat, x, y, z, o) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = !(o && o.noCast);
      m.receiveShadow = true;
      (o && o.parent ? o.parent : sc).add(m);
      return m;
    };

    // коридор: ширина 1.5, высота 2.6, длина 5
    const WP = std({ map: wallpaper(r) }), HW = 0.75, CH = 2.6, LEN = 5;
    add(new T.PlaneGeometry(1.5, LEN), std({ map: laminate(r), roughness: 0.6 }), 0, 0, LEN / 2, { noCast: true }).rotation.x = -Math.PI / 2;
    const ceil = add(new T.PlaneGeometry(1.5, LEN), std({ color: 0x4a4740 }), 0, CH, LEN / 2, { noCast: true });
    ceil.rotation.x = Math.PI / 2;
    const wl = add(new T.PlaneGeometry(LEN, CH), WP, -HW, CH / 2, LEN / 2, { noCast: true });
    wl.rotation.y = Math.PI / 2;
    const wr = add(new T.PlaneGeometry(LEN, CH), WP, HW, CH / 2, LEN / 2, { noCast: true });
    wr.rotation.y = -Math.PI / 2;
    add(new T.PlaneGeometry(1.5, CH), WP, 0, CH / 2, 0, { noCast: true });
    // плинтусы
    const bb = std({ color: 0x5a4632 });
    add(new T.BoxGeometry(0.02, 0.08, LEN), bb, -HW + 0.01, 0.04, LEN / 2);
    add(new T.BoxGeometry(0.02, 0.08, LEN), bb, HW - 0.01, 0.04, LEN / 2);

    // входная дверь
    add(new T.BoxGeometry(1.02, 2.12, 0.06), std({ color: 0x2a2520, roughness: 0.5, metalness: 0.4 }), 0, 1.06, 0.02);
    add(new T.BoxGeometry(0.9, 2.02, 0.06), std({ map: leather(r), roughness: 0.55 }), 0, 1.03, 0.06);
    const brass = std({ color: 0xc9a35c, roughness: 0.35, metalness: 0.9 });
    add(new T.CylinderGeometry(0.018, 0.018, 0.16, 12), brass, 0.33, 1.0, 0.13).rotation.x = Math.PI / 2;
    add(new T.BoxGeometry(0.06, 0.14, 0.02), brass, 0.33, 1.08, 0.1);
    add(new T.CylinderGeometry(0.012, 0.012, 0.03, 12), brass, 0, 1.55, 0.1).rotation.x = Math.PI / 2;

    // вешалка с куртками слева, обувница справа, щиток
    const coat = std({ color: 0x23293a, roughness: 0.95 });
    const coat2 = std({ color: 0x3b2228, roughness: 0.95 });
    add(new T.BoxGeometry(0.06, 0.05, 1.0), std({ color: 0x4a3a28 }), -HW + 0.04, 1.75, 1.4);
    add(new T.CapsuleGeometry(0.16, 0.7, 6, 12), coat, -HW + 0.2, 1.28, 1.15).scale.set(0.8, 1, 1);
    add(new T.CapsuleGeometry(0.15, 0.6, 6, 12), coat2, -HW + 0.2, 1.33, 1.55).scale.set(0.8, 1, 1);
    add(new T.BoxGeometry(0.32, 0.45, 0.9), std({ color: 0x5a4a38 }), HW - 0.17, 0.225, 1.3);
    add(new T.BoxGeometry(0.28, 0.1, 0.2), std({ color: 0x15130f }), HW - 0.17, 0.5, 1.0);
    add(new T.BoxGeometry(0.28, 0.1, 0.2), std({ color: 0x2a1c14 }), HW - 0.17, 0.5, 1.5);
    add(new T.BoxGeometry(0.04, 0.42, 0.3), std({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.3 }), HW - 0.02, 1.85, 2.3);

    // антресоль над дверью: корпус + две дверцы на петлях
    const ply = std({ map: plywood(r), roughness: 0.8 });
    const AY = 2.15, AH = CH - AY, AD = 0.55;
    add(new T.BoxGeometry(1.5, 0.03, AD), ply, 0, AY, AD / 2);
    const inner = std({ color: 0x0b0907, roughness: 1 });
    add(new T.BoxGeometry(1.5, AH, 0.02), inner, 0, AY + AH / 2, 0.01, { noCast: true });
    const doors = [];
    [[-HW, 1], [HW, -1]].forEach(([x, s]) => {
      const piv = new T.Group();
      piv.position.set(x, AY + AH / 2, AD);
      sc.add(piv);
      const d = add(new T.BoxGeometry(HW - 0.005, AH - 0.01, 0.025), ply, (s * (HW - 0.005)) / 2, 0, 0.0125, { parent: piv });
      add(new T.BoxGeometry(0.02, 0.09, 0.03), brass, s * (HW - 0.06), 0, 0.03, { parent: piv });
      doors.push({ piv, s, d });
    });

    // спальник внутри антресоли (может свисать наружу)
    const heatTex = canvasTex(256, 256, (c, w, h) => {
      // «тепловизорная» карта: горячее пятно там, где лежал человек, холодные края
      const g = c.createRadialGradient(w * 0.45, h * 0.5, 4, w * 0.5, h * 0.5, w * 0.62);
      [[0, "#fffbe0"], [0.18, "#ffd23c"], [0.42, "#f0501e"], [0.7, "#8c008c"], [1, "#0a0028"]].forEach(([o, col]) => g.addColorStop(o, col));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      noise(c, w, h, r, 0.12, 2500);
    });
    const bagMat = std({ map: quilt(), roughness: 0.9, emissive: new T.Color(1, 1, 1), emissiveMap: heatTex, emissiveIntensity: 0 });
    const bagPiv = new T.Group();
    bagPiv.position.set(0, AY + 0.17, AD - 0.05);
    sc.add(bagPiv);
    const bag = add(new T.CapsuleGeometry(0.15, 1.0, 8, 16), bagMat, 0, 0, -0.22, { parent: bagPiv });
    bag.rotation.z = Math.PI / 2;
    bag.scale.set(1, 1, 0.9);
    // край спальника, свесившийся с антресоли
    const flapMat = std({ map: quilt(), roughness: 0.95 });
    const flap = add(new T.CapsuleGeometry(0.12, 0.5, 6, 16), flapMat, 0.28, AY - 0.18, AD + 0.04);
    flap.scale.set(1, 1, 0.28);
    flap.rotation.z = 0.08;

    // пальцы в щели между дверцами
    const skin = std({ color: 0x9c7f6c, roughness: 0.75 });
    const fingers = new T.Group();
    for (let i = 0; i < 4; i++) {
      const f = add(new T.CapsuleGeometry(0.011, 0.045, 4, 8), skin, 0.005, AY + AH / 2 + 0.06 - i * 0.032, AD + 0.012, { parent: fingers });
      f.rotation.z = Math.PI / 2;
    }
    sc.add(fingers);

    // табурет
    const stool = new T.Group();
    const wood = std({ color: 0x6a4a2c, roughness: 0.7 });
    add(new T.BoxGeometry(0.38, 0.04, 0.38), wood, 0, 0.5, 0, { parent: stool });
    [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].forEach(([x, z]) => add(new T.BoxGeometry(0.035, 0.48, 0.035), wood, x, 0.24, z, { parent: stool }));
    stool.position.set(0.05, 0, 0.75);
    sc.add(stool);

    // свет: фонарь у камеры + холодный свет из комнаты справа + почти ноль окружения
    const torch = new T.SpotLight(0xffe9c8, 16, 12, 0.36, 0.6, 2);
    torch.castShadow = true;
    torch.shadow.mapSize.set(512, 512);
    torch.shadow.bias = -0.0008;
    sc.add(torch, torch.target);
    const room = new T.PointLight(0x7f9cff, 4, 6, 2);
    room.position.set(HW + 0.3, 1.6, 3.4);
    sc.add(room);
    const amb = new T.HemisphereLight(0x33405a, 0x120c08, 0.25);
    sc.add(amb);

    // объёмный луч фонаря: аддитивный конус, затухает к концу
    const beamGeo = new T.ConeGeometry(1, 1, 48, 1, true);
    beamGeo.translate(0, -0.5, 0);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uI: { value: 0.12 } },
      vertexShader: "varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ vZ = -position.z; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
      fragmentShader: "uniform float uI; varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = uI * edge * (1.0 - smoothstep(0.0, 1.0, vZ)); gl_FragColor = vec4(vec3(1.0,0.93,0.8)*a, a); }",
    });
    const beam = new T.Mesh(beamGeo, beamMat);
    sc.add(beam);

    // пыль в воздухе
    const N = 700, pos = new Float32Array(N * 3), seeds = [];
    for (let i = 0; i < N; i++) seeds.push([r() * 1.4 - 0.7, r() * 2.5 + 0.05, r() * 3.8 + 0.2, r() * 6.28, 0.3 + r()]);
    const dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
    const dustMat = new T.PointsMaterial({ color: 0xfff1d6, size: 0.006, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending });
    sc.add(new T.Points(dustGeo, dustMat));

    const state = {
      camX: 0.05, camY: 1.62, camZ: 3.6, tgtX: 0, tgtY: 1.9, tgtZ: 0, fov: 52, roll: 0,
      torch: 1, torchX: 0.18, torchY: -0.12, aimX: 0, aimY: 2.3, aimZ: 0.3,
      open: 0, hang: 0, fingers: 0, heat: 0, stool: 1, room: 1, exposure: 0.95,
    };
    const tmp = new T.Vector3();

    function render(t) {
      const s = state;
      cam.position.set(s.camX, s.camY, s.camZ);
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(s.tgtX, s.tgtY, s.tgtZ);
      cam.rotateZ(s.roll);
      // фонарь в руке: чуть правее и ниже камеры, светит в точку прицела
      tmp.set(s.torchX, s.torchY, 0).applyQuaternion(cam.quaternion);
      torch.position.copy(cam.position).add(tmp);
      torch.target.position.set(s.aimX, s.aimY, s.aimZ);
      torch.intensity = 16 * s.torch;
      beam.position.copy(torch.position);
      beam.lookAt(torch.target.position);
      const L = torch.position.distanceTo(torch.target.position) * 1.6;
      beam.scale.set(Math.tan(0.36) * L, Math.tan(0.36) * L, L);
      beamMat.uniforms.uI.value = 0.13 * s.torch;
      room.intensity = 4 * s.room;
      ren.toneMappingExposure = s.exposure;
      doors.forEach(({ piv, s: sg }) => (piv.rotation.y = -sg * s.open * 1.9));
      bagPiv.visible = s.open > 0.02 || s.hang > 0;
      flap.visible = s.hang > 0.01;
      flap.scale.set(1, Math.max(0.01, s.hang), 0.28);
      flap.position.y = AY - 0.05 - 0.3 * s.hang;
      fingers.visible = s.fingers > 0.01;
      fingers.position.x = (1 - s.fingers) * 0.02;
      stool.visible = s.stool > 0.5;
      // тепловизор: всё гаснет, спальник светится палитрой тепла
      bagMat.emissiveIntensity = 1.6 * s.heat * (0.94 + 0.06 * Math.sin(t * 5));
      torch.intensity = 16 * s.torch * (1 - 0.85 * s.heat);
      beamMat.uniforms.uI.value = 0.13 * s.torch * (1 - s.heat);
      room.intensity = 4 * s.room * (1 - 0.8 * s.heat);
      for (let i = 0; i < N; i++) {
        const [x, y, z, ph, sp] = seeds[i];
        pos[i * 3] = x + Math.sin(t * 0.3 * sp + ph) * 0.05;
        pos[i * 3 + 1] = ((y + t * 0.02 * sp) % 2.55) + 0.03;
        pos[i * 3 + 2] = z + Math.cos(t * 0.25 * sp + ph) * 0.05;
      }
      dustGeo.attributes.position.needsUpdate = true;
      ren.render(sc, cam);
    }
    return { state, render, renderer: ren };
  }

  return { create };
})();
