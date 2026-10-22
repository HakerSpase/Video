#!/usr/bin/env bash
# Зависимости для серверов GitHub: ffmpeg и hyperframes (+ браузер, если передан аргумент browser).
# Каждая установка с таймаутом и повторами: иногда зеркало apt или загрузка браузера на отдельном сервере зависает.
set -u
retry() { for i in 1 2 3 4; do timeout "$1" "${@:2}" && return 0; echo "повтор $i: ${*:2}"; sleep $((i * 3)); done; return 1; }

if ! command -v ffmpeg >/dev/null; then
  retry 90 sudo apt-get update -qq -o Acquire::Retries=3 -o Acquire::http::Timeout=20 || true
  retry 180 sudo apt-get install -y -qq --no-install-recommends ffmpeg -o Acquire::Retries=3 -o Acquire::http::Timeout=20 || exit 1
fi
retry 180 npx -y "$HF" --version || exit 1
if [ "${1:-}" = browser ]; then retry 240 npx -y "$HF" browser ensure || exit 1; fi
