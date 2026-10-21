# Автопубликация: YouTube (несколько каналов) и TikTok

Скрипты: `tools/youtube_upload.py`, `tools/tiktok_upload.py`, GitHub Actions `.github/workflows/publish.yml`.
Ключи и токены лежат в `secrets/` (в git не попадает) или в секретах GitHub-репозитория.

## YouTube

Официальный YouTube Data API. Один OAuth-клиент обслуживает сколько угодно каналов:
на каждый канал — свой токен.

### 1. OAuth-клиент (один раз, ~10 минут)

1. https://console.cloud.google.com → создайте проект (например `shorts-uploader`).
2. **APIs & Services → Library** → включите **YouTube Data API v3**.
3. **OAuth consent screen** → External → заполните название и почту →
   в **Test users** добавьте Google-аккаунты, к которым привязаны ваши каналы.
   (Пока приложение в режиме Testing, токены живут 7 дней. Чтобы не перелогиниваться,
   нажмите **Publish app** — для личного использования проверка Google не обязательна,
   просто будет предупреждение «приложение не проверено» при входе.)
4. **Credentials → Create credentials → OAuth client ID → Desktop app** → скачайте JSON
   и сохраните как `secrets/client_secret.json` (или пришлите мне — положу сам).

### 2. Подключить каналы

```bash
python3 tools/youtube_upload.py auth --channel main
python3 tools/youtube_upload.py auth --channel second   # второй канал / бренд-аккаунт
```

Скрипт печатает ссылку → входите, **выбираете нужный канал** → браузер перекинет на
`http://localhost:8765/?code=…` (страница «не откроется» — это нормально) → копируете адрес
целиком и вставляете в терминал. Это работает и из облачной сессии со мной: я присылаю
ссылку, вы присылаете адрес, на который вас перекинуло.

### 3. Публикация

```bash
# сразу на все подключённые каналы
python3 tools/youtube_upload.py upload --episode episodes/001-antresol --all
# отложенно (YouTube сам опубликует в это время)
python3 tools/youtube_upload.py upload --episode episodes/001-antresol --channel main \
    --publish-at 2026-10-25T18:00:00+03:00
```

Заголовок, описание и теги берутся из `episodes/<ep>/publish.json`. Видео вертикальное и
короче 3 минут — YouTube сам относит его к Shorts. Каждой загрузке ставится отметка
«изменённый или синтетический контент» (ИИ-озвучка) — этого требуют правила YouTube.

Лимит API: 10 000 единиц в сутки на проект, загрузка стоит 1 600 → **~6 видео в сутки
на один проект Google Cloud**. Больше — создайте второй проект или запросите увеличение квоты.

## TikTok

Официальный путь — **Content Posting API**.

1. https://developers.tiktok.com → Manage apps → **Create app**.
2. Добавьте продукты **Login Kit** и **Content Posting API**, включите **Direct Post**,
   scope `video.publish`.
3. Получите access token своего аккаунта через Login Kit (OAuth) и сохраните:
   `secrets/tiktok/main.json` → `{"access_token": "act.…"}`.
4. `python3 tools/tiktok_upload.py --episode episodes/001-antresol --account main`

Важно: пока приложение **не прошло аудит TikTok**, API публикует только приватно
(«Только я»). Аудит — отдельная заявка в кабинете разработчика. До аудита проще
выкладывать в TikTok вручную готовый `out/final.mp4` (подпись — в `publish.json → tiktok.caption`).

> Из моей облачной сессии сервера TikTok недоступны (сетевые ограничения контейнера),
> поэтому TikTok публикуется через GitHub Actions или с вашего компьютера. YouTube API
> из облачной сессии доступен.

## GitHub Actions (публикация в один клик)

В репозитории: **Settings → Secrets and variables → Actions → New repository secret**:

| Секрет | Значение |
| --- | --- |
| `YT_CLIENT_SECRET` | содержимое `secrets/client_secret.json` |
| `YT_TOKENS` | вывод `python3 tools/youtube_upload.py export-tokens` |
| `TIKTOK_TOKENS` | `{"main": {"access_token": "…"}}` |

Дальше **Actions → «Публикация эпизода» → Run workflow** → указать папку эпизода и каналы.
