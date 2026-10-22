#!/usr/bin/env python3
"""Звуковой дизайн эпизода: шумы и фоли по битам сценария -> assets/foley.wav (+ voice_fx.wav).

    python3 tools/foley.py episodes/004-tonnel

Читает episodes/<ep>/foley.json — список событий, привязанных к битам из assets/cues.js:
  {"type": "room"}                                    фон помещения на весь ролик (гул, капли, скрипы)
  {"type": "powerdown", "at": "dark"}                 щелчки реле, мигание ламп, затухающий гул моторов
  {"type": "doors", "at": "doors", "open": true}      пневматика дверей вагона и удар
  {"type": "steps", "from": "torches", "to": "look", "people": 40, "dir": "away"}   толпа по щебню
  {"type": "steps", "from": "minute", "to": "came", "people": 41, "dir": "toward", "sync": true}  в ногу
  {"type": "walk", "from": "wall", "to": "hiss"}       свои шаги вдоль стены
  {"type": "zap", "at": "volt", "dur": 2.5}           гул и треск контактного рельса
  {"type": "phone", "at": "hiss", "to": "look"}        снятие трубки и шипение линии
  {"type": "clicks", "from": "out", "to": "minute", "n": 40}  щелчки гаснущих фонариков
  {"type": "silence", "at": "came", "pre": 0.6}       всё затихает перед ударом
  {"type": "phone_voice", "from": "quote", "to": "look"}  голос диктора в этом отрезке — «как из трубки»
У каждого события есть "vol" (по умолчанию 1) и "offset" (сек).
Всё детерминировано (сиды), один эпизод — один и тот же звук.
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
    """Скользящее среднее за O(N) через накопленную сумму."""
    n = max(1, int(sec * SR))
    if n == 1:
        return x.copy()
    c = np.cumsum(np.concatenate([np.zeros(n // 2 + 1), x, np.zeros(n)]))
    return (c[n:n + len(x)] - c[:len(x)]) / n


def bandpass(x, lo, hi):
    return smooth(x, 1.0 / hi) - smooth(x, 1.0 / lo)


def reverb(x, sec=2.6, decay=0.6, seed=1):
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (decay * SR))
    ir[: int(0.015 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum())
    nfft = 1 << (len(x) + n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]


class Mix:
    def __init__(self, dur):
        self.n = int(dur * SR)
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)
        self.wet = np.zeros(self.n)   # то, что уйдёт в «тоннельную» реверберацию

    def put(self, sig, t, gain=1.0, pan=0.0, wet=0.3):
        i = int(t * SR)
        if i >= self.n or i + len(sig) <= 0:
            return
        s0 = max(0, -i)
        sig = sig[s0:]
        i = max(0, i)
        e = min(self.n, i + len(sig))
        seg = sig[: e - i] * gain
        self.L[i:e] += seg * (1 - pan) * 0.7
        self.R[i:e] += seg * (1 + pan) * 0.7
        self.wet[i:e] += seg * wet


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def crunch(rng, dur=0.14, bright=1.0):
    """Шаг по щебню: зернистый шум из микро-щелчков."""
    n = int(dur * SR)
    x = np.zeros(n)
    for _ in range(int(30 + 30 * rng.random())):
        p = int(rng.random() * n * 0.8)
        m = int(0.004 * SR)
        x[p:p + m] += rng.standard_normal(min(m, n - p)) * rng.random()
    x = bandpass(x, 250, 2600 + 1800 * bright) * env(n, 0.004, dur / 3)
    thump = np.sin(2 * np.pi * 70 * np.arange(n) / SR) * env(n, 0.002, 0.035) * 0.6
    return x * 3 + thump


def ev_room(m, cues, ev, rng):
    t = np.arange(m.n) / SR
    brown = np.cumsum(rng.standard_normal(m.n))
    brown -= smooth(brown, 0.5)
    brown /= np.max(np.abs(brown)) + 1e-9
    rumble = smooth(brown, 1 / 220) * 0.5 + 0.12 * np.sin(2 * np.pi * 50 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t))
    air = bandpass(rng.standard_normal(m.n), 400, 2500) * 0.035 * (0.7 + 0.3 * np.sin(2 * np.pi * 0.07 * t + 1))
    v = ev.get("vol", 1.0)
    m.L += (rumble + air) * 0.35 * v
    m.R += (rumble * 0.95 + air) * 0.35 * v
    # капли и редкие металлические скрипы — в реверберацию
    tt = 1.0
    while tt < m.n / SR - 1:
        f = 1300 + 1500 * rng.random()
        n = int(0.06 * SR)
        drip = np.sin(2 * np.pi * f * np.arange(n) / SR * (1 + 0.6 * np.exp(-np.arange(n) / (0.01 * SR)))) * env(n, 0.001, 0.015)
        m.put(drip, tt, 0.12 * v, pan=rng.random() * 1.6 - 0.8, wet=1.2)
        tt += 1.5 + rng.random() * 3.0
    for k in range(int(m.n / SR / 18)):
        n = int(1.2 * SR)
        x = np.arange(n) / SR
        creak = np.sin(2 * np.pi * (180 + 60 * np.sin(2 * np.pi * 1.3 * x)) * x) * env(n, 0.3, 0.5)
        m.put(creak * 0.05 * v, 6 + k * 18 + rng.random() * 8, pan=rng.random() - 0.5, wet=1.5)


def ev_powerdown(m, cues, t, ev, rng):
    v = ev.get("vol", 1.0)
    for d in (0, 0.12, 0.22, 0.34, 0.45):
        n = int(0.05 * SR)
        zap = rng.standard_normal(n) * env(n, 0.001, 0.012)
        m.put(bandpass(zap, 800, 6000) * 0.5 * v, t + d, wet=0.5)
    n = int(0.25 * SR)
    clunk = np.sin(2 * np.pi * 55 * np.arange(n) / SR) * env(n, 0.002, 0.08) + rng.standard_normal(n) * env(n, 0.001, 0.02) * 0.4
    m.put(clunk * 0.8 * v, t + 0.45, wet=0.6)
    n = int(2.4 * SR)
    x = np.arange(n) / SR
    f = 25 + 155 * np.exp(-x / 0.6)
    wind = sum(np.sin(2 * np.pi * np.cumsum(f * h) / SR) / h for h in (1, 2, 3)) * np.exp(-x / 0.9)
    m.put(wind * 0.25 * v, t + 0.45, wet=0.4)
    # гудение ламп до момента отключения
    n = int(t * SR)
    if n > 0:
        x = np.arange(n) / SR
        buzz = sum(np.sin(2 * np.pi * 100 * h * x) / h for h in range(1, 6)) * 0.02 * v
        buzz[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
        m.put(buzz, 0, wet=0.2)


def ev_doors(m, cues, t, ev, rng):
    v = ev.get("vol", 1.0)
    n = int(0.75 * SR)
    hiss = bandpass(rng.standard_normal(n), 1800, 7000) * env(n, 0.02, 0.25)
    m.put(hiss * 0.45 * v, t, pan=-0.3, wet=0.4)
    n2 = int(0.3 * SR)
    clunk = np.sin(2 * np.pi * 85 * np.arange(n2) / SR) * env(n2, 0.002, 0.06) + bandpass(rng.standard_normal(n2), 200, 2000) * env(n2, 0.001, 0.03)
    m.put(clunk * 0.7 * v, t + (0.55 if ev.get("open", True) else 0.45), pan=-0.2, wet=0.5)


def ev_steps(m, cues, t0, t1, ev, rng):
    v = ev.get("vol", 1.0)
    people = ev.get("people", 10)
    sync = ev.get("sync", False)
    rate = ev.get("rate", 1.9)
    away = ev.get("dir", "away") == "away"
    dur = max(0.1, t1 - t0)

    def gain_at(tt):
        k = min(1, max(0, (tt - t0) / dur))
        return (1 - k) ** 2.6 * 0.9 + 0.03 if away else 0.03 + 0.97 * k ** 1.8

    if sync:
        tt = t0
        while tt < t1:
            g = gain_at(tt)
            s = sum(crunch(rng, 0.16, bright=g) for _ in range(6)) / 3
            m.put(s * g * 0.8 * v, tt, wet=0.9)
            tt += 1.0 / rate
    else:
        for p in range(people):
            tt = t0 + rng.random() / rate
            pan = rng.random() * 1.2 - 0.6
            while tt < t1:
                g = gain_at(tt)
                m.put(crunch(rng, 0.12, bright=g) * g * 0.22 * v, tt, pan=pan, wet=0.9)
                tt += (1.0 / rate) * (0.9 + 0.2 * rng.random())


def ev_walk(m, cues, t0, t1, ev, rng):
    v = ev.get("vol", 1.0)
    tt, k = t0, 0
    while tt < t1:
        m.put(crunch(rng, 0.15) * 0.6 * v, tt, pan=-0.25 if k % 2 else 0.15, wet=0.5)
        tt += 0.55 + 0.05 * rng.random()
        k += 1


def ev_zap(m, cues, t, ev, rng):
    v = ev.get("vol", 1.0)
    d = ev.get("dur", 2.0)
    n = int(d * SR)
    x = np.arange(n) / SR
    hum = sum(np.sin(2 * np.pi * 50 * h * x) / h ** 0.8 for h in range(1, 9)) * 0.08
    hum *= np.minimum(1, x / 0.05) * np.minimum(1, (d - x) / 0.4)
    crack = np.zeros(n)
    for _ in range(int(d * 14)):
        p = int(rng.random() * (n - 800))
        crack[p:p + 800] += rng.standard_normal(800) * env(800, 0.0005, 0.004) * rng.random()
    m.put((hum + bandpass(crack, 1500, 9000) * 0.9) * v, t, pan=0.4, wet=0.4)


def ev_phone(m, cues, t, t_end, ev, rng):
    v = ev.get("vol", 1.0)
    n = int(0.12 * SR)
    clack = bandpass(rng.standard_normal(n), 600, 4000) * env(n, 0.001, 0.02)
    m.put(clack * 0.8 * v, t - 0.15, pan=-0.4, wet=0.3)
    n = int(max(0.2, t_end - t) * SR)
    x = np.arange(n) / SR
    line = bandpass(rng.standard_normal(n), 400, 3400) * 0.05
    for _ in range(int(len(x) / SR * 9)):
        p = int(rng.random() * (n - 400))
        line[p:p + 400] += rng.standard_normal(400) * env(400, 0.0005, 0.003) * 0.3
    line *= np.minimum(1, x / 0.05) * np.minimum(1, (x[-1] - x + 1e-3) / 0.3)
    m.put(line * v, t, pan=-0.3, wet=0.1)


def ev_clicks(m, cues, t0, t1, ev, rng):
    v = ev.get("vol", 1.0)
    count = ev.get("n", 20)
    for i in range(count):
        k = (i / count) ** 0.7
        tt = t0 + k * (t1 - t0)
        n = int(0.02 * SR)
        c = bandpass(rng.standard_normal(n), 1500, 6000) * env(n, 0.0005, 0.004)
        m.put(c * 0.18 * v, tt, pan=rng.random() * 0.8 - 0.4, wet=1.3)


def phone_voice(ep, cues, segs):
    """Отрезки голоса «как из трубки»: полоса 350–3200 Гц, лёгкий перегруз, сухость."""
    src = ep / "assets" / "voice.wav"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    v = np.frombuffer(raw, dtype=np.float32).astype(np.float64).copy()
    for a, b in segs:
        i, j = int(a * SR), int(b * SR)
        seg = v[i:j]
        tel = bandpass(seg, 350, 3200) * 2.2
        tel = np.tanh(tel * 1.8) / np.tanh(1.8)
        f = int(0.03 * SR)
        w = np.ones(len(seg))
        w[:f] = np.linspace(0, 1, f)
        w[-f:] = np.linspace(1, 0, f)
        v[i:j] = seg * (1 - w) + tel * w * (np.sqrt(np.mean(seg ** 2)) / (np.sqrt(np.mean(tel ** 2)) + 1e-9))
    out = ep / "assets" / "voice_fx.wav"
    write_wav(out, np.stack([v, v], axis=1))
    return out


def write_wav(path, st):
    st = st / max(1.0, np.max(np.abs(st)) / 0.97)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())


def main():
    ep = Path(sys.argv[1]).resolve()
    cues = cues_of(ep)
    events = json.loads((ep / "foley.json").read_text(encoding="utf-8"))
    dur = float(cues["_duration"])
    m = Mix(dur)
    rng = np.random.default_rng(17)
    T = lambda k, ev, key="offset": cues[k] + ev.get(key, 0.0)
    silences, tel = [], []
    for ev in events:
        ty = ev["type"]
        if ty == "room":
            ev_room(m, cues, ev, rng)
        elif ty == "powerdown":
            ev_powerdown(m, cues, T(ev["at"], ev), ev, rng)
        elif ty == "doors":
            ev_doors(m, cues, T(ev["at"], ev), ev, rng)
        elif ty == "steps":
            ev_steps(m, cues, T(ev["from"], ev), cues[ev["to"]] + ev.get("end_offset", 0.0), ev, rng)
        elif ty == "walk":
            ev_walk(m, cues, T(ev["from"], ev), cues[ev["to"]], ev, rng)
        elif ty == "zap":
            ev_zap(m, cues, T(ev["at"], ev), ev, rng)
        elif ty == "phone":
            ev_phone(m, cues, T(ev["at"], ev), cues[ev["to"]], ev, rng)
        elif ty == "clicks":
            ev_clicks(m, cues, T(ev["from"], ev), cues[ev["to"]], ev, rng)
        elif ty == "silence":
            silences.append((T(ev["at"], ev) - ev.get("pre", 0.6), T(ev["at"], ev)))
        elif ty == "phone_voice":
            tel.append((T(ev["from"], ev), cues[ev["to"]] + ev.get("end_offset", 0.0)))
    wet = reverb(m.wet, seed=3)
    L = m.L + wet * 0.8
    R = m.R + reverb(m.wet, seed=4) * 0.8
    g = np.ones(m.n)
    for a, b in silences:
        i, j = int(a * SR), int(b * SR)
        g[i:j] = np.minimum(g[i:j], np.linspace(1, 0.05, j - i))
        k = min(m.n, j + int(1.5 * SR))
        g[j:k] = np.minimum(g[j:k], np.linspace(0.05, 1, k - j))
    L *= g
    R *= g
    tmp = ep / "assets" / "foley_raw.wav"
    write_wav(tmp, np.stack([L, R], axis=1))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", "loudnorm=I=-22:TP=-2:LRA=16",
                    "-ar", str(SR), str(ep / "assets" / "foley.wav")], check=True)
    tmp.unlink()
    if tel:
        phone_voice(ep, cues, tel)
    print(f"foley.wav: {dur:.1f} c, событий: {len(events)}, отрезков «телефонного» голоса: {len(tel)}")


if __name__ == "__main__":
    main()
