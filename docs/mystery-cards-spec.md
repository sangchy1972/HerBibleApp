# Mystery Cards — design spec

The reward behind the "mystery reward" counter in the Quiz Challenge. Every
`MYSTERY_EVERY` (3) completed sets, the user draws one card from a face-down
2×2 spread. The card flips and speaks to her.

Status: **spec — not built**. Card copy is written (40 cards, English source).

---

## 1. Content model

A card is our own original writing in God's first person, **anchored to a named
passage**, plus the reference. It is not a Bible quote.

```ts
interface MysteryCard {
  id: string;        // 'presence-1' — stable, durable, never reused
  theme: CardTheme;  // 10 themes
  ref: string;       // 'Isaiah 41:10' — canonical English ref, localized at render
  titleKey: string;  // i18n key for the 2-4 word card title
  bodyKey: string;   // i18n key for the 35-60 word message
}
```

### Why the message is original prose, not a verse

**Licensing.** KJV is public domain, but the modern translations this app uses
for zh-Hans, zh-Hant, de, fr, es and pt are under copyright. Bundling their
verse text into a shipped constant is a rights problem in six of seven
languages. Original prose anchored to a citation has no such exposure.

**Register.** A pasted verse reads like a lookup result. The owner's brief was
a card that talks *to her* — "I know you are going through a season of
confusion… I will pull you up." That needs writing, not quoting.

### Why anchored rather than free-written

The obvious version of this feature invents divine speech. For a Bible app
that is a real risk: a meaningful share of readers consider it presumption for
software to put words in God's mouth, and that reaction shows up in reviews
rather than in feedback forms. Anchoring costs nothing — Scripture already
speaks in the first person at length — and makes every line answerable.

### The 10 themes × 4 cards

| Theme | Her situation | Cards |
|---|---|---|
| `presence` | doubts he is really there | Ps 139 · Ex 33 · Jer 23 · Mt 28 |
| `guidance` | lost, no direction | Is 30 · Ps 32 · Pr 3 · Ps 119 |
| `rest` | exhausted | Mt 11 · Ps 23 · Ps 127 · Mk 6 |
| `courage` | afraid | Is 41 · Jos 1 · Ps 27 · Jn 14 |
| `companionship` | lonely | Heb 13 · Ps 68 · Jn 15 · Gen 28 |
| `beloved` | feels unworthy | Is 43 · Zeph 3 · Jer 31 · Is 49 |
| `waiting` | long wait, no answer | Is 40 · Hab 2 · Ps 40 · Lam 3 |
| `healing` | hurt, grieving | Ps 147 · Ps 34 · Rev 21 · Is 61 |
| `provision` | lacks resources and help | Mt 6 · Is 58 · 1 Kgs 17 · Lk 12 |
| `hope` | cannot see a future | Jer 29 · Is 43 · Ezek 37 · Joel 2 |

### Editorial constraints, enforced in review

- 35–60 words. Longer does not fit a phone card at a readable size.
- No prosperity phrasing — no promise of wealth, or of a specific outcome.
- Nothing that reads as a substitute for medical or mental-health care. The
  healing cards address grief and heartbreak only, never symptoms or cure.
- Nothing that implies she can command God or unlock him by asking correctly.
- Must make sense to someone who never looks up the reference.

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

Cloud sync — add to `MERGERS` in `services/progressMerge.ts`:
`collected` union, `drawsTaken` max, `pendingDraw` OR. Omitting the key means a
restore loses her whole collection.

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
| 7 | Content | 260 ms, 120 ms delay | title, message, reference rise 10 px and fade in |
| 8 | CTA | 200 ms | "Keep this" button |

Total to a readable card: **~1.5 s**. Long enough to feel like an event, short
enough not to be a toll booth on the fourth draw.

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

A second section on `PuzzleCollectionScreen`, below the paintings: collected
cards as a list of tappable strips (title + theme dot), opening the full card.

Uncollected cards are **not** shown as locked silhouettes. A grid of 40 grey
rectangles reframes a gift as a checklist, and this is the one part of the app
that should not feel like completion pressure.

Sharing: reuse the `BadgeCardArt` + `captureRef` pipeline already built for
achievement badges. Phase 2 — it is a self-contained addition.

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
