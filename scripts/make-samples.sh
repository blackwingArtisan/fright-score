#!/usr/bin/env bash
# Renders the listening samples in samples/ with the CLI, then encodes them to MP3 for the README.
# Every WAV is reproducible: same request and seed, same bytes. Needs ffmpeg with libmp3lame.
#
#   bash scripts/make-samples.sh
set -euo pipefail
cd "$(dirname "$0")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

render() {
  local name="$1"
  shift
  npm run --silent score -- "$@" --out "$work/$name.wav" --quiet >/dev/null
  ffmpeg -hide_banner -loglevel error -y -i "$work/$name.wav" -codec:a libmp3lame -b:a 128k "samples/$name.mp3"
  echo "samples/$name.mp3"
}

mkdir -p samples
render cellar-dread-sting-at-1m10s --scene "Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10" --seed 13 \
  --vgm samples/cellar-dread-genesis.vgm
render music-box-jump-scare-at-40s --scene "A music box winds down in the nursery, 45 seconds, jump scare at 0:40" --seed 13
render stalker-seamless-loop --mood stalker --seconds 20 --loop --seed 7
echo samples/cellar-dread-genesis.vgm
