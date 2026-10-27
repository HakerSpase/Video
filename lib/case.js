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
    return { S, E, D: E - S, at, root, $, q, tl, show, stamp };
  }

  const svg = (inner, w = W, h = H) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="position:absolute;inset:0">${inner}</svg>`;

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
      .cs-big { position:absolute; left:0; right:0; text-align:center; font-family:Montserrat,sans-serif; font-weight:900; color:#fff; opacity:0; }
    `;
    document.head.appendChild(st);
  }

  window.CASE = { W, H, rng, scene, svg, figure, trees, board, boardOrder };
})();
