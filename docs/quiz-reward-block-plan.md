# Quiz reward block — likes, analytics, collection, dashboard

Plan only. Grounded in code as of this writing; every claim cites a file.

---

## A. State model

### A1. Likes — both, and the local copy is authoritative

A like is a **local preference first** (the heart must render filled offline, on
launch, before Firebase exists — `services/firebase.ts:11-20` runs in no-op mode on
any build without the native module) and an **analytics event second**. Analytics can
never be read back into the app, so it cannot be the store.

New key, separate from the card record:

```ts
// AsyncStorage: quiz:card-likes:v1
{ v: 1, liked: string[] }   // card ids, sorted
```

Why a second key rather than a `liked` field inside `quiz:cards:v1`: `QuizContext.tsx:20-25`
states the repo's split rule — keys are split by write frequency and by cost of loss.
`collected` is written ~1× per 3 sets and must never be lost; `liked` is written on
every heart tap and losing it costs a heart icon. Cost of the split: two writes, two
mergers, two hydration reads.

**MERGERS entries** (`services/progressMerge.ts:151-185`):

| Key | Merger | Reason |
|---|---|---|
| `quiz:cards:v1` | new `mergeCardProgress` — `collected` union, `drawsTaken` max, `pendingDraw` OR | Union is the only strategy that can't delete a card she holds; max on `drawsTaken` keeps the deterministic spread from rewinding (`state/cardDraw.ts:81-97`). |
| `quiz:card-likes:v1` | `unionStringArray` (exists, `progressMerge.ts:53-57`) | Reuse verbatim; a like is monotone in practice. |

**What breaks on a cloud restore — three things, in severity order:**

1. **`quiz:progress:v1` is not in `MERGERS` at all.** Grep confirms it appears only in
   `QuizContext.tsx:32`. The whole quiz ladder — sets, perfect sets, puzzle tiles —
   is lost on reinstall today. Shipping card sync without fixing this produces a
   restored device holding 12 cards at Level 1. Fix needs a per-field max merger
   (`setIndex`/`completedSets`/`perfectSets`/`totalCorrect` max, `lastCompletedYmd`
   latest) — not `preferLocal`, which would let an empty fresh install win.
2. **Union means an unlike can be resurrected.** Device A unlikes, device B's snapshot
   still lists the id, restore re-likes it. The alternative — `{id: {at, un?}}` with
   last-write-wins — needs a timestamp on every tap and a tombstone for every unlike.
   Recommend accepting the union; it is the same tradeoff already accepted and
   documented for `achievements:seen:v1` (`progressMerge.ts:164-171`).
3. **`drawsTaken` max + `collected` union can desync.** Two devices each draw once
   from the same seed: union gives 2 collected, max gives 1 draw. Harmless (the next
   spread is computed from `drawsTaken`, and `availableIndexes` already excludes both),
   but `parseCardProgress` (`cardDraw.ts:182`) must keep its `drawsTaken >= 0` guard
   rather than asserting `drawsTaken >= collected.length`.

**Do not persist share/save.** Nothing in the UI renders "you shared this". A third
key plus a merger for zero pixels. If the owner later wants a "shared" pip, add it then.

---

## B. Analytics

Repo conventions, from actual call sites: snake_case names, `quiz_`-prefixed for quiz
internals (`QuizContext.tsx:199,222,232`), and the GA4 recommended `share` event with
`{content_type, item_id, method}` for every shareable
(`ShareVerseSheet.tsx:192,253`; `AchievementUnlockSheet.tsx:143,158` — note `method:'save'`
for save-to-album).

| Event | Params | Notes |
|---|---|---|
| `card_like` | `card_id` (str, 40 vals), `card_theme` (str, 10 vals), `source` ('draw'\|'collection') | |
| `card_unlike` | same | Separate event, not `liked: 0`. The console's Events list shows raw counts; a combined event forces every glance through a filter. Costs 1 of 500 event-name slots. |
| `share` | `content_type: 'mystery_card'`, `item_id: <card_id>`, `method: 'system'\|'save'` | Keeps one cross-content share funnel. |
| `card_share` | `card_id`, `card_theme`, `method` | Duplicate on purpose — `item_id` on the shared `share` event is polluted by unbounded verse references (`ShareVerseSheet.tsx:192`), so theme breakdown is unreadable there. **Do not sum both or shares double-count.** |
| `card_open` | `card_id`, `card_theme`, `source` | Without it there is no way to know a collected card was ever re-read. |

**Firebase limits that bind here:** event name ≤40 chars, ≤25 params/event, param name
≤40 chars, string value ≤100 chars, 500 distinct event names/app. All fine. The real
constraint is reporting: **a text parameter is invisible in the console until it is
registered as a custom dimension** (cap 50 text + 50 numeric per property), and
high-cardinality dimensions get bucketed into `(other)`.

So: `card_theme` (10 values) is the one that works everywhere and should be registered
first — it is also the parameter that answers the owner's actual question, *what is she
going through*. `card_id` at 40 values is queryable but only in Explorations, and only
after registration; it burns a dimension slot.

Add one **user property** (`setUserProps`, `services/firebase.ts:47-49`, names ≤24 chars,
values ≤36): `cards_liked_bucket` = `'0'|'1-3'|'4-9'|'10+'`. Without it there is no way
to ask "what fraction of users like any card", because GA4 counts events, not users
holding state.

**Owner will be able to answer:** likes/day; theme ranking for likes, shares, opens;
like rate per draw (`card_like` ÷ draws); share-vs-save split; whether liked cards get
re-opened. **Will not:** which cards a *named user* likes (GA4 is not a per-user store —
verify whether BigQuery export is on; if not, nothing gives you row-level data); a
full top-40 ranking in a standard report; anything retroactive before ship.

---

## C. Card collection surface

**Own screen, `CardCollection`.** Not a section of `PuzzleCollectionScreen`: that file's
header comment (`PuzzleCollectionScreen.tsx:17-19`) is explicit that *nothing there is
stored, everything is derived from `completedSets`*. Bolting on a stored, likeable,
filterable 40-item list destroys that invariant and the reason the screen is trivially
correct. Cost of a separate screen: one route, one more Profile tile.

**Browsing: a vertical list of strips, not a grid.** ⚠️ The spec (§6) assumes a title —
"title + theme dot". **`MysteryCard` has no title field** (`constants/mysteryCards.ts:77-85`:
`id`, `theme`, `ref`, `body`). Adding one means 40 strings × 7 languages *and* contradicts
the card's design premise that the body must stand completely alone with no title and no
reference (`mysteryCards.ts:19-31`). Recommend: strip = theme dot + theme label + first
line of `body` truncated to 2 lines. No new content, no new translation work.

**Locked slots: agree with the spec, do not show them** (`docs/mystery-cards-spec.md:191-194`).
Its reason — a gift reframed as a checklist — is right, and I'd add a stronger one: this
content is comfort written for someone in distress, and 37 grey rectangles are 37
reminders of what she didn't get. A single "3 of 40 collected" line carries the same
progress signal at no emotional cost.

**Filtering: earn it.** Median collection after two months is single digits. A 10-chip
theme filter over 4 items is theatre. Rule: no filter until `collected.length >= 12`,
then group by theme with section headers; show a "Liked" toggle only once
`liked.length >= 1`. Both conditions are derivable, no config.

**Detail view:** full-bleed card (same art component as the draw overlay), heart, share,
save. Reuse `captureRef → jpg @0.8 → Sharing.shareAsync` and
`MediaLibrary.saveToLibraryAsync` **with no permission request**
(`ShareVerseSheet.tsx:144-153, 218-236` — the comment there explains that requesting
READ_MEDIA_IMAGES gets rejected by Google Play's photo policy). New component
`MysteryCardArt`, mirroring `VerseCardArt`'s HER BIBLE footer.

---

## D. Quiz progress dashboard

**Available**, from `QuizProgressV1` (`quizProgress.ts:13-30`) + `CardProgressV1`
(`cardDraw.ts:50-66`) + `QUIZ_ART`:

- level (`levelFor`), completedSets, perfectSets, totalCorrect, setIndex, lastCompletedYmd
- questions answered = `completedSets × SET_SIZE`
- first-pass accuracy = `totalCorrect ÷ (completedSets × SET_SIZE)`
- perfect-set rate = `perfectSets ÷ completedSets`
- bank coverage = `setIndex × SET_SIZE ÷ bank.length` (bank is on the context)
- puzzle: `completedPaintings`, `tilesUnlocked`, `outOfArt` (`puzzleView`, `quizProgress.ts:59`)
- draws until next card (`mysteryView`), cards collected, cards liked

**Not derivable — do not promise these:**

- **Any time series.** Only `lastCompletedYmd`, a single string (`quizProgress.ts:29`).
  No streak, no "this week", no calendar, no trend. Would need a new
  `quiz:dates:v1` array + a `unionStringArray` merger — the exact shape of
  `readChapters:dates:v1` / `activity:dates` (`progressMerge.ts:160-162`). It cannot be
  backfilled, so any chart is blank for weeks on existing installs.
- **Per-theme / per-book accuracy.** The session is discarded at commit
  (`QuizContext.tsx:241` returns `null`); only aggregate counters survive. Which
  questions she missed is gone and is not reconstructable.
- **Time per question, retry counts.** `quiz_retry_round` goes to Firebase only
  (`QuizContext.tsx:222`); nothing local.
- **Accuracy trend.** Lifetime totals only; the derivative is unrecoverable.

**Vanity metrics to refuse:** `totalCorrect` as a hero number (monotone, and it is
mostly just `completedSets × 5` — it tells her nothing); repeating Level as the hero
when the home card already shows it (`QuizChallengeCard.tsx:72`).

**Layout** (`QuizProgress` screen, BG, `P` padding, adaptive):

1. Hero row, 3 stat cards reusing ProfileScreen's `statCard` rhythm: **Sets completed**,
   **First-pass accuracy** with the denominator spelled out beneath, **Cards collected**.
2. One quiet line: "N perfect sets — finished 5/5 with no retry." Label it, or the
   number is meaningless.
3. Bank coverage as a thin bar: "You've seen 140 of 327 questions." Answers the only
   question she actually asks about a quiz.
4. `MysteryRewardBar` (existing) — draws until the next card.
5. Two rows: puzzle strip → `PuzzleCollection`, cards strip → `CardCollection`.

Five numbers. No chart until `quiz:dates:v1` has data.

---

## E. Navigation / IA

**Recommend three routes, two Profile entries, home medal unchanged.**

- Profile tile "Quiz Progress" → `QuizProgress`
- Profile tile "My Cards" → `CardCollection`
- `QuizProgress` band → `PuzzleCollection` (existing route)
- Home medal (`QuizChallengeCard.tsx:53-64`) → `PuzzleCollection`, **unchanged**

Against the one-screen-with-tabs alternative: `PuzzleCollectionScreen` owns its own
close button and title (`:48-58`), so making it a tab pane means rewriting its chrome
and giving the puzzle a worse deep link than it has today; and top tabs inside a screen
reached from a Profile row is two levels of navigation chrome for three items. The
medal is a *medal* — it means art. Repointing it at a numbers dashboard breaks a shipped
affordance for nothing.

Tiles go in the existing `notesRow` pattern (`ProfileScreen.tsx:749-755`, `NotesTile`
from `components/ProfileTiles.tsx:47`) under a new "Learning Bible" section header,
matching `sectionTitle` at `ProfileScreen.tsx:748`.

---

## F. Build order

```
1 likes state ──┬─► 3 QuizContext wiring ──┬─► 5 draw overlay like button
2 MERGERS ──────┘                          ├─► 6 CardCollection + detail
                                           ├─► 7 QuizProgress screen
                                           └─► 8 Profile tiles + routes
                                4 analytics helper ─► 5,6
                                           9 MysteryCardArt ─► 6 (share/save)
                              0 quiz:progress:v1 merger  (independent, do first)
```

| Step | Reviewer checks |
|---|---|
| 0 ladder merger | `mergeSnapshots` test: empty local + populated remote restores the ladder; two devices take the max, not the last write. |
| 1 likes state | Pure module + tests: parse of garbage returns empty, never throws; toggle is idempotent; sorted output so the union merger is stable. |
| 2 MERGERS | Both new keys present in `BACKUP_KEYS`; malformed side never wins (the `jsonMerger` fallback, `progressMerge.ts:24-33`). |
| 3 context | `hydrated.current` guard before any write (`QuizContext.tsx:83, 162-171`) — an un-hydrated write erases likes. |
| 4 analytics | Every param ≤100 chars; no `logEvent` on a render path; `card_theme` present on every card event. |
| 5 overlay | Heart state survives a re-open; tapping it does not consume the draw or cancel the animation; `pendingDraw` untouched. |
| 6 collection | Empty state has no grey slots; strip truncation holds on SE and on zh-Hans; save works with no media permission prompt on Android 13. |
| 7 dashboard | Every number recomputed from context, nothing stored; division guarded at `completedSets === 0`. |
| 8 nav | Deep-link params typed in `navigation/types.ts:29-60`; home medal still lands on the puzzle. |
| all | `npx tsc --noEmit` + `npm test` green. |

---

## G. Open questions for the owner

1. **Fix `quiz:progress:v1` sync in this block, or ship knowingly?** Right now a
   reinstall wipes the quiz ladder. If cards sync and the ladder doesn't, a restored
   device shows a full card collection at Level 1.
2. **Is BigQuery export enabled on `herbible-d1cc7`?** If not, per-card ranking depends
   entirely on registering `card_id` as a custom dimension (40 values, one of 50 slots),
   and there is no row-level fallback.
3. **Accept union-merge on likes** (an unlike can come back after a two-device restore),
   or pay for timestamps + tombstones?
4. **Add `quiz:dates:v1` now?** It is the only way to ever chart activity, costs one
   line per completion — but it starts empty, so any chart is blank for existing users
   for weeks.
5. **Card strips with no title** — accept a truncated first line, or commission 40
   titles × 7 languages against the card's own "no title, no reference" rule?
