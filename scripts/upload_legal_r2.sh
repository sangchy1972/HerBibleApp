#!/usr/bin/env bash
# Upload the legal pages (privacy policy + support) to R2, served at:
#   https://covers.everlandapps.com/legal/privacy.html
#   https://covers.everlandapps.com/legal/support.html
# These URLs go into App Store Connect (App Privacy → Privacy Policy URL,
# version page → Support URL) and Google Play Console (Data safety).
#
# Prerequisites (one-time, in any terminal):
#   npx --yes wrangler login        # browser OAuth to the Cloudflare account
#
# Usage:
#   scripts/upload_legal_r2.sh
#
# Idempotent: re-running overwrites the same keys (policy edits go live on
# the next run; R2 serves raw keys, no cache-busting needed for legal pages).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BUCKET="herbible-plans-7languages"          # custom domain: covers.everlandapps.com
PREFIX="legal"

# Resolve a usable wrangler: $WRANGLER env override → on PATH → npx fallback.
# npm_config_ignore_scripts: wrangler depends on sharp, whose prebuilt-binary
# download fails behind a proxy and then dies building from source — which made
# `npx wrangler` fail SILENTLY (this bit us on 2026-07-04: login + upload both
# no-oped). wrangler itself never needs sharp for R2 uploads.
export npm_config_ignore_scripts=true
if [ -n "${WRANGLER:-}" ] && [ -x "${WRANGLER}" ]; then WR=( "$WRANGLER" )
elif command -v wrangler >/dev/null 2>&1; then WR=( wrangler )
else WR=( npx --yes wrangler ); fi
echo "Using wrangler: ${WR[*]}"

for f in privacy.html support.html; do
  src="${REPO}/legal/${f}"
  [ -f "$src" ] || { echo "missing: $src"; exit 1; }
  echo ">>> ${PREFIX}/${f}"
  "${WR[@]}" r2 object put "${BUCKET}/${PREFIX}/${f}" \
    --file "$src" --content-type "text/html; charset=utf-8" --remote
done

echo
echo "Done. Verify:"
echo "  https://covers.everlandapps.com/legal/privacy.html"
echo "  https://covers.everlandapps.com/legal/support.html"
