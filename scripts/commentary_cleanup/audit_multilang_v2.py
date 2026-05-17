"""V2 audit: detect text-duplication within chapters as the canonical signature
of Phase B fall-through replication.

For each (lang, book, chapter):
  - Group verses by text.
  - Any group with >1 verse = candidate duplicate cluster.
  - The first verse of the cluster is the "source" (Tyndale block start).
  - All other verses in the cluster are BUG_DUPLICATE (inherited).

This catches the FR/PT/ES bug pattern that leading-ref matching misses.
"""
import os, json
from collections import defaultdict, Counter

NT_SLUGS = [
    'matthew', 'mark', 'luke', 'john', 'acts',
    'romans', 'i-corinthians', 'ii-corinthians', 'galatians', 'ephesians',
    'philippians', 'colossians', 'i-thessalonians', 'ii-thessalonians',
    'i-timothy', 'ii-timothy', 'titus', 'philemon', 'hebrews', 'james',
    'i-peter', 'ii-peter', 'i-john', 'ii-john', 'iii-john', 'jude',
    'revelation-of-john',
]
SCOPE_SLUGS = NT_SLUGS + ['psalms', 'proverbs']

def audit_lang(lang, corpus_root):
    bug_count = 0
    total = 0
    by_book = Counter()
    samples = []
    for slug in SCOPE_SLUGS:
        chap_dir = os.path.join(corpus_root, lang, 'books', slug, 'chapters')
        if not os.path.isdir(chap_dir):
            continue
        for chf in sorted(os.listdir(chap_dir), key=lambda x: int(x.split('.')[0])):
            ch = int(chf.split('.')[0])
            data = json.load(open(os.path.join(chap_dir, chf)))
            verses = data.get('verses', [])
            text_to_verses = defaultdict(list)
            for v in verses:
                text_to_verses[v.get('text', '')].append(v['verse'])
            total += len(verses)
            for text, vns in text_to_verses.items():
                if len(vns) > 1:
                    # First verse in cluster keeps the text (legit owner).
                    # Subsequent verses are duplicate-inherited (bug).
                    bug_in_cluster = len(vns) - 1
                    bug_count += bug_in_cluster
                    by_book[slug] += bug_in_cluster
                    if len(samples) < 8:
                        samples.append((slug, ch, vns, text[:80]))
    return bug_count, total, by_book, samples

CORPUS = '/tmp/pd-text-corpus/commentary'
for lang in ['fr', 'pt', 'es']:
    bugs, total, by_book, samples = audit_lang(lang, CORPUS)
    print(f'\n=== {lang.upper()} (NT + Psalms + Proverbs) ===')
    print(f'Total verses: {total}')
    print(f'Duplicate-inherited (BUG): {bugs}  ({100*bugs/total:5.2f}%)')
    print(f'By book:')
    for b, n in by_book.most_common(10):
        print(f'  {b}: {n}')
    print(f'Samples:')
    for s in samples[:5]:
        print(f'  {s[0]} ch {s[1]} verses {s[2]}: {s[3]}')
