#!/usr/bin/env bash
# Upload the launch loading-screen background images to R2
# (covers.everlandapps.com/v1/loading). Same bucket + wrangler as the badge
# and verses scripts. Filenames MUST match LOADING_IMAGE_FILES in
# src/constants/loadingImages.ts.
#
# Prerequisites (one-time):
#   cd ~/claude_herbible_plan/workers/herbible-plans-7languages
#   ./node_modules/.bin/wrangler login
#
# Usage (from repo root):
#   scripts/upload_loading_images_r2.sh [SRC_DIR]
#   (SRC_DIR defaults to ./_cdn_ready/loading — the compressed copies)
#
# Idempotent: re-running overwrites the same keys.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WRANGLER="${HOME}/claude_herbible_plan/workers/herbible-plans-7languages/node_modules/.bin/wrangler"
BUCKET="herbible-plans-7languages"          # custom domain: covers.everlandapps.com
PREFIX="v1/loading"
SRC="${1:-${REPO}/_cdn_ready/loading}"

[ -x "$WRANGLER" ] || { echo "wrangler not found at $WRANGLER — run 'wrangler login' first"; exit 1; }
[ -d "$SRC" ] || { echo "source dir not found: $SRC"; exit 1; }

# Expected filenames, derived from the app constant (single source of truth).
EXPECTED="$(node -e '
  const s=require("fs").readFileSync("'"$REPO"'/src/constants/loadingImages.ts","utf8");
  const re=/'"'"'([^'"'"']+\.jpg)'"'"'/g; let m, out=[];
  while((m=re.exec(s))) out.push(m[1]);
  process.stdout.write(out.join("\n"));
')"

uploaded=0; missing=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if [ -f "${SRC}/${f}" ]; then
    echo ">>> ${f}"
    "$WRANGLER" r2 object put "${BUCKET}/${PREFIX}/${f}" \
      --file "${SRC}/${f}" --content-type "image/jpeg" --remote
    uploaded=$((uploaded+1))
  else
    echo "!!! MISSING: ${f} (not found in ${SRC})"
    missing=$((missing+1))
  fi
done <<< "$EXPECTED"

echo
echo "Uploaded ${uploaded} loading images. Missing: ${missing}."
echo "Verify: curl -sI https://covers.everlandapps.com/v1/loading/122f7999ed9ff50d5e0f29c67ee36a88.jpg"
