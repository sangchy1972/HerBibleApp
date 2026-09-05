#!/usr/bin/env bash
# Convert + upload the Gospels & Psalms per-chapter hero art.
#
# Source: the owner's watermark-free PNG set (2496×1664, 4–6 MB each).
# This script resamples every PNG to a 1280 px long edge JPEG (quality 72,
# ~200–380 KB) via macOS `sips`, then uploads to the covers bucket under a
# VERSIONED prefix. 241 files: 89 gospel chapters + 150 psalms + 2 Psalm-18
# range pieces. Client mapping lives in src/constants/gpHeroImages.ts — the
# BASE there must match BUCKET/PREFIX here exactly (domain is bucket-root).
#
# ⚠️ wrangler auth: if CLOUDFLARE_API_TOKEN / CF_API_TOKEN / CLOUDFLARE_API_KEY
# is set in this shell, wrangler uses it and IGNORES `wrangler login` — a stale
# env token 401s forever. Unset them to use your login session.
#
# Re-cutting the art later? Bump PREFIX to backgrounds/gp/v2 AND the BASE in
# gpHeroImages.ts together — never overwrite same-name keys (Cloudflare cache).
set -euo pipefail

SRC_DIR="${1:-/Users/liwencao/Desktop/Her Bible/gospel&psalms_nowatermark}"
OUT_DIR="${2:-/tmp/gp_heroes_jpg}"
BUCKET="herbible-plans-7languages"
PREFIX="backgrounds/gp/v1"
WRANGLER="npx --yes wrangler"

if [ -n "${CLOUDFLARE_API_TOKEN:-}${CF_API_TOKEN:-}${CLOUDFLARE_API_KEY:-}" ]; then
  echo "⚠️  A Cloudflare token env var is set — wrangler will use IT, not your login." >&2
fi
[ -d "$SRC_DIR" ] || { echo "ERROR: source dir not found: $SRC_DIR" >&2; exit 1; }

mkdir -p "$OUT_DIR"
echo "── Converting PNG → 1280px q72 JPEG into $OUT_DIR"
count=0
for f in "$SRC_DIR"/gp_*.png; do
  base="$(basename "${f%.png}")"
  out="$OUT_DIR/${base}.jpg"
  if [ ! -s "$out" ]; then
    sips -Z 1280 -s format jpeg -s formatOptions 72 "$f" --out "$out" >/dev/null
  fi
  count=$((count+1))
done
echo "   $count converted (cached ones skipped)."

echo "── Uploading to ${BUCKET}/${PREFIX}/ (6-way parallel)"
# Parallel because each `npx wrangler` invocation pays seconds of startup —
# serial across 241 files was ~80 min. xargs exits non-zero if ANY child
# failed, and set -e propagates that; per-file OK/FAIL lines make a partial
# failure findable (re-running is idempotent — same key, same bytes).
# -n 1 (one file per child as $1), NOT -I{}: BSD xargs -I caps the substituted
# argument at 255 bytes and dies with "command line cannot be assembled".
export BUCKET PREFIX WRANGLER
ls "$OUT_DIR"/gp_*.jpg | xargs -P 6 -n 1 bash -c '
  f="$1"; key="${PREFIX}/$(basename "$f")"
  if $WRANGLER r2 object put "${BUCKET}/${key}" --file "$f" --content-type image/jpeg --remote >/dev/null 2>&1; then
    echo "OK   $key"
  else
    echo "FAIL $key"; exit 1
  fi
' _

echo ""
echo "Done. Spot-check:"
echo "  curl -sI https://covers.everlandapps.com/${PREFIX}/gp_gospel_matthew_01.jpg | head -3"
