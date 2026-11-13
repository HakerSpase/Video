#!/usr/bin/env python3
"""Экранный видеоряд промо приложения: video/assets/screen.mp4 (только экран телефона, без рамки).

    python3 promo/app/tools/screen.py

Источники в src/: rec1.mp4 (690×1536), rec2.mp4 и shot-*.jpg (1220×2712).
У всех обрезается верхняя полоска (часы, батарея) и нижняя полоска жестов.
Куски с почтой и личными данными в лист не входят (rec1 56.3–57.4, 62.5–67.5, 71.5+;
rec2 0–3.3).

Шот в cuts.json: start — секунда ролика; src + in/out (видео, растягивается под длину шота)
или img + z0/z1/fy0/fy1 (картинка: медленный наезд/панорама).
"""
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H, FPS = 1000, 2066, 30
# кроп экрана без статус-бара и полоски жестов: (y, h) в пикселях исходника
CROP = {"rec1": (72, 1424), "rec2": (135, 2525), "img": (135, 2525)}


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def build(i, s, n, dur, out):
    if "img" in s:
        y, h = CROP["img"]
        z0, z1 = s.get("z0", 1.0), s.get("z1", 1.0)
        fy0 = s.get("fy0", 0.0)
        fy1 = s.get("fy1", fy0)
        p = f"(on/{n})"
        z = f"({z0}+({z1}-{z0})*{p})"
        yy = f"(ih-ih/zoom)*({fy0}+({fy1}-{fy0})*{p})"
        vf = (f"crop=1220:{h}:0:{y},scale={W * 2}:{H * 2}:flags=lanczos,"
              f"zoompan=z='{z}':x='(iw-iw/zoom)/2':y='{yy}':d={n}:s={W}x{H}:fps={FPS},format=yuv420p")
        run(["-loop", "1", "-framerate", str(FPS), "-i", str(ROOT / "src" / s["img"]), "-vf", vf,
             "-frames:v", str(n), "-c:v", "libx264", "-crf", "14", "-preset", "fast", str(out)])
    else:
        y, h = CROP[s["src"]]
        w = 690 if s["src"] == "rec1" else 1220
        speed = (s["out"] - s["in"]) / dur
        vf = (f"trim={s['in']}:{s['out']},setpts=PTS-STARTPTS,setpts=PTS/{speed:.5f},fps={FPS},"
              f"crop={w}:{h}:0:{y},scale={W}:{H}:flags=lanczos,tpad=stop_mode=clone:stop_duration=1,format=yuv420p")
        run(["-i", str(ROOT / "src" / f"{s['src']}.mp4"), "-an", "-vf", vf, "-frames:v", str(n),
             "-c:v", "libx264", "-crf", "14", "-preset", "fast", str(out)])
    print(f"{i:02d} {s.get('src', s.get('img')):16} {s['start']:6.2f}+{dur:.2f}")


def main():
    cfg = json.loads((ROOT / "cuts.json").read_text())
    shots, end = cfg["shots"], cfg["end"]
    tmp = ROOT / "video" / "out" / "shots"
    tmp.mkdir(parents=True, exist_ok=True)
    parts, jobs = [], []
    for i, s in enumerate(shots):
        nxt = shots[i + 1]["start"] if i + 1 < len(shots) else end
        n = round(nxt * FPS) - round(s["start"] * FPS)
        out = tmp / f"s{i:02d}.mp4"
        parts.append(out)
        key = out.with_suffix(".key")
        k = json.dumps([s, n])
        if out.exists() and key.exists() and key.read_text() == k:
            continue
        jobs.append((i, s, n, n / FPS, out, key, k))
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(lambda j: (build(*j[:5]), j[5].write_text(j[6])), jobs))
    (tmp / "list.txt").write_text("".join(f"file '{p.name}'\n" for p in parts))
    run(["-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"), "-r", str(FPS), "-c:v", "libx264", "-crf", "16",
         "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(ROOT / "video" / "assets" / "screen.mp4")])
    print("→ video/assets/screen.mp4")


if __name__ == "__main__":
    main()
