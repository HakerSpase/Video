# Страшные истории · вертикальные ролики

Пайплайн: **сценарий → ваша озвучка из Gemini → субтитры по слову и анимированные сцены → MP4 1080×1920 → YouTube (несколько каналов) и TikTok.**

## Как сделать ролик

1. Сценарий пишет Claude: `episodes/NNN/script.txt`. Чистый текст для озвучки — `voice_text.txt`.
2. Вы озвучиваете его в Google AI Studio по инструкции `episodes/NNN/VOICE.md` и присылаете WAV.
3. Сборка и рендер:
   ```bash
   tools/render.sh episodes/001-antresol          # с озвучкой → out/final.mp4
   tools/render.sh episodes/001-antresol --draft  # черновик без голоса
   ```
4. Публикация — `docs/PUBLISHING.md`:
   ```bash
   python3 tools/youtube_upload.py upload --episode episodes/001-antresol --all
   ```

Предпросмотр и правка сцен в браузере: `cd episodes/001-antresol && npx hyperframes@0.8.185 preview`.

## Эпизоды

| № | Название | Статус |
|---|---|---|
| 001 | «Антресоль» — Аня живёт одна, но счётчик воды не согласен | озвучка готова, финал отрендерен |

## Что внутри

- `tools/build.py` — разбор сценария, тайминги слов, субтитры, сборка `index.html`.
- `tools/render.sh` — сборка + рендер.
- `tools/youtube_upload.py`, `tools/tiktok_upload.py` — публикация.
- `lib/` — общий визуальный набор (палитра, HUD-плашки, зерно, 3D-изометрия, звуки).
- `docs/STYLE.md` — разбор референсов и правила стиля.
