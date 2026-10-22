#!/usr/bin/env bash
# Зависимости для серверов GitHub: ffmpeg и hyperframes (+ браузер, если передан аргумент browser).
# ffmpeg — статическая сборка с GitHub Releases (зеркала apt на раннерах иногда висят по 10+ минут),
# apt только запасной путь (на раннерах он иногда висит на триггерах man-db). Каждая загрузка с таймаутом и повторами.
set -u
retry() { for i in 1 2 3 4; do timeout "$1" "${@:2}" && return 0; echo "повтор $i: ${*:2}"; sleep $((i * 3)); done; return 1; }

FF="$HOME/.cache/ffmpeg-static"
get_ffmpeg() {
  mkdir -p "$FF" &&
  curl -fsSL --retry 3 --connect-timeout 15 --max-time 120 -o /tmp/ff.tar.xz \
    https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz &&
  tar -xJf /tmp/ff.tar.xz -C "$FF" --strip-components=2 --wildcards '*/bin/ffmpeg' '*/bin/ffprobe'
}
if ! command -v ffmpeg >/dev/null; then
  if [ -x "$FF/ffmpeg" ] || get_ffmpeg || get_ffmpeg; then
    sudo ln -sf "$FF/ffmpeg" /usr/local/bin/ffmpeg && sudo ln -sf "$FF/ffprobe" /usr/local/bin/ffprobe
  else
    retry 90 sudo apt-get update -qq -o Acquire::Retries=3 -o Acquire::http::Timeout=20 || true
    retry 180 sudo apt-get install -y -qq --no-install-recommends ffmpeg || exit 1
  fi
fi
ffmpeg -version | head -1
retry 180 npx -y "$HF" --version || exit 1
if [ "${1:-}" = browser ]; then retry 240 npx -y "$HF" browser ensure || exit 1; fi
