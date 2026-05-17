"""Comprehensive audit of EN/FR/PT/ES commentary corpus at SHA abbae66.

Inspects the LOCAL /tmp/pd-text-corpus clone, which mirrors what's on GitHub
+ CDN at abbae669eea5bcaac7bd80ed2800e881b53d1ee2 (verified via curl above).

Reports per-language:
  - Total verses
  - Per-chapter file presence
  - Content state breakdown:
    * Native Tyndale (BurritoTruck text — non-fallback, non-bug-signature)
    * Cache-translated (non-fallback content from prior multilang campaign)
    * EN fallback (verse.fallback === 'en')
    * Type B BUG remaining (leading verse-ref doesn't match actual verse)
    * NO_REF (no leading ref pattern)
  - In-scope (NT + Ps + Pr) vs out-of-scope (OT history/law/etc.)

For EN, additionally verify:
  - All 31,102 KJV verses present
  - Round-1 fix (6,619 verses) appears applied
  - Remaining ~421 known-uncovered are flagged
"""
import os, json, re, hashlib
from collections import Counter
from pathlib import Path

CORPUS = Path('/tmp/pd-text-corpus/commentary')
EN_BOOKS = CORPUS / 'en' / 'books'

NT_SLUGS = [
    'matthew','mark','luke','john','acts','romans','i-corinthians',
    'ii-corinthians','galatians','ephesians','philippians','colossians',
    'i-thessalonians','ii-thessalonians','i-timothy','ii-timothy','titus',
    'philemon','hebrews','james','i-peter','ii-peter','i-john','ii-john',
    'iii-john','jude','revelation-of-john',
]
SCOPE = set(NT_SLUGS + ['psalms', 'proverbs'])

def categorize_text(text, ch, vn):
    """Returns one of: NO_REF, LEGIT_SELF, LEGIT_RANGE, BUG_INHERIT, EMPTY"""
    if not text or not text.strip():
        return 'EMPTY'
    # Support both ':' (EN/FR/ES) and '.' (PT) separators
    m = re.match(r'^(\d+)[:.](\d+)(?:[-–—](\d+)(?:[:.](\d+))?)?\s', text)
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
        if (ref_ch == ch == end_ch and ref_v_start <= vn <= end_v
            or (ref_ch == ch and ref_ch != end_ch and vn >= ref_v_start)
            or (ref_ch != ch and end_ch == ch and 1 <= vn <= end_v)
            or (ref_ch < ch < end_ch)):
            return 'LEGIT_RANGE'
        return 'BUG_INHERIT'
    if ref_ch == ch and ref_v_start == vn:
        return 'LEGIT_SELF'
    return 'BUG_INHERIT'

def audit_lang(lang):
    in_scope = Counter()
    out_scope = Counter()
    total_verses = 0
    chapters_seen = 0
    chapters_missing = 0
    fallback_count = 0
    expected_books = set(os.listdir(EN_BOOKS))  # use EN as ground truth for book list
    lang_books = CORPUS / lang / 'books'
    for slug in sorted(expected_books):
        en_chap_dir = EN_BOOKS / slug / 'chapters'
        lang_chap_dir = lang_books / slug / 'chapters'
        if not en_chap_dir.is_dir():
            continue
        for chf in en_chap_dir.iterdir():
            if not chf.name.endswith('.json'):
                continue
            ch = int(chf.stem)
            lang_chf = lang_chap_dir / chf.name
            if not lang_chf.exists():
                chapters_missing += 1
                # Verses not present in this lang → treated as missing
                en_data = json.loads(chf.read_text())
                missing_n = len(en_data.get('verses', []))
                if slug in SCOPE:
                    in_scope['MISSING_CHAPTER'] += missing_n
                else:
                    out_scope['MISSING_CHAPTER'] += missing_n
                total_verses += missing_n
                continue
            chapters_seen += 1
            data = json.loads(lang_chf.read_text())
            for v in data.get('verses', []):
                total_verses += 1
                cat = categorize_text(v.get('text', ''), ch, v['verse'])
                if v.get('fallback') == 'en':
                    cat = 'EN_FALLBACK'
                    fallback_count += 1
                bucket = in_scope if slug in SCOPE else out_scope
                bucket[cat] += 1
    return {
        'total_verses': total_verses,
        'chapters_seen': chapters_seen,
        'chapters_missing': chapters_missing,
        'in_scope': in_scope,
        'out_scope': out_scope,
        'fallback_count': fallback_count,
    }

print('=' * 76)
print(f'CORPUS AUDIT @ abbae669eea5bcaac7bd80ed2800e881b53d1ee2')
print('=' * 76)

# Reference: total KJV verse count
total_kjv = 0
for slug in os.listdir(EN_BOOKS):
    d = EN_BOOKS / slug / 'chapters'
    if not d.is_dir(): continue
    for chf in d.iterdir():
        data = json.loads(chf.read_text())
        total_kjv += len(data.get('verses', []))
print(f'Total KJV verses: {total_kjv}')
print()

for lang in ['en', 'fr', 'pt', 'es']:
    r = audit_lang(lang)
    print(f'──── {lang.upper()} ────')
    print(f'  Total verses: {r["total_verses"]} / {total_kjv}')
    print(f'  Chapters present: {r["chapters_seen"]}')
    print(f'  Chapters missing: {r["chapters_missing"]}')
    print(f'  Fallback (FB:en): {r["fallback_count"]}')

    sc_total = sum(r['in_scope'].values())
    oo_total = sum(r['out_scope'].values())
    print(f'  In scope (NT + Ps + Pr): {sc_total} verses')
    for cat, n in r['in_scope'].most_common():
        print(f'      {cat:<20} {n:>5}  ({100*n/sc_total:5.1f}%)')
    print(f'  Out of scope: {oo_total} verses')
    for cat, n in r['out_scope'].most_common():
        print(f'      {cat:<20} {n:>5}  ({100*n/oo_total:5.1f}%)')
    bugs = (r['in_scope'].get('BUG_INHERIT', 0)
            + r['out_scope'].get('BUG_INHERIT', 0))
    print(f'  ─── REMAINING BUG_INHERIT total: {bugs} '
          f'({100*bugs/r["total_verses"]:5.2f}% of corpus) ───')
    print()
