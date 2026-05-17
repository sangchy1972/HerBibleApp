"""Fill the 7,040 EN bug verses using PD commentaries cached in /tmp/pd_cache/.

Logic:
1. For each bug entry (book, ch, v), look up notes from JFB → Clarke → Gill (in order).
2. A "note" is the block where `c.get('number') == v` (HelloAO normalizes to integer).
3. Take the first verse-specific note found, flatten its content, normalize whitespace.
4. Truncate to ~100 words at sentence boundary.
5. Strip 19th-century leading glosses like "Casting all your care -" if redundant
   with the verse text. Replace "--" with em-dash.
6. Prepend the verse reference in Tyndale format: "5:7 ".
7. Write to /tmp/en_fills.json keyed by f'{book}|{ch}|{v}'.
"""
import json, os, re
from pathlib import Path

PD_CACHE = '/tmp/pd_cache'
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
COMMENTARIES = ['jamieson-fausset-brown', 'adam-clarke', 'john-gill']

# In-memory chapter cache: (cid, usfm, ch) → {verse_n: full_text}
_ch_cache = {}

def flatten(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return ' '.join(flatten(i) for i in c)
    if isinstance(c, dict):
        return flatten(c.get('text', c.get('content', '')))
    return ''

def load_chapter(cid, usfm, ch):
    key = (cid, usfm, ch)
    if key in _ch_cache:
        return _ch_cache[key]
    path = os.path.join(PD_CACHE, f'{cid}_{usfm}_{ch}.json')
    if not os.path.exists(path):
        _ch_cache[key] = {}
        return {}
    try:
        d = json.load(open(path))
    except Exception:
        _ch_cache[key] = {}
        return {}
    if d.get('_err'):
        _ch_cache[key] = {}
        return {}
    verses = {}
    for c in d.get('chapter', {}).get('content', []):
        if isinstance(c, dict) and c.get('type') == 'verse':
            n = c.get('number')
            if isinstance(n, int):
                text = re.sub(r'\s+', ' ', flatten(c.get('content', []))).strip()
                if text:
                    verses[n] = text
    _ch_cache[key] = verses
    return verses

def cleanup_text(text, verse_ref):
    # Replace double-dash with em-dash (common in JFB)
    text = text.replace('--', '—')
    text = re.sub(r'\s+', ' ', text).strip()
    # Strip leading commentary markers like "Ver. 5. ", "Verse 7. "
    text = re.sub(r'^(?:Ver(?:se)?\.?\s*\d+\.?\s*)', '', text, flags=re.IGNORECASE)
    # Strip common Strong's-style verse abbreviations to standard form
    # "Pe1 3:15" → "1 Pet 3:15", "Joh 1:1" → "John 1:1", etc.
    abbrev_map = {
        r'\bPe1\b': '1 Pet', r'\bPe2\b': '2 Pet',
        r'\bCo1\b': '1 Cor', r'\bCo2\b': '2 Cor',
        r'\bTh1\b': '1 Thes', r'\bTh2\b': '2 Thes',
        r'\bTi1\b': '1 Tim', r'\bTi2\b': '2 Tim',
        r'\bJo1\b': '1 John', r'\bJo2\b': '2 John', r'\bJo3\b': '3 John',
        r'\bSa1\b': '1 Sam', r'\bSa2\b': '2 Sam',
        r'\bKi1\b': '1 Kgs', r'\bKi2\b': '2 Kgs',
        r'\bCh1\b': '1 Chr', r'\bCh2\b': '2 Chr',
        r'\bJoh\b': 'John', r'\bLuk\b': 'Luke', r'\bMar\b': 'Mark', r'\bMat\b': 'Matt',
        r'\bRom\b': 'Rom', r'\bGal\b': 'Gal', r'\bEph\b': 'Eph', r'\bPhi\b': 'Phil',
        r'\bCol\b': 'Col', r'\bHeb\b': 'Heb', r'\bJam\b': 'Jas', r'\bRev\b': 'Rev',
        r'\bPsa\b': 'Ps', r'\bIsa\b': 'Isa', r'\bJer\b': 'Jer', r'\bEze\b': 'Ezek',
        r'\bDan\b': 'Dan', r'\bHos\b': 'Hos', r'\bAct\b': 'Acts',
    }
    for pat, repl in abbrev_map.items():
        text = re.sub(pat, repl, text)
    # Pack ~90-100 words by accumulating sentences. Don't stop at first '.';
    # keep going until we have ≥70 words AND have just hit a sentence boundary.
    sentences = re.split(r'(?<=[\.;!?])\s+', text)
    out = []
    word_total = 0
    for s in sentences:
        out.append(s)
        word_total += len(s.split())
        if word_total >= 80:
            break
    text = ' '.join(out).strip()
    # Hard cap at 130 words just in case a single sentence is huge
    words = text.split()
    if len(words) > 130:
        text = ' '.join(words[:130]) + '…'
    return f'{verse_ref} {text}'

def main():
    bugs = json.load(open('/tmp/en_bugs.json'))
    out_path = '/tmp/en_fills.json'
    fills = {}
    stats = {'jfb': 0, 'clarke': 0, 'gill': 0, 'none': 0}
    for b in bugs:
        slug, ch, v = b['book'], b['ch'], b['v']
        usfm = SLUG_TO_USFM.get(slug)
        if not usfm:
            stats['none'] += 1
            continue
        chosen = None
        chosen_cid = None
        # Prefer JFB → Clarke → Gill, but skip a source if its note is too short.
        for cid in COMMENTARIES:
            verses = load_chapter(cid, usfm, ch)
            if v in verses and len(verses[v].split()) >= 30:
                chosen = verses[v]
                chosen_cid = cid
                break
        # If no source had ≥30 words, accept the longest available short one.
        if chosen is None:
            best_len = 0
            for cid in COMMENTARIES:
                verses = load_chapter(cid, usfm, ch)
                if v in verses and len(verses[v].split()) > best_len:
                    chosen = verses[v]
                    chosen_cid = cid
                    best_len = len(verses[v].split())
        if chosen is None:
            stats['none'] += 1
            continue
        cleaned = cleanup_text(chosen, f'{ch}:{v}')
        key = f'{slug}|{ch}|{v}'
        fills[key] = {
            'text': cleaned,
            'source': chosen_cid,
            'words': len(cleaned.split()),
        }
        if chosen_cid == 'jamieson-fausset-brown':
            stats['jfb'] += 1
        elif chosen_cid == 'adam-clarke':
            stats['clarke'] += 1
        elif chosen_cid == 'john-gill':
            stats['gill'] += 1
    json.dump(fills, open(out_path, 'w'), ensure_ascii=False, indent=1)
    print(f'Filled: {len(fills)}/{len(bugs)}')
    print(f'  JFB:    {stats["jfb"]}')
    print(f'  Clarke: {stats["clarke"]}')
    print(f'  Gill:   {stats["gill"]}')
    print(f'  None:   {stats["none"]}')
    # Show samples
    print('\n--- Samples ---')
    sample_keys = ['i-peter|5|6', 'i-peter|5|7', 'i-peter|5|8', 'acts|1|9', 'genesis|1|11']
    for sk in sample_keys:
        if sk in fills:
            f = fills[sk]
            print(f'\n[{sk}] ({f["source"]}, {f["words"]}w)')
            print(f'  {f["text"][:280]}')

if __name__ == '__main__':
    main()
