#!/usr/bin/env python3
"""Фотореалистичные PBR-текстуры и HDRI с Poly Haven (CC0) по ключевым словам.

    python3 tools/fetch_textures.py textures.json out_dir

textures.json: {"textures": [["concrete", 3], ["brick", 3], ...], "hdris": [["overcast", 2], ["night", 2]], "res": "1k"}
Текстура → out_dir/tex/<id>/{diff,nor,rough}.jpg, HDRI → out_dir/hdri/<id>.hdr; index.json — что скачано.
Запускается в GitHub Actions (у серверов GitHub открыт интернет).
"""
import json
import sys
import urllib.request
from pathlib import Path

UA = {"User-Agent": "video-factory/1.0"}


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def main():
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    res = spec.get("res", "1k")
    index = {"textures": [], "hdris": []}
    tex = json.loads(get("https://api.polyhaven.com/assets?t=textures"))
    used = set()
    for key, n in spec.get("textures", []):
        hits = [(k, v) for k, v in tex.items() if k not in used and (key in k or key in " ".join(v.get("tags", []) + v.get("categories", [])))]
        hits.sort(key=lambda kv: -kv[1].get("download_count", 0))
        for k, v in hits[:n]:
            files = json.loads(get(f"https://api.polyhaven.com/files/{k}"))
            d = out / "tex" / k
            d.mkdir(parents=True, exist_ok=True)
            got = {}
            for name, keys in (("diff", ["Diffuse", "diffuse"]), ("nor", ["nor_gl"]), ("rough", ["Rough", "rough"])):
                for kk in keys:
                    try:
                        url = files[kk][res]["jpg"]["url"]
                        (d / f"{name}.jpg").write_bytes(get(url))
                        got[name] = True
                        break
                    except Exception:
                        continue
            used.add(k)
            index["textures"].append({"id": k, "key": key, "name": v.get("name"), "maps": list(got), "tags": v.get("tags", [])[:10]})
            print("tex", key, k, list(got))
    hd = json.loads(get("https://api.polyhaven.com/assets?t=hdris"))
    for key, n in spec.get("hdris", []):
        hits = [(k, v) for k, v in hd.items() if key in " ".join(v.get("tags", []) + v.get("categories", [])) or key in k]
        exact = [(k, v) for k, v in hd.items() if k == key]
        if exact:
            hits = exact
        hits.sort(key=lambda kv: -kv[1].get("download_count", 0))
        for k, v in hits[:n]:
            files = json.loads(get(f"https://api.polyhaven.com/files/{k}"))
            (out / "hdri").mkdir(parents=True, exist_ok=True)
            (out / "hdri" / f"{k}.hdr").write_bytes(get(files["hdri"][res]["hdr"]["url"], 300))
            try:
                (out / "hdri" / f"{k}_tonemapped.jpg").write_bytes(get(files["tonemapped"]["url"], 120))
            except Exception as e:
                print("no tonemapped", k, e)
            index["hdris"].append({"id": k, "key": key, "name": v.get("name"), "tags": v.get("tags", [])[:10]})
            print("hdri", key, k)
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
