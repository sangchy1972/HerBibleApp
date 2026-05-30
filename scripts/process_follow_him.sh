#!/usr/bin/env bash
# Process the two "Follow Him" opt-in backgrounds:
#   1. strip the bottom-right "即梦AI" watermark by cropping a thin bottom
#      strip — that band sits UNDER the in-app dark scrim + Continue button,
#      so the crop is invisible in the running screen and leaves zero artifacts
#      (cleaner than clone/inpaint, which can seam over the grass texture);
#   2. downscale to a phone-background width;
#   3. emit compact .webp into assets/.
#
# Usage:  bash scripts/process_follow_him.sh <day-src> <night-src>
# Output: assets/follow_him_day.webp  assets/follow_him_night.webp
set -euo pipefail

DAY_SRC="${1:?day-source image path required}"
NIGHT_SRC="${2:?night-source image path required}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/assets"

MAXW=1080        # target width — crisp on every phone, small on disk
Q=72             # webp quality: small but clean for soft illustration art
CROP_PCT=7       # bottom % cropped away (removes the corner watermark)

proc () {
  local src="$1" out="$2"
  [ -f "$src" ] || { echo "✗ missing: $src" >&2; exit 1; }
  local H keep
  H=$(magick identify -format '%h' "$src[0]")
  keep=$(( H - H * CROP_PCT / 100 ))
  magick "$src[0]" -crop "x${keep}+0+0" +repage \
    -resize "${MAXW}x>" -strip \
    -quality "$Q" -define webp:method=6 -define webp:alpha-quality=80 \
    "$out"
  echo "✓ $(basename "$out")  $(du -h "$out" | cut -f1)  ($(magick identify -format '%wx%h' "$out"))"
}

proc "$DAY_SRC"   "$OUT_DIR/follow_him_day.webp"
proc "$NIGHT_SRC" "$OUT_DIR/follow_him_night.webp"
