"""V3 audit: ground-truth comparison against BurritoTruck TSV.

For each chapter:
  1. Parse TSV blocks: each leading ref → text. Compute its range [start, end].
  2. For each verse N, find the smallest-range block whose range covers N.
     That's the LEGIT covering block.
  3. Read corpus verse text.
  4. Match cases:
     - Corpus text starts with the covering block's text (after normalization) → LEGIT
     - Corpus text starts with a DIFFERENT block's text → BUG_FALL_THROUGH
     - No covering block exists (true gap) → either filled from cache/LLM (acceptable
       if non-empty and not duplicated) or fall-through from another block (bug)
"""
import os, json, re
from collections import Counter

NT_SLUGS = [
    'matthew', 'mark', 'luke', 'john', 'acts',
    'romans', 'i-corinthians', 'ii-corinthians', 'galatians', 'ephesians',
    'philippians', 'colossians', 'i-thessalonians', 'ii-thessalonians',
    'i-timothy', 'ii-timothy', 'titus', 'philemon', 'hebrews', 'james',
    'i-peter', 'ii-peter', 'i-john', 'ii-john', 'iii-john', 'jude',
    'revelation-of-john',
]
SCOPE_SLUGS = NT_SLUGS + ['psalms', 'proverbs']

SLUG_TO_USFM = {
    'matthew':'MAT','mark':'MRK','luke':'LUK','john':'JHN','acts':'ACT','romans':'ROM',
    'i-corinthians':'1CO','ii-corinthians':'2CO','galatians':'GAL','ephesians':'EPH',
    'philippians':'PHP','colossians':'COL','i-thessalonians':'1TH','ii-thessalonians':'2TH',
    'i-timothy':'1TI','ii-timothy':'2TI','titus':'TIT','philemon':'PHM','hebrews':'HEB',
    'james':'JAS','i-peter':'1PE','ii-peter':'2PE','i-john':'1JN','ii-john':'2JN',
    'iii-john':'3JN','jude':'JUD','revelation-of-john':'REV',
    'psalms':'PSA','proverbs':'PRO',
}
TSN_ROOT = '/tmp/pdtc/_tsn_sources'
CORPUS = '/tmp/pd-text-corpus/commentary'

def normalize(s):
    """Strip leading/trailing whitespace, collapse spaces, strip leading ref."""
    s = re.sub(r'\s+', ' ', s).strip()
    # Strip a leading 'X:Y' or 'X.Y' or 'X:Y-Z' ref
    s = re.sub(r'^\d+[:.]\d+(?:[-–—]\d+(?:[:.]\d+)?)?\s+', '', s)
    # Strip markdown bold around opening ref
    s = re.sub(r'^\*\*\d+[:.]\d+[^*]*\*\*\s*', '', s)
    return s.lower()[:80]

def parse_tsv_chapter(lang, usfm, ch):
    """Return list of (start_v, end_v, normalized_text) blocks for this chapter."""
    path = os.path.join(TSN_ROOT, f'{lang}_tsn', 'ingredients', f'{usfm}.tsv')
    if not os.path.exists(path):
        return []
    blocks = []
    with open(path) as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 3 or parts[0] == 'REF':
                continue
            ref = parts[0]
            text = parts[2]
            # ref can be "5:7", "5:7-12", "5:1-14", etc.
            m = re.match(r'^(\d+):(\d+)(?:-(\d+))?$', ref)
            if not m:
                continue
            ref_ch = int(m.group(1))
            if ref_ch != ch:
                continue
            start = int(m.group(2))
            end = int(m.group(3)) if m.group(3) else start
            blocks.append((start, end, normalize(text)))
    return blocks

def covering_block(blocks, vn):
    """Return the smallest-range block whose range covers verse vn, or None."""
    candidates = [b for b in blocks if b[0] <= vn <= b[1]]
    if not candidates:
        return None
    # Smallest range = most specific
    return min(candidates, key=lambda b: b[1] - b[0])

def audit_lang(lang):
    cats = Counter()
    affected = set()
    samples_bug = []
    samples_orphan = []
    for slug in SCOPE_SLUGS:
        usfm = SLUG_TO_USFM[slug]
        chap_dir = os.path.join(CORPUS, lang, 'books', slug, 'chapters')
        if not os.path.isdir(chap_dir):
            continue
        for chf in sorted(os.listdir(chap_dir), key=lambda x: int(x.split('.')[0])):
            ch = int(chf.split('.')[0])
            blocks = parse_tsv_chapter(lang, usfm, ch)
            data = json.load(open(os.path.join(chap_dir, chf)))
            block_texts = {b[2] for b in blocks}
            for v in data.get('verses', []):
                vn = v['verse']
                actual_norm = normalize(v.get('text', ''))
                expected = covering_block(blocks, vn)
                if expected and expected[2] == actual_norm:
                    cats['LEGIT'] += 1
                elif expected is None:
                    # No TSV coverage. Is the actual text inherited from some other block?
                    if actual_norm in block_texts:
                        cats['BUG_GAP_INHERIT'] += 1
                        affected.add((slug, ch, vn))
                        if len(samples_bug) < 5:
                            samples_bug.append((slug, ch, vn, v['text'][:80]))
                    else:
                        cats['ORPHAN_FILL'] += 1  # cache/LLM fill, probably ok
                        if len(samples_orphan) < 5:
                            samples_orphan.append((slug, ch, vn, v['text'][:80]))
                else:
                    # TSV says one block should cover, but actual is different.
                    if actual_norm in block_texts:
                        cats['BUG_WRONG_BLOCK'] += 1
                        affected.add((slug, ch, vn))
                        if len(samples_bug) < 5:
                            samples_bug.append((slug, ch, vn, v['text'][:80]))
                    else:
                        cats['MISMATCH_OTHER'] += 1
    return cats, affected, samples_bug, samples_orphan

for lang in ['fr', 'pt', 'es']:
    cats, affected, samples_bug, samples_orphan = audit_lang(lang)
    total = sum(cats.values())
    bugs = cats['BUG_GAP_INHERIT'] + cats['BUG_WRONG_BLOCK']
    print(f'\n=== {lang.upper()} (NT + Psalms + Proverbs) — Ground-truth audit ===')
    print(f'Total verses in scope: {total}')
    for k, n in cats.most_common():
        print(f'  {k:<22} {n:>5}  ({100*n/total:5.2f}%)')
    print(f'  ──── REAL BUG TOTAL: {bugs}')
    print(f'  Affected (slug, ch, v): {len(affected)}')
    print(f'  Sample bugs:')
    for s in samples_bug[:3]:
        print(f'    {s[0]} {s[1]}:{s[2]} → {s[3]}')
