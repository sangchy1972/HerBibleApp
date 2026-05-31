#!/usr/bin/env bash
# Upload achievement badge PNGs to R2 (covers.everlandapps.com/v1/badges).
#
# The app ships WITHOUT badge art; it pulls these on first visit to the
# Achievement screen and caches them locally. Filenames MUST match the
# badge ids (".":"-" + ".png") — see BADGES_FILELIST.txt. This script
# validates the source dir against the 72 expected names before uploading.
#
# Prerequisites (one-time, in any terminal):
#   cd ~/claude_herbible_plan/workers/herbible-plans-7languages
#   ./node_modules/.bin/wrangler login
#
# Usage:
#   scripts/upload_badges_r2.sh [SRC_DIR]
#   (SRC_DIR defaults to ~/Desktop/badges — put your renamed PNGs there)
#
# Idempotent: re-running overwrites the same keys. Bump the /v1/ segment
# (here + in src/constants/badgeImageCdn.ts + the cache subdir in
# src/services/badgeImageService.ts) on a full re-art to cache-bust.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WRANGLER="${HOME}/claude_herbible_plan/workers/herbible-plans-7languages/node_modules/.bin/wrangler"
BUCKET="herbible-audio-7languages"          # custom domain: covers.everlandapps.com
PREFIX="v1/badges"
SRC="${1:-${HOME}/Desktop/badges}"

[ -x "$WRANGLER" ] || { echo "wrangler not found at $WRANGLER — run 'wrangler login' first"; exit 1; }
[ -d "$SRC" ] || { echo "source dir not found: $SRC"; exit 1; }

# Expected filenames, derived from the achievement ids (single source of truth).
EXPECTED="$(node -e '
  const s=require("fs").readFileSync("'"$REPO"'/src/constants/achievements.ts","utf8");
  const re=/id:\s*'"'"'([^'"'"']+)'"'"'/g; let m, out=[];
  while((m=re.exec(s))) out.push(m[1].replace(/\./g,"-")+".png");
  process.stdout.write(out.join("\n"));
')"

missing=0; uploaded=0
while IFS= read -r f; do
  if [ -f "${SRC}/${f}" ]; then
    echo ">>> ${f}"
    "$WRANGLER" r2 object put "${BUCKET}/${PREFIX}/${f}" \
      --file "${SRC}/${f}" --content-type "image/png" --remote
    uploaded=$((uploaded+1))
  else
    echo "!!! MISSING: ${f}  (not found in ${SRC})"
    missing=$((missing+1))
  fi
done <<< "$EXPECTED"

# Flag any stray PNGs in SRC that don't match a known badge id.
for p in "${SRC}"/*.png; do
  [ -e "$p" ] || continue
  base="$(basename "$p")"
  grep -qxF "$base" <<< "$EXPECTED" || echo "??? UNRECOGNIZED: ${base}  (no badge with this id — typo?)"
done

echo
echo "Uploaded ${uploaded} / 72 badges. Missing: ${missing}."
echo "Verify a few:"
echo "  curl -sI https://covers.everlandapps.com/v1/badges/prayer-first.png"
echo "  curl -sI https://covers.everlandapps.com/v1/badges/milestone-crown.png"
