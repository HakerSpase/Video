/* Тайга зимой: SVG-слои для эпизода «Зимовье» (ели, изба, интерьер, фигура, следы) и метель на canvas.
   Всё детерминировано (сид), метель рисуется от времени таймлайна — кадры при рендере одинаковые.
   Использование в сцене:
     root.querySelector("#bg").innerHTML = TAIGA.svg(TAIGA.sky("night") + TAIGA.forest({...}) + TAIGA.cabin({...}));
     TAIGA.snow(canvas, tl, { from: 0, dur: 10, n: 260, wind: 0.6 });                                       */
(function () {
  const W = 1080, H = 1920;
  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const f = (v) => Math.round(v * 10) / 10;

  const svg = (inner, vb) => `<svg viewBox="${vb || `0 0 ${W} ${H}`}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${DEFS}${inner}</svg>`;

  const DEFS = `<defs>
    <linearGradient id="tg-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03050a"/><stop offset=".55" stop-color="#0c1526"/><stop offset="1" stop-color="#1b2840"/></linearGradient>
    <linearGradient id="tg-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0f18"/><stop offset=".6" stop-color="#1d2a3e"/><stop offset="1" stop-color="#3a4c66"/></linearGradient>
    <linearGradient id="tg-dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6f88"/><stop offset=".6" stop-color="#a9b6c6"/><stop offset="1" stop-color="#d9dee5"/></linearGradient>
    <linearGradient id="tg-snow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aab8cc"/><stop offset="1" stop-color="#5b6b84"/></linearGradient>
    <linearGradient id="tg-snowd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef4"/><stop offset="1" stop-color="#aeb9c7"/></linearGradient>
    <linearGradient id="tg-log" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3424"/><stop offset=".5" stop-color="#2e2016"/><stop offset="1" stop-color="#1a120c"/></linearGradient>
    <linearGradient id="tg-logi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4a2e"/><stop offset=".5" stop-color="#4a3220"/><stop offset="1" stop-color="#2a1c12"/></linearGradient>
    <radialGradient id="tg-warm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".95"/><stop offset=".5" stop-color="#ff9a3a" stop-opacity=".35"/><stop offset="1" stop-color="#ff7a20" stop-opacity="0"/></radialGradient>
    <radialGradient id="tg-cold" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#cfe0ff" stop-opacity=".8"/><stop offset="1" stop-color="#9fb4d6" stop-opacity="0"/></radialGradient>
    <radialGradient id="tg-torch" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6dc" stop-opacity=".95"/><stop offset=".55" stop-color="#ffe7b0" stop-opacity=".35"/><stop offset="1" stop-color="#ffe7b0" stop-opacity="0"/></radialGradient>
    <filter id="tg-blur4"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="tg-blur12"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="tg-blur30"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>`;

  function sky(kind) {
    const id = kind === "dawn" ? "tg-dawn" : kind === "storm" ? "tg-storm" : "tg-night";
    let s = `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
    if (kind === "night") {
      const r = rng(7);
      for (let i = 0; i < 90; i++) s += `<circle cx="${f(r() * W)}" cy="${f(r() * 700)}" r="${f(0.6 + r() * 1.6)}" fill="#dfe8ff" opacity="${f(0.2 + r() * 0.6)}"/>`;
    }
    return s;
  }

  // одна ель: ярусы с рваным краем + снег на ярусах
  function spruce(x, base, h, w, fill, snowy, r) {
    const tiers = 7, top = base - h;
    let L = [], R = [];
    for (let i = 0; i < tiers; i++) {
      const y1 = top + (h * 0.92 * (i + 1)) / tiers, wi = (w * (i + 1.2)) / tiers, j = (r() - 0.5) * w * 0.12;
      L.push([x - wi - j, y1], [x - wi * 0.42, y1 - h * 0.035]);
      R.push([x + wi * 0.42, y1 - h * 0.035], [x + wi + j, y1]);
    }
    const pts = [[x, top]].concat(L, [[x - w * 0.06, base], [x + w * 0.06, base]], R.reverse());
    let s = `<polygon points="${pts.map((p) => f(p[0]) + "," + f(p[1])).join(" ")}" fill="${fill}"/>`;
    if (snowy) {
      for (let i = 0; i < tiers; i++) {
        const y1 = top + (h * 0.92 * (i + 1)) / tiers, wi = (w * (i + 1.2)) / tiers;
        s += `<path d="M${f(x - wi * 0.9)} ${f(y1 - 2)} Q${f(x - wi * 0.4)} ${f(y1 - h * 0.05)} ${f(x)} ${f(y1 - h * 0.075)} Q${f(x + wi * 0.4)} ${f(y1 - h * 0.05)} ${f(x + wi * 0.9)} ${f(y1 - 2)}" stroke="#c9d6e6" stroke-opacity="${snowy}" stroke-width="${f(Math.max(2, h * 0.012))}" fill="none" stroke-linecap="round"/>`;
      }
    }
    return s;
  }

  // ряд елей: o = {seed, y (линия земли), h, n, color, snowy, spread:[x0,x1], gap:[a,b] (пустое место)}
  function forest(o) {
    const r = rng(o.seed || 1);
    const x0 = (o.spread || [-80, W + 80])[0], x1 = (o.spread || [-80, W + 80])[1];
    let s = "";
    for (let i = 0; i < o.n; i++) {
      const x = x0 + ((x1 - x0) * (i + r() * 0.8)) / o.n;
      if (o.gap && x > o.gap[0] && x < o.gap[1]) continue;
      const h = o.h * (0.7 + r() * 0.6);
      s += spruce(x, o.y + r() * (o.jit || 20), h, h * 0.24, o.color, o.snowy, r);
    }
    return s;
  }

  function ground(y, kind) {
    return `<path d="M0 ${y} Q${W * 0.3} ${y - 30} ${W * 0.55} ${y - 8} T${W} ${y - 20} V${H} H0Z" fill="url(#${kind === "dawn" ? "tg-snowd" : "tg-snow"})"/>`;
  }

  // изба спереди. o = {x, y (земля), s (масштаб), lit, door: "closed"|"dark", gen: true, smoke}
  function cabin(o) {
    const s = o.s || 1, x = o.x, y = o.y;
    const w = 640 * s, h = 300 * s, l = x - w / 2;
    let g = `<g>`;
    // тень/свет на снегу от окна
    if (o.lit) g += `<ellipse cx="${f(x + 150 * s)}" cy="${f(y + 60 * s)}" rx="${f(230 * s)}" ry="${f(50 * s)}" fill="url(#tg-warm)" opacity=".55"/>`;
    // брёвна
    const logs = 8;
    for (let i = 0; i < logs; i++) {
      const ly = y - h + (h * i) / logs;
      g += `<rect x="${f(l)}" y="${f(ly)}" width="${f(w)}" height="${f(h / logs + 1)}" rx="${f(h / logs / 2)}" fill="url(#tg-log)"/>`;
      g += `<circle cx="${f(l - 6 * s)}" cy="${f(ly + h / logs / 2)}" r="${f(h / logs / 2)}" fill="#5a4330"/><circle cx="${f(l - 6 * s)}" cy="${f(ly + h / logs / 2)}" r="${f(h / logs / 4)}" fill="#3b2a1c"/>`;
      g += `<circle cx="${f(l + w + 6 * s)}" cy="${f(ly + h / logs / 2)}" r="${f(h / logs / 2)}" fill="#5a4330"/><circle cx="${f(l + w + 6 * s)}" cy="${f(ly + h / logs / 2)}" r="${f(h / logs / 4)}" fill="#3b2a1c"/>`;
    }
    // крыша и снег на ней
    g += `<polygon points="${f(l - 70 * s)},${f(y - h + 4)} ${f(x)},${f(y - h - 230 * s)} ${f(l + w + 70 * s)},${f(y - h + 4)}" fill="#1b130d"/>`;
    g += `<path d="M${f(l - 86 * s)} ${f(y - h + 10 * s)} L${f(x)} ${f(y - h - 250 * s)} L${f(l + w + 86 * s)} ${f(y - h + 10 * s)} Q${f(l + w + 40 * s)} ${f(y - h + 34 * s)} ${f(l + w - 20 * s)} ${f(y - h + 18 * s)} Q${f(x + 120 * s)} ${f(y - h + 40 * s)} ${f(x)} ${f(y - h + 16 * s)} Q${f(x - 140 * s)} ${f(y - h + 38 * s)} ${f(l - 30 * s)} ${f(y - h + 26 * s)} Z" fill="#c4d0df" opacity=".92"/>`;
    // фронтон
    g += `<polygon points="${f(l + 30 * s)},${f(y - h)} ${f(x)},${f(y - h - 190 * s)} ${f(l + w - 30 * s)},${f(y - h)}" fill="#24180f"/>`;
    // труба и дым
    g += `<rect x="${f(x + 140 * s)}" y="${f(y - h - 190 * s)}" width="${f(46 * s)}" height="${f(110 * s)}" fill="#2a1f18"/><rect x="${f(x + 134 * s)}" y="${f(y - h - 200 * s)}" width="${f(58 * s)}" height="${f(18 * s)}" fill="#c4d0df"/>`;
    if (o.smoke) g += `<g class="tg-smoke" opacity=".35">${[0, 1, 2].map((k) => `<circle cx="${f(x + 163 * s + k * 30 * s)}" cy="${f(y - h - 240 * s - k * 70 * s)}" r="${f((40 + k * 26) * s)}" fill="#8996aa" filter="url(#tg-blur12)"/>`).join("")}</g>`;
    // дверь
    const dx = l + 90 * s, dw = 130 * s, dh = 230 * s;
    g += `<rect x="${f(dx - 10 * s)}" y="${f(y - dh - 10 * s)}" width="${f(dw + 20 * s)}" height="${f(dh + 10 * s)}" fill="#120c08"/>`;
    g += `<rect class="tg-door" x="${f(dx)}" y="${f(y - dh)}" width="${f(dw)}" height="${f(dh)}" fill="#3a2a1d"/>`;
    for (let i = 1; i < 5; i++) g += `<line x1="${f(dx + (dw * i) / 5)}" y1="${f(y - dh)}" x2="${f(dx + (dw * i) / 5)}" y2="${f(y)}" stroke="#241a12" stroke-width="${f(3 * s)}"/>`;
    g += `<circle cx="${f(dx + dw - 20 * s)}" cy="${f(y - dh / 2)}" r="${f(6 * s)}" fill="#8a7a66"/>`;
    // окно
    const wx = x + 90 * s, wy = y - h + 70 * s, ww = 150 * s, wh = 120 * s;
    g += `<rect x="${f(wx - 12 * s)}" y="${f(wy - 12 * s)}" width="${f(ww + 24 * s)}" height="${f(wh + 24 * s)}" fill="#7d6a55"/>`;
    g += `<rect class="tg-win" x="${f(wx)}" y="${f(wy)}" width="${f(ww)}" height="${f(wh)}" fill="${o.lit ? "#ffb45a" : "#0b1018"}"/>`;
    if (o.lit) g += `<rect class="tg-wing" x="${f(wx - 80 * s)}" y="${f(wy - 80 * s)}" width="${f(ww + 160 * s)}" height="${f(wh + 160 * s)}" fill="url(#tg-warm)" opacity=".7"/>`;
    g += `<line x1="${f(wx + ww / 2)}" y1="${f(wy)}" x2="${f(wx + ww / 2)}" y2="${f(wy + wh)}" stroke="#5c4b3a" stroke-width="${f(8 * s)}"/><line x1="${f(wx)}" y1="${f(wy + wh / 2)}" x2="${f(wx + ww)}" y2="${f(wy + wh / 2)}" stroke="#5c4b3a" stroke-width="${f(8 * s)}"/>`;
    g += `<path d="M${f(wx - 16 * s)} ${f(wy + wh + 12 * s)} h${f(ww + 32 * s)} q${f(-20 * s)} ${f(-16 * s)} ${f(-60 * s)} ${f(-10 * s)} q${f(-50 * s)} ${f(-10 * s)} ${f(-ww)} 0Z" fill="#c4d0df"/>`;
    // генератор справа
    if (o.gen !== false) {
      const gx = l + w + 70 * s;
      g += `<rect x="${f(gx)}" y="${f(y - 90 * s)}" width="${f(150 * s)}" height="${f(90 * s)}" rx="${f(8 * s)}" fill="#3d4a3a"/><rect x="${f(gx + 10 * s)}" y="${f(y - 80 * s)}" width="${f(70 * s)}" height="${f(50 * s)}" fill="#2a3428"/>`;
      g += `<rect x="${f(gx - 6 * s)}" y="${f(y - 100 * s)}" width="${f(162 * s)}" height="${f(14 * s)}" rx="${f(6 * s)}" fill="#c4d0df"/>`;
      g += `<circle class="tg-led" cx="${f(gx + 120 * s)}" cy="${f(y - 55 * s)}" r="${f(7 * s)}" fill="#3ddc84"/>`;
      g += `<path d="M${f(gx)} ${f(y - 40 * s)} C${f(gx - 40 * s)} ${f(y - 20 * s)} ${f(l + w + 20 * s)} ${f(y - 120 * s)} ${f(l + w)} ${f(y - 140 * s)}" stroke="#111" stroke-width="${f(5 * s)}" fill="none"/>`;
    }
    // сугроб у стены
    g += `<path d="M${f(l - 120 * s)} ${f(y + 6)} Q${f(l)} ${f(y - 46 * s)} ${f(dx - 14 * s)} ${f(y - 4)} L${f(dx + dw + 14 * s)} ${f(y - 4)} Q${f(x + 100 * s)} ${f(y - 50 * s)} ${f(l + w + 260 * s)} ${f(y + 8)} Z" fill="#9fb0c6"/>`;
    return g + `</g>`;
  }

  // тёмная фигура: слишком высокая, руки до колен. back=true — спиной
  function figure(x, base, h, o) {
    o = o || {};
    const c = o.color || "#040507", s = h / 400;
    const d = `M${x} ${base - 400 * s}
      c${-22 * s} 0 ${-30 * s} ${18 * s} ${-30 * s} ${36 * s} c0 ${20 * s} ${10 * s} ${34 * s} ${20 * s} ${38 * s}
      c${-30 * s} ${8 * s} ${-44 * s} ${26 * s} ${-48 * s} ${60 * s} l${-14 * s} ${170 * s} c${-2 * s} ${16 * s} ${6 * s} ${22 * s} ${14 * s} ${10 * s}
      l${12 * s} ${-120 * s} l${8 * s} ${36 * s} l${-6 * s} ${200 * s} h${30 * s} l${14 * s} ${-170 * s} l${14 * s} ${170 * s} h${30 * s}
      l${-6 * s} ${-200 * s} l${8 * s} ${-36 * s} l${12 * s} ${120 * s} c${8 * s} ${12 * s} ${16 * s} ${6 * s} ${14 * s} ${-10 * s}
      l${-14 * s} ${-170 * s} c${-4 * s} ${-34 * s} ${-18 * s} ${-52 * s} ${-48 * s} ${-60 * s} c${10 * s} ${-4 * s} ${20 * s} ${-18 * s} ${20 * s} ${-38 * s}
      c0 ${-18 * s} ${-8 * s} ${-36 * s} ${-30 * s} ${-36 * s}z`;
    let g = `<g class="${o.cls || "tg-fig"}" opacity="${o.opacity == null ? 1 : o.opacity}">`;
    if (o.shadow !== false) g += `<ellipse cx="${x}" cy="${base + 4 * s}" rx="${f(70 * s)}" ry="${f(12 * s)}" fill="#000" opacity=".35" filter="url(#tg-blur4)"/>`;
    g += `<path d="${d.replace(/\s+/g, " ")}" fill="${c}"/>`;
    return g + `</g>`;
  }

  // следы валенок вдоль полилинии pts (в пикселях кадра)
  function tracks(pts, o) {
    o = o || {};
    const step = o.step || 46, sz = o.size || 11;
    let s = `<g class="${o.cls || "tg-tracks"}" fill="${o.color || "#3b4a60"}" opacity="${o.opacity || 0.85}">`;
    let side = 1, k = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len, ny = (x2 - x1) / len, ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      for (let t = 0; t < len; t += step) {
        const px = x1 + ((x2 - x1) * t) / len + nx * side * sz * 0.9, py = y1 + ((y2 - y1) * t) / len + ny * side * sz * 0.9;
        s += `<ellipse class="tg-tr" data-k="${k++}" cx="${f(px)}" cy="${f(py)}" rx="${f(sz * 1.25)}" ry="${f(sz * 0.62)}" transform="rotate(${f(ang)} ${f(px)} ${f(py)})"/>`;
        side = -side;
      }
    }
    return s + `</g>`;
  }

  // интерьер избы. o = {lamp: true|false, storm: true, paper: true, bunk: true}
  function interior(o) {
    o = o || {};
    let s = `<rect width="${W}" height="${H}" fill="#140e09"/>`;
    for (let i = 0; i < 26; i++) {
      const y = i * 74;
      s += `<rect x="-20" y="${y}" width="${W + 40}" height="76" rx="36" fill="url(#tg-logi)"/><path d="M0 ${y + 36} H${W}" stroke="#2a1c12" stroke-width="2" opacity=".5"/>`;
    }
    // окно справа: метель
    s += `<rect x="640" y="430" width="330" height="290" fill="#2b2016"/><rect class="tg-iwin" x="660" y="450" width="290" height="250" fill="url(#tg-storm)"/>`;
    // силуэт снаружи — только в стекле окна, за переплётом
    s += `<clipPath id="tg-winclip"><rect x="660" y="450" width="290" height="250"/></clipPath><g clip-path="url(#tg-winclip)"><g class="tg-face" opacity="0">${figure(800, 1010, 540, { shadow: false, color: "#05070b" })}</g></g>`;
    s += `<line x1="805" y1="450" x2="805" y2="700" stroke="#2b2016" stroke-width="14"/><line x1="660" y1="575" x2="950" y2="575" stroke="#2b2016" stroke-width="14"/>`;
    // дверь слева с бумажкой
    s += `<rect x="70" y="520" width="360" height="900" fill="#2a1d13"/><rect class="tg-idoor" x="90" y="540" width="320" height="880" fill="#4a3424"/>`;
    for (let i = 1; i < 6; i++) s += `<line x1="${90 + i * 53}" y1="540" x2="${90 + i * 53}" y2="1420" stroke="#33241a" stroke-width="5"/>`;
    s += `<rect x="370" y="960" width="70" height="26" rx="6" fill="#77695a"/><rect class="tg-bolt" x="330" y="964" width="90" height="18" rx="8" fill="#9b8c79"/>`;
    if (o.paper !== false) s += `<g transform="rotate(-3 250 760)"><rect x="160" y="640" width="180" height="230" fill="#d9cfb8"/><g stroke="#5a4e40" stroke-width="3" opacity=".7">${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="178" y1="${690 + i * 28}" x2="${300 - (i % 3) * 18}" y2="${690 + i * 28}"/>`).join("")}</g></g>`;
    // нары и печь
    if (o.bunk !== false) s += `<rect x="470" y="1300" width="640" height="60" fill="#5a3f28"/><rect x="470" y="1360" width="640" height="300" fill="#2a1d13"/><path d="M500 1300 q120 -70 300 -40 q140 20 260 -10 v60 h-560z" fill="#4c4a3e"/>`;
    s += `<rect x="-20" y="1460" width="400" height="460" fill="#1c140e"/><rect x="40" y="1520" width="260" height="200" rx="16" fill="#26272a"/><rect class="tg-fire" x="80" y="1600" width="180" height="70" rx="10" fill="#ff7a20" opacity=".8"/>`;
    s += `<ellipse class="tg-fireg" cx="170" cy="1640" rx="380" ry="260" fill="url(#tg-warm)" opacity=".35"/>`;
    // лампочка
    s += `<line x1="560" y1="0" x2="560" y2="300" stroke="#111" stroke-width="4"/><circle class="tg-bulb" cx="560" cy="318" r="26" fill="${o.lamp === false ? "#3a3530" : "#ffe2a8"}"/>`;
    s += `<ellipse class="tg-lampg" cx="560" cy="420" rx="700" ry="760" fill="url(#tg-warm)" opacity="${o.lamp === false ? 0 : 0.42}"/>`;
    s += `<rect class="tg-dark" width="${W}" height="${H}" fill="#000" opacity="${o.lamp === false ? 0.78 : 0}"/>`;
    return s;
  }

  // метель: n хлопьев, скорость/ветер; рисуется по времени таймлайна
  function snow(canvas, tl, o) {
    o = o || {};
    const ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
    const r = rng(o.seed || 11), n = o.n || 220;
    const fl = [];
    for (let i = 0; i < n; i++) {
      const z = r();
      fl.push({ x: r() * cw, y: r() * ch, z, sp: (0.25 + z * 0.9) * ch * (o.speed || 0.22), sw: r() * 6.28, sz: 1 + z * (o.size || 4.5) });
    }
    const wind = (o.wind || 0.3) * cw;
    const p = { t: 0 };
    const draw = () => {
      const t = p.t;
      ctx.clearRect(0, 0, cw, ch);
      for (const q of fl) {
        const y = (((q.y + q.sp * t) % ch) + ch) % ch;
        const x = (((q.x + wind * t * (0.4 + q.z) + Math.sin(q.sw + t * 1.7) * 18 * q.z) % cw) + cw) % cw;
        ctx.globalAlpha = 0.35 + q.z * 0.6;
        ctx.fillStyle = o.color || "#e6eefa";
        if (o.streak) {
          ctx.fillRect(x, y, q.sz * 0.7, q.sz * (2 + o.streak * q.z));
        } else {
          ctx.beginPath();
          ctx.arc(x, y, q.sz, 0, 6.283);
          ctx.fill();
        }
      }
    };
    draw();
    tl.fromTo(p, { t: 0 }, { t: o.dur, duration: o.dur, ease: "none", onUpdate: draw }, o.from || 0);
  }

  // фотоловушка: рамка-оверлей с временем (HTML)
  function trailcam(time, temp) {
    return `<div class="tg-tc"><span>TRAILCAM-02</span><span>${time}</span><span>${temp || "−31°C"}</span><span>◐ IR</span></div>`;
  }

  // заготовка сцены: время, поиск внутри сцены, таймлайн и показ плашек
  function scene(id, next) {
    const S = window.CUES[id], E = next ? window.CUES[next] : window.CUES._duration;
    const at = (k) => window.CUES[k] - S;
    const roots = document.querySelectorAll('[data-composition-id="' + id + '"]');
    const root = roots[roots.length - 1];
    const $ = (sel) => root.querySelector(sel);
    // id в сценах повторяются (#cam, #bg…) — цели твинов ищем только внутри своей сцены
    const q = (sel) => Array.from(root.querySelectorAll(Array.isArray(sel) ? sel.join(",") : sel));
    const tl = gsap.timeline({ paused: true });
    const show = (sel, a, b) => {
      sel = q(sel);
      tl.fromTo(sel, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out" }, a);
      if (b != null) tl.to(sel, { opacity: 0, duration: 0.2 }, b);
    };
    return { S, E, D: E - S, at, root, $, q, tl, show };
  }

  window.TAIGA = { scene,  W, H, rng, svg, sky, spruce, forest, ground, cabin, figure, tracks, interior, snow, trailcam };
})();
