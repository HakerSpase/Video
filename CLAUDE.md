# Фабрика страшных шортсов

Вертикальные ролики (9:16, 60–90 с): реалистичная жуткая история, озвучка пользователя
(Gemini TTS из Google AI Studio), субтитры по слову, анимированные сцены на HyperFrames.
Стиль и правила — `docs/STYLE.md`. Публикация — `docs/PUBLISHING.md`.

## Как устроен эпизод

```
episodes/NNN-slug/
  script.txt          сценарий с разметкой: [сцена] {b:бит} *жёлтое* !красное! ||
  voice_text.txt      чистый текст для озвучки (генерируется)
  VOICE.md            инструкция и style prompt для Gemini
  assets/voice.wav    озвучка пользователя
  compositions/*.html одна сцена = один файл, имя = метка [сцена]; анимации привязаны к window.CUES
  sfx.json            звуковые эффекты на биты
  publish.json        заголовок/описание/теги для YouTube и TikTok
  index.html, compositions/captions.html, assets/cues.js — генерирует tools/build.py, руками не править
```

Внутри сцены: `const S = window.CUES.<сцена>; const at = (k) => window.CUES[k] - S;` —
`at("бит")` даёт локальное время слова. Так сцены сами подстраиваются под любой темп озвучки.
Имена битов не должны совпадать с именами сцен (build.py проверяет).
Общие помощники: `lib/kit.css` (палитра, `.chip`, `.stamp`, `.hud`), `lib/iso.js` (CSS-3D изометрия: `ISO.box`, `ISO.wall`, `ISO.flat47`).

## Работа над эпизодом

1. Новый эпизод: скопировать структуру прошлого, написать `script.txt` по правилам STYLE.md.
2. `python3 tools/build.py episodes/NNN` → черновые тайминги без голоса, `voice_text.txt`.
3. Сцены в `compositions/`; проверять `npx hyperframes snapshot --at …` из папки эпизода и смотреть кадры.
4. Пользователь присылает озвучку → `assets/voice.wav` → `tools/render.sh episodes/NNN` → `out/final.mp4`.
5. Публикация: `tools/youtube_upload.py upload --episode … --all` (или workflow в Actions).

Тайминги слов: если есть `assets/transcript.json` (whisper), берутся из него; иначе build.py
выравнивает текст по паузам в голосе (детектор речи + слоги). В облачной сессии HuggingFace
закрыт, поэтому whisper-модели недоступны — работает выравнивание по паузам.

CLI HyperFrames закреплён на версии 0.8.185 (`npx -y hyperframes@0.8.185 …`).
