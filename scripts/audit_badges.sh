#!/usr/bin/env bash
# Checks all 72 achievement badges against the live R2 CDN and reports any
# that are missing (HTTP != 200). Run after uploading. No deps beyond curl.
set -uo pipefail
BASE="https://covers.everlandapps.com/v1/badges"
FILES=(
  highlight-count10.png
  highlight-count100.png
  highlight-count15.png
  highlight-count150.png
  highlight-count20.png
  highlight-count200.png
  highlight-count25.png
  highlight-count250.png
  highlight-count30.png
  highlight-count300.png
  highlight-count40.png
  highlight-count50.png
  highlight-first.png
  milestone-anniversary.png
  milestone-crown.png
  milestone-dawn7.png
  milestone-fullYear.png
  milestone-river30.png
  milestone-share1.png
  milestone-share3.png
  milestone-share5.png
  milestone-triple.png
  note-count10.png
  note-count100.png
  note-count15.png
  note-count150.png
  note-count20.png
  note-count200.png
  note-count25.png
  note-count250.png
  note-count30.png
  note-count300.png
  note-count40.png
  note-count50.png
  note-count75.png
  note-first.png
  plan-count10.png
  plan-count12.png
  plan-count15.png
  plan-count2.png
  plan-count20.png
  plan-count25.png
  plan-count3.png
  plan-count30.png
  plan-count7.png
  plan-deepRoots.png
  plan-first.png
  plan-speed10in30.png
  plan-speed3in7.png
  plan-speed5in30.png
  prayer-first.png
  prayer-streak100.png
  prayer-streak14.png
  prayer-streak3.png
  prayer-streak30.png
  prayer-streak365.png
  prayer-streak7.png
  prayer-streak90.png
  scripture-books10.png
  scripture-books20.png
  scripture-books30.png
  scripture-books50.png
  scripture-first.png
  scripture-read10.png
  scripture-read100.png
  scripture-read25.png
  scripture-read5.png
  scripture-read50.png
  scripture-read75.png
  scripture-streak3.png
  scripture-streak30.png
  scripture-streak7.png
)
missing=0; ok=0
for f in "${FILES[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -I "$BASE/$f")
  if [ "$code" = "200" ]; then ok=$((ok+1)); else echo "MISSING ($code): $f"; missing=$((missing+1)); fi
done
echo "----"
echo "present: $ok / 72   missing: $missing"
