#!/usr/bin/env python3
"""Точные тайминги слов озвучки (faster-whisper) → JSON для tools/build.py (assets/transcript.json).

    python3 tools/transcribe.py episodes/007-zimovye/assets/voice.wav out.json [--prompt-file episodes/007-zimovye/voice_text.txt]

Запускается в GitHub Actions (workflow transcribe.yml): там открыт доступ к моделям.
Текст сценария подаётся подсказкой — модель реже ошибается в именах и редких словах.
"""
import json
import sys
import wave

import numpy as np



def load_wav16k(path):
    """WAV (PCM 16 бит) → моно float32 16 кГц без ffmpeg и PyAV (на раннерах их может не быть или они несовместимы)."""
    with wave.open(path, "rb") as w:
        ch, sr, n = w.getnchannels(), w.getframerate(), w.getnframes()
        x = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != 16000:
        t = np.arange(0, len(x) / sr, 1 / 16000)
        x = np.interp(t, np.arange(len(x)) / sr, x).astype(np.float32)
    return x


def main():
    src, out = sys.argv[1], sys.argv[2]
    prompt = full = None
    if "--prompt-file" in sys.argv:
        full = open(sys.argv[sys.argv.index("--prompt-file") + 1], encoding="utf-8").read()
        prompt = full[:800]
    from faster_whisper import WhisperModel

    model = WhisperModel("medium", device="cpu", compute_type="int8")
    audio = load_wav16k(src)
    expect = len(full.split()) if full else 0

    def run(**kw):
        segs, _ = model.transcribe(audio, language="ru", word_timestamps=True, beam_size=5, **kw)
        ws = []
        for s in segs:
            for w in s.words or []:
                ws.append({"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
            print(f"{s.start:7.2f} {s.text}", flush=True)
        return ws

    words = run(vad_filter=False, initial_prompt=prompt)
    # whisper иногда «проглатывает» большие куски (особенно с подсказкой) — тогда повтор без неё
    if expect and len(words) < 0.8 * expect:
        print(f"мало слов ({len(words)}), повтор без подсказки", flush=True)
        alt = run(vad_filter=True, condition_on_previous_text=False)
        if len(alt) > len(words):
            words = alt
    json.dump({"words": words}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"слов: {len(words)} → {out}")


if __name__ == "__main__":
    main()
