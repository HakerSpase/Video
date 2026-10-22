#!/usr/bin/env python3
"""Нагнетающая фоновая музыка под эпизод — генерируется из таймингов эпизода.

    python3 tools/score.py episodes/003-pocherk-vlevo

Берёт assets/cues.js (сцены, биты), sfx.json (удары impact-* = кульминации) и assets/voice.*,
пишет assets/music.wav. Состав: низкий гул (ре минор), струнный кластер с малой секундой,
сердцебиение, которое ускоряется к финалу, тиканье часов, нарастания перед каждым ударом,
провал в тишину перед ударом и сам удар; под голосом музыка приглушается.
Детерминировано: один и тот же эпизод даёт один и тот же файл.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
D1, A1 = 36.71, 55.0
PAD = [146.83, 155.56, 220.0, 293.66]      # D3, Eb3, A3, D4 — тревожный кластер
GLASS = [1174.66, 1244.51]                  # D6 + Eb6: биения «стекла»


def load_cues(ep):
    s = (ep / "assets" / "cues.js").read_text(encoding="utf-8")
    return json.loads(s[s.index("{"): s.rindex("}") + 1])


def smooth(x, sec):
    n = max(1, int(sec * SR))
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def reverb(x, sec=2.2, mix=0.35, seed=4):
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.32 * SR))
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum())
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    return x * (1 - mix) + wet * mix * 0.9


def main():
    ep = Path(sys.argv[1]).resolve()
    cues = load_cues(ep)
    dur = float(cues["_duration"])
    end_word = float(cues["_end"])
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(7)

    # кульминации — удары из sfx.json
    hits = []
    sfx = ep / "sfx.json"
    if sfx.exists():
        for s in json.loads(sfx.read_text(encoding="utf-8")):
            if s["file"].startswith("impact") and s["at"] in cues:
                hits.append(cues[s["at"]] + s.get("offset", 0.0))
    hits = sorted(h for h in hits if 1.5 < h < dur - 0.5)

    # кривая напряжения: растёт к концу, проваливается после удара и снова набирает
    inten = 0.32 + 0.6 * (t / end_word) ** 1.3
    for h in hits:
        after = (t > h) & (t < h + 4)
        inten[after] *= 0.72 + 0.28 * ((t[after] - h) / 4)
    inten = np.clip(inten, 0, 1)
    tail = t > end_word
    inten[tail] *= np.exp(-(t[tail] - end_word) / 1.2)

    L = np.zeros(n)
    R = np.zeros(n)

    # 1. Гул: ре контроктавы + ля, медленное «дыхание»
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * t)
    drone = np.zeros(n)
    for h in range(1, 9):
        drone += np.sin(2 * np.pi * D1 * h * t + h * 0.7) / h ** 1.6
    drone += 0.35 * np.sin(2 * np.pi * A1 * t)
    drone *= 0.32 * lfo * (0.6 + 0.4 * inten)
    L += drone
    R += drone

    # 2. Струнный кластер: детюн, вибрато, нарастает с напряжением
    pad_amp = 0.085 * inten ** 1.2 * (0.8 + 0.2 * np.sin(2 * np.pi * 0.045 * t + 1.0))
    for i, f in enumerate(PAD):
        for d in (-0.003, 0.0, 0.0031):
            ff = f * (1 + d)
            vib = 0.002 * np.sin(2 * np.pi * (4.6 + i * 0.3) * t + i)
            ph = 2 * np.pi * ff * np.cumsum(1 + vib) / SR
            v = sum(np.sin(h * ph + h * i) / h ** 1.3 for h in range(1, 7))
            pan = 0.5 + 0.35 * np.sin(i * 1.7 + d * 900)
            L += v * pad_amp * (1 - pan) * 0.5
            R += v * pad_amp * pan * 0.5

    # 3. Сердцебиение: «тук-тук», темп 56 -> 96 уд/мин вместе с напряжением
    bpm = 56 + 40 * inten
    phase = np.cumsum(bpm / 60.0) / SR
    beats = np.nonzero(np.diff(np.floor(phase)) > 0)[0]
    thump_n = int(0.35 * SR)
    tt = np.arange(thump_n) / SR
    thump = np.sin(2 * np.pi * (48 + 40 * np.exp(-tt / 0.03)) * tt) * np.exp(-tt / 0.11)
    for b in beats:
        a = max(0.0, (inten[b] - 0.3) / 0.7) * 0.55
        if a <= 0.01:
            continue
        for off, k in ((0, 1.0), (int(0.24 * 60 / bpm[b] * SR), 0.6)):
            s0 = b + off
            e0 = min(n, s0 + thump_n)
            L[s0:e0] += thump[: e0 - s0] * a * k
            R[s0:e0] += thump[: e0 - s0] * a * k

    # 4. Тиканье часов на полудолях (в середине истории)
    tick_n = int(0.03 * SR)
    noise = rng.standard_normal(tick_n)
    tick = np.diff(np.concatenate([[0], noise])) * np.exp(-np.arange(tick_n) / (0.006 * SR))
    half = np.nonzero(np.diff(np.floor(phase * 2)) > 0)[0]
    for k, b in enumerate(half):
        a = 0.05 * max(0.0, min(1.0, (inten[b] - 0.38) * 4)) * (1.0 if k % 2 else 0.6)
        if a <= 0.002:
            continue
        e0 = min(n, b + tick_n)
        L[b:e0] += tick[: e0 - b] * a * (0.7 if k % 2 else 1.0)
        R[b:e0] += tick[: e0 - b] * a * (1.0 if k % 2 else 0.7)

    # 5. «Стекло» в последней трети
    g = np.clip((inten - 0.62) / 0.38, 0, 1) * 0.022
    glass = sum(np.sin(2 * np.pi * f * t + i) for i, f in enumerate(GLASS)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * t))
    L += glass * g
    R += glass * g * 0.8

    # 6. Перед каждым ударом: нарастание 3 с, провал 0.35 с, сам удар
    duck = np.ones(n)
    for h in hits:
        s0, e0 = int((h - 3.0) * SR), int(h * SR)
        s0 = max(0, s0)
        m = e0 - s0
        if m <= 0:
            continue
        x = np.linspace(0, 1, m)
        nz = rng.standard_normal(m)
        bright = nz - smooth(nz, 0.002)
        rise = (bright * x ** 2 * 0.09 + np.sin(2 * np.pi * np.cumsum(180 + 620 * x ** 2) / SR) * x ** 3 * 0.05)
        cut = int(0.35 * SR)
        rise[-cut:] *= np.linspace(1, 0, cut)
        L[s0:e0] += rise
        R[s0:e0] += rise
        duck[max(0, e0 - cut):e0] = np.minimum(duck[max(0, e0 - cut):e0], np.linspace(1, 0.12, min(cut, e0)))
        bn = int(2.2 * SR)
        bt = np.arange(bn) / SR
        boom = np.sin(2 * np.pi * (34 + 60 * np.exp(-bt / 0.05)) * bt) * np.exp(-bt / 0.6) * 0.75
        boom += rng.standard_normal(bn) * np.exp(-bt / 0.05) * 0.12
        e1 = min(n, e0 + bn)
        L[e0:e1] += boom[: e1 - e0]
        R[e0:e1] += boom[: e1 - e0]
    L *= duck
    R *= duck

    # реверберация, приглушение под голосом
    L = reverb(L, seed=4)
    R = reverb(R, seed=5)
    voice = next((ep / "assets" / f"voice{e}" for e in (".wav", ".mp3", ".m4a") if (ep / "assets" / f"voice{e}").exists()), None)
    if voice:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(voice), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                             capture_output=True, check=True).stdout
        v = np.frombuffer(raw, dtype=np.float32)[:n]
        v = np.pad(v, (0, n - len(v)))
        envv = np.sqrt(smooth(v.astype(np.float64) ** 2, 0.05))
        envv = envv / (np.percentile(envv, 95) + 1e-9)
        envv = smooth(np.clip(envv, 0, 1), 0.25)
        gain = 1 - 0.4 * envv
        L *= gain
        R *= gain

    # плавные края
    fade = int(1.0 * SR)
    for ch in (L, R):
        ch[:fade] *= np.linspace(0, 1, fade)
        ch[-fade:] *= np.linspace(1, 0, fade)
    st = np.stack([L, R], axis=1)
    st /= np.max(np.abs(st)) + 1e-9
    tmp = ep / "assets" / "music_raw.wav"
    import wave
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 0.89 * 32767).astype(np.int16).tobytes())
    out = ep / "assets" / "music.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", "loudnorm=I=-20:TP=-2:LRA=14", "-ar", str(SR),
                    str(out)], check=True)
    tmp.unlink()
    print(f"music.wav: {dur:.1f} c, ударов: {len(hits)}")


if __name__ == "__main__":
    main()
