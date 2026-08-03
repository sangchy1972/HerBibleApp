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
BUCKET="herbible-plans-7languages"          # custom domain: covers.everlandapps.com
PREFIX="v1/badges"
SRC="${1:-${HOME}/Desktop/badges}"

# Resolve a usable wrangler: $WRANGLER env override → on PATH → npx fallback.
# (The old hardcoded ~/claude_herbible_plan/... path no longer exists.)
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
    "${WR[@]}" r2 object put "${BUCKET}/${PREFIX}/${f}" \
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
