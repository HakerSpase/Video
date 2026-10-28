// PHONEUI — телефон в руке/держателе поверх 3D: приложение каршеринга, звонок, журнал, навигатор.
// const P = PHONEUI.make(rootEl, { top: 260 }); P.screen("app" | "call" | "log" | "nav"); P.el — для анимации.
(function () {
  const CSS = `
  .pu { position:absolute; left:50%; width:470px; height:900px; margin-left:-235px; border-radius:58px; background:#0b0c0f;
    box-shadow: 0 0 0 3px #2a2c31, 0 50px 120px rgba(0,0,0,0.85), 0 0 80px rgba(80,140,255,0.12); padding:16px; opacity:0; }
  .pu .scr { position:relative; width:100%; height:100%; border-radius:44px; overflow:hidden; background:#0f1218; font-family: Montserrat, sans-serif; color:#fff; }
  .pu .isl { position:absolute; left:50%; top:14px; width:120px; height:32px; margin-left:-60px; border-radius:20px; background:#000; z-index:5; }
  .pu .sb { position:absolute; left:28px; right:28px; top:18px; display:flex; justify-content:space-between; font-weight:700; font-size:20px; z-index:4; }
  .pu .pg { position:absolute; inset:0; opacity:0; }
  .pu .map { position:absolute; inset:0; background:#1b2230; }
  .pu .map svg { position:absolute; inset:0; }
  .pu .card { position:absolute; left:14px; right:14px; bottom:14px; background:#fff; color:#111; border-radius:30px; padding:24px 24px 22px; }
  .pu .card h4 { margin:0; font-size:30px; font-weight:800; }
  .pu .card .sub { font-size:19px; color:#666; margin-top:6px; font-weight:600; }
  .pu .plate { display:inline-flex; align-items:center; gap:6px; margin-top:14px; border:3px solid #111; border-radius:8px; padding:2px 10px; font-family:"JetBrains Mono",monospace; font-weight:800; font-size:24px; }
  .pu .plate i { font-style:normal; font-size:15px; border-left:2px solid #111; padding-left:6px; line-height:1; }
  .pu .row { display:flex; justify-content:space-between; margin-top:16px; font-size:19px; font-weight:700; color:#333; }
  .pu .row b { color:#111; }
  .pu .row.warn b { color:#e0182b; }
  .pu .btn { margin-top:18px; height:76px; border-radius:22px; background:#2bd46a; color:#06290f; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:900; }
  .pu .btn.done { background:#e9f9ef; color:#1b8f45; }
  .pu .call { background: radial-gradient(120% 80% at 50% 20%, #24324a, #0b0f17); }
  .pu .call .who { position:absolute; left:0; right:0; top:170px; text-align:center; }
  .pu .call .av { width:150px; height:150px; border-radius:50%; margin:0 auto; background:#2bd46a; display:flex; align-items:center; justify-content:center; font-size:64px; font-weight:900; color:#06290f; }
  .pu .call h3 { margin:26px 0 0; font-size:38px; font-weight:800; }
  .pu .call .st { margin-top:10px; font-size:22px; color:#9fb4d6; font-family:"JetBrains Mono",monospace; }
  .pu .call .wave { position:absolute; left:40px; right:40px; top:560px; height:80px; display:flex; align-items:center; justify-content:center; gap:7px; }
  .pu .call .wave i { width:8px; border-radius:4px; background:#2bd46a; height:20px; }
  .pu .call .end { position:absolute; left:50%; bottom:70px; width:110px; height:110px; margin-left:-55px; border-radius:50%; background:#e0182b; }
  .pu .log { background:#0f1218; padding:90px 26px 0; }
  .pu .log h5 { margin:0 0 18px; font-size:26px; font-weight:800; }
  .pu .log .e { display:flex; gap:16px; padding:18px 0; border-bottom:1px solid rgba(255,255,255,0.08); font-size:22px; opacity:0; }
  .pu .log .e span { font-family:"JetBrains Mono",monospace; color:#9fb4d6; min-width:84px; }
  .pu .log .e b { font-weight:700; }
  .pu .log .e.r b { color:#ff4a58; }
  .pu .nav { background:#0e1726; }
  .pu .nav .hd { position:absolute; left:0; right:0; top:60px; padding:22px 26px; background:rgba(8,14,24,0.92); display:flex; justify-content:space-between; align-items:baseline; z-index:3; }
  .pu .nav .hd b { font-size:40px; }
  .pu .nav .hd span { font-size:36px; font-weight:900; color:#5be38a; }
  .pu .nav .q { position:absolute; left:20px; right:20px; top:70px; height:76px; border-radius:20px; background:#fff; color:#111; font-size:30px; font-weight:700; display:flex; align-items:center; padding:0 22px; z-index:3; }
  `;
  if (!document.getElementById("phoneui-style")) {
    const st = document.createElement("style");
    st.id = "phoneui-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function mapSVG(route) {
    let g = `<svg viewBox="0 0 440 870" width="440" height="870"><rect width="440" height="870" fill="#1b2230"/>`;
    for (let k = 0; k < 12; k++) g += `<path d="M${-60 + k * 50},0 L${k * 50 + 80},870" stroke="#273246" stroke-width="${k % 3 ? 8 : 16}"/>`;
    for (let k = 0; k < 14; k++) g += `<path d="M0,${k * 70} L440,${k * 70 + 40}" stroke="#273246" stroke-width="${k % 4 ? 8 : 14}"/>`;
    g += `<rect x="110" y="250" width="180" height="120" rx="8" fill="#232c3d"/><text x="200" y="318" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="18" fill="#7f8ca3">ГИПЕРМАРКЕТ</text>`;
    if (route) g += `<path d="M215,450 L215,560 L320,640 L320,780 L400,840" stroke="#3d9bff" stroke-width="12" fill="none" stroke-linejoin="round" stroke-linecap="round"/><circle cx="400" cy="840" r="12" fill="#3d9bff"/>`;
    g += `<g><circle cx="215" cy="430" r="30" fill="#2bd46a" opacity="0.25"/><circle cx="215" cy="430" r="15" fill="#2bd46a" stroke="#fff" stroke-width="4"/></g></svg>`;
    return g;
  }

  function make(root, opt = {}) {
    const el = document.createElement("div");
    el.className = "pu";
    el.style.top = (opt.top || 250) + "px";
    el.innerHTML = `<div class="scr"><div class="isl"></div><div class="sb"><span>01:00</span><span>▮▮▮ 34%</span></div>
      <div class="pg" data-p="app"><div class="map">${mapSVG(false)}</div>
        <div class="card"><h4>Skoda Rapid</h4><div class="sub">Белая · 30 м от вас</div>
          <div class="plate">А 417 КХ <i>77<br>RUS</i></div>
          <div class="row"><span>В салоне</span><b class="t">+22°</b></div>
          <div class="row warn"><span>На парковке</span><b>с 13:05</b></div>
          <div class="btn">ОТКРЫТЬ</div></div></div>
      <div class="pg call" data-p="call"><div class="who"><div class="av">П</div><h3>Поддержка</h3><div class="st">входящий вызов</div></div>
        <div class="wave">${Array.from({ length: 22 }, () => "<i></i>").join("")}</div><div class="end"></div></div>
      <div class="pg log" data-p="log"><h5>Журнал машины</h5>
        <div class="e"><span>00:21</span><b>Открыта без аренды</b></div>
        <div class="e"><span>00:21</span><b>Задняя левая дверь — открыта</b></div>
        <div class="e r"><span>—</span><b>Задняя левая дверь — больше не открывалась</b></div>
        <div class="e"><span>01:02</span><b>Аренда · водитель: вы</b></div></div>
      <div class="pg nav" data-p="nav"><div class="map">${mapSVG(true)}</div><div class="q">Куда едем?</div><div class="hd"><b>Дом</b><span>11 мин</span></div></div>
    </div>`;
    root.appendChild(el);
    const pages = {};
    el.querySelectorAll(".pg").forEach((p) => (pages[p.dataset.p] = p));
    return { el, pages, $: (s) => el.querySelector(s), $$: (s) => Array.from(el.querySelectorAll(s)) };
  }

  window.PHONEUI = { make };
})();
