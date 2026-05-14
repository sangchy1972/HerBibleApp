#!/usr/bin/env python3
# Build per-verse commentary corpus for fr / pt / es using:
#   - Official Tyndale Study Notes translations (BurritoTruck/{lang}_tsn,
#     CC BY-SA 4.0) where they exist
#   - LLM-translated English Tyndale for the remaining books
#
# Output shape matches commentary/en/: per-chapter JSON, one entry per verse
# in the TARGET Bible (so the React Native client can do a direct verse-number
# lookup without versification math at read time).
#
# Versification offsets for Psalms in fr/de mirror src/constants/versification.ts.
#
# Phases (--phase=A|B|C|D|all):
#   A  parse Tyndale TSN TSVs into per-verse {(slug, ch, kjv_verse) -> note}
#   B  shape per-language commentary against the target Bible's actual verse list
#   C  list gap (slug, chapter) pairs needing LLM translation, emit a worklist
#   D  write final commentary/<lang>/ tree to PD_TEXT_CORPUS + LICENSE + index.json

import csv
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

# --- Configuration ------------------------------------------------------------

CORPUS = Path(os.environ.get("PD_TEXT_CORPUS", "/tmp/pdtc"))
TSN_DIR = Path("/tmp/tsn")           # /tmp/tsn/{lang}/{BOOK}.tsv
BIBLES_DIR = Path("/tmp/bibles")     # /tmp/bibles/{lang}/{slug}_{ch}.json (target Bibles)
EN_COMMENTARY = CORPUS / "commentary" / "en"
GAPS_OUT = Path("/tmp/pdtc/.cache/multilang_gaps.json")
TARGETS = ["fr", "pt", "es"]

# USFM book code → KJV slug (target Bibles use English slugs)
USFM_TO_SLUG = {
    "GEN": "genesis", "EXO": "exodus", "LEV": "leviticus", "NUM": "numbers", "DEU": "deuteronomy",
    "JOS": "joshua", "JDG": "judges", "RUT": "ruth", "1SA": "i-samuel", "2SA": "ii-samuel",
    "1KI": "i-kings", "2KI": "ii-kings", "1CH": "i-chronicles", "2CH": "ii-chronicles",
    "EZR": "ezra", "NEH": "nehemiah", "EST": "esther", "JOB": "job", "PSA": "psalms",
    "PRO": "proverbs", "ECC": "ecclesiastes", "SNG": "song-of-solomon", "ISA": "isaiah",
    "JER": "jeremiah", "LAM": "lamentations", "EZK": "ezekiel", "DAN": "daniel", "HOS": "hosea",
    "JOL": "joel", "AMO": "amos", "OBA": "obadiah", "JON": "jonah", "MIC": "micah",
    "NAM": "nahum", "HAB": "habakkuk", "ZEP": "zephaniah", "HAG": "haggai",
    "ZEC": "zechariah", "MAL": "malachi",
    "MAT": "matthew", "MRK": "mark", "LUK": "luke", "JHN": "john", "ACT": "acts",
    "ROM": "romans", "1CO": "i-corinthians", "2CO": "ii-corinthians", "GAL": "galatians",
    "EPH": "ephesians", "PHP": "philippians", "COL": "colossians",
    "1TH": "i-thessalonians", "2TH": "ii-thessalonians", "1TI": "i-timothy", "2TI": "ii-timothy",
    "TIT": "titus", "PHM": "philemon", "HEB": "hebrews", "JAS": "james",
    "1PE": "i-peter", "2PE": "ii-peter", "1JN": "i-john", "2JN": "ii-john", "3JN": "iii-john",
    "JUD": "jude", "REV": "revelation-of-john",
}
SLUG_TO_USFM = {v: k for k, v in USFM_TO_SLUG.items()}

# --- Versification offsets (Psalms only) -- mirror src/constants/versification.ts

LSG_PLUS_1 = {3, 4, 5, 6, 7, 8, 9, 12, 18, 19, 20, 21, 22, 30, 31, 34, 36, 38, 39,
              40, 41, 42, 44, 45, 46, 47, 48, 49, 53, 55, 56, 57, 58, 59, 61, 62,
              63, 64, 65, 68, 69, 70, 75, 76, 77, 80, 81, 83, 84, 85, 88, 89, 92,
              102, 108, 140, 142}
LSG_PLUS_2 = {51, 52, 54, 60}

# pt (Almeida 1819) and es (Reina-Valera 1909) use Protestant numbering for
# Psalms (no superscription offset). Their small verse-count differences vs.
# KJV come from omitted textual variants in the NT (Acts 8:37, etc.) — handled
# implicitly by iterating the target Bible's actual verse list.
def psalm_offset(lang: str, chapter: int) -> int:
    if lang == "fr":
        if chapter in LSG_PLUS_2: return 2
        if chapter in LSG_PLUS_1: return 1
    return 0


# --- TSN parsing --------------------------------------------------------------

REF_RE = re.compile(r"^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$")

def parse_ref(ref: str):
    """REF -> (chapter, [verse_numbers_covered]). Returns (None, []) if unparseable
       or if the range spans multiple chapters (rare; we only keep the first verse)."""
    m = REF_RE.match(ref.strip())
    if not m:
        return None, []
    chap = int(m.group(1))
    v1 = int(m.group(2))
    end_chap = m.group(3)
    end_v = m.group(4)
    if end_v is None:
        return chap, [v1]
    if end_chap and int(end_chap) != chap:
        # Multi-chapter range; conservative: only pin to first verse
        return chap, [v1]
    return chap, list(range(v1, int(end_v) + 1))


def clean_note(text: str) -> str:
    """Tyndale TSV notes end with `\\n\\n` literal in many rows. Normalise."""
    # Unescape `\n` → real newline, then collapse
    text = text.replace("\\n", "\n").strip()
    # Collapse multiple blank lines, then re-flatten to a single paragraph
    text = re.sub(r"\n{2,}", "\n\n", text).strip()
    return text


def parse_tsn_book(tsv_path: Path):
    """Return {(chapter, verse): [note_text, ...]} for one TSN book.
       Multiple notes may target the same verse — we keep them in source order."""
    notes_by_verse = defaultdict(list)
    with open(tsv_path, encoding="utf-8") as f:
        rdr = csv.reader(f, delimiter="\t")
        rows = list(rdr)
    if not rows:
        return notes_by_verse
    # Header row tells us column count; the note body is the LAST column
    n_cols = len(rows[0])
    for row in rows[1:]:
        if len(row) < n_cols:
            continue
        ref = row[0].strip()
        body = clean_note(row[-1])
        if not body:
            continue
        chap, verses = parse_ref(ref)
        if not chap or not verses:
            continue
        for v in verses:
            notes_by_verse[(chap, v)].append(body)
    return notes_by_verse


def parse_all_tsns(lang: str):
    """Parse every TSN TSV for a language. Returns {slug: {(chap, verse): [notes]}}."""
    out = {}
    lang_dir = TSN_DIR / lang
    if not lang_dir.is_dir():
        return out
    for tsv in sorted(lang_dir.glob("*.tsv")):
        usfm = tsv.stem
        slug = USFM_TO_SLUG.get(usfm)
        if not slug:
            print(f"  WARN: unknown USFM {usfm}", file=sys.stderr)
            continue
        out[slug] = parse_tsn_book(tsv)
    return out


# --- Bible loading ------------------------------------------------------------

def load_target_bible(lang: str):
    """{slug: {chapter: [verse_numbers, ...]}} for the target language."""
    bibles = defaultdict(dict)
    bible_dir = BIBLES_DIR / lang
    for path in sorted(bible_dir.glob("*.json")):
        # filename: <slug>_<chapter>.json — but slugs contain '-', so rsplit on '_'
        stem = path.stem
        slug, _, ch_str = stem.rpartition("_")
        try:
            ch = int(ch_str)
        except ValueError:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        verses = sorted(v["verse"] for v in data.get("verses", []))
        if verses:
            bibles[slug][ch] = verses
    return bibles


# --- Per-language commentary build --------------------------------------------

def build_chapter_entries(lang: str, slug: str, ch: int, target_verses, tsn_book):
    """For one chapter, produce a list of {verse, text|null, reason}.
       null/reason marks gaps for the LLM phase."""
    out = []
    offset = psalm_offset(lang, ch) if slug == "psalms" else 0

    for v in target_verses:
        if offset > 0 and v <= offset:
            # Target has a superscription verse that KJV doesn't — Tyndale
            # has no note for this exact verse. Mark as gap; LLM will produce
            # a short superscription explanation in phase D.
            out.append({"verse": v, "text": None, "reason": "superscription", "kjv_v": None})
            continue
        kjv_v = v - offset
        notes = tsn_book.get((ch, kjv_v), []) if tsn_book else []
        if notes:
            text = "\n\n".join(notes)
            out.append({"verse": v, "text": text})
        else:
            out.append({"verse": v, "text": None, "reason": "no-tsn-note", "kjv_v": kjv_v})
    return out


def gather_gaps(stage_dir: Path):
    """Walk the staged commentary tree; return list of gap entries needing LLM fill."""
    gaps = []
    for ch_file in stage_dir.rglob("*.json"):
        # path: <stage>/<lang>/<slug>/<chapter>.json
        rel = ch_file.relative_to(stage_dir).parts
        # rel = (lang, slug, chapter.json)
        lang = rel[0]
        slug = rel[1]
        ch = int(ch_file.stem)
        data = json.loads(ch_file.read_text(encoding="utf-8"))
        for v in data["verses"]:
            if v.get("text") is None:
                gaps.append({
                    "lang": lang, "slug": slug, "chapter": ch,
                    "verse": v["verse"], "reason": v.get("reason"),
                    "kjv_v": v.get("kjv_v"),
                })
    return gaps


# --- Phases -------------------------------------------------------------------

def phase_B(only_lang=None):
    """Shape per-language commentary against the target Bible. Writes staged
       files under /tmp/pdtc/.cache/stage_multilang/<lang>/<slug>/<ch>.json
       with text=None where a gap needs the LLM phase."""
    stage = Path("/tmp/pdtc/.cache/stage_multilang")
    stage.mkdir(parents=True, exist_ok=True)

    summary = {}
    for lang in TARGETS:
        if only_lang and lang != only_lang:
            continue
        print(f"\n=== Phase B: {lang} ===")
        tsns = parse_all_tsns(lang)
        bibles = load_target_bible(lang)
        if not bibles:
            print(f"  ERROR: no Bible chapters cached for {lang} at {BIBLES_DIR/lang}", file=sys.stderr)
            continue

        tsn_books = set(tsns.keys())
        bible_books = set(bibles.keys())
        print(f"  Tyndale TSN books: {len(tsn_books)}, target Bible books: {len(bible_books)}")
        gap_books = bible_books - tsn_books
        print(f"  Books with NO Tyndale TSN (need LLM): {sorted(gap_books)[:8]}{'...' if len(gap_books) > 8 else ''} ({len(gap_books)} total)")

        total_v = 0
        tsn_v = 0
        gap_v = 0
        for slug, chapters in bibles.items():
            for ch, verses in chapters.items():
                tsn_book = tsns.get(slug)
                entries = build_chapter_entries(lang, slug, ch, verses, tsn_book)
                total_v += len(entries)
                for e in entries:
                    if e.get("text"):
                        tsn_v += 1
                    else:
                        gap_v += 1
                out_path = stage / lang / slug / f"{ch}.json"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_text(json.dumps({"verses": entries}, ensure_ascii=False) + "\n", encoding="utf-8")

        summary[lang] = {
            "total": total_v, "from_tyndale": tsn_v, "gap": gap_v,
            "tyndale_books": sorted(tsn_books), "gap_books": sorted(gap_books),
        }
        print(f"  Verses: {total_v} total, {tsn_v} from Tyndale ({tsn_v/total_v*100:.1f}%), {gap_v} need LLM fill")
    return summary


def phase_C():
    """Emit the gap worklist for LLM translation."""
    stage = Path("/tmp/pdtc/.cache/stage_multilang")
    if not stage.is_dir():
        sys.exit("Run phase B first.")
    gaps = gather_gaps(stage)
    GAPS_OUT.parent.mkdir(parents=True, exist_ok=True)
    GAPS_OUT.write_text(json.dumps(gaps, ensure_ascii=False))
    by_reason = defaultdict(int)
    by_lang = defaultdict(int)
    for g in gaps:
        by_reason[g["reason"]] += 1
        by_lang[g["lang"]] += 1
    print(f"Gaps: {len(gaps)} total")
    print(f"  by reason: {dict(by_reason)}")
    print(f"  by lang: {dict(by_lang)}")
    print(f"Wrote → {GAPS_OUT}")


# --- Phase D: LLM-translate the English Tyndale text into each gap verse -----

LANG_LABELS = {"fr": "French", "pt": "Brazilian Portuguese", "es": "Spanish"}

TRANSLATE_SYSTEM = """You are a professional Bible-translation editor. Translate English Tyndale Study Notes — short per-verse commentary aimed at devout lay readers — into the target language.

Voice: warm, modern, accessible. The translation must read NATURALLY, as if it were originally written by a native speaker. NEVER produce stilted, word-for-word translation. Pay attention to:

  - Idiom: 'shepherd's heart', 'work together for good' — render the sense, not the literal words
  - Cross-references like (Matt 6:25-34): leave the chapter:verse numbers intact, but use the target language's book abbreviations (e.g. fr: 'Mt 6.25-34'; pt: 'Mt 6.25-34'; es: 'Mt 6:25-34')
  - Theological terms: use the standard target-language equivalent (e.g. 'grace' → 'grâce' / 'graça' / 'gracia')
  - Hebrew/Greek transliterations in parens: keep them ('chokmah', 'shalom') — they're scholarly anchors
  - Bold markdown (**text**) and bullet markers (•): preserve exactly

Return ONLY the translated text. No preamble, no explanation, no quotation marks around the output. Match the source's paragraph structure."""

SUPERSCRIPTION_SYSTEM = """You are writing a one-paragraph Tyndale-style commentary entry for a psalm superscription verse in the target language. The user gives you the superscription text and the chapter context. Return ONE short paragraph (30-70 words, target language) that:
  - explains what the superscription identifies (historical setting / musical instruction / authorship)
  - if it names a historical event, cross-reference the relevant scripture (e.g. 2S 11.1-27 for Ps 51)
  - matches the tone of Tyndale Study Notes: scholarly but accessible

Return only the paragraph, in the target language. No preamble."""


def chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i+n]


def phase_D(only_lang=None, concurrency=6, max_gaps=None):
    """LLM-translate each gap. Reads /tmp/pdtc/.cache/multilang_gaps.json and
       English Tyndale text from EN_COMMENTARY. Writes filled text back to the
       same staged file in /tmp/pdtc/.cache/stage_multilang/."""
    import concurrent.futures

    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY not set")
    # Lazy import — only needed in phase D
    import anthropic
    client = anthropic.Anthropic()
    MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")

    stage = Path("/tmp/pdtc/.cache/stage_multilang")
    gaps = json.loads(GAPS_OUT.read_text())
    if only_lang:
        gaps = [g for g in gaps if g["lang"] == only_lang]
    if max_gaps:
        gaps = gaps[:max_gaps]
    print(f"Phase D: translating {len(gaps)} gap verses")

    # Load all English Tyndale notes once (small in memory: ~5MB)
    en_cache = {}  # (slug, ch) -> {verse: text}
    for slug_dir in (EN_COMMENTARY / "books").iterdir():
        for ch_file in (slug_dir / "chapters").glob("*.json"):
            slug = slug_dir.name
            ch = int(ch_file.stem)
            data = json.loads(ch_file.read_text())
            en_cache[(slug, ch)] = {v["verse"]: v["text"] for v in data["verses"]}

    # Also load target Bible verse text (needed for superscription context)
    bible_cache = {}  # (lang, slug, ch) -> {verse: text}
    for lang in TARGETS:
        for path in (BIBLES_DIR / lang).glob("*.json"):
            stem = path.stem
            slug, _, ch_str = stem.rpartition("_")
            try: ch = int(ch_str)
            except: continue
            data = json.loads(path.read_text())
            bible_cache[(lang, slug, ch)] = {v["verse"]: v["text"] for v in data["verses"]}

    fills_path = Path("/tmp/pdtc/.cache/multilang_fills.json")
    fills = {}
    if fills_path.exists():
        fills = json.loads(fills_path.read_text())
        print(f"  resuming with {len(fills)} fills already cached")

    def gap_key(g):
        return f"{g['lang']}|{g['slug']}|{g['chapter']}|{g['verse']}"

    # Dedup: group gaps by their source text. Translate each unique
    # (lang, source_text) once, then apply to all gaps that share it.
    # Superscriptions are unique per-(lang, slug, chapter, verse), no dedup.
    translation_cache_path = Path("/tmp/pdtc/.cache/multilang_translation_cache.json")
    tcache = {}
    if translation_cache_path.exists():
        tcache = json.loads(translation_cache_path.read_text())
        print(f"  resuming with {len(tcache)} unique translations cached")

    # Build dedup keys: for plain gaps, key = lang|en_source_text_hash; for
    # superscriptions, key = lang|super|slug|ch|v (always unique).
    import hashlib
    def dedup_key(g):
        if g.get("reason") == "superscription":
            return f"{g['lang']}|super|{g['slug']}|{g['chapter']}|{g['verse']}"
        kjv_v = g["kjv_v"]
        en_text = en_cache.get((g["slug"], g["chapter"]), {}).get(kjv_v, "")
        if not en_text: return None
        h = hashlib.sha256(en_text.encode("utf-8")).hexdigest()[:16]
        return f"{g['lang']}|en|{h}"

    # Group gaps by dedup key
    by_dkey = defaultdict(list)
    for g in gaps:
        dk = dedup_key(g)
        if dk: by_dkey[dk].append(g)

    # Skip dedup keys already translated
    todo_dkeys = [dk for dk in by_dkey if dk not in tcache]
    print(f"  unique work units: {len(by_dkey)} total, {len(todo_dkeys)} to translate")
    if not todo_dkeys:
        # still need to materialise fills from cache
        pass

    def translate_dkey(dk):
        """Translate one unique work unit. Returns target-language text."""
        sample = by_dkey[dk][0]
        lang = sample["lang"]
        target = LANG_LABELS[lang]
        if sample.get("reason") == "superscription":
            super_text = bible_cache.get((lang, sample["slug"], sample["chapter"]), {}).get(sample["verse"], "")
            user_msg = f"Target language: {target}\nPsalm chapter: {sample['chapter']}\nSuperscription text (verse {sample['verse']}): {super_text!r}\n\nWrite a short commentary paragraph in {target}."
            resp = client.messages.create(
                model=MODEL, max_tokens=400,
                system=[{"type": "text", "text": SUPERSCRIPTION_SYSTEM, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user_msg}],
            )
        else:
            kjv_v = sample["kjv_v"]
            en_text = en_cache.get((sample["slug"], sample["chapter"]), {}).get(kjv_v)
            if not en_text: return None
            user_msg = f"Target language: {target}\n\nSource (English Tyndale note for {sample['slug']} {sample['chapter']}:{kjv_v}):\n\n{en_text}"
            resp = client.messages.create(
                model=MODEL, max_tokens=1500,
                system=[{"type": "text", "text": TRANSLATE_SYSTEM, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user_msg}],
            )
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        if text.startswith('"') and text.endswith('"'):
            text = text[1:-1].strip()
        return text

    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as ex:
        futures = {ex.submit(translate_dkey, dk): dk for dk in todo_dkeys}
        for fut in concurrent.futures.as_completed(futures):
            dk = futures[fut]
            try:
                text = fut.result()
                if text:
                    tcache[dk] = text
                done += 1
            except Exception as e:
                print(f"    FAIL {dk}: {e}", file=sys.stderr)
            if done % 50 == 0:
                translation_cache_path.write_text(json.dumps(tcache, ensure_ascii=False))
                print(f"  progress {done}/{len(todo_dkeys)}  (gaps satisfied: {sum(len(by_dkey[dk]) for dk in tcache)}/{len(gaps)})")

    translation_cache_path.write_text(json.dumps(tcache, ensure_ascii=False))

    # Expand tcache → per-gap fills
    for dk, gs in by_dkey.items():
        if dk in tcache:
            for g in gs:
                fills[gap_key(g)] = tcache[dk]
    fills_path.write_text(json.dumps(fills, ensure_ascii=False))
    print(f"  done. {len(tcache)} unique translations cached → {len(fills)} verse fills.")


# --- Phase E: write final commentary tree -------------------------------------

LICENSE_TEMPLATE = """# Commentary corpus license — {LANG_NAME}

This directory bundles two sources, both available under **CC BY-SA 4.0**:

## 1. Tyndale Study Notes in {LANG_NAME} (~{TYNDALE_PCT:.0f}% of verses)

The original work by Tyndale House, distributed at https://tyndaleopenresources.com/
and packaged for redistribution as `{REPO}` on git.door43.org. Used here under the
Creative Commons Attribution-ShareAlike 4.0 International License.

License: https://creativecommons.org/licenses/by-sa/4.0/

Changes from the upstream source:
  - Each note (which Tyndale keys to a verse or verse range) has been
    replicated across every individual verse the original range covers, so
    the client can look up commentary by exact verse number.
  - The Tyndale House® trademark has been removed from rendered surfaces
    per the upstream license's derivative-works clause.

## 2. LLM-translated entries (~{LLM_PCT:.0f}% of verses)

For books the {LANG_NAME} Tyndale Study Notes don't cover yet, short
entries were produced by translating the English Tyndale Study Notes via
Claude Sonnet 4.6. These derivatives are likewise released under CC BY-SA 4.0.

# Attribution

Verse explanations in this file should be credited as:
"The original work by Tyndale House, with translation derivatives — CC BY-SA 4.0"

# License text

The full Creative Commons Attribution-ShareAlike 4.0 International license
text is available at: https://creativecommons.org/licenses/by-sa/4.0/legalcode
"""

LANG_NAMES = {"fr": "French", "pt": "Portuguese (Brazilian)", "es": "Spanish"}
TSN_REPOS = {"fr": "BurritoTruck/fr_tsn", "pt": "BurritoTruck/pt_tsn", "es": "BurritoTruck/es_tsn"}


def phase_E(only_lang=None):
    """Assemble final commentary/<lang>/ tree: staged entries + LLM fills."""
    stage = Path("/tmp/pdtc/.cache/stage_multilang")
    fills_path = Path("/tmp/pdtc/.cache/multilang_fills.json")
    fills = json.loads(fills_path.read_text()) if fills_path.exists() else {}

    for lang in TARGETS:
        if only_lang and lang != only_lang:
            continue
        out_root = CORPUS / "commentary" / lang
        out_root.mkdir(parents=True, exist_ok=True)
        total = 0; tyn = 0; llm = 0
        for ch_file in (stage / lang).rglob("*.json"):
            rel = ch_file.relative_to(stage / lang)
            slug = rel.parts[0]
            ch = int(ch_file.stem)
            data = json.loads(ch_file.read_text(encoding="utf-8"))
            verses = []
            for v in data["verses"]:
                total += 1
                if v.get("text"):
                    verses.append({"verse": v["verse"], "text": v["text"]})
                    tyn += 1
                else:
                    key = f"{lang}|{slug}|{ch}|{v['verse']}"
                    fill = fills.get(key)
                    if not fill:
                        print(f"  MISSING fill for {key}", file=sys.stderr)
                        continue
                    verses.append({"verse": v["verse"], "text": fill})
                    llm += 1
            out_dir = out_root / "books" / slug / "chapters"
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / f"{ch}.json").write_text(
                json.dumps({"verses": verses}, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

        # LICENSE
        tyn_pct = 100 * tyn / total if total else 0
        llm_pct = 100 * llm / total if total else 0
        (out_root / "LICENSE").write_text(
            LICENSE_TEMPLATE.format(
                LANG_NAME=LANG_NAMES[lang], REPO=TSN_REPOS[lang],
                TYNDALE_PCT=tyn_pct, LLM_PCT=llm_pct,
            ),
            encoding="utf-8",
        )
        # index.json
        from datetime import datetime
        (out_root / "index.json").write_text(
            json.dumps({
                "source": f"{TSN_REPOS[lang]} + claude-sonnet-4-6",
                "license": "CC-BY-SA-4.0",
                "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
                "tyndaleSource": "https://tyndaleopenresources.com/",
                "generatedAt": datetime.utcnow().isoformat() + "Z",
                "stats": {
                    "verses": total,
                    "tyndaleVerses": tyn,
                    "llmTranslatedVerses": llm,
                },
            }, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"{lang}: wrote {total} verses ({tyn} Tyndale + {llm} LLM)")


# --- CLI ----------------------------------------------------------------------

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", default="B", help="B|C|D|E|all")
    ap.add_argument("--lang", default=None)
    ap.add_argument("--concurrency", type=int, default=6)
    ap.add_argument("--max-gaps", type=int, default=None)
    args = ap.parse_args()

    if args.phase in ("B", "all"):
        phase_B(only_lang=args.lang)
    if args.phase in ("C", "all"):
        phase_C()
    if args.phase in ("D", "all"):
        phase_D(only_lang=args.lang, concurrency=args.concurrency, max_gaps=args.max_gaps)
    if args.phase in ("E", "all"):
        phase_E(only_lang=args.lang)


if __name__ == "__main__":
    main()
