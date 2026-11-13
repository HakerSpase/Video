#!/usr/bin/env python3
"""Музыка промо приложения: video/assets/music.wav (37.5 с). Те же инструменты, что в трейлере PS1
(пэды, тёплые щипки, саб, хэты), но 100 BPM, ровный грув и место под голос."""
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
DUR = 37.5
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(11)
BEAT = 0.6
BAR = 2.4


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def adsr(n, a, d, s, r, sus_len):
    e = np.zeros(n)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    ns = max(0, int(sus_len * SR) - na - nd)
    seg = np.concatenate([np.linspace(0, 1, max(na, 1)), np.linspace(1, s, max(nd, 1)), np.full(ns, s),
                          np.linspace(s, 0, max(nr, 1))])
    e[: min(n, len(seg))] = seg[:n]
    return e


def put(sig, t, gl=1.0, gr=None):
    gr = gl if gr is None else gr
    i = int(t * SR); j = min(N, i + len(sig))
    if j > i:
        L[i:j] += sig[: j - i] * gl; R[i:j] += sig[: j - i] * gr


def onepole(x, cutoff):
    k = 1 - np.exp(-2 * np.pi * cutoff / SR)
    # векторизованный однополюсный ФНЧ через рекурсию блоками
    y = np.empty_like(x); acc = 0.0
    for i in range(0, len(x), 4096):
        blk = x[i:i + 4096]
        out = np.empty_like(blk)
        for j, v in enumerate(blk):
            acc += k * (v - acc); out[j] = acc
        y[i:i + 4096] = out
    return y


def pad_note(m, dur, bright=900):
    """тёплый пэд: 5 расстроенных пил, ФНЧ, медленная атака"""
    n = int((dur + 1.8) * SR); t = np.arange(n) / SR
    f = hz(m); s = np.zeros(n)
    for d in (-0.11, -0.05, 0, 0.06, 0.12):
        ph = rng.random()
        s += 2 * ((t * f * 2 ** (d / 12) + ph) % 1) - 1
    s /= 5
    s = onepole(s, bright)
    return s * 1.4 * adsr(n, 0.9, 0.6, 0.8, 1.8, dur)


def bell(m, dur=2.4, amp=1.0):
    """тёплый щипок (вместо колокольчика): аддитивные гармоники, верхние гаснут быстрее —
    мягко, как приглушённое электропиано / синт заставок конца 90-х"""
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(m)
    s = np.zeros(n)
    for k in range(1, 9):
        if f * k > 9000:
            break
        s += np.sin(2 * np.pi * f * k * t + 0.3 * k) / k ** 1.6 * np.exp(-t * (1.8 + 2.2 * k))
    s *= 1 + 0.08 * np.sin(2 * np.pi * 5.2 * t)        # лёгкое тремоло
    att = np.minimum(1, t / 0.008)
    return s * amp * 1.5 * att


def sub(m, dur):
    n = int((dur + 0.4) * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * hz(m) * t) + 0.15 * np.sin(2 * np.pi * hz(m) * 2 * t)
    return s * adsr(n, 0.02, 0.3, 0.75, 0.4, dur)


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    s = rng.standard_normal(n)
    s = s - onepole(s, 7000)  # ФВЧ
    return s * np.exp(-np.arange(n) / SR / (0.06 if open_ else 0.012)) * 0.5


def clap():
    n = int(0.35 * SR); s = rng.standard_normal(n)
    s = onepole(s, 3500) - onepole(s, 900)
    e = np.zeros(n)
    for o in (0, 0.011, 0.022):
        i = int(o * SR); e[i:] += np.exp(-np.arange(n - i) / SR / 0.05)
    return s * e * 0.9


def kick():
    n = int(0.5 * SR); t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t * 35)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)


# аккорды (MIDI): по такту 3.6 с
CH = [
    [50, 57, 62, 64, 65, 69],   # Dm(add9)
    [46, 53, 57, 62, 65, 69],   # B♭maj7
    [43, 50, 58, 62, 65, 69],   # Gm9-ish
    [45, 52, 57, 62, 64, 69],   # Asus4 → A
]
ROOTS = [38, 34, 31, 33]

# --- аранжировка промо приложения: 100 BPM, ровный лёгкий грув с первой секунды, место под голос ---
t0 = 0.0; b = 0
while t0 < 33.1:
    ch = CH[b % 4]
    for m in ch[1:]:
        put(pad_note(m, BAR, 1100), t0, 0.035, 0.035)
    put(sub(ROOTS[b % 4], BAR - 0.05), t0, 0.12)
    arp = [ch[2], ch[4], ch[5], ch[4], ch[3], ch[5], ch[4], ch[2]]
    for k in range(8):
        put(bell(arp[k] + (12 if k in (2, 5) else 0), 0.9, 0.06), t0 + k * BEAT / 2, 0.6 + 0.4 * (k % 2), 1.0 - 0.4 * (k % 2))
    for k in range(8):
        put(hat(), t0 + k * BEAT / 2 + 0.01, 0.14 if k % 2 else 0.07)
    put(kick(), t0, 0.22); put(kick(), t0 + 2 * BEAT, 0.18)
    if b > 0:
        put(clap(), t0 + BEAT, 0.12); put(clap(), t0 + 3 * BEAT, 0.12)
    t0 += BAR; b += 1
# финал 32.4–37.5: разрешение в Dm, мелодия
put(kick(), 33.2, 0.3)
for m in CH[0] + [74]:
    put(pad_note(m, 3.6, 1300), 33.2, 0.04)
put(sub(38, 3.6), 33.2, 0.14)
for t1, m in [(33.3, 69), (33.6, 74), (33.9, 77), (34.2, 81), (34.8, 76), (35.4, 74)]:
    put(bell(m, 2.0, 0.11), t1, 0.8, 1.0)

# --- реверб: свёртка с затухающим шумом (2.6 с), разные IR на каналы ---
def reverb(x, seed):
    r = np.random.default_rng(seed)
    n = int(2.6 * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * 2.4)
    ir = onepole(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
    m = len(x) + n
    F = np.fft.rfft(x, m) * np.fft.rfft(ir, m)
    return np.fft.irfft(F, m)[: len(x)]


wetL, wetR = reverb(L, 1), reverb(R, 2)
L = L * 0.75 + wetL * 0.55
R = R * 0.75 + wetR * 0.55
env = np.interp(np.arange(N) / SR, [0, 0.05, 36.6, 37.5], [0, 1, 1, 0])
mix = np.stack([L, R], 1) * env[:, None]
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.2) / np.tanh(1.2) * 0.89
out = ROOT / "video" / "assets" / "music.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("→", out)
