"""Apply /tmp/en_fills.json to the local pd-text-corpus clone at
/tmp/pd-text-corpus. Overwrites the `text` field for each bug verse.

Writes nothing to disk if the fill is empty or shorter than 25 words
(safety floor to catch broken fills).

After running, the caller should `git add . && git commit && git push` from
inside /tmp/pd-text-corpus."""
import json, os
from pathlib import Path

CORPUS = Path('/tmp/pd-text-corpus/commentary/en/books')
FILLS = json.load(open('/tmp/en_fills.json'))

# Group fills by (book, ch)
by_chapter = {}
for key, val in FILLS.items():
    slug, ch_str, v_str = key.split('|')
    ch, v = int(ch_str), int(v_str)
    by_chapter.setdefault((slug, ch), {})[v] = val['text']

written_chapters = 0
written_verses = 0
skipped_short = 0
skipped_missing = 0

for (slug, ch), verse_map in sorted(by_chapter.items()):
    path = CORPUS / slug / 'chapters' / f'{ch}.json'
    if not path.exists():
        skipped_missing += 1
        continue
    data = json.loads(path.read_text())
    changed = False
    for v in data.get('verses', []):
        if v['verse'] in verse_map:
            new_text = verse_map[v['verse']]
            if len(new_text.split()) < 25:
                skipped_short += 1
                continue
            v['text'] = new_text
            written_verses += 1
            changed = True
    if changed:
        # Preserve the original single-line JSON format (no indent) to keep
        # git diffs clean and CDN payloads small.
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
        written_chapters += 1

print(f'Wrote {written_verses} verse fixes across {written_chapters} chapters')
print(f'Skipped: {skipped_short} too-short, {skipped_missing} missing files')
