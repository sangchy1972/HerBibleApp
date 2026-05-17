"""Phase 0: rebuild FR/PT/ES commentary trees for NT + Psalms + Proverbs
with corrected per-verse assignment logic. Read-only on cache; writes only
to the local pd-text-corpus clone."""
import os, json, re, hashlib
from pathlib import Path

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
TSN_ROOT = Path('/tmp/pdtc/_tsn_sources')
CORPUS = Path('/tmp/pd-text-corpus/commentary')
CACHE_PATH = Path('scripts/.translation_progress/cache.json')

def clean_tsv_text(text):
    text = text.replace('\\n\\n', ' ').replace('\\n', ' ')
    return re.sub(r'\s+', ' ', text).strip()

def parse_tsv_chapter(lang, usfm, ch):
    """Cols: REF, ID, TAGS, SUPPORT, QUOTE, OCCURRENCE, HREF. Text is in HREF (col 6)."""
    path = TSN_ROOT / f'{lang}_tsn' / 'ingredients' / f'{usfm}.tsv'
    if not path.exists():
        return []
    blocks = []
    with open(path) as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 7 or parts[0] == 'REF':
                continue
            m = re.match(r'^(\d+):(\d+)(?:-(\d+))?$', parts[0])
            if not m or int(m.group(1)) != ch:
                continue
            start = int(m.group(2))
            end = int(m.group(3)) if m.group(3) else start
            blocks.append({'start': start, 'end': end, 'text': clean_tsv_text(parts[6])})
    return blocks

def covering(blocks, vn, max_range=4):
    cands = [b for b in blocks if b['start']<=vn<=b['end'] and (b['end']-b['start'])<max_range]
    return min(cands, key=lambda b: b['end']-b['start']) if cands else None

def main():
    cache = json.loads(CACHE_PATH.read_text())
    print(f'Cache size: {len(cache)}')
    stats = {lang: {'tyndale': 0, 'cache': 0, 'en_fallback': 0, 'verses': 0}
             for lang in ['fr', 'pt', 'es']}

    for lang in ['fr', 'pt', 'es']:
        out_root = CORPUS / lang
        for slug in SCOPE_SLUGS:
            usfm = SLUG_TO_USFM[slug]
            en_chap_dir = CORPUS / 'en' / 'books' / slug / 'chapters'
            if not en_chap_dir.exists():
                continue
            for chf in sorted(en_chap_dir.iterdir(), key=lambda p: int(p.stem)):
                ch = int(chf.stem)
                en_data = json.loads(chf.read_text())
                blocks = parse_tsv_chapter(lang, usfm, ch)
                out_verses = []
                for v in en_data.get('verses', []):
                    vn = v['verse']
                    en_text = v.get('text', '')
                    stats[lang]['verses'] += 1
                    blk = covering(blocks, vn)
                    if blk:
                        out_verses.append({'verse': vn, 'text': blk['text']})
                        stats[lang]['tyndale'] += 1
                    else:
                        h = hashlib.sha256(en_text.encode()).hexdigest()[:16]
                        cache_key = f'{lang}|en|{h}'
                        if cache_key in cache:
                            out_verses.append({'verse': vn, 'text': cache[cache_key]})
                            stats[lang]['cache'] += 1
                        else:
                            out_verses.append({
                                'verse': vn, 'text': en_text, 'fallback': 'en',
                            })
                            stats[lang]['en_fallback'] += 1
                out_dir = out_root / 'books' / slug / 'chapters'
                out_dir.mkdir(parents=True, exist_ok=True)
                (out_dir / f'{ch}.json').write_text(
                    json.dumps({'verses': out_verses}, ensure_ascii=False,
                               separators=(',', ':')) + '\n',
                    encoding='utf-8',
                )

    print('\n=== Phase 0 build summary ===')
    for lang, s in stats.items():
        total = s['verses']
        print(f'{lang}: total={total}  '
              f'tyndale={s["tyndale"]} ({100*s["tyndale"]/total:.1f}%)  '
              f'cache-hit={s["cache"]} ({100*s["cache"]/total:.1f}%)  '
              f'en-fallback={s["en_fallback"]} ({100*s["en_fallback"]/total:.1f}%)')

if __name__ == '__main__':
    main()
