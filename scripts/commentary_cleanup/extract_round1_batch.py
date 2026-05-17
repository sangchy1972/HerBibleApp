"""Extract round-1 batch: 1 Peter remaining + small NT books to total ~200 entries."""
import json
work = json.load(open('/tmp/translation_miss_only.json'))

# Books in round-1 priority order
PRIORITY = [
    'i-peter', 'i-john', 'ii-peter', 'ii-john', 'titus', 'philemon', 'james',
]

# Get all hashes per book
import hashlib
from collections import defaultdict
by_book = defaultdict(list)
for h, w in work.items():
    if not w['positions']: continue
    # Get the first position's book
    book = w['positions'][0][1]
    by_book[book].append((h, w))

# Use the cache as source of truth — skip any hash that's already fully translated
# for all needed langs
cache = json.loads(open('scripts/.translation_progress/cache.json').read())

# Total entries to plan for
budget = 200
total_so_far = 0
plan = {}
for book in PRIORITY:
    if book not in by_book: continue
    for h, w in by_book[book]:
        # Skip langs already in cache
        remaining_langs = [l for l in w['langs_needed'] if f'{l}|en|{h}' not in cache]
        if not remaining_langs: continue
        if total_so_far >= budget: break
        w_copy = dict(w)
        w_copy['langs_needed'] = remaining_langs
        plan[h] = w_copy
        total_so_far += len(remaining_langs)
    if total_so_far >= budget: break

print(f'Round-1 plan: {len(plan)} unique EN texts, '
      f'{total_so_far} translation entries')
print(f'Budget target: {budget}')

# Save for the translation file
json.dump(plan, open('/tmp/round1_plan.json', 'w'), ensure_ascii=False, indent=1)

# Show breakdown
from collections import Counter
book_count = Counter()
for h, w in plan.items():
    pos = w['positions'][0]
    book_count[pos[1]] += len(w['langs_needed'])
print('\nBy book:')
for book, n in book_count.most_common():
    print(f'  {book}: {n} entries')

# Show first 5 entries to write
print('\nFirst 5 to write:')
for i, (h, w) in enumerate(plan.items()):
    if i >= 5: break
    slug, ch, vn = w['positions'][0][1], w['positions'][0][2], w['positions'][0][3]
    langs = ",".join(w["langs_needed"])
    en = w["en_text"]
    print(f'  {slug} {ch}:{vn} → {langs} ({len(en.split())}w)')
    print(f'    {en[:120]}')
