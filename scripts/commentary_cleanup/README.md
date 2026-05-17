# Commentary cleanup pipeline — codex handoff guide

This directory contains the complete toolchain for continuing the
multi-language Bible commentary translation work for HerBibleApp.

**If you are codex (or any agent) picking this up, read this first.**

## What this is

The HerBibleApp Bible reader has an "Explore" feature that shows per-verse
commentary in EN / FR / PT / ES. In May 2026 a systematic Pattern K bug
(fall-through inheritance during pipeline Phase B) was discovered and
fixed for EN and FR/PT/ES OT. The remaining work is:

1. **Hand-translate ~16,066 cache-miss verses** from EN → FR/PT/ES
   (these currently show English fallback in the app)
2. **Rebuild ES corpus** for 348 missing OT chapters (no translation
   needed, just running Phase 0/E with corrected logic)
3. Optionally fix 6 PT verses where audit regex mis-detects Portuguese
   decimal-number formatting as verse-refs

## Read the canonical docs first

Before touching any code, read these in order (all in this directory's `docs/`):

1. **`docs/commentary_pipeline.md`** — end-to-end architecture, data flow,
   Phase A-E details, audit methodology, propagation cycle. **The single
   most important file.**
2. **`docs/commentary_agent.md`** — style contracts (per-language), hash-keyed
   cache rule, CORPUS_COMMIT bump workflow, verification checklist.
3. **`docs/mistakes_to_never_repeat.md`** — 20 patterns. Pay especially close
   attention to K (source-sparseness), L (audit-first), M (cosmetic-without-content),
   N (don't force git checkout/merge), O (hash-keyed cache only),
   P (multi-method audit), Q (1-line CORPUS_COMMIT diff). All came from
   this exact work.

These three files are MIRRORS of the user's local skill memory at
`~/.claude/projects/-Users-liwencao-HerBibleApp/memory/`. Whichever copy
you read, they're identical. The repo copy exists so any agent (cowork,
codex, future Claude) has self-contained access without depending on the
user's local Claude config directory.

## Layout

```
scripts/commentary_cleanup/
├── README.md                   ← you are here
├── setup.sh                    ← bootstrap script (clones sources, downloads PD commentaries)
├── workdata/                   ← intermediate JSON files (committed; ~16MB)
│   ├── en_bugs.json            ← original 7,040 EN bug verses
│   ├── en_bugs_round2.json     ← 421 residual EN bugs
│   ├── en_fills.json           ← PD-fill output for round 1
│   ├── en_fills_round2.json    ← PD-fill + hand-writing for round 2
│   ├── en_handwrite.json       ← 340 verses that needed hand-writing
│   ├── translation_work.json   ← full 7,142 unique EN hash work plan
│   ├── translation_miss_only.json  ← 16,118 cache-miss translation entries (THE WORK QUEUE)
│   ├── round1_plan.json        ← demo batch of 68 hashes
│   └── pd_manifest.json        ← list of (book,chapter) pairs needing PD commentaries
│
├── audit_explanations.py       ← Pattern K EN-corpus audit
├── audit_multilang.py          ← FR/PT/ES audit v1 (leading-ref heuristic, limited)
├── audit_multilang_v2.py       ← FR/PT/ES audit v2 (duplicate clusters, over-counts)
├── audit_multilang_v3.py       ← FR/PT/ES audit v3 (TSV ground truth, paraphrase blind)
├── audit_fallbacks.py          ← THE one to use: dedup fallbacks by hash, plan work
├── full_audit.py               ← all-language summary
│
├── phaseB_correct.py           ← test corrected Phase B logic on FR/PT/ES
├── check_cache_hits.py         ← measure cache-hit rate against gaps
│
├── extract_en_remaining_bugs.py ← export current bug list from corpus state
├── extract_round1_batch.py     ← plan a translation batch by budget
│
├── download_pd_par.sh          ← parallel curl of JFB/Clarke/Gill commentaries
├── download_mh_kd.sh           ← Matthew Henry + Keil-Delitzsch (round 2)
├── fill_from_pd.py             ← map bug verses → PD source text
├── fill_round2.py              ← same, for residual 421 with MH/KD
├── writeback_corpus.py         ← apply fills back into commentary/en/ chapters
├── writeback_round2.py         ← same, round 2
│
├── build_phase0.py             ← rebuild FR/PT/ES NT+Psalms+Proverbs corpus
└── build_phase0_ot.py          ← same logic extended to OT books
```

## Setup (first run)

The pipeline needs three external data trees that aren't in this repo:

| Path                              | Source                                    | Size |
|-----------------------------------|-------------------------------------------|------|
| `~/.commentary_workspace/pd-text-corpus/` | `git clone sangchy1972/pd-text-corpus` | 145MB |
| `~/.commentary_workspace/_tsn_sources/{fr,pt,es}_tsn/` | `git clone BurritoTruck/{fr,pt,es}_tsn` | 16MB |
| `~/.commentary_workspace/pd_cache/`       | curl HelloAO PD commentaries              | 104MB |

Run `setup.sh` once to clone/download everything to `~/.commentary_workspace/`.
This is a separate (not-in-repo) workspace because of the 280MB total size.

> **NOTE**: The current scripts reference `/tmp/pdtc/...` and
> `/tmp/pd-text-corpus/...` paths from the original work session. Before
> running them, either:
> (a) Update each script's path constants to point to `~/.commentary_workspace/`, or
> (b) Create symlinks: `ln -s ~/.commentary_workspace/pd-text-corpus /tmp/pd-text-corpus` etc.
> Codex: please do (a) — it's cleaner and survives reboots. Or refactor the
> scripts to use a `WORKSPACE_ROOT` env var with `~/.commentary_workspace/` default.

## The translation cache (source of truth)

`scripts/.translation_progress/cache.json` — **THIS FILE** is the
authoritative translation database, committed to git. It contains every
translated explanation for every language, keyed by
`{lang}|en|{sha256(en_text)[:16]}`.

Current size: ~14.7MB, ~43,527 entries.

**Every translation round must commit changes to this file.** Without
the commit, the next agent doesn't see your progress.

## How a translation round works

### Division of labor (cowork-friendly)

Cowork (or any Read/Write-only agent) handles **steps 1-4**. The user
handles **steps 5-9** in their Terminal. This split lets cowork keep
working even when the macOS sandbox is full / disk-pressured, since
write-translations-into-a-Python-file doesn't need Bash.

```
┌─────────────────────────────────────────────────────────────────────┐
│  COWORK (Read + Write only)        │  USER (Terminal)               │
│  ────────────────────────          │  ────────────                  │
│  1. Read workdata/                 │                                │
│     translation_miss_only.json     │                                │
│  2. Read scripts/.translation_     │                                │
│     progress/cache.json            │                                │
│  3. Pick 50-80 hashes for round    │                                │
│  4. Write Python file:             │                                │
│     scripts/commentary_cleanup/    │                                │
│     rounds/round<N>.py             │                                │
│       T = {                        │                                │
│         '<hash>': {                │                                │
│           'fr': '...',             │                                │
│           'pt': '...',             │                                │
│           'es': '...',             │                                │
│         },                         │                                │
│         ...                        │                                │
│       }                            │                                │
│     + bottom: apply T to cache.json│                                │
│                                    │                                │
│  Tell user: "round <N> written     │                                │
│  with X entries, please apply"    ─┼─→  5. python3 rounds/round<N>.py │
│                                    │       (updates cache.json)      │
│                                    │     6. git add scripts/         │
│                                    │       .translation_progress/    │
│                                    │       cache.json                │
│                                    │       git commit -m "..."       │
│                                    │       git push                  │
│                                    │     7. python3 build_phase0.py  │
│                                    │       python3 build_phase0_ot.py│
│                                    │     8. cd ~/.commentary_         │
│                                    │       workspace/pd-text-corpus  │
│                                    │       git add commentary/       │
│                                    │       git commit && git push    │
│                                    │       → note new SHA            │
│                                    │     9. Update CORPUS_COMMIT     │
│                                    │       in src/constants/         │
│                                    │       corpus.ts (1 line)        │
└─────────────────────────────────────────────────────────────────────┘
```

### Template for a translation round file

Cowork writes one file per round at `rounds/round<N>.py`. Use this skeleton:

```python
"""Round N translations: <N> entries across <which books>.

Methodology: hash-keyed dict, no re-typing of EN text. Reads en_text from
workdata/translation_miss_only.json for context, but the dict key is the
hash directly.
"""
import json, hashlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent  # walk up to repo root
REPO_CACHE = REPO_ROOT / 'scripts' / '.translation_progress' / 'cache.json'

# Map: hash → {lang: translation_text}
T = {
    '<16-char-hash-from-work-plan>': {
        'fr': "1:6 En cela — dans cette perspective...",
        'pt': "1:6 Em que — nesta perspectiva...",
        'es': "1:6 En lo cual — en esta perspectiva...",
    },
    # ... 50-80 more entries
}

# Apply
cache = json.loads(REPO_CACHE.read_text())
added = 0
for h, lang_map in T.items():
    for lang, text in lang_map.items():
        key = f'{lang}|en|{h}'
        if key not in cache:
            cache[key] = text
            added += 1
REPO_CACHE.write_text(json.dumps(cache, ensure_ascii=False) + '\n')
print(f'Round N: {added} entries added; cache total: {len(cache)}')
```

User then runs `python3 scripts/commentary_cleanup/rounds/round<N>.py` and
that's the cache updated.

### The autonomous one-command sequence

After cowork writes `rounds/round<N>.py`, the **entire** rest of the
pipeline (apply → commit → rebuild → push corpus → bump pin → commit
bump → push) is a single command:

```bash
bash scripts/commentary_cleanup/run_round.sh <N>
```

Examples:
```bash
bash scripts/commentary_cleanup/run_round.sh 2
bash scripts/commentary_cleanup/run_round.sh 3
```

This script:
1. Applies the round file's translations to `scripts/.translation_progress/cache.json`
2. Commits cache + round file to HerBibleApp, pushes
3. Rebuilds FR/PT/ES corpus via Phase 0 + OT extension
4. Pushes corpus update to `sangchy1972/pd-text-corpus`, captures new SHA
5. Bumps `CORPUS_COMMIT` in `src/constants/corpus.ts` to the new SHA
6. Commits the bump to HerBibleApp, pushes

Safe to re-run: detects "no changes" at each step and continues without
error. Uses `set -euo pipefail` so any actual failure stops the chain
before doing damage.

### Fully autonomous overnight workflow

If cowork has Bash access (sandbox not blocked), the loop becomes:

```
for N in 2 3 4 5 ...
  Cowork:
    1. Write rounds/round<N>.py
    2. Run: bash scripts/commentary_cleanup/run_round.sh <N>
    3. Sleep or pick next batch
```

User wakes up to N pushed rounds + N CORPUS_COMMIT bumps on
`claude/multilang-commentary`. They can either:
- Cherry-pick the latest bump commit onto `main`
- Or merge the branch
- Or just keep developing from the latest pin

### If cowork can't Bash (sandbox blocked)

Cowork writes the round file. User runs the script themselves once:

```bash
bash scripts/commentary_cleanup/run_round.sh <N>
```

That's 1 command per round, not 5. The user only does this when cowork
ping them. No editor needed; no SHA copying.

See `docs/commentary_pipeline.md` for the full architecture diagram and
rationale.

## Style contract (CRITICAL)

Translations must match the tone of Tyndale Open Study Notes:

- 30-70 words (matching EN length, ratio 0.7-1.5 acceptable)
- Scholarly-warm register; no exclamations; no devotional fluff
- *Hebrew / Greek* terms italicized with asterisks: `*shalom*`, `*davar*`
- Cross-references in standard abbreviations per language:
  - FR (Louis Segond style): `1P 5:7`, `Mt 26:39`, `1Co 15:25`, etc.
  - PT (Almeida style): **period notation** `1Pe 5.7`, `Mt 26.39`, `1Co 15.25`
  - ES (Reina-Valera): `1P 5:7`, `Mt 26:39`, `1Co 15:25`
- Keep verse-ref prefix at start (client strips it before display, but
  the cache stores with prefix for consistency)
- Each translation must be **verse-specific** — never generic. Read the
  EN content and translate that, don't write a stock devotional.

The user's canonical regression check: **1 Peter 5:7 must discuss
"casting your cares on Him", not "younger people in the church"**. If
your translation reads like the chapter overview, you've made the same
mistake the pipeline used to make.

## CRITICAL — Hash-keyed dict pattern

When writing translations, **NEVER re-type the EN text into a Python
literal**. Always key your translation dict by `hash` from
`translation_miss_only.json`.

```python
# RIGHT (hash from work plan):
T = {
    'd5ffa110661ada40': {  # i-peter 1:6 — read en_text from plan if you need it
        'fr': "...",
        'pt': "...",
        'es': "...",
    },
}

# WRONG (re-typing EN — produces orphan cache entries):
T = {
    "1:6 Wherein—in which prospect of final salvation...": {  # NO!
        'fr': "...",
    },
}
```

The reason: re-typed text inevitably differs by typos, whitespace, or
quote characters; the hash differs; the cache entry never matches any
corpus verse. See Pattern O in `mistakes_to_never_repeat.md`.

## CORPUS_COMMIT bump workflow

After pushing the rebuilt corpus, do NOT:
- `git checkout claude/multilang-commentary` in the user's main worktree
- `git merge` anything into main
- `git cherry-pick` any commit
- Touch the user's `src/constants/corpus.ts` directly

Instead, deliver a **1-line diff** in chat for the user to paste:

```diff
- export const CORPUS_COMMIT = '<old SHA>';
+ export const CORPUS_COMMIT = '<new SHA>';
```

The user has uncommitted work in their main worktree (font migration,
feature work, etc.). Any branch operation risks losing that work. The
1-line diff is zero-risk.

SHA is cumulative: if user is at SHA-A and current is SHA-D (after
intermediate SHA-B, SHA-C), they jump directly to SHA-D. All intermediate
fixes are included. Don't make them apply intermediate bumps.

## R2 migration (future)

Currently the corpus lives at `github.com/sangchy1972/pd-text-corpus` and
is served via `cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@<SHA>/...`.

If migrating to Cloudflare R2:
- Upload `commentary/<lang>/books/<slug>/chapters/<N>.json` files to
  an R2 bucket
- App URL becomes `<bucket>.r2.dev/commentary/<lang>/...` (or custom domain)
- `CORPUS_COMMIT` may be replaced with a path/version param or eliminated
- `src/constants/corpus.ts` would need a new constant for R2 endpoint
- `src/services/bibleService.ts` fetch path needs updating
- AsyncStorage cache key tag must still be invalidated on content update
  (use a version timestamp or hash of the bucket manifest)

This is a separate refactor — keep current GitHub→jsDelivr pipeline
working until R2 path is ready.

## Free resources I have ALREADY downloaded — DO codex need to re-fetch?

Short answer: **YES, all of them, because they were in `/tmp`** which is
volatile on macOS reboot. Run `setup.sh` to re-acquire them all.

| Resource | Origin | Free? | Re-fetch command |
|---|---|---|---|
| sangchy1972/pd-text-corpus | GitHub | free (the user owns it) | `git clone https://github.com/sangchy1972/pd-text-corpus.git` |
| BurritoTruck/fr_tsn (Tyndale FR) | Door43 | CC BY-SA 4.0 | `git clone https://git.door43.org/BurritoTruck/fr_tsn.git` |
| BurritoTruck/pt_tsn (Tyndale PT) | Door43 | CC BY-SA 4.0 | `git clone https://git.door43.org/BurritoTruck/pt_tsn.git` |
| BurritoTruck/es_tsn (Tyndale ES) | Door43 | CC BY-SA 4.0 | `git clone https://git.door43.org/BurritoTruck/es_tsn.git` |
| Tyndale Open Study Notes EN | HelloAO API | CC BY-SA 4.0 | `curl https://bible.helloao.org/api/c/tyndale/<USFM>/<N>.json` (per chapter) |
| JFB commentary | HelloAO API | public domain | `curl https://bible.helloao.org/api/c/jamieson-fausset-brown/<USFM>/<N>.json` |
| Adam Clarke commentary | HelloAO API | public domain | `curl https://bible.helloao.org/api/c/adam-clarke/<USFM>/<N>.json` |
| John Gill commentary | HelloAO API | public domain | `curl https://bible.helloao.org/api/c/john-gill/<USFM>/<N>.json` |
| Matthew Henry commentary | HelloAO API | public domain | `curl https://bible.helloao.org/api/c/matthew-henry/<USFM>/<N>.json` |
| Keil-Delitzsch commentary | HelloAO API | public domain | `curl https://bible.helloao.org/api/c/keil-delitzsch/<USFM>/<N>.json` (OT only) |

Everything above is free and downloadable without authentication. `setup.sh`
in this directory automates the acquisition.

## Where everything will live (after setup.sh runs)

```
~/.commentary_workspace/          ← .gitignored, ~280MB total
├── pd-text-corpus/               ← clone of sangchy1972/pd-text-corpus (the target)
│   ├── commentary/
│   │   ├── en/books/*/chapters/*.json
│   │   ├── fr/books/*/chapters/*.json
│   │   ├── pt/books/*/chapters/*.json
│   │   └── es/books/*/chapters/*.json
│   └── bibles/                   ← KJV + 6 other Bibles (not commentary)
│
├── _tsn_sources/                 ← BurritoTruck Tyndale per-lang translations
│   ├── fr_tsn/ingredients/*.tsv
│   ├── pt_tsn/ingredients/*.tsv
│   └── es_tsn/ingredients/*.tsv
│
└── pd_cache/                     ← downloaded JFB/Clarke/Gill/MH/KD JSON files
    ├── jamieson-fausset-brown_<USFM>_<N>.json
    ├── adam-clarke_<USFM>_<N>.json
    ├── john-gill_<USFM>_<N>.json
    ├── matthew-henry_<USFM>_<N>.json
    └── keil-delitzsch_<USFM>_<N>.json
```

In-repo (permanent, version-controlled):
- `scripts/commentary_cleanup/` — all Python scripts + workdata JSONs
- `scripts/.translation_progress/cache.json` — translation source of truth
- `src/constants/corpus.ts` — CORPUS_COMMIT pin

## Quick start for codex

```bash
# 1. Setup (one-time, ~5-10 min)
cd /Users/liwencao/HerBibleApp
bash scripts/commentary_cleanup/setup.sh

# 2. Verify current state
python3 scripts/commentary_cleanup/full_audit.py

# 3. See remaining translation work
python3 scripts/commentary_cleanup/audit_fallbacks.py

# 4. Pick a round, write translations into a new Python file
#    (template: study /tmp/round1_full.py from history if available, or just
#    start a new file translate_round2.py with the hash-keyed dict pattern)

# 5. Apply + rebuild + push (see "How a translation round works" above)
```

## Coverage snapshot at handoff (corpus SHA d12b307, 2026-05-17)

| Lang | Verse total | Chapter total | Native | EN fallback | Real bugs |
|---|---|---|---|---|---|
| EN | 31,102 / 31,102 ✅ | 1,189 / 1,189 ✅ | 100% | 0 | 0 |
| FR | 31,102 / 31,102 ✅ | 1,189 / 1,189 ✅ | ~78% | 6,830 | 0 |
| PT | 31,102 / 31,102 ✅ | 1,189 / 1,189 ✅ | ~78% | 6,893 | 6 (PT decimal fp) |
| ES | 31,102 / 31,102 ⚠️ | 841 / 1,189 ⚠️ | ~70% | 2,435 | 979 (OT, blocked) |

Remaining translation entries: **~16,066** across FR/PT/ES.
