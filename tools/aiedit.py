#!/usr/bin/env python3
"""Монтаж сгенерированных клипов под голос.

    python3 tools/aiedit.py episodes/NNN            → episodes/NNN/assets/ai.mp4 (1080×1920, без звука)

Монтажный лист — ai/edit.json: каждый шот начинается в `start` (секунда ролика) и длится до
следующего; кусок клипа ai/clips/<src>.mp4 [in, out] растягивается/ужимается под эту длину.
Картинка (`img`) — медленный наезд. В конце — общий грейд и виньетка.
Готовые шоты кэшируются в out/ai_shots: правка листа пересобирает только изменённые.
"""
import json
import subprocess
import sys
from pathlib import Path

W, H = 1080, 1920


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def main():
    ep = Path(sys.argv[1])
    cfg = json.loads((ep / "ai" / "edit.json").read_text())
    fps, shots = cfg["fps"], cfg["shots"]
    tmp = ep / "out" / "ai_shots"
    tmp.mkdir(parents=True, exist_ok=True)
    parts = []
    for i, s in enumerate(shots):
        end = shots[i + 1]["start"] if i + 1 < len(shots) else cfg["end"]
        n = round(end * fps) - round(s["start"] * fps)
        dur = n / fps
        out = tmp / f"s{i:02d}.mp4"
        parts.append(out)
        key = json.dumps([s, n])
        if out.exists() and (out.with_suffix(".key")).exists() and out.with_suffix(".key").read_text() == key:
            continue
        if "img" in s:
            z = s.get("zoom", 0.06)
            vf = (f"scale=w='trunc({W}*(1+{z}*t/{dur:.3f})/2)*2':h='trunc({H}*(1+{z}*t/{dur:.3f})/2)*2':eval=frame:flags=lanczos,"
                  f"crop={W}:{H},fps={fps},format=yuv420p")
            run(["-loop", "1", "-framerate", str(fps), "-t", f"{dur + 0.5:.3f}", "-i", str(ep / "ai" / "clips" / s["img"]),
                 "-vf", vf, "-frames:v", str(n), "-c:v", "libx264", "-crf", "12", "-preset", "fast", str(out)])
        else:
            # hold — сколько секунд в конце шота держать последний кадр (стоп-кадр)
            speed = (s["out"] - s["in"]) / (dur - s.get("hold", 0))
            # delogo — замазать мелочь в кадре (шевроны): [[t0, t1, x, y, w, h], ...] во времени и пикселях исходника
            vf = [f"delogo=x={x}:y={y}:w={w}:h={h}:enable='between(t,{t0},{t1})'" for t0, t1, x, y, w, h in s.get("delogo", [])]
            vf += [f"trim={s['in']}:{s['out']}", "setpts=PTS-STARTPTS", f"setpts=PTS/{speed:.5f}"]
            if "crop" in s:
                x, y, w, h = s["crop"]
                vf.append(f"crop={w}:{h}:{x}:{y}")
            vf.append(f"scale={W}:{H}:flags=lanczos")
            # замедление сильнее ~15% — смешиваем соседние кадры, иначе дёргается
            mode = s.get("interp", "blend")
            vf.append(f"minterpolate=fps={fps}:mi_mode={mode}" if speed < 0.85 else f"fps={fps}")
            vf += [f"tpad=stop_mode=clone:stop_duration={1 + s.get('hold', 0)}", "format=yuv420p"]
            run(["-i", str(ep / "ai" / "clips" / f"{s['src']}.mp4"), "-an", "-vf", ",".join(vf), "-frames:v", str(n),
                 "-c:v", "libx264", "-crf", "12", "-preset", "fast", str(out)])
        out.with_suffix(".key").write_text(key)
        print(f"{i:02d} {s.get('src', s.get('img'))} {s['start']:7.2f}+{dur:.2f}" + (f" ×{speed:.2f}" if "img" not in s else ""))
    lst = tmp / "list.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    # общий грейд: чуть холоднее и плотнее, приглушённый цвет, виньетка; вход из чёрного.
    # Зерно — в финальной сборке (aifinal.py), иначе этот промежуточный файл раздувается в разы
    grade = ("eq=contrast=1.06:saturation=0.86:gamma=0.97,"
             "colorbalance=rs=-0.03:bs=0.04:rh=0.02:bh=-0.02,"
             "vignette=angle=PI/5,fade=in:st=0:d=0.4")
    run(["-f", "concat", "-safe", "0", "-i", str(lst), "-vf", grade, "-r", str(fps), "-c:v", "libx264", "-crf", "17",
         "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(ep / "assets" / "ai.mp4")])
    print("→", ep / "assets" / "ai.mp4")


if __name__ == "__main__":
    main()
