#!/usr/bin/env python3
"""Поиск готовых 3D-моделей: Sketchfab (только скачиваемые, CC0/CC BY/CC BY-SA) и Poly Haven (CC0).

    python3 tools/asset_search.py queries.json out_dir

queries.json: {"sketchfab": ["military boots", ...], "polyhaven": ["boot", ...], "per_query": 12}
Для каждой модели — превью и строка в index.json (uid, название, автор, лицензия, полигоны, лайки).
Poly Haven отдаёт модели без ключа — они сразу скачиваются в glTF 1k.
Скачать модель Sketchfab: tools/asset_fetch.py (нужен SKETCHFAB_TOKEN).
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "video-factory/1.0"}


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def main():
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    idx = {"sketchfab": {}, "polyhaven": {}}
    n = spec.get("per_query", 12)
    for q in spec.get("sketchfab", []):
        res = []
        for lic in ("cc0", "by", "by-sa"):
            url = "https://api.sketchfab.com/v3/search?" + urllib.parse.urlencode(
                {"type": "models", "q": q, "downloadable": "true", "license": lic, "sort_by": "-likeCount", "count": 24})
            try:
                data = json.loads(get(url))
            except Exception as e:
                print("ошибка", q, lic, e)
                continue
            for m in data.get("results", []):
                res.append(m)
        res.sort(key=lambda m: -(m.get("likeCount") or 0))
        rows = []
        d = out / "sketchfab" / q.replace(" ", "_")
        d.mkdir(parents=True, exist_ok=True)
        for m in res[:n]:
            th = sorted((m.get("thumbnails") or {}).get("images", []), key=lambda i: abs(i.get("width", 0) - 512))
            if th:
                try:
                    (d / (m["uid"] + ".jpg")).write_bytes(get(th[0]["url"]))
                except Exception:
                    pass
            rows.append({"uid": m["uid"], "name": m.get("name"), "author": (m.get("user") or {}).get("username"),
                         "license": (m.get("license") or {}).get("label") if isinstance(m.get("license"), dict) else m.get("license"),
                         "faces": m.get("faceCount"), "likes": m.get("likeCount"), "animated": m.get("animationCount"),
                         "rigged": bool(m.get("isAgeRestricted") is False and m.get("animationCount")), "url": m.get("viewerUrl")})
        idx["sketchfab"][q] = rows
        print("sketchfab", q, len(rows))
    if spec.get("polyhaven"):
        allm = json.loads(get("https://api.polyhaven.com/assets?t=models"))
        for q in spec["polyhaven"]:
            hits = [(k, v) for k, v in allm.items() if q in k or q in " ".join(v.get("tags", []) + v.get("categories", []))]
            rows = []
            for k, v in hits[: n]:
                d = out / "polyhaven" / k
                d.mkdir(parents=True, exist_ok=True)
                try:
                    files = json.loads(get(f"https://api.polyhaven.com/files/{k}"))
                    g = files["gltf"]["1k"]["gltf"]
                    (d / (k + ".gltf")).write_bytes(get(g["url"]))
                    for rel, inc in g.get("include", {}).items():
                        p = d / rel
                        p.parent.mkdir(parents=True, exist_ok=True)
                        p.write_bytes(get(inc["url"]))
                    (d / "thumb.jpg").write_bytes(get(f"https://cdn.polyhaven.com/asset_img/thumbs/{k}.png?width=512"))
                except Exception as e:
                    print("polyhaven", k, e)
                rows.append({"id": k, "name": v.get("name"), "tags": v.get("tags", [])[:8]})
            idx["polyhaven"][q] = rows
            print("polyhaven", q, len(rows))
    (out / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
