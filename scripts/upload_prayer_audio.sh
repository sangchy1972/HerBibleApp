#!/usr/bin/env bash
# Upload the six prayer-bg MP3s from ~/Desktop and refresh the manifest.
#
# Prerequisites (one-time, run in any terminal):
#   cd ~/claude_herbible_plan/workers/herbible-plans-7languages
#   ./node_modules/.bin/wrangler login
#
# This script is idempotent — re-running it just overwrites the same keys
# with the same files, and pushes the same manifest.
set -euo pipefail

WRANGLER="${HOME}/claude_herbible_plan/workers/herbible-plans-7languages/node_modules/.bin/wrangler"
# covers.everlandapps.com is bound to herbible-plans-7languages (NOT the audio
# bucket — audio.everlandapps.com is the audio one). Prayer-bg files are served
# from covers.everlandapps.com/backgrounds/, so they live in the plans bucket.
BUCKET="herbible-plans-7languages"
MORNING_SRC="${HOME}/Desktop/清晨-裁剪后"
EVENING_SRC="${HOME}/Desktop/夜晚-剪裁后"

# Short stable names on the CDN. The locals carry long encoder-tagged
# filenames — these are cleaner, predictable, and unrelated to the original
# author tags so they're easier to swap content under in the future.
declare -A MORNING_RENAME=(
  ["leberch-christian-439968.mp3"]="morning-christian-piano.mp3"
  ["innertune-relaxing-birds-and-piano-music-137153_0-2m05s_fadein5s_fadeout8s.mp3"]="morning-birds-and-piano.mp3"
  ["adrian_huminiak-morning-worship-180330_0-1m39s_fadein5s_fadeout8s.mp3"]="morning-worship.mp3"
)
declare -A EVENING_RENAME=(
  ["petrushkasound-ambient-piano-background-music-458395_0-1m53s_fadein5s_fadeout8s.mp3"]="evening-ambient-piano.mp3"
  ["jessequinnmedia-christian-instrumental-piano-worship-calm-emotional-soaking-prayer-249459_0-1m59s_fadein5s_fadeout8s.mp3"]="evening-soaking-prayer.mp3"
  ["denis-pavlov-music-worship-piano-instrumental-peaceful-prayer-music-223373_0-2m09s_fadeout8s.mp3"]="evening-peaceful-prayer.mp3"
)

upload () {
  local slot="$1" src_dir="$2" -n rename_map=$3
  for local_name in "${!rename_map[@]}"; do
    local cdn_name="${rename_map[$local_name]}"
    local key="backgrounds/audio/${slot}/${cdn_name}"
    echo ">>> ${slot}/${cdn_name}"
    "$WRANGLER" r2 object put "${BUCKET}/${key}" \
      --file "${src_dir}/${local_name}" \
      --content-type "audio/mpeg" \
      --remote
  done
}

upload morning "$MORNING_SRC" MORNING_RENAME
upload evening "$EVENING_SRC" EVENING_RENAME

# Rebuild the manifest, pointing at the new MP3 keys + keeping the same
# image lists from the live manifest (we don't change those here). Pulls
# the current manifest, swaps the `audio` block, uploads back.
TMP="$(mktemp -d)"
trap "rm -rf '$TMP'" EXIT

curl -sf "https://covers.everlandapps.com/backgrounds/manifest.json" -o "$TMP/old.json"

python3 - "$TMP/old.json" "$TMP/new.json" <<'PY'
import json, sys, datetime
old = json.load(open(sys.argv[1]))
old["generated_at"] = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
old["audio"] = {
  "morning": [
    "morning-christian-piano.mp3",
    "morning-birds-and-piano.mp3",
    "morning-worship.mp3",
  ],
  "evening": [
    "evening-ambient-piano.mp3",
    "evening-soaking-prayer.mp3",
    "evening-peaceful-prayer.mp3",
  ],
}
json.dump(old, open(sys.argv[2], "w"), indent=2)
PY

"$WRANGLER" r2 object put "${BUCKET}/backgrounds/manifest.json" \
  --file "$TMP/new.json" \
  --content-type "application/json" \
  --remote

echo "Done. Verify with:"
echo "  curl -sI https://covers.everlandapps.com/backgrounds/audio/morning/morning-christian-piano.mp3"
echo "  curl -s https://covers.everlandapps.com/backgrounds/manifest.json | python3 -m json.tool"
