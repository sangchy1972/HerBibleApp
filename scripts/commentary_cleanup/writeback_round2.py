"""Apply round-2 EN fills (PD round-2 + 340 hand-written) to the corpus."""
import json
from pathlib import Path

CORPUS = Path('/tmp/pd-text-corpus/commentary/en/books')
FILLS = json.load(open('/tmp/en_fills_round2.json'))

# Group by (book, ch)
by_chapter = {}
for key, val in FILLS.items():
    slug, ch_str, v_str = key.split('|')
    by_chapter.setdefault((slug, int(ch_str)), {})[int(v_str)] = val['text']

written_chapters = 0
written_verses = 0
skipped = 0

for (slug, ch), verse_map in sorted(by_chapter.items()):
    path = CORPUS / slug / 'chapters' / f'{ch}.json'
    if not path.exists():
        continue
    data = json.loads(path.read_text())
    changed = False
    for v in data.get('verses', []):
        if v['verse'] in verse_map:
            new_text = verse_map[v['verse']]
            if len(new_text.split()) < 12:
                skipped += 1; continue
            v['text'] = new_text
            written_verses += 1
            changed = True
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
        written_chapters += 1

print(f'Round-2 fixes: wrote {written_verses} verses across {written_chapters} chapters; skipped {skipped}')
