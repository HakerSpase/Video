#!/usr/bin/env python3
"""Озвучка промо приложения: режет фразы из src/voice/part*.mp3, ставит по секциям → video/assets/voice.wav,
и приглушает музыку под голосом (перезаписывает video/assets/music.wav — запускать после music.py).

Границы фраз — по распознаванию (vosk, слова с таймкодами) и паузам в голосе.
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SR, DUR = 48000, 37.5
N = int(SR * DUR)

# (файл, начало, конец во фразе-исходнике, секунда ролика)
PHRASES = [
    ("part1", 0.05, 3.72, 0.30),    # Новая коллекция PS1 — уже в приложении Аверон.
    ("part1", 3.80, 6.60, 4.10),    # Все новинки — в сторис, прямо на главной.
    ("part1", 6.75, 10.58, 7.25),   # Четыре принта в стиле кат-сцен первой PlayStation.
    ("part1", 10.95, 15.65, 11.20), # Удобный каталог и фильтры: по категории, цене и размеру.
    ("part2", 0.00, 4.45, 16.80),   # Укажи свои мерки — и выбери посадку: …
    ("part2", 4.88, 8.36, 24.20),   # Сохраняй понравившееся в избранное и делись подборкой с друзьями.
    ("part2", 8.78, 13.32, 28.90),  # Оформление и оплата — в пару касаний. Доставка по всей России.
    ("part2", 13.70, 17.10, 33.60), # Аверон. Новая коллекция уже ждёт тебя.
]


def load(name, a, b):
    # чистка голоса: срез низа, лёгкая компрессия, мягкие края
    af = (f"atrim={a}:{b},asetpts=PTS-STARTPTS,highpass=f=80,"
          "acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=2,"
          f"afade=t=in:d=0.03,afade=t=out:st={b - a - 0.06:.3f}:d=0.06")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(ROOT / "src" / "voice" / f"{name}.mp3"), "-af", af,
                          "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(float)


def read(p):
    with wave.open(str(p)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2).astype(float) / 32768


def write(p, x):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


voice = np.zeros((N, 2))
duck = np.ones(N)
for name, a, b, at in PHRASES:
    v = load(name, a, b)
    i = int(at * SR); j = min(N, i + len(v))
    voice[i:j] += v[: j - i]
    # музыка −8 дБ под фразой, плавные спуск/подъём по 0.25 с
    k0, k1 = max(0, i - int(0.25 * SR)), min(N, j + int(0.35 * SR))
    duck[k0:k1] = np.minimum(duck[k0:k1], 0.4)
# сгладить огибающую приглушения
ker = np.ones(int(0.25 * SR)) / int(0.25 * SR)
duck = np.convolve(duck, ker, mode="same")

voice *= 0.89 / max(np.max(np.abs(voice)), 1e-9)
write(ROOT / "video" / "assets" / "voice.wav", voice)
music = read(ROOT / "video" / "assets" / "music.wav")[:N]
music = np.pad(music, ((0, N - len(music)), (0, 0)))
write(ROOT / "video" / "assets" / "music.wav", music * duck[:, None])
print("→ voice.wav, music.wav (с приглушением под голос)")
