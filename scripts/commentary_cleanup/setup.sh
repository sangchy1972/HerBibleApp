#!/bin/bash
# Bootstrap the commentary cleanup workspace from scratch.
#
# Idempotent: re-running won't re-download already-cached files.
# Total bandwidth: ~280MB (~5-10 min on home internet).
#
# After this, all scripts in scripts/commentary_cleanup/ can run against
# ~/.commentary_workspace/ for their data sources.

set -euo pipefail

WORKSPACE="${COMMENTARY_WORKSPACE:-$HOME/.commentary_workspace}"

echo "═══════════════════════════════════════════════════════════════════"
echo "  Commentary cleanup workspace setup"
echo "═══════════════════════════════════════════════════════════════════"
echo "  Target workspace: $WORKSPACE"
echo "  (override with COMMENTARY_WORKSPACE env var)"
echo

mkdir -p "$WORKSPACE/_tsn_sources"
mkdir -p "$WORKSPACE/pd_cache"

# ───────────────────────────────────────────────────────────────────────────
# 1. Clone pd-text-corpus (the target — where commentary lives)
# ───────────────────────────────────────────────────────────────────────────
if [[ -d "$WORKSPACE/pd-text-corpus/.git" ]]; then
  echo "✓ pd-text-corpus already cloned, pulling latest"
  (cd "$WORKSPACE/pd-text-corpus" && git pull --ff-only origin main)
else
  echo "→ Cloning pd-text-corpus (145MB, ~30s on home internet)"
  git clone https://github.com/sangchy1972/pd-text-corpus.git "$WORKSPACE/pd-text-corpus"
fi
echo

# ───────────────────────────────────────────────────────────────────────────
# 2. Clone BurritoTruck Tyndale per-language TSV repos
# ───────────────────────────────────────────────────────────────────────────
for lang in fr pt es; do
  target="$WORKSPACE/_tsn_sources/${lang}_tsn"
  if [[ -d "$target/.git" ]]; then
    echo "✓ ${lang}_tsn already cloned, pulling latest"
    (cd "$target" && git pull --ff-only origin master 2>/dev/null || git pull --ff-only origin main 2>/dev/null || true)
  else
    echo "→ Cloning BurritoTruck/${lang}_tsn (~5MB each)"
    git clone --depth=1 "https://git.door43.org/BurritoTruck/${lang}_tsn.git" "$target"
  fi
done
echo

# ───────────────────────────────────────────────────────────────────────────
# 3. Download PD commentaries (JFB / Clarke / Gill / MH / KD)
# ───────────────────────────────────────────────────────────────────────────
echo "→ Building list of (commentary, USFM, chapter) tuples to download…"

# Build the full list of chapters per book from pd-text-corpus
python3 <<PYEOF
import os, json
from pathlib import Path

WORKSPACE = "$WORKSPACE"
EN_BOOKS = Path(WORKSPACE) / "pd-text-corpus" / "commentary" / "en" / "books"

SLUG_TO_USFM = {
    'genesis':'GEN','exodus':'EXO','leviticus':'LEV','numbers':'NUM','deuteronomy':'DEU',
    'joshua':'JOS','judges':'JDG','ruth':'RUT','i-samuel':'1SA','ii-samuel':'2SA',
    'i-kings':'1KI','ii-kings':'2KI','i-chronicles':'1CH','ii-chronicles':'2CH',
    'ezra':'EZR','nehemiah':'NEH','esther':'EST','job':'JOB','psalms':'PSA',
    'proverbs':'PRO','ecclesiastes':'ECC','song-of-solomon':'SNG','isaiah':'ISA',
    'jeremiah':'JER','lamentations':'LAM','ezekiel':'EZK','daniel':'DAN','hosea':'HOS',
    'joel':'JOL','amos':'AMO','obadiah':'OBA','jonah':'JON','micah':'MIC','nahum':'NAM',
    'habakkuk':'HAB','zephaniah':'ZEP','haggai':'HAG','zechariah':'ZEC','malachi':'MAL',
    'matthew':'MAT','mark':'MRK','luke':'LUK','john':'JHN','acts':'ACT','romans':'ROM',
    'i-corinthians':'1CO','ii-corinthians':'2CO','galatians':'GAL','ephesians':'EPH',
    'philippians':'PHP','colossians':'COL','i-thessalonians':'1TH','ii-thessalonians':'2TH',
    'i-timothy':'1TI','ii-timothy':'2TI','titus':'TIT','philemon':'PHM','hebrews':'HEB',
    'james':'JAS','i-peter':'1PE','ii-peter':'2PE','i-john':'1JN','ii-john':'2JN',
    'iii-john':'3JN','jude':'JUD','revelation-of-john':'REV',
}

tasks = []
for slug in sorted(EN_BOOKS.iterdir() if EN_BOOKS.exists() else []):
    if not slug.is_dir(): continue
    usfm = SLUG_TO_USFM.get(slug.name)
    if not usfm: continue
    chap_dir = slug / "chapters"
    if not chap_dir.is_dir(): continue
    for chf in chap_dir.iterdir():
        if chf.suffix == ".json":
            ch = int(chf.stem)
            for cid in ['jamieson-fausset-brown', 'adam-clarke', 'john-gill', 'matthew-henry', 'keil-delitzsch']:
                tasks.append((cid, usfm, ch))

with open(f"{WORKSPACE}/pd_cache/_download_tasks.txt", "w") as f:
    for cid, usfm, ch in tasks:
        f.write(f"{cid}|{usfm}|{ch}\n")
print(f"  Total downloads queued: {len(tasks)}")
PYEOF

# Filter to only missing files
python3 <<PYEOF
import os
WORKSPACE = "$WORKSPACE"
remaining = []
with open(f"{WORKSPACE}/pd_cache/_download_tasks.txt") as f:
    for line in f:
        cid, usfm, ch = line.strip().split('|')
        target = f"{WORKSPACE}/pd_cache/{cid}_{usfm}_{ch}.json"
        if not os.path.exists(target) or os.path.getsize(target) < 50:
            remaining.append(line.strip())
with open(f"{WORKSPACE}/pd_cache/_download_remaining.txt", "w") as f:
    f.write('\n'.join(remaining))
print(f"  Still need: {len(remaining)} files")
PYEOF

REMAINING_COUNT=$(wc -l < "$WORKSPACE/pd_cache/_download_remaining.txt" | tr -d ' ')

if [[ "$REMAINING_COUNT" == "0" ]]; then
  echo "✓ All PD commentaries already cached"
else
  echo "→ Downloading $REMAINING_COUNT PD commentary chapters (P=12, ~5 min)…"

  fetch_one() {
    IFS='|' read cid usfm ch <<< "$1"
    out="$WORKSPACE/pd_cache/${cid}_${usfm}_${ch}.json"
    if curl -sf --max-time 12 "https://bible.helloao.org/api/c/$cid/$usfm/$ch.json" -o "$out" 2>/dev/null; then
      :
    else
      echo '{"chapter":{"content":[]},"_err":true}' > "$out"
    fi
  }
  export -f fetch_one
  export WORKSPACE

  cat "$WORKSPACE/pd_cache/_download_remaining.txt" | \
    xargs -P 12 -I{} bash -c 'fetch_one "{}"'

  echo "✓ PD commentary downloads complete"
fi

# ───────────────────────────────────────────────────────────────────────────
# 4. Sync the hot translation cache mirror
# ───────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

cp "$REPO_ROOT/scripts/.translation_progress/cache.json" \
   "$WORKSPACE/multilang_translation_cache.json"
echo "✓ Translation cache hot-mirror synced ($(wc -l < $WORKSPACE/multilang_translation_cache.json | tr -d ' ') lines)"
echo

echo "═══════════════════════════════════════════════════════════════════"
echo "  Setup complete"
echo "═══════════════════════════════════════════════════════════════════"
echo "  Workspace: $WORKSPACE"
echo "  Total size: $(du -sh $WORKSPACE | cut -f1)"
echo
echo "  Verify by running:"
echo "    python3 $REPO_ROOT/scripts/commentary_cleanup/full_audit.py"
echo
echo "  Source-of-truth cache (committed to git):"
echo "    $REPO_ROOT/scripts/.translation_progress/cache.json"
echo
echo "  IMPORTANT: scripts in this directory currently reference /tmp/ paths."
echo "  Either run them with COMMENTARY_WORKSPACE=$WORKSPACE and refactor them,"
echo "  or create symlinks:"
echo "    ln -sf $WORKSPACE/pd-text-corpus /tmp/pd-text-corpus"
echo "    ln -sf $WORKSPACE /tmp/pdtc"
echo "    ln -sf $WORKSPACE/pd_cache /tmp/pd_cache"
echo "    cp $WORKSPACE/multilang_translation_cache.json /tmp/pdtc/.cache/"
echo
