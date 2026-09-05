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

# NOTE: verses are served PUBLICLY + R2-direct via the bucket's custom
# domain verses.everlandapps.com (the attested-Worker note that used to sit
# here was stale — see src/constants/dailyVersesCdn.ts).
#
# ⚠️ VERSION PREFIX IS MANDATORY for content-breaking batches: shipped
# builds re-fetch this bucket on every cold start, so overwriting the keys
# an old build reads would break live users instantly (batch 2 ships
# modern.text empty — old slim() would render blank verse pages). Keep
# VERSION in lockstep with DAILY_VERSES_PATH in dailyVersesCdn.ts.
WRANGLER="${HOME}/claude_herbible_plan/workers/herbible-plans-7languages/node_modules/.bin/wrangler"
# Fall back to npx when the workers checkout isn't on this machine.
if [ ! -x "$WRANGLER" ]; then WRANGLER="npx --yes wrangler"; fi
BUCKET="herbible-verses-7languages"
VERSION="v2"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)/_cdn_ready"

LANGS=(en zh-Hans zh-Hant de fr es pt)

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
  $WRANGLER r2 object put "${BUCKET}/${key}" \
    --file "$file" \
    --content-type "application/json" \
    --remote
done

echo ""
echo "Done. Verify the public URL directly:"
echo "  curl -s https://verses.everlandapps.com/${VERSION}/verses_en.json | head -c 200"
