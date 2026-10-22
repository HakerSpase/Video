#!/usr/bin/env bash
# Пересобрать звук готового out/final.mp4 без перерендера картинки:
# сводит все <audio> из index.html (голос, музыка, эффекты) как HyperFrames и кладёт поверх видео.
#   tools/remix.sh episodes/003-pocherk-vlevo
set -euo pipefail
EP="${1:?путь к эпизоду}"
cd "$EP"
python3 - <<'PY'
import re, subprocess
html = open("index.html", encoding="utf-8").read()
ins, flt, k = [], [], 0
for m in re.finditer(r'<audio id="([^"]+)"[^>]*src="([^"]+)"[^>]*data-start="([\d.]+)"[^>]*data-duration="([\d.]+)"[^>]*data-volume="([\d.]+)"([^>]*)>', html):
    _id, src, st, du, vol, rest = m.groups()
    fi = re.search(r'data-fade-in="([\d.]+)"', rest); fo = re.search(r'data-fade-out="([\d.]+)"', rest)
    ins += ["-i", src]
    f = f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{du},asetpts=PTS-STARTPTS"
    if fi: f += f",afade=t=in:d={fi.group(1)}"
    if fo: f += f",afade=t=out:st={float(du)-float(fo.group(1)):.3f}:d={fo.group(1)}"
    f += f",volume={vol},adelay={int(float(st)*1000)}:all=1[a{k}]"
    flt.append(f); k += 1
mix = "".join(f"[a{i}]" for i in range(k)) + f"amix=inputs={k}:normalize=0:dropout_transition=0,alimiter=limit=0.89,loudnorm=I=-16:TP=-1.5:LRA=11[out]"
subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(flt + [mix]), "-map", "[out]", "-ar", "48000", "out/mix.wav"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "out/final.mp4", "-i", "out/mix.wav", "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", "out/final_mix.mp4"], check=True)
print("клипов в сведении:", k)
PY
mv out/final_mix.mp4 out/final.mp4 && rm -f out/mix.wav
echo "Звук пересобран: $EP/out/final.mp4"
