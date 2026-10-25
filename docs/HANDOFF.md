# Где остановились (для сессии на компьютере)

Ветка: `claude/video-voiceover-subtitles-07ogrh`.

## В работе
- **Метро, части 2 и 3** — `episodes/008-sorok-odin` («Сорок один»), `episodes/009-konechnaya` («Конечная», финал).
  Часть 1 — `episodes/004-tonnel`. Сценарии готовы (`script.txt`), озвучки ещё нет.
  008: сцены и 3D-мир (`compositions/world.html`) написаны, черновик проверен снапшотами.
  009: сцен ещё нет — сделать по образцу 008 (тот же `lib/tunnel3d.js`; у него новые состояния
  `drez/drezZ` — дрезина с прожектором, `dropped` — фонарики на шпалах, `retFade` — колонна растворяется).
  Станцию/платформу и счёт людей в вагоне в 009 — 2D-слоями поверх.
- **Обложка в последнем кадре** каждого ролика (2–3 кадра в самом конце): крупное название,
  номер части, фон — лучший кадр ролика. Нужна, чтобы в TikTok/YouTube выбрать её обложкой.
  Сделать общим механизмом в `tools/build.py` (например, `meta.json` → `"cover": {...}`).

## Порядок работы над эпизодом
1. `python3 tools/build.py episodes/NNN` → черновые тайминги, `voice_text.txt`.
2. Озвучка пользователя → `assets/voice.wav`.
3. Точные тайминги слов: на компьютере доступен whisper → `python3 tools/transcribe.py episodes/NNN/assets/voice.wav episodes/NNN/assets/transcript.json --prompt-file episodes/NNN/voice_text.txt`
   (нужен `pip install faster-whisper numpy`). Проверить, не вставил ли TTS лишнюю речь (сравнить transcript с voice_text).
4. `tools/render.sh episodes/NNN` или: build → `npx -y hyperframes@0.8.185 render` → `tools/finalmix.py`.
