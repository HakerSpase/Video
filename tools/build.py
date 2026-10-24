#!/usr/bin/env python3
"""Собирает эпизод: сценарий + озвучка -> тайминги слов, субтитры, index.html.

    python3 tools/build.py episodes/001-antresol

Что делает:
  1. Читает script.txt (разметка описана в его шапке).
  2. Берёт тайминги слов:
       - assets/transcript.json (whisper, `npx hyperframes transcribe`), если есть;
       - иначе выравнивает текст по паузам в assets/voice.* (без моделей, по слогам);
       - иначе (озвучки ещё нет) оценивает темп речи — для черновика без звука.
  3. Пишет assets/cues.js, compositions/captions.html и index.html.
"""
import difflib
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H = 1080, 1920
VOWELS = set("аеёиоуыэюяaeiouy")
PAUSE = {".": 0.42, "!": 0.42, "?": 0.42, "…": 0.5, ",": 0.16, ":": 0.2, ";": 0.2, "—": 0.24}
EST_RATE = 6.0      # слогов в секунду для черновика без озвучки
LEAD_IN = 0.25      # тишина до первого слова в черновике
TAIL = 3.2          # сколько держим финальную карточку после последнего слова
VOICE_EXT = (".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac")


# ---------------------------------------------------------------- script

def parse_script(path):
    words, scenes, beats = [], [], {}
    pending_scene, pending_beats, force_break = None, [], False
    text = "\n".join(l for l in path.read_text(encoding="utf-8").splitlines()
                     if not l.lstrip().startswith("#"))
    text = re.sub(r"(\[[\w-]+\]|\{b:[\w-]+\}|\|\|)", r" \1 ", text)
    for tok in text.split():
        if m := re.fullmatch(r"\[([\w-]+)\]", tok):
            pending_scene = m.group(1)
            continue
        if m := re.fullmatch(r"\{b:([\w-]+)\}", tok):
            pending_beats.append(m.group(1))
            continue
        if tok == "||":
            force_break = True
            continue
        if re.fullmatch(r"[—–-]+", tok):
            if words:
                words[-1]["display"] += " —"
                words[-1]["pause"] = max(words[-1]["pause"], PAUSE["—"])
                words[-1]["punct"] = True
            continue
        hl = None
        m = re.fullmatch(r"([«\"(]*)([*!])(.+?)\2([.,!?…:;»\")]*)", tok)
        if m:
            hl = "y" if m.group(2) == "*" else "r"
            tok = m.group(1) + m.group(3) + m.group(4)
        trail = re.search(r"[.,!?…:;»\")]*$", tok).group(0)
        pause = max([PAUSE.get(c, 0) for c in trail] + [0])
        clean = re.sub(r"[^\wёЁ-]", "", tok).lower()
        w = {
            "i": len(words), "display": tok, "clean": clean, "hl": hl,
            "syll": max(1, sum(c in VOWELS for c in clean)), "pause": pause,
            "punct": bool(trail.strip("»\")")), "sentence_end": any(c in ".!?…" for c in trail),
            "break_before": force_break,
        }
        force_break = False
        if pending_scene:
            scenes.append({"id": pending_scene, "word": w["i"]})
            w["break_before"] = True
            pending_scene = None
        for b in pending_beats:
            beats[b] = w["i"]
        pending_beats = []
        words.append(w)
    clash = set(beats) & {sc["id"] for sc in scenes}
    if clash:
        sys.exit(f"Метки битов совпадают с именами сцен: {', '.join(sorted(clash))}")
    if not scenes or scenes[0]["word"] != 0:
        sys.exit("script.txt должен начинаться с метки сцены, например [intro]")
    return words, scenes, beats


# ---------------------------------------------------------------- timing

def word_weight(w):
    return w["syll"] + 0.35


def estimate(words):
    t = LEAD_IN
    for w in words:
        d = word_weight(w) / EST_RATE
        w["start"], w["end"] = t, t + d
        t += d + w["pause"] + 0.03


def from_transcript(words, tr):
    tw = [x for x in tr if re.sub(r"[^\wёЁ]", "", x.get("text", ""))]
    a = [w["clean"].replace("ё", "е") for w in words]
    b = [re.sub(r"[^\wёЁ-]", "", x["text"]).lower().replace("ё", "е") for x in tw]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            words[blk.a + k]["start"] = float(tw[blk.b + k]["start"])
            words[blk.a + k]["end"] = float(tw[blk.b + k]["end"])
    fill_gaps(words)


def fill_gaps(words):
    """Слова без таймингов растягиваем между соседями по слогам."""
    i = 0
    while i < len(words):
        if "start" in words[i]:
            i += 1
            continue
        j = i
        while j < len(words) and "start" not in words[j]:
            j += 1
        t0 = words[i - 1]["end"] if i > 0 else 0.1
        t1 = words[j]["start"] if j < len(words) else t0 + sum(word_weight(w) for w in words[i:j]) / EST_RATE
        tot = sum(word_weight(w) for w in words[i:j])
        t = t0
        for w in words[i:j]:
            d = (t1 - t0) * word_weight(w) / tot
            w["start"], w["end"] = t, t + d
            t += d
        i = j


def speech_segments(audio):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "1", "-ar", "16000",
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    hop = 160  # 10 мс
    n = len(x) // hop
    rms = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-10)
    db = 20 * np.log10(rms)
    loud = np.percentile(db, 90)
    voiced = db > max(loud - 28, -50)
    # сглаживание: заполняем дыры короче 100 мс, выкидываем всплески короче 60 мс
    segs, start = [], None
    for k, v in enumerate(list(voiced) + [False]):
        if v and start is None:
            start = k
        elif not v and start is not None:
            segs.append([start, k])
            start = None
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < 10:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    merged = [s for s in merged if s[1] - s[0] >= 6]
    # громкость сегмента относительно речи: 1 — как обычная речь, 0 — на 20 дБ тише (вдох, шум)
    level = [float(np.clip((np.median(db[a:b]) - (loud - 26)) / 20, 0, 1)) for a, b in merged]
    return [(a / 100.0, b / 100.0, lv) for (a, b), lv in zip(merged, level)], n / 100.0


def align_to_audio(words, audio):
    segs, total = speech_segments(audio)
    if not segs:
        sys.exit(f"В {audio} не найдено речи")
    n, s = len(words), len(segs)
    weights = [word_weight(w) for w in words]
    pref = [0.0]
    for x in weights:
        pref.append(pref[-1] + x)
    rate = pref[-1] / sum(b - a for a, b, _ in segs)
    # точки внутри сегмента: на точке диктор почти всегда делает паузу
    send = [0]
    for w in words:
        send.append(send[-1] + (1 if w["sentence_end"] else 0))
    INF = float("inf")
    # f[j][i]: первые j сегментов покрывают первые i слов
    f = [[INF] * (n + 1) for _ in range(s + 1)]
    back = [[None] * (n + 1) for _ in range(s + 1)]
    f[0][0] = 0.0
    for j in range(1, s + 1):
        a, b, lv = segs[j - 1]
        dur = b - a
        for i in range(n + 1):
            # сегмент-шум (вдох, щелчок): не покрывает слов; громкий «шум» — скорее всего речь
            c = f[j - 1][i] + 0.8 + dur * (4 + 10 * lv)
            if c < f[j][i]:
                f[j][i], back[j][i] = c, i
            lo = max(0, i - 40)
            for k in range(lo, i):
                if f[j - 1][k] == INF:
                    continue
                exp = (pref[i] - pref[k]) / rate
                cost = ((dur - exp) / max(exp, 0.35)) ** 2 * 3
                cost += 1.5 * (send[i - 1] - send[k])  # конец предложения посреди сплошной речи
                if i < n:
                    gap = segs[j][0] - b if j < s else 1.0  # тишина после этого сегмента
                    w = words[i - 1]
                    if w["sentence_end"]:
                        cost += 0.0 if gap >= 0.35 else 0.8
                    elif w["punct"]:
                        cost += (0.0 if gap >= 0.15 else 0.3) + (0.4 if gap >= 0.7 else 0.0)
                    else:  # пауза посреди фразы — бывает, но реже, а длинная — совсем редко
                        cost += 1.2 + (2.0 if gap >= 0.35 else 0.0)
                c = f[j - 1][k] + cost
                if c < f[j][i]:
                    f[j][i], back[j][i] = c, k
    i, assign = n, []
    for j in range(s, 0, -1):
        k = back[j][i]
        assign.append((j - 1, k, i))
        i = k
    assign.reverse()
    for seg, k, i in assign:
        if k == i:
            continue
        a, b, _ = segs[seg]
        tot = pref[i] - pref[k]
        t = a
        for w in words[k:i]:
            d = (b - a) * word_weight(w) / tot
            w["start"], w["end"] = t, t + d
            t += d
    fill_gaps(words)
    return total


# ---------------------------------------------------------------- captions

def caption_groups(words):
    groups, cur = [], []
    for w in words:
        if cur:
            prev = cur[-1]
            chars = sum(len(x["display"]) for x in cur) + len(w["display"])
            if (w["break_before"] or prev["sentence_end"] or len(cur) >= 3
                    or (len(cur) >= 2 and chars > 20) or w["start"] - prev["end"] > 0.28
                    or (prev["punct"] and len(cur) >= 2)):
                groups.append(cur)
                cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    out = []
    for gi, g in enumerate(groups):
        start = max(0.0, g[0]["start"] - 0.06)
        nxt = groups[gi + 1][0]["start"] - 0.06 if gi + 1 < len(groups) else g[-1]["end"] + 0.6
        end = min(nxt, g[-1]["end"] + 0.7)
        out.append({"words": g, "start": start, "end": max(end, start + 0.1)})
    return out


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def write_captions(ep, groups, duration):
    rows, js = [], []
    for gi, g in enumerate(groups):
        spans = " ".join(
            f'<span id="c{gi}w{k}" class="w{" hl-" + w["hl"] if w["hl"] else ""}">{esc(w["display"])}</span>'
            for k, w in enumerate(g["words"]))
        rows.append(f'    <div id="c{gi}" class="clip cap" data-start="{g["start"]:.3f}" '
                    f'data-duration="{g["end"] - g["start"]:.3f}" data-track-index="0">'
                    f'<div id="c{gi}i" class="cap-in">{spans}</div></div>')
        js.append(f'    tl.fromTo("#c{gi}i", {{ scale: 0.86, opacity: 0, y: 14 }}, '
                  f'{{ scale: 1, opacity: 1, y: 0, duration: 0.16, ease: "back.out(2.2)" }}, {g["start"]:.3f});')
        for k, w in enumerate(g["words"]):
            col = {"y": "#ffd23f", "r": "#ff2e3e"}.get(w["hl"], "#ffffff")
            js.append(f'    tl.fromTo("#c{gi}w{k}", {{ color: "rgba(255,255,255,0.34)", scale: 1 }}, '
                      f'{{ color: "{col}", scale: {1.1 if w["hl"] else 1.04}, duration: 0.07, ease: "power2.out" }}, {w["start"]:.3f});')
            js.append(f'    tl.to("#c{gi}w{k}", {{ scale: 1, duration: 0.18, ease: "power2.out" }}, {w["start"] + 0.07:.3f});')
        js.append(f'    tl.set("#c{gi}i", {{ opacity: 0 }}, {g["end"] - 0.01:.3f});')
    html = f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
    .cap {{ position: absolute; left: 0; width: 100%; top: 1130px; height: 260px; z-index: 50; overflow: visible; }}
    .cap-in {{ width: 100%; padding: 0 90px; text-align: center; font-family: Montserrat, sans-serif; font-weight: 900;
      font-size: 82px; line-height: 1.04; letter-spacing: -0.01em; text-transform: uppercase; overflow: visible;
      transform-origin: 50% 50%; }}
    .w {{ display: inline-block; margin: 0 0.1em; color: rgba(255,255,255,0.34); transform-origin: 50% 60%;
      text-shadow: 0 4px 0 rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.9); }}
    .w.hl-y {{ text-shadow: 0 4px 0 rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.9), 0 0 34px rgba(255,210,63,0.35); }}
    .w.hl-r {{ text-shadow: 0 4px 0 rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.9), 0 0 34px rgba(255,46,62,0.45); }}
  </style>
  <div id="root" data-composition-id="captions" data-width="{W}" data-height="{H}">
{chr(10).join(rows)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{chr(10).join(js)}
    window.__timelines["captions"] = tl;
  </script>
</template>
"""
    (ep / "compositions" / "captions.html").write_text(html, encoding="utf-8")


# ---------------------------------------------------------------- index

def find_voice(ep):
    for ext in VOICE_EXT:
        p = ep / "assets" / f"voice{ext}"
        if p.exists():
            return p
    return None


def make_bed(ep, duration):
    """Тёмный эмбиент-гул под голос (если в assets нет своей music.*)."""
    out = ep / "assets" / "bed.wav"
    d = f"{duration + 1:.2f}"
    flt = (
        f"anoisesrc=color=brown:amplitude=0.5:d={d}:seed=7,lowpass=f=320,highpass=f=35[n];"
        f"sine=f=49:d={d},volume=0.35[a];sine=f=49.6:d={d},volume=0.35[b];sine=f=73.5:d={d},volume=0.12[c];"
        f"[n][a][b][c]amix=inputs=4:normalize=0,tremolo=f=0.15:d=0.35,"
        f"afade=t=in:d=1.5,afade=t=out:st={duration - 1.5:.2f}:d=2.4,volume=0.6,alimiter=limit=0.7"
    )
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-filter_complex", flt, "-ac", "2", "-ar", "44100", str(out)],
                   check=True)
    return out


def write_index(ep, scenes, words, beats, duration, voice):
    cues = {}
    for sc in scenes:
        cues[sc["id"]] = round(max(0.0, words[sc["word"]]["start"] - 0.12), 3) if sc["word"] else 0.0
    for b, wi in beats.items():
        cues[b] = round(words[wi]["start"], 3)
    cues["_end"] = round(words[-1]["end"], 3)
    cues["_duration"] = round(duration, 3)
    (ep / "assets" / "cues.js").write_text(
        "// generated by tools/build.py — абсолютные времена (сек) сцен и битов\n"
        f"window.CUES = {json.dumps(cues, ensure_ascii=False, indent=1)};\n", encoding="utf-8")

    hosts, cuts, cut_js = [], [], []
    meta = json.loads((ep / "meta.json").read_text(encoding="utf-8")) if (ep / "meta.json").exists() else {}
    for k, sc in enumerate(scenes):
        st = cues[sc["id"]]
        en = cues[scenes[k + 1]["id"]] if k + 1 < len(scenes) else duration
        hosts.append(
            f'      <div id="{sc["id"]}" data-composition-id="{sc["id"]}" data-composition-src="compositions/{sc["id"]}.html"\n'
            f'        data-start="{st:.3f}" data-duration="{en - st:.3f}" data-track-index="1" data-track-kind="graphics"\n'
            f'        data-width="{W}" data-height="{H}" style="z-index:{10 + k}"></div>')
        if k and meta.get("cut_flash", True):  # вспышка на склейке (для живого видеоряда — "cut_flash": false)
            cuts.append(f'      <div id="cut{k}" class="clip fx-cut" data-start="{max(0, st - 0.02):.3f}" data-duration="0.4" '
                        f'data-track-index="5" data-layout-ignore style="z-index:66"><div id="cut{k}i" class="fx-cut-in"></div></div>')
            cut_js.append(f'      tl.fromTo("#cut{k}i", {{ opacity: 0.8 }}, {{ opacity: 0, duration: 0.32, ease: "power2.out" }}, {max(0, st - 0.02):.3f});')

    audio = []
    if voice and (ep / "assets" / "voice_fx.wav").exists():
        voice = ep / "assets" / "voice_fx.wav"  # голос после обработки (tools/foley.py: «телефонные» реплики)
    if (ep / "assets" / "foley.wav").exists():
        audio.append(f'      <audio id="foley" class="clip" src="assets/foley.wav" data-start="0" '
                     f'data-duration="{duration:.3f}" data-track-index="9" data-volume="1"></audio>')
    if voice:
        audio.append(f'      <audio id="voice" class="clip" src="assets/{voice.name}" data-start="0" '
                     f'data-duration="{duration:.3f}" data-track-index="10" data-volume="1"></audio>')
    music = next((ep / "assets" / f"music{e}" for e in VOICE_EXT if (ep / "assets" / f"music{e}").exists()), None)
    if music:
        audio.append(f'      <audio id="music" class="clip" src="assets/{music.name}" data-start="0" '
                     f'data-duration="{duration:.3f}" data-track-index="11" data-volume="{0.55 if music.name == "music.wav" else 0.14}" '
                     f'data-fade-in="1" data-fade-out="2"></audio>')
    else:
        make_bed(ep, duration)
        audio.append(f'      <audio id="bed" class="clip" src="assets/bed.wav" data-start="0" '
                     f'data-duration="{duration:.3f}" data-track-index="11" data-volume="0.55"></audio>')
    sfx_file = ep / "sfx.json"
    if sfx_file.exists():
        for n, s in enumerate(json.loads(sfx_file.read_text(encoding="utf-8"))):
            if s["at"] not in cues:
                print(f"  ! sfx: нет метки {s['at']}, пропускаю")
                continue
            src = ROOT / "lib" / "sfx" / s["file"]
            dst = ep / "assets" / "sfx" / s["file"]
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            t = max(0.0, cues[s["at"]] + s.get("offset", 0.0))
            dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                        str(src)], capture_output=True, text=True).stdout.strip() or 1)
            dur = min(dur, duration - t)
            audio.append(f'      <audio id="sfx{n}" class="clip" src="assets/sfx/{s["file"]}" data-start="{t:.3f}" '
                         f'data-duration="{dur:.3f}" data-track-index="{12 + n % 8}" data-volume="{s.get("vol", 0.5)}"></audio>')

    # общий 3D-мир под всеми сценами (compositions/world.html): сцены тогда — прозрачные HUD-слои
    world_host = ""
    if (ep / "compositions" / "world.html").exists():
        world_host = (f'      <div id="world" data-composition-id="world" data-composition-src="compositions/world.html"\n'
                      f'        data-start="0" data-duration="{duration:.3f}" data-track-index="0" data-track-kind="graphics"\n'
                      f'        data-width="{W}" data-height="{H}" style="z-index:5"></div>\n')
    title = json.loads((ep / "meta.json").read_text(encoding="utf-8")).get("name", ep.name)
    # дополнительные библиотеки эпизода: meta.json → "scripts": ["human3d.js", "humans/denis.js", ...]
    extra_scripts = "".join(f'    <script src="assets/lib/{x}"></script>\n' for x in meta.get("scripts", []))
    html = f"""<!doctype html>
<!-- generated by tools/build.py: правьте script.txt / compositions/*.html, а не этот файл -->
<html lang="ru" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <title>{esc(title)}</title>
    <script src="assets/lib/gsap.min.js"></script>
    <script src="assets/cues.js"></script>
    <script src="assets/lib/iso.js"></script>
    <script src="assets/lib/fx.js"></script>
    <script src="assets/lib/three.min.js"></script>
    <script src="assets/lib/hall3d.js"></script>
    <script src="assets/lib/tunnel3d.js"></script>
    <script src="assets/lib/people3d.js"></script>
    <script src="assets/lib/war3d.js"></script>
{extra_scripts}    <link rel="stylesheet" href="assets/lib/kit.css" />
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: #07090e; }}
      #root {{ width: 100%; height: 100%; position: relative; background: #07090e; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{duration:.3f}"
      data-width="{W}" data-height="{H}">
{chr(10).join(hosts)}
{world_host}{chr(10).join(cuts)}
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html"
        data-start="0" data-duration="{duration:.3f}" data-track-index="2" data-track-kind="captions"
        data-width="{W}" data-height="{H}" style="z-index:60"></div>
      <div id="grain" class="clip fx-grain" data-start="0" data-duration="{duration:.3f}" data-track-index="3"
        data-layout-ignore style="z-index:70"><div id="grain-tex" class="fx-grain-tex"></div></div>
      <div id="vignette" class="clip fx-vignette" data-start="0" data-duration="{duration:.3f}" data-track-index="4"
        data-layout-ignore style="z-index:71"></div>
{chr(10).join(audio)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      // зерно плёнки: текстура прыгает 12 раз в секунду, детерминированно от времени
      tl.fromTo("#grain-tex", {{ x: 0, y: 0 }}, {{ x: -173, y: -251, duration: {duration:.3f},
        ease: "steps({max(1, int(duration * 12))})" }}, 0);
{chr(10).join(cut_js)}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""
    (ep / "index.html").write_text(html, encoding="utf-8")
    return cues


# ---------------------------------------------------------------- main

def write_voice_text(ep):
    """Чистый текст для озвучки (без разметки) — его вставляют в Google AI Studio."""
    out = []
    for line in (ep / "script.txt").read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith("#"):
            continue
        line = re.sub(r"\[[\w-]+\]|\{b:[\w-]+\}|\|\|", "", line)
        line = re.sub(r"([*!])([^\s*!]+?)\1", r"\2", line)
        out.append(re.sub(r"\s+", " ", line).strip())
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"
    (ep / "voice_text.txt").write_text(text, encoding="utf-8")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ep = Path(sys.argv[1]).resolve()
    (ep / "assets" / "lib").mkdir(parents=True, exist_ok=True)
    (ep / "compositions").mkdir(exist_ok=True)
    for f in ("gsap.min.js", "kit.css", "grain.png", "iso.js", "fx.js", "grunge.png", "three.min.js", "hall3d.js", "tunnel3d.js", "people3d.js", "war3d.js"):
        shutil.copyfile(ROOT / "lib" / f, ep / "assets" / "lib" / f)
    # реалистичные люди, мир части 2, фототекстуры
    # плюс всё, что эпизод просит в meta.json → "scripts" (taiga.js и т. п.)
    meta_scripts = json.loads((ep / "meta.json").read_text(encoding="utf-8")).get("scripts", []) if (ep / "meta.json").exists() else []
    for f in ["human3d.js", "night3d.js"] + [x for x in meta_scripts if "/" not in x]:
        if (ROOT / "lib" / f).exists():
            shutil.copyfile(ROOT / "lib" / f, ep / "assets" / "lib" / f)
    for d in ("humans", "tex"):
        if (ROOT / "lib" / d).exists():
            shutil.copytree(ROOT / "lib" / d, ep / "assets" / "lib" / d, dirs_exist_ok=True)

    words, scenes, beats = parse_script(ep / "script.txt")
    write_voice_text(ep)
    voice = find_voice(ep)
    tr_path = ep / "assets" / "transcript.json"
    if voice and tr_path.exists():
        tr = json.loads(tr_path.read_text(encoding="utf-8"))
        from_transcript(words, tr if isinstance(tr, list) else tr.get("words", []))
        mode = "whisper transcript"
    elif voice:
        align_to_audio(words, voice)
        mode = f"выравнивание по паузам ({voice.name})"
    else:
        estimate(words)
        mode = "оценка темпа (черновик без озвучки)"

    voice_len = 0.0
    if voice:
        voice_len = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", str(voice)], capture_output=True, text=True).stdout)
    duration = round(max(words[-1]["end"] + TAIL, voice_len + 0.5), 2)
    groups = caption_groups(words)
    write_captions(ep, groups, duration)
    cues = write_index(ep, scenes, words, beats, duration, voice)
    (ep / "assets" / "words.json").write_text(json.dumps(
        [{"id": f"w{w['i']}", "text": w["display"], "start": round(w["start"], 3), "end": round(w["end"], 3)}
         for w in words], ensure_ascii=False, indent=0), encoding="utf-8")
    missing = [s["id"] for s in scenes if not (ep / "compositions" / f"{s['id']}.html").exists()]
    print(f"Тайминги: {mode}")
    print(f"Слов: {len(words)}, групп субтитров: {len(groups)}, сцен: {len(scenes)}, длительность: {duration:.1f} c")
    for sc in scenes:
        print(f"  {cues[sc['id']]:6.2f}s  {sc['id']}")
    if missing:
        print("  ! нет файлов сцен:", ", ".join(f"compositions/{m}.html" for m in missing))


if __name__ == "__main__":
    main()
