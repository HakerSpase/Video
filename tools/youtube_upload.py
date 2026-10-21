#!/usr/bin/env python3
"""Загрузка Shorts на YouTube (YouTube Data API v3), сразу на несколько каналов.

Один раз на каждый канал:
    python3 tools/youtube_upload.py auth --channel main
    (откроется ссылка; войдите в нужный аккаунт/канал, разрешите доступ,
     скопируйте адрес страницы, на которую вас перекинуло — даже если она
     «не открылась», — и вставьте его в терминал)

Загрузка:
    python3 tools/youtube_upload.py upload --episode episodes/001-antresol --channel main
    python3 tools/youtube_upload.py upload --episode episodes/001-antresol --all \
        --publish-at 2026-10-25T16:00:00+03:00

Файлы (в .gitignore, в репозиторий не попадают):
    secrets/client_secret.json        — OAuth-клиент «Desktop app» из Google Cloud Console
    secrets/youtube/<channel>.json    — токен канала (создаёт команда auth)
В GitHub Actions те же данные приходят из секретов YT_CLIENT_SECRET и YT_TOKENS.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECRETS = ROOT / "secrets"
SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]


def client_config():
    env = os.environ.get("YT_CLIENT_SECRET")
    if env:
        return json.loads(env)
    p = SECRETS / "client_secret.json"
    if not p.exists():
        sys.exit("Нет secrets/client_secret.json — см. docs/PUBLISHING.md, шаг 1")
    return json.loads(p.read_text())


def token_store():
    env = os.environ.get("YT_TOKENS")
    if env:
        return json.loads(env)
    d = SECRETS / "youtube"
    return {p.stem: json.loads(p.read_text()) for p in d.glob("*.json")} if d.exists() else {}


def credentials(channel):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    tokens = token_store()
    if channel not in tokens:
        sys.exit(f"Канал «{channel}» не авторизован: python3 tools/youtube_upload.py auth --channel {channel}")
    creds = Credentials.from_authorized_user_info(tokens[channel], SCOPES)
    if not creds.valid:
        creds.refresh(Request())
    return creds


def cmd_auth(a):
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(client_config(), scopes=SCOPES, redirect_uri="http://localhost:8765/")
    url, _ = flow.authorization_url(access_type="offline", prompt="consent select_account", include_granted_scopes="true")
    print("\n1) Откройте ссылку и выберите канал:\n\n" + url + "\n")
    back = input("2) Вставьте адрес страницы, куда вас перенаправило (http://localhost:8765/?...):\n> ").strip()
    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")  # редирект на localhost без https
    flow.fetch_token(authorization_response=back)
    creds = flow.credentials
    out = SECRETS / "youtube" / f"{a.channel}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(creds.to_json())
    from googleapiclient.discovery import build
    yt = build("youtube", "v3", credentials=creds)
    ch = yt.channels().list(part="snippet", mine=True).execute().get("items", [])
    name = ch[0]["snippet"]["title"] if ch else "?"
    print(f"Готово: канал «{name}» сохранён как {a.channel} -> {out.relative_to(ROOT)}")


def upload_one(channel, video, meta, privacy, publish_at):
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    yt = build("youtube", "v3", credentials=credentials(channel))
    status = {"privacyStatus": privacy, "selfDeclaredMadeForKids": False, "containsSyntheticMedia": True}
    if publish_at:
        status.update(privacyStatus="private", publishAt=publish_at)
    body = {
        "snippet": {
            "title": meta["title"][:100],
            "description": meta.get("description", ""),
            "tags": meta.get("tags", []),
            "categoryId": str(meta.get("categoryId", 24)),
            "defaultLanguage": meta.get("language", "ru"),
            "defaultAudioLanguage": meta.get("language", "ru"),
        },
        "status": status,
    }
    media = MediaFileUpload(str(video), mimetype="video/mp4", chunksize=8 * 1024 * 1024, resumable=True)
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp, tries = None, 0
    while resp is None:
        try:
            st, resp = req.next_chunk()
            if st:
                print(f"  [{channel}] {int(st.progress() * 100)}%")
        except Exception as e:  # сетевые сбои — повторяем с паузой
            tries += 1
            if tries > 5:
                raise
            print(f"  [{channel}] ошибка {e}, повтор через {2 ** tries} c")
            time.sleep(2 ** tries)
    vid = resp["id"]
    print(f"  [{channel}] загружено: https://youtube.com/shorts/{vid}")
    return vid


def cmd_upload(a):
    ep = Path(a.episode).resolve()
    meta = json.loads((ep / "publish.json").read_text(encoding="utf-8"))
    yt_meta = dict(meta, **meta.get("youtube", {}))
    video = Path(a.file) if a.file else ep / "out" / "final.mp4"
    if not video.exists():
        sys.exit(f"Нет файла {video} — сначала tools/render.sh {a.episode}")
    channels = sorted(token_store()) if a.all else [a.channel]
    if not channels or channels == [None]:
        sys.exit("Укажите --channel NAME или --all")
    log = ep / "out" / "published.json"
    done = json.loads(log.read_text()) if log.exists() else {}
    for ch in channels:
        if f"youtube:{ch}" in done and not a.force:
            print(f"  [{ch}] уже загружено ({done[f'youtube:{ch}']}), пропускаю (--force чтобы повторить)")
            continue
        done[f"youtube:{ch}"] = upload_one(ch, video, yt_meta, a.privacy, a.publish_at)
        log.write_text(json.dumps(done, indent=2))


def cmd_export(a):
    """Печатает значение для секрета YT_TOKENS в GitHub."""
    print(json.dumps(token_store()))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("auth")
    s.add_argument("--channel", required=True, help="короткое имя канала, например main или horror2")
    sub.add_parser("export-tokens", help="JSON для секрета YT_TOKENS")
    s = sub.add_parser("upload")
    s.add_argument("--episode", required=True)
    s.add_argument("--file")
    s.add_argument("--channel")
    s.add_argument("--all", action="store_true", help="на все авторизованные каналы")
    s.add_argument("--privacy", default="public", choices=["public", "unlisted", "private"])
    s.add_argument("--publish-at", help="отложенная публикация, ISO 8601, напр. 2026-10-25T16:00:00+03:00")
    s.add_argument("--force", action="store_true")
    a = p.parse_args()
    {"auth": cmd_auth, "upload": cmd_upload, "export-tokens": cmd_export}[a.cmd](a)


if __name__ == "__main__":
    main()
