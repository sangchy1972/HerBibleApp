"""Extract the 421 remaining EN bug verses from corpus at abbae66.
Output: /tmp/en_bugs_round2.json
"""
import os, json, re, hashlib
from pathlib import Path

EN_BOOKS = Path('/tmp/pd-text-corpus/commentary/en/books')
KJV_BOOKS = Path('/tmp/pd-text-corpus/bibles/en/books')

def kjv_for(slug, ch, v):
    p = KJV_BOOKS / slug / 'chapters' / f'{ch}.json'
    if not p.exists(): return ''
    d = json.loads(p.read_text())
    for row in d.get('verses', []):
        if row['verse'] == v:
            return row['text']
    return ''

def is_bug(text, ch, vn):
    m = re.match(r'^(\d+):(\d+)(?:[-–—](\d+)(?::(\d+))?)?\s', text)
    if not m: return False
    ref_ch = int(m.group(1))
    ref_v_start = int(m.group(2))
    if m.group(3):
        end_v = int(m.group(3))
        end_ch = int(m.group(3)) if m.group(4) else ref_ch
        if m.group(4): end_v = int(m.group(4))
        if (ref_ch == ch == end_ch and ref_v_start <= vn <= end_v
            or (ref_ch == ch and ref_ch != end_ch and vn >= ref_v_start)
            or (ref_ch != ch and end_ch == ch and 1 <= vn <= end_v)
            or (ref_ch < ch < end_ch)):
            return False
        return True
    return not (ref_ch == ch and ref_v_start == vn)

bugs = []
for slug in sorted(os.listdir(EN_BOOKS)):
    chap_dir = EN_BOOKS / slug / 'chapters'
    if not chap_dir.is_dir(): continue
    for chf in sorted(chap_dir.iterdir(), key=lambda p: int(p.stem)):
        ch = int(chf.stem)
        data = json.loads(chf.read_text())
        for v in data.get('verses', []):
            if is_bug(v.get('text', ''), ch, v['verse']):
                bugs.append({
                    'book': slug,
                    'ch': ch,
                    'v': v['verse'],
                    'old_text': v['text'],
                    'kjv': kjv_for(slug, ch, v['verse']),
                })

json.dump(bugs, open('/tmp/en_bugs_round2.json', 'w'), ensure_ascii=False, indent=1)
print(f'Remaining EN bugs: {len(bugs)}')
from collections import Counter
c = Counter(b['book'] for b in bugs)
for b, n in c.most_common():
    print(f'  {b}: {n}')
