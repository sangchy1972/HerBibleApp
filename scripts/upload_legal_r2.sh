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
# ⚠️ If you have CLOUDFLARE_API_TOKEN (or CF_API_TOKEN / CLOUDFLARE_API_KEY) set
# in your shell, wrangler uses it and IGNORES the OAuth login entirely — so a
# stale token gives 401 "Invalid access token [code: 9109]" no matter how many
# times you re-login. Unset it first, or replace it with a token that has
# Account → Workers R2 Storage → Edit. The preflight below tells you which.
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

# Preflight: an env token silently outranks `wrangler login`, and the resulting
# 401 names neither the variable nor the fix.
for v in CLOUDFLARE_API_TOKEN CF_API_TOKEN CLOUDFLARE_API_KEY; do
  if [ -n "${!v:-}" ]; then
    echo
    echo "NOTE: \$${v} is set, so wrangler will use it and ignore any OAuth login."
    echo "      If this run fails with 401 / 'Invalid access token', either"
    echo "        unset ${v}   (then: npx --yes wrangler login)"
    echo "      or replace it with a token that has Workers R2 Storage → Edit."
    echo
  fi
done

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
