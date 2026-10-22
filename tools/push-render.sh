#!/usr/bin/env bash
# Положить готовый ролик в ветку renders: renders/<имя>.mp4, остальные ролики ветки сохраняются.
#   tools/push-render.sh final.mp4 005-galochka     (запускается в GitHub Actions)
set -euo pipefail
SRC="$1"; NAME="$2"
git config user.name "render-bot"
git config user.email "render-bot@users.noreply.github.com"
TMP=$(mktemp -d)
cp "$SRC" "$TMP/$NAME.mp4"
if git fetch -q --depth 1 origin renders 2>/dev/null; then
  git checkout -q -B renders FETCH_HEAD
else
  git checkout -q --orphan renders
  git rm -rq --cached . || true
  git clean -fdq
fi
mkdir -p renders
cp "$TMP/$NAME.mp4" "renders/$NAME.mp4"
git add -f "renders/$NAME.mp4"
git commit -qm "render: $NAME"
git push -q origin HEAD:refs/heads/renders
echo "renders/$NAME.mp4 → ветка renders"
