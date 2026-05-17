"""Re-run Phase B with CORRECT logic for FR/PT/ES.

For each chapter:
  1. Parse TSV blocks: ref → text, range [start, end].
  2. For each KJV verse N:
     - Find ALL blocks whose range includes N
     - Pick the SMALLEST-range block (most specific)
     - Write {verse: N, text: <block.text>} to staged output
     - If NO block covers N: write {verse: N, text: null} — it's a gap

The KEY correction vs the original buggy Phase B: we never inherit across
range boundaries. Verses outside any block's stated range are NULL gaps.
"""
import os, json, re, hashlib
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
EN_CORPUS = '/tmp/pd-text-corpus/commentary/en/books'

def parse_tsv_chapter(lang, usfm, ch):
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
            m = re.match(r'^(\d+):(\d+)(?:-(\d+))?$', ref)
            if not m:
                continue
            if int(m.group(1)) != ch:
                continue
            start = int(m.group(2))
            end = int(m.group(3)) if m.group(3) else start
            blocks.append({'start': start, 'end': end, 'text': text})
    return blocks

def covering_block(blocks, vn, max_range=4):
    """Smallest-range block that covers vn, with range ≤ max_range verses.
    Broad blocks (chapter overviews like '5:1-14') are NOT used to cascade —
    they're treated as 'overview only', not as per-verse covering blocks.
    """
    candidates = [
        b for b in blocks
        if b['start'] <= vn <= b['end'] and (b['end'] - b['start']) < max_range
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda b: b['end'] - b['start'])

def chapter_max_verse(slug, ch):
    """How many verses does this KJV chapter have? Read from EN corpus."""
    p = os.path.join(EN_CORPUS, slug, 'chapters', f'{ch}.json')
    if not os.path.exists(p):
        return 0
    d = json.load(open(p))
    return max((v['verse'] for v in d.get('verses', [])), default=0)

def chapter_max_count(slug):
    """How many chapters in this book? List chapter files."""
    d = os.path.join(EN_CORPUS, slug, 'chapters')
    if not os.path.isdir(d):
        return 0
    return max((int(f.split('.')[0]) for f in os.listdir(d) if f.endswith('.json')), default=0)

def run_phaseB(lang):
    covered = 0
    null_gap = 0
    for slug in SCOPE_SLUGS:
        usfm = SLUG_TO_USFM[slug]
        max_ch = chapter_max_count(slug)
        for ch in range(1, max_ch + 1):
            max_v = chapter_max_verse(slug, ch)
            if max_v == 0:
                continue
            blocks = parse_tsv_chapter(lang, usfm, ch)
            for vn in range(1, max_v + 1):
                blk = covering_block(blocks, vn)
                if blk:
                    covered += 1
                else:
                    null_gap += 1
    return covered, null_gap

for lang in ['fr', 'pt', 'es']:
    covered, gap = run_phaseB(lang)
    total = covered + gap
    print(f'{lang}: scope total={total}  '
          f'Tyndale-covered={covered} ({100*covered/total:.1f}%)  '
          f'gaps (need fill)={gap} ({100*gap/total:.1f}%)')
