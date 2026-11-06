#!/usr/bin/env python3
"""Спокойный фон без битов для мем-документалок: тёплый пэд, мягкое пианино-арпеджио, низкий бас.

    python3 tools/calmbed.py episodes/NNN        → assets/music.wav

Настройки — episodes/NNN/bed.json (необязательно): {"bpm": 72, "dips": [["boss", 0.9]], "end": "brand"}
  dips — на панчлайне музыка ненадолго почти затихает; end — с этого бита финальный аккорд и затухание.
Всё синтезировано — без чужих треков и прав.
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100


def cues_of(ep):
    s = (ep / "assets" / "cues.js").read_text(encoding="utf-8")
    return json.loads(s[s.index("{"): s.rindex("}") + 1])


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(buf, x, t):
    i = int(t * SR)
    if i < 0 or i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


def lowpass(x, cut):
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):  # однополюсный ФНЧ (пэд короткий — терпимо по скорости)
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def pad(notes, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.zeros(n)
    for m in notes:
        for det in (-0.12, 0.0, 0.12):
            f = hz(m + det)
            ph = (f * t) % 1.0
            y += (2 * ph - 1) * 0.5 + 0.5 * np.sin(2 * np.pi * f * t)
    att = np.minimum(1, t / 0.8); rel = np.minimum(1, (dur - t) / 0.9)
    return np.clip(att * rel, 0, 1) * y / (len(notes) * 3)


def keys(m, dur=1.6):
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(m)
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 3) + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 6)
    return y * np.minimum(1, t / 0.006) * np.exp(-t / 0.7) * 0.22


def sub(m, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * hz(m) * t) * np.minimum(1, t / 0.05) * np.minimum(1, np.maximum(0, (dur - t) / 0.3)) * 0.12


def main():
    ep = Path(sys.argv[1]); C = cues_of(ep)
    cfg = json.loads((ep / "bed.json").read_text(encoding="utf-8")) if (ep / "bed.json").exists() else {}
    T = lambda v: C[v] if isinstance(v, str) else float(v)  # noqa: E731
    bpm = cfg.get("bpm", 72); beat = 60 / bpm; bar = 4 * beat
    total = C["_duration"] + 0.5; n = int(total * SR)
    padb, keyb, subb = np.zeros(n), np.zeros(n), np.zeros(n)
    # Am – F – C – G (в стиле спокойной «документалки»), голоса в средней октаве
    chords = [(57, 60, 64), (53, 57, 60), (48, 55, 64), (55, 59, 62)]
    roots = [45, 41, 48, 43]
    arp = [0, 1, 2, 1, 2, 0, 1, 2]
    endt = T(cfg["end"]) if cfg.get("end") else None
    b = 0
    while b * bar < total:
        t0 = b * bar
        ch = chords[b % 4]
        add(padb, pad(ch, bar + 0.6), t0)
        add(subb, sub(roots[b % 4], bar), t0)
        for k, a in enumerate(arp):
            m = ch[a] + 12 + (12 if (b % 2 and k == 5) else 0)
            add(keyb, keys(m), t0 + k * beat / 2)
        b += 1
    padb = lowpass(padb, 1400)
    mix = padb * 0.9 + keyb + subb
    # лёгкое эхо на клавишах (пространство)
    d = int(beat * 0.75 * SR); echo = np.zeros(n); echo[d:] = keyb[:-d] * 0.28
    mix += echo
    g = np.ones(n)
    for v, dur in cfg.get("dips", []):
        a, z = int(T(v) * SR), int((T(v) + dur) * SR); f = int(0.12 * SR)
        g[a:z] = 0.18
        g[max(0, a - f):a] = np.minimum(g[max(0, a - f):a], np.linspace(1, 0.18, a - max(0, a - f)))
        g[z:z + f] = np.minimum(g[z:z + f], np.linspace(0.18, 1, len(g[z:z + f])))
    mix *= g
    if endt is not None:
        tt = np.arange(n) / SR
        mix *= np.where(tt > endt + 1.0, np.exp(-(tt - endt - 1.0) / 1.6), 1.0)
    mix = np.tanh(mix * 1.2) / np.tanh(1.2) * 0.8
    st = np.stack([mix, np.roll(mix, int(0.012 * SR))], 1)  # чуть шире стерео
    with wave.open(str(ep / "assets" / "music.wav"), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype("<i2").tobytes())
    print("music.wav", round(total, 1), "с, спокойный фон", bpm, "BPM")


if __name__ == "__main__":
    main()
