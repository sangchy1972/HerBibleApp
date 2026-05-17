#!/bin/bash
# run_round.sh <round_number>
#
# After cowork writes scripts/commentary_cleanup/rounds/round<N>.py, calling
# this script does ALL the rest of the work in one shot:
#   1. Apply translations to scripts/.translation_progress/cache.json
#   2. Commit cache.json to HerBibleApp
#   3. Rebuild FR/PT/ES corpus via Phase 0 + OT extension
#   4. Push the corpus update to sangchy1972/pd-text-corpus → new SHA
#   5. Bump CORPUS_COMMIT in src/constants/corpus.ts to the new SHA
#   6. Commit the bump to HerBibleApp
#   7. Push HerBibleApp branch
#
# Idempotent: re-running with the same N will detect "no changes" and exit.
# Safe: uses `set -euo pipefail` so any failure stops the chain.
#
# Usage:
#   bash scripts/commentary_cleanup/run_round.sh 2
#
# Cowork can call this with Bash directly. If cowork can't Bash, user runs
# it from Terminal once per round.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash $0 <round_number>"
  echo "Example: bash $0 2"
  exit 1
fi

N=$1
WORKSPACE="${COMMENTARY_WORKSPACE:-$HOME/.commentary_workspace}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROUND_FILE="$SCRIPT_DIR/rounds/round${N}.py"
CORPUS_CLONE="$WORKSPACE/pd-text-corpus"

echo "═══════════════════════════════════════════════════════════════════"
echo "  Round ${N} pipeline"
echo "═══════════════════════════════════════════════════════════════════"
echo "  Round file:  $ROUND_FILE"
echo "  Repo root:   $REPO_ROOT"
echo "  Workspace:   $WORKSPACE"
echo

# Sanity checks
if [[ ! -f "$ROUND_FILE" ]]; then
  echo "ERROR: round file not found: $ROUND_FILE"
  echo "Cowork should write the round file before calling this script."
  exit 1
fi
if [[ ! -d "$CORPUS_CLONE/.git" ]]; then
  echo "ERROR: pd-text-corpus clone not found at $CORPUS_CLONE"
  echo "Run setup.sh first."
  exit 1
fi

cd "$REPO_ROOT"

# ─── Step 1: Apply translations to cache ───────────────────────────────────
echo "→ [1/7] Applying round ${N} translations to cache.json…"
python3 "$ROUND_FILE"
echo

# ─── Step 2: Commit cache to HerBibleApp ───────────────────────────────────
echo "→ [2/7] Committing cache + round file to HerBibleApp…"
git add scripts/.translation_progress/cache.json "$ROUND_FILE"
if git diff --cached --quiet; then
  echo "  No cache changes (round may have been applied already). Continuing."
else
  git commit -m "translations: round ${N}"
fi
git push origin HEAD
echo

# ─── Step 3: Rebuild FR/PT/ES corpus ───────────────────────────────────────
echo "→ [3/7] Rebuilding FR/PT/ES NT+Psalms+Proverbs corpus…"
python3 "$SCRIPT_DIR/build_phase0.py"
echo
echo "→ [4/7] Rebuilding FR/PT OT corpus…"
python3 "$SCRIPT_DIR/build_phase0_ot.py"
echo

# ─── Step 5: Push corpus update ────────────────────────────────────────────
echo "→ [5/7] Pushing corpus update to sangchy1972/pd-text-corpus…"
cd "$CORPUS_CLONE"
git add commentary/
if git diff --cached --quiet; then
  echo "  No corpus changes (translations may already be in CDN). Skipping push."
  NEW_SHA=$(git rev-parse HEAD)
else
  git commit -m "round ${N} translation propagation (auto)"
  git push origin main
  NEW_SHA=$(git rev-parse HEAD)
  echo "  New SHA: $NEW_SHA"
fi
cd "$REPO_ROOT"
echo

# ─── Step 6: Bump CORPUS_COMMIT ────────────────────────────────────────────
echo "→ [6/7] Bumping CORPUS_COMMIT to ${NEW_SHA:0:7}…"
PIN_FILE="src/constants/corpus.ts"
if [[ ! -f "$PIN_FILE" ]]; then
  echo "ERROR: $PIN_FILE not found in repo root"
  exit 1
fi
# Replace the SHA on the CORPUS_COMMIT line, preserving formatting
python3 - <<PYEOF
import re
from pathlib import Path
p = Path("$PIN_FILE")
src = p.read_text()
new_src = re.sub(
    r"(export const CORPUS_COMMIT = ')[a-f0-9]{40}(';)",
    r"\g<1>$NEW_SHA\g<2>",
    src,
    count=1,
)
if src == new_src:
    print("  WARN: CORPUS_COMMIT line not found or already at this SHA; skipping write")
else:
    p.write_text(new_src)
    print("  ✓ Bumped")
PYEOF
echo

# ─── Step 7: Commit + push the bump ────────────────────────────────────────
echo "→ [7/7] Committing + pushing the pin bump…"
git add "$PIN_FILE"
if git diff --cached --quiet; then
  echo "  No pin change to commit."
else
  git commit -m "bump CORPUS_COMMIT → ${NEW_SHA:0:7} (round ${N} auto)"
  git push origin HEAD
fi
echo

echo "═══════════════════════════════════════════════════════════════════"
echo "  ✓ Round ${N} complete"
echo "═══════════════════════════════════════════════════════════════════"
echo "  Cache total:   $(python3 -c 'import json; print(len(json.load(open(\"scripts/.translation_progress/cache.json\"))))') entries"
echo "  Corpus SHA:    $NEW_SHA"
echo "  jsDelivr URL:  https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${NEW_SHA}/commentary/en/books/i-peter/chapters/5.json"
echo
echo "  Wait 1-2 minutes for jsDelivr edge cache to refresh, then verify."
echo
