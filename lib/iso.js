// Мини-набор для изометрических 3D-сцен на CSS (preserve-3d).
// Геометрия статична и строится один раз при загрузке — анимируют её таймлайны сцен.
// Координаты пола: x вправо, y «вглубь» плана, z вверх (px).
window.ISO = (function () {
  function el(parent, cls, css, id) {
    const d = document.createElement("div");
    if (id) d.id = id;
    d.className = cls || "";
    Object.assign(d.style, { position: "absolute", transformOrigin: "0 0" }, css || {});
    parent.appendChild(d);
    return d;
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
    return "rgb(" + c.join(",") + ")";
  }
  // вертикальная плоскость стены от (x1,y1) до (x2,y2), высота h
  function wall(parent, x1, y1, x2, y2, h, color, id) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const k = 0.62 + 0.38 * Math.abs(Math.cos(((ang + 35) * Math.PI) / 180));
    const g = el(parent, "iso-wall", { left: x1 + "px", top: y1 + "px", width: len + "px", height: "0px",
      transformStyle: "preserve-3d", transform: "rotateZ(" + ang + "deg)" }, id);
    el(g, "iso-wall-face", { left: 0, top: 0, width: len + "px", height: h + "px",
      background: "linear-gradient(180deg," + shade(color, k * 1.15) + "," + shade(color, k * 0.8) + ")",
      transform: "rotateX(90deg)", backfaceVisibility: "visible", outline: "1px solid rgba(0,0,0,0.25)" });
    // верхний торец стены — светлая кромка, как на архитектурных макетах
    el(g, "iso-wall-cap", { left: 0, top: "-5px", width: len + "px", height: "10px", background: shade(color, 1.55),
      transform: "translateZ(" + h + "px)" });
    return g;
  }
  // параллелепипед: x,y — угол на полу, w×d — размер, h — высота, z — подъём над полом
  function box(parent, o) {
    const z = o.z || 0, c = o.color || "#556";
    const g = el(parent, "iso-box", { left: o.x + "px", top: o.y + "px", width: o.w + "px", height: o.d + "px",
      transformStyle: "preserve-3d", transform: "translateZ(" + z + "px)" }, o.id);
    el(g, "", { left: 0, top: 0, width: o.w + "px", height: o.d + "px", background: o.top || shade(c, 1.25),
      transform: "translateZ(" + o.h + "px)", borderRadius: (o.r || 0) + "px" });
    el(g, "", { left: 0, top: o.d + "px", width: o.w + "px", height: o.h + "px", background: shade(c, 0.95),
      transform: "rotateX(90deg)" });
    el(g, "", { left: o.w + "px", top: 0, width: o.d + "px", height: o.h + "px", background: shade(c, 0.7),
      transform: "rotateZ(90deg) rotateX(90deg)" });
    el(g, "", { left: 0, top: 0, width: o.w + "px", height: o.h + "px", background: shade(c, 0.8),
      transform: "rotateX(90deg)" });
    el(g, "", { left: 0, top: 0, width: o.d + "px", height: o.h + "px", background: shade(c, 0.6),
      transform: "rotateZ(90deg) rotateX(90deg)" });
    return g;
  }
  // плоская метка на полу/в воздухе: вертикальный «билборд», всегда смотрит в камеру
  function flat(parent, o) {
    return el(parent, o.cls || "", Object.assign({ left: o.x + "px", top: o.y + "px",
      transform: "translateZ(" + (o.z || 0) + "px)" }, o.css || {}), o.id);
  }

  // Типовая однушка эпизода (план 640×820). Возвращает узлы, которые анимируют сцены.
  function flat47(floor, opt) {
    opt = opt || {};
    const H = opt.h || 96, WC = opt.wall || "#c9d3e6";
    const F = (x, y, w, d, bg, id) => el(floor, "iso-floor", { left: x + "px", top: y + "px", width: w + "px", height: d + "px", background: bg }, id);
    F(0, 0, 640, 420, "repeating-linear-gradient(90deg,#3b3326 0 38px,#342d21 38px 40px)", opt.p + "-f-room");
    F(320, 420, 320, 400, "repeating-conic-gradient(#2a3140 0 25%,#232a37 0 50%) 0 0/40px 40px", opt.p + "-f-kit");
    F(0, 420, 200, 200, "repeating-conic-gradient(#2c3a48 0 25%,#253240 0 50%) 0 0/30px 30px", opt.p + "-f-bath");
    F(0, 620, 320, 200, "#2b2621", opt.p + "-f-hall");
    F(200, 420, 120, 200, "#2b2621");
    const n = {};
    // наружные стены (с проёмами окон: окно — низкая стена + стекло)
    wall(floor, 0, 0, 120, 0, H, WC);
    wall(floor, 300, 0, 380, 0, H, WC);
    wall(floor, 560, 0, 640, 0, H, WC);
    wall(floor, 640, 0, 640, 520, H, WC);
    wall(floor, 640, 700, 640, 820, H, WC);
    wall(floor, 0, 0, 0, 820, H, WC);
    wall(floor, 160, 820, 640, 820, H * 0.18, WC);
    wall(floor, 0, 820, 50, 820, H * 0.18, WC);
    // окна
    n.win = [];
    [[120, 0, 300, 0], [380, 0, 560, 0], [640, 520, 640, 700]].forEach((s, i) => {
      wall(floor, s[0], s[1], s[2], s[3], H * 0.32, WC);
      const g = wall(floor, s[0], s[1], s[2], s[3], 0, WC, opt.p + "-win" + i);
      const glass = el(g, "iso-glass", { left: 0, top: 0, width: Math.hypot(s[2] - s[0], s[3] - s[1]) + "px", height: H * 0.62 + "px",
        background: "linear-gradient(180deg,rgba(150,190,255,0.55),rgba(80,120,200,0.25))",
        transform: "translateZ(" + H * 0.32 + "px) rotateX(90deg)", transformOrigin: "0 0", outline: "2px solid rgba(200,220,255,0.6)" });
      n.win.push(glass);
    });
    // внутренние стены
    wall(floor, 0, 420, 200, 420, H, WC);
    wall(floor, 320, 420, 380, 420, H, WC);
    wall(floor, 470, 420, 640, 420, H, WC);
    wall(floor, 200, 420, 200, 560, H, WC);
    wall(floor, 0, 620, 200, 620, H, WC);
    wall(floor, 320, 500, 320, 820, H, WC);
    // входная дверь (проём 50..160 в нижней стене) — сама дверь
    n.door = box(floor, { x: 50, y: 812, w: 110, d: 10, h: H * 0.9, color: "#6b4a2e", id: opt.p + "-door" });
    // антресоль над дверью — ящик под потолком прихожей
    n.antr = box(floor, { x: 30, y: 740, w: 160, d: 80, h: 26, z: H * 0.72, color: "#8a7a62", id: opt.p + "-antr" });
    // мебель
    box(floor, { x: 380, y: 40, w: 220, d: 150, h: 26, color: "#5b6a86" }); // кровать
    box(floor, { x: 380, y: 40, w: 220, d: 34, h: 40, color: "#7d8db0" });
    box(floor, { x: 30, y: 30, w: 70, d: 260, h: 110, color: "#4a3d2d" }); // шкаф
    box(floor, { x: 470, y: 600, w: 120, d: 120, h: 34, color: "#5a4632" }); // стол
    box(floor, { x: 560, y: 430, w: 70, d: 160, h: 50, color: "#8d96a6" }); // кухонный гарнитур
    box(floor, { x: 20, y: 440, w: 160, d: 70, h: 30, color: "#d9e1ea", r: 8 }); // ванна
    box(floor, { x: 140, y: 30, w: 140, d: 70, h: 30, color: "#3d4a5f" }); // тумба/ТВ
    return n;
  }
  return { el, wall, box, flat, flat47, shade };
})();
