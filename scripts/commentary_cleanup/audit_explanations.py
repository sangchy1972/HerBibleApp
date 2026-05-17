"""Read-only audit of EN commentary corpus to categorize verse-explanation
mismatches. No mutations, no network calls."""
import os, json, re
from collections import Counter

EN_BOOKS = '/tmp/pd-text-corpus/commentary/en/books'

cats = Counter()
bug_samples = {'BUG_INHERIT_SINGLE': [], 'BUG_INHERIT_RANGE': []}

for book in sorted(os.listdir(EN_BOOKS)):
    chap_dir = os.path.join(EN_BOOKS, book, 'chapters')
    if not os.path.isdir(chap_dir):
        continue
    for chf in sorted(os.listdir(chap_dir), key=lambda x: int(x.split('.')[0])):
        ch = int(chf.split('.')[0])
        data = json.load(open(os.path.join(chap_dir, chf)))
        for v in data.get('verses', []):
            t = v.get('text', '')
            vn = v.get('verse')
            m = re.match(r'^(\d+):(\d+)(?:[-–—](\d+)(?::(\d+))?)?\s', t)
            if not m:
                cats['NO_REF'] += 1
                continue
            ref_ch = int(m.group(1))
            ref_v_start = int(m.group(2))
            if m.group(3):
                end_ch = ref_ch
                end_v = int(m.group(3))
                if m.group(4):
                    end_ch = int(m.group(3))
                    end_v = int(m.group(4))
                if ref_ch == ch == end_ch and ref_v_start <= vn <= end_v:
                    cats['LEGIT_RANGE'] += 1
                elif ref_ch == ch and ref_ch != end_ch and vn >= ref_v_start:
                    cats['LEGIT_RANGE'] += 1
                elif ref_ch != ch and end_ch == ch and 1 <= vn <= end_v:
                    cats['LEGIT_RANGE'] += 1
                elif ref_ch < ch < end_ch:
                    cats['LEGIT_RANGE'] += 1
                else:
                    cats['BUG_INHERIT_RANGE'] += 1
                    if len(bug_samples['BUG_INHERIT_RANGE']) < 8:
                        bug_samples['BUG_INHERIT_RANGE'].append((book, ch, vn, t[:90]))
            else:
                if ref_ch == ch and ref_v_start == vn:
                    cats['LEGIT_SELF'] += 1
                else:
                    cats['BUG_INHERIT_SINGLE'] += 1
                    if len(bug_samples['BUG_INHERIT_SINGLE']) < 8:
                        bug_samples['BUG_INHERIT_SINGLE'].append((book, ch, vn, t[:90]))

total = sum(cats.values())
print(f'Total verses: {total}\n')
for k, n in cats.most_common():
    print(f'  {k:<22} {n:>6}  ({100*n/total:5.2f}%)')
print()
print('--- BUG_INHERIT_SINGLE samples ---')
for s in bug_samples['BUG_INHERIT_SINGLE']:
    print(f'  {s[0]} {s[1]}:{s[2]}  →  {s[3]}')
print()
print('--- BUG_INHERIT_RANGE samples ---')
for s in bug_samples['BUG_INHERIT_RANGE']:
    print(f'  {s[0]} {s[1]}:{s[2]}  →  {s[3]}')
