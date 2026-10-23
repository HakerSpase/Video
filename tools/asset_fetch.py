#!/usr/bin/env python3
"""Скачать модели Sketchfab по uid (нужен ключ: секрет репозитория SKETCHFAB_TOKEN).

    SKETCHFAB_TOKEN=... python3 tools/asset_fetch.py "uid1,uid2" out_dir

Берёт GLB, если есть, иначе glTF-архив; рядом — meta.json (название, автор, лицензия — для титров).
"""
import io
import json
import os
import sys
import urllib.request
import zipfile
from pathlib import Path


def get(url, headers=None, timeout=300):
    req = urllib.request.Request(url, headers=dict({"User-Agent": "video-factory/1.0"}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main():
    tok = os.environ.get("SKETCHFAB_TOKEN", "").strip()
    if not tok:
        sys.exit("нет SKETCHFAB_TOKEN")
    out = Path(sys.argv[2])
    for uid in [u.strip() for u in sys.argv[1].split(",") if u.strip()]:
        d = out / uid
        d.mkdir(parents=True, exist_ok=True)
        try:
            meta = json.loads(get(f"https://api.sketchfab.com/v3/models/{uid}"))
            (d / "meta.json").write_text(json.dumps({"name": meta.get("name"), "author": (meta.get("user") or {}).get("displayName"),
                                                     "license": (meta.get("license") or {}).get("label"), "url": meta.get("viewerUrl")},
                                                    ensure_ascii=False, indent=1), encoding="utf-8")
            dl = json.loads(get(f"https://api.sketchfab.com/v3/models/{uid}/download", {"Authorization": "Token " + tok}))
            if "glb" in dl:
                (d / "model.glb").write_bytes(get(dl["glb"]["url"]))
            else:
                z = zipfile.ZipFile(io.BytesIO(get(dl["gltf"]["url"])))
                z.extractall(d / "gltf")
            print("ok", uid, meta.get("name"))
        except Exception as e:
            print("ошибка", uid, e)


if __name__ == "__main__":
    main()
