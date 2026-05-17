#!/bin/bash
# Parallel curl downloads via xargs -P
set -u
CACHE=/tmp/pd_cache
mkdir -p "$CACHE"

# Build task list (skip already-downloaded)
python3 - <<'PYEOF' > /tmp/pd_tasks_remaining.txt
import json, os
m = json.load(open('/tmp/pd_manifest.json'))
CACHE = '/tmp/pd_cache'
for slug, ch, usfm in m:
    for cid in ('jamieson-fausset-brown', 'adam-clarke', 'john-gill'):
        out = os.path.join(CACHE, f'{cid}_{usfm}_{ch}.json')
        if os.path.exists(out) and os.path.getsize(out) > 50:
            continue
        print(f'{cid}|{usfm}|{ch}')
PYEOF

TODO=$(wc -l < /tmp/pd_tasks_remaining.txt)
echo "Remaining: $TODO"

fetch_one() {
  IFS='|' read cid usfm ch <<< "$1"
  out="/tmp/pd_cache/${cid}_${usfm}_${ch}.json"
  if curl -sf --max-time 12 "https://bible.helloao.org/api/c/$cid/$usfm/$ch.json" -o "$out" 2>/dev/null; then
    echo "OK"
  else
    echo '{"chapter":{"content":[]},"_err":true}' > "$out"
    echo "FAIL"
  fi
}
export -f fetch_one

cat /tmp/pd_tasks_remaining.txt | xargs -P 12 -I{} bash -c 'fetch_one "{}"' > /tmp/pd_fetch_results.txt
OK=$(grep -c '^OK$' /tmp/pd_fetch_results.txt)
FAIL=$(grep -c '^FAIL$' /tmp/pd_fetch_results.txt)
echo "Final: OK=$OK FAIL=$FAIL"
