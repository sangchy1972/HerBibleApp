#!/bin/bash
# Download Matthew Henry + Keil-Delitzsch chapters for remaining bug chapters
set -u
CACHE=/tmp/pd_cache
mkdir -p "$CACHE"

python3 - <<'PYEOF' > /tmp/pd_tasks_round2.txt
import json, os
bugs = json.load(open('/tmp/en_bugs_round2.json'))
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
pairs = sorted({(b['book'], b['ch']) for b in bugs})
CACHE = '/tmp/pd_cache'
for slug, ch in pairs:
    usfm = SLUG_TO_USFM[slug]
    for cid in ('matthew-henry', 'keil-delitzsch'):
        out = os.path.join(CACHE, f'{cid}_{usfm}_{ch}.json')
        if os.path.exists(out) and os.path.getsize(out) > 50:
            continue
        print(f'{cid}|{usfm}|{ch}')
PYEOF

TODO=$(wc -l < /tmp/pd_tasks_round2.txt)
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
cat /tmp/pd_tasks_round2.txt | xargs -P 10 -I{} bash -c 'fetch_one "{}"' > /tmp/pd_fetch_round2.txt
OK=$(grep -c '^OK$' /tmp/pd_fetch_round2.txt)
FAIL=$(grep -c '^FAIL$' /tmp/pd_fetch_round2.txt)
echo "Final: OK=$OK FAIL=$FAIL"
