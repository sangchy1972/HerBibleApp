# Commentary explanations — full pipeline architecture

This document captures the complete data flow from source commentaries to the
verse-explanation card rendered in the user's Bible reader. It is the canonical
reference for any work that touches the Explore feature, the translation cache,
or the `pd-text-corpus` mirror.

## Sources & data tree

```
pd-text-corpus (sangchy1972/pd-text-corpus, served via jsDelivr)
├── bibles/                       ← KJV/zh-Hans/zh-Hant/fr/pt/es/de Bible TEXT
│   └── <lang>/books/<slug>/chapters/<N>.json
│       { "verses": [{"verse": N, "text": "..."}, ...] }
└── commentary/                   ← per-verse explanations (THIS file's focus)
    ├── en/books/<slug>/chapters/<N>.json
    ├── fr/books/<slug>/chapters/<N>.json
    ├── pt/books/<slug>/chapters/<N>.json
    ├── es/books/<slug>/chapters/<N>.json
    ├── (de/zh/etc later)
    ├── <lang>/LICENSE            ← CC BY-SA 4.0 + Tyndale attribution
    └── <lang>/index.json         ← stats (tyndale/cache/fallback breakdown)
```

Each `commentary/<lang>/books/<slug>/chapters/<N>.json`:
```json
{ "verses": [
    { "verse": 1, "text": "..." },
    { "verse": 2, "text": "...", "fallback": "en" },   ← optional marker
    ...
]}
```

The `fallback: "en"` flag marks verses where the corpus could not produce a
native-language translation and is showing English content. The client
**currently does not differentiate fallback verses at render time** — it shows
whatever `text` contains. The flag exists for future UI distinction (e.g., a
small "translated from English" badge) and for build-pipeline tracking.

## Source-of-truth materials

### 1. KJV / Bible text
- `pd-text-corpus/bibles/en/books/<slug>/chapters/<N>.json`
- 31,102 KJV verses across 66 books / 1,189 chapters — the universal scaffold

### 2. Tyndale Open Study Notes (primary commentary source)
- CC BY-SA 4.0
- Per-language repos on git.door43.org/BurritoTruck:
  - `fr_tsn` (French Tyndale Open Notes)
  - `pt_tsn` (Portuguese)
  - `es_tsn` (Spanish)
- EN data via `https://bible.helloao.org/api/c/tyndale/<USFM>/<N>.json` and
  the corresponding `BurritoTruck/en_tsn` TSV (same content, different format)
- **Sparse coverage**: avg ~8 notes per ~30-verse chapter. Most verses don't
  have a dedicated Tyndale note.

### 3. Other CC-PD English commentaries (gap-fill chain)
- `jamieson-fausset-brown` (1871, JFB) — concise, closest to Tyndale tone
- `adam-clarke` (1810-1826, Adam Clarke)
- `john-gill` (1746-1763, John Gill) — verbose but broad coverage
- `matthew-henry` (Matthew Henry) — narrative-style
- `keil-delitzsch` (K-D) — OT only, scholarly
- All accessible via `https://bible.helloao.org/api/c/<id>/<USFM>/<N>.json`

### 4. Translation cache (the multilang glue)
- `scripts/.translation_progress/cache.json` — **source-of-truth, in repo, committed**
- `/tmp/pdtc/.cache/multilang_translation_cache.json` — hot working mirror
- Key: `{lang}|en|{sha256(en_text)[:16]}` (16 hex chars of SHA-256 of EN text)
- Value: translated text string
- **Critical invariant**: the EN text must be EXACTLY the bytes in the corpus
  (no whitespace drift, no quote normalization, no re-typing)
- Both files must be kept in sync after each translation batch

## Build pipeline (Phase A/B/C/D/E)

### Phase A — Download Tyndale source
- Pull HelloAO `/api/c/tyndale/<USFM>/<N>.json` for every chapter
- Or `git clone BurritoTruck/<lang>_tsn` for languages
- Cache locally so re-runs are idempotent

### Phase B — Reshape to per-verse JSON
**The correct logic (Pattern K compliant):**

For each chapter:
1. Parse all Tyndale blocks: each has a leading reference (`5:5`, `5:1-4`,
   `52:13–53:12`) → range `[start, end]`
2. For each KJV verse N:
   a. Find the smallest-range block whose range includes N AND range ≤ 4 verses
      (broad chapter-overview blocks like `5:1-14` are EXCLUDED to prevent
      cascading to every verse in the chapter)
   b. If found → use that block's text
   c. If not found → verse is a GAP → marked `null` for Phase C
3. Output staged `{verse: N, text: "<lang text>" | null}` per chapter

**The wrong logic (Pattern K — DO NOT use):**
- "For verse N with no block of its own, copy the previous block's text"
  → produces fall-through inheritance bugs (Tyndale's `5:5` note replicated
  to verses 6, 7, 8, etc.)
- The original `gen_commentary.mjs:191-199` `blockCoveringVerse()` did this;
  the original `gen_commentary_multilang.py` Phase B did a similar thing
- **22.6% of EN corpus had this bug** before the May 2026 cleanup

### Phase C — Claude fills gap verses (legacy approach)
- For each `null` verse from Phase B, call Claude (Sonnet 4.6) to write a
  ~50-100 word Tyndale-style note
- Used in original `gen_commentary.mjs` Phase C, and `gen_commentary_multilang.py`
- **Currently disabled**: no ANTHROPIC_API_KEY available. Replaced by:
  - For EN: PD commentary chain (JFB → Clarke → Gill → MH → K-D) + hand-writing
  - For FR/PT/ES: cache lookup → EN fallback (until manual translation lands)

### Phase D — Quality audit (legacy)
- Sample-check 30 random Claude-filled verses for tone consistency
- Currently disabled (no API key)

### Phase E — Assemble final commentary tree
For each language:
- Walk staged per-verse JSON from Phase B
- For each verse:
  - If staged text exists → use it (Tyndale-translated)
  - Else lookup `cache[{lang}|en|{hash}]`:
    - Hit → use cached translation
    - Miss → write EN content with `fallback: "en"` flag
- Write per-chapter JSON to `commentary/<lang>/books/<slug>/chapters/<N>.json`
- Use single-line JSON (`separators=(',', ':')`) to keep git diffs small and
  CDN payloads small

## Audit methodology

### Pattern K bug detection (verse-explanation alignment)

For each verse N in commentary:
- Parse leading verse-ref from text: `^\d+:\d+(?:[-–—]\d+(?::\d+)?)?\s`
- Categories:
  - `LEGIT_SELF`: leading ref is single verse and matches actual verse number
  - `LEGIT_RANGE`: leading ref is range X-Y and actual verse falls within
  - `BUG_INHERIT_SINGLE`: leading ref is single X:Y but verse number ≠ Y
  - `BUG_INHERIT_RANGE`: leading ref is range but actual verse outside it
  - `NO_REF`: no leading ref pattern (Claude-en notes or post-processed)

For translated languages (FR/PT/ES), leading refs often get dropped during
translation. The leading-ref audit misses many real bugs. Better methodology:
- Re-run corrected Phase B and diff against current corpus
- For each chapter, count BurritoTruck TSV blocks and compare to distinct
  verse texts in corpus
- Use cache-aware dedup to count true translation work needed

### Translation work scoping audit

To know what work remains:
1. Walk all FR/PT/ES corpus chapters
2. Collect every verse with `fallback: "en"`
3. For each, compute `hash = sha256(CURRENT EN text)[:16]`
4. Group by hash → which languages need this translation
5. Cross-check against existing cache.json (skip cache hits)
6. Output: unique EN texts × per-lang need = total translation entries

Implemented in `/tmp/audit_fallbacks.py`.

## Translation work — methodology (NO API KEY)

Each translation entry: write a target-language note that:
- Matches the EN content semantically
- Follows the per-language style contract (see `commentary_agent.md`)
- Keys into cache via `{lang}|en|{sha256(EN bytes)[:16]}`

**Critical**: never re-type the EN text into the Python literal. Keys must
hash to the EXACT bytes in corpus. Always:
1. Read EN text from the work-plan JSON (sourced from corpus)
2. Hash it once and use the hash as the dict key
3. Write only translations into the dict, never the EN

```python
# RIGHT:
T = {
    '2c6322575bdde8fc': {  # 1 Peter 1:6 (hash from work plan)
        'fr': "...",
        'pt': "...",
        'es': "...",
    },
}

# WRONG (produces orphan cache entries):
T = {
    "1:6 Wherein—in which prospect...": {  # re-typed EN, will hash differently
        'fr': "...",
    },
}
```

## End-to-end propagation cycle

After each translation batch:

```
1. Write translations into Python file keyed by hash
   ↓
2. Apply: write both to
     scripts/.translation_progress/cache.json   (source of truth)
     /tmp/pdtc/.cache/multilang_translation_cache.json  (hot copy)
   ↓
3. git commit scripts/.translation_progress/cache.json
   git push origin claude/multilang-commentary
   ↓
4. Run Phase 0 / Phase E rebuild:
     - For NT+Ps+Pr: /tmp/build_phase0.py
     - For OT extension: /tmp/build_phase0_ot.py
     - Output goes to /tmp/pd-text-corpus/commentary/{lang}/...
   ↓
5. cd /tmp/pd-text-corpus && git add commentary/
   git commit -m "..." && git push origin main
   ↓
6. Note new SHA. CDN refreshes in 1-2 min:
   curl https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@<SHA>/...
   ↓
7. Bump CORPUS_COMMIT in HerBibleApp:
     src/constants/corpus.ts line: export const CORPUS_COMMIT = '<NEW_SHA>';
   ↓
   ⚠ DO NOT git checkout / merge any branch. Hand the user a 1-line diff
     they can paste. Reason: their main worktree may have uncommitted work
     (Pattern N).
   ↓
8. Rebuild app (npx expo run:android or run:ios)
   ↓
9. AsyncStorage cache key includes CORPUS_COMMIT.slice(0,7), so the bump
   auto-invalidates the per-chapter cache → new corpus is fetched
```

## CORPUS_COMMIT pin bump — workflow

The HerBibleApp pins to a specific corpus SHA via `src/constants/corpus.ts`:

```ts
export const CORPUS_COMMIT = '<40-char SHA>';
```

This SHA determines which version of the corpus the app reads from CDN.
After each push to `sangchy1972/pd-text-corpus`, this line must be updated.

**Workflow rule (Pattern N enforced):**

- ALWAYS deliver the bump as a 1-line diff to the user
- NEVER recommend `git checkout` or `git merge` of any branch
- Assume the user has uncommitted work in their main worktree
- The cumulative property of SHAs means: if user is at SHA-A and current is
  SHA-D (after intermediate SHA-B, SHA-C), they can jump directly to SHA-D —
  all intermediate fixes are included.

Example diff:
```diff
- export const CORPUS_COMMIT = '226bb1b9aef265bfb4ad614619a361f5a77f0038';
+ export const CORPUS_COMMIT = 'd12b307716968d916565f5f7996d5a4683debdfa';
```

## Client-side rendering (Bible reader)

### Fetch path
`src/services/bibleService.ts:97-110`:
```ts
const primary = `${cdnRoot}/commentary/${code}/books/${slug}/chapters/${chapter}.json`;
const res = await fetch(primary);
if (res.ok) return await res.json();
if (res.status === 404 && code !== 'en') {
  // Chapter-level fallback to EN (used when ES doesn't have OT chapter files)
  const fallback = `${cdnRoot}/commentary/en/books/${slug}/chapters/${chapter}.json`;
  ...
}
```

### Two-layer fallback semantics
1. **Verse-level `fallback: 'en'`**: chapter file exists for lang, but this
   verse's text is in English (cache miss on translation). User sees English
   content in their otherwise-localized reader. No visual differentiation
   currently.
2. **Chapter-level 404 fallback**: chapter file doesn't exist for lang
   (HTTP 404). Client requests the EN chapter file as substitute. ALL verses
   in that chapter are shown in English. Affects ES OT books only.

### Display
`src/screens/BibleScreen.tsx` Explore card render:
1. Fetch chapter via `fetchCommentaryChapter`
2. Find verse: `row = ch.verses.find(r => r.verse === v.verse)`
3. **Strip leading verse-ref** from `row.text`:
   ```ts
   const cleaned = row.text.replace(/^\d+:\d+(?:[-–—]\d+(?::\d+)?)?\s+/, '');
   ```
   This removes redundant "5:7 " prefix since the UI already shows the verse
   number above the card.
4. Render `cleaned` in the pink-bordered explanation card.

### AsyncStorage caching
`bibleService.ts:35-38`:
```ts
const CACHE_TAG = CORPUS_COMMIT.slice(0, 7);
const commentaryKey = (code, slug, ch) =>
  `bible:commentary:${CACHE_TAG}:${code}:${slug}:${ch}`;
```
- Cache key includes CACHE_TAG → bumping CORPUS_COMMIT auto-invalidates all
  prior cache entries
- No manual cache-clear needed by the user

## Coverage stats (snapshot at d12b307, 2026-05-17)

| Lang | Total | Chapters present | Native (Tyndale or cache) | EN fallback | Real bugs |
|------|-------|------------------|---------------------------|-------------|-----------|
| EN   | 31,102 | 1,189 ✅          | 31,102 ✅                  | 0           | 0         |
| FR   | 31,102 | 1,189 ✅          | ~24,272 (78%)             | 6,830       | 0         |
| PT   | 31,102 | 1,189 ✅          | ~24,209 (78%)             | 6,893       | 6 (PT decimal-number false positives) |
| ES   | 31,102 | 841 ⚠️ (-348)     | ~21,732 (70%)             | 2,435       | 979 (in OT, blocked on chapter rebuild) |

## Remaining work backlog

1. **FR/PT/ES Round 2-N translations**: ~16,066 cache-miss entries to hand-write
   - At 50-80/round, ~200-300 rounds needed
   - No API key, so manual is the only path
   - Style contract enforced via `commentary_agent.md`
2. **ES chapter rebuild**: re-run Phase 0/E on ES OT books to create the 348
   missing chapter files. Pure restructuring; no new translations required.
   This will also clear the 979 ES OT BUG_INHERIT count.
3. **PT decimal-number false positives** (6 verses): low priority. The audit
   regex matches "5.000" in Portuguese number formatting as a verse-ref `5:0`.
   Fix the regex to require non-zero second number, or accept the false flag.

## Quality gates before declaring a commentary change "done"

Per `commentary_agent.md` verification checklist:
- [ ] Audit script run, BUG counts shown
- [ ] Affected verse list saved to JSON
- [ ] Sample 10 random handwritten/PD-filled verses; read end-to-end
- [ ] Concrete bug case verified (e.g., 1 Peter 5:7 reads about casting cares,
      not younger people)
- [ ] Cross-language hash invalidation tracked
- [ ] Corpus pushed; jsDelivr curl-verified at new SHA
- [ ] `CORPUS_COMMIT` bump diff delivered to user
- [ ] User device smoke test confirms new content renders

## Scripts (canonical, all in /tmp/ or scripts/)

| Path | Purpose |
|------|---------|
| `/tmp/audit_explanations.py` | Read-only EN audit (Pattern K detection) |
| `/tmp/audit_multilang_v3.py` | FR/PT/ES audit via TSV ground truth |
| `/tmp/audit_fallbacks.py` | Walk corpus, dedup fallbacks by hash, compute work |
| `/tmp/extract_en_remaining_bugs.py` | Export current bug list |
| `/tmp/download_pd.sh`, `/tmp/download_pd_par.sh` | Fetch JFB/Clarke/Gill via curl |
| `/tmp/download_mh_kd.sh` | Fetch Matthew Henry + Keil-Delitzsch |
| `/tmp/fill_from_pd.py` | Map EN bug verses → PD source text |
| `/tmp/writeback_corpus.py`, `/tmp/writeback_round2.py` | Write fills into corpus |
| `/tmp/build_phase0.py` | Rebuild FR/PT/ES NT+Ps+Pr from cache + TSV |
| `/tmp/build_phase0_ot.py` | Same logic extended to OT books |
| `/tmp/full_audit.py` | Comprehensive corpus state audit |
| `scripts/gen_commentary.mjs` | Legacy EN pipeline (Phase A-E) |
| `scripts/gen_commentary_multilang.py` | Legacy multilang pipeline |
| `scripts/verify_commentary.mjs` | Smoke verifier |
| `scripts/.translation_progress/cache.json` | Translation cache (source of truth) |
