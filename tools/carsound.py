#!/usr/bin/env python3
"""Звуковой дизайн «Кресла у руля»: дождь, город, машина (замки, двери, кресло, мотор), телефон, бег — по битам.

    python3 tools/carsound.py episodes/015-kreslo-u-rulya

Читает episodes/<ep>/carsound.json:
  {"beds":   [["rain_out", from, to, gain], ["rain_in", ...], ["city", ...], ["idle", ...], ["drive", ...], ["drone", ...]],
   "events": [["unlock", t, gain], ["door_close", t], ["lever", t], ["push", t], ["ring", t0, t1], ["steps_run", t0, t1], ...],
   "phone_voice": [[from, to], ...],     отрезки голоса «как из трубки» → assets/voice_fx.wav
   "duck": [[from, to, gain]]}           всё, кроме голоса, приглушить на отрезке (тишина перед ударом)
Время — секунды или «бит», «бит+0.4». Живые записи (если есть) — assets/sfx/<имя>.mp3:
heartbeat, breathing, vibrate (иначе синтез). Пишет assets/foley.wav. Детерминировано.
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parent


def cues_of(ep):
    s = (ep / "assets" / "cues.js").read_text(encoding="utf-8")
    return json.loads(s[s.index("{"): s.rindex("}") + 1])


def smooth(x, sec):
    n = max(1, int(sec * SR))
    if n == 1:
        return x.copy()
    c = np.cumsum(np.concatenate([np.zeros(n // 2 + 1), x, np.zeros(n)]))
    return (c[n:n + len(x)] - c[:len(x)]) / n


def lp(x, hz):
    return smooth(smooth(x, 1.0 / hz), 1.0 / hz)


def bp(x, lo, hi):
    return lp(x, hi) - lp(x, lo)


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def fades(n, a, r):
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


def conv(x, ir):
    nfft = 1 << (len(x) + len(ir) - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]


def verb_ir(sec, decay, seed):
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (decay * SR))
    ir = lp(ir, 5000)
    ir[: int(0.015 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum())


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


# ---------------- синтез ----------------

def rain(rng, sec, inside):
    n = int(sec * SR)
    w = rng.standard_normal(n)
    if inside:
        # по крыше: глухой шорох + капли-удары
        x = lp(w, 1400) * 0.6
        drops = np.zeros(n)
        for p in rng.integers(0, n, int(sec * 55)):
            m = int(0.03 * SR)
            k = min(m, n - p)
            drops[p:p + k] += np.sin(2 * np.pi * (180 + 160 * rng.random()) * np.arange(k) / SR) * np.exp(-np.arange(k) / (0.006 * SR)) * rng.random()
        x += drops * 0.9
    else:
        x = bp(w, 500, 9000) * 0.7 + bp(w, 2000, 12000) * 0.3
        drops = np.zeros(n)
        for p in rng.integers(0, n, int(sec * 140)):
            k = min(int(0.008 * SR), n - p)
            drops[p:p + k] += rng.standard_normal(k) * np.exp(-np.arange(k) / (0.0015 * SR)) * rng.random()
        x += bp(drops, 1500, 9000) * 1.2
    return norm(x)


def city(rng, sec):
    n = int(sec * SR)
    b = np.cumsum(rng.standard_normal(n))
    b -= smooth(b, 0.5)
    x = lp(b, 160) * 0.8
    # далёкие проезды
    for c in rng.uniform(0, sec, int(sec / 7)):
        i = int(c * SR)
        m = int(4 * SR)
        k = min(m, n - i)
        if k <= 0:
            continue
        e = np.hanning(m)[:k]
        x[i:i + k] += bp(rng.standard_normal(k), 200, 1500) * e * 0.5
    return norm(x)


def engine(sec, rpm0, rpm1, inside=True, seed=1):
    n = int(sec * SR)
    rng = np.random.default_rng(seed)
    rpm = np.linspace(rpm0, rpm1, n) ** 1.0
    f = rpm / 60 * 2  # 4 цилиндра — 2 вспышки за оборот
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * 1.0 + np.sin(2 * ph + 0.3) * 0.5 + np.sin(3 * ph + 1.1) * 0.25 + np.sin(0.5 * ph) * 0.4
    x *= 1 + 0.15 * np.sin(ph * 0.25)
    x += lp(rng.standard_normal(n), 400) * 0.4
    if inside:
        x = lp(x, 260)
    else:
        x = lp(x, 900)
    return norm(x)


def tires(rng, sec, speed0, speed1):
    n = int(sec * SR)
    s = np.linspace(speed0, speed1, n)
    x = bp(rng.standard_normal(n), 300, 2500) * s
    x += bp(rng.standard_normal(n), 2000, 7000) * s * 0.5  # мокрый асфальт — шипение
    return x / (np.max(np.abs(x)) + 1e-9)


def thump(rng, low=70, dur=0.35, rattle=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = low * (1 + 0.6 * np.exp(-t / 0.02))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.09)
    x += lp(rng.standard_normal(n), 900) * env(n, 0.001, 0.05) * 0.8
    x += bp(rng.standard_normal(n), 2000, 7000) * env(n, 0.002, 0.03) * rattle
    return norm(x)


def click(rng, f=3200, dur=0.02, amp=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) * 0.5 + rng.standard_normal(n)) * np.exp(-t / 0.003) * amp


def beep(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * fades(n, 0.005, 0.02)


def creak(rng, dur, f0=140, f1=90, rough=0.6):
    n = int(dur * SR)
    f = np.linspace(f0, f1, n) * (1 + 0.04 * np.sin(np.arange(n) / SR * 2 * np.pi * 7))
    ph = 2 * np.pi * np.cumsum(f) / SR
    pulses = (np.sin(ph) > 0.92).astype(float)
    x = conv(pulses, np.exp(-np.arange(int(0.004 * SR)) / (0.0008 * SR)))
    x = bp(x + rng.standard_normal(n) * 0.05 * rough, 150, 3000)
    return norm(x) * fades(n, 0.05, 0.1)


def ringtone(sec):
    n = int(sec * SR)
    x = np.zeros(n)
    notes = [880, 1108.7, 1318.5, 1108.7]
    step = 0.16
    k = 0
    t = 0.0
    while t < sec:
        for j, f in enumerate(notes):
            tt = t + j * step
            m = int(0.14 * SR)
            i = int(tt * SR)
            if i + m > n:
                break
            u = np.arange(m) / SR
            x[i:i + m] += (np.sin(2 * np.pi * f * u) + 0.4 * np.sin(2 * np.pi * 2 * f * u)) * np.exp(-u / 0.06)
        t += 1.4
        k += 1
    return norm(x)


def vibrate(sec):
    n = int(sec * SR)
    t = np.arange(n) / SR
    gate = ((t % 1.0) < 0.45).astype(float)
    x = np.sin(2 * np.pi * 175 * t) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 21 * t))) * smooth(gate, 0.01)
    return norm(lp(x, 900))


def footstep_wet(rng):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    slap = lp(rng.standard_normal(n), 1200) * np.exp(-t / 0.012)
    splash = bp(rng.standard_normal(n), 1500, 8000) * np.exp(-((t - 0.02) ** 2) / 0.0006) * 0.7
    body = np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.03) * 0.8
    return norm(slap + splash + body)


def heartbeat_syn(rng, sec, bpm):
    n = int(sec * SR)
    x = np.zeros(n)
    per = 60 / bpm
    t = 0.0
    while t < sec:
        for dt, a in ((0, 1.0), (0.28, 0.6)):
            i = int((t + dt) * SR)
            m = int(0.15 * SR)
            if i + m > n:
                continue
            u = np.arange(m) / SR
            x[i:i + m] += np.sin(2 * np.pi * 48 * u) * np.exp(-u / 0.05) * a
        t += per
    return norm(lp(x, 140))


def drone(rng, sec, base=55):
    n = int(sec * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k, (f, a) in enumerate(((base, 1), (base * 1.5, 0.4), (base * 2.01, 0.3), (base * 0.5, 0.6))):
        x += np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 0.07 * (k + 1) * t) * 2) * a
    x += lp(rng.standard_normal(n), 300) * 0.3
    return norm(x)


def chime():
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 988 * t) * np.exp(-t / 0.25) * (t < 0.45)
    x2 = np.zeros(n)
    i = int(0.18 * SR)
    x2[i:] = np.sin(2 * np.pi * 1318 * t[: n - i]) * np.exp(-t[: n - i] / 0.35)
    return norm(x + x2)


# ---------------- сборка ----------------

def main():
    ep = Path(sys.argv[1])
    spec = json.loads((ep / "carsound.json").read_text(encoding="utf-8"))
    cues = cues_of(ep)
    dur = cues["_duration"] + 0.5
    N = int(dur * SR)
    L = np.zeros(N)
    Rr = np.zeros(N)
    wet = np.zeros(N)
    rng = np.random.default_rng(15)

    def T(v):
        if isinstance(v, (int, float)):
            return float(v)
        if "+" in v:
            a, b = v.split("+")
            return cues[a] + float(b)
        if "-" in v[1:]:
            a, b = v.rsplit("-", 1)
            return cues[a] - float(b)
        return cues[v] if v != "end" else dur

    def put(sig, t, g=1.0, pan=0.0, w=0.15):
        i = int(t * SR)
        if i >= N:
            return
        if i < 0:
            sig, i = sig[-i:], 0
        e = min(N, i + len(sig))
        s = sig[: e - i] * g
        L[i:e] += s * min(1, 1 - pan)
        Rr[i:e] += s * min(1, 1 + pan)
        wet[i:e] += s * w

    def bed(sig, a, b, g, fade=0.3, pan=0.0, w=0.05):
        n = int((b - a) * SR)
        if n <= 0:
            return
        s = np.resize(sig, n) * fades(n, fade, fade)
        put(s, a, g, pan, w)

    def sample(name, fallback):
        p = ep / "assets" / "sfx" / (name + ".mp3")
        try:
            return norm(load(p)) if p.exists() else fallback
        except Exception:
            return fallback

    beds = {
        "rain_out": lambda s: rain(rng, s, False),
        "rain_in": lambda s: rain(rng, s, True),
        "city": lambda s: city(rng, s),
        "idle": lambda s: engine(s, 820, 840, True),
        "idle_out": lambda s: engine(s, 820, 840, False),
        "drone": lambda s: drone(rng, s),
        "drone_low": lambda s: drone(rng, s, 41),
        "buzz": lambda s: norm(np.sin(2 * np.pi * 100 * np.arange(int(s * SR)) / SR) + 0.5 * np.sin(2 * np.pi * 200 * np.arange(int(s * SR)) / SR)),
        "heart": lambda s: sample("heartbeat", heartbeat_syn(rng, s, 96)),
        "breath": lambda s: sample("breathing", lp(rng.standard_normal(int(s * SR)), 1500) * 0.3),
    }
    for b in spec.get("beds", []):
        kind, a, z, g = b[0], T(b[1]), T(b[2]), b[3]
        o = b[4] if len(b) > 4 else {}
        bed(beds[kind](z - a + 0.1), a, z, g, o.get("fade", 0.3), o.get("pan", 0.0), o.get("wet", 0.05))

    for ev in spec.get("events", []):
        kind, t = ev[0], T(ev[1])
        g = ev[2] if len(ev) > 2 and isinstance(ev[2], (int, float)) else 1.0
        if kind == "unlock":
            put(beep(2700, 0.07), t, 0.35 * g, 0.2, 0.3)
            put(beep(2700, 0.07), t + 0.13, 0.35 * g, 0.2, 0.3)
            put(thump(rng, 120, 0.12, 0.6), t + 0.05, 0.5 * g, 0.1, 0.2)
        elif kind == "door_open":
            put(click(rng, 2500, 0.03), t, 0.6 * g, 0, 0.1)
            put(thump(rng, 90, 0.2, 0.2), t + 0.02, 0.4 * g)
        elif kind == "door_close":
            put(thump(rng, 65, 0.45, 0.35), t, 0.9 * g, 0, 0.25)
        elif kind == "door_slam_far":
            x = thump(rng, 60, 0.5, 0.4)
            put(lp(x, 1500), t, 0.8 * g, -0.3, 0.6)
        elif kind == "lever":
            for k in range(4):
                put(click(rng, 1800 + 300 * k, 0.025), t + k * 0.05, 0.5 * g)
            put(creak(rng, 0.4, 220, 160, 0.4), t + 0.1, 0.35 * g)
        elif kind == "stuck":
            put(thump(rng, 110, 0.15, 0.1), t, 0.6 * g)
            put(creak(rng, 0.6, 160, 120), t + 0.05, 0.5 * g)
        elif kind == "push":
            put(creak(rng, 1.6, 110, 70, 0.9), t, 0.9 * g, 0, 0.1)
            put(thump(rng, 50, 0.6, 0.0), t + 0.25, 0.8 * g)
        elif kind == "creak":
            put(creak(rng, ev[3] if len(ev) > 3 else 1.0, 130, 95), t, 0.6 * g)
        elif kind == "start":
            n = int(0.9 * SR)
            u = np.arange(n) / SR
            starter = lp(np.sign(np.sin(2 * np.pi * 14 * u)) + rng.standard_normal(n) * 0.3, 500) * fades(n, 0.05, 0.1)
            put(norm(starter), t, 0.4 * g)
            put(engine(1.2, 1500, 850, True), t + 0.8, 0.6 * g)
        elif kind == "drive":
            t1 = T(ev[2]) if len(ev) > 2 and not isinstance(ev[2], (int, float)) else t + 4
            g = ev[3] if len(ev) > 3 else 1.0
            s = t1 - t
            put(engine(s, 900, 2400, ev[4] if len(ev) > 4 else True) * fades(int(s * SR), 0.3, 0.6), t, 0.55 * g)
            put(tires(rng, s, 0.2, 1.0) * fades(int(s * SR), 0.3, 0.6), t, 0.25 * g)
        elif kind == "away":
            t1 = T(ev[2])
            g = ev[3] if len(ev) > 3 else 1.0
            s = t1 - t
            n = int(s * SR)
            e = np.linspace(1, 0.15, n) ** 1.5 * fades(n, 0.2, 0.8)
            put(engine(s, 900, 2800, False) * e, t, 0.6 * g, 0.4, 0.3)
            put(tires(rng, s, 0.3, 1.0) * e, t, 0.35 * g, 0.4, 0.3)
        elif kind == "brake":
            n = int(0.8 * SR)
            put(bp(rng.standard_normal(n), 800, 4000) * fades(n, 0.05, 0.4) * np.linspace(1, 0.3, n), t, 0.2 * g)
        elif kind == "ring":
            t1 = T(ev[2])
            put(vibrate(t1 - t), t, 0.35, 0.0, 0.05)
            put(ringtone(t1 - t), t, 0.25, 0.0, 0.15)
        elif kind == "pickup":
            put(beep(1400, 0.06), t, 0.2)
        elif kind == "signal":
            t1 = T(ev[2])
            k = 0
            while t + k * 0.42 < t1:
                put(click(rng, 2600 if k % 2 == 0 else 1900, 0.02), t + k * 0.42, 0.35, 0.3)
                k += 1
        elif kind == "steps_run":
            t1 = T(ev[2])
            k = 0
            tt = t
            while tt < t1:
                put(footstep_wet(np.random.default_rng(100 + k)), tt, 0.7 * g, 0.15 if k % 2 else -0.15, 0.2)
                tt += 0.29 + 0.03 * np.sin(k)
                k += 1
        elif kind == "chime":
            put(chime(), t, 0.4 * g, 0, 0.3)
        elif kind == "sting":
            # оркестровый удар: суббас + треск + реверб
            n = int(3 * SR)
            u = np.arange(n) / SR
            x = np.sin(2 * np.pi * np.cumsum(32 + 70 * np.exp(-u / 0.07)) / SR) * env(n, 0.002, 0.9)
            x += lp(rng.standard_normal(n), 2500) * env(n, 0.001, 0.12) * 0.6
            put(norm(x), t, 0.9 * g, 0, 0.5)
        elif kind == "whoosh":
            n = int(0.7 * SR)
            u = np.linspace(0, 1, n)
            x = bp(rng.standard_normal(n), 400, 5000) * np.sin(np.pi * u) ** 2
            put(norm(x), t - 0.35, 0.35 * g, 0, 0.2)
        elif kind == "riser":
            t1 = T(ev[2])
            n = int((t1 - t) * SR)
            u = np.linspace(0, 1, n)
            f = 200 + 1800 * u ** 2
            x = bp(rng.standard_normal(n), 300, 6000) * u ** 2 + np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 3 * 0.3
            put(norm(x), t, 0.35 * g, 0, 0.3)

    # тишина: всё, кроме голоса, проседает
    for a, b, gg in spec.get("duck", []):
        i, j = int(T(a) * SR), int(T(b) * SR)
        e = np.ones(N)
        e[i:j] = gg
        e = smooth(e, 0.15)
        L *= e
        Rr *= e
        wet *= e

    ir = verb_ir(2.2, 0.55, 3)
    rv = conv(wet, ir) * 0.5
    out = np.stack([L + rv, Rr + rv], axis=1)
    out /= max(1e-9, np.max(np.abs(out))) / 0.9
    with wave.open(str(ep / "assets" / "foley.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 32767).astype("<i2").tobytes())
    print("foley.wav", round(dur, 1), "с")

    # голос «как из трубки» на отрезках
    pv = spec.get("phone_voice", [])
    vpath = ep / "assets" / "voice.wav"
    if pv and vpath.exists():
        v = load(vpath)
        for a, b in pv:
            i, j = int(T(a) * SR), int(T(b) * SR)
            seg = v[i:j]
            if len(seg) == 0:
                continue
            f = bp(seg, 350, 3200)
            f = np.tanh(f * 3) / 3
            f = norm(f) * np.max(np.abs(seg))
            k = min(len(seg), int(0.03 * SR))
            m = np.ones(len(seg))
            m[:k] = np.linspace(0, 1, k)
            m[-k:] = np.linspace(1, 0, k)
            v[i:j] = seg * (1 - m) + f * m
        with wave.open(str(ep / "assets" / "voice_fx.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((np.clip(v, -1, 1) * 32767).astype("<i2").tobytes())
        print("voice_fx.wav")


if __name__ == "__main__":
    main()
