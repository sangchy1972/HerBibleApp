#!/usr/bin/env bash
# Upload the puzzle paintings to R2 (quiz.everlandapps.com/v1/art).
#
# 24 public-domain classical paintings of biblical scenes, two sizes each:
#   full/  ~1200px long side, q82  — the board and the full-screen view
#   thumb/ 420px, q80              — the collection grid
#
# Separate files rather than one image plus a Cloudflare resize: the transform
# host list in src/services/cfImage.ts covers covers.everlandapps.com only, and
# a resize that silently fails would push the full 4.6 MB set into a grid.
#
# SOURCE IS _upload-to-r2, NOT _processed. _processed still holds the original
# 74; the other 50 were saints, apocrypha and donor Madonnas rather than Bible
# scenes, and uploading them would put art in the bucket that no id in
# src/constants/quizArt.ts points at.
#
# That folder is laid out as the R2 KEYS (v1/art/full, v1/art/thumb) so the same
# tree can be dragged onto the bucket root in the dashboard without renaming
# anything afterwards. This script and a manual drag produce identical keys.
#
# The app ships WITHOUT any of this — PuzzleBoard renders locked/greyed pieces
# until the images land, so a failed upload looks like "she has not earned it
# yet" rather than like an error. Check the URLs after uploading.
#
# Prerequisites (one-time):
#   npx --yes wrangler login
#
# Usage:
#   scripts/upload_puzzle_art_r2.sh [SRC_DIR]
#   SRC_DIR defaults to ~/Desktop/classical-bible-paintings/_upload-to-r2/v1/art
#
# ⚠️ Bump the /v1/ segment (here AND in ART_BASE in src/constants/quizArt.ts)
# on a re-cut. A custom domain puts Cloudflare's cache in front of these, so
# re-uploading under the same key can serve the old file for a long time.
set -euo pipefail

BUCKET="herbible-quiz"                      # custom domain: quiz.everlandapps.com
PREFIX="v1/art"
SRC="${1:-${HOME}/Desktop/classical-bible-paintings/_upload-to-r2/v1/art}"

if [ -n "${WRANGLER:-}" ] && [ -x "${WRANGLER}" ]; then WR=( "$WRANGLER" )
elif command -v wrangler >/dev/null 2>&1; then WR=( wrangler )
else WR=( npx --yes wrangler ); fi
echo "Using wrangler: ${WR[*]}"

# Preflight: an env token silently outranks `wrangler login`, and the resulting
# 401 names neither the variable nor the fix.
for v in CLOUDFLARE_API_TOKEN CF_API_TOKEN CLOUDFLARE_API_KEY; do
  if [ -n "${!v:-}" ]; then
    echo
    echo "NOTE: \$${v} is set, so wrangler will use it and ignore any OAuth login."
    echo "      If this run fails with 401 / 'Invalid access token', either"
    echo "        unset ${v}   (then: npx --yes wrangler login)"
    echo "      or replace it with a token that has Workers R2 Storage \u2192 Edit."
    echo
  fi
done

[ -d "$SRC/full" ]  || { echo "not found: $SRC/full";  exit 1; }
[ -d "$SRC/thumb" ] || { echo "not found: $SRC/thumb"; exit 1; }

# Guard against pointing this at _processed by habit. 74 uploads would cost
# nothing but would leave the bucket disagreeing with the app.
n_full="$(find "$SRC/full" -name '*.jpg' | wc -l | tr -d ' ')"
if [ "$n_full" != "24" ]; then
  echo "expected 24 paintings in $SRC/full, found ${n_full}."
  echo "The curated set lives in _upload-to-r2/v1/art; _processed is the raw 74."
  exit 1
fi

uploaded=0
for size in full thumb; do
  for p in "$SRC/$size"/*.jpg; do
    [ -e "$p" ] || continue
    f="$(basename "$p")"
    echo ">>> ${size}/${f}"
    "${WR[@]}" r2 object put "${BUCKET}/${PREFIX}/${size}/${f}" \
      --file "$p" --content-type "image/jpeg" --remote
    uploaded=$((uploaded+1))
  done
done

echo
echo "Uploaded ${uploaded} files."
echo "Verify:"
echo "  curl -sI https://quiz.everlandapps.com/v1/art/full/085.jpg  | head -3"
echo "  curl -sI https://quiz.everlandapps.com/v1/art/thumb/085.jpg | head -3"
echo
echo "085 is painting TWO — the first one nobody can reach without the CDN."
echo "Painting one (051) ships inside the app, so it renders either way and is"
echo "the wrong thing to test an upload with"
