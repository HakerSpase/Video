#!/usr/bin/env python3
"""Оригинальная музыка трейлера: trailer/assets/music.wav (48 кГц стерео, 34.6 с).

Мечтательный dark-ambient в духе заставок PS1: пэды, тёплые щипки (электропиано), саб-бас,
мягкие хэты/клэп. Темп 66.67 BPM — доля 0.9 с, такт 3.6 с = ровно один блок футболки.
Ре минор: Dm(add9) – B♭maj7 – Gm9 – A(sus4→A). Пик — 25.6 с (четыре футболки + цена).
"""
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
DUR = 34.6
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(11)
BEAT = 0.9
BAR = 3.6


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

# --- интро 0–8.4: пэд проявляется, редкие колокольчики ---
for i, t0 in enumerate([0.0, 3.6]):
    for m in CH[i][1:]:
        put(pad_note(m, 3.6, 600 + 300 * i), t0, 0.05, 0.05)
put(pad_note(57, 1.8, 700), 7.2, 0.04)
for t0, m in [(0.6, 81), (2.4, 76), (3.9, 77), (5.0, 81), (5.7, 74), (6.8, 69)]:
    put(bell(m, 2.6, 0.18), t0, 0.7, 1.0)

# --- блоки 8.4–22.8: 4 такта, полный груув ---
for b in range(4):
    t0 = 8.4 + b * BAR
    ch = CH[b % 4]
    for m in ch[1:]:
        put(pad_note(m, BAR, 900 + 250 * b), t0, 0.055, 0.055)
    put(sub(ROOTS[b % 4], BAR - 0.1), t0, 0.16)
    # арпеджио колокольчиков восьмыми
    arp = [ch[2], ch[3], ch[4], ch[5], ch[4], ch[3], ch[5], ch[4]]
    for k in range(8):
        put(bell(arp[k], 1.6, 0.09 + 0.02 * (k == 0)), t0 + k * BEAT / 2, 0.6 + 0.4 * (k % 2), 1.0 - 0.4 * (k % 2))
    for k in range(8):
        put(hat(), t0 + k * BEAT / 2 + 0.01, 0.18 if k % 2 else 0.1)
    put(clap(), t0 + BEAT, 0.22); put(clap(), t0 + 3 * BEAT, 0.22)
    put(kick(), t0, 0.2); put(kick(), t0 + 2 * BEAT + BEAT / 2, 0.14)

# --- разгон 22.8–25.6: пэд открывается, хэты учащаются, дробь клэпа ---
for m in CH[3][1:]:
    put(pad_note(m, 2.8, 2600), 22.8, 0.06)
put(sub(33, 2.8), 22.8, 0.15)
t = 22.8; step = 0.225
while t < 25.55:
    put(hat(), t, 0.2); t += step; step = max(0.06, step * 0.9)
for k in range(12):
    put(clap(), 24.4 + k * 0.1, 0.05 + 0.02 * k)

# --- пик 25.6–32.4: широкий аккорд, бас, мелодия колокольчиков ---
put(kick(), 25.6, 0.4)
for m in CH[0] + [74, 76]:
    put(pad_note(m, 6.0, 1500), 25.6, 0.05)
put(sub(38, 3.0), 25.6, 0.2); put(sub(34, 3.2), 28.6, 0.18)
for m in CH[1][1:]:
    put(pad_note(m, 3.4, 1100), 28.6, 0.045)
mel = [(25.75, 81), (26.2, 77), (26.65, 76), (27.1, 74), (27.55, 76), (28.45, 69),
       (28.9, 77), (29.35, 76), (29.8, 74), (30.25, 72), (30.7, 74), (31.6, 69)]
for t0, m in mel:
    put(bell(m, 2.4, 0.15), t0, 0.8, 1.0)

# --- после титров: музыкальная шкатулка ---
for t0, m in [(32.5, 74), (32.95, 77), (33.4, 81), (33.85, 86)]:
    put(bell(m, 1.8, 0.12), t0, 0.8, 1.0)

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
env = np.interp(np.arange(N) / SR, [0, 1.5, 33.9, 34.6], [0, 1, 1, 0])
mix = np.stack([L, R], 1) * env[:, None]
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.2) / np.tanh(1.2) * 0.89
out = ROOT / "trailer" / "assets" / "music.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("→", out)
