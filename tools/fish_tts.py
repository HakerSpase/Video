#!/usr/bin/env python3
"""Озвучка через Fish Audio (запускается в GitHub Actions, ключ — секрет FISH_API_KEY).

    python3 tools/fish_tts.py search "<запрос>" <sample.txt> <outdir>   — найти голоса библиотеки
        (русские, по популярности) и сделать каждым короткий пример → outdir/NN_<id>.mp3, outdir/voices.json
    python3 tools/fish_tts.py tts <voice_id> <text.txt> <out.wav>        — весь текст выбранным голосом

Голоса берутся только из публичной библиотеки Fish Audio (их авторы выложили для общего пользования);
чужие голоса из роликов не клонируем.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.fish.audio"
KEY = os.environ.get("FISH_API_KEY", "")
MODEL = os.environ.get("FISH_MODEL", "s1")


def req(method, path, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "model": MODEL})
    with urllib.request.urlopen(r, timeout=300) as f:
        b = f.read()
    return b if raw else json.loads(b)


def tts(voice, text, fmt="mp3"):
    return req("POST", "/v1/tts", {"text": text, "reference_id": voice, "format": fmt,
                                   "sample_rate": 44100, "normalize": True, "latency": "normal"}, raw=True)


def main():
    mode = sys.argv[1]
    if mode == "search":
        query, sample, out = sys.argv[2], Path(sys.argv[3]).read_text(encoding="utf-8").strip(), Path(sys.argv[4])
        out.mkdir(parents=True, exist_ok=True)
        seen, voices = set(), []
        for q in [query, ""]:
            qs = urllib.parse.urlencode({"page_size": 40, "page_number": 1, "language": "ru", "sort_by": "task_count", "title": q})
            for m in req("GET", "/model?" + qs).get("items", []):
                if m["_id"] in seen or m.get("type", "tts") != "tts":
                    continue
                seen.add(m["_id"])
                voices.append({"id": m["_id"], "title": m.get("title", ""), "description": (m.get("description") or "")[:200],
                               "tags": m.get("tags", []), "uses": m.get("task_count", 0)})
        voices = voices[: int(os.environ.get("FISH_TOP", "8"))]
        for i, v in enumerate(voices):
            try:
                (out / f"{i:02d}_{v['id']}.mp3").write_bytes(tts(v["id"], sample))
                v["sample"] = f"{i:02d}_{v['id']}.mp3"
            except Exception as e:  # noqa: BLE001 — один сломанный голос не должен ронять поиск
                v["error"] = str(e)[:200]
            print(i, v["title"], v.get("error", "ok"))
        (out / "voices.json").write_text(json.dumps(voices, ensure_ascii=False, indent=1), encoding="utf-8")
    elif mode == "tts":
        voice, text, out = sys.argv[2], Path(sys.argv[3]).read_text(encoding="utf-8").strip(), Path(sys.argv[4])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(tts(voice, text, "wav"))
        print("ok", out, out.stat().st_size)
    else:
        sys.exit("режим: search | tts")


if __name__ == "__main__":
    main()
