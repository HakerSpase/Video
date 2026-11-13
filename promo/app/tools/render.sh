#!/usr/bin/env bash
# Сборка промо приложения → promo/app/out/averon-app.mp4
set -euo pipefail
P="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$P/tools/screen.py"   # экран по cuts.json (без почты и статус-бара)
python3 "$P/tools/music.py"    # музыка
python3 "$P/tools/sound.py"    # звуки интерфейса
python3 "$P/tools/voice.py"    # озвучка + приглушение музыки (после music.py)
cd "$P/video" && mkdir -p out
npx -y hyperframes@0.8.185 render -o out/raw.mp4
mkdir -p "$P/out"
ffmpeg -v error -y -i out/raw.mp4 -c:v libx264 -preset slow -crf 18 -maxrate 12M -bufsize 24M -pix_fmt yuv420p \
  -profile:v high -level 4.1 -g 60 -af "loudnorm=I=-14:TP=-1:LRA=11" -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart "$P/out/averon-app.mp4"
echo "Готово: $P/out/averon-app.mp4"
