#!/usr/bin/env python3
"""Видеоряд трейлера PS1 collection по монтажному листу edit.json.

    python3 promo/ps1-collection/tools/edit.py   → trailer/assets/edit.mp4 (1080×1920, 30 к/с, без звука)

Шот:  start — секунда ролика (длится до следующего шота)
      src   — clips/<src>.mp4, in/out — кусок клипа; rev — задом наперёд
      freeze — секунда клипа для стоп-кадра (вместо in/out)
      black — чёрный кадр
      z, z1 — зум (кроп) в начале/конце шота, fx/fy — точка фокуса 0..1
      lb    — «кинорамка»: горизонтальный клип по ширине, поля сверху/снизу
      fx_dim — размыть и притушить (фон под титры)
"""
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H, FPS = 1080, 1920, 30


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def shot_vf(s, n, dur):
    vf = []
    if "freeze" in s:
        vf += [f"trim=start={s['freeze']}", "setpts=PTS-STARTPTS", "select=eq(n\\,0)",
               f"tpad=stop_mode=clone:stop_duration={dur + 1}", f"fps={FPS}"]
    else:
        vf += [f"trim={s['in']}:{s['out']}", "setpts=PTS-STARTPTS"]
        if s.get("rev"):
            vf.append("reverse")
        speed = (s["out"] - s["in"]) / dur
        vf.append(f"setpts=PTS/{speed:.5f}")
        # замедление — интерполяция по движению (24 к/с исходника → 30 к/с плавно)
        vf.append(f"minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
                  if speed < 0.9 else f"fps={FPS}")
        vf.append(f"tpad=stop_mode=clone:stop_duration=1")
    z0 = s.get("z", 1.0)
    z1 = s.get("z1", z0)
    fx, fy = s.get("fx", 0.5), s.get("fy", 0.5)
    if s.get("lb"):
        z = f"({z0}+({z1}-{z0})*t/{dur:.3f})"
        LH = 1200  # почти квадрат: крупнее, чем 16:9 по ширине, и всё ещё «кинорамка»
        vf += [f"scale=-2:{LH}:flags=lanczos",
               f"scale=w='trunc(iw*{z}/2)*2':h='trunc(ih*{z}/2)*2':eval=frame:flags=lanczos",
               f"crop={W}:{LH}:(iw-{W})*{fx}:(ih-{LH})*{fy}",
               f"pad={W}:{H}:0:(oh-ih)/2:black"]
    else:
        # зум через zoompan: размер кадра постоянный, точка фокуса считается от реального зума
        # (scale с eval=frame + crop давал сдвиг фокуса — crop берёт размер первого кадра)
        tt = f"(on/{FPS})"
        p = f"(1-pow(1-min({tt}/{dur:.3f}\\,1)\\,3))" if s.get("ease") else f"min({tt}/{dur:.3f}\\,1)"
        z = f"({z0}+({z1}-{z0})*{p})"
        if "px" in s:
            x = f"max(0\\,min(iw-iw/zoom\\,{s['px']}*iw-iw/zoom/2))"
            y = f"max(0\\,min(ih-ih/zoom\\,{s['py']}*ih-ih/zoom/2))"
        else:
            x, y = f"(iw-iw/zoom)*{fx}", f"(ih-ih/zoom)*{fy}"
        vf += [f"scale={W * 2}:{H * 2}:flags=lanczos",
               f"zoompan=z='{z}':x='{x}':y='{y}':d=1:s={W}x{H}:fps={FPS}"]
    if s.get("fx_dim"):
        vf += ["gblur=sigma=28", "eq=brightness=-0.18:saturation=0.6"]
    vf += ["setsar=1", "format=yuv420p"]
    return ",".join(vf)


def main():
    cfg = json.loads((ROOT / "edit.json").read_text())
    shots, end = cfg["shots"], cfg["end"]
    tmp = ROOT / "trailer" / "out" / "shots"
    tmp.mkdir(parents=True, exist_ok=True)
    parts, jobs = [], []
    for i, s in enumerate(shots):
        nxt = shots[i + 1]["start"] if i + 1 < len(shots) else end
        n = round(nxt * FPS) - round(s["start"] * FPS)
        dur = n / FPS
        out = tmp / f"s{i:02d}.mp4"
        parts.append(out)
        key = out.with_suffix(".key")
        k = json.dumps([s, n])
        if out.exists() and key.exists() and key.read_text() == k:
            continue
        jobs.append((i, s, n, dur, out, key, k))
    def do(j):
        i, s, n, dur, out, key, k = j
        if s.get("black"):
            run(["-f", "lavfi", "-i", f"color=black:s={W}x{H}:r={FPS}", "-frames:v", str(n),
                 "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "12", str(out)])
        else:
            run(["-i", str(ROOT / "clips" / f"{s['src']}.mp4"), "-an", "-vf", shot_vf(s, n, dur),
                 "-frames:v", str(n), "-c:v", "libx264", "-crf", "12", "-preset", "fast", str(out)])
        key.write_text(k)
        print(f"{i:02d} {s.get('src', 'black'):6} {s['start']:6.2f}+{dur:.2f}")
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(do, jobs))
    lst = tmp / "list.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    grade = cfg.get("grade", "eq=contrast=1.05:saturation=0.9")
    run(["-f", "concat", "-safe", "0", "-i", str(lst), "-vf", grade, "-r", str(FPS), "-c:v", "libx264",
         "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         str(ROOT / "trailer" / "assets" / "edit.mp4")])
    print("→ trailer/assets/edit.mp4")


if __name__ == "__main__":
    main()
