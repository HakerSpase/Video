#!/usr/bin/env python3
"""Финальное сведение: голос всегда сверху.

    python3 tools/finalmix.py episodes/NNN video.mp4 out.mp4

Голос: срез низа, мягкая компрессия, присутствие 2–4 кГц, громкость −16 LUFS.
Эффекты (assets/foley.wav) и музыка (assets/music.wav) ставятся статично на −32/−28.5 LUFS
и дополнительно проседают под голосом (sidechain). Итог — −14 LUFS, пик −1.5 dBTP.
Видео копируется без перекодирования.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

VOICE_LUFS, FOLEY_LUFS, MUSIC_LUFS, OUT_LUFS = -16.0, -32.0, -28.5, -14.0


def lufs(args):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats"] + args + ["-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1]) if m else -70.0


def main():
    ep, video, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    a = ep / "assets"
    vchain = "highpass=f=75,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=150:makeup=2,equalizer=f=3200:t=q:w=1.2:g=2.5,equalizer=f=200:t=q:w=1:g=-1.5"
    tmp = ep / "out" / "voice_fx.wav"
    tmp.parent.mkdir(exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(a / "voice.wav"), "-af", vchain, "-ar", "48000", str(tmp)], check=True)
    gv = VOICE_LUFS - lufs(["-i", str(tmp)])
    gf = FOLEY_LUFS - lufs(["-i", str(a / "foley.wav")])
    gm = MUSIC_LUFS - lufs(["-i", str(a / "music.wav")])
    print(f"усиление: голос {gv:+.1f} дБ, эффекты {gf:+.1f} дБ, музыка {gm:+.1f} дБ")
    vdur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                                capture_output=True, text=True).stdout.strip())
    # голос добивается тишиной до конца видео, иначе sidechain обрежет музыку и эффекты вместе с последним словом
    fc = (
        f"[1:a]volume={gv:.2f}dB,aresample=48000,apad=whole_dur={vdur:.3f},asplit=3[v][k1][k2];"
        f"[2:a]volume={gf:.2f}dB,aresample=48000[f0];[f0][k1]sidechaincompress=threshold=0.03:ratio=3.5:attack=15:release=350:makeup=1[f];"
        f"[3:a]volume={gm:.2f}dB,aresample=48000[m0];[m0][k2]sidechaincompress=threshold=0.03:ratio=2:attack=40:release=700:makeup=1[m];"
        + ("[v]volume=0[vq];[vq]" if os.environ.get("NOVOICE") else "[v]")
        + "[f][m]amix=inputs=3:normalize=0:duration=longest,alimiter=limit=0.84:level=false[a]"
    )
    pre = ep / "out" / "mix_pre.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", str(tmp), "-i", str(a / "foley.wav"), "-i", str(a / "music.wav"),
                    "-filter_complex", fc, "-map", "[a]", str(pre)], check=True)
    if os.environ.get("NOVOICE"):
        return
    g = OUT_LUFS - lufs(["-i", str(pre)])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", str(pre), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-af", f"volume={g:.2f}dB,alimiter=limit=0.84:level=false", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                    "-movflags", "+faststart", "-shortest", out], check=True)
    print(f"итог: {lufs(['-i', out]):.1f} LUFS → {out}")


if __name__ == "__main__":
    main()
