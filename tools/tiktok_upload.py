#!/usr/bin/env python3
"""Публикация в TikTok через Content Posting API (Direct Post).

    python3 tools/tiktok_upload.py --episode episodes/001-antresol --account main

Нужно (см. docs/PUBLISHING.md, раздел TikTok):
  - приложение на developers.tiktok.com с продуктом Content Posting API и scope video.publish;
  - access token аккаунта: secrets/tiktok/<account>.json {"access_token": "..."}
    или переменная окружения TIKTOK_TOKENS='{"main": {"access_token": "..."}}'.
Пока приложение не прошло аудит TikTok, видео публикуются только как «Только я» (SELF_ONLY):
это ограничение TikTok, а не скрипта.
"""
import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
API = "https://open.tiktokapis.com/v2"
CHUNK = 10 * 1024 * 1024


def token(account):
    env = os.environ.get("TIKTOK_TOKENS")
    store = json.loads(env) if env else {}
    if not env:
        p = ROOT / "secrets" / "tiktok" / f"{account}.json"
        if p.exists():
            store[account] = json.loads(p.read_text())
    if account not in store:
        sys.exit(f"Нет токена TikTok для «{account}»")
    return store[account]["access_token"]


def call(method, path, tok, **kw):
    r = requests.request(method, API + path, headers={"Authorization": f"Bearer {tok}",
                                                      "Content-Type": "application/json; charset=UTF-8"}, timeout=60, **kw)
    data = r.json()
    if data.get("error", {}).get("code") not in (None, "ok"):
        sys.exit(f"TikTok API: {data['error']}")
    return data["data"]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--episode", required=True)
    p.add_argument("--account", default="main")
    p.add_argument("--file")
    p.add_argument("--privacy", help="PUBLIC_TO_EVERYONE / MUTUAL_FOLLOW_FRIENDS / FOLLOWER_OF_CREATOR / SELF_ONLY")
    a = p.parse_args()
    ep = Path(a.episode).resolve()
    meta = json.loads((ep / "publish.json").read_text(encoding="utf-8"))
    tt = dict(meta, **meta.get("tiktok", {}))
    video = Path(a.file) if a.file else ep / "out" / "final.mp4"
    tok = token(a.account)

    info = call("POST", "/post/publish/creator_info/query/", tok)
    allowed = info.get("privacy_level_options", ["SELF_ONLY"])
    privacy = a.privacy or ("PUBLIC_TO_EVERYONE" if "PUBLIC_TO_EVERYONE" in allowed else allowed[0])
    print(f"Аккаунт: {info.get('creator_nickname')} · доступно: {allowed} · публикую как {privacy}")

    size = video.stat().st_size
    n = max(1, math.floor(size / CHUNK))
    chunk = size if n == 1 else CHUNK
    caption = (tt.get("caption") or tt["title"])[:2200]
    init = call("POST", "/post/publish/video/init/", tok, json={
        "post_info": {"title": caption, "privacy_level": privacy, "disable_comment": False,
                      "disable_duet": False, "disable_stitch": False, "is_aigc": True},
        "source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": chunk, "total_chunk_count": n},
    })
    with open(video, "rb") as f:
        for i in range(n):
            start = i * chunk
            end = size - 1 if i == n - 1 else start + chunk - 1
            f.seek(start)
            body = f.read(end - start + 1)
            r = requests.put(init["upload_url"], data=body, timeout=300, headers={
                "Content-Type": "video/mp4", "Content-Length": str(len(body)),
                "Content-Range": f"bytes {start}-{end}/{size}"})
            r.raise_for_status()
            print(f"  часть {i + 1}/{n}")
    for _ in range(60):
        st = call("POST", "/post/publish/status/fetch/", tok, json={"publish_id": init["publish_id"]})
        print("  статус:", st.get("status"))
        if st.get("status") in ("PUBLISH_COMPLETE", "FAILED"):
            break
        time.sleep(5)
    log = ep / "out" / "published.json"
    done = json.loads(log.read_text()) if log.exists() else {}
    done[f"tiktok:{a.account}"] = init["publish_id"]
    log.write_text(json.dumps(done, indent=2))


if __name__ == "__main__":
    main()
