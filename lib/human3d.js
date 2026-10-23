/* HUMAN3D — реалистичные люди из базы MakeHuman (CC0), данные — lib/humans/<name>.js (tools/mhbuild.py).
   const h = HUMAN3D.make("denis", { gear: "soldier", seed: 3 });
   scene.add(h.root); h.pose({ ... }) или h.pose("stand"); h.face({ sad: .6, closed: 0 });
   Кожа, камуфляж, грязь и складки ткани — процедурно в шейдере по «покоящимся» координатам вершин,
   поэтому швов UV не видно и текстуры не нужны. Готовность (текстура глаз): HUMAN3D.ready (Promise). */
(function () {
  const T = THREE;
  const D2R = Math.PI / 180;
  const pending = [];

  function dec(b64, Type) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Type(u8.buffer);
  }

  const SOLE = (d) => (d.config.outfit === "child" ? 0.022 : 0.03);
  const geoCache = {};
  function geometry(name) {
    if (geoCache[name]) return geoCache[name];
    const d = window.HUMANS && window.HUMANS[name];
    if (!d) throw new Error("HUMAN3D: нет данных " + name + " (подключите assets/lib/humans/" + name + ".js)");
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(dec(d.position, Float32Array), 3));
    g.setAttribute("normal", new T.BufferAttribute(dec(d.normal, Float32Array), 3));
    g.setAttribute("uv", new T.BufferAttribute(dec(d.uv, Float32Array), 2));
    g.setAttribute("skinIndex", new T.Uint16BufferAttribute(dec(d.skinIndex, Uint16Array), 4));
    g.setAttribute("skinWeight", new T.BufferAttribute(dec(d.skinWeight, Float32Array), 4));
    g.setAttribute("aFace", new T.BufferAttribute(dec(d.face, Uint8Array), 4, true));
    if (d.brow) g.setAttribute("aBrow", new T.BufferAttribute(dec(d.brow, Uint8Array), 1, true));
    g.setIndex(new T.BufferAttribute(dec(d.index, Uint32Array), 1));
    g.morphAttributes.position = [];
    const morphNames = Object.keys(d.morphs);
    for (const k of morphNames) g.morphAttributes.position.push(new T.BufferAttribute(dec(d.morphs[k], Float32Array), 3));
    g.morphTargetsRelative = true;
    g.translate(0, -d.minY + SOLE(d), 0); // подошва ботинка на y = 0
    const mats = [];
    for (const [start, count, mat] of d.groups) {
      let mi = mats.indexOf(mat);
      if (mi < 0) mi = mats.push(mat) - 1;
      g.addGroup(start, count, mi);
    }
    g.computeBoundingSphere();
    g.boundingSphere.radius *= 1.6; // позы выходят за покой
    geoCache[name] = { g, d, mats, morphNames };
    return geoCache[name];
  }

  // ---------- шейдерные кусочки: шум, «бамп» по высоте ----------
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }
    float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
    vec3 hbump(vec3 surf_pos, vec3 surf_norm, float h, float k, float faceDirection) {
      vec3 vSigmaX = dFdx(surf_pos); vec3 vSigmaY = dFdy(surf_pos); vec3 vN = surf_norm;
      vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
      vec2 dH = vec2(dFdx(h), dFdy(h)) * k;
      vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
      return normalize(abs(fDet) * surf_norm - vGrad);
    }
  `;

  // общий патч: передаём покоящуюся позицию (до скиннинга) и лицевые веса во фрагмент
  function patch(mat, frag, uniforms, opts) {
    opts = opts || {};
    mat.onBeforeCompile = (sh) => {
      mat.userData.sh = sh;
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRest;\nvarying vec4 vFace;\nvarying float vBrow;\n" + (opts.face ? "attribute vec4 aFace;\nattribute float aBrow;\n" : ""))
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;\nvFace = " + (opts.face ? "aFace" : "vec4(0.0)") + ";\nvBrow = " + (opts.face ? "aBrow" : "0.0") + ";\n");
      let decl = "varying vec3 vRest;\nvarying vec4 vFace;\nvarying float vBrow;\n" + NOISE;
      for (const k in uniforms) {
        const v = uniforms[k].value;
        decl += "uniform " + (typeof v === "number" ? "float" : v.isColor ? "vec3" : v.isVector3 ? "vec3" : v.isVector4 ? "vec4" : "float") + " " + k + ";\n";
      }
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + decl)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + (frag.rough || ""))
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + (frag.normal || ""))
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + (frag.color || ""));
    };
    const id = "h" + patch.n++;
    mat.customProgramCacheKey = () => id; // у каждого материала своя программа (общая теряла оболочки одежды)
    return mat;
  }

  patch.n = 0;

  // ---------- материалы ----------
  function skinMat(o) {
    const u = {
      uTone: { value: new T.Color(o.tone || 0xb98b72) },
      uHair: { value: new T.Color(o.hair || 0x2a2018) },
      uBeard: { value: o.beard || 0 },
      uHairAmt: { value: o.hairAmt == null ? 1 : o.hairAmt },
      uDirt: { value: o.dirt || 0 },
      uCold: { value: o.cold || 0 },
      uSeed: { value: o.seed || 0 },
    };
    const m = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new T.Color(0x803020), envMapIntensity: 0.35 });
    m.userData.u = u;
    return patch(m, {
      color: `
        vec3 rp = vRest * 1.0 + uSeed;
        vec3 sk = uTone;
        sk *= 0.92 + 0.16 * fbm(rp * 18.0);                         // неровный тон
        sk = mix(sk, sk * vec3(1.08, 0.86, 0.84), smoothstep(0.45, 0.8, fbm(rp * 7.0)) * 0.5); // краснота
        sk = mix(sk, sk * vec3(1.05, 0.78, 0.82), uCold * 0.35);       // мороз: красные щёки, нос
        sk = mix(sk, sk * vec3(0.78, 0.52, 0.5), vFace.x * 0.55);     // губы
        sk = mix(sk, sk * vec3(0.86, 0.74, 0.76), vFace.y * 0.35);    // веки, круги под глазами
        float st = smoothstep(0.35, 0.75, n3(rp * 900.0)) * 0.7 + 0.3;
        sk = mix(sk, sk * vec3(0.55, 0.55, 0.58), vFace.z * uBeard * st); // щетина
        float hs = smoothstep(0.25, 0.7, n3(rp * 700.0)) * 0.5 + 0.5;
        sk = mix(sk, uHair * hs, vFace.w * uHairAmt);                  // короткие волосы
        float bw = smoothstep(0.3, 0.8, n3(vec3(rp.x * 900.0, rp.y * 250.0, rp.z * 900.0)));
        sk = mix(sk, uHair * 0.8, vBrow * (0.55 + 0.4 * bw));             // брови
        float dirt = smoothstep(0.55, 0.85, fbm(rp * 6.0 + 3.1)) * uDirt;
        sk = mix(sk, vec3(0.05, 0.04, 0.03), dirt * 0.7);              // грязь, копоть
        diffuseColor.rgb *= sk;
      `,
      rough: `roughnessFactor = 0.42 + 0.16 * fbm(vRest * 40.0) + vFace.w * 0.35 - vFace.x * 0.12;`,
      normal: `normal = hbump(-vViewPosition, normal, fbm(vRest * 160.0), 0.0005, faceDirection);`,
    }, u, { face: true, key: "skin" });
  }

  // ткань: камуфляж/однотон, складки, грязь снизу, пыль
  function clothMat(o) {
    const u = {
      uA: { value: new T.Color(o.a || 0x5b5a44) },
      uB: { value: new T.Color(o.b || 0x6f6247) },
      uC: { value: new T.Color(o.c || 0x3f4430) },
      uD: { value: new T.Color(o.d || 0x2b2a22) },
      uCamo: { value: o.camo == null ? 1 : o.camo },
      uScale: { value: o.scale || 6 },
      uFold: { value: o.fold == null ? 1 : o.fold },
      uMud: { value: o.mud || 0 },
      uDust: { value: o.dust || 0 },
      uQuilt: { value: o.quilt || 0 },
      uSeed: { value: o.seed || 0 },
      uGround: { value: o.ground || 0 },
      uStrand: { value: o.strand || 0 },
      uKnit: { value: o.knit || 0 },
    };
    const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: o.rough || 0.86, metalness: 0, side: o.side || T.DoubleSide });
    m.userData.u = u;
    return patch(m, {
      color: `
        vec3 rp = vRest + uSeed;
        vec3 c = uA;
        if (uCamo > 0.5) {
          float n1 = fbm(rp * uScale), n2 = fbm(rp * uScale * 1.7 + 7.3), n3v = fbm(rp * uScale * 2.6 + 2.1);
          c = mix(c, uB, smoothstep(0.52, 0.56, n1));
          c = mix(c, uC, smoothstep(0.55, 0.59, n2));
          c = mix(c, uD, smoothstep(0.62, 0.65, n3v) * 0.8);
        } else {
          c *= 0.9 + 0.2 * fbm(rp * 9.0);
        }
        c *= 0.88 + 0.12 * n3(rp * 260.0);                          // плетение
        c *= 1.0 - uStrand * 0.45 * n3(vec3(vRest.x * 140.0, vRest.y * 5.0, vRest.z * 140.0));
        c *= 1.0 - uKnit * 0.25 * abs(sin(atan(vRest.z, vRest.x) * 46.0));
        float mud = (1.0 - smoothstep(uGround + 0.05, uGround + 0.45, vRest.y)) * uMud * (0.6 + 0.4 * fbm(rp * 14.0));
        c = mix(c, vec3(0.045, 0.036, 0.026) * (0.7 + 0.6 * n3(rp * 40.0)), clamp(mud, 0.0, 0.9)); // грязь (линейные цвета)
        c = mix(c, c * 0.7 + vec3(0.03, 0.027, 0.022), smoothstep(0.5, 0.8, fbm(rp * 5.0 + 4.0)) * uDust);
        diffuseColor.rgb *= c;
      `,
      rough: `roughnessFactor = clamp(roughnessFactor + 0.08 * fbm(vRest * 30.0), 0.0, 1.0);`,
      normal: `
        float fold = fbm(vec3(vRest.x * 9.0, vRest.y * 26.0, vRest.z * 9.0) + uSeed) * uFold;
        float q = uQuilt * smoothstep(0.0, 0.25, abs(fract(vRest.y * 11.0) - 0.5));
        float sd = uStrand * n3(vec3(vRest.x * 140.0, vRest.y * 5.0, vRest.z * 140.0));
        sd += uKnit * (abs(sin(atan(vRest.z, vRest.x) * 46.0)) * 0.8 + n3(vRest * 600.0) * 0.4);
        normal = hbump(-vViewPosition, normal, fold * 0.9 + q * 0.6 + n3(vRest * 420.0) * 0.03 + sd * 0.5, 0.006, faceDirection);
      `,
    }, u, { key: "cloth" });
  }

  function plainMat(color, rough, metal) {
    return new T.MeshStandardMaterial({ color, roughness: rough == null ? 0.8 : rough, metalness: metal || 0 });
  }

  let eyeTex = null;
  function eyeMat(d) {
    if (!eyeTex) {
      eyeTex = new T.Texture();
      const img = new Image();
      const p = new Promise((res) => {
        img.onload = () => { eyeTex.image = img; eyeTex.needsUpdate = true; res(); };
        img.onerror = () => res();
      });
      img.src = d.eyeTex;
      eyeTex.encoding = T.sRGBEncoding;
      pending.push(p);
    }
    return new T.MeshStandardMaterial({ map: eyeTex, roughness: 0.15, metalness: 0, color: 0xcfc8c0, alphaTest: 0.5 });
  }

  // ---------- позы ----------
  // Каждый сустав — углы (градусы) [x, y, z] в мировых осях покоя: x — наклон вперёд(+)/назад,
  // y — поворот, z — наклон вбок. Для .L/.R задаётся одна сторона (L), правая зеркалится.
  const JOINT_BONES = {
    spine: ["spine05", "spine04", "spine03", "spine02", "spine01"],
    neck: ["neck01", "neck02", "neck03"],
    head: ["head"],
    hips: ["root"],
    clav: ["clavicle", "shoulder01"],
    arm: ["upperarm01", "upperarm02"],
    fore: ["lowerarm01", "lowerarm02"],
    hand: ["wrist"],
    leg: ["upperleg01", "upperleg02"],
    shin: ["lowerleg01", "lowerleg02"],
    foot: ["foot"],
    jaw: ["jaw"],
  };
  const SIDED = { clav: 1, hand: 1, fingers: 1 };
  const LIMB = { arm: ["upperarm01", "upperarm02", "lowerarm01", "spine01"], fore: ["lowerarm01", "lowerarm02", "wrist", "spine01"],
    leg: ["upperleg01", "upperleg02", "lowerleg01", "root"], shin: ["lowerleg01", "lowerleg02", "foot", "root"] };

  // Корпус (spine/neck/head/hips/hand/foot) — углы в градусах [x, y, z]: x+ — наклон вперёд/вниз, y — поворот, z — вбок.
  // Конечности (arm/fore — от груди, leg/shin — от таза) — НАПРАВЛЕНИЯ [x, y, z] в системе тела:
  // x — наружу (для каждой стороны своё, правая зеркалится), y — вверх, z — вперёд. Сторона R: ключ с суффиксом R.
  // y (число) — опустить корпус (м, для взрослого 1.71 м; у ребёнка масштабируется по росту).
  const POSES = {
    stand: { arm: [0.12, -1, 0.02], fore: [0.05, -1, 0.22], leg: [0.03, -1, 0], shin: [0, -1, -0.02], head: [4, 0, 0], fingers: 18 },
    tired: { spine: [12, 0, 0], neck: [10, 0, 0], head: [14, 0, 0], arm: [0.08, -1, 0.06], fore: [0.02, -1, 0.15], leg: [0.03, -1, 0], shin: [0, -1, -0.02], fingers: 22 },
    sitWall: { y: -0.8, spine: [-6, 0, 0], neck: [8, 0, 0], head: [16, 0, 0], leg: [0.25, 0.85, 0.9], shin: [0.02, -1, 0.3], foot: [-8, 0, 0],
      arm: [0.12, -0.55, 0.8], fore: [-0.05, -0.35, 1], hand: [10, 0, 0], fingers: 30 },
    sitLegs: { y: -0.8, spine: [10, 0, 0], neck: [8, 0, 0], head: [18, 0, 0], leg: [0.08, -0.02, 1], shin: [0.02, -0.06, 1], foot: [-12, 0, 0],
      arm: [0.12, -0.9, 0.35], fore: [-0.6, -0.35, 0.7], fingers: 30 },
    sitKnees: { y: -0.8, spine: [24, 0, 0], neck: [6, 0, 0], head: [12, 0, 0], leg: [0.12, 0.62, 1], shin: [0, -1, 0.06], foot: [-4, 0, 0],
      arm: [0.06, -0.3, 1], fore: [-0.9, 0, 0.4], fingers: 34 },
    kneel: { y: -0.44, spine: [14, 0, 0], head: [10, 0, 0], leg: [0.12, 0, 1], shin: [0, -1, 0], legR: [0.08, -1, -0.1], shinR: [0, -0.06, -1], footR: [40, 0, 0],
      arm: [0.15, -1, 0.15], fore: [0.05, -0.8, 0.6], fingers: 24 },
    listen: { y: -0.46, spine: [46, 0, 0], neck: [18, 0, 0], head: [22, 0, -24], leg: [0.12, 0, 1], shin: [0, -1, 0], legR: [0.08, -1, -0.1], shinR: [0, -0.06, -1], footR: [40, 0, 0],
      arm: [0.1, -0.7, 0.7], fore: [0, -0.8, 0.6], armR: [0.15, -0.9, 0.4], foreR: [-0.2, -0.5, 0.8], fingers: 16 },
    carry: { spine: [-8, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], leg: [0.03, -1, 0], shin: [0, -1, -0.02],
      arm: [0.15, -1, 0.25], fore: [-0.75, 0.05, 0.65], armR: [0.05, -0.4, 0.92], foreR: [-0.95, 0.12, 0.28], fingers: 40 },
    sitChairChest: { y: -0.4, spine: [10, 0, 0], neck: [10, 0, 0], head: [16, 0, 0], leg: [0.12, -0.05, 1], shin: [0.02, -1, 0.08],
      arm: [0.12, -0.8, 0.5], fore: [-0.3, -0.4, 0.85], armR: [0.25, -0.7, 0.6], foreR: [-0.75, 0.55, 0.35], fingers: 40 },
    standGive: { arm: [0.12, -0.6, 0.8], fore: [-0.2, -0.1, 1], armR: [0.12, -0.6, 0.8], foreR: [-0.2, -0.1, 1], spine: [10, 0, 0], head: [10, 0, 0], fingers: 30 },
    standHand: { arm: [0.12, -1, 0.02], fore: [0.05, -1, 0.22], armR: [0.05, 0.1, 1], foreR: [-0.1, 0.05, 1], head: [8, 0, 0], fingers: 18 },
    lookUp: { y: -0.8, spine: [-4, 0, 0], neck: [-8, 0, 0], head: [-14, 0, 0], leg: [0.08, -0.02, 1], shin: [0.02, -0.06, 1], foot: [-12, 0, 0],
      arm: [0.12, -0.9, 0.35], fore: [-0.6, -0.35, 0.7], fingers: 30 },
    sitChair: { y: -0.4, spine: [8, 0, 0], neck: [8, 0, 0], head: [12, 0, 0], leg: [0.12, -0.05, 1], shin: [0.02, -1, 0.08],
      arm: [0.12, -0.8, 0.5], fore: [-0.3, -0.4, 0.85], fingers: 30 },
    held: { leg: [0.6, -0.1, 0.8], shin: [0.2, -1, -0.1], foot: [20, 0, 0], spine: [-6, 0, 0], neck: [10, 0, 0], head: [8, 40, 0],
      arm: [0.1, 0.6, 0.8], fore: [-0.9, 0.2, 0.3], fingers: 30 },
    heldLimp: { leg: [0.55, -0.3, 0.75], shin: [0.15, -1, 0], foot: [30, 0, 0], spine: [-4, 0, 0], neck: [16, 0, 0], head: [14, 46, 0],
      arm: [0.15, 0.2, 0.9], fore: [-0.7, -0.3, 0.6], armR: [0.15, -1, 0.15], foreR: [0.05, -1, 0.1], fingers: 10 },
    phone: { y: -0.8, spine: [18, 0, 0], neck: [14, 0, 0], head: [22, 0, 0], leg: [0.25, 0.85, 0.9], shin: [0.02, -1, 0.3], foot: [-8, 0, 0],
      arm: [0.12, -0.8, 0.5], fore: [-0.5, 0.45, 0.8], fingers: 30 },
    lieSide: { leg: [0.05, -0.3, 1], shin: [0, -1, 0.2], spine: [12, 0, 0], neck: [6, 0, 0], arm: [0.1, -0.4, 1], fore: [-0.3, 0.3, 1], fingers: 30 },
  };
  // шаг: phase 0..1, amp — размах; carry — руки заняты
  function walk(phase, amp, base) {
    const A = amp == null ? 1 : amp;
    const a = Math.sin(phase * Math.PI * 2), b = Math.cos(phase * Math.PI * 2);
    const o = Object.assign({}, base || POSES.stand);
    const D = Math.PI / 180;
    const th = (x) => (x * 24 + 6) * A * D; // бедро вперёд
    const kn = (x) => (12 + Math.max(0, x) * 40) * A * D; // колено
    const legDir = (ang) => [0.03, -Math.cos(ang), Math.sin(ang)];
    o.leg = legDir(th(a));
    o.legR = legDir(th(-a));
    o.shin = legDir(th(a) - kn(b));
    o.shinR = legDir(th(-a) - kn(-b));
    o.foot = [Math.max(0, -a) * 14 * A, 0, 0];
    o.footR = [Math.max(0, a) * 14 * A, 0, 0];
    o.y = -Math.abs(b) * 0.02 * A - 0.015;
    if (!base) {
      const sw = (x) => x * 16 * A * D;
      o.arm = [0.12, -Math.cos(sw(-a)), Math.sin(sw(-a))];
      o.armR = [0.12, -Math.cos(sw(a)), Math.sin(sw(a))];
      o.fore = [0.05, -Math.cos(sw(-a) + 0.3), Math.sin(sw(-a) + 0.3)];
      o.foreR = [0.05, -Math.cos(sw(a) + 0.3), Math.sin(sw(a) + 0.3)];
    }
    o.spine = [(o.spine ? o.spine[0] : 0) + 4, a * 4 * A, 0];
    return o;
  }


  function make(name, opt) {
    opt = opt || {};
    const { g, d, mats, morphNames } = geometry(name);
    const root = new T.Group();
    const bones = [];
    const byName = {};
    for (const b of d.bones) {
      const bone = new T.Bone();
      bone.name = b.name;
      const h = b.head;
      if (b.parent >= 0) {
        const p = d.bones[b.parent].head;
        bone.position.set(h[0] - p[0], h[1] - p[1], h[2] - p[2]);
        bones[b.parent].add(bone);
      } else bone.position.set(h[0], h[1] - d.minY + SOLE(d), h[2]);
      bones.push(bone);
      byName[b.name] = bone;
    }
    const kind = d.config.outfit;
    const skin = skinMat(Object.assign({ tone: kind === "child" ? 0xcc9e8a : 0xae8068, beard: kind === "child" ? 0 : 0.85, hair: kind === "child" ? 0x6a5236 : 0x231c16, seed: opt.seed || 0 }, opt.skin));
    const mm = {
      skin,
      jacket: clothMat(Object.assign(kind === "child" ? { a: 0x34465a, camo: 0, quilt: 1, fold: 0.6, dust: 0.5, rough: 0.6 } : { mud: 0.4, dust: 0.6 }, opt.jacket, { seed: (opt.seed || 0) * 1.3 })),
      pants: clothMat(Object.assign(kind === "child" ? { a: 0x2c3038, camo: 0, mud: 0.8, dust: 0.4 } : { mud: 1.0, dust: 0.5 }, opt.pants, { seed: (opt.seed || 0) * 1.7 + 3 })),
      boots: clothMat(Object.assign({ a: kind === "child" ? 0x2a2626 : 0x2a241e, camo: 0, mud: 1.2, fold: 0.3, rough: 0.6, ground: 0.0 }, opt.boots)),
      gloves: clothMat(Object.assign({ a: 0x2e2f28, camo: 0, fold: 0.4, rough: 0.7 }, opt.gloves)),
      eye: eyeMat(d),
      lash: new T.MeshStandardMaterial({ visible: false }),
    };
    const mesh = new T.SkinnedMesh(g, mats.map((k) => mm[k]));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(bones[0]);
    root.add(mesh);
    root.updateMatrixWorld(true);
    const skel = new T.Skeleton(bones);
    mesh.bind(skel, new T.Matrix4());
    mesh.morphTargetInfluences = morphNames.map(() => 0);

    const rest = new Map(bones.map((b) => [b, b.quaternion.clone()]));
    const e = new T.Euler(0, 0, 0, "YXZ");
    const q = new T.Quaternion();

    function setJoint(key, ang, side) {
      const list = JOINT_BONES[key];
      if (!list) return;
      const n = list.length;
      const sx = side === "R" ? 1 : 1, sy = side === "R" ? -1 : 1, sz = side === "R" ? -1 : 1;
      for (const bn of list) {
        const b = byName[side ? bn + "." + side : bn];
        if (!b) continue;
        e.set((ang[0] * sx * D2R) / n, (ang[1] * sy * D2R) / n, (ang[2] * sz * D2R) / n, "YXZ");
        b.quaternion.copy(rest.get(b)).multiply(q.setFromEuler(e));
      }
    }
    function setFingers(curl, side) {
      for (let f = 1; f <= 5; f++)
        for (let k = 1; k <= 3; k++) {
          const b = byName["finger" + f + "-" + k + "." + side];
          if (!b) continue;
          const c = (f === 1 ? curl * 0.5 : curl) * (k === 1 ? 0.9 : 1.1);
          e.set(f === 1 ? 0 : c * D2R, 0, f === 1 ? (side === "L" ? -1 : 1) * c * 0.6 * D2R : 0, "YXZ");
          b.quaternion.copy(rest.get(b)).multiply(q.setFromEuler(e));
        }
    }

    // направления сегментов конечностей в покое (кости в покое не повёрнуты — оси совпадают с осями тела)
    const restDir = {};
    const headOf = (n) => { const b = d.bones.find((x) => x.name === n); return new T.Vector3(...b.head); };
    for (const key in LIMB) for (const sd of ["L", "R"]) restDir[key + sd] = headOf(LIMB[key][2] + "." + sd).sub(headOf(LIMB[key][0] + "." + sd)).normalize();
    // поворот кости относительно корня персонажа
    function relQ(b, out) {
      out.identity();
      const chain = [];
      for (let x = b; x && x.isBone; x = x.parent) chain.unshift(x);
      for (const x of chain) out.multiply(x.quaternion);
      return out;
    }
    const qa = new T.Quaternion(), qb = new T.Quaternion(), vd = new T.Vector3();
    function aim(key, side, dir) {
      const L = LIMB[key];
      const b1 = byName[L[0] + "." + side], b2 = byName[L[1] + "." + side];
      relQ(byName[L[3]], qa);
      vd.set(side === "R" ? -dir[0] : dir[0], dir[1], dir[2]).normalize().applyQuaternion(qa);
      qb.setFromUnitVectors(restDir[key + side], vd); // нужный поворот b1 относительно корня
      relQ(b1.parent, qa);
      b1.quaternion.copy(qa.invert().multiply(qb));
      b2.quaternion.identity();
    }
    // стопа/кисть: углы относительно таза/предплечья
    function setRel(bn, ang, side, frameBone) {
      const b = byName[bn + "." + side];
      if (!b) return;
      relQ(byName[frameBone], qa);
      e.set(ang[0] * D2R, (side === "R" ? -1 : 1) * ang[1] * D2R, (side === "R" ? -1 : 1) * ang[2] * D2R, "YXZ");
      qa.multiply(q.setFromEuler(e));
      relQ(b.parent, qb);
      b.quaternion.copy(qb.invert().multiply(qa));
    }
    // поза: { spine/neck/head/hips/clav: углы, arm/fore/leg/shin(+R): направления, hand/foot(+R): углы, fingers, y, z }
    function pose(p) {
      if (typeof p === "string") p = POSES[p];
      for (const b of bones) b.quaternion.copy(rest.get(b));
      for (const key of ["hips", "spine", "neck", "head", "jaw"]) if (p[key]) setJoint(key, p[key]);
      for (const sd of ["L", "R"]) setJoint("clav", (sd === "R" && p.clavR) || p.clav || [0, 0, 0], sd);
      const S0 = POSES.stand;
      for (const sd of ["L", "R"]) {
        const g = (k) => (sd === "R" && p[k + "R"]) || p[k] || S0[k];
        aim("arm", sd, g("arm"));
        aim("fore", sd, g("fore"));
        aim("leg", sd, g("leg"));
        aim("shin", sd, g("shin"));
        setRel("foot", g("foot") || [0, 0, 0], sd, "root");
        setJoint("hand", (sd === "R" && p.handR) || p.hand || [0, 0, 0], sd);
      }
      setFingers(p.fingers == null ? 12 : p.fingers, "L");
      setFingers(p.fingersR == null ? (p.fingers == null ? 12 : p.fingers) : p.fingersR, "R");
      bones[0].position.y = d.bones[0].head[1] - d.minY + SOLE(d) + (p.y || 0) * d.height / 1.71;
      bones[0].position.z = d.bones[0].head[2] + (p.z || 0);
      root.updateMatrixWorld(true);
    }
    function face(f) {
      morphNames.forEach((k, i) => (mesh.morphTargetInfluences[i] = (f && f[k]) || 0));
    }
    const h = { root, mesh, bones: byName, skel, pose, face, data: d, mats: mm, height: d.height, gear: {} };
    dressUp(h, opt);
    pose(POSES.stand);
    return h;
  }

  // ---------- снаряжение: жёсткие меши на костях ----------
  function restPos(h, bone, which) {
    const b = h.data.bones.find((x) => x.name === bone);
    const p = b[which || "head"];
    return new T.Vector3(p[0], p[1] - h.data.minY + SOLE(h.data), p[2]);
  }
  function attach(h, bone, obj, worldPos) {
    const b = h.bones[bone];
    const bp = restPos(h, bone);
    obj.position.add(worldPos.clone().sub(bp));
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    b.add(obj);
    return obj;
  }
  // обхват тела на высоте y (по коже и одежде в покое): полуоси эллипса и центр
  function girth(h, y, band, filter) {
    const P = h.mesh.geometry.attributes.position.array;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < P.length; i += 3) {
      if (Math.abs(P[i + 1] - y) > band) continue;
      if (filter && !filter(P[i], P[i + 1], P[i + 2])) continue;
      x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]);
    }
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, x0, x1, z0, z1 };
  }
  function bend(geo, fn) {
    const a = geo.attributes.position;
    const v = new T.Vector3();
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      fn(v);
      a.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function roundBox(w, hh, dpt, r) {
    const s = new T.Shape();
    const x = -w / 2, y = -hh / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + hh - r); s.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
    s.lineTo(x + r, y + hh); s.quadraticCurveTo(x, y + hh, x, y + hh - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new T.ExtrudeGeometry(s, { depth: dpt, bevelEnabled: true, bevelThickness: Math.min(0.008, dpt * 0.3), bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -dpt / 2);
    return g;
  }
  function band(rx, rz, hgt, seg) {
    const g = new T.CylinderGeometry(1, 1, hgt, seg || 40, 1, true);
    g.scale(rx, 1, rz);
    return g;
  }

  function boots(h, side, mat, soleMat) {
    const d = h.data;
    const ankle = restPos(h, "foot." + side);
    const toe = restPos(h, "foot." + side, "tail");
    const child = d.config.outfit === "child";
    const sole = SOLE(d);
    const dir = new T.Vector3(toe.x - ankle.x, 0, toe.z - ankle.z);
    const fl = dir.length();
    dir.normalize();
    const L = fl * 1.62 + (child ? 0.03 : 0.05), W = child ? 0.072 : 0.108, H = ankle.y + (child ? 0.025 : 0.035);
    // носок ниже, пятка — плоская и высокая
    const g = bend(new T.SphereGeometry(1, 28, 18), (v) => {
      const zf = (v.z + 1) / 2; // 0 — пятка, 1 — носок
      v.y = v.y < 0 ? -1 : v.y * (1 - 0.62 * Math.pow(zf, 1.6));
      v.x *= 1 - 0.18 * Math.pow(1 - zf, 2);
      v.set(v.x * W / 2, (v.y + 1) / 2 * (H - sole) + sole, v.z * L / 2);
    });
    const foot = new T.Group();
    const m = new T.Mesh(g, mat);
    foot.add(m);
    const so = new T.Mesh(bend(new T.CylinderGeometry(1, 1, 1, 28, 1), (v) => {
      const zf = (v.z + 1) / 2;
      v.x *= 1 - 0.18 * Math.pow(1 - zf, 2);
      v.set(v.x * (W / 2 + 0.006), (v.y + 0.5) * sole, v.z * (L / 2 + 0.006));
    }), soleMat);
    foot.add(so);
    foot.rotation.y = Math.atan2(dir.x, dir.z);
    const c = new T.Vector3(ankle.x + dir.x * (L / 2 - (child ? 0.04 : 0.06)), 0, ankle.z + dir.z * (L / 2 - (child ? 0.04 : 0.06)));
    foot.position.set(0, 0, 0);
    attach(h, "foot." + side, foot, c);
    // голенище до середины голени
    const shH = child ? 0.11 : 0.17;
    const gg = girth(h, ankle.y + shH * 0.6, 0.02, (x) => (side === "L" ? x > 0.02 : x < -0.02));
    const sh = new T.Mesh(bend(new T.CylinderGeometry(1, 1, shH, 24, 3, true), (v) => {
      const k = 1 + 0.1 * (0.5 - v.y / shH);
      v.x *= k; v.z *= k;
    }), mat);
    sh.material.side = T.DoubleSide;
    sh.scale.set(gg.rx + 0.012, 1, gg.rz + 0.014);
    attach(h, "lowerleg02." + side, sh, new T.Vector3(gg.cx, ankle.y + shH / 2 - 0.01, gg.cz));
    return foot;
  }

  // купол на голову: сзади и по бокам ниже, спереди край над бровями (единичный, центр — уровень глаз)
  function domeGeo(frontMin, sideMin, backMin) {
    return bend(new T.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.72), (v) => {
      const f = Math.max(0, v.z), b = Math.max(0, -v.z);
      const lo = sideMin + (frontMin - sideMin) * Math.pow(f, 1.5) + (backMin - sideMin) * Math.pow(b, 1.5);
      if (v.y < lo) v.y = lo;
    });
  }
  function dressUp(h, opt) {
    const d = h.data;
    const child = d.config.outfit === "child";
    const gear = opt.gear || (child ? "child" : "soldier");
    const G = h.gear;
    const seed = opt.seed || 0;
    const leather = clothMat({ a: child ? 0x3a2f2c : 0x2b241d, camo: 0, mud: 1.3, fold: 0.25, rough: 0.55, dust: 0.4 });
    const rubber = plainMat(0x161412, 0.9);
    G.bootL = boots(h, "L", leather, rubber);
    G.bootR = boots(h, "R", leather, rubber);
    const yRoot = restPos(h, "root").y;
    const head = restPos(h, "head");
    const eyeY = d.joints.eyeL[1] - d.minY + SOLE(d);
    // голова: габариты по коже выше глаз
    const hg = girth(h, eyeY + 0.03, 0.012);
    const top = (() => { const P = h.mesh.geometry.attributes.position.array; let m = 0; for (let i = 1; i < P.length; i += 3) m = Math.max(m, P[i]); return m; })();
    const hc = new T.Vector3(hg.cx, eyeY + 0.02, hg.cz - 0.005);
    if (gear === "soldier") {
      const cam = clothMat({ seed: seed + 11, dust: 0.6, fold: 0.5 });
      const olive = clothMat({ a: 0x47483a, camo: 0, fold: 0.7, dust: 0.7, mud: 0.3, seed: seed + 5 });
      const black = plainMat(0x121212, 0.6, 0.2);
      // ремень
      const wb = girth(h, yRoot + 0.02, 0.015, (x) => Math.abs(x) < 0.19 * h.height / 1.75);
      const belt = new T.Mesh(band(wb.rx + 0.014, wb.rz + 0.014, 0.05), olive);
      belt.material.side = T.DoubleSide;
      attach(h, "root", belt, new T.Vector3(wb.cx, yRoot + 0.02, wb.cz));
      // плитник: перед, спина, камербанд, лямки, подсумки
      const yc = restPos(h, "spine03").y + 0.02;
      const ch = girth(h, yc, 0.03, (x) => Math.abs(x) < 0.16);
      const pc = new T.Group();
      const PW = Math.min(0.31, ch.rx * 2 + 0.04), PH = 0.34, PT = 0.04;
      const front = new T.Mesh(roundBox(PW, PH, PT, 0.05), cam);
      front.position.set(0, 0, ch.z1 - ch.cz + PT / 2 + 0.006);
      const back = new T.Mesh(roundBox(PW, PH, PT, 0.05), cam);
      back.position.set(0, 0.01, ch.z0 - ch.cz - PT / 2 - 0.006);
      pc.add(front, back);
      const cb = new T.Mesh(band(ch.rx + 0.03, ch.rz + 0.035, 0.13), cam);
      cb.position.y = -PH / 2 + 0.07;
      pc.add(cb);
      for (const sx of [-1, 1]) {
        const st = new T.Mesh(bend(new T.BoxGeometry(0.06, 0.012, 1, 1, 1, 10), (v) => {
          const a = v.z * Math.PI * 0.95; // дуга через плечо
          const R = (ch.z1 - ch.z0) / 2 + 0.03;
          v.set(v.x, Math.cos(a) * R * 0.55 + v.y, Math.sin(a) * R + v.y * Math.sin(a));
        }), cam);
        st.position.set(sx * PW * 0.32, PH / 2 - 0.02, 0);
        pc.add(st);
      }
      for (let i = 0; i < 3; i++) {
        const pu = new T.Mesh(roundBox(0.075, 0.12, 0.035, 0.012), olive);
        pu.position.set((i - 1) * 0.085, -PH / 2 + 0.07, ch.z1 - ch.cz + PT + 0.024);
        pc.add(pu);
      }
      const radio = new T.Mesh(roundBox(0.06, 0.15, 0.04, 0.01), olive);
      radio.position.set(PW * 0.38, PH * 0.12, ch.z1 - ch.cz + PT + 0.02);
      pc.add(radio);
      const ant = new T.Mesh(new T.CylinderGeometry(0.003, 0.004, 0.2, 6), black);
      ant.position.set(PW * 0.42, PH * 0.12 + 0.17, ch.z1 - ch.cz + PT + 0.02);
      pc.add(ant);
      G.carrier = attach(h, "spine03", pc, new T.Vector3(ch.cx, yc, ch.cz));
      // гейтер на шее — закрывает переход куртка/шея
      const ny = restPos(h, "neck02").y;
      const nz = restPos(h, "neck02").z;
      const ng = girth(h, ny, 0.012, (x, y, z) => x * x + (z - nz) * (z - nz) < 0.075 * 0.075);
      const gaiter = new T.Mesh(bend(new T.CylinderGeometry(1, 1, 0.08, 28, 4, true), (v) => { const k = 1 + 0.35 * Math.max(0, -v.y / 0.04) + 0.04 * Math.sin(v.y * 160); v.x *= k; v.z *= k; }),
        clothMat({ a: 0x3d3f33, camo: 0, knit: 0.6, fold: 0.4, rough: 0.95, seed: seed + 8 }));
      gaiter.scale.set(ng.rx + 0.008, 1, ng.rz + 0.009);
      attach(h, "neck01", gaiter, new T.Vector3(ng.cx, ny - 0.015, ng.cz));
      // каска с чехлом
      const helmet = new T.Group();
      const hr = Math.max(hg.rx, hg.rz);
      const HY = top - hc.y + 0.025;
      const shell = new T.Mesh(domeGeo(0.32, -0.05, -0.12), cam);
      shell.scale.set(hg.rx + 0.03, HY, hg.rz + 0.032);
      helmet.add(shell);
      const shroud = new T.Mesh(roundBox(0.05, 0.035, 0.02, 0.006), black);
      shroud.position.set(0, (top - hc.y) * 0.75, hg.rz + 0.03);
      shroud.rotation.x = -0.35;
      helmet.add(shroud);
      for (const sx of [-1, 1]) {
        const rail = new T.Mesh(new T.BoxGeometry(0.008, 0.02, 0.1), black);
        rail.position.set(sx * (hg.rx + 0.032), (top - hc.y) * 0.25, 0);
        helmet.add(rail);
      }
      helmet.position.set(0, 0.012, -0.004);
      G.helmet = attach(h, "head", helmet, hc.clone());
      G.helmet.visible = opt.helmet !== false;
      // вязаная шапка (вместо каски)
      const cap = new T.Mesh(domeGeo(0.36, 0.05, -0.15), clothMat({ a: 0x2f3129, camo: 0, quilt: 0, fold: 0.15, knit: 1, rough: 0.95, seed: seed + 3 }));
      cap.scale.set(hg.rx + 0.012, (top - hc.y) + 0.012, hg.rz + 0.014);
      G.cap = attach(h, "head", cap, hc.clone().add(new T.Vector3(0, 0.012, -0.004)));
      G.cap.visible = opt.helmet === false;
      G.headlamp = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.012, 12), black);
      G.headlamp.rotation.x = Math.PI / 2;
      G.headlamp.position.set(0, (top - hc.y) * 0.45, hg.rz + 0.035);
      helmet.add(G.headlamp);
    } else {
      // Соня: вязаная шапка, волосы из-под неё, капюшон
      const knit = clothMat({ a: 0x6f5a5e, camo: 0, fold: 0.15, knit: 1, rough: 0.97, dust: 0.6, seed: seed + 9 });
      const cap = new T.Mesh(domeGeo(0.42, 0.05, -0.1), knit);
      cap.scale.set(hg.rx + 0.014, (top - hc.y) + 0.024, hg.rz + 0.016);
      G.cap = attach(h, "head", cap, hc.clone().add(new T.Vector3(0, 0.0, -0.006)));
      // волосы: оболочка за ушами до плеч, пряди — рельефом
      const hairMat = clothMat({ a: 0x4a3828, camo: 0, fold: 0, rough: 0.6, seed: seed + 2, strand: 0.45 });
      const hair = new T.Mesh(bend(new T.SphereGeometry(1, 30, 16, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.35, Math.PI * 0.5), (v) => {
        const k = v.y < 0 ? 1 + v.y * 0.1 : 1;
        v.y = v.y < 0 ? v.y * 1.9 : v.y;
        v.x *= k; v.z *= k;
      }), hairMat);
      hair.scale.set(hg.rx + 0.006, (top - hc.y) * 0.9, hg.rz + 0.008);
      G.hair = attach(h, "head", hair, hc.clone().add(new T.Vector3(0, -0.01, -0.012)));
      G.hair.material.side = T.DoubleSide;
    }
  }

  // смешать две позы
  function mix(a, b, k) {
    if (typeof a === "string") a = POSES[a];
    if (typeof b === "string") b = POSES[b];
    const o = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const x = a[key], y = b[key];
      if (Array.isArray(x) || Array.isArray(y)) {
        const xx = x || [0, 0, 0], yy = y || [0, 0, 0];
        o[key] = [0, 1, 2].map((i) => xx[i] + (yy[i] - xx[i]) * k);
      } else o[key] = (x || 0) + ((y || 0) - (x || 0)) * k;
    }
    return o;
  }

  window.HUMAN3D = { make, mix, walk, POSES, clothMat, skinMat, plainMat, get ready() { return Promise.all(pending); } };
})();
