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

# NOTE: verses are now served through the attested plans Worker
# (plans.everlandapps.com/v1/verses/<lang>.json), reading plaintext files
# from the ROOT of this private bucket. There is NO public custom domain
# and NO version folder — the Worker reads key `verses_<lang>.json`
# directly, and content freshness is handled by R2 ETags.
WRANGLER="${HOME}/claude_herbible_plan/workers/herbible-plans-7languages/node_modules/.bin/wrangler"
BUCKET="herbible-verses-7languages"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)/_cdn_ready"

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

echo "Uploading 7 files to the ROOT of ${BUCKET} ..."
for lang in "${LANGS[@]}"; do
  file="${SRC_DIR}/verses_${lang}.json"
  key="verses_${lang}.json"
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
echo "Done. The bucket is PRIVATE — verify through the attested Worker, not"
echo "a public URL. Quickest check: open the app and confirm the prayer"
echo "card shows day-N content past day 3 (the bundle only covers 1-3)."
echo "Or, with a valid Bearer token:"
echo "  curl -s -H 'Authorization: Bearer <JWT>' https://plans.everlandapps.com/v1/verses/en.json | head -c 200"
