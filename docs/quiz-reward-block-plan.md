# Quiz reward block — likes, analytics, collection, dashboard

Plan only. Grounded in code as of 2026-08-02 — the quiz block has been substantially
reworked since (24 curated paintings, a 3-set daily cap, retirement at bank
exhaustion), so treat every line-number citation below as approximate and the
file references as authoritative. Grounded in code as of this writing; every claim cites a file.

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

1. ~~**`quiz:progress:v1` is not in `MERGERS` at all.**~~ **FIXED** — `progressMerge.ts` now maps it to `mergeQuizProgress`. Original finding: Grep confirms it appears only in
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

### A2. Daily history — the only way any chart is ever possible

**Decided: build it.** Nothing today records WHEN she answered — `quizProgress.ts:29`
stores `lastCompletedYmd`, one string. Without a new key there is no streak, no week,
no trend, ever.

```ts
// AsyncStorage: quiz:dates:v1
{ v: 1, days: Array<{ ymd: string; sets: number; questions: number; firstPassWrong: number }> }
```

Appended once per completed set, in `applyCompletion`'s caller. Capped at the **last 180
days** — a bounded array is a fixed memory and merge cost, and no chart in this app looks
back further.

Storing per-day counters rather than a bare date array (the shape used by
`readChapters:dates:v1` / `activity:dates`, `progressMerge.ts:160-162`) is the difference
between "she was active" and "she did 3 sets and missed 2" — the second is worth the extra
three integers, and re-deriving it later is impossible.

**Merger: union by `ymd`, MAX per field.** Not sum. Sum looks more correct for two
devices used on the same day, and corrupts every ordinary restore by double-counting the
same day twice. Max can only under-count the rare same-day-two-device case; sum
mis-counts always. Choose the failure that is rare and small.

⚠️ **It starts empty and cannot be backfilled.** Every existing install shows a blank
chart until she plays again. Ship the dashboard's numeric cards immediately and gate only
the chart on `days.length >= 7`, or the first thing she sees is an empty graph.

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
| `card_collect` | `card_id`, `card_theme` | **The funnel base — owner's call, and it is the right one.** Without it no rate is computable: likes/day is a raw number, likes ÷ collects is a behaviour. Fires once per draw, at the moment she taps a card. |
| `card_open` | `card_id`, `card_theme`, `source` ('collection') | Re-reads from the collection. Not framed as a funnel step — it is a separate question ("does she come back to them"), not a stage between collect and like. |
| `card_like` | `card_id`, `card_theme`, `source` ('draw'\|'collection') | **No `card_unlike`.** Not liking emits nothing; that is what "no signal" should look like. See the UI note below. |
| `share` | `content_type: 'mystery_card'`, `item_id: <card_id>`, `method: 'system'\|'save'`, **`card_theme`** | The EXISTING GA4 recommended event (`ShareVerseSheet.tsx:192,253`; `AchievementUnlockSheet.tsx:143,158`), reused with a new `content_type` value — no new event name. Save-to-album is `method:'save'`, exactly as the badge sheet already does it. |

**Revised from the first draft: no separate `card_share`.** The original reason for
duplicating it was that `item_id` on the shared `share` event is polluted by unbounded
verse references, so a theme breakdown is unreadable. Adding `card_theme` as an extra
param on `share` solves that without a second event — filter `share` by
`content_type = mystery_card`, break down by `card_theme`. This removes the
double-counting trap the duplicate created, and one event name instead of two.

**Like is a one-way signal, but a two-way control.** Analytics only ever sees a like.
The heart still toggles locally, because a mis-tap she cannot undo is a worse experience
than a slightly inflated like count — and un-liking emits nothing, so the console still
shows only positive intent. Consequence to accept: lifetime `card_like` events can
exceed the number of currently-liked cards. That is correct; they measure different
things.

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

**Owner will be able to answer:** the funnel — collected → liked, collected → shared,
collected → re-opened, each as a RATE rather than a raw count, because `card_collect`
sits underneath all of them; theme ranking on every stage; share-vs-save split. **Will not:** which cards a *named user* likes (GA4 is not a per-user store —
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

- ~~Any time series.~~ **Now available** via `quiz:dates:v1` (§A2): daily sets, daily
  questions, daily first-pass misses, and therefore streak, last-7-days, last-30-days,
  and an accuracy trend at day granularity. ⚠️ Empty on every existing install until she
  plays again — gate the chart on `days.length >= 7`.
- **Per-theme / per-book accuracy.** The session is discarded at commit
  (`QuizContext.tsx:241` returns `null`); only aggregate counters survive. Which
  questions she missed is gone and is not reconstructable.
- **Time per question, retry counts.** `quiz_retry_round` goes to Firebase only
  (`QuizContext.tsx:222`); nothing local.
- **Accuracy trend before this ships.** Day-level accuracy exists from `quiz:dates:v1`
  onward, but the history has no past — the curve starts the day she next plays.

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
5. **Activity, last 30 days** — a small bar per day, sets completed. Gated on
   `days.length >= 7`; below that the band is absent, not an empty axis.
6. Two rows: puzzle strip → `PuzzleCollection`, cards strip → `CardCollection`.

Five numbers and one chart. The chart is the only thing here she cannot already see
somewhere else in the app.

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

1. ~~Fix `quiz:progress:v1` sync?~~ **DONE** — merged with a per-field max merger, plus
   `quiz:cards:v1`, both with tests.
2. **Is BigQuery export enabled on `herbible-d1cc7`?** If not, per-card ranking depends
   entirely on registering `card_id` as a custom dimension (40 values, one of 50 slots),
   and there is no row-level fallback.
3. **Accept union-merge on likes** (an unlike can come back after a two-device restore),
   or pay for timestamps + tombstones?
4. ~~Add `quiz:dates:v1`?~~ **DECIDED: yes**, with per-day counters rather than a bare
   date array. See §A2.
5. ~~Card strips with no title?~~ **DECIDED: no titles.** Strips show a truncated first
   line. `theme` stays a backend-only field — used for analytics breakdown and for
   grouping once the collection is large enough, never shown as a label she reads.
