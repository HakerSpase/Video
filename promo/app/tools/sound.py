#!/usr/bin/env python3
"""Звуки интерфейса для промо приложения: video/assets/sfx.wav (37.5 с).
Свуши на сменах секций, щелчки на касаниях, мягкие «поп» на подписях. Сэмплы — lib/sfx (Pixabay License)."""
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT.parent.parent / "lib" / "sfx"
SR, DUR = 48000, 37.5
N = int(SR * DUR)
mix = np.zeros((N, 2))


def load(name):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(LIB / name), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(float)


def put(sig, t, g=1.0):
    i = int(t * SR); j = min(N, i + len(sig))
    if j > i:
        mix[i:j] += sig[: j - i] * g


put(load("whoosh-cinematic.mp3")[: int(1.6 * SR)], 0.0, 0.35)       # телефон влетает
for t in (2.6, 6.8, 10.8, 16.3, 23.8, 28.6):                          # смены секций
    put(load("whoosh-short.mp3"), t, 0.28)
for t in (14.1, 17.6, 21.0, 26.5, 30.9):                              # приближения
    put(load("whoosh.mp3"), t, 0.14)
for t in (2.05, 31.7):                                                # касания
    put(load("click.mp3"), t, 0.45)
for t in (0.45, 2.9, 7.1, 11.1, 16.6, 24.1, 28.9):                    # подписи
    put(load("pop.mp3"), t, 0.08)
put(load("whoosh-cinematic.mp3")[: int(2.0 * SR)], 33.1, 0.3)        # финал
put(load("chime.mp3"), 33.55, 0.22)

peak = np.max(np.abs(mix))
mix = mix / max(peak, 1e-9) * 0.85
out = ROOT / "video" / "assets" / "sfx.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("→", out)
