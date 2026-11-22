#!/usr/bin/env bash
# Render the Genesis proof clip: 10 seconds of samples/cellar-dread-genesis.vgm around the 1:10 sting,
# played by Game_Music_Emu's YM2612 emulation (an independent player), then encoded for the README.
# Needs libgme (macOS: brew install game-music-emu; Debian/Ubuntu: apt install libgme-dev) and ffmpeg.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if command -v pkg-config >/dev/null && pkg-config --exists libgme; then
  gme_flags="$(pkg-config --cflags --libs libgme)"
else
  prefix="$(brew --prefix 2>/dev/null || echo /usr/local)"
  gme_flags="-I$prefix/include -L$prefix/lib -lgme"
fi
cc -O2 "$here/vgm2wav.c" $gme_flags -o "$work/vgm2wav"
"$work/vgm2wav" "$root/samples/cellar-dread-genesis.vgm" "$work/clip.wav" 63.5 10

# A fixed +6 dB gain (no dynamic processing), so the clip keeps the chip's own dynamics.
ffmpeg -hide_banner -loglevel error -y -i "$work/clip.wav" -af "volume=6dB" -b:a 160k "$root/docs/genesis-proof.mp3"
ffmpeg -hide_banner -loglevel error -y -i "$work/clip.wav" -filter_complex \
  "[0:a]volume=6dB,asplit[a1][a2];[a1]showwaves=s=960x240:mode=cline:colors=0xd4402a:scale=sqrt,format=yuv420p[v]" \
  -map "[v]" -map "[a2]" -c:v libx264 -crf 28 -c:a aac -b:a 128k "$root/docs/genesis-proof.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$work/clip.wav" \
  -filter_complex "showwavespic=s=960x200:colors=0xd4402a:scale=sqrt" -frames:v 1 "$root/docs/genesis-proof.png"
echo "wrote docs/genesis-proof.mp3, .mp4 and .png"
