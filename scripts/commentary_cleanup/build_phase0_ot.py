"""Phase 0 extended to OT history/law/poetry: rebuild FR/PT OT books with
corrected per-verse assignment (no fall-through). ES is handled separately
in a later step (it has structural missing-chapter problems).

For each chapter outside the original Phase 0 scope (NT + Psalms + Proverbs):
  For each verse N:
    1. Find smallest-range TSV block with range ≤ 4 verses that covers N.
       If found → use BurritoTruck translated text.
    2. Else → cache lookup by sha256(EN text)[:16].
       If hit → cached translation.
       Else → fallback to EN content + flag fallback:'en'.

Out-of-scope: ES (handled separately).
NT + Psalms + Proverbs: not touched here (already done at abbae66).
"""
import os, json, re, hashlib
from pathlib import Path

NT_AND_WISDOM = {
    'matthew','mark','luke','john','acts','romans','i-corinthians',
    'ii-corinthians','galatians','ephesians','philippians','colossians',
    'i-thessalonians','ii-thessalonians','i-timothy','ii-timothy','titus',
    'philemon','hebrews','james','i-peter','ii-peter','i-john','ii-john',
    'iii-john','jude','revelation-of-john','psalms','proverbs',
}
SLUG_TO_USFM = {
    'genesis':'GEN','exodus':'EXO','leviticus':'LEV','numbers':'NUM','deuteronomy':'DEU',
    'joshua':'JOS','judges':'JDG','ruth':'RUT','i-samuel':'1SA','ii-samuel':'2SA',
    'i-kings':'1KI','ii-kings':'2KI','i-chronicles':'1CH','ii-chronicles':'2CH',
    'ezra':'EZR','nehemiah':'NEH','esther':'EST','job':'JOB','psalms':'PSA',
    'proverbs':'PRO','ecclesiastes':'ECC','song-of-solomon':'SNG','isaiah':'ISA',
    'jeremiah':'JER','lamentations':'LAM','ezekiel':'EZK','daniel':'DAN','hosea':'HOS',
    'joel':'JOL','amos':'AMO','obadiah':'OBA','jonah':'JON','micah':'MIC','nahum':'NAM',
    'habakkuk':'HAB','zephaniah':'ZEP','haggai':'HAG','zechariah':'ZEC','malachi':'MAL',
    'matthew':'MAT','mark':'MRK','luke':'LUK','john':'JHN','acts':'ACT','romans':'ROM',
    'i-corinthians':'1CO','ii-corinthians':'2CO','galatians':'GAL','ephesians':'EPH',
    'philippians':'PHP','colossians':'COL','i-thessalonians':'1TH','ii-thessalonians':'2TH',
    'i-timothy':'1TI','ii-timothy':'2TI','titus':'TIT','philemon':'PHM','hebrews':'HEB',
    'james':'JAS','i-peter':'1PE','ii-peter':'2PE','i-john':'1JN','ii-john':'2JN',
    'iii-john':'3JN','jude':'JUD','revelation-of-john':'REV',
}
TSN_ROOT = Path('/tmp/pdtc/_tsn_sources')
CORPUS = Path('/tmp/pd-text-corpus/commentary')
CACHE_PATH = Path('scripts/.translation_progress/cache.json')

def clean_tsv(text):
    text = text.replace('\\n\\n', ' ').replace('\\n', ' ')
    return re.sub(r'\s+', ' ', text).strip()

def parse_tsv_chapter(lang, usfm, ch):
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
            blocks.append({'start':start, 'end':end, 'text':clean_tsv(parts[6])})
    return blocks

def covering(blocks, vn, max_range=4):
    cands = [b for b in blocks if b['start']<=vn<=b['end'] and (b['end']-b['start'])<max_range]
    return min(cands, key=lambda b: b['end']-b['start']) if cands else None

def main():
    cache = json.loads(CACHE_PATH.read_text())
    print(f'Cache size: {len(cache)}')
    stats = {lang: {'tyndale':0,'cache':0,'en_fallback':0,'verses':0} for lang in ['fr','pt']}

    for lang in ['fr', 'pt']:
        for slug in sorted(SLUG_TO_USFM.keys()):
            if slug in NT_AND_WISDOM:
                continue  # already done in Phase 0 at abbae66
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
                        out_verses.append({'verse':vn, 'text':blk['text']})
                        stats[lang]['tyndale'] += 1
                    else:
                        h = hashlib.sha256(en_text.encode()).hexdigest()[:16]
                        ck = f'{lang}|en|{h}'
                        if ck in cache:
                            out_verses.append({'verse':vn, 'text':cache[ck]})
                            stats[lang]['cache'] += 1
                        else:
                            out_verses.append({
                                'verse':vn, 'text':en_text, 'fallback':'en'
                            })
                            stats[lang]['en_fallback'] += 1
                out_dir = CORPUS / lang / 'books' / slug / 'chapters'
                out_dir.mkdir(parents=True, exist_ok=True)
                (out_dir / f'{ch}.json').write_text(
                    json.dumps({'verses':out_verses}, ensure_ascii=False,
                               separators=(',', ':')) + '\n',
                    encoding='utf-8',
                )

    print('\n=== Phase 0 OT extension summary ===')
    for lang, s in stats.items():
        total = s['verses']
        print(f'{lang}: total={total}  '
              f'tyndale={s["tyndale"]} ({100*s["tyndale"]/total:.1f}%)  '
              f'cache={s["cache"]} ({100*s["cache"]/total:.1f}%)  '
              f'en-fb={s["en_fallback"]} ({100*s["en_fallback"]/total:.1f}%)')

main()
