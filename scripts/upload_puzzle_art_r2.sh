#!/usr/bin/env bash
# Upload the puzzle paintings to R2 (quiz.everlandapps.com/v1/art).
#
# 74 public-domain classical paintings of biblical subjects, two sizes each:
#   full/  ~1200px long side, q82  — the board and the full-screen view
#   thumb/ 420px, q80              — the collection grid
#
# Separate files rather than one image plus a Cloudflare resize: the transform
# host list in src/services/cfImage.ts covers covers.everlandapps.com only, and
# a resize that silently fails would push the full 15 MB set into a grid.
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
#   SRC_DIR defaults to ~/Desktop/classical-bible-paintings/_processed
#
# ⚠️ Bump the /v1/ segment (here AND in ART_BASE in src/constants/quizArt.ts)
# on a re-cut. A custom domain puts Cloudflare's cache in front of these, so
# re-uploading under the same key can serve the old file for a long time.
set -euo pipefail

BUCKET="herbible-quiz"                      # custom domain: quiz.everlandapps.com
PREFIX="v1/art"
SRC="${1:-${HOME}/Desktop/classical-bible-paintings/_processed}"

if [ -n "${WRANGLER:-}" ] && [ -x "${WRANGLER}" ]; then WR=( "$WRANGLER" )
elif command -v wrangler >/dev/null 2>&1; then WR=( wrangler )
else WR=( npx --yes wrangler ); fi
echo "Using wrangler: ${WR[*]}"

[ -d "$SRC/full" ]  || { echo "not found: $SRC/full";  exit 1; }
[ -d "$SRC/thumb" ] || { echo "not found: $SRC/thumb"; exit 1; }

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
echo "  curl -sI https://quiz.everlandapps.com/v1/art/full/001.jpg  | head -3"
echo "  curl -sI https://quiz.everlandapps.com/v1/art/thumb/001.jpg | head -3"
