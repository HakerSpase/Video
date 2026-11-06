#!/usr/bin/env python3
"""Свой медленный трэп-бит для мем-документалок (как фон в роликах «козёл варит пряники»).

    python3 tools/trapbeat.py episodes/NNN            → assets/music.wav

Настройки — episodes/NNN/beat.json (всё необязательно):
  {"bpm": 80, "stops": [["boss", 0.9], ["unaware", 1.0]], "start": 0.0, "end_hit": "brand"}
  stops — музыка замолкает на N секунд с бита (комедийная пауза), end_hit — финальный удар по биту.
Звук синтезирован целиком (808, хэты, хлоп, колокольчики, FM) — без чужих сэмплов и прав.
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
RNG = np.random.default_rng(17)


def cues_of(ep):
    s = (ep / "assets" / "cues.js").read_text(encoding="utf-8")
    return json.loads(s[s.index("{"): s.rindex("}") + 1])


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def kick(dur=0.45):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(2.2 * np.sin(ph) * env_exp(n, 0.16)) * 0.9


def bass808(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = freq * (1 + 0.6 * np.exp(-t * 40))
    ph = 2 * np.pi * np.cumsum(f) / SR
    a = np.minimum(1, t / 0.004) * np.exp(-t / max(0.25, dur * 0.7))
    return np.tanh(3.0 * np.sin(ph) * a) * 0.55


def hat(open_=False):
    n = int((0.16 if open_ else 0.035) * SR)
    x = RNG.standard_normal(n)
    x = np.diff(np.concatenate([[0], x]))  # грубый ВЧ
    x = np.diff(np.concatenate([[0], x]))
    return x / np.max(np.abs(x)) * env_exp(n, 0.05 if open_ else 0.011) * 0.16


def clap():
    n = int(0.22 * SR); x = RNG.standard_normal(n)
    # полоса ~1–3 кГц: разность двух сглаживаний
    k1 = np.ones(6) / 6; k2 = np.ones(30) / 30
    x = np.convolve(x, k1, "same") - np.convolve(x, k2, "same")
    e = np.zeros(n)
    for d in (0, 0.011, 0.022):
        i = int(d * SR); e[i:] += env_exp(n - i, 0.008 if d < 0.02 else 0.07)
    return x / np.max(np.abs(x)) * e * 0.32


def bell(freq, dur=0.9):
    n = int(dur * SR); t = np.arange(n) / SR
    idx = 2.2 * np.exp(-t * 6)
    y = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * 3.5 * t))
    y += 0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 4)
    return y * np.minimum(1, t / 0.003) * np.exp(-t / 0.45) * 0.17


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    return 440.0 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


def add(buf, x, t):
    i = int(t * SR)
    if i >= len(buf) or i < 0:
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


def main():
    ep = Path(sys.argv[1])
    C = cues_of(ep)
    cfg = json.loads((ep / "beat.json").read_text(encoding="utf-8")) if (ep / "beat.json").exists() else {}
    T = lambda v: C[v] if isinstance(v, str) else float(v)  # noqa: E731
    bpm = cfg.get("bpm", 80); beat = 60 / bpm; bar = 4 * beat
    total = C["_duration"] + 0.5
    n = int(total * SR)
    drums, bass, mel = np.zeros(n), np.zeros(n), np.zeros(n)
    prog = ["A1", "F1", "C2", "E1"]
    # колокольчики: ля-минорная пентатоника, фраза на 2 такта
    phr = [["E5", None, "C5", "A4", None, "B4", "C5", None], ["E5", None, "D5", "C5", None, "A4", "G4", None],
           ["E5", None, "C5", "A4", None, "B4", "C5", "E5"], ["D5", None, "C5", "B4", None, "A4", None, None]]
    start = T(cfg.get("start", 0.0))
    b = 0
    while start + b * bar < total:
        t0 = start + b * bar
        full = b >= 1  # первый такт — только колокольчики
        root = note(prog[b % 4])
        for k, nm in enumerate(phr[b % 4]):
            if nm:
                add(mel, bell(note(nm)), t0 + k * beat / 2)
        if full:
            for kt in (0, 2.5 * beat):
                add(drums, kick(), t0 + kt)
            add(bass, bass808(root, 1.4 * beat), t0)
            add(bass, bass808(root * (1.5 if b % 2 else 1), 1.2 * beat), t0 + 2.5 * beat)
            add(drums, clap(), t0 + 2 * beat)
            for h in range(8):
                add(drums, hat(open_=(h == 7 and b % 2 == 1)), t0 + h * beat / 2)
            if b % 2 == 1:  # трэп-ролл хэтов в конце такта
                for r in range(4):
                    add(drums, hat() * 0.7, t0 + 3 * beat + r * beat / 8)
        b += 1
    # эхо на колокольчиках
    d = int(beat * 0.75 * SR)
    for _ in range(3):
        mel[d:] += mel[:-d] * 0.33
    mix = drums + bass + mel
    # комедийные стопы: музыка обрывается на панчлайне
    g = np.ones(n)
    for v, dur in cfg.get("stops", []):
        a, z = int(T(v) * SR), int((T(v) + dur) * SR)
        fo = int(0.02 * SR)
        g[a:z] = 0
        if a - fo > 0:
            g[a - fo:a] = np.minimum(g[a - fo:a], np.linspace(1, 0, fo))
        g[z:z + int(0.05 * SR)] = np.minimum(g[z:z + int(0.05 * SR)], np.linspace(0, 1, len(g[z:z + int(0.05 * SR)])))
    mix *= g
    if cfg.get("end_hit"):
        th = T(cfg["end_hit"])
        tail = np.arange(n) / SR >= th + bar * 1.5
        mix[tail] *= np.exp(-(np.arange(tail.sum()) / SR) / 0.8)
        add(mix, kick(0.8) * 1.2 + np.pad(bass808(note("A1"), 1.6), (0, 0))[: int(0.8 * SR)] * 0, th)
        add(mix, bass808(note("A1"), 2.0), th)
    mix = np.tanh(mix * 1.1) * 0.9
    st = np.stack([mix, mix], 1)
    with wave.open(str(ep / "assets" / "music.wav"), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype("<i2").tobytes())
    print("music.wav", round(total, 1), "с,", bpm, "BPM")


if __name__ == "__main__":
    main()
