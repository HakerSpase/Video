// «Реальные дела»: общие помощники сцен — тайминги, 2D-иллюстрации (SVG), стиль досье.
(function () {
  const W = 1080, H = 1920;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

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
    const stamp = (sel, a) => {
      tl.fromTo(q(sel), { opacity: 0, scale: 2.4, rotation: -14 },
        { opacity: 1, scale: 1, rotation: -6, duration: 0.22, ease: "power4.in" }, a);
    };
    // --- динамика: всё, что держит внимание ---
    // #cam оборачиваем в .cs-shot: на нём «склейки» (резкая смена плана), а толчки/тряска — на всём кадре
    const cam = root.querySelector("#cam");
    let shot = null;
    if (cam) {
      shot = document.createElement("div");
      shot.className = "cs-shot";
      cam.parentNode.insertBefore(shot, cam);
      shot.appendChild(cam);
    }
    const fx = document.createElement("div");
    fx.className = "cs-fx";
    fx.innerHTML = '<div class="cs-flash"></div><div class="cs-prog"><i></i></div>';
    root.appendChild(fx);
    const kick = root; // толчки двигают весь кадр
    // полоса прогресса дела — через все сцены
    const dur = window.CUES._duration;
    tl.fromTo(fx.querySelector(".cs-prog i"), { scaleX: S / dur }, { scaleX: E / dur, duration: E - S, ease: "none" }, 0);
    const punch = (t, amt = 0.06) => {
      tl.fromTo(kick, { scale: 1 + amt, rotation: (Math.random() - 0.5) * 0 }, { scale: 1, duration: 0.35, ease: "power3.out" }, t);
    };
    const shake = (t, d = 0.5, a = 14) => {
      const n = Math.round(d / 0.05);
      for (let i = 0; i < n; i++) {
        const k = 1 - i / n;
        tl.set(kick, { x: ((i * 7919) % 13 - 6) / 6 * a * k, y: ((i * 104729) % 11 - 5) / 5 * a * k }, t + i * 0.05);
      }
      tl.set(kick, { x: 0, y: 0 }, t + d);
    };
    const flash = (t, color = "#fff", o = 0.7) => {
      const f = fx.querySelector(".cs-flash");
      tl.set(f, { background: color }, t);
      tl.fromTo(f, { opacity: o }, { opacity: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, t);
    };
    // резкая смена плана: камера мгновенно встаёт в новую точку
    const cut = (t, p, white = true) => {
      if (!shot) return;
      tl.set(shot, Object.assign({ scale: 1, x: 0, y: 0, rotation: 0, transformOrigin: "50% 50%" }, p), t);
      if (white) flash(t, "#fff", 0.35);
    };
    // огромное слово/число во весь экран на долю секунды
    let slamN = 0;
    const slam = (text, t, o = {}) => {
      const el = document.createElement("div");
      el.className = "cs-slam";
      el.innerHTML = text;
      el.style.top = (o.top || 560) + "px";
      el.style.fontSize = (o.size || 230) + "px";
      el.style.color = o.color || "#fff";
      if (o.stroke) el.classList.add("stroke");
      fx.appendChild(el);
      const hold = o.hold || 0.9;
      tl.fromTo(el, { opacity: 0, scale: 2.2 }, { opacity: 1, scale: 1, duration: 0.14, ease: "power4.in" }, t);
      tl.to(el, { scale: 1.06, duration: hold, ease: "none" }, t + 0.14);
      tl.to(el, { opacity: 0, scale: 1.25, duration: 0.15 }, t + 0.14 + hold);
      punch(t + 0.14, o.punch || 0.05);
      slamN++;
    };
    return { S, E, D: E - S, at, root, $, q, tl, show, stamp, punch, shake, flash, cut, slam, shot };
  }

  const svg = (inner, w = W, h = H) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="position:absolute;inset:0;overflow:visible">${inner}</svg>`;

  // силуэт человека без лица; x,y — ступни, s — масштаб (рост ≈ 360·s)
  function figure(x, y, s = 1, fill = "#05070b", opts = {}) {
    const st = opts.step || 0; // 0..1 фаза шага
    const a = Math.sin(st * Math.PI * 2) * 16;
    return `<g transform="translate(${x},${y}) scale(${s})" ${opts.attrs || ""}>
      <path d="M-14,-150 L-22,-6 L-8,-4 L0,-120 L8,-4 L22,-6 L14,-150 Z" fill="${fill}" transform="rotate(0)"/>
      <path d="M-14,-150 L${-20 + a},-6 L${-8 + a},-4 L0,-130 Z" fill="${fill}"/>
      <path d="M14,-150 L${20 - a},-6 L${8 - a},-4 L0,-130 Z" fill="${fill}"/>
      <path d="M-34,-286 Q-40,-180 -30,-140 L30,-140 Q40,-180 34,-286 Q0,-300 -34,-286 Z" fill="${fill}"/>
      <path d="M-34,-280 L-44,-170 L-34,-166 L-26,-260 Z M34,-280 L44,-170 L34,-166 L26,-260 Z" fill="${fill}"/>
      <rect x="-9" y="-306" width="18" height="24" fill="${fill}"/>
      <ellipse cx="0" cy="-334" rx="25" ry="31" fill="${fill}"/>
      ${opts.bag ? `<rect x="40" y="-176" width="60" height="44" rx="4" fill="${fill}"/><path d="M58,-176 L58,-186 L82,-186 L82,-176" stroke="${fill}" stroke-width="5" fill="none"/>` : ""}
      ${opts.hat ? `<path d="M-30,-350 Q0,-372 30,-350 L46,-342 L-36,-342 Z" fill="${fill}"/>` : ""}
      ${opts.band ? `<rect x="-44" y="-262" width="16" height="22" fill="${opts.band}"/>` : ""}
      ${opts.cap ? `<path d="M-34,-350 Q0,-382 34,-350 L40,-344 L-40,-344 Z" fill="${fill}"/><rect x="-44" y="-348" width="88" height="7" fill="${fill}"/>` : ""}
    </g>`;
  }

  // ночной лиственный лес: стволы и кроны слоями
  function trees(seed, y0, n, opt = {}) {
    const r = rng(seed), col = opt.color || "#0b1220", out = [];
    for (let i = 0; i < n; i++) {
      const x = -60 + (W + 120) * (i + r() * 0.8) / n, h = (opt.h || 700) * (0.75 + r() * 0.5), w = 14 + r() * 18;
      out.push(`<path d="M${x - w / 2},${y0} L${x - w / 3},${y0 - h} L${x + w / 3},${y0 - h} L${x + w / 2},${y0} Z" fill="${col}"/>`);
      for (let k = 0; k < 4; k++) {
        const bx = x + (r() - 0.5) * 40, by = y0 - h * (0.55 + r() * 0.5), rr = 70 + r() * 110;
        out.push(`<ellipse cx="${bx}" cy="${by}" rx="${rr}" ry="${rr * 0.8}" fill="${col}"/>`);
      }
      out.push(`<path d="M${x},${y0 - h * 0.5} L${x + (r() - 0.5) * 220},${y0 - h * 0.8}" stroke="${col}" stroke-width="${w / 2}"/>`);
    }
    return out.join("");
  }

  // шахматная доска (div-сетка): клетки получают классы .c0..c63
  function board(el) {
    let h = "";
    for (let i = 0; i < 64; i++) {
      const dark = ((i >> 3) + (i & 7)) % 2 === 1;
      h += `<div class="sq ${dark ? "d" : "l"} c${i}"><span class="dt"></span></div>`;
    }
    el.innerHTML = h;
    return el;
  }

  // какие клетки «заняты»: 61 из 64, порядок заполнения перемешан
  function boardOrder(seed = 7) {
    const r = rng(seed), idx = Array.from({ length: 64 }, (_, i) => i);
    for (let i = 63; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return { filled: idx.slice(0, 61), empty: idx.slice(61) };
  }

  // стиль доски, досье, CCTV — один раз на документ
  if (!document.getElementById("case-style")) {
    const st = document.createElement("style");
    st.id = "case-style";
    st.textContent = `
      .cs-board { position:absolute; width:880px; height:880px; display:grid; grid-template-columns:repeat(8,1fr); grid-template-rows:repeat(8,1fr);
        border:34px solid #2a1810; box-shadow: 0 0 0 4px #4a2c1a, 0 60px 120px rgba(0,0,0,0.85); box-sizing: content-box;
        background:#2a1810; }
      .cs-board .sq { position:relative; display:flex; align-items:center; justify-content:center; }
      .cs-board .sq.l { background: linear-gradient(135deg,#c9ab7c,#b4935f); }
      .cs-board .sq.d { background: linear-gradient(135deg,#5a3a22,#43291a); }
      .cs-board .dt { opacity:0; width:84%; height:58%; background:#ece6d6; border-radius:3px; transform:rotate(-3deg);
        box-shadow:0 4px 8px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center;
        font-family:"JetBrains Mono",monospace; font-weight:800; font-size:21px; color:#7a0c14; letter-spacing:-0.02em; }
      .cs-board .sq.empty::after { content:""; position:absolute; inset:6px; border:4px solid rgba(255,255,255,0); border-radius:4px; }
      .cs-file { position:absolute; background:#d9cfb8; color:#1b1a17; border-radius:6px; box-shadow:0 40px 80px rgba(0,0,0,0.8);
        font-family:"JetBrains Mono",monospace; }
      .cs-stamp { position:absolute; border:8px solid #c4121f; color:#c4121f; font-family:"JetBrains Mono",monospace; font-weight:800;
        padding:10px 26px; border-radius:10px; letter-spacing:0.06em; text-transform:uppercase; mix-blend-mode:multiply; opacity:0; }
      .cs-stamp.on-dark { mix-blend-mode:normal; color:#ff2e3e; border-color:#ff2e3e; background:rgba(20,0,4,0.55); }
      .cs-tag { position:absolute; right:40px; top:180px; font-family:"JetBrains Mono",monospace; font-size:22px; font-weight:700;
        color:rgba(255,255,255,0.55); letter-spacing:0.18em; border:2px solid rgba(255,255,255,0.3); padding:6px 12px; border-radius:6px; }
      .cs-series { position:absolute; left:50px; top:180px; font-family:"JetBrains Mono",monospace; font-weight:800; font-size:26px; letter-spacing:0.12em; color:#ffd23f; }
      .cs-series b { color:#fff; }
      .cs-quote { position:absolute; left:70px; right:70px; background:rgba(6,8,12,0.84); border-left:8px solid #ff2e3e; padding:26px 32px; border-radius:10px;
        font-family:"JetBrains Mono",monospace; opacity:0; }
      .cs-quote small { display:block; font-size:24px; color:#ff6b74; font-weight:800; letter-spacing:0.1em; }
      .cs-quote b { display:block; font-size:44px; line-height:1.25; margin-top:10px; color:#fff; }
      .cs-shot { position:absolute; inset:0; }
      .cs-fx { position:absolute; inset:0; pointer-events:none; z-index:40; }
      .cs-flash { position:absolute; inset:-60px; opacity:0; background:#fff; }
      .cs-prog { position:absolute; left:50px; right:50px; top:160px; height:6px; background:rgba(255,255,255,0.14); border-radius:3px; overflow:hidden; }
      .cs-prog i { position:absolute; inset:0; background:#ff2e3e; transform-origin:0 50%; box-shadow:0 0 10px #ff2e3e; }
      .cs-slam { position:absolute; left:-100px; right:-100px; text-align:center; font-family:Montserrat,sans-serif; font-weight:900; line-height:0.9;
        letter-spacing:-0.04em; text-transform:uppercase; opacity:0; text-shadow:0 20px 60px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8); }
      .cs-slam.stroke { color:transparent !important; -webkit-text-stroke:6px #ff2e3e; }
      .cs-big { position:absolute; left:0; right:0; text-align:center; font-family:Montserrat,sans-serif; font-weight:900; color:#fff; opacity:0; }
    `;
    document.head.appendChild(st);
  }

  // женский силуэт: длинные волосы, пальто-трапеция
  function woman(x, y, s = 1, fill = "#05070b", opts = {}) {
    const a = Math.sin((opts.step || 0) * Math.PI * 2) * 12;
    return `<g transform="translate(${x},${y}) scale(${s})">
      <path d="M-8,-110 L${-14 + a},-4 L${-4 + a},-2 L0,-100 Z M8,-110 L${14 - a},-4 L${4 - a},-2 L0,-100 Z" fill="${fill}"/>
      <path d="M-28,-282 Q-36,-200 -48,-104 L48,-104 Q36,-200 28,-282 Q0,-296 -28,-282 Z" fill="${fill}"/>
      <path d="M-28,-276 L-38,-170 L-29,-166 L-22,-258 Z M28,-276 L38,-170 L29,-166 L22,-258 Z" fill="${fill}"/>
      <rect x="-8" y="-300" width="16" height="22" fill="${fill}"/>
      <ellipse cx="0" cy="-326" rx="22" ry="28" fill="${fill}"/>
      <path d="M-24,-334 Q-30,-280 -22,-262 L22,-262 Q30,-280 24,-334 Q0,-366 -24,-334 Z" fill="${fill}"/>
    </g>`;
  }

  // «Нива» сбоку; x,y — точка на земле под центром, s — масштаб (длина ≈ 400·s), lights — фары
  function niva(x, y, s = 1, opts = {}) {
    const b = opts.body || "#1a1f27", d = opts.dark || "#07090c", f = opts.flip ? -1 : 1;
    return `<g transform="translate(${x},${y}) scale(${s * f},${s})">
      <path d="M-200,-40 L-200,-110 L-170,-118 L-120,-190 L90,-196 L130,-124 L196,-112 L204,-60 L200,-40 Z" fill="${b}"/>
      <path d="M-112,-178 L-74,-180 L-74,-126 L-150,-122 Z M-62,-182 L40,-184 L40,-128 L-62,-126 Z M52,-184 L84,-184 L116,-128 L52,-128 Z" fill="#2c3646" opacity="0.9"/>
      ${opts.driver ? `<g opacity="0.95"><ellipse cx="-20" cy="-148" rx="17" ry="21" fill="${d}"/><path d="M-44,-160 Q-20,-186 4,-160 L8,-156 L-48,-156 Z" fill="${d}"/><rect x="-50" y="-160" width="62" height="6" fill="${d}"/><path d="M-46,-126 Q-20,-138 6,-126 L6,-122 L-46,-122 Z" fill="${d}"/></g>` : ""}
      <path d="M-200,-60 L204,-60" stroke="#0d1016" stroke-width="5"/>
      <circle cx="-120" cy="-40" r="44" fill="${d}"/><circle cx="-120" cy="-40" r="20" fill="#3a4250"/>
      <circle cx="120" cy="-40" r="44" fill="${d}"/><circle cx="120" cy="-40" r="20" fill="#3a4250"/>
      <rect x="190" y="-104" width="16" height="18" rx="3" fill="${opts.lights ? "#fff6d8" : "#5a5f66"}"/>
      <rect x="-206" y="-104" width="10" height="20" rx="2" fill="#b0121c"/>
    </g>`;
  }

  // ряд панельных пятиэтажек с редкими окнами
  function blocks(seed, y0, opts = {}) {
    const r = rng(seed); let o = "";
    let x = -40;
    while (x < W + 40) {
      const w = 220 + r() * 160, h = (opts.h || 420) * (0.8 + r() * 0.4);
      o += `<rect x="${x}" y="${y0 - h}" width="${w}" height="${h}" fill="${opts.color || "#0d1320"}"/>`;
      for (let fy = y0 - h + 30; fy < y0 - 40; fy += 62) for (let fx = x + 20; fx < x + w - 30; fx += 44) {
        if (r() < (opts.lit || 0.08)) o += `<rect x="${fx}" y="${fy}" width="22" height="30" fill="${r() < 0.7 ? "#ffcf7a" : "#9fc2ff"}" opacity="${0.5 + r() * 0.4}"/>`;
      }
      x += w + 20 + r() * 40;
    }
    return o;
  }

  // фонарь со световым конусом
  function lamp(x, y, h = 520) {
    return `<rect x="${x - 5}" y="${y - h}" width="10" height="${h}" fill="#05070b"/><path d="M${x - 5},${y - h} L${x + 60},${y - h - 10} L${x + 60},${y - h + 2} Z" fill="#05070b"/>
      <path d="M${x + 50},${y - h + 4} L${x - 110},${y} L${x + 210},${y} Z" fill="url(#cone)" opacity="0.55"/>
      <ellipse cx="${x + 50}" cy="${y}" rx="170" ry="26" fill="#ffcf7a" opacity="0.12"/>
      <circle cx="${x + 54}" cy="${y - h + 6}" r="9" fill="#fff1c9"/>`;
  }
  const coneDef = `<linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd38a" stop-opacity="0.7"/><stop offset="1" stop-color="#ffd38a" stop-opacity="0.05"/></linearGradient>`;

  // электричка сбоку: x — левый край, y — уровень рельсов, n — вагонов
  function train(x, y, n = 3, s = 1) {
    let o = `<g transform="translate(${x},${y}) scale(${s})">`;
    for (let k = 0; k < n; k++) {
      const X = k * 560;
      o += `<rect x="${X}" y="-300" width="550" height="270" rx="18" fill="#1f4a35"/><rect x="${X}" y="-120" width="550" height="16" fill="#c9a43a"/>`;
      for (let w = 0; w < 6; w++) o += `<rect x="${X + 30 + w * 86}" y="-260" width="62" height="80" rx="6" fill="#d9c98f" opacity="0.75"/>`;
      o += `<rect x="${X + 250}" y="-270" width="50" height="230" fill="#16352a"/>`;
      o += `<circle cx="${X + 90}" cy="-22" r="22" fill="#0b0d10"/><circle cx="${X + 460}" cy="-22" r="22" fill="#0b0d10"/>`;
    }
    return o + `</g>`;
  }

  window.CASE = { W, H, rng, scene, svg, figure, woman, train, niva, blocks, lamp, coneDef, trees, board, boardOrder };
})();
