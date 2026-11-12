#!/usr/bin/env bash
# Полная сборка трейлера PS1 collection → promo/ps1-collection/out/ps1-trailer.mp4
#   promo/ps1-collection/tools/render.sh
set -euo pipefail
P="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$P/tools/edit.py"     # видеоряд по edit.json
python3 "$P/tools/sound.py"    # звуковой дизайн
python3 "$P/tools/music.py"    # музыка
cd "$P/trailer" && mkdir -p out
npx -y hyperframes@0.8.185 render -o out/raw.mp4
mkdir -p "$P/out"
# упаковка под телефоны: H.264 High, 30 к/с, faststart, громкость −14 LUFS (стандарт соцсетей)
ffmpeg -v error -y -i out/raw.mp4 -c:v libx264 -preset slow -crf 18 -maxrate 12M -bufsize 24M -pix_fmt yuv420p \
  -profile:v high -level 4.1 -g 60 -af "loudnorm=I=-14:TP=-1:LRA=11" -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart "$P/out/ps1-trailer.mp4"
echo "Готово: $P/out/ps1-trailer.mp4"
