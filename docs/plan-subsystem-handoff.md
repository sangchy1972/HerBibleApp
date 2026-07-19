# Plan Subsystem — Engineering Handoff

> Everything you need to own the **Reading Plans** feature: the data, the state, the
> recommendation engine, the screens, and how it all connects to the rest of the app.
>
> **Companion diagram:** [`./plan-logic-diagram.pdf`](./plan-logic-diagram.pdf) — a 5-page
> visual of the recommendation logic, tab relationships, and weight calculation. Read it
> first for the mental model; this document is the reference detail behind it.

_Last updated: 2026-07 · Applies to onboarding flow v4, 12 prayer topics._

---

## 1. Mental model (read this first)

There is **one plan catalog**, surfaced in **two places**, ordered by **one scoring engine**.

- **Catalog** — 113 plans × 7 languages, bundled into the app. Summaries are instant;
  full day-by-day content is fetched from a Cloudflare Worker on demand.
- **Two surfaces** — the home screen's *"My Reading Plans"* card, and the *Plans tab*.
- **One engine** — `services/planRecommendations.ts`. A pure, deterministic, unit-tested
  module that scores every plan from the user's onboarding answers and sorts.

The single most important rule: **personalization is additive and guarded**. It only
changes ordering when the user actually answered onboarding (`hasSignal`). A user who
skipped onboarding sees the untouched editorial curation order. See §5.4.

What the engine does **not** do: it does not personalize the daily verse (verses aren't
tagged), it does not auto-start plans (it only ranks — the user chooses), and it does not
change the order of days inside a plan.

---

## 2. Data model & sources

### 2.1 `PlanSummary` — the bundled row
Defined in `src/constants/featuredPlansSummary.ts`. This file is **auto-generated** (by an
external `build_plans_summary.mjs`); do not hand-edit rows. Shape:
`id, slug, topicSlug, title, subtitle, goal, primary, primaryLabel, secondary,
secondaryLabel, duration, duration_days, minutes, estimated_minutes_per_day,
colorPrimary, colorSecondary, cover`.

Export is `FEATURED_PLANS_SUMMARY: Record<LanguageCode, PlanSummary[]>` — **113 plans per
language, 7 languages** (`en, zh-Hans, zh-Hant, de, fr, es, pt`). Summaries are compiled
into the JS bundle, so they render synchronously (no await) for the hero/strip/lists.

> ⚠️ The comment in `FeaturedPlansContext.tsx` saying "54 plans" is **stale** — it's 113.

### 2.2 Full plan body — fetched, not bundled
Types + fetch logic in `src/services/featuredPlansService.ts`.
- `FullPlan` → `{ …meta, days: PlanDay[] }`
- `PlanDay` → `{ day, title, estimatedMinutes, sections: PlanSection[] }`
- `PlanSection` is a discriminated union: `scripture_focus` (one verse), `teaching`
  (`paragraphs[]`), `prayer` (`body`), `verse_wall` (`verses[]`).

Fetched from the Worker at `/v1/plans/<lang>/<slug>.json`
(`PLANS_API_BASE` in `plansApi.ts`), then cached in AsyncStorage under
`featured-plans:<SUMMARY_VERSION>:<lang>:<slug>`. Requests are auth'd (Bearer session
token, one 401-retry, 12 s timeout). The base is deliberately pinned to the
`*.workers.dev` host so the dev-bypass attestation works pending Play Integrity.

> **The filename slug is canonical.** The `plan.slug` *inside* the JSON is just the topic
> id and is discarded — `slug` is the join key across summary ↔ full plan ↔ completion
> records ↔ recommendations.

### 2.3 Taxonomy — lives in `src/constants/plansApi.ts`
- **`PLAN_SECTIONS`** — the 5 primary sections that hold plans: `emotions`,
  `walking-with-god`, `personal-growth`, `roles-identity`, `life-seasons`. (Featured is
  *computed*, not a stored section.)
- **`PLAN_SECTION_LABELS`** — maps each section to an **i18n key** (not a string). Always
  run through `t(...)`.
- **`secondary`** — the fine tag (~40+ values: `anxiety-fear`, `anger-bitterness`,
  `marriage-wifehood`, `draw-near`, …). This is what the scorer matches on.
- **`EMOTION_TAGS`** — 9 curated mood pills for the "How are you feeling today?" grid.
- **`SUBTAB_OVERRIDE` / `SUBTAB_ORDER`** — front-end remap that collapses raw `secondary`
  tags into the curated sub-tabs shown on the category screen. **When you add a plan, add
  its slug here** for its section, or it won't appear under a sub-tab.

### 2.4 Covers, language, versioning
- **Covers:** `https://covers.everlandapps.com/v1/covers/<slug>.webp`, built client-side;
  falls back to a gradient + icon on 404 (`PlanCover.tsx`).
- **Language:** plans follow the **UI language** (`useUILanguage`), *not* the Bible
  translation, with English fallback. (This was a prior bug — keep them distinct.)
- **Versioning:** bump `PLANS_SUMMARY_VERSION` in `plansApi.ts` whenever the plan schema
  or content set changes — it scopes the cache key, so a bump invalidates every device.

---

## 3. Progress state — `src/state/PlanCompletionContext.tsx`

Single AsyncStorage key `plan-completion:v1`, holding `Record<slug, PlanRecord>`:

```ts
PlanRecord = {
  completedDays: number[];   // 1-indexed, sorted
  firstStartedAt: number;    // ms, set on first day completion
  finishedAt?: number;       // ms, set when completedDays.length >= total
  lastDayYmd?: string;       // local YYYY-MM-DD of most recent completion
}
```

- `markDayComplete(slug, day, total)` — idempotent; appends the day, stamps
  `firstStartedAt` on first completion, sets `finishedAt` when the count reaches `total`,
  updates `lastDayYmd`. Logs `plan_day_complete` and (on the final day) `plan_complete`.
- `planProgress(slug, total)` → `{ completed, total, complete }`.
- **Percent** is computed at render sites (`completed / total`), not stored.
- **"in progress"** = `completedDays.length > 0 && !finishedAt`; **"completed"** =
  `!!finishedAt`. Derived identically in PlanScreen, the recommender, and context selectors.
- **Restart** is allowed — a finished plan's CTA loops back to Day 1. Re-reading past the
  duration is detectable via `hasRepeatedPlan()` (feeds the *Deep Roots* achievement).
- Plan completion does **not** feed prayer/reading streaks — only achievements (§7).

---

## 4. The plan reading flow (day-by-day UX)

The journey is identical for every plan. Nav params in `navigation/types.ts`; screens
registered in `RootNavigator.tsx` (Day Done is a bottom `fullScreenModal`).

1. **`FeaturedPlanDetail` `{ slug }`** — renders instantly from the summary (hero,
   day-strip, CTA), then lazy-loads the full body via `loadPlan(slug)` (tap-to-retry on
   failure) and pre-warms `fetchChapter` for every verse so the reader is spinner-free.
   - Day strip is **date-anchored** to `firstStartedAt` (Day N = start + N-1). Default
     selection = first incomplete day.
   - CTA = **"Start Reading Plan"** (→ Day 1) → flips to **"Continue Reading Plan"**
     (→ first incomplete) once started. Opening an out-of-schedule day shows a confirm modal.
2. **`PlanDayWalk` `{ slug, day }`** — a horizontally-paged reader. Pages are built in a
   fixed order: `scripture_focus → teaching → prayer`, then **one page per `verse_wall`
   verse**. Verse-tap popup (highlight / save / copy / notes / share / explore) shares the
   same `HighlightsContext` / `SavedVersesContext` as the Bible reader; typography mirrors
   the Bible reader's saved prefs. **No audio is wired yet.**
   - Last page's button becomes a green check → `onNext` calls
     `markDayComplete(slug, day, total)`, `replace('PlanDayDone', …)`, and a
     `plan_end` interstitial.
3. **`PlanDayDone` `{ slug, day }`** — celebration modal. Confetti Lottie when the plan is
   complete, otherwise a checkmark + "Day N of M" and an animated progress bar. Share
   builds a localized message. "Continue" → back to the Detail screen.
4. **`PlanVerseRead` `{ focus, planSlug, day }`** — standalone chapter reader ("tap a verse
   to read it in context"), auto-scrolls to the focus verses. Its own stack frame so back
   always returns to the plan.

> Retired: the old `PlanDayVerses` route — verse walls now render inline in `PlanDayWalk`.

---

## 5. The recommendation engine — `src/services/planRecommendations.ts`

> This is the personalized heart of the feature. See PDF pages 3–5 for the visual.

### 5.1 `scorePlan(plan, answers)` → `{ score, reasons[] }`
Additive integer scoring. Every plan starts at 0; each matching signal adds/subtracts a
fixed amount. The `reasons[]` trail makes any result explainable.

| Signal | Weight | Rule |
|---|---|---|
| **topics** | **+4** each | Strongest — user's explicit choice. Each topic maps via `TOPIC_TAGS` to real `secondary` tags; a plan whose tag is in the set gets +4. Topics stack. |
| **goal** | +2 / +1 | +2 if section matches, +1 if tag matches; `habit` gives +1 to plans ≥14 days. |
| **age** | +2 / **−6** | +2 for life-stage fit; **−6** (soft gate) for clear mismatch. −6 > +4 so mismatches sink, but gated plans can still fill an empty pool. |
| **bibleLevel** | ±1 / ±2 | Depth via duration: new → prefer short; regular → prefer deep. |
| **timeCommitment** | ±1 / +2 | Weak (nearly all plans are ~7 min/day); nudges duration appetite. |
| **starter** | +1 | 9 hand-picked on-ramp plans. **Fires even with empty answers** — the reason `hasSignal` exists (§5.4). |

### 5.2 `recommendPlans({ answers, summaries, excludeSlugs, todayYmd, count })`
Pipeline: **score → stable sort (desc) → rotate ties by `fnv1a(slug + todayYmd)` →
diversity filter → exclude started → take `count`**. Diversity relaxes in stages if the
pool is thin (dedupe-tags + cap-2-per-section → drop cap → drop dedupe), so it always
returns `count`. No `Math.random` anywhere.

### 5.3 `buildReadingPlansCard({ records, summaries, answers, todayYmd })`
Powers the home card. Returns `{ active, suggested }`. `active` = user's top-3 in-progress
by %; `suggested` count depends on active count: **0 active → 3, 1 → 2, ≥2 → 1**, always
excluding started plans.

### 5.4 The `hasSignal` guard (critical)
```
hasSignal = !!(topics?.length || goal || age || bibleLevel || timeCommitment)
```
The Plans tab only re-sorts when `hasSignal` is true. **Why:** the `starter +1` bonus
scores even with empty answers, so a naive sort would float starter plans up for
*everyone*, silently reshuffling the tab for users who onboarded before topics existed.
With the guard, zero-signal users get byte-identical curation order. Sorting is always
**stable** (ties fall back to curation index).

### 5.5 The `TOPIC_OPTS` ↔ `TOPIC_TAGS` contract
- `TOPIC_OPTS` (in `screens/OnboardingFlow.tsx`) = the 12 chips: `anxiety, hope, gratitude,
  family, marriage, belonging, strength, healing, identity, purpose, faith, sleep`.
- `TOPIC_TAGS` (in `planRecommendations.ts`) maps each chip → real `secondary` tags.
- **They must move together.** A chip with no `TOPIC_TAGS` entry is captured but scores 0
  (inert). A `TOPIC_TAGS` value that isn't a real catalog tag is a silent no-op. When you
  add/rename a chip: update both, add i18n keys (see §9), and verify it surfaces content.

---

## 6. The surfaces in detail

### 6.1 Home — "My Reading Plans" card
`PrayerScreen.tsx` builds the model with `buildReadingPlansCard(...)`, passing the real
onboarding answers; rendered by `components/MyReadingPlansCard.tsx` (progress rings +
"SUGGESTED PLANS" divider). "More Plans" routes to the Plans tab's *explore* sub-tab.
This surface has always been personalized — the 12-topic rewiring just made it accurate.

### 6.2 Plans tab — `screens/PlanScreen.tsx` (3 sub-tabs)
- **current** — in-progress plans, sorted by recency (`firstStartedAt` desc). Not scored.
- **explore** — (a) **Featured carousel** = `recommendPlans(count 5)` when `hasSignal`,
  else the original `summary.slice(0,5)`; (b) **mood grid** = the 9 `EMOTION_TAGS` (fixed
  shortcuts, not scored); (c) **4 category sections**, each a stable score-sort of that
  primary's plans, top-4, with "See All".
- **completed** — finished plans, sorted by `finishedAt` desc. Not scored.

### 6.3 Category drill-in — `screens/PlanCategoryScreen.tsx`
Full list for one primary, with sub-tab pills from `SUBTAB_ORDER`. Same stable score-sort
+ `hasSignal` guard as the Plans tab, so the drill-in matches the tab. An incoming
`secondary` param pre-selects and auto-scrolls the matching pill.

---

## 7. Cross-feature relationships

- **Achievements** (`constants/achievements.ts` + `services/achievementsEvaluator.ts`) —
  a dedicated **"Study Plans"** badge category (~14 badges). Conditions read from
  `PlanCompletionContext`: `planCount` (1/2/…/30 finished), `planInWindow` (3-in-7,
  5-in-30, 10-in-30), `planRepeated` (*Deep Roots*). Two composite badges also pull plan
  data: *River of Life* (3 plans finished in 30 days + prayer/reading streaks) and *Crown
  of Grace* (holds-all). **If you change completion semantics, re-check these.**
- **Streaks** (`StreakScreen.tsx`) — **not coupled**; it only reuses the home card's
  styling. No plan data consumed.
- **Profile "My Plan" tile** — **referenced in comments/params but not currently
  rendered** (pending the quiz/"Learning Bible" feature). The only live `reset`-carrying
  entry into the Plans tab is the home Explore button. _Flagged as latent._
- **Prefetch** (`components/PrefetchManager.tsx` + `services/startupPrefetch.ts`) — after
  `appReady`, warms the first ~6 featured plans' covers and detail bodies. PlanScreen also
  prefetches featured + in-progress on mount; the Detail screen pre-warms chapter fetches.
- **Cloud backup/restore** (`services/progressMerge.ts` → `cloudBackup.ts`) — **plan
  progress IS backed up.** `mergePlanRecords` unions `completedDays`, takes min
  `firstStartedAt`/`finishedAt`, latest `lastDayYmd`. It never un-completes a day.
- **Daily verses** (`DailyVersesContext`) — **fully separate** from plans; shares only the
  CDN/prefetch infrastructure pattern.
- **Notifications / deep links** (`DeepLinkHandler.tsx`) — a `plan` reminder slot and
  `herbible://plan*` URLs currently route only to `Tabs` (home), **not** to a specific
  plan or the Plans tab. _Flagged as an incomplete deep link._

---

## 8. Conventions, rules & habits

- **Determinism is sacred.** `planRecommendations.ts` has zero React/RN imports and never
  uses `Math.random`. Keep it pure so it stays unit-testable. Ties rotate by a date hash,
  not randomness.
- **Stable sort, never in place.** The bundled summary array order *is* the editorial
  curation order. Always copy-then-sort with a curation-index tiebreak; never mutate it.
- **Additive by default.** New personalization must degrade to today's behavior for
  zero-signal users. Reuse the `hasSignal` pattern.
- **Slugs join everything.** Use the filename slug, never the JSON's internal `plan.slug`.
- **i18n keys, not strings**, for section/tag labels — always `t(...)`.
- **Language = UI language**, not Bible translation.
- **Bump `PLANS_SUMMARY_VERSION`** on any schema/content change to invalidate caches.

### Adding a new plan (checklist)
1. Author `featured-plans/<lang>/<slug>.json` for **all 7 languages**; publish to the
   Worker/R2.
2. Regenerate `featuredPlansSummary.ts` (the external build script) so the summary row exists.
3. Register the slug in `SUBTAB_OVERRIDE` for its section in `plansApi.ts` (so it appears
   under a sub-tab).
4. Ensure a cover exists at the covers CDN (or accept the gradient fallback).
5. If it should be recommendable for a topic, confirm its `secondary` tag is in the
   relevant `TOPIC_TAGS` set.
6. Bump `PLANS_SUMMARY_VERSION` if the schema changed.

### Adding / changing a prayer topic (checklist)
1. `TOPIC_OPTS` in `OnboardingFlow.tsx` (the chip).
2. `TOPIC_TAGS` in `planRecommendations.ts` (→ **real** `secondary` tags).
3. i18n: English source in `i18n/sourceCatalog.ts` + translations in `i18n/strings.ts`
   (6 locales; missing keys fall back to English).
4. Update the doc-comment enum in `state/OnboardingContext.tsx`.
5. Verify at runtime that the topic surfaces on-topic content at rank 1.

---

## 9. Gotchas & known tech debt

- `FeaturedPlansContext.tsx` "54 plans" comment is wrong (113).
- `constants/featuredPlansCdn.ts` is **dead code** (abandoned jsDelivr corpus; slug
  mismatch → 404s). Don't wire anything new to it.
- Profile "My Plan" tile: referenced but not rendered (§7).
- `plan` deep link / reminder routes to home, not the plan (§7).
- Worker host pinned to `*.workers.dev` dev-bypass pending Expo SDK 55 Play Integrity.
- **No audio narration** is wired in `PlanDayWalk` despite the layout leaving room.

---

## 10. Testing

- `__tests__/planRecommendations.test.ts` — covers `recommendPlans` (topic ranking,
  diversity, exclusions, age gate, determinism, bibleLevel depth, cold-start starter tier)
  and `buildReadingPlansCard` slot math. This is the safety net for the engine.
- `__tests__/progressMerge.test.ts` — covers the backup merge, including `plan-completion:v1`.
- **Gaps:** no screen/UI tests for any plan screen, and no test for `PlanCompletionContext`
  / `markDayComplete` / sub-tab filtering. If you touch completion semantics or the
  sub-tab filters, add coverage — those are currently unguarded.

When changing the engine, run `npx tsc --noEmit && npx jest`. A quick way to sanity-check a
new topic: assert `recommendPlans({ answers: { topics: ['<new>'] }, … })[0].secondary` is
in the topic's tag set.

---

## 11. Suggested follow-ups (not yet built)

- **Topic-tagged daily verse** — would let the daily verse reflect prayer topics, but
  requires tagging the (still-growing) verse corpus. Deferred by product.
- **Auto-start / "push" a plan** — the engine can already pick the top plan; wiring it to
  seed an active `PlanRecord` at onboarding finish would surface an *active* plan instead
  of only a suggestion. Deferred by product.
- **Deep link to a specific plan** — finish `herbible://plan/<slug>` routing.
- **Surface the "Reason trail"** in an internal debug view to explain any ranking.

---

_Questions or when in doubt, start from `services/planRecommendations.ts` (the engine) and
`state/PlanCompletionContext.tsx` (the state) — everything else hangs off those two._
