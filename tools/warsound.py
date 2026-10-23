#!/usr/bin/env python3
"""Звук военной серии «Двести четырнадцать»: фоли/эмбиент и музыка по таймингам эпизода.

    python3 tools/warsound.py episodes/005-galochka

Пишет assets/foley.wav (шумы, события, звон в ушах) и assets/music.wav (фортепиано и струнные).
Сцены и события задаются в episodes/<ep>/warsound.json:
  {"ambience": [["kitchen", from, to], ["village", from, to], ...],
   "events": [["phone_vibes", t0, t1], ["impact", t], ...],
   "muffle": [from, to],                       мир глохнет после взрыва (НЧ-фильтр + звон)
   "music": [["sad", from, to], ["warm", from, to], ["swell", from, to], ...]}
Время — секунды или имя бита из cues.js (можно "бит+0.4").
Всё детерминировано: одинаковый вход — одинаковый звук.
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100


def cues_of(ep):
    s = (ep / "assets" / "cues.js").read_text(encoding="utf-8")
    return json.loads(s[s.index("{"): s.rindex("}") + 1])


def smooth(x, sec):
    n = max(1, int(sec * SR))
    if n == 1:
        return x.copy()
    c = np.cumsum(np.concatenate([np.zeros(n // 2 + 1), x, np.zeros(n)]))
    return (c[n:n + len(x)] - c[:len(x)]) / n


def lowpass(x, hz):
    return smooth(smooth(x, 1.0 / hz), 1.0 / hz)


def bandpass(x, lo, hi):
    return lowpass(x, hi) - lowpass(x, lo)


def conv(x, ir):
    nfft = 1 << (len(x) + len(ir) - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]


def reverb_ir(sec, decay, seed, bright=1.0):
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (decay * SR))
    if bright < 1:
        ir = lowpass(ir, 2000 + 8000 * bright)
    ir[: int(0.012 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum())


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def adsr(n, a, r):
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    e[:na] = np.linspace(0, 1, na) if na else 1
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


class Bus:
    def __init__(self, dur):
        self.n = int(dur * SR)
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)
        self.wet = np.zeros(self.n)

    def put(self, sig, t, gain=1.0, pan=0.0, wet=0.2):
        i = int(t * SR)
        if i >= self.n or i + len(sig) <= 0:
            return
        if i < 0:
            sig, i = sig[-i:], 0
        e = min(self.n, i + len(sig))
        seg = sig[: e - i] * gain
        self.L[i:e] += seg * min(1, 1 - pan)
        self.R[i:e] += seg * min(1, 1 + pan)
        self.wet[i:e] += seg * wet

    def bed(self, sig, a, b, gain=1.0, fade=0.4, pan=0.0, wet=0.1):
        """Фон на отрезке [a, b] с плавными краями."""
        i, j = int(a * SR), int(b * SR)
        n = j - i
        if n <= 0:
            return
        s = sig[:n] if len(sig) >= n else np.resize(sig, n)
        self.put(s * adsr(n, fade, fade), a, gain, pan, wet)


# ---------------- реальные записи ----------------

def load_sample(ep, rel, start=0.0, dur=None, rate=1.0):
    """Файл → стерео float64 44.1 кГц (ffmpeg); rate < 1 — ниже и медленнее."""
    path = Path(rel) if rel.startswith("/") else ep / rel
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", str(path)]
    if dur:
        cmd += ["-t", str(dur / rate)]
    if rate != 1.0:
        cmd += ["-af", f"asetrate={int(SR * rate)},aresample={SR}"]
    cmd += ["-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    if len(x) < SR // 10 and start > 0:
        return load_sample(ep, rel, 0.0, dur, rate)  # начало за концом файла — берём с нуля
    return x


def shape(x, o):
    """Обработка сэмпла: нормировка по пику, фильтры, фейды."""
    x = x / (np.max(np.abs(x)) + 1e-9)
    if o.get("lp"):
        x = np.stack([lowpass(x[:, 0], o["lp"]), lowpass(x[:, 1], o["lp"])], axis=1)
    if o.get("hp"):
        x = x - np.stack([lowpass(x[:, 0], o["hp"]), lowpass(x[:, 1], o["hp"])], axis=1)
    n = len(x)
    e = adsr(n, o.get("fade_in", 0.01), o.get("fade_out", 0.05))
    if o.get("reverse"):
        x = x[::-1]
    return x * e[:, None]


def put_st(bus, x, t, gain, pan=0.0, wet=0.2):
    i = int(t * SR)
    if i >= bus.n:
        return
    if i < 0:
        x, i = x[-i:], 0
    e = min(bus.n, i + len(x))
    seg = x[: e - i] * gain
    bus.L[i:e] += seg[:, 0] * min(1, 1 - pan)
    bus.R[i:e] += seg[:, 1] * min(1, 1 + pan)
    bus.wet[i:e] += seg.mean(axis=1) * wet


def loop_to(x, n, xf=1.0):
    """Зациклить запись до n сэмплов со склейкой-кроссфейдом."""
    k = int(xf * SR)
    if len(x) >= n:
        return x[:n]
    out = x.copy()
    while len(out) < n:
        f = np.linspace(0, 1, k)[:, None]
        head = out[-k:] * (1 - f) + x[:k] * f
        out = np.concatenate([out[:-k], head, x[k:]])
    return out[:n]


# ---------------- источники ----------------

def noise(rng, sec):
    return rng.standard_normal(int(sec * SR))


def brown(rng, sec):
    b = np.cumsum(rng.standard_normal(int(sec * SR)))
    b -= smooth(b, 0.3)
    return b / (np.max(np.abs(b)) + 1e-9)


def boom(rng, dist=1.0, big=False):
    """Разрыв: суббас со спадом частоты, удар, раскатистый хвост. dist 1 — рядом, 0.2 — далеко."""
    sec = 6.0 if big else 3.5
    n = int(sec * SR)
    t = np.arange(n) / SR
    f = (28 + 60 * np.exp(-t / 0.08)) if big else (38 + 50 * np.exp(-t / 0.06))
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.003, 1.4 if big else 0.6)
    crack = rng.standard_normal(n) * env(n, 0.001, 0.05 if big else 0.03)
    body = lowpass(rng.standard_normal(n), 300 if big else 180) * env(n, 0.01, 1.8 if big else 1.0) * 6
    x = sub * 1.4 + lowpass(crack, 400 + 6000 * dist) * (0.9 * dist + 0.1) + body
    if dist < 0.6:
        x = lowpass(x, 120 + 700 * dist)
    return x / (np.max(np.abs(x)) + 1e-9)


def debris(rng, sec, density=40):
    """Сыплющиеся обломки: щелчки и стук разной высоты, редеют к концу."""
    n = int(sec * SR)
    x = np.zeros(n)
    k = int(density * sec)
    for _ in range(k):
        p = int((rng.random() ** 1.8) * n)
        m = int((0.01 + 0.04 * rng.random()) * SR)
        f = 300 + 3000 * rng.random()
        tt = np.arange(min(m, n - p)) / SR
        x[p:p + len(tt)] += (np.sin(2 * np.pi * f * tt) * 0.4 + rng.standard_normal(len(tt))) * np.exp(-tt / (0.006 + 0.02 * rng.random())) * rng.random()
    return bandpass(x, 150, 7000)


def fpv(rng, sec, pitch=1.0, doppler=None):
    """FPV-дрон: высокий визг моторов с гармониками, дрожит обороты."""
    n = int(sec * SR)
    t = np.arange(n) / SR
    rpm = 1 + 0.04 * np.sin(2 * np.pi * 3.1 * t) + 0.02 * np.sin(2 * np.pi * 7.7 * t) + 0.015 * brown(rng, sec)
    if doppler is not None:
        rpm = rpm * doppler
    f0 = 210 * pitch * rpm
    ph = 2 * np.pi * np.cumsum(f0) / SR
    x = sum(np.sin(ph * k + k) / k ** 0.8 for k in range(1, 9))
    x += 0.4 * np.sin(ph * 4.02) + 0.25 * bandpass(rng.standard_normal(n), 2000, 7000)
    return x / (np.max(np.abs(x)) + 1e-9)


def vibe_burst(rng, sec=0.32):
    """Вибрация телефона на деревянном столе: 165 Гц с дребезгом."""
    n = int(sec * SR)
    t = np.arange(n) / SR
    m = np.sin(2 * np.pi * 165 * t) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 165 * t)))
    rattle = bandpass(rng.standard_normal(n), 900, 4000) * (np.sin(2 * np.pi * 165 * t) > 0.6) * 0.6
    return (m * 0.7 + rattle) * adsr(n, 0.01, 0.04)


def tick(rng, hi=1.0):
    n = int(0.03 * SR)
    return bandpass(rng.standard_normal(n), 1500, 6000 * hi) * env(n, 0.0005, 0.004) * 3


def chirp_bird(rng):
    """Воробей: пара быстрых свистов вверх-вниз."""
    out = []
    for _ in range(2 + int(rng.random() * 3)):
        n = int((0.05 + 0.04 * rng.random()) * SR)
        t = np.arange(n) / SR
        f = 3500 + 1800 * np.sin(np.pi * t / t[-1]) * (1 if rng.random() < 0.5 else -0.6)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / t[-1]) ** 2
        out.append(s)
        out.append(np.zeros(int(0.04 * SR)))
    return np.concatenate(out)


def scribble(rng, sec):
    """Фломастер по бумаге: писк ворса и шорох, рывками."""
    n = int(sec * SR)
    t = np.arange(n) / SR
    strokes = (np.sin(2 * np.pi * 2.3 * t + 3 * np.sin(2 * np.pi * 0.7 * t)) > -0.2).astype(float)
    strokes = smooth(strokes, 0.02)
    sq = np.sin(2 * np.pi * np.cumsum(1800 + 500 * np.sin(2 * np.pi * 5 * t)) / SR) * 0.15
    x = (bandpass(rng.standard_normal(n), 2500, 9000) + sq) * strokes
    return x * 0.6


def breath(rng, sec, rate=0.55):
    """Тяжёлое дыхание: вдох-выдох шумом с формантой."""
    n = int(sec * SR)
    t = np.arange(n) / SR
    cyc = np.sin(2 * np.pi * rate * t)
    e = np.maximum(0, cyc) ** 1.5 * 0.7 + np.maximum(0, -cyc) ** 2 * 1.0
    return bandpass(rng.standard_normal(n), 300, 2200) * e * 0.5


def creak(rng, sec, f0=120):
    n = int(sec * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.3 * np.sin(2 * np.pi * 0.8 * t) + 0.1 * brown(rng, sec))
    pulses = (np.sin(2 * np.pi * np.cumsum(f) / SR) > 0.97).astype(float)
    x = bandpass(pulses + 0.05 * rng.standard_normal(n), 200, 3500)
    return x * adsr(n, 0.15, 0.3)


# ---------------- фоны ----------------

def amb_kitchen(rng, sec):
    t = np.arange(int(sec * SR)) / SR
    hum = 0.05 * np.sin(2 * np.pi * 50 * t) + 0.03 * np.sin(2 * np.pi * 100 * t) + 0.02 * np.sin(2 * np.pi * 150 * t)  # холодильник
    room = lowpass(rng.standard_normal(len(t)), 600) * 0.15
    x = hum + room
    # настенные часы
    for k in np.arange(0.3, sec, 1.0):
        i = int(k * SR)
        tk = tick(rng, 0.7) * (1.0 if int(k) % 2 else 0.75)
        x[i:i + len(tk)] += tk[: len(x) - i] * 0.6
    return x


def amb_village(rng, sec, dawn=1.0):
    n = int(sec * SR)
    t = np.arange(n) / SR
    gust = 0.55 + 0.45 * np.sin(2 * np.pi * 0.06 * t + 1) * np.sin(2 * np.pi * 0.17 * t)
    wind = lowpass(rng.standard_normal(n), 500) * 1.4 * gust + bandpass(rng.standard_normal(n), 700, 2500) * 0.12 * gust
    return wind * 0.8


def amb_basement(rng, sec):
    n = int(sec * SR)
    x = lowpass(rng.standard_normal(n), 250) * 0.5
    for k in np.arange(0.7, sec, 2.3):
        dr = np.sin(2 * np.pi * (1600 + 700 * rng.random()) * np.arange(int(0.05 * SR)) / SR) * env(int(0.05 * SR), 0.001, 0.012)
        i = int((k + rng.random()) * SR)
        if i + len(dr) < n:
            x[i:i + len(dr)] += dr * 0.15
    return x


# ---------------- музыка ----------------

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def hz(name):
    p, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[p] + 12 * (o + 1) - 69) / 12)


def piano(f, sec, vel=0.7, seed=0):
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    t = np.arange(n) / SR
    B = 0.0003
    x = np.zeros(n)
    for k in range(1, 12):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > 12000:
            break
        amp = (1 / k ** 1.1) * (1 + 0.3 * vel * (k > 3))
        dec = 2.8 / (1 + 0.35 * k) * (1.6 - f / 2000)
        x += amp * np.sin(2 * np.pi * fk * t + rng.random() * 6) * np.exp(-t / max(0.15, dec))
    hammer = lowpass(rng.standard_normal(n), 3000) * np.exp(-t / 0.006) * 0.25
    x = (x + hammer) * adsr(n, 0.002, 0.25)
    return x * vel


def strings(freqs, sec, att=1.8, rel=2.0, bright=0.5, seed=0):
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.006, -0.002, 0.0015, 0.005):
            vib = 1 + 0.003 * np.sin(2 * np.pi * (5 + rng.random()) * t + rng.random() * 6)
            ph = np.cumsum(f * (1 + d) * vib) / SR
            x += 2 * (ph % 1) - 1
    x = lowpass(x, 700 + 2600 * bright)
    return x / (len(freqs) * 4) * adsr(n, att, rel)


def music(cues, plan, dur, voice_env):
    m = Bus(dur)
    seed = 0

    def at(v):
        return v if isinstance(v, (int, float)) else cues[v]

    # мотив: D-минор, тихий, «капающий»
    sad_motif = ["D5", "A4", "F4", "A4", "E5", "A4", "F4", "A4", "D5", "A4", "Bb4", "A4", "G4", "F4", "E4", "F4"]
    sad_bass = [("D3", "A3"), ("Bb2", "F3"), ("G2", "D3"), ("A2", "E3")]
    warm_motif = ["F5", "C5", "A4", "C5", "G5", "C5", "Bb4", "A4", "F5", "C5", "D5", "C5", "Bb4", "A4", "G4", "A4"]
    warm_bass = [("F3", "C4"), ("Bb2", "F3"), ("D3", "A3"), ("C3", "G3")]
    for kind, a, b, *rest in plan:
        a, b = at(a), at(b)
        opt = rest[0] if rest else {}
        beat = opt.get("beat", 0.95)
        if kind in ("sad", "warm"):
            motif, bass = (sad_motif, sad_bass) if kind == "sad" else (warm_motif, warm_bass)
            i = 0
            tt = a
            while tt < b - 0.3:
                nt = motif[i % len(motif)]
                v = (0.45 if i % 4 else 0.62) * opt.get("vel", 1.0)
                if opt.get("sparse") and i % 2:
                    i += 1
                    tt += beat
                    continue
                m.put(piano(hz(nt), 3.5, v, seed), tt, 0.5, pan=-0.15, wet=0.5)
                seed += 1
                if i % 4 == 0:
                    lo, hi = bass[(i // 4) % len(bass)]
                    m.put(piano(hz(lo), 5, 0.5, seed) + piano(hz(hi), 5, 0.35, seed + 1), tt, 0.45, pan=0.1, wet=0.5)
                    seed += 2
                i += 1
                tt += beat
            if opt.get("pad", True):
                chord = [hz("D3"), hz("A3"), hz("F4")] if kind == "sad" else [hz("F3"), hz("C4"), hz("A4")]
                m.put(strings(chord, b - a + 2, 2.5, 2.5, 0.35, seed), a, 0.22 * opt.get("pad_vol", 1.0), wet=0.6)
                seed += 1
        elif kind == "drone":
            f = [hz(x) for x in opt.get("notes", ["D2", "A2"])]
            m.put(strings(f, b - a + 1.5, 2.0, 2.0, 0.15, seed), a, 0.3 * opt.get("vol", 1.0), wet=0.4)
            seed += 1
        elif kind == "swell":
            f = [hz(x) for x in opt.get("notes", ["D3", "A3", "F4", "D5"])]
            sig = strings(f, b - a + 2.5, (b - a) * 0.7, 2.5, 0.6, seed)
            m.put(sig, a, 0.42 * opt.get("vol", 1.0), wet=0.7)
            seed += 1
        elif kind == "note":
            m.put(piano(hz(opt.get("n", "D3")), 6, opt.get("vel", 0.8), seed) + piano(hz(opt.get("n2", "A3")), 6, opt.get("vel", 0.8) * 0.7, seed + 1), a, 0.6, wet=0.7)
            seed += 2
        elif kind == "pulse":
            # «сердце»: глухие удары
            tt = a
            while tt < b:
                n = int(0.3 * SR)
                x = np.sin(2 * np.pi * 52 * np.arange(n) / SR) * env(n, 0.004, 0.08)
                m.put(x, tt, 0.5, wet=0.1)
                m.put(x * 0.6, tt + 0.28, 0.5, wet=0.1)
                tt += opt.get("period", 1.0)
    ir = reverb_ir(4.0, 1.3, 9, 0.6)
    L = m.L + conv(m.wet, ir) * 0.55
    R = m.R + conv(m.wet, reverb_ir(4.0, 1.3, 10, 0.6)) * 0.55
    duck = 1 - 0.45 * voice_env
    return np.stack([L * duck, R * duck], axis=1)


# ---------------- сборка ----------------

def voice_envelope(ep, n):
    v = ep / "assets" / "voice.wav"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(v), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    e = smooth(np.abs(x), 0.15)
    e = np.clip(e / (np.percentile(e, 95) + 1e-9), 0, 1)
    out = np.zeros(n)
    out[: min(n, len(e))] = e[:n]
    return smooth(out, 0.25)


def write_wav(path, st):
    st = st / max(1.0, np.max(np.abs(st)) / 0.97)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())


def norm(ep, name, st, lufs):
    tmp = ep / "assets" / (name + "_raw.wav")
    write_wav(tmp, st)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", f"loudnorm=I={lufs}:TP=-2:LRA=18", "-ar", str(SR), str(ep / "assets" / (name + ".wav"))], check=True)
    tmp.unlink()


def main():
    ep = Path(sys.argv[1]).resolve()
    cues = cues_of(ep)
    spec = json.loads((ep / "warsound.json").read_text(encoding="utf-8"))
    dur = float(cues["_duration"])

    def at(v):
        if isinstance(v, (int, float)):
            return float(v)
        if "+" in v or (v.count("-") == 1 and not v.startswith("-")):
            sep = "+" if "+" in v else "-"
            k, d = v.split(sep)
            return cues[k] + (float(d) if sep == "+" else -float(d))
        return cues[v]

    rng = np.random.default_rng(214)
    fx = Bus(dur)
    # фоны
    for kind, a, b in spec["ambience"]:
        a, b = at(a), at(b)
        sec = b - a + 1
        if kind == "kitchen":
            fx.bed(amb_kitchen(rng, sec), a, b, 0.5, fade=0.08, wet=0.05)
        elif kind in ("village", "dusk"):
            fx.bed(amb_village(rng, sec), a, b, 0.55, fade=0.1, wet=0.05)
            # далёкие разрывы: глухо, с длинным хвостом
            tt = a + 1.2 + rng.random() * 2
            while tt < b - 1:
                fx.put(boom(rng, 0.12), tt, 0.35 + 0.25 * rng.random(), pan=rng.random() * 1.4 - 0.7, wet=0.9)
                tt += 4 + rng.random() * 6
        elif kind == "flashback":
            fx.bed(lowpass(amb_village(rng, sec), 250) * 0.6, a, b, 0.6, fade=0.3, wet=0.4)
        elif kind == "basement":
            fx.bed(amb_basement(rng, sec), a, b, 0.6, fade=0.1, wet=0.2)
            tt = a + 0.8
            while tt < b - 1:
                fx.put(lowpass(boom(rng, 0.15), 140), tt, 0.45, wet=0.3)
                tt += 3.5 + rng.random() * 4
    # события
    for ev in spec["events"]:
        k = ev[0]
        t = at(ev[1])
        if k == "plug":
            fx.put(tick(rng) * 1.5, t, 0.8)
            n = int(0.5 * SR)
            ding = (np.sin(2 * np.pi * 1318 * np.arange(n) / SR) + 0.5 * np.sin(2 * np.pi * 1976 * np.arange(n) / SR)) * env(n, 0.003, 0.15)
            fx.put(ding * 0.25, t + 0.3, wet=0.3)
        elif k == "phone_vibes":
            t1 = at(ev[2])
            tt, gap = t, 0.42
            while tt < t1:
                fx.put(vibe_burst(rng, 0.28), tt, 0.7, pan=0.1, wet=0.15)
                n = int(0.08 * SR)
                note = np.sin(2 * np.pi * 1568 * np.arange(n) / SR) * env(n, 0.002, 0.03)
                fx.put(note * 0.15, tt, wet=0.2)
                tt += gap
                gap = max(0.13, gap * 0.9) if tt < t + 2 else min(0.6, gap * 1.08)
        elif k == "typing":
            t1 = at(ev[2])
            tt = t
            while tt < t1:
                fx.put(tick(rng, 0.5) * 0.6, tt, 0.5)
                tt += 0.09 + rng.random() * 0.12
        elif k == "send":
            n = int(0.12 * SR)
            f = np.linspace(600, 1400, n)
            fx.put(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.04) * 0.4, t, wet=0.1)
        elif k == "bell":
            for d in (0, 0.13, 0.31):
                n = int(0.4 * SR)
                x = np.sin(2 * np.pi * 4200 * np.arange(n) / SR) * env(n, 0.001, 0.06) + 0.5 * np.sin(2 * np.pi * 6100 * np.arange(n) / SR) * env(n, 0.001, 0.04)
                fx.put(x * 0.12, t + d, wet=0.4)
        elif k == "steps":
            t1, rate, people, light = at(ev[2]), ev[3], ev[4], ev[5] if len(ev) > 5 else 0
            for p in range(people):
                tt = t + rng.random() / rate
                while tt < t1:
                    n = int(0.16 * SR)
                    sq = bandpass(rng.standard_normal(n), 200, 1800 + 2000 * light) * env(n, 0.01, 0.05) + np.sin(2 * np.pi * 60 * np.arange(n) / SR) * env(n, 0.002, 0.04) * (0.6 - 0.4 * light)
                    fx.put(sq, tt, (0.35 if light else 0.45) / np.sqrt(people), pan=(p / max(1, people - 1) - 0.5) * 0.6, wet=0.15)
                    tt += 1 / rate * (0.92 + 0.16 * rng.random())
        elif k == "rustle":
            n = int(ev[2] * SR) if len(ev) > 2 else int(0.8 * SR)
            fx.put(bandpass(rng.standard_normal(n), 800, 6000) * adsr(n, 0.1, 0.3) * (0.5 + 0.5 * np.abs(np.sin(np.arange(n) / SR * 9))), t, 0.25, wet=0.1)
        elif k == "wire":
            fx.put(creak(rng, 1.4, 90) * 0.6, t, 0.6, pan=0.4, wet=0.4)
        elif k == "well":
            for d in (0, 0.25, 0.42):
                n = int(0.5 * SR)
                x = sum(np.sin(2 * np.pi * f * np.arange(n) / SR) for f in (1900, 2870, 4100)) * env(n, 0.001, 0.08)
                fx.put(x * 0.06, t + d, wet=0.8)
        elif k == "drone_pass":
            t1 = at(ev[2])
            sec = t1 - t
            n = int(sec * SR)
            u = np.linspace(-1, 1, n)
            dop = 1 + 0.06 * (-np.tanh(u * 3))
            amp = np.exp(-(u * 1.6) ** 2) * 0.9 + 0.1
            fx.put(fpv(rng, sec, 1.1, dop) * amp, t, 0.55, pan=0.0, wet=0.2)
        elif k == "drone_hover":
            t1, vol = at(ev[2]), ev[3] if len(ev) > 3 else 1.0
            sec = t1 - t
            n = int(sec * SR)
            fx.put(fpv(rng, sec, 0.95) * adsr(n, 0.3, 0.3), t, 0.4 * vol, wet=0.25)
        elif k == "thermal":
            t1 = at(ev[2])
            n = int((t1 - t) * SR)
            hum = (np.sin(2 * np.pi * 120 * np.arange(n) / SR) * 0.3 + bandpass(rng.standard_normal(n), 3000, 8000) * 0.2) * adsr(n, 0.05, 0.05)
            fx.put(hum, t, 0.25, wet=0.0)
        elif k == "gate":
            fx.put(creak(rng, 1.5, 70) + creak(rng, 1.5, 140) * 0.5, t, 0.8, pan=-0.3, wet=0.3)
            n = int(0.3 * SR)
            fx.put(lowpass(rng.standard_normal(n), 800) * env(n, 0.002, 0.08), t + 1.4, 0.5, wet=0.3)
        elif k == "birds":
            t1 = at(ev[2])
            tt = t + 0.4
            while tt < t1:
                fx.put(chirp_bird(rng), tt, 0.08, pan=rng.random() * 1.6 - 0.8, wet=0.5)
                tt += 1.2 + rng.random() * 2.5
        elif k == "wrapper":
            n = int(0.6 * SR)
            x = np.zeros(n)
            for _ in range(60):
                p = int(rng.random() * n * 0.9)
                m = int(0.004 * SR)
                x[p:p + m] += rng.standard_normal(m) * rng.random()
            fx.put(bandpass(x, 2000, 9000), t, 0.5, wet=0.1)
        elif k == "scribble":
            t1 = at(ev[2])
            fx.put(scribble(rng, t1 - t), t, 0.5, wet=0.05)
        elif k == "velcro":
            n = int(0.45 * SR)
            x = np.zeros(n)
            for _ in range(220):
                p = int(rng.random() * n * 0.95)
                m = int(0.0015 * SR)
                x[p:p + m] += rng.standard_normal(m)
            fx.put(bandpass(x, 1000, 8000) * adsr(n, 0.02, 0.1), t, 0.6, wet=0.05)
        elif k == "incoming":
            # планирующая бомба: нарастающий рёв воздуха
            t1 = at(ev[2])
            sec = t1 - t
            n = int(sec * SR)
            u = np.linspace(0, 1, n)
            wn = rng.standard_normal(n)
            roar = (lowpass(wn, 300) * (1 - u ** 2) + lowpass(wn, 2800) * u ** 2) * (u ** 2.2) * 3
            whistle = np.sin(2 * np.pi * np.cumsum(900 - 400 * u) / SR) * u ** 3 * 0.25
            fx.put(roar + whistle, t, 0.6, wet=0.3)
        elif k == "impact":
            fx.put(boom(rng, 1.0, big=True), t, 1.6, wet=0.5)
            fx.put(debris(rng, 4.5, 60), t + 0.25, 0.9, wet=0.3)
            fx.put(debris(rng, 3.0, 40), t + 0.4, 0.6, pan=0.5, wet=0.3)
        elif k == "collapse":
            n = int(3.5 * SR)
            rumble = lowpass(rng.standard_normal(n), 220) * adsr(n, 0.3, 1.5) * 3
            fx.put(rumble + debris(rng, 3.5, 70) * 0.6 + creak(rng, 3.5, 60) * 0.4, t, 0.8, wet=0.4)
        elif k == "dig":
            t1 = at(ev[2])
            tt = t
            while tt < t1:
                n = int(0.22 * SR)
                x = np.zeros(n)
                for _ in range(10):
                    p = int(rng.random() * n * 0.8)
                    m = int(0.012 * SR)
                    x[p:p + m] += np.sin(2 * np.pi * (500 + 1500 * rng.random()) * np.arange(m) / SR) * np.exp(-np.arange(m) / (0.004 * SR))
                scrape = bandpass(rng.standard_normal(n), 400, 3000) * adsr(n, 0.03, 0.12) * 0.5
                fx.put(x + scrape, tt, 0.45, pan=rng.random() * 0.6 - 0.3, wet=0.15)
                tt += 0.55 + rng.random() * 0.25
        elif k == "breath":
            t1 = at(ev[2])
            fx.put(breath(rng, t1 - t, ev[3] if len(ev) > 3 else 0.55), t, 0.35, wet=0.05)
        elif k == "beam":
            fx.put(creak(rng, 1.6, 55) * 1.0 + debris(rng, 1.6, 25) * 0.5, t, 0.7, wet=0.3)
        elif k == "countdown":
            t1 = at(ev[2])
            tt = t
            while tt < t1:
                fx.put(tick(rng, 0.8), tt, 0.8, wet=0.2)
                tt += 1.0
        elif k == "fire":
            # пожар: гул пламени + треск
            t1, vol = at(ev[2]), ev[3] if len(ev) > 3 else 1.0
            n = int((t1 - t) * SR)
            wn = rng.standard_normal(n)
            flick = 0.7 + 0.3 * np.sin(np.cumsum(rng.standard_normal(n)) * 0.0004)
            roar = lowpass(wn, 380) * flick * 2.2
            cr = np.zeros(n)
            for _ in range(int((t1 - t) * 22)):
                p0 = int(rng.random() * (n - 400))
                m = int((0.002 + rng.random() * 0.01) * SR)
                cr[p0:p0 + m] += rng.standard_normal(m) * np.exp(-np.arange(m) / (0.002 * SR)) * (0.3 + rng.random())
            fx.put((roar + bandpass(cr, 700, 7000) * 1.6) * adsr(n, 0.6, 1.2), t, 0.45 * vol, pan=0.1, wet=0.25)
        elif k == "last_vibe":
            fx.put(vibe_burst(rng, 0.35), t, 0.5, wet=0.3)
    # реальные записи: фоны-петли и точечные события
    for b in spec.get("beds", []):
        a0, b0, f, g = at(b[0]), at(b[1]), b[2], b[3]
        o = b[4] if len(b) > 4 else {}
        x = shape(load_sample(ep, f, o.get("start", 0), o.get("dur"), o.get("rate", 1.0)), {**o, "fade_in": 0, "fade_out": 0})
        n = int((b0 - a0) * SR)
        x = loop_to(x, n) * adsr(n, o.get("fade", 0.4), o.get("fade", 0.4))[:, None]
        put_st(fx, x, a0, g, o.get("pan", 0.0), o.get("wet", 0.05))
    for e in spec.get("samples", []):
        t, f, g = at(e[0]), e[1], e[2]
        o = e[3] if len(e) > 3 else {}
        x = shape(load_sample(ep, f, o.get("start", 0), o.get("dur"), o.get("rate", 1.0)), o)
        put_st(fx, x, t + o.get("offset", 0), g, o.get("pan", 0.0), o.get("wet", 0.2))
    # провалы фона (тишина перед важной фразой): [от, до, уровень]
    for a0, b0, lev in spec.get("duck", []):
        i, j = int(at(a0) * SR), int(at(b0) * SR)
        g = np.ones(fx.n)
        g[i:j] = lev
        g = smooth(g, 0.5)
        fx.L *= g
        fx.R *= g
        fx.wet *= g
    # мир глохнет после удара: НЧ-фильтр по огибающей + звон в ушах
    L, R = fx.L, fx.R
    ir = reverb_ir(2.2, 0.55, 3)
    L = L + conv(fx.wet, ir) * 0.7
    R = R + conv(fx.wet, reverb_ir(2.2, 0.55, 4)) * 0.7
    muf = np.zeros(fx.n)
    if "muffle" in spec:
        a, b = at(spec["muffle"][0]), at(spec["muffle"][1])
        i, j = int(a * SR), int(b * SR)
        muf[i:j] = 1
        muf = smooth(muf, 0.6)
        muf[i:i + int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
        Lm, Rm = lowpass(L, 180), lowpass(R, 180)
        L = L * (1 - muf) + Lm * muf * spec.get("muffle_gain", 1.4)
        R = R * (1 - muf) + Rm * muf * spec.get("muffle_gain", 1.4)
        n = j - i + int(2 * SR)
        tt = np.arange(n) / SR
        ring = (np.sin(2 * np.pi * 6400 * tt) * 0.06 * np.exp(-tt / 3.0) + np.sin(2 * np.pi * 3100 * tt) * 0.02 * np.exp(-tt / 2.0)) * spec.get("ring_synth", 1.0)
        e = min(fx.n, i + n)
        L[i:e] += ring[: e - i]
        R[i:e] += ring[: e - i] * 0.9
    venv = voice_envelope(ep, int(dur * SR))
    # эффекты уступают голосу (как дакинг в кино), кроме защищённых моментов — удара
    fd = 1 - spec.get("foley_duck", 0.0) * venv
    for a0, b0 in spec.get("duck_protect", []):
        i, j = int(at(a0) * SR), int(at(b0) * SR)
        fd[i:j] = 1
    fd = smooth(fd, 0.08)
    norm(ep, "foley", np.stack([L * fd, R * fd], axis=1), spec.get("foley_lufs", -21))

    mus = music(cues, [[p[0], at(p[1]), at(p[2])] + p[3:] for p in spec.get("music", [])], dur, venv)
    # музыка из записей: куски треков с фейдами, тоже приглушаются под голосом
    tb = Bus(dur)
    for tr in spec.get("tracks", []):
        a0, b0, f, g = at(tr[0]), at(tr[1]), tr[2], tr[3]
        o = tr[4] if len(tr) > 4 else {}
        x = load_sample(ep, f, o.get("start", 0), b0 - a0, o.get("rate", 1.0))
        x = x / (np.sqrt(np.mean(x ** 2)) * 8 + 1e-9)
        n = len(x)
        x = x * adsr(n, o.get("fade_in", 1.5), o.get("fade_out", 2.0))[:, None]
        put_st(tb, x, a0, g, 0.0, 0.0)
    if spec.get("tracks"):
        duck = 1 - o.get("duck", 0.35) * venv
        mus = mus + np.stack([tb.L * duck, tb.R * duck], axis=1)
    if muf.any():
        mus *= (1 - 0.95 * muf)[:, None]
    if "music_gain" in spec:
        # фиксированный уровень: громкость кусков задаётся в партитуре и не перенормируется
        write_wav(ep / "assets" / "music.wav", mus * spec["music_gain"])
    else:
        norm(ep, "music", mus, spec.get("music_lufs", -19))
    print(f"warsound: {dur:.1f} c, событий: {len(spec['events'])}")


if __name__ == "__main__":
    main()
