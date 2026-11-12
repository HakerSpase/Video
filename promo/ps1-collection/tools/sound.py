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
d_env = np.interp(t, [0, 2, 7.2, 7.4, 9.2, 21.5, 25.9, 26.0, 34.6], [0, .5, .8, .15, .45, .7, 1, 0, 0])
d_env *= 1 + 0.25 * np.sin(2 * np.pi * 0.17 * t)
mix += np.stack([drone + air, drone * 0.97 + np.roll(air, 900)], 1) * (d_env * 0.16)[:, None]

# --- АКТ 1 ---
put(load("whoosh-cinematic.mp3"), 0.25, 0.45)
put(shutter(), 2.78, 0.5)
for tt in (3.9, 5.0, 6.1):
    put(load("whoosh-short.mp3"), tt - 0.12, 0.25, pan=0.3 if tt == 5.0 else -0.2)
put(load("riser.mp3")[: int(5.2 * SR)] * np.linspace(0, 1, int(5.2 * SR))[:, None] ** 2, 2.0, 0.35)
put(boom(44, 2.6), 7.2, 0.9)
put(load("impact-bass-2.mp3"), 7.2, 0.5)

# --- АКТ 2: пульс-сердцебиение + затвор на стоп-кадрах ---
beat = 9.2
while beat < 21.9:
    put(kick(), beat, 0.55); put(kick(), beat + 0.22, 0.3)
    beat += 0.8
for tt in (10.7, 13.9, 17.1, 20.3):
    put(load("whoosh.mp3"), tt - 0.45, 0.35)
    put(shutter(), tt - 0.02, 0.9)
    put(boom(60, 1.0), tt, 0.35)
put(load("glitch-1.mp3")[: int(0.4 * SR)], 12.38, 0.2)
put(load("glitch-2.mp3")[: int(0.35 * SR)], 18.78, 0.2)

# --- АКТ 3: разгон — удар на каждой склейке, сверху райзер ---
for k, tt in enumerate(np.arange(22.0, 25.95, 0.4)):
    put(kick(0.3), tt, 0.8)
    put(lowpass(rng.standard_normal(int(0.08 * SR)), 0.5) * env(int(0.08 * SR), 0.001, 0.02), tt, 0.25)
    if k % 3 == 2:
        put(load("glitch-3.mp3")[: int(0.18 * SR)], tt, 0.18)
put(load("riser.mp3")[int(5.0 * SR): int(9.0 * SR)], 22.0, 0.45)
put(shutter(), 22.0, 0.6)

# --- ФИНАЛ: удар, тишина, 8-бит на сборке титра ---
put(boom(38, 3.4), 26.0, 1.0)
put(load("impact-bass-1.mp3"), 26.0, 0.7)
notes = [523, 659, 784, 1047, 784, 1047, 1319, 1568]
for k, f in enumerate(notes):
    put(bleep(f), 26.4 + k * 0.11, 0.12, pan=(-0.3 if k % 2 else 0.3))
put(load("chime.mp3"), 27.35, 0.35)
put(load("whoosh-short.mp3"), 29.05, 0.3)
put(load("sparkle.mp3"), 29.9, 0.18)
put(shutter(), 32.38, 0.7)
put(load("click-soft.mp3"), 33.0, 0.3)

# мастер: мягкий лимитер, −1 дБ потолок
peak = np.max(np.abs(mix))
mix = np.tanh(mix / max(peak, 1e-9) * 1.4) / np.tanh(1.4) * 0.89
out = ROOT / "trailer" / "assets" / "sfx.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("→", out)
