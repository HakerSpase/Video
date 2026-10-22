// Люди для 3D-сцен (three.js r149): стилизованные фигуры с лицом и простым скелетом.
// const P = PEOPLE3D.make({ kind: "soldier" | "girl" | "granny" | "mother" | "medic", seed, ... });
// sc.add(P.root); каждый кадр — P.update(t). Состояние P.s: позиция, поза (pose → pose2 по mix),
// ходьба, копание, взгляд, веки, брови (sad), рот (−1 хмурится … 1 улыбается), пыль, слёзы, дрожь.
// Персонаж смотрит в +z; углы суставов: «вперёд» для руки/бедра — минус по x, сгиб колена — плюс.
window.PEOPLE3D = (function () {
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
  function ctex(w, h, draw, rep) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }
  const texCache = {};
  function cached(key, make) {
    return texCache[key] || (texCache[key] = make());
  }
  // камуфляж «цифра»: мелкие пиксельные пятна трёх оттенков на оливковом
  function camoTex(base, spots) {
    return cached("camo" + base + spots.join(), () => ctex(128, 128, (c, w, h) => {
      const r = rng(7);
      c.fillStyle = base;
      c.fillRect(0, 0, w, h);
      spots.forEach((col, k) => {
        c.fillStyle = col;
        for (let i = 0; i < 90 - k * 20; i++) {
          const x = Math.floor(r() * 32) * 4, y = Math.floor(r() * 32) * 4;
          const n = 2 + Math.floor(r() * 5);
          for (let j = 0; j < n; j++) c.fillRect(x + Math.floor(r() * 4 - 2) * 4, y + Math.floor(r() * 4 - 2) * 4, 4, 4);
        }
      });
      // потёртости и грязь
      for (let i = 0; i < 400; i++) {
        c.fillStyle = "rgba(60,50,35," + r() * 0.25 + ")";
        c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
      }
    }, [2, 2]));
  }
  // платок бабушки: тёмный, с красными и жёлтыми цветами
  function scarfTex() {
    return cached("scarf", () => ctex(128, 128, (c, w, h) => {
      const r = rng(3);
      c.fillStyle = "#2a1d22";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = r() * h, s = 5 + r() * 6;
        c.fillStyle = r() < 0.6 ? "#b8323a" : "#d9a33a";
        for (let k = 0; k < 5; k++) {
          c.beginPath();
          c.arc(x + Math.cos(k * 1.256) * s * 0.6, y + Math.sin(k * 1.256) * s * 0.6, s * 0.45, 0, 6.283);
          c.fill();
        }
        c.fillStyle = "#3c6b3a";
        c.fillRect(x + s * 0.4, y + s * 0.6, s * 0.9, s * 0.35);
      }
      c.strokeStyle = "#d9a33a";
      c.lineWidth = 3;
      c.strokeRect(2, 2, w - 4, h - 4);
    }, [1.5, 1.5]));
  }
  // лицо: лёгкий румянец, тени под глазами, для солдат — щетина и грязь
  function skinTex(kind) {
    return cached("skin" + kind, () => ctex(128, 128, (c, w, h) => {
      const r = rng(kind.length * 13);
      c.fillStyle = "#fff";
      c.fillRect(0, 0, w, h);
      if (kind === "soldier") {
        for (let i = 0; i < 1400; i++) {
          c.fillStyle = "rgba(70,55,45," + r() * 0.18 + ")";
          const x = r() * w, y = 70 + r() * 50;
          c.fillRect(x, y, 1, 1);
        }
        for (let i = 0; i < 14; i++) {
          c.fillStyle = "rgba(90,75,60," + (0.08 + r() * 0.12) + ")";
          c.beginPath();
          c.ellipse(r() * w, r() * h, 4 + r() * 10, 2 + r() * 6, r() * 3, 0, 6.283);
          c.fill();
        }
      }
      if (kind === "granny" || kind === "mother") {
        c.strokeStyle = "rgba(110,70,60," + (kind === "granny" ? 0.45 : 0.28) + ")";
        c.lineWidth = 1.5;
        for (let i = 0; i < (kind === "granny" ? 4 : 2); i++) {
          c.beginPath();
          c.moveTo(34, 26 + i * 6);
          c.quadraticCurveTo(64, 22 + i * 6, 94, 26 + i * 6);
          c.stroke();
        }
        [[40, 66], [88, 66]].forEach(([x, y]) => {
          c.fillStyle = "rgba(120,70,70,0.25)";
          c.beginPath();
          c.ellipse(x, y, 12, 5, 0, 0, 6.283);
          c.fill();
        });
        c.beginPath();
        c.moveTo(48, 78);
        c.quadraticCurveTo(44, 92, 50, 102);
        c.moveTo(80, 78);
        c.quadraticCurveTo(84, 92, 78, 102);
        c.stroke();
      }
      if (kind === "girl") {
        c.fillStyle = "rgba(230,120,120,0.22)";
        [[40, 80], [88, 80]].forEach(([x, y]) => {
          c.beginPath();
          c.arc(x, y, 12, 0, 6.283);
          c.fill();
        });
      }
    }));
  }

  const SKIN = { soldier: 0xd2a088, girl: 0xf0c4ac, granny: 0xd6ae9c, mother: 0xdcb4a0, medic: 0xc89880 };

  // позы: сустав → [x, y, z]; y/pitch — сдвиг и наклон корня
  const POSES = {
    stand: { shL: [0.04, 0, 0.1], shR: [0.04, 0, -0.1], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0] },
    tired: { spine: [0.12, 0, 0], neck: [0.25, 0, 0], shL: [0.06, 0, 0.06], shR: [0.06, 0, -0.06], elL: [-0.15, 0, 0], elR: [-0.15, 0, 0] },
    sit: { y: -0.42, hipL: [-1.52, 0, 0.06], hipR: [-1.52, 0, -0.06], knL: [1.52, 0, 0], knR: [1.52, 0, 0], shL: [-0.45, 0, 0.08], shR: [-0.45, 0, -0.08], elL: [-1.15, 0, 0], elR: [-1.15, 0, 0], spine: [0.08, 0, 0] },
    sitTable: { y: -0.42, hipL: [-1.52, 0, 0.06], hipR: [-1.52, 0, -0.06], knL: [1.52, 0, 0], knR: [1.52, 0, 0], shL: [-0.85, 0, 0.12], shR: [-0.85, 0, -0.12], elL: [-1.3, 0.3, 0], elR: [-1.3, -0.3, 0], spine: [0.22, 0, 0], neck: [0.3, 0, 0] },
    sitFloor: { y: -0.77, spine: [0.3, 0, 0], neck: [0.25, 0, 0], hipL: [-2.15, 0, 0.18], hipR: [-2.15, 0, -0.18], knL: [2.4, 0, 0], knR: [2.4, 0, 0], shL: [-0.95, 0, 0.18], shR: [-0.95, 0, -0.18], elL: [-1.25, 0, 0.3], elR: [-1.25, 0, -0.3] },
    kneel: { y: -0.4, hipL: [-0.08, 0, 0.05], hipR: [-0.08, 0, -0.05], knL: [1.62, 0, 0], knR: [1.62, 0, 0], shL: [0.05, 0, 0.1], shR: [0.05, 0, -0.1], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0] },
    dig: { y: -0.4, hipL: [-0.35, 0, 0.12], hipR: [-0.35, 0, -0.12], knL: [1.9, 0, 0], knR: [1.9, 0, 0], spine: [0.75, 0, 0], neck: [-0.35, 0, 0], shL: [-1.2, 0, 0.15], shR: [-1.2, 0, -0.15], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0] },
    crouch: { y: -0.48, hipL: [-1.75, 0, 0.12], hipR: [-0.35, 0, -0.08], knL: [2.25, 0, 0], knR: [1.85, 0, 0], spine: [0.3, 0, 0], shL: [-0.7, 0, 0.1], shR: [-0.5, 0, -0.1], elL: [-1.0, 0, 0], elR: [-0.9, 0, 0] },
    carry: { shL: [-0.95, 0, 0.32], shR: [-0.95, 0, -0.32], elL: [-1.25, 0.5, 0], elR: [-1.25, -0.5, 0], spine: [-0.08, 0, 0], neck: [0.35, 0, 0] },
    give: { shR: [-1.05, 0, -0.08], elR: [-0.3, 0, 0], shL: [0.05, 0, 0.1], elL: [-0.2, 0, 0], neck: [0.3, 0, 0] },
    phone: { shR: [-0.75, 0, -0.25], elR: [-1.6, -0.4, 0], shL: [-0.55, 0, 0.3], elL: [-1.5, 0.4, 0], neck: [0.45, 0, 0] },
    sitPhone: { y: -0.77, spine: [0.3, 0, 0], neck: [0.55, 0, 0], hipL: [-2.15, 0, 0.18], hipR: [-2.15, 0, -0.18], knL: [2.4, 0, 0], knR: [2.4, 0, 0], shR: [-0.75, 0, -0.25], elR: [-1.6, -0.4, 0], shL: [-0.55, 0, 0.3], elL: [-1.5, 0.4, 0] },
    sitLow: { y: -0.52, hipL: [-1.7, 0, 0.12], hipR: [-1.7, 0, -0.12], knL: [1.9, 0, 0], knR: [1.9, 0, 0], spine: [0.25, 0, 0], neck: [0.15, 0, 0], shL: [-0.6, 0, 0.1], shR: [-0.6, 0, -0.1], elL: [-1.1, 0, 0], elR: [-1.1, 0, 0] },
    sitGive: { y: -0.52, hipL: [-1.7, 0, 0.12], hipR: [-1.7, 0, -0.12], knL: [1.9, 0, 0], knR: [1.9, 0, 0], spine: [0.4, 0, 0], neck: [0.1, 0, 0], shL: [-0.6, 0, 0.1], elL: [-1.1, 0, 0], shR: [-1.25, 0, -0.05], elR: [-0.35, 0, 0] },
    lift: { y: -0.25, hipL: [-0.9, 0, 0.15], hipR: [-0.9, 0, -0.15], knL: [1.3, 0, 0], knR: [1.3, 0, 0], spine: [0.55, 0, 0], shL: [-1.35, 0, 0.12], shR: [-1.35, 0, -0.12], elL: [-0.25, 0, 0], elR: [-0.25, 0, 0] },
    lie: { y: 0, pitch: -1.57, shL: [-0.1, 0, 0.25], shR: [-0.1, 0, -0.25], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0], hipL: [-0.05, 0, 0.04], hipR: [-0.05, 0, -0.04] },
    held: { y: 0, pitch: -1.2, hipL: [-1.1, 0, 0.05], hipR: [-1.1, 0, -0.05], knL: [1.3, 0, 0], knR: [1.3, 0, 0], shL: [-0.3, 0, 0.5], shR: [-0.2, 0, -0.2], elL: [-0.9, 0, 0], elR: [-0.6, 0, 0], neck: [0.25, 0.3, 0] },
    peek: { spine: [0.1, 0.2, 0], neck: [0.1, -0.2, 0.1], shL: [-0.4, 0, 0.1], elL: [-1.4, 0, 0], shR: [0.04, 0, -0.1], elR: [-0.2, 0, 0] },
    draw: { y: -0.77, spine: [0.55, 0, 0], neck: [0.5, 0, 0], hipL: [-1.6, 0, 0.5], hipR: [-1.6, 0, -0.5], knL: [2.3, 0, 0], knR: [2.3, 0, 0], shR: [-1.0, 0, -0.1], elR: [-1.2, 0, 0], shL: [-0.7, 0, 0.2], elL: [-1.2, 0, 0] },
  };
  const JOINTS = ["spine", "neck", "shL", "shR", "elL", "elR", "hipL", "hipR", "knL", "knR"];

  function make(opt) {
    const kind = opt.kind || "soldier";
    const r = rng(opt.seed || 1);
    const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
    const mats = [];
    const M = (o) => {
      const m = std(o);
      m.userData.base = m.color.clone();
      mats.push(m);
      return m;
    };
    const capsule = (rad, len) => new T.CapsuleGeometry(rad, len, 4, 12);
    const mesh = (geo, mat, parent, x, y, z) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const grp = (parent, x, y, z) => {
      const g = new T.Group();
      g.position.set(x || 0, y || 0, z || 0);
      parent.add(g);
      return g;
    };

    // пропорции: ребёнок — меньше и с крупной головой; бабушка — ниже, сутулится
    const S = { soldier: 1, medic: 1, mother: 0.94, granny: 0.9, girl: 0.6 }[kind] * (opt.scale || 1);
    const headK = kind === "girl" ? 1.45 : 1;
    const thigh = 0.44 * S, shin = 0.42 * S, torso = 0.52 * S, upper = 0.3 * S, fore = 0.27 * S;
    const hipH = thigh + shin + 0.06 * S;
    const wide = (kind === "soldier" || kind === "medic" ? 1.08 : kind === "girl" ? 1.12 : 1) * (opt.wide || 1);

    const skin = M({ color: SKIN[kind], map: skinTex(kind === "medic" ? "soldier" : kind), roughness: 0.75 });
    let top, legs, boots, gloves;
    if (kind === "soldier" || kind === "medic") {
      const camo = camoTex("#5d5c40", ["#3f4330", "#7b6f50", "#2d2c23"]);
      top = M({ map: camo, color: 0xffffff });
      legs = M({ map: camo, color: 0xe6e6e6 });
      boots = M({ color: 0x2b241d, roughness: 0.7 });
      gloves = M({ color: 0x1d1d1b });
    } else if (kind === "girl") {
      top = M({ color: opt.coat || 0xe86a9a, roughness: 0.55 });
      legs = M({ color: 0x3b4f7a });
      boots = M({ color: 0xe9e4dc, roughness: 0.6 });
      gloves = M({ color: SKIN[kind], roughness: 0.7 });
    } else if (kind === "granny") {
      top = M({ color: 0x3d2f28 });
      legs = M({ color: 0x2b2522 });
      boots = M({ color: 0x5b5754 }); // валенки
      gloves = M({ color: SKIN[kind], roughness: 0.7 });
    } else {
      top = M({ color: opt.coat || 0x6d6a66 }); // серая кофта
      legs = M({ color: 0x2e2a2c });
      boots = M({ color: 0x3a2f2a });
      gloves = M({ color: SKIN[kind], roughness: 0.7 });
    }

    const root = new T.Group();
    root.rotation.order = "YXZ"; // сначала наклон тела (лёжа), потом поворот
    const hips = grp(root, 0, hipH, 0);
    mesh(capsule(0.13 * S * wide, 0.06 * S), legs, hips, 0, 0.02 * S, 0).scale.z = 0.8;
    const spine = grp(hips, 0, 0.02 * S, 0);
    const body = mesh(capsule(0.15 * S * wide, torso - 0.12 * S), top, spine, 0, torso / 2, 0);
    body.scale.set(1.12, 1, kind === "girl" ? 0.95 : 0.7);
    if (kind === "granny") {
      // длинное пальто — конус до колен
      const coat = mesh(new T.CylinderGeometry(0.17 * S, 0.27 * S, 0.62 * S, 14, 1, true), top, hips, 0, -0.22 * S, 0);
      coat.material.side = T.DoubleSide;
    }
    if (kind === "mother") {
      const skirt = mesh(new T.CylinderGeometry(0.16 * S, 0.24 * S, 0.5 * S, 14, 1, true), legs, hips, 0, -0.2 * S, 0);
      skirt.material.side = T.DoubleSide;
    }
    const neck = grp(spine, 0, torso + 0.02 * S, 0);
    mesh(new T.CylinderGeometry(0.045 * S, 0.05 * S, 0.1 * S, 10), skin, neck, 0, 0.03 * S, 0);
    const head = grp(neck, 0, 0.13 * S * (kind === "girl" ? 1.15 : 1), 0);

    // --- лицо
    const hr = 0.112 * S * headK;
    const skull = mesh(new T.SphereGeometry(hr, 28, 20), skin, head, 0, 0, 0);
    skull.scale.set(0.9, 1.08, 0.98);
    const jaw = mesh(new T.SphereGeometry(hr * 0.72, 20, 14), skin, head, 0, -hr * 0.42, hr * 0.12);
    jaw.scale.set(1.05, 0.8, 1);
    const white = M({ color: 0xf2efe9, roughness: 0.3 });
    const irisCol = kind === "girl" ? 0x4a6fa0 : kind === "soldier" ? 0x5a4636 : 0x4a3a30;
    const iris = M({ color: irisCol, roughness: 0.25 });
    const pupil = M({ color: 0x0a0a0a, roughness: 0.2 });
    const glint = new T.MeshBasicMaterial({ color: 0xffffff });
    const eyes = [], lids = [], brows = [], tears = [];
    const eyeR = hr * (kind === "girl" ? 0.235 : 0.19);
    for (const sd of [1, -1]) {
      const eg = grp(head, sd * hr * 0.37, hr * 0.02, hr * 0.8);
      const e = grp(eg);
      mesh(new T.SphereGeometry(eyeR, 16, 12), white, e).scale.z = 0.7;
      mesh(new T.SphereGeometry(eyeR * 0.7, 14, 10), iris, e, 0, 0, eyeR * 0.45).scale.z = 0.45;
      mesh(new T.SphereGeometry(eyeR * 0.36, 10, 8), pupil, e, 0, 0, eyeR * 0.66).scale.z = 0.45;
      const gl = mesh(new T.SphereGeometry(eyeR * 0.13, 6, 6), glint, e, eyeR * 0.22, eyeR * 0.25, eyeR * 0.78);
      gl.castShadow = false;
      eyes.push(e);
      // верхнее веко — полусфера кожи; поворот по x закрывает глаз
      const lid = mesh(new T.SphereGeometry(eyeR * 1.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin, eg);
      lids.push(lid);
      const brow = mesh(new T.BoxGeometry(hr * 0.42, hr * 0.07, hr * 0.08), M({ color: kind === "granny" || kind === "mother" ? 0x6b625c : 0x2e2620 }), eg, sd * hr * 0.03, eyeR * 2.1, eyeR * 0.3);
      brows.push(brow);
      // дорожка слезы по пыльной щеке
      const tr = mesh(new T.BoxGeometry(hr * 0.06, hr * 0.5, hr * 0.02), new T.MeshStandardMaterial({ color: 0xe9d2c3, roughness: 0.08, transparent: true, opacity: 0 }), head, sd * hr * 0.36, -hr * 0.18, hr * 0.86);
      tr.castShadow = false;
      tears.push(tr);
    }
    const nose = mesh(new T.SphereGeometry(hr * 0.12, 12, 10), skin, head, 0, -hr * 0.18, hr * 0.95);
    nose.scale.set(0.8, 1, 1.15);
    const mouthMat = M({ color: kind === "girl" ? 0x9a4a50 : 0x6e3b36, roughness: 0.5 });
    const mouth = mesh(new T.TorusGeometry(hr * 0.24, hr * 0.05, 6, 14, Math.PI), mouthMat, head, 0, -hr * 0.45, hr * 0.95);
    mouth.castShadow = false;
    for (const sd of [1, -1]) mesh(new T.SphereGeometry(hr * 0.2, 10, 8), skin, head, sd * hr * 0.88, 0, 0).scale.set(0.5, 1, 0.8);

    // --- голова: каска / волосы / платок / капюшон
    let helmet = null;
    if (kind === "soldier" || kind === "medic") {
      const cover = M({ map: camoTex("#6a6446", ["#4a4a34", "#857a58", "#36352a"]), color: 0xffffff });
      helmet = grp(head, 0, hr * 0.32, -hr * 0.06);
      helmet.rotation.x = -0.28;
      const dome = mesh(new T.SphereGeometry(hr * 1.22, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), cover, helmet, 0, 0, 0);
      dome.scale.set(1, 0.92, 1.08);
      const rim = mesh(new T.TorusGeometry(hr * 1.22, hr * 0.05, 6, 32), cover, helmet, 0, 0, 0);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1, 1.08, 1);
      mesh(new T.BoxGeometry(hr * 0.45, hr * 0.25, hr * 0.12), M({ color: 0x1c1c1a }), helmet, 0, hr * 0.42, hr * 1.12); // крепление под ПНВ
      for (const sd of [1, -1]) {
        const cup = mesh(new T.CylinderGeometry(hr * 0.36, hr * 0.36, hr * 0.26, 16), M({ color: 0x3b3d30 }), head, sd * hr * 0.98, -hr * 0.08, -hr * 0.05);
        cup.rotation.z = Math.PI / 2;
        cup.userData.helmetPart = true;
        const strap = mesh(new T.BoxGeometry(hr * 0.05, hr * 0.85, hr * 0.05), M({ color: 0x2a2a24 }), head, sd * hr * 0.72, -hr * 0.6, hr * 0.12);
        strap.rotation.z = sd * 0.3;
        strap.userData.helmetPart = true;
      }
      helmet.visible = opt.helmet !== false;
      // короткие волосы под каской (видны, когда каска снята)
      const hair = mesh(new T.SphereGeometry(hr * 1.03, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M({ color: 0x2b211b }), head, 0, hr * 0.12, -hr * 0.04);
      hair.scale.set(0.93, 1.0, 1.02);
      hair.rotation.x = -0.45;
    } else if (kind === "girl") {
      const hairM = M({ color: 0x8a6a45, roughness: 0.6 });
      const hair = mesh(new T.SphereGeometry(hr * 1.04, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, head, 0, hr * 0.1, -hr * 0.04);
      hair.scale.set(0.95, 1.02, 1.04);
      hair.rotation.x = -0.5;
      mesh(new T.BoxGeometry(hr * 1.1, hr * 0.22, hr * 0.18), hairM, head, 0, hr * 0.5, hr * 0.8).rotation.x = -0.5; // чёлка
      // капюшон пуховика — открыт спереди, лицо в меховой рамке
      const hood = mesh(new T.SphereGeometry(hr * 1.32, 24, 14, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, 0, Math.PI * 0.78), top, head, 0, hr * 0.06, -hr * 0.1);
      hood.material.side = T.DoubleSide;
      hood.scale.set(1, 1.05, 1.06);
      const fur = mesh(new T.TorusGeometry(hr * 1.08, hr * 0.17, 8, 28), M({ color: 0xf1e6e9, roughness: 1 }), head, 0, hr * 0.0, hr * 0.62);
      fur.scale.set(0.95, 1.12, 1);
    } else if (kind === "granny") {
      const sc = M({ map: scarfTex(), color: 0xffffff, side: T.DoubleSide });
      const s1 = mesh(new T.SphereGeometry(hr * 1.2, 24, 14, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.82), sc, head, 0, hr * 0.02, -hr * 0.05);
      s1.scale.set(1, 1.08, 1.06);
      const s2 = mesh(new T.SphereGeometry(hr * 1.2, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), sc, head, 0, hr * 0.02, -hr * 0.05);
      s2.scale.set(1, 1.08, 1.06);
      mesh(new T.ConeGeometry(hr * 0.35, hr * 0.6, 10), sc, head, 0, -hr * 1.08, hr * 0.25).rotation.x = Math.PI; // узел под подбородком
      mesh(new T.ConeGeometry(hr * 0.9, hr * 1.4, 14, 1, true), sc, head, 0, -hr * 1.1, -hr * 0.7).rotation.x = 0.4; // концы платка на спине
    } else {
      const hairM = M({ color: 0x8d8580, roughness: 0.7 });
      const hair = mesh(new T.SphereGeometry(hr * 1.05, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, head, 0, hr * 0.1, -hr * 0.04);
      hair.scale.set(0.96, 1.03, 1.05);
      hair.rotation.x = -0.5;
      mesh(new T.SphereGeometry(hr * 0.45, 14, 10), hairM, head, 0, hr * 0.35, -hr * 1.0); // пучок
    }

    // --- руки и ноги
    const limb = (parent, side, isArm) => {
      const L = {};
      if (isArm) {
        L.sh = grp(parent, side * 0.2 * S * wide, torso - 0.06 * S, 0);
        mesh(capsule(0.055 * S * (kind === "girl" ? 1.25 : 1) * wide, upper - 0.06 * S), top, L.sh, 0, -upper / 2, 0);
        L.el = grp(L.sh, 0, -upper, 0);
        mesh(capsule(0.048 * S * (kind === "girl" ? 1.25 : 1) * wide, fore - 0.05 * S), top, L.el, 0, -fore / 2, 0);
        const hand = grp(L.el, 0, -fore - 0.03 * S, 0);
        mesh(new T.BoxGeometry(0.075 * S, 0.09 * S, 0.035 * S), gloves, hand, 0, -0.02 * S, 0.005 * S);
        mesh(new T.BoxGeometry(0.025 * S, 0.05 * S, 0.025 * S), gloves, hand, -side * 0.04 * S, 0, 0.025 * S).rotation.z = side * 0.4;
        L.hand = hand;
      } else {
        L.hip = grp(parent, side * 0.09 * S * wide, 0, 0);
        mesh(capsule(0.072 * S * wide, thigh - 0.07 * S), legs, L.hip, 0, -thigh / 2, 0);
        L.kn = grp(L.hip, 0, -thigh, 0);
        mesh(capsule(0.06 * S * wide, shin - 0.06 * S), kind === "granny" ? boots : legs, L.kn, 0, -shin / 2, 0);
        const boot = mesh(new T.BoxGeometry(0.11 * S, 0.09 * S, 0.24 * S), boots, L.kn, 0, -shin - 0.01 * S, 0.04 * S);
        boot.userData.foot = true;
        if (kind === "soldier" || kind === "medic") mesh(new T.BoxGeometry(0.11 * S, 0.12 * S, 0.05 * S), M({ color: 0x1b1b19 }), L.kn, 0, -0.02 * S, 0.06 * S); // наколенник
      }
      return L;
    };
    const aL = limb(spine, 1, true), aR = limb(spine, -1, true);
    const lL = limb(hips, 1, false), lR = limb(hips, -1, false);

    // --- снаряжение
    const gear = [];
    if (kind === "soldier" || kind === "medic") {
      const pcM = M({ color: kind === "medic" ? 0x55553e : 0x4b4a36, roughness: 0.85 });
      const pc = mesh(new T.BoxGeometry(0.4 * S, 0.44 * S, 0.08 * S), pcM, spine, 0, torso * 0.55, 0.105 * S);
      mesh(new T.BoxGeometry(0.4 * S, 0.44 * S, 0.07 * S), pcM, spine, 0, torso * 0.55, -0.105 * S);
      mesh(new T.BoxGeometry(0.42 * S, 0.1 * S, 0.24 * S), pcM, spine, 0, torso * 0.42, 0);
      for (let i = -1; i <= 1; i++) mesh(new T.BoxGeometry(0.11 * S, 0.14 * S, 0.06 * S), M({ color: 0x45442f }), spine, i * 0.12 * S, torso * 0.36, 0.16 * S);
      gear.push(pc);
      // нагрудный карман — сюда ляжет рисунок
      const pocket = mesh(new T.BoxGeometry(0.13 * S, 0.1 * S, 0.03 * S), M({ color: 0x3e3d2b }), spine, 0.09 * S, torso * 0.68, 0.155 * S);
      gear.push(pocket);
      // рация с антенной на левом плече сзади
      mesh(new T.BoxGeometry(0.07 * S, 0.14 * S, 0.05 * S), M({ color: 0x1e1f1b }), spine, 0.14 * S, torso * 0.75, -0.16 * S);
      const ant = mesh(new T.CylinderGeometry(0.004 * S, 0.006 * S, 0.45 * S, 6), M({ color: 0x111111 }), spine, 0.15 * S, torso * 1.1, -0.17 * S);
      ant.rotation.z = -0.15;
      if (kind === "medic") {
        mesh(new T.CylinderGeometry(0.058 * S, 0.058 * S, 0.06 * S, 12), M({ color: 0xe8e8e2 }), aL.sh, 0, -upper * 0.35, 0); // белая повязка
        mesh(new T.BoxGeometry(0.3 * S, 0.36 * S, 0.16 * S), M({ color: 0x4e4d38 }), spine, 0, torso * 0.55, -0.24 * S);
      }
      if (opt.backpack) mesh(new T.BoxGeometry(0.32 * S, 0.42 * S, 0.18 * S), M({ color: 0x4a4733 }), spine, 0, torso * 0.55, -0.25 * S);
      if (opt.rifle) {
        const rf = grp(spine, 0, torso * 0.5, -0.2 * S);
        rf.rotation.z = 0.9;
        const gun = M({ color: 0x1a1a19, roughness: 0.6, metalness: 0.4 });
        mesh(new T.BoxGeometry(0.06 * S, 0.62 * S, 0.06 * S), gun, rf, 0, 0, 0);
        mesh(new T.BoxGeometry(0.05 * S, 0.12 * S, 0.04 * S), gun, rf, 0.05 * S, 0.05 * S, 0).rotation.z = -0.3;
        mesh(new T.CylinderGeometry(0.01 * S, 0.01 * S, 0.3 * S, 6), gun, rf, 0, 0.45 * S, 0);
      }
    }

    root.traverse((o) => {
      if (o.isMesh && o.material && o.material.userData && !o.material.userData.base) o.material.userData.base = o.material.color.clone();
    });

    const J = { spine, neck, shL: aL.sh, shR: aR.sh, elL: aL.el, elR: aR.el, hipL: lL.hip, hipR: lR.hip, knL: lL.kn, knR: lR.kn };
    const s = {
      x: opt.x || 0, y: 0, z: opt.z || 0, ry: opt.ry || 0,
      pose: opt.pose || "stand", pose2: "stand", mix: 0,
      walk: 0, step: 0, dig: 0, sob: 0, shiver: 0,
      yaw: 0, pitch: 0, gazeX: 0, gazeY: 0, roll: 0,
      lid: kind === "soldier" ? 0.2 : 0.08, sad: kind === "girl" ? 0.2 : 0.45, mouth: -0.15,
      dust: 0, tear: 0, blink: 1, visible: 1, helmet: opt.helmet !== false ? 1 : 0, thermal: 0,
    };
    const blinkPh = r() * 5, blinkEvery = 3.2 + r() * 2.2;
    const dustCol = new T.Color(0x77706a);
    let lastDust = -1, lastThermal = -1;

    function poseVal(name, j, k) {
      const p = POSES[name] || POSES.stand;
      if (j === "y" || j === "pitch") return p[j] || 0;
      return (p[j] && p[j][k]) || 0;
    }

    function update(t) {
      root.visible = s.visible > 0.01;
      if (!root.visible) return;
      const m = s.mix;
      const pv = (j, k) => poseVal(s.pose, j, k) * (1 - m) + poseVal(s.pose2, j, k) * m;
      JOINTS.forEach((j) => J[j].rotation.set(pv(j, 0), pv(j, 1), pv(j, 2)));
      // ходьба
      if (s.walk > 0) {
        const ph = s.step * Math.PI * 2, w = s.walk;
        J.hipL.rotation.x += -Math.sin(ph) * 0.5 * w;
        J.hipR.rotation.x += Math.sin(ph) * 0.5 * w;
        J.knL.rotation.x += Math.max(0, Math.sin(ph + 1.4)) * 0.7 * w;
        J.knR.rotation.x += Math.max(0, -Math.sin(ph + 1.4)) * 0.7 * w;
        J.shL.rotation.x += Math.sin(ph) * 0.35 * w;
        J.shR.rotation.x += -Math.sin(ph) * 0.35 * w;
        J.spine.rotation.y += Math.sin(ph) * 0.06 * w;
      }
      // копание руками: руки по очереди тянутся к завалу и отгребают
      if (s.dig > 0) {
        const ph = t * 5.2, d = s.dig;
        J.shL.rotation.x += (-0.45 * Math.sin(ph)) * d;
        J.shR.rotation.x += (-0.45 * Math.sin(ph + Math.PI)) * d;
        J.elL.rotation.x += (-0.5 * Math.max(0, Math.cos(ph))) * d;
        J.elR.rotation.x += (-0.5 * Math.max(0, Math.cos(ph + Math.PI))) * d;
        J.spine.rotation.x += Math.sin(ph * 2) * 0.05 * d;
        J.spine.rotation.y += Math.sin(ph) * 0.08 * d;
      }
      // дыхание, всхлипы, дрожь
      J.spine.rotation.x += Math.sin(t * 1.7) * 0.012 + s.sob * Math.max(0, Math.sin(t * 9)) * 0.04;
      J.shL.rotation.z += s.sob * Math.sin(t * 9) * 0.03;
      J.shR.rotation.z -= s.sob * Math.sin(t * 9) * 0.03;
      if (s.shiver) J.spine.rotation.z += Math.sin(t * 37) * 0.012 * s.shiver;
      J.neck.rotation.x += s.pitch;
      J.neck.rotation.y += s.yaw;
      J.neck.rotation.z += s.roll;

      hips.position.y = hipH + pv("y") * S + (s.walk > 0 ? Math.abs(Math.sin(s.step * Math.PI * 2)) * 0.03 * s.walk : 0);
      root.rotation.set(pv("pitch"), s.ry, 0);
      root.position.set(s.x, s.y, s.z);

      // взгляд, моргание, эмоция
      eyes.forEach((e) => e.rotation.set(-s.gazeY, s.gazeX, 0));
      const bl = ((t + blinkPh) % blinkEvery) < 0.13 ? 1 : 0;
      const closed = Math.min(1, s.lid + bl * s.blink);
      lids.forEach((l) => (l.rotation.x = -1.15 + closed * 2.6));
      brows[0].rotation.z = -s.sad * 0.45;
      brows[1].rotation.z = s.sad * 0.45;
      brows.forEach((b) => (b.position.y = eyeR * (2.1 + s.sad * 0.25)));
      const mo = s.mouth;
      mouth.rotation.z = mo > 0 ? Math.PI : 0;
      mouth.scale.set(1, 0.18 + Math.abs(mo) * 0.9, 1);
      mouth.position.y = -hr * (0.45 + (mo < 0 ? -0.04 : 0.06));
      tears.forEach((tr) => {
        tr.material.opacity = s.tear * 0.75;
        tr.scale.y = 0.2 + s.tear * 0.8;
        tr.position.y = -hr * (0.05 + s.tear * 0.15);
      });
      if (helmet) {
        helmet.visible = s.helmet > 0.5;
        head.children.forEach((o) => o.userData.helmetPart && (o.visible = helmet.visible));
      }

      // пыль: цвета тянутся к серо-бежевому; тепловизор — всё живое светится белым
      if (s.dust !== lastDust) {
        mats.forEach((mt) => mt.color.copy(mt.userData.base).lerp(dustCol, s.dust * 0.5));
        lastDust = s.dust;
      }
      if (s.thermal !== lastThermal) {
        mats.forEach((mt) => {
          mt.emissive.setRGB(1, 1, 1);
          mt.emissiveIntensity = s.thermal * 1.6;
        });
        lastThermal = s.thermal;
      }
    }
    update(0);
    return { root, s, update, joints: J, hands: [aL.hand, aR.hand], head, spine, pocket: gear[1], kind, S };
  }

  return { make, POSES, scarfTex };
})();
