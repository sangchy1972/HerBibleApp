"""Audit FR/PT/ES corpora for verse-explanation mismatches.

Scope: NT (Matthew through Revelation) + Psalms + Proverbs.

For each verse, parse the leading ref (FR/ES use 'X:Y', PT uses 'X.Y').
Categorize: LEGIT_SELF / LEGIT_RANGE / BUG_INHERIT_SINGLE / BUG_INHERIT_RANGE / NO_REF.
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

# Per-language: separator char used in leading verse-ref ("5:7" vs "5.7")
SEPARATORS = {'fr': ':', 'pt': '.', 'es': ':'}

def parse_ref(text, sep):
    """Match a leading 'X{sep}Y' or 'X{sep}Y-Z' (with hyphens, en-dashes, em-dashes)."""
    pat = rf'^(\d+)\{sep}(\d+)(?:[-–—](\d+)(?::(\d+))?)?\s'
    return re.match(pat, text)

def categorize(text, ch, vn, sep):
    if not text:
        return 'NO_REF'
    m = parse_ref(text, sep)
    if not m:
        return 'NO_REF'
    ref_ch = int(m.group(1))
    ref_v_start = int(m.group(2))
    if m.group(3):
        end_ch = ref_ch
        end_v = int(m.group(3))
        if m.group(4):
            end_ch = int(m.group(3))
            end_v = int(m.group(4))
        if ref_ch == ch == end_ch and ref_v_start <= vn <= end_v:
            return 'LEGIT_RANGE'
        elif ref_ch == ch and ref_ch != end_ch and vn >= ref_v_start:
            return 'LEGIT_RANGE'
        elif ref_ch != ch and end_ch == ch and 1 <= vn <= end_v:
            return 'LEGIT_RANGE'
        elif ref_ch < ch < end_ch:
            return 'LEGIT_RANGE'
        else:
            return 'BUG_INHERIT_RANGE'
    if ref_ch == ch and ref_v_start == vn:
        return 'LEGIT_SELF'
    return 'BUG_INHERIT_SINGLE'

def audit_lang(lang, corpus_root):
    sep = SEPARATORS[lang]
    cats = Counter()
    bug_samples = {'BUG_INHERIT_SINGLE': [], 'BUG_INHERIT_RANGE': []}
    affected_chapters = set()
    for slug in SCOPE_SLUGS:
        chap_dir = os.path.join(corpus_root, lang, 'books', slug, 'chapters')
        if not os.path.isdir(chap_dir):
            continue
        for chf in sorted(os.listdir(chap_dir), key=lambda x: int(x.split('.')[0])):
            ch = int(chf.split('.')[0])
            data = json.load(open(os.path.join(chap_dir, chf)))
            for v in data.get('verses', []):
                t = v.get('text', '')
                vn = v.get('verse')
                cat = categorize(t, ch, vn, sep)
                cats[cat] += 1
                if cat.startswith('BUG_'):
                    affected_chapters.add((slug, ch))
                    if len(bug_samples[cat]) < 5:
                        bug_samples[cat].append((slug, ch, vn, t[:90]))
    return cats, bug_samples, affected_chapters

CORPUS = '/tmp/pd-text-corpus/commentary'
for lang in ['fr', 'pt', 'es']:
    cats, samples, affected_chs = audit_lang(lang, CORPUS)
    total = sum(cats.values())
    bugs = cats['BUG_INHERIT_SINGLE'] + cats['BUG_INHERIT_RANGE']
    print(f'\n=== {lang.upper()} (NT + Psalms + Proverbs) ===')
    print(f'Total verses in scope: {total}')
    for k, n in cats.most_common():
        print(f'  {k:<22} {n:>5}  ({100*n/total:5.1f}%)')
    print(f'  ──── BUG TOTAL: {bugs} ({100*bugs/total:5.1f}%)')
    print(f'  Affected chapters: {len(affected_chs)}')
    print(f'  Samples (BUG_INHERIT_SINGLE):')
    for s in samples['BUG_INHERIT_SINGLE'][:3]:
        print(f'    {s[0]} {s[1]}:{s[2]} → {s[3]}')
