#!/usr/bin/env python3
"""Поиск и загрузка реальных звуков и музыки с открытыми лицензиями (Openverse: Freesound, Wikimedia, Jamendo).

    python3 tools/fetch_sounds.py queries.json out_dir

queries.json — список {"q": "fpv drone", "n": 6, "length": "short", "max": 40}.
Берутся только лицензии, разрешающие коммерческое использование (CC0, PDM, CC BY, CC BY-SA).
Каждый файл — out_dir/<slug>/<n>.mp3 и рядом <n>.json (название, автор, лицензия, ссылка) для титров.
Запускается в GitHub Actions: у серверов GitHub открыт интернет.
"""
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "video-factory/1.0 (sound search for CC-licensed audio)"}


def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main():
    queries = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for item in queries:
        q = item["q"]
        slug = re.sub(r"[^a-z0-9]+", "-", q.lower()).strip("-")
        params = {"q": q, "license_type": "commercial", "page_size": item.get("n", 6)}
        if item.get("length"):
            params["length"] = item["length"]
        try:
            data = json.loads(get("https://api.openverse.org/v1/audio/?" + urllib.parse.urlencode(params)))
        except Exception as e:
            print(f"! {q}: {e}")
            continue
        d = out / slug
        d.mkdir(exist_ok=True)
        for i, r in enumerate(data.get("results", [])):
            src = r.get("url")
            if not src:
                continue
            raw = d / f"{i}.src"
            try:
                raw.write_bytes(get(src, 120))
            except Exception as e:
                print(f"  ! {src}: {e}")
                continue
            mp3 = d / f"{i}.mp3"
            cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-t", str(item.get("max", 40)), "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "2", str(mp3)]
            ok = subprocess.run(cmd).returncode == 0
            raw.unlink()
            if not ok:
                continue
            meta = {k: r.get(k) for k in ("id", "title", "creator", "license", "license_version", "license_url", "foreign_landing_url", "provider", "source", "duration", "tags")}
            meta["tags"] = [t.get("name") for t in (meta.get("tags") or [])][:12]
            meta["query"] = q
            (d / f"{i}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
            index.append({"file": f"{slug}/{i}.mp3", **{k: meta[k] for k in ("title", "creator", "license", "provider", "duration")}})
            print(f"  {slug}/{i}.mp3  {meta['license']}  {meta['title']!r}")
        time.sleep(1.0)
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"всего: {len(index)}")


if __name__ == "__main__":
    main()
