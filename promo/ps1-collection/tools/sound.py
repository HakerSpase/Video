#!/usr/bin/env python3
"""Звуковой дизайн трейлера (без музыки): trailer/assets/sfx.wav, 48 кГц стерео.

Синтез (гул, удары, затвор, 8-бит) + сэмплы из lib/sfx (Pixabay License).
Тайминги совпадают с edit.json / index.html.
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT.parent.parent / "lib" / "sfx"
SR = 48000
DUR = 34.6
N = int(SR * DUR)
mix = np.zeros((N, 2))
rng = np.random.default_rng(7)


def load(name):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(LIB / name), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(float)


def put(sig, t, gain=1.0, pan=0.0):
    if sig.ndim == 1:
        sig = np.stack([sig * (1 - max(pan, 0)), sig * (1 + min(pan, 0))], 1)
    i = int(t * SR)
    j = min(N, i + len(sig))
    if j > i:
        mix[i:j] += sig[: j - i] * gain


def env(n, a, d):
    e = np.ones(n)
    na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na)
    e *= np.exp(-np.arange(n) / (d * SR))
    return e


def lowpass(x, k):
    """простой однополюсный ФНЧ, k∈(0,1) — меньше = темнее"""
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc); y[i] = acc
    return y


def boom(f0=48, dur=2.2):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f0 + 70 * np.exp(-t * 18)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, dur / 4)
    s += 0.25 * np.tanh(3 * s)
    return s


def kick(dur=0.35):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 52 + 120 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.09)


def shutter():
    """затвор плёночной камеры: два щелчка с шумовой «шторкой» между"""
    def click(d=0.025, k=0.6):
        n = int(d * SR)
        return lowpass(rng.standard_normal(n), k) * env(n, 0.0005, 0.006)
    n = int(0.16 * SR); s = np.zeros(n)
    c1 = click(); s[: len(c1)] += c1
    curtain = lowpass(rng.standard_normal(int(0.07 * SR)), 0.25) * env(int(0.07 * SR), 0.01, 0.03) * 0.35
    s[int(0.012 * SR): int(0.012 * SR) + len(curtain)] += curtain
    c2 = click(0.03, 0.4) * 0.8; s[int(0.085 * SR): int(0.085 * SR) + len(c2)] += c2
    return s


def bleep(freq, dur=0.07):
    n = int(dur * SR); t = np.arange(n) / SR
    sq = np.sign(np.sin(2 * np.pi * freq * t))
    return sq * env(n, 0.001, dur / 2) * 0.5


# --- гул: низкий дрон с медленным нарастанием, держится до финального удара ---
t = np.arange(N) / SR
drone = (np.sin(2 * np.pi * 41 * t) + 0.5 * np.sin(2 * np.pi * 61.5 * t + 1) + 0.25 * np.sin(2 * np.pi * 82 * t))
air = lowpass(rng.standard_normal(N) * 0.6, 0.02)
d_env = np.interp(t, [0, 2, 6.8, 7.0, 8.4, 22.6, 25.5, 25.6, 34.6], [0, .5, .8, .15, .45, .7, 1, 0, 0])
d_env *= 1 + 0.25 * np.sin(2 * np.pi * 0.17 * t)
mix += np.stack([drone + air, drone * 0.97 + np.roll(air, 900)], 1) * (d_env * 0.16)[:, None]

# --- интро ---
put(load("whoosh-cinematic.mp3"), 0.25, 0.45)
put(shutter(), 2.38, 0.5)
for tt in (3.5, 4.6, 5.7):
    put(load("whoosh-short.mp3"), tt - 0.12, 0.25, pan=0.3 if tt == 4.6 else -0.2)
put(load("riser.mp3")[: int(5.2 * SR)] * np.linspace(0, 1, int(5.2 * SR))[:, None] ** 2, 1.6, 0.35)
put(boom(44, 2.6), 6.8, 0.9)
put(load("impact-bass-2.mp3"), 6.8, 0.5)

# --- блоки: сердцебиение; вспышка-затвор на наезде в принт; мягкий «блик» на мокапе ---
beat = 8.4
while beat < 22.7:
    put(kick(), beat, 0.5); put(kick(), beat + 0.22, 0.28)
    beat += 0.9
for k in range(4):
    s0 = 8.4 + 3.6 * k
    put(load("whoosh.mp3"), s0 + 0.75, 0.3)
    put(shutter(), s0 + 1.18, 0.9)
    put(boom(60, 1.0), s0 + 1.2, 0.35)
    put(load("whoosh-short.mp3"), s0 + 2.1, 0.25)
    put(load("sparkle.mp3"), s0 + 2.35, 0.12)

# --- разгон: удар на каждой склейке, сверху райзер ---
for k, tt in enumerate(np.arange(22.8, 25.55, 0.35)):
    put(kick(0.3), tt, 0.8)
    put(lowpass(rng.standard_normal(int(0.08 * SR)), 0.5) * env(int(0.08 * SR), 0.001, 0.02), tt, 0.25)
    if k % 3 == 2:
        put(load("glitch-3.mp3")[: int(0.18 * SR)], tt, 0.15)
put(load("riser.mp3")[int(5.2 * SR): int(8.0 * SR)], 22.8, 0.45)

# --- финал: удар, футболки, цена, сайт ---
put(boom(38, 3.4), 25.6, 1.0)
put(load("impact-bass-1.mp3"), 25.6, 0.7)
for k in range(4):
    put(load("click-soft.mp3"), 25.85 + 0.14 * k, 0.25)
put(load("ping.mp3"), 26.75, 0.22)
put(load("whoosh-short.mp3"), 28.75, 0.3)
put(load("sparkle.mp3"), 29.5, 0.15)
put(shutter(), 32.38, 0.7)

# мастер: мягкий лимитер, −1 дБ потолок
peak = np.max(np.abs(mix))
mix = np.tanh(mix / max(peak, 1e-9) * 1.4) / np.tanh(1.4) * 0.89
out = ROOT / "trailer" / "assets" / "sfx.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("→", out)
