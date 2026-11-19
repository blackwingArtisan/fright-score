#!/usr/bin/env bash
# Renders the starter pack: 5 seamless loops (one per mood) and 20 short stings (4 seeds per mood) into
# starter-pack/, with a manifest of the request, seed and sha256 for every file. Each file is reproducible:
# rerun the script anywhere and the hashes match.
#
#   bash scripts/make-starter-pack.sh            # into starter-pack/
#   bash scripts/make-starter-pack.sh out/pack   # into another folder
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-starter-pack}"
moods=(dread stalker chase lullaby ritual)
sting_seeds=(3 13 31 66)
mkdir -p "$out/loops" "$out/stings"
manifest="$out/manifest.csv"
echo "file,kind,mood,seconds,sting_at,seed,sha256" >"$manifest"

hash() { shasum -a 256 "$1" | cut -d' ' -f1; }

for mood in "${moods[@]}"; do
  file="loops/$mood-loop-16s.wav"
  npm run --silent score -- --mood "$mood" --seconds 16 --loop --seed 7 --out "$out/$file" --quiet >/dev/null
  echo "$file,loop,$mood,16,,7,$(hash "$out/$file")" >>"$manifest"
  echo "$out/$file"
  for seed in "${sting_seeds[@]}"; do
    file="stings/$mood-sting-seed$seed.wav"
    npm run --silent score -- --mood "$mood" --seconds 5 --sting 0:01 --seed "$seed" --out "$out/$file" --quiet >/dev/null
    echo "$file,sting,$mood,5,1,$seed,$(hash "$out/$file")" >>"$manifest"
    echo "$out/$file"
  done
done

cat >"$out/LICENSE.txt" <<'TXT'
Fright Score starter pack

These cues were rendered by Fright Score from the requests and seeds listed in manifest.csv. They are
dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/): use them
in any game, stream, video or table session, commercial or not, with no credit required.

Loops carry loop points in a smpl chunk, so Godot, Unity and most samplers loop them seamlessly.
Each sting hits one second in, after a short silence; start it one second before your scare.
TXT
echo "$manifest"
