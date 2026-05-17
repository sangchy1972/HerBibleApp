# Mistakes to never repeat (HerBibleApp)

A retrospective from the user. Each time I touch this codebase I run through
this checklist BEFORE declaring any change done.

## The 6 self-checks

1. **CDN / URL / slug — curl with the real ID before integrating.**
   Whenever a build script, service, or fetch URL constructs a path from
   data fields, I curl one real example end-to-end before saying done.
   Example: I once built `featured-plans/<lang>/<plan.slug>.json` URLs
   while CDN files were named with the longer filename. Every fetch 404'd.
   A 30-second curl would have caught it.

2. **Layout containers — trace size + pointerEvents through the entire chain.**
   When wrapping a ScrollView, Modal, KeyboardAvoidingView, or any sheet
   in a new container, I trace: parent height? child flex? overflow?
   pointerEvents? Specific traps:
   - ScrollView in a flex parent without its own `flex: 1` collapses to
     content height and silently swallows lower-half taps.
   - KeyboardAvoidingView inside a fixed-height + overflow-hidden sheet
     pushes content out the bottom edge.
   - `absoluteFillObject` overlays size to their parent, not the screen —
     they belong inside `<Modal>` or at the screen root.
   - TabBars must lock layout-affecting values (uniform icon slot size,
     always-rendered indicator with opacity-controlled visibility), or
     row height drifts on tab switches.

3. **Reset shared values / refs at the OPEN boundary, synchronously.**
   `useSharedValue` and `useRef` survive component remounts. If a previous
   close left a value at e.g. 800 (off-screen), the next open's first
   render uses that. Always reset BEFORE flipping the visibility flag:
   ```ts
   const open = () => { dragY.value = 0; setShow(true); };
   ```
   useEffect-based reset runs too late — the entering animation has
   already started by then.

4. **Verify against real data before writing logic that depends on its shape.**
   - Hand-rolled lookup tables (Psalm titles, book codes, category names)
     are wrong more often than right. Write a derive script that walks
     the actual data and emits the table.
   - "I assume all the files share this prefix" — `ls` once.
   - "I assume the upstream is normalized" — `diff` once.
   - "I assume zh-Hant content is actually Traditional" — `grep` once.

5. **Don't conflate signals — confirm the semantic meaning matches the user's intent.**
   Common traps in this repo:
   - `activityDates.has(today)` ≠ "read a chapter today" — it's "opened
     any tab today". Use `readChapters.readToday`.
   - `currentStreak` from PrayerContext is the only authoritative streak
     number. Never hardcode it (was 12 for a long time).
   - `plan.slug` (inside JSON) ≠ filename slug (CDN path / nav routes).
     Always use the filename slug for storage/routing.

6. **For UX numbers, ask once with concrete values — don't iterate "make it bigger / smaller".**
   When the user says "more dramatic", I propose 2-3 specific values via
   AskUserQuestion or in the plan. Saves 3-round adjustment loops.

## Recurring failure modes (root causes underneath)

- **Pattern A (didn't verify data)**: 1, 4 — fixed by running `verify_*.mjs`
  scripts and `derive_*.mjs` scripts before declaring anything done.
- **Pattern B (layout side effects)**: 2 — fixed by always running
  the actual surface end-to-end after a container change.
- **Pattern C (state leakage across mounts)**: 3 — fixed by resetting
  in the open path, not relying on useEffect or close path.
- **Pattern D (wrong signal)**: 5 — fixed by tracing the signal's
  write-site and confirming what it actually represents.

## On writing scripts to verify

The repo's `scripts/verify_*.mjs` family exists for exactly this purpose.
After every data update — corpus, daily verses, plans, versification —
I run them. Listed canonically in
`~/.claude/projects/-Users-liwencao-HerBibleApp/memory/data_pipeline_verification.md`.
Never skip them.

## Additional checks (added after later sessions)

7. **A CTA and its destination must read the SAME field. Trace both.**
   When a small UI element (header chip, tile, badge) navigates to a
   screen showing "the same" data, the two surfaces must read from the
   same context field — not just have the same label. Specific case:
   - Prayer header chip rendered `currentStreak` (active consecutive
     run, returns 0 when today isn't part of an unbroken streak)
   - StreakScreen rendered `totalComplete` (lifetime count of fully-
     completed days)
   - Both labeled "DAY STREAK" → "header shows 0, tap shows 4" looked
     like an animation bug. It was a metric mismatch.
   Before declaring a "matching" UI done: grep both render sites and
   diff the field name being interpolated.

8. **Hardcoded mockup literals survive into production. Grep them out.**
   When wiring a context (Auth, Notes, Saved verses) into a screen,
   grep the screen for hardcoded letters / numbers / strings near the
   binding site. Specific case: PrayerScreen header had a literal
   `<Text>S</Text>` from an early mockup that was never replaced with
   `{initials}` when AuthContext wiring went in elsewhere. The bug only
   surfaced once a real user's initial wasn't S.
   Pattern: any time I add a `useAuth()` / `useFoo()` to a screen, also
   grep that screen for static `[A-Z]`, `[0-9]+`, or quoted strings that
   look like default values. Replace or audit each one.

9. **Expo Go ≠ a real build. Native-text / native-font features need a
   dev build, and I must say so up front.**
   Specific case: I added `fontVariationSettings` (opsz / wght axes for
   Source Serif 4 Variable) without flagging that **Expo Go drops this
   prop silently** — the user reasonably assumed my changes weren't
   working because the font looked identical at every value I tried.
   Anything that touches:
     - `fontVariationSettings`
     - Variable / OpenType axes
     - Custom native modules
     - New Architecture / Fabric-only props
   Needs an upfront note: "this won't show effects in Expo Go; build a
   dev client (`npx expo run:ios`) or production build." Not a
   post-mortem after the user is frustrated.

10. **Component unification can SECRETLY shrink one consumer. List
    every consumer's current dimensions before changing the shared style.**
    Specific case: I unified `GridTile` (`aspectRatio: 1`, ~111 px tall)
    and `NotesTile` (`aspectRatio: 1.25`, ~88 px tall) under a single
    `NotesTile` with `aspectRatio: 1.10` (~101 px) — honoring a "+12 px
    height" ask for the My Notes row. The Learning Bible row that used
    to be a tile gallery in `GridTile` lost ~10 px of height and started
    visually cropping 2-line labels.
    Before unifying components: tabulate every consumer with its current
    width / height / padding / line height. The unified target either
    wins for everyone or you flag the regression explicitly.

11. **When a font HAS the axis you need, use the axis. Don't approximate
    with static props.**
    Specific case: user said body text looks "扁/flat" → I iterated on
    `fontWeight: 400` → `'500'` → back to `'400'` for several turns
    before installing the variable font and using `opsz`. The right
    fix was always the variable axis; static weight changes can't
    replicate optical-size shape adaptation.
    When a complaint touches letter shapes, proportion, or screen-vs-
    print feel, check first whether the font ships an axis (opsz, wdth,
    wght, slnt) and reach for that instead of stacking static styles.
    Adobe / Google Fonts variable fonts almost always have opsz and wght.

12. **`useEffect` guards must be tested at the cold-start hydration boundary.**
    Specific case: `if (pct !== 100) setDisplayedStreak(currentStreak)`
    worked fine when `pct` was transitioning in real-time. But on cold
    start, AsyncStorage hydration finishes after the first render. If
    `pct` was already at 100 the moment hydration arrived, the guard
    blocked the only chance to sync from useState's initial 0 → the real
    value. Display stuck at 0 forever.
    For any "skip sync when X" guard, run the mental simulation:
      - `useState(deps)` runs at first render. Capture: what is `deps`
        when AsyncStorage / network is still empty?
      - Then hydration arrives. Does the guard let the sync through?
      - If the answer is "no, because guard sees the post-hydration state
        and blocks", that's the cold-start hydration bug.
    Replace pct-based guards with refs that track whether the protected
    sequence (e.g., a celebration animation) is *actively running*, not
    whether the steady-state condition is true.

## Recurring failure modes (extended)

- **Pattern E (UI parity drift)**: 7 — fixed by verifying source-of-truth
  field-equivalence whenever a CTA links to a "matching" surface.
- **Pattern F (mockup leftovers)**: 8 — fixed by grepping for hardcoded
  literals when a screen consumes new context state.
- **Pattern G (sandbox-runtime gap)**: 9 — fixed by stating native-feature
  caveats upfront, not after.
- **Pattern H (refactor regressions)**: 10 — fixed by tabulating every
  consumer of a shared style before changing the shared style.
- **Pattern I (axis available, ignored)**: 11 — fixed by checking what
  axes the font actually ships before stacking static `fontWeight` /
  `letterSpacing` workarounds.
- **Pattern J (cold-start hydration)**: 12 — fixed by simulating the
  hydration race in any guard that gates state sync.

13. **Data-source sparseness is NOT data-source coverage. Don't "fill
    forward" with the previous record.**
    Specific case (2026-05): The first `scripts/gen_commentary.mjs` Phase
    B (reshape) used fall-through assignment — for verse N with no
    Tyndale block of its own, copy the previous verse's block. The
    assumption was "Tyndale blocks define their coverage range up to
    the next block." That is **false** for Tyndale Open Study Notes,
    which are intentionally sparse: a block leading with `5:5` only
    discusses verse 5; verses 6, 7, 8 having no own block means Tyndale
    has nothing to say about them, NOT that 5:5 covers them.
    Result: 7,040 verses (22.6% of 31,102) shipped with notes that
    don't apply to them — the canonical case being 1 Peter 5:7
    ("Casting all your care upon him") receiving a note about
    "younger people in the church."
    The bug is invisible at build time because every verse has *some*
    text. The mismatch is visible only when the leading verse-ref is
    rendered ("EXPLANATION 5:5 …" on verse 7), which the user spotted
    on the device.

    **Three lessons:**
    a. **Validate the source's data model before transforming it.**
       Before building Phase B, fetch 5 random chapters from HelloAO
       and confirm whether Tyndale's per-verse notes are exhaustive
       (every verse has one) or sparse (only some verses have one).
       I assumed exhaustive. The reality is sparse — average 8 notes
       per chapter of ~30 verses.
    b. **The correct assignment rule is "verse N is covered iff N is
       explicitly inside the block's leading-ref range."** Single-verse
       refs (`5:5`) cover only that verse. Hyphen/dash range refs
       (`5:1-4`, `5:5-11`, `10:1–12:13`) cover the inclusive range.
       Verses with no covering block are GAPS to be Claude-filled, not
       inherited from a neighbor.
    c. **Errors in the source-of-truth language cascade.** FR, PT,
       ES were all translated from the (buggy) EN content. Fixing
       only EN leaves FR/PT/ES still wrong for those 7,040 verses.
       Every fix to source data triggers a re-translation cascade for
       every downstream language. Budget for that up front, not after.

14. **When the user reports a single concrete instance, the question to
    ask is "how widespread is this class?" — not "let me just fix that
    one."**
    Specific case (2026-05): User screenshot showed 1 Peter 5:7 with
    a 5:5 note. My first reflex was to spawn a fix for "Type B
    mismatches" without quantifying. A 30-second audit script found
    7,040 affected verses across 22.6% of the corpus and a clear root
    cause (Pattern K). The right first move was always the audit.

15. **Cosmetic regex strips on the client can paper over a real data
    bug. Don't ship the cosmetic fix without flagging the underlying
    fix as still-needed.**
    Specific case (2026-05, commit `8b45488`): I stripped the leading
    verse-ref from the Explore card render so users wouldn't see
    "5:5" on verse 7. Even after the strip, the *content* of verse
    7's card is still about "younger people," which has nothing to do
    with "casting your cares." The cosmetic fix is fine as a partial
    band-aid, but it MUST land alongside (or before) the content fix,
    not in place of it.

## Recurring failure modes (extended further)

- **Pattern K (source-sparseness misread as source-coverage)**: 13 —
  fixed by inspecting the source's actual data model before writing
  transformation code, and treating non-explicit coverage as gaps.
- **Pattern L (single-instance reflex)**: 14 — fixed by writing the
  audit script first, even when the user shows you only one example.
- **Pattern M (cosmetic over content)**: 15 — fixed by always pairing
  a UI-layer regex/strip with the corresponding data-layer fix and
  flagging the gap explicitly.

16. **Never recommend `git checkout <branch>` / `git merge <branch>`
    without first checking (a) the worktree state, and (b) the
    divergence size between the user's current branch and the target.**

    Specific case (2026-05): I pushed two surgical fixes
    (`8b45488` client regex strip + `166145d` CORPUS_COMMIT bump =
    11 net lines across 2 files) to `claude/multilang-commentary`. When
    the user reported the app still showed the old content, I told them
    to either `git checkout claude/multilang-commentary` or `git merge`
    that branch into `main` and rebuild. Both were terrible advice:

    a. The user's working tree on the main worktree had **75 modified
       files / 13k uncommitted lines** of unrelated work in flight
       (Lato → Lora font migration). `git checkout` of another branch
       would either refuse or risk losing it.
    b. `claude/multilang-commentary` had **101 commits ahead** of the
       branch the user was building from, most of them ES translation
       data commits (`r19a..r19f`) entirely unrelated to the bug fix.
       Merging would drag the whole campaign into their working tree.

    The user had to ask another agent for the right fix: **cherry-pick
    only the 2 bug-fix commits**, or even better — **manually re-apply
    the ~11 lines of diff directly to their current working tree**, no
    git operations at all. That's three lines of `Edit` calls, zero
    risk to their in-flight work.

    **Lessons:**
    a. **Before suggesting any branch op, run `git status` in their
       cwd.** If they have uncommitted work, the only safe advice for
       a small targeted fix is "manually apply this diff." Branch ops
       force a choice between losing their work and not getting the
       fix; manual diff avoids the choice entirely.
    b. **Before suggesting `git merge`, run `git log --oneline
       <target>..<source>` and read the count.** If >5-10 unrelated
       commits, you must say "cherry-pick these specific SHAs" — never
       "just merge."
    c. **For ≤ 20-line fixes, the default recommendation is manual
       re-application.** Git workflows are for bigger changes or
       changes the user owns. A 2-file 11-line fix that *I* introduced
       should be delivered to the user as a patch they paste, not a
       branch operation they perform.
    d. **"Just checkout the branch" is never a one-step instruction.**
       It assumes a clean tree, no in-flight work, no divergence
       concerns. None of those are safe to assume.

17. **Translation cache keys must be hash-of-actual-corpus-bytes, not
    hash-of-re-typed-text.** When hand-writing translations, do not put EN
    text in Python literals — the literal differs from corpus (typos,
    whitespace drift, quote normalization) and hashes to a different key,
    creating orphan cache entries that Phase E will never use.

    Specific case (2026-05-17): Wrote 16 demo translations for 1 Peter
    1:6 / 1:8 / 1:21 / 2:1 / 2:10 / 2:15 by copying EN text from a
    truncated terminal output into Python `"..."` literals. The literals
    were SHORTER than the actual corpus EN (truncated at 140 chars) and
    contained a typo (`(1 Pet 1:5)` vs corpus's `(1 Pet 1:9)`). Hash of
    my literal: `d5ffa110661ada40`. Hash of corpus text: `2c6322575bdde8fc`.
    The 16 cache entries are now permanent orphans — they'll never match
    any corpus verse's hash, so Phase E never picks them up.

    **The fix**:
    a. Generate work plan from corpus directly (`/tmp/audit_fallbacks.py`)
    b. Each work-plan entry has `(hash, en_text, langs_needed)`
    c. In translation script, key dict by `hash` from the work plan
       (don't re-type EN, the hash is already correct)
    d. Apply: `cache[f'{lang}|en|{h}'] = translation_text`

    Verify after a small batch: run Phase 0/E rebuild and curl the
    affected verse from CDN; the verse should show the translation, not
    EN fallback.

18. **Translation auditing requires methodology-fit, not just one query.**
    A single audit heuristic can lie. Use multiple complementary checks
    that fail for different reasons; if they all agree, trust the count.

    Specific case (2026-05-17): Audited FR/PT/ES for Pattern K bugs.
    - v1 (leading-ref match): missed bugs because translations dropped
      the "5:5 " prefix. Reported 0 bugs in FR.
    - v2 (text-duplication cluster): over-counted because legit range
      notes (`5:1-4` applied to 4 verses) registered as duplicates.
      Reported 5,960 bugs in FR.
    - v3 (TSV ground truth): under-counted because corpus text is
      paraphrased during translation, no longer matching raw TSV.
      Reported 0 bugs in FR.
    - v4 (re-run Phase B with corrected logic): the only reliable
      method. Reported 3,595 gaps in FR.

    Lesson: for translation alignment audits, the ground truth is "what
    would corrected Phase B produce" — not surface text patterns. If
    your audit assumes the leading verse-ref is preserved, you'll miss
    half the corpus. If your audit assumes corpus text == TSV text,
    you'll fail at all translated verses. Re-build with corrected logic
    and diff.

19. **The CORPUS_COMMIT bump is a 1-line user task, not a git workflow.**
    See Pattern N (#16). After every push to `sangchy1972/pd-text-corpus`,
    deliver the bump as a 1-line diff in the chat. The user's main
    worktree may have many uncommitted files (their in-flight feature
    work). Never recommend `git checkout`, `git merge`, or `git cherry-pick`
    that would touch their working tree. Just paste the diff:

    ```diff
    - export const CORPUS_COMMIT = '<old SHA>';
    + export const CORPUS_COMMIT = '<new SHA>';
    ```

    The user pastes it themselves. Zero risk to their in-flight work.

20. **Cumulative SHA inclusion: never make the user apply intermediate
    bumps.** Each pushed SHA includes all changes from prior SHAs (it's
    just the chain of git commits). If user is at SHA-A and current is
    SHA-D, deliver the diff from A→D directly. Do not say "first bump to
    B, then to C, then to D" — that's three diffs for no reason.

## Recurring failure modes (further extended)

- **Pattern O (orphan cache entries from re-typed source)**: 17 — fixed by
  always keying dicts by hash (read from work plan), never re-typing EN
  text into Python literals.
- **Pattern P (audit methodology mismatch)**: 18 — fixed by using multiple
  complementary audit methods, treating "what corrected pipeline would
  produce" as the ground truth, and re-building with new logic when surface
  text comparison fails.
- **Pattern Q (forced git workflow on user)**: 19, 20 — fixed by always
  delivering bumps as 1-line diffs, jumping directly to the latest SHA.

## Commentary-writing agent: dedicated principles

When acting as the "explanation-writing agent" for this project:

- The commentary corpus is the source-of-truth in EN. FR, PT, ES, DE,
  ZH etc. are derived. **EN correctness gates everything downstream.**
- Tyndale Open Study Notes (CC BY-SA 4.0) are the primary content
  source. Tyndale notes are sparse per chapter — average ~8 notes
  per 30-verse chapter. The rest are gaps requiring Claude fill.
- Tyndale leading refs are the contract: `5:5 ` covers only verse 5;
  `5:1-4 ` covers verses 1-4; `10:1–12:13 ` covers from chapter 10
  verse 1 through chapter 12 verse 13. Never extrapolate beyond the
  stated range.
- Claude fills should match Tyndale tone: scholarly but warm; ~50-100
  words; Greek/Hebrew terms italicized; cross-references included;
  no devotional fluff that contradicts academic register.
- Verse-content correctness is verified by **reading the KJV text and
  the candidate explanation side-by-side and asking: does this
  explanation actually discuss what this verse says?** If the answer
  is no, it's a bug regardless of provenance.
- Per-verse hash (sha256(en_text)[:16]) is the cache key for
  translations. Any EN content change invalidates the FR/PT/ES
  translation for that hash and requires re-translation from the
  new content.
