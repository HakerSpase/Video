#!/usr/bin/env python3
"""Точные тайминги слов озвучки (faster-whisper) → JSON для tools/build.py (assets/transcript.json).

    python3 tools/transcribe.py episodes/007-zimovye/assets/voice.wav out.json [--prompt-file episodes/007-zimovye/voice_text.txt]

Запускается в GitHub Actions (workflow transcribe.yml): там открыт доступ к моделям.
Текст сценария подаётся подсказкой — модель реже ошибается в именах и редких словах.
"""
import json
import sys

from faster_whisper import WhisperModel


def main():
    src, out = sys.argv[1], sys.argv[2]
    prompt = None
    if "--prompt-file" in sys.argv:
        prompt = open(sys.argv[sys.argv.index("--prompt-file") + 1], encoding="utf-8").read()[:800]
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(src, language="ru", word_timestamps=True, vad_filter=False, beam_size=5, initial_prompt=prompt)
    words = []
    for s in segs:
        for w in s.words or []:
            words.append({"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
        print(f"{s.start:7.2f} {s.text}", flush=True)
    json.dump({"words": words}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"слов: {len(words)} → {out}")


if __name__ == "__main__":
    main()
