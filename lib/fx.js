// Кинематографические эффекты для сцен. Всё детерминировано: случайность — из сида,
// кадр — функция времени таймлайна (так рендер совпадает с превью кадр в кадр).
window.FX = (function () {
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // «Ручная камера»: плавный дрейф и лёгкий крен обёртки.
  function handheld(tl, sel, start, dur, o) {
    o = o || {};
    const r = rng(o.seed || 7), amp = o.amp == null ? 7 : o.amp, rot = o.rot == null ? 0.3 : o.rot, step = o.step || 1.1;
    let t = 0;
    while (t < dur - 0.05) {
      const d = Math.min(step * (0.7 + r() * 0.6), dur - t);
      tl.to(sel, { x: (r() * 2 - 1) * amp, y: (r() * 2 - 1) * amp, rotation: (r() * 2 - 1) * rot, duration: d, ease: "sine.inOut" }, start + t);
      t += d;
    }
  }

  // Рисование на canvas как функция времени: draw(ctx, t, w, h).
  function painter(tl, canvas, start, dur, draw) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const st = { t: 0 };
    draw(ctx, 0, w, h);
    tl.fromTo(st, { t: 0 }, { t: dur, duration: dur, ease: "none", onUpdate: () => draw(ctx, st.t, w, h) }, start);
  }

  // Пыль в луче света: мелкие частицы, медленно плывут и мерцают.
  // o.mask = {x, y, r} — видны только внутри светового пятна.
  function dust(tl, canvas, start, dur, o) {
    o = o || {};
    const r = rng(o.seed || 11), n = o.count || 140, col = o.color || "255,244,220";
    const ps = Array.from({ length: n }, () => ({
      x: r(), y: r(), z: 0.3 + r() * 0.7, vx: (r() - 0.5) * 0.012, vy: -0.004 - r() * 0.01, ph: r() * 6.28, f: 0.6 + r() * 1.6,
    }));
    painter(tl, canvas, start, dur, (ctx, t, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        const x = (((p.x + p.vx * t + Math.sin(t * 0.4 + p.ph) * 0.01) % 1) + 1) % 1 * w;
        const y = (((p.y + p.vy * t) % 1) + 1) % 1 * h;
        let a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * p.f + p.ph))) * p.z * (o.alpha || 0.8);
        if (o.mask) {
          const d = Math.hypot(x - o.mask.x, y - o.mask.y) / o.mask.r;
          a *= Math.max(0, 1 - d * d);
        }
        if (a < 0.01) continue;
        const rad = 1 + p.z * (o.size || 2.4);
        ctx.fillStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, 6.283);
        ctx.fill();
      }
    });
  }

  // Боке на переднем плане: крупные размытые пятна — ощущение глубины резкости.
  function bokeh(tl, canvas, start, dur, o) {
    o = o || {};
    const r = rng(o.seed || 23), n = o.count || 9, cols = o.colors || ["255,200,140", "160,190,255"];
    const ps = Array.from({ length: n }, (_, i) => ({
      x: r(), y: r(), s: 60 + r() * 140, vx: (r() - 0.5) * 0.02, c: cols[i % cols.length], a: 0.05 + r() * 0.12, ph: r() * 6.28,
    }));
    painter(tl, canvas, start, dur, (ctx, t, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        const x = (((p.x + p.vx * t) % 1) + 1) % 1 * w, y = p.y * h + Math.sin(t * 0.3 + p.ph) * 20;
        const g = ctx.createRadialGradient(x, y, 0, x, y, p.s);
        const a = p.a * (0.8 + 0.2 * Math.sin(t * 0.7 + p.ph));
        g.addColorStop(0, "rgba(" + p.c + "," + a + ")");
        g.addColorStop(0.7, "rgba(" + p.c + "," + a * 0.6 + ")");
        g.addColorStop(1, "rgba(" + p.c + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, p.s, 0, 6.283);
        ctx.fill();
      }
    });
  }

  // Дождь: косые штрихи разной глубины.
  function rain(tl, canvas, start, dur, o) {
    o = o || {};
    const r = rng(o.seed || 31), n = o.count || 260, slant = o.slant == null ? 0.18 : o.slant;
    const ps = Array.from({ length: n }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, sp: 1.4 + r() * 1.2 }));
    painter(tl, canvas, start, dur, (ctx, t, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (const p of ps) {
        const len = 30 + p.z * 70;
        const y = ((p.y + t * p.sp * p.z) % 1.1) * h * 1.1 - len;
        const x = ((p.x + y / h * slant) % 1) * w;
        ctx.strokeStyle = "rgba(190,210,255," + (0.08 + p.z * (o.alpha || 0.28)).toFixed(3) + ")";
        ctx.lineWidth = 0.8 + p.z * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len * slant, y + len);
        ctx.stroke();
      }
    });
  }

  // Мерцание лампы: случайные провалы яркости оверлея (шаг 1/12 с).
  function flicker(tl, sel, start, dur, o) {
    o = o || {};
    const r = rng(o.seed || 5);
    for (let t = 0; t < dur; t += 1 / 12) {
      const v = r() < (o.rate || 0.12) ? (o.min || 0.35) + r() * 0.3 : 1;
      // o.dark: оверлей-затемнение — в норме прозрачен, на провалах темнеет
      tl.set(sel, { opacity: o.dark ? (1 - v) * (o.base || 1) : v * (o.base || 1) }, start + t);
    }
  }

  // Холст на весь кадр с нужным id внутри контейнера.
  function canvas(parent, id, css) {
    const c = document.createElement("canvas");
    c.id = id;
    c.width = 1080;
    c.height = 1920;
    Object.assign(c.style, { position: "absolute", left: "0", top: "0", width: "1080px", height: "1920px", pointerEvents: "none" }, css || {});
    (typeof parent === "string" ? document.querySelector(parent) : parent).appendChild(c);
    return c;
  }

  return { rng, handheld, painter, dust, bokeh, rain, flicker, canvas };
})();
