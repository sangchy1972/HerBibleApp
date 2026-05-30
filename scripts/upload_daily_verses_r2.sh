#!/usr/bin/env bash
# Upload the seven slim daily-verse files to Cloudflare R2.
#
# Prerequisites (one-time):
#   1. Generate the slim files:
#        node scripts/gen_cdn_verses.mjs ./_incoming_verses ./_cdn_ready
#   2. Create the bucket in the R2 dashboard (free):
#        herbible-verses-7languages
#   3. Add a custom domain to that bucket (free, auto DNS + SSL since
#      everlandapps.com is on your Cloudflare):
#        verses.everlandapps.com
#   4. wrangler must be logged in (same one the audio script uses):
#        cd ~/claude_herbible_plan/workers/herbible-plans-7languages
#        ./node_modules/.bin/wrangler login
#
# Idempotent — re-running overwrites the same keys with the same files.
# Bump VERSION here (and DAILY_VERSES_VERSION in
# src/constants/dailyVersesCdn.ts) together when republishing changed
# content under a new /vN/ folder.
set -euo pipefail

WRANGLER="${HOME}/claude_herbible_plan/workers/herbible-plans-7languages/node_modules/.bin/wrangler"
BUCKET="herbible-verses-7languages"
VERSION="v1"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)/_cdn_ready"
DOMAIN="verses.everlandapps.com"

LANGS=(en zh-Hans zh-Hant de fr es pt)

if [ ! -x "$WRANGLER" ]; then
  echo "ERROR: wrangler not found at $WRANGLER" >&2
  echo "Adjust the WRANGLER path at the top of this script, or install/login wrangler." >&2
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: $SRC_DIR not found. Run first:" >&2
  echo "  node scripts/gen_cdn_verses.mjs ./_incoming_verses ./_cdn_ready" >&2
  exit 1
fi

echo "Uploading 7 files to ${BUCKET}/${VERSION}/ ..."
for lang in "${LANGS[@]}"; do
  file="${SRC_DIR}/verses_${lang}.json"
  key="${VERSION}/verses_${lang}.json"
  if [ ! -f "$file" ]; then
    echo "  ! skip ${lang} — missing $file" >&2
    continue
  fi
  echo ">>> ${key}"
  "$WRANGLER" r2 object put "${BUCKET}/${key}" \
    --file "$file" \
    --content-type "application/json" \
    --remote
done

echo ""
echo "Done. Verify all 7 return 200 + valid JSON:"
for lang in "${LANGS[@]}"; do
  echo "  curl -sI https://${DOMAIN}/${VERSION}/verses_${lang}.json | head -1"
done
echo ""
echo "Quick structural check (English):"
echo "  curl -s https://${DOMAIN}/${VERSION}/verses_en.json | python3 -c 'import sys,json;d=json.load(sys.stdin);print(\"total\",d[\"meta\"][\"total_verses\"],\"verses\",len(d[\"verses\"]))'"
