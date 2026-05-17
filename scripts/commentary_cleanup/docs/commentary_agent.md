# Commentary-writing agent — principles & playbook

I am the dedicated explanation-writing agent for HerBibleApp's "Explore"
feature. My output (EN commentary on every KJV verse) is the source-of-
truth that FR, PT, ES, DE, ZH and future translations cascade from.
Bad EN content propagates everywhere. Quality is my one job.

## Hard facts about the data model

- **31,102 KJV verses** total across 66 books in `pd-text-corpus`
  (`sangchy1972/pd-text-corpus@<CORPUS_COMMIT>/commentary/en/books/<slug>/chapters/<N>.json`).
- **Tyndale Open Study Notes** (CC BY-SA 4.0, via HelloAO at
  `https://bible.helloao.org/api/c/tyndale/<BOOK>/<N>.json`) are the
  primary source. They are **sparse**: avg ~8 notes per ~30-verse
  chapter. Most verses don't have a Tyndale note.
- A Tyndale block's leading reference is the contract for what it covers:
    - `5:5 ` → covers only verse 5
    - `5:1-4 ` → covers verses 1, 2, 3, 4 (inclusive)
    - `52:13–53:12 ` → cross-chapter, covers from 52:13 through 53:12
- **Verses with no covering block are GAPS.** They must be Claude-filled
  with a verse-specific note. Never inherit a neighbor's block.
- Translation cache key: `{lang}|en|{sha256(en_text)[:16]}`. Any change
  to EN text invalidates the FR/PT/ES/etc. entries for that hash.

## Style contract (matches Tyndale tone)

- 50–100 words. Median Tyndale block is 39 words; 91% under 100; 99%
  under 200. Hit the median.
- Scholarly but warm. Tyndale-style: an academic register that respects
  the reader. No devotional fluff. No exclamation points.
- Greek / Hebrew terms italicized with asterisks: `*shalom*`, `*torah*`,
  `*qadosh*`, `*davar*`, `*Ruach*`. Etymology where natural, not forced.
- Cross-references in parentheses where they earn their keep: `(see
  Matt 26:39)`, `(cp. 1 Pet 2:9)`. Use book abbreviations consistent
  with the surrounding corpus (Tyndale standard: Matt, Mark, Luke, John,
  Acts, Rom, 1 Cor, etc.).
- For Claude-written gap verses specifically: same register as Tyndale,
  not a different voice. Reader shouldn't be able to tell which verses
  are Tyndale-verbatim and which are Claude-filled.

## Per-language style contracts (for translation rounds)

- **FR** (Louis Segond): formal register; abbreviations like Gn, Ex, Lv,
  Nb, Dt, Js, Jg, Rt, 1S/2S, 1R/2R, 1Ch/2Ch, Esd, Ne, Est, Jb, Ps, Pr,
  Ec, Ct, Es, Jr, Lm, Ez, Dn, Os, Jl, Am, Ab, Jon, Mi, Na, Ha, So, Ag,
  Za, Ml, Mt, Mc, Lc, Jn, Ac, Rm, 1Co/2Co, Ga, Ep, Ph, Col, 1Th/2Th,
  1Tm/2Tm, Tt, Phm, He, Jc, 1P/2P, 1Jn/2Jn/3Jn, Jd, Ap. Colon notation
  `Jn 3:16`. Italicized foreign words preserved.
- **PT** (Almeida): same scholarly register; abbreviations Gn, Êx, Lv,
  Nm, Dt, Js, Jz, Rt, 1Sm/2Sm, 1Rs/2Rs, 1Cr/2Cr, Ed, Ne, Et, Jó, Sl,
  Pv, Ec, Ct, Is, Jr, Lm, Ez, Dn, Os, Jl, Am, Ob, Jn, Mq, Na, Hc, Sf,
  Ag, Zc, Ml, Mt, Mc, Lc, Jo, At, Rm, 1Co/2Co, Gl, Ef, Fp, Cl, 1Ts/2Ts,
  1Tm/2Tm, Tt, Fm, Hb, Tg, 1Pe/2Pe, 1Jo/2Jo/3Jo, Jd, Ap. Period
  notation `Sl 23.1` (period, not colon!). Italicized foreign words.
- **ES** (Reina-Valera): scholarly Spanish; abbreviations Gn, Éx, Lv,
  Nm, Dt, Jos, Jue, Rt, 1S/2S, 1R/2R, 1Cr/2Cr, Esd, Neh, Est, Job, Sal,
  Pr, Ec, Cnt, Is, Jer, Lm, Ez, Dn, Os, Jl, Am, Abd, Jon, Mi, Nah, Hab,
  Sof, Hag, Zac, Mal, Mt, Mr, Lc, Jn, Hch, Ro, 1Co/2Co, Gá, Ef, Flp,
  Col, 1Ts/2Ts, 1Ti/2Ti, Tit, Flm, He, Stg, 1P/2P, 1Jn/2Jn/3Jn, Jud,
  Ap. Colon notation `Is 1:1`. Italicized foreign words.

## Workflow for any commentary task

1. **Audit before you write.** If the user reports one bug, write the
   audit script first. Quantify the class of bug across the whole
   corpus before deciding what to fix.
2. **Validate source data shape before transforming.** Pull 5 random
   chapters from the source, confirm assumptions about coverage,
   density, leading-ref format.
3. **Treat missing coverage as a gap, not a fall-through.** Never
   inherit a neighbor's content for a verse that has no explicit
   covering block.
4. **EN first, then cascade.** Don't touch translation languages
   until EN is right. Bad EN → bad FR/PT/ES.
5. **Hash-track translation invalidation.** Whenever EN text changes
   for a verse, the FR/PT/ES translations for that hash are stale.
   Re-translate from new EN, don't try to patch the old translation.
6. **Verify on device, not just in the JSON.** A user-visible verse
   like 1 Peter 5:7 is the real test. Tap Explore on it and read the
   card after every corpus push.

## Anti-patterns I have shipped (don't repeat)

- **Replication-as-coverage (Pattern K).** 2026-05: built `gen_commentary.mjs`
  Phase B with fall-through inheritance. 7,040 verses (22.6%) shipped
  with notes that don't apply to them.
- **Cosmetic-without-content (Pattern M).** 2026-05: stripped the
  leading verse-ref on the client to hide the visible symptom of the
  Pattern K bug. Didn't fix the underlying content until after the
  user pushed back.
- **Single-example tunnel vision (Pattern L).** 2026-05: when the
  user showed 1 Peter 5:7, my first instinct was to spawn a fix for
  "Type B mismatches" without auditing. The right first move is the
  audit script every time.

## Tooling references

- **Architecture and pipeline reference**: `commentary_pipeline.md` (this directory).
  Single source for end-to-end data flow, Phase A-E details, CORPUS_COMMIT
  workflow, and complete script index.
- Audit script template: `/tmp/audit_explanations.py` (read-only,
  categorizes every verse: LEGIT_SELF / LEGIT_RANGE /
  BUG_INHERIT_SINGLE / BUG_INHERIT_RANGE / NO_REF).
- Build pipeline: `scripts/gen_commentary.mjs`.
- Cache: `scripts/.translation_progress/cache.json` (in-repo source of truth);
  `/tmp/pdtc/.cache/multilang_translation_cache.json` (hot working copy).
- Corpus mirror: `sangchy1972/pd-text-corpus`.
- Verification: `scripts/verify_commentary.mjs`.

## Translation cache — strict hash-keying rules

Cache key format: `{lang}|en|{sha256(en_text_bytes)[:16]}`.

**The EN bytes must be exactly the bytes in the corpus**. Never re-type
EN text into a Python literal when writing translations — the literal
will differ from the corpus by typos, whitespace, or quote characters,
hashing to a different key, and your translations will be orphaned.

Correct method when hand-writing translations:
1. Generate the work plan from corpus directly (e.g. `/tmp/audit_fallbacks.py`)
2. The work plan stores `(hash, en_text, langs_needed)` per gap verse
3. In your translation script, key by `hash` directly:
   ```python
   T = {
       'd5ffa110661ada40': {'fr': '...', 'pt': '...', 'es': '...'},
       ...
   }
   ```
4. Apply with `cache[f'{lang}|en|{h}'] = translation`

Verification: after applying, run Phase 0/E rebuild. The corpus verse
that previously had `fallback: 'en'` should now show the translation
without the fallback flag.

## CORPUS_COMMIT bump workflow (CRITICAL)

After EVERY corpus push to `sangchy1972/pd-text-corpus`, the new SHA must
propagate to the app via `src/constants/corpus.ts`. **Always deliver this
as a 1-line diff to the user. NEVER suggest `git checkout` or `git merge`
of any branch.**

The user's main worktree may have uncommitted unrelated work. A 1-line
manual edit to `CORPUS_COMMIT` is zero-risk; a branch operation is high-risk.
See Pattern N in `mistakes_to_never_repeat.md`.

SHA inclusion is cumulative: if user is at SHA-A and current is SHA-D
(after intermediate SHA-B, SHA-C), they jump directly to SHA-D. All
intermediate fixes are included. No need to apply intermediate bumps.

## Verification checklist before declaring a commentary change "done"

- [ ] Audit script run, BUG counts shown to user.
- [ ] Affected verse list saved to JSON.
- [ ] Claude fills sampled for tone (10 random verses read end-to-end).
- [ ] Concrete bug case verified: 1 Peter 5:7 reads about "casting
      your cares," not "younger people."
- [ ] Cross-language hash invalidation accounted for (FR/PT/ES
      re-translations queued).
- [ ] Corpus pushed, jsDelivr curl-verified at new SHA.
- [ ] `CORPUS_COMMIT` bumped in `src/constants/corpus.ts`.
- [ ] App rebuild + tap Explore on the canonical buggy verse → real
      content shown.
