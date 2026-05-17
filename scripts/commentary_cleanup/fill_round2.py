"""Round 2 EN fill using Matthew Henry + Keil-Delitzsch on the remaining 421
bug verses. Priority: JFB → Clarke → Gill → MH → K-D (sticky to verse-specific
notes ≥30 words). Outputs /tmp/en_fills_round2.json.
"""
import os, json, re
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
COMMENTARIES = ['jamieson-fausset-brown', 'adam-clarke', 'john-gill',
                'matthew-henry', 'keil-delitzsch']
_ch_cache = {}

def flat(c):
    if isinstance(c, str): return c
    if isinstance(c, list): return ' '.join(flat(i) for i in c)
    if isinstance(c, dict): return flat(c.get('text', c.get('content', '')))
    return ''

def load(cid, usfm, ch):
    key = (cid, usfm, ch)
    if key in _ch_cache: return _ch_cache[key]
    p = os.path.join(PD_CACHE, f'{cid}_{usfm}_{ch}.json')
    if not os.path.exists(p):
        _ch_cache[key] = {}; return {}
    try:
        d = json.load(open(p))
    except:
        _ch_cache[key] = {}; return {}
    if d.get('_err'):
        _ch_cache[key] = {}; return {}
    out = {}
    for c in d.get('chapter', {}).get('content', []):
        if isinstance(c, dict) and c.get('type') == 'verse':
            n = c.get('number')
            if isinstance(n, int):
                t = re.sub(r'\s+', ' ', flat(c.get('content', []))).strip()
                if t: out[n] = t
    _ch_cache[key] = out
    return out

def cleanup(text, vref):
    text = text.replace('--', '—')
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'^(?:Ver(?:se)?\.?\s*\d+\.?\s*)', '', text, flags=re.IGNORECASE)
    # Strip Strong's-style abbreviations
    abbr = {
        r'\bPe1\b': '1 Pet', r'\bPe2\b': '2 Pet',
        r'\bCo1\b': '1 Cor', r'\bCo2\b': '2 Cor',
        r'\bTh1\b': '1 Thes', r'\bTh2\b': '2 Thes',
        r'\bTi1\b': '1 Tim', r'\bTi2\b': '2 Tim',
        r'\bJo1\b': '1 John', r'\bJo2\b': '2 John', r'\bJo3\b': '3 John',
        r'\bSa1\b': '1 Sam', r'\bSa2\b': '2 Sam',
        r'\bKi1\b': '1 Kgs', r'\bKi2\b': '2 Kgs',
        r'\bCh1\b': '1 Chr', r'\bCh2\b': '2 Chr',
        r'\bJoh\b': 'John', r'\bLuk\b': 'Luke', r'\bMar\b': 'Mark', r'\bMat\b': 'Matt',
        r'\bPsa\b': 'Ps', r'\bIsa\b': 'Isa', r'\bJer\b': 'Jer', r'\bEze\b': 'Ezek',
        r'\bAct\b': 'Acts',
    }
    for p, r in abbr.items():
        text = re.sub(p, r, text)
    sentences = re.split(r'(?<=[\.;!?])\s+', text)
    out, word_total = [], 0
    for s in sentences:
        out.append(s); word_total += len(s.split())
        if word_total >= 80: break
    text = ' '.join(out).strip()
    words = text.split()
    if len(words) > 130:
        text = ' '.join(words[:130]) + '…'
    return f'{vref} {text}'

bugs = json.load(open('/tmp/en_bugs_round2.json'))
fills = {}
stats = {c: 0 for c in COMMENTARIES}
stats['none'] = 0

for b in bugs:
    slug, ch, v = b['book'], b['ch'], b['v']
    usfm = SLUG_TO_USFM.get(slug)
    if not usfm:
        stats['none'] += 1; continue
    chosen, chosen_cid = None, None
    # Prefer ≥30 words from highest-priority source
    for cid in COMMENTARIES:
        verses = load(cid, usfm, ch)
        if v in verses and len(verses[v].split()) >= 30:
            chosen = verses[v]; chosen_cid = cid; break
    if chosen is None:
        best_len = 0
        for cid in COMMENTARIES:
            verses = load(cid, usfm, ch)
            if v in verses and len(verses[v].split()) > best_len:
                chosen = verses[v]; chosen_cid = cid; best_len = len(verses[v].split())
    if chosen is None:
        stats['none'] += 1; continue
    cleaned = cleanup(chosen, f'{ch}:{v}')
    fills[f'{slug}|{ch}|{v}'] = {
        'text': cleaned, 'source': chosen_cid, 'words': len(cleaned.split())
    }
    stats[chosen_cid] = stats.get(chosen_cid, 0) + 1

json.dump(fills, open('/tmp/en_fills_round2.json', 'w'), ensure_ascii=False, indent=1)
print(f'Filled: {len(fills)}/{len(bugs)}')
for k, n in sorted(stats.items(), key=lambda x: -x[1]):
    if n > 0:
        print(f'  {k:<30} {n}')
