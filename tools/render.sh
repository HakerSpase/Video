#!/usr/bin/env bash
# Собрать и отрендерить эпизод в episodes/<ep>/out/final.mp4
#   tools/render.sh episodes/001-antresol            — финал (нужна озвучка assets/voice.*)
#   tools/render.sh episodes/001-antresol --draft    — черновик без озвучки
set -euo pipefail
EP="${1:?путь к эпизоду}"; MODE="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HF="npx -y hyperframes@0.8.185"
cd "$EP"
if [[ "$MODE" != "--draft" ]] && ! ls assets/voice.* >/dev/null 2>&1; then
  echo "Нет assets/voice.(wav|mp3|m4a) — положите озвучку или запустите с --draft" >&2; exit 1
fi
# whisper (если установлен whisper-cpp) даёт самые точные тайминги слов; без него — выравнивание по паузам
if [[ "$MODE" != "--draft" ]] && [[ ! -f assets/transcript.json ]] && command -v whisper-cli >/dev/null 2>&1; then
  $HF transcribe assets/voice.* --model small --language ru --json >/dev/null || true
fi
python3 "$ROOT/tools/build.py" .
# звуковой дизайн по битам (foley.json): шумы, фоли, «телефонный» голос
if [[ -f foley.json ]]; then python3 "$ROOT/tools/foley.py" . && python3 "$ROOT/tools/build.py" .; fi
# своя музыка — assets/music.(mp3|wav…); если её нет, генерируем нагнетающий фон под тайминги эпизода
if ! ls assets/music.* >/dev/null 2>&1; then
  python3 "$ROOT/tools/score.py" . && python3 "$ROOT/tools/build.py" .
fi
$HF check --json > .hyperframes/check.json 2>/dev/null || true
mkdir -p out
OUT=out/final.mp4; [[ "$MODE" == "--draft" ]] && OUT=out/draft.mp4
$HF render -o "$OUT.raw.mp4"
# финальная упаковка под телефоны: H.264 High 4.1, опорный кадр каждые 2 с, faststart, битрейт до 9 Мбит/с
ffmpeg -v error -y -i "$OUT.raw.mp4" -c:v libx264 -preset slow -crf 20 -maxrate 9M -bufsize 18M -pix_fmt yuv420p \
  -profile:v high -level 4.1 -g 60 -keyint_min 30 -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"
rm -f "$OUT.raw.mp4"
echo "Готово: $EP/$OUT"
