"""Audit + dedup of all FR/PT/ES fallback verses.

For every verse in the FR/PT/ES corpus that currently shows English fallback
(`fallback: 'en'`), compute the hash of the CURRENT EN text and group by hash.

Key invariants verified:
1. Hash function matches cache.json convention: sha256(en_text)[:16] of the
   exact EN text bytes (UTF-8).
2. EN text is taken from the *current* en corpus (post-c4f319f fix), not the
   stale fallback text stored in the FR/PT/ES file (which may be old).
3. Each unique hash represents one English text that needs to be translated
   into 1, 2, or 3 target languages.
4. Sample sanity-check: a known-existing translation in cache.json must hash
   to the same key for the same EN text.

Output:
  /tmp/translation_work.json — full work plan
  /tmp/translation_work.txt  — human-readable summary
"""
import os, json, re, hashlib
from collections import defaultdict, Counter
from pathlib import Path

CORPUS = Path('/tmp/pd-text-corpus/commentary')
CACHE_PATH = Path('scripts/.translation_progress/cache.json')

# ────────────────────────────────────────────────────────────────────────────
# Step 1: Build a lookup of CURRENT EN text by (slug, ch, verse).
# ────────────────────────────────────────────────────────────────────────────
print('Step 1: Index current EN corpus...')
en_text_lookup = {}
en_books = CORPUS / 'en' / 'books'
for slug_dir in sorted(en_books.iterdir()):
    if not slug_dir.is_dir():
        continue
    slug = slug_dir.name
    chap_dir = slug_dir / 'chapters'
    if not chap_dir.is_dir():
        continue
    for chf in chap_dir.iterdir():
        if not chf.name.endswith('.json'):
            continue
        ch = int(chf.stem)
        try:
            d = json.loads(chf.read_text())
        except Exception as e:
            print(f'  WARN failed to parse {chf}: {e}')
            continue
        for v in d.get('verses', []):
            en_text_lookup[(slug, ch, v['verse'])] = v.get('text', '')
print(f'  Indexed {len(en_text_lookup)} EN verse texts')

# ────────────────────────────────────────────────────────────────────────────
# Step 2: Sanity check the hash function against cache.json
# ────────────────────────────────────────────────────────────────────────────
print('\nStep 2: Verify hash function matches cache.json convention...')
cache = json.loads(CACHE_PATH.read_text())
# Find a few cache entries whose EN text we can independently hash to verify
# Cache keys are like "fr|en|<hash16>", value is the translation
sample_hashes_in_cache = set()
for k in cache:
    if k.startswith('fr|en|') or k.startswith('pt|en|') or k.startswith('es|en|'):
        sample_hashes_in_cache.add(k.split('|')[2])
print(f'  cache.json size: {len(cache)}')
print(f'  unique hashes in cache: {len(sample_hashes_in_cache)}')

# Hash some current EN texts and check whether any appear in cache
test_hashes = set()
for (slug, ch, vn), text in list(en_text_lookup.items())[:1000]:
    h = hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]
    test_hashes.add(h)
overlap = len(test_hashes & sample_hashes_in_cache)
print(f'  Of 1000 sampled current EN texts: {overlap} hashes appear in cache')
if overlap < 100:
    print('  WARNING: low overlap — hash function or text encoding may have drifted!')
else:
    print(f'  Hash function consistent (overlap acceptable: ~{overlap}/1000 sampled)')

# ────────────────────────────────────────────────────────────────────────────
# Step 3: Walk FR/PT/ES corpus, collect fallback verses, dedup by hash
# ────────────────────────────────────────────────────────────────────────────
print('\nStep 3: Collect all fallback verses across FR/PT/ES...')

# work[hash] = {
#   'en_text': str,
#   'langs_needed': set of {fr, pt, es},
#   'positions': list of (lang, slug, ch, vn),
#   'cache_status': dict {lang: 'hit'|'miss'}
# }
work = defaultdict(lambda: {
    'en_text': '',
    'langs_needed': set(),
    'positions': [],
    'cache_status': {},
})
per_lang_fallback_count = Counter()
per_lang_seen_position = defaultdict(set)  # for dedup within same lang

for lang in ['fr', 'pt', 'es']:
    lang_books = CORPUS / lang / 'books'
    if not lang_books.is_dir():
        continue
    for slug_dir in sorted(lang_books.iterdir()):
        if not slug_dir.is_dir():
            continue
        slug = slug_dir.name
        chap_dir = slug_dir / 'chapters'
        if not chap_dir.is_dir():
            continue
        for chf in chap_dir.iterdir():
            if not chf.name.endswith('.json'):
                continue
            ch = int(chf.stem)
            try:
                d = json.loads(chf.read_text())
            except Exception as e:
                print(f'  WARN failed to parse {lang}/{chf}: {e}')
                continue
            for v in d.get('verses', []):
                if v.get('fallback') != 'en':
                    continue
                vn = v['verse']
                # Get the CURRENT EN text
                en = en_text_lookup.get((slug, ch, vn), '')
                if not en:
                    continue
                h = hashlib.sha256(en.encode('utf-8')).hexdigest()[:16]
                entry = work[h]
                entry['en_text'] = en
                # Check if this position has already been counted for this lang
                # (shouldn't happen but defensive)
                pos_key = (lang, slug, ch, vn)
                if pos_key in per_lang_seen_position[lang]:
                    continue
                per_lang_seen_position[lang].add(pos_key)
                entry['langs_needed'].add(lang)
                entry['positions'].append([lang, slug, ch, vn])
                per_lang_fallback_count[lang] += 1
                # Note cache status
                if f'{lang}|en|{h}' in cache:
                    entry['cache_status'][lang] = 'hit'
                else:
                    entry['cache_status'][lang] = 'miss'

# ────────────────────────────────────────────────────────────────────────────
# Step 4: Stats
# ────────────────────────────────────────────────────────────────────────────
print(f'\nStep 4: Audit results')
print(f'  Per-lang fallback verse count (in current corpus):')
for lang in ['fr', 'pt', 'es']:
    print(f'    {lang}: {per_lang_fallback_count[lang]}')

total_unique_hashes = len(work)
total_translation_entries = sum(len(w['langs_needed']) for w in work.values())
total_positions = sum(len(w['positions']) for w in work.values())
print(f'\n  Unique EN texts: {total_unique_hashes}')
print(f'  Translation entries needed (hash × lang): {total_translation_entries}')
print(f'  Verse positions covered: {total_positions}')

# How many langs per hash
lang_distribution = Counter(len(w['langs_needed']) for w in work.values())
print(f'\n  Distribution by # of languages needing each hash:')
for n in sorted(lang_distribution.keys()):
    count = lang_distribution[n]
    print(f'    Needed by {n} lang(s): {count} hashes ({count*n} translation entries)')

# Cache hits we already have
cache_hits = {'fr':0, 'pt':0, 'es':0}
cache_misses = {'fr':0, 'pt':0, 'es':0}
for w in work.values():
    for lang in w['langs_needed']:
        if w['cache_status'].get(lang) == 'hit':
            cache_hits[lang] += 1
        else:
            cache_misses[lang] += 1
print(f'\n  Cache check (does cache.json already have the translation?):')
for lang in ['fr', 'pt', 'es']:
    print(f'    {lang}: {cache_hits[lang]} hits + {cache_misses[lang]} misses')
print(f'  NOTE: cache hits mean we already have a translation but the corpus')
print(f'  fallback was generated before that translation landed — re-running')
print(f'  Phase 0/E will pick it up automatically without new translation work.')

real_translation_work = sum(cache_misses.values())
print(f'\n  ACTUAL new-translation work (cache misses only): {real_translation_work} entries')

# Per-book breakdown
print(f'\n  Cache-miss work by book + lang:')
book_lang_count = Counter()
for w in work.values():
    for lang in w['langs_needed']:
        if w['cache_status'].get(lang) == 'miss':
            # Find the position(s) for this lang
            for pos in w['positions']:
                if pos[0] == lang:
                    book_lang_count[(pos[1], lang)] += 1
                    break
# Print sorted: by book, then by lang
from itertools import groupby
items = sorted(book_lang_count.items(), key=lambda x: (x[0][0], x[0][1]))
prev_book = None
for (book, lang), n in items:
    if book != prev_book:
        print(f'\n    {book}:')
        prev_book = book
    print(f'      {lang}: {n}')

# ────────────────────────────────────────────────────────────────────────────
# Step 5: Save work plan
# ────────────────────────────────────────────────────────────────────────────
serializable = {}
for h, w in work.items():
    serializable[h] = {
        'en_text': w['en_text'],
        'langs_needed': sorted(w['langs_needed']),
        'positions': w['positions'],
        'cache_status': w['cache_status'],
    }
with open('/tmp/translation_work.json', 'w') as f:
    json.dump(serializable, f, ensure_ascii=False, indent=1)
print(f'\n  Saved /tmp/translation_work.json ({total_unique_hashes} unique hashes)')

# Cache-miss-only subset for actual translation work
miss_only = {}
for h, w in serializable.items():
    miss_langs = [l for l in w['langs_needed'] if w['cache_status'].get(l) == 'miss']
    if miss_langs:
        miss_only[h] = {
            'en_text': w['en_text'],
            'langs_needed': miss_langs,
            'positions': [p for p in w['positions'] if p[0] in miss_langs],
        }
with open('/tmp/translation_miss_only.json', 'w') as f:
    json.dump(miss_only, f, ensure_ascii=False, indent=1)
print(f'  Saved /tmp/translation_miss_only.json ({len(miss_only)} hashes, '
      f'{sum(len(w["langs_needed"]) for w in miss_only.values())} entries to translate)')
