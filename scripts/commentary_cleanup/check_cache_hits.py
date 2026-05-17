"""For each gap verse identified by corrected Phase B, compute the hash of
the CURRENT EN text (post fix in /tmp/pd-text-corpus) and look it up in the
in-repo translation cache. Report cache hit rate per language."""
import os, json, re, hashlib

NT_SLUGS = [
    'matthew','mark','luke','john','acts','romans','i-corinthians',
    'ii-corinthians','galatians','ephesians','philippians','colossians',
    'i-thessalonians','ii-thessalonians','i-timothy','ii-timothy','titus',
    'philemon','hebrews','james','i-peter','ii-peter','i-john','ii-john',
    'iii-john','jude','revelation-of-john',
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
CACHE_PATH = 'scripts/.translation_progress/cache.json'

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
            m = re.match(r'^(\d+):(\d+)(?:-(\d+))?$', parts[0])
            if not m or int(m.group(1)) != ch:
                continue
            start = int(m.group(2))
            end = int(m.group(3)) if m.group(3) else start
            blocks.append({'start': start, 'end': end})
    return blocks

def covering(blocks, vn, max_range=4):
    cands = [b for b in blocks if b['start']<=vn<=b['end'] and (b['end']-b['start'])<max_range]
    return min(cands, key=lambda b: b['end']-b['start']) if cands else None

cache = json.load(open(CACHE_PATH))
print(f'Cache size: {len(cache)}')

en_chapter_cache = {}
def en_text_for(slug, ch, v):
    key = (slug, ch)
    if key not in en_chapter_cache:
        path = os.path.join(EN_CORPUS, slug, 'chapters', f'{ch}.json')
        if os.path.exists(path):
            d = json.load(open(path))
            en_chapter_cache[key] = {row['verse']: row['text'] for row in d.get('verses', [])}
        else:
            en_chapter_cache[key] = {}
    return en_chapter_cache[key].get(v, '')

for lang in ['fr', 'pt', 'es']:
    gaps = []
    for slug in SCOPE_SLUGS:
        usfm = SLUG_TO_USFM[slug]
        chap_dir = os.path.join(EN_CORPUS, slug, 'chapters')
        if not os.path.isdir(chap_dir):
            continue
        for chf in os.listdir(chap_dir):
            ch = int(chf.split('.')[0])
            blocks = parse_tsv_chapter(lang, usfm, ch)
            d = json.load(open(os.path.join(chap_dir, chf)))
            for v in d.get('verses', []):
                if covering(blocks, v['verse']) is None:
                    gaps.append((slug, ch, v['verse']))
    # Cache lookup
    hits = 0
    for slug, ch, vn in gaps:
        en = en_text_for(slug, ch, vn)
        if not en: continue
        h = hashlib.sha256(en.encode()).hexdigest()[:16]
        if f'{lang}|en|{h}' in cache:
            hits += 1
    miss = len(gaps) - hits
    print(f'{lang}: gaps={len(gaps)}  cache_hits={hits} ({100*hits/len(gaps):.1f}%)  '
          f'cache_miss={miss} ({100*miss/len(gaps):.1f}%)')
