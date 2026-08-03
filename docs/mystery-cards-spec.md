# Mystery Cards — design spec

The reward behind the "mystery reward" counter in the Quiz Challenge. Every
`MYSTERY_EVERY` (3) completed sets, the user draws one card from a face-down
2×2 spread. The card flips and speaks to her.

Status: copy **final** and shipped in `src/constants/mysteryCards.ts` (40 cards,
en + zh-Hans). Draw logic **built** (`src/state/cardDraw.ts`). UI **not built**.

---

## 1. Content model

A card is our own writing in God's first person, anchored to a passage. It is
not a Bible quote, and **no reference is ever shown**.

```ts
interface MysteryCard {
  id: string;        // 'weary-2' — stable, durable, never reused
  theme: CardTheme;  // one of 10 concerns. BACKEND ONLY — never rendered
  ref: string;       // internal provenance ONLY — never rendered
  body: Partial<Record<LanguageCode, string>>;   // 27-48 words / 38-65 汉字
}
```

### The formula

REVISED after the first draft was rejected as *too poetic*. That draft wrote
beautiful sentences about God; it did not answer her.

1. **State her problem as a fact.** Not "Are you feeling…?" — the card assumes
   it already knows and says it out loud, so she reads line one and thinks
   *that's me*. Interrogating her makes her do the work.
2. **God answers immediately and plainly.** "I know." "I heard you." "I am."
3. **One concrete thing. Stop.** Cut every ornamental word.

> 什么事都是找你。你处理,你收拾,别人忘掉的你都记得,可没人问你怎么样。**我问你。**过来坐下。在我这儿,你不用有用。

### Why no reference is printed

Two arguments pointed opposite ways and the second won.

*For printing it:* software inventing divine speech reads as presumption to a
meaningful share of readers, and a citation makes every line answerable.

*Against, and decisive:* the words are **ours**, not the verse's. A citation
under them claims they ARE that passage — misattributing our prose to
scripture, which is its own misrepresentation and a worse one.

So `ref` survives as internal provenance: it is how a reviewer judges whether a
line stands up, and it is why no two cards say the same thing. It is never
rendered, on the card or on the share image.

**The cost is that every line must stand completely alone.** She gets one
sentence and nothing else — no title, no reference, no context. A line that
only works if you know the passage behind it has failed.

### Why original prose rather than the verse text

**Licensing.** KJV is public domain, but the modern translations this app uses
for zh-Hans, zh-Hant, de, fr, es and pt are under copyright. Shipping their
verse text inside a bundled constant is a rights problem in six of seven
languages.

### The 10 themes are concerns, not moods

Each is something she actually thinks, phrased as she would phrase it.

| Theme | Her words |
|---|---|
| `doubt` | Does God even exist? |
| `unanswered` | I prayed and got nothing back |
| `lost` | I don't know what to choose |
| `weary` | I'm too tired to keep going |
| `afraid` | I'm frightened |
| `alone` | Nobody actually cares |
| `unworthy` | I've done too much wrong |
| `broken` | I'm hurt and can't get past it |
| `lack` | No money, no help, nothing |
| `hopeless` | I can't see a future |

`unworthy` — shame and guilt — was missing entirely from the first draft, and
it is one of the most common things this audience carries.

### Editorial rules, enforced by `__tests__/mysteryCards.test.ts`

- 27–48 English words / 38–65 汉字. The card is landscape and the type is fixed.
- **No promise of a specific outcome.** An owner-written line closing with
  *"keep going and I'll give you what you want"* was corrected to promise
  company instead. When the thing does not come, the first version is a broken
  promise from God, sitting in her hand. `lack` is where this drifts.
- `broken` speaks to grief and heartbreak **only** — never symptoms, illness or
  cure, so no card can be read as a reason to delay medical care.
- No exclamation marks. No interrogative openers.
- Chinese is **written in Chinese**, not translated, and never uses the words
  for God as the subject of his own speech — that is third-person
  self-reference and the voice collapses instantly. The one exception quotes
  *her* question back at her.
- No bulletin register (恩典满溢 / 交托仰望 / 靠主刚强 …). It has to sound like
  someone talking to her at 1am.

### ⚠️ Card ids are durable

`collected` stores ids. Renaming or removing one silently empties part of a
user's collection. **Append only.** Same rule as `QUIZ_ART`.

---

## 2. Draw mechanics

### Pool size: 40

| | |
|---|---|
| Draw every | 3 sets (`MYSTERY_EVERY`) |
| Sets per bank cycle | 65 (327 questions ÷ 5) |
| Draws per bank cycle | ~21 |
| Draws to exhaust a 40-card pool | 40 → **120 sets** |

She meets a repeated *question* long before a repeated *card* — which is the
right way round, since the card is the reward.

40 × 7 languages = 280 strings. Deliberately not 100: every card has to be
good, and this is content nobody can skim past.

### The choice is real

Four **distinct** cards are laid face down; whichever she taps is the one she
keeps. The other three are not consumed — they return to the pool and may
appear as candidates again.

Consuming all four would burn the pool at 4× and cap the feature at 10 draws.

### Deterministic candidates — the anti-reroll property

Candidates for draw *N* are derived from `mulberry32(CARD_SEED + N)` over the
uncollected pool, exactly the technique in `services/quizSets.ts`.

This is not just for tidiness. If candidates were random per render, force-
quitting the app mid-draw would reshuffle them — so a user who wanted a
different card could reroll indefinitely, and the "choice" would be theatre.
Deterministic candidates mean the spread she left is the spread she returns to.

### After all 40 are collected

The pool resets and cards repeat, in a fresh permutation. A card that comforted
her once is not worthless the second time, and a dead-ended reward counter is
worse than a repeat. The collection page shows each card once regardless.

---

## 3. State

```ts
// AsyncStorage: quiz:cards:v1
interface CardProgressV1 {
  v: 1;
  collected: string[];   // card ids, in draw order
  drawsTaken: number;    // may exceed collected.length after a pool reset
  pendingDraw: boolean;  // earned but not yet drawn — survives a force quit
}
```

`pendingDraw` matters: the draw is earned at the moment a set commits, but she
may background the app before the overlay appears. Without this flag the reward
is silently lost, which is exactly the failure the achievement NEW ribbon had to
work around.

Two sibling keys, split from the card record on the repo's usual rule — keys are
split by write frequency and by what losing them costs:

```ts
// quiz:card-likes:v1   — written on every heart tap, losing it costs an icon
{ v: 1, liked: string[] }

// quiz:dates:v1        — daily history, the only thing that makes any chart possible
{ v: 1, days: Array<{ ymd: string; sets: number; questions: number; firstPassWrong: number }> }
```

Cloud sync — all three need a `MERGERS` entry in `services/progressMerge.ts`:
cards (`collected` union, `drawsTaken` max, `pendingDraw` OR), likes (union), and
history (union by `ymd`, **max** per field — never sum, which double-counts the
same day on every ordinary restore). Omitting a key means a restore silently
loses that part of her record; the quiz ladder shipped that way and had to be
fixed retroactively.

---

## 4. Animation

Reanimated **shared values** throughout, never layout `entering` — this repo has
been bitten by layout animations on remount before.

| # | Beat | Duration | Detail |
|---|---|---|---|
| 1 | Scrim | 320 ms | black `0 → 0.82`, ease-out. Nothing else moves yet |
| 2 | Cards in | 300 ms, 60 ms stagger | 2×2, face down, `translateY 24 → 0`, `scale 0.92 → 1`, `opacity 0 → 1` |
| 3 | Prompt | 200 ms | "Choose one" fades in above the spread |
| 4 | Pick — the other three | 220 ms | `opacity → 0`, `scale → 0.94`, drift 12 px outward |
| 5 | Pick — the chosen one | 340 ms | moves to centre, `scale → 1.18` |
| 6 | Flip | 520 ms | `rotateY 0 → 180deg`; swap back/front face at 90°, each face `backfaceVisibility: 'hidden'` |
| 7 | Typewriter | 3.0–3.6 s | the sentence types itself out, one character at a time. Total is CLAMPED to that window regardless of length — at a fixed per-character speed a short card takes 2.2 s and a long one 4.2 s, and what she notices is the wait, not the speed. Render the full text transparent and reveal characters; a growing substring reflows the centred block and the text visibly jumps |
| 8 | Actions | 200 ms | **Like** and **Save to album** as icon buttons between the card and the primary **Collect** button |

FINAL TIMING (owner-approved, after two rounds of slowing down): every beat from
scrim to flip runs at 2x the numbers above, and the typewriter is 3.0-3.6 s.
About **7 s** from tap to readable card.

That is long, and it is correct here: a draw costs three completed sets, so the
ceremony is proportionate to what it took. The earlier objection — that she will
see it ~120 times a year and grow to resent it — was overruled on exactly that
ground.

**Skippable.** A tap during beats 4–7 jumps to the end state. Any animation the
user will see 40 times must be skippable, or it becomes the thing she dreads
about finishing a set.

**Back button / gesture** during the spread = cancel, and `pendingDraw` stays
true so the reward is not lost.

---

## 5. Where it fires

On the results screen, `onContinue`:

1. `finish()` commits the set
2. if `(completedSets + 1) % MYSTERY_EVERY === 0` → set `pendingDraw`, show the
   overlay **over the results screen** rather than navigating
3. she draws, keeps, dismisses → then `navigation.goBack()`

Not on the home screen and not as a separate route: the reward has to land in
the same breath as the achievement that earned it.

`pendingDraw` is also checked when the quiz screen opens, so a draw interrupted
by a force quit is offered again.

---

## 6. Collection

**Its own screen (`CardCollection`), reached from Profile — not a section of
`PuzzleCollectionScreen`.**

REVISED. The first draft put it under the paintings. That is wrong for a
structural reason: `PuzzleCollectionScreen`'s own header states that nothing
there is stored and every pixel derives from `completedSets`, which is what
makes that screen trivially correct. The card collection is stored, likeable,
and filterable. Bolting it on destroys the invariant.

The product reason matters more, though. A card she read once and can never
find again is a notification, not a reward. The collection is what makes the
draw worth caring about, so it gets a real destination rather than a strip at
the bottom of another screen.

**Strips carry no title.** `MysteryCard` has no title field and will not get
one — the whole design premise is that the body stands alone with nothing
framing it (see the header of `constants/mysteryCards.ts`). A strip is the
first line of the body, truncated. Adding titles would mean 40 strings × 7
languages to solve a problem the design deliberately created.

**`theme` is backend-only.** It drives analytics breakdown and, once the
collection is big enough to need it, grouping. It is never rendered as a label
she reads. She experiences 40 things someone said to her, not 10 categories.

Uncollected cards are **not** shown as locked silhouettes. A grid of 37 grey
rectangles reframes a gift as a checklist — and this is comfort written for
someone in distress, so each one is a reminder of what she did not get. A single
"3 of 40" line carries the same progress signal at no emotional cost.

Sharing: reuse the `captureRef` pipeline already built for verse and badge
sharing. The share image keeps the HER BIBLE wordmark and **never** shows a
scripture reference — see §1.

---

## 7. i18n

40 titles + 40 bodies = 80 keys × 7 languages.

The bodies are the hardest translation work in this app so far. A literal
translation will kill them — the register is intimate spoken comfort, and each
language's devotional idiom differs. Translators must be briefed that these are
**original devotional prose anchored to a citation**, not verses, and must NOT
be "corrected" back toward the local Bible translation's wording — that would
reintroduce exactly the copyright exposure the original prose avoids.

Book names in `ref` are localized separately from a book-name table; the stored
`ref` stays canonical English.

---

## 8. Build order

1. `constants/mysteryCards.ts` — 40 cards + themes, English strings inline
2. `state/cardDraw.ts` — pure: candidate selection, pool reset, collection view
3. tests for step 2 — determinism, no duplicate candidates, exhaustion, reset
4. `state/QuizContext` — `pendingDraw`, `drawCard()`, persistence, merge entry
5. `components/quiz/MysteryDrawOverlay.tsx` — the 8 beats
6. results-screen wiring
7. collection section
8. i18n × 7
9. share (phase 2)
