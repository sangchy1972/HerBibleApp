# HerBibleApp — Development Guide

The durable "how this app is built" reference. `CLAUDE.md` holds the owner's standing
process rules and settled decisions; `README.md` is the project map. **This file is the
module-by-module rulebook**: for each subsystem — where it lives, what the owner has
decided, the numbers that are deliberate, and the traps that have already cost us a day.

How to use it: skim §1–§3 once, then jump straight to the module you are touching.
Every section names its files, so `grep` from here, not from scratch.

**Keep it current.** When the owner changes a rule or a number, edit the relevant
section in the same commit. A doc that lies is worse than no doc.

---

## 0. Before every commit

```bash
npx tsc --noEmit && npx jest && npx tsx scripts/i18n_audit.mjs
```

Never commit red. TypeScript strict — fix types, never silence them. Data-pipeline
changes additionally require `node scripts/verify_alignment.mjs`.

Do **not** launch the Android emulator to "check" a change unless the owner asks —
it is token-expensive. Verify by types, tests and reading the code.

Never `git checkout` / `merge` / `stash` the working tree: parallel sessions edit this
same repo. Touch only the files you are changing. Commits auto-sync to GitHub; a manual
`git push` failing on credentials is expected, not a bug.

---

## 1. UI style — the rules that get accidentally reverted

### Colour
- **Never hardcode a colour.** Import from `src/constants/theme.ts`:
  `ROSE #E63F69`, `LAV #866BC0`, `TXT #1E1B2E`, `TXTSUB rgba(30,27,46,0.50)`,
  `BG #FBF7F6`, `SCREEN_BG #F2F2F2`, `INK_06/10/28`, `GREEN_DONE #7DB87D`.
- Morning = `ROSE`, evening/night = `LAV`. Anything slot-aware takes an `accent` and
  passes it down; do not re-derive the pair locally.
- Backgrounds lean **white / grey-white**. Rose is an accent, never a wash. The one
  deliberate exception is the prayer flow's own gradient screens.

### Typography
- Titles / headings → serif (`FONTS.loraBold`, `FONTS.serif` + `SERIF_HEADING`).
  Body → `FONTS.lato*` (Latin) with CJK falling through to the system font — we
  deliberately do **not** bundle Noto Sans CJK (≈40 MB per weight).
- **`FONTS.loraBold` must always pair with `fontWeight: '600'`.** With `'700'` Android
  drops Lora and falls back to system sans. This has regressed more than once.
- `serifVariation(size, weight)` for Source Serif 4 — opsz tracks ~70 % of the
  rendered size. Use it anywhere the font size is user-adjustable.
- Owner-specified type sizes are usually **percentage deltas off a previous value**
  (e.g. "+10 %", "−8 %"), which is why the codebase is full of values like `12.65`,
  `17.5`, `20.24`, `47.6`. They are not typos. Leave the trailing comment that records
  the delta — it is the only record of why the number is odd.

### Cards, radii, shadows
- `BTN_RADIUS = 17` with bold labels for primary buttons.
- Content cards: flat, radius **20**, `#FFFFFF`, **no shadow**. Stacked cards must
  share their radius and their horizontal inset — a 1–4 px mismatch reads as
  "misaligned" even though nobody can name the cause. `P = 17` is the screen padding;
  screens that use 16 must reconcile (see `quizWrap` in `WeeklyProgressView`).
- Secondary-CTA text size is **17.5** across all 11 sites. Do not reintroduce a
  second family (it used to be a mix of 16 and 16.5).

### Layout
- Adaptive iPhone SE → Pro Max. No fixed widths. Any screen whose content can grow
  past ~740 pt goes in a `ScrollView` (the weekly screen's CTAs used to fall off the
  bottom of a 4.7" screen with no way to reach them).
- `width: '100%'` inside a container that also has horizontal margins pushes content
  off-screen — it measures against the parent, not the remaining space. This is what
  put the quiz progress bar past the right edge.

### Sheets
- Every bottom sheet: dim backdrop + slide up from the bottom, **swipe-down
  dismissible** via `useSheetPan` (or an equivalent `Gesture.Pan`). Backdrop tap plus a
  drag handle alone is a regression.
- Set the sheet's translate shared value to off-screen **before** mounting, then
  animate to 0 — otherwise the first frame flashes the sheet at its final position.

### Vectors over emoji
Everywhere, with two respected exceptions the owner tuned by hand: `RatePromptSheet`'s
face and the reminder-toggle coach finger. Don't "fix" those.

### i18n — non-negotiable on every change
- Every `<Text>`, `Alert`, placeholder and accessibility label goes through `t()`.
- Every const table of user-visible strings is language-keyed.
- Every date format uses `localeFor(uiLang)`.
- Language source is `useUILanguage()`, **not** `useTranslation()`.
- Sentences that interpolate a number need per-language forms, not an English suffix
  glued on — see `ordinalFor()` in `WeeklyProgressView` (an English-only ordinal leaked
  `第 2nd 次` into Chinese).
- New key → `src/i18n/sourceCatalog.ts` (with a `context` line) **and** all 7
  languages in `src/i18n/strings.ts`. Audit must report `missing=0`.

---

## 2. Overlay & touch hazards

Three classes of bug have each made the app dead to touch. Check all three whenever you
add anything that floats.

1. **RN `<Modal>` is its own native window** and swallows every app touch while
   mounted — even fully transparent, even zero-opacity. Twice the cause of
   "the screen stopped responding". Prefer a root-mounted absolute-fill view.
2. **An invisible touch shield**: a scrim that animates out but never unmounts, or one
   whose `pointerEvents` isn't released on the exit path. Every overlay needs an
   exactly-once exit and a watchdog (30 s) that force-clears it even if the animation
   never settles.
3. **Root-mounted host over an in-screen sheet.** `zIndex` only orders *siblings*: a
   host at app root with `zIndex: 60` paints over an in-screen sheet with `zIndex: 200`,
   because their parents are what get sorted. Android additionally sorts by `elevation`.
   Two overlays that can co-exist must be arbitrated (see §4), not z-fought.

Related: `measureInWindow`'s window origin differs by device (Samsung/OneUI excludes the
status bar). Measure the target **and** the overlay root in the same pass and subtract —
never assume the window origin is the screen origin.

---

## 3. React / RN traps that have actually bitten us

- **Reanimated layout animations (`entering=`) do not reliably run inside a Modal on the
  new architecture.** Use shared values + `useAnimatedStyle`. Give every entrance a
  watchdog so a dropped timing ends visible and tappable rather than stranded
  off-screen.
- **Reanimated-owned views can freeze native touch regions on Android/Fabric.** Wrap
  tappables in an animated view only for the entrance, then hand back to a plain `View`
  once it settles (`QuizOptionsEntrance` is the reference implementation).
- **No hook below an early return.** A conditional hook throws the moment the condition
  flips. Also: a `const` referenced by an effect declared *above* it is a **TDZ crash** —
  declare the const first.
- **No side effects inside a `setState` updater.** React may replay it, and the effect
  double-counts. Keep a synchronous `…Ref` mirror and do the effect outside.
- **Hermes' Android `toLocaleDateString` can render a local-midnight `Date` in UTC**,
  producing the previous month/day. Format a **noon** anchor.
- **`NavigationContainer` skips `onStateChange` on first mount.** Any gate fed only from
  it starts unseeded — seed from `onReady` too.
- **Downloads must be atomic**: write to `<name>.part`, validate (JPEG = trailing
  `FF D9`), then rename. A truncated file left under the final cache name renders
  broken forever.
- **Guarded `require` for native modules** so older dev clients degrade to no-ops
  instead of crashing (pattern in `src/services/*`).
- Never assume a context is loaded before its render gate passes. Defensive null checks
  at every boundary. Crash-free is non-negotiable.

---

## 4. Prompt / nudge system

**Files** — `src/state/nudgePriority.ts` (pure rules + arbiter),
`src/state/NudgeCoordinatorContext.tsx` (the machine),
`src/state/promptSurface.ts` (the *where-is-she* gate), plus one host per prompt
(`MoodCheckInSheet`, `LoginPromptHost`, `WidgetInstallHost`, `SetReminderTimeHost`,
`RatePromptHost`, `QuizPromoHost`, `StreakGuideHost`, `PlanGuideHost`,
`AchievementUnlockHost`, `RemoveAdsPromptHost`).

### The contract
The coordinator shows **at most one blocking prompt at a time**. It does *not* own each
prompt's gating. Every host: (1) `requestSlot` when it wants to show, (2) renders only
while `isActive(id)`, (3) `notifyDismissed(id)` when it closes, (4) `releaseSlot(id)`
when it goes ineligible.

- `canShow()` must read a **live ref**, not a captured value — the register effect
  re-runs rarely and a stale closure keeps an expired prompt eligible.
- `active` belongs in the request-effect deps: `notifyDismissed` *deletes* the request,
  so without it a long-lived session never re-registers and tomorrow's ask is lost.
- Shared slot ids (today: the two plan-guide triggers) pass an `owner` tag and release
  with `releaseSlot(id, owner)` — a blanket release deletes the *other* host's request.
- Arbitration **never preempts** a visible prompt; the next one is chosen on dismiss.

### Priorities (lower = first)
`firstRunTour 5` · `achievementUnlock 10` · `followHimOptin 20` · `setReminderTime 30` ·
`streakGuide 35` · `planGuide 38` · `moodCheckIn 40` · `login 50` · `widgetInstall 60` ·
`quizPromo 65` · `streakCongrats 70` · `rate 80` · `adInterstitial 90`.

### Caps (owner 2026-08-08)
- `MAX_BLOCKING_PER_OPEN = 3` — total prompts per wave, rewards and guides included.
- `MAX_BUDGETED_PER_OPEN = 2` — promo-class prompts (those without `ignoresBudget`).
- `BUDGETED_NUDGE_FLOOR_MS = 30_000` between two budgeted prompts.
- `NUDGE_WAVE_QUIET_MS = 10_000` — 10 quiet seconds on a tab screen starts a new wave
  and resets the counters. Without this the 3-cap held a 7-deep day-one queue hostage
  until she happened to background the app.
- `ignoresBudget: true` is for rewards, daily rituals and once-ever tutorials only.
- When nothing can show but something is eligible, the coordinator **re-arms a timer**
  for whichever clock is holding it back. Without that, a queue blocked purely by a
  timer stalls with slots free (widget + rate were dropping out of day one).

### The surface gate — `promptSurface.ts`
A grant is refused unless she is on a **tab route** (`prayer`, `plan`, `profile` — note
`bible` is the reader and is excluded), with **no interstitial visible**, **no sheet
open** (`sheetDepth === 0`, via `useSheetSurface`) and **no launch overlay up**. New
grants only: a prompt already holding the slot keeps it, and a queued request waits.
- Seed the route from **both** `onReady` and `onStateChange` (§3).
- Any new full-screen flow or sheet must register with `useSheetSurface`, or prompts
  will ambush it. This is the one gate that covers every host at once.

### Full-screen gates
`reminderGateUp` (Follow-Him opt-in) and `tourGateUp` (first-run tour) hard-suppress
everything. Both are **observed** (`reminder.onScreen`, `tour.pending || tour.active`) —
never inferred from `ready && shouldShow`, which was true during the questionnaire too
and silenced every prompt for returning mid-onboarding users.

A **safety valve** clears an `activeId` whose request no longer exists (1.5 s), because
five hosts unmount without releasing when `ReminderInterstitialContext` swaps the tab
tree out mid-session.

### Individual cadences
| Prompt | Rule |
|---|---|
| `moodCheckIn` | daily, 8 h re-ask window, opens 1.8 s after mount |
| `login` | one-time triggers (`first_highlight`, `day1`) + a global 1-per-3-days cap; arms 3 s after boot |
| `setReminderTime` | first ask ~20 h after becoming eligible, then **once per local calendar day** (owner: the old escalating gap was too long); disappears when permission is granted |
| `widgetInstall` | from day 1, needs **≥ 1** core feature used (`FEATURES_REQUIRED = 0`, strictly greater); repeats daily; after 3 unacted asks backs off to every 3 days; silent once `WIDGET_PRESENT_KEY` exists |
| `quizPromo` | gap grows `1 + promptCount` days, capped at 14; **terminal** once she has played |
| `rate` | "No" → 30 days. Dismissed → escalating 3, 4, 5, 6, 7 … capped at 15 days |
| `removeAds` | see §9 |

### Adding a prompt — checklist
1. Add the id to `NudgeId` + a priority in `NUDGE_PRIORITY`.
2. Host at app root, gated on `isActive(id)`; no screen gating of its own needed.
3. Live-ref `canShow`; `active` in the deps; release on ineligible **and** on unmount.
4. `ignoresBudget` only if it is a reward, a ritual or a once-ever tutorial.
5. If it renders a sheet, wire `useSheetPan` **and** `useSheetSurface`.
6. Confirm no hook sits below an early return.

---

## 5. Ads

**Files** — `src/services/ads.ts` (iOS + shared show path), `usInterstitial.ts` (iOS US
ladder), `adEngine.ts` / `adLadders.ts` / `adValueStore.ts` (the Android engine),
`adFrequency.ts` (when to *ask*), `src/constants/adPacing.ts`.
**Reference docs** — `docs/ad-routing.md`, `docs/ad-unit-ids.md`,
`docs/ad-waterfall-US.md`, `docs/ad-mediation-map.html`.

### Format & pacing
- The app renders **interstitials only**. No banners, no rewarded, no native.
- `MIN_AD_INTERVAL_MS = 30 * 1000` in `constants/adPacing.ts` is the **single global
  floor** (owner 2026-08-08, was 60 s). It used to be re-typed in three files — never
  reintroduce a local copy.

### Triggers
| Placement | Rule |
|---|---|
| `prayer_end`, `plan_end` | baseline, every user |
| `nav` | every 3rd qualifying transition, **day ≥ 3 only**. A run of consecutive tab↔tab switches collapses to +1. Flow/utility screens never count and never trigger (`EXCLUDED` in `adFrequency.ts`) |
| `app_open` | hot start after ≥ 15 s backgrounded, **every user from day 0** (owner 2026-08-08). `suppressNextHotStart()` exempts the store-review excursion for 10 min |
| `quiz_retry` | every tap of "Try those again", **uncapped** by design, 400 ms delay |

### Settled — do not re-open
- The `app_open` hot-start interstitial **stays**. Audits will keep flagging it under
  Play's Disruptive Ads policy. The risk is understood and accepted.
- `quiz_retry` is **uncapped**. More wrong answers is *meant* to mean more impressions.
  No per-visit, no per-day cap.
- The 400 ms delay before `quiz_retry` is **not** a frequency control — it stops a
  double-tap landing on the creative (invalid-traffic risk to the AdMob account).
- **Live ad units ship in dev builds too.** Debug devices must be registered as AdMob
  test devices instead. Do not add a `__DEV__` gate.

### Android engine (spec v1.0)
3 regions × 2 user layers, 78 unit ids verified byte-for-byte against the spec appendix:
US `splash_2…25` ($40–500 step 20), T2 `splash_27…50` ($15–130 step 5), WW `ww_2…25`
($8–54 step 2). A resident 1 s pump keeps a 2-slot cache warm; show priority is by
floor, no-floor last.
- Floors are **eCPM**; per-impression revenue is stored as **raw USD** and multiplied by
  1000 at compare time.
- T2 nets are asymmetric on purpose: new-user net = `splash_0`, ladder no-floor = `ww_0`.
- Per-unit cadence + per-day breakers; **network errors never strike** a unit.
- `ad_impression_custom` logs value only when the `paid` callback delivers it. The value
  arrives as a **number** on both platforms (Android `1e-6 * getValueMicros()`).
- Never parse a localised number string — decimal separators differ by region (pt-BR).
- iOS is untouched by this engine.

### Order of operations
`ensureAttRequested().finally(initAds)` in `App.tsx`. ATT before ads init — keep it.
UMP runs in parallel. The US floor ladder is gated `region === 'US' && !__DEV__`.

---

## 6. Quiz

**Files** — `src/screens/QuizChallengeScreen.tsx` (the full screen),
`src/components/home/QuizChallengeCard.tsx` (the preview card),
`src/components/quiz/*` (shared pieces), `src/state/QuizContext.tsx` +
`quizSession.ts` / `quizProgress.ts` / `quizHistory.ts` / `quizLifecycle.ts`,
`src/services/quizSets.ts`. Bank: `quiz.everlandapps.com/v1/quiz-<lang>.json`.

### Rules
- `SET_SIZE = 5` questions per set, `DAILY_SET_LIMIT = 3` sets per day. A live session
  always beats the cap — refusing it would strand her on a half-answered screen.
- `TILES_PER_PAINTING = 4`; a mystery card every `MYSTERY_EVERY = 3` sets.
- **Never reveal the correct answer after a wrong pick** (owner). Tinting it green
  handed her the answer before the retry round could ask again. Only the picked option
  is coloured; `tried` beats every other state so an option ruled out in an earlier
  round stays greyed.
- **No "Next question" button.** `useAutoAdvance` holds the reveal
  `REVEAL_HOLD_MS = 2000` and moves on by itself.
- The home card is a **preview, not a second quiz** (owner 2026-08-09): any option tap
  calls `startAndPick(i)` — one update, because `open()` then `pick()` answers into a
  session that does not exist yet and the tap is swallowed — and then hands off to the
  full screen, which owns the reveal, the verdict, the remaining questions, the summary,
  the retry round, the puzzle tile and the mystery draw.
- The card renders **nothing** until the bank has landed (a device that has never been
  online genuinely has no questions), and retires itself when every question has been
  served — except while a mystery draw is owed, since the full screen is the only route
  to that overlay.
- The card owns its own outer spacing, so "hidden" really means zero height.

### Current styling
- Question 19 / lineHeight 30, +3 px left inset. Options: no border, very light shadow.
- Options slide in from the right, 0.1 s stagger, 0.5 s total, mount-keyed
  `round:position` so a retry replays it. Shared values with a handback (§3).
- Segment bar directly under the title, height 6. Never give the track a `width: '100%'`.
- Verdict: +20 % bold, floats up 30 px over 0.4 s, rendered **below** the options so the
  card grows downward and nothing she is looking at moves.
- Results screen: no level title, no top bar, no medal ring, no score line, no
  "Level N complete". Keeps "PUZZLE PIECE UNLOCKED", the board at 15 dp side margins
  with **dashed** seams (`strokeDasharray="7 7"`), locked quarters showing the art
  through a wash plus a solid lock, the mystery bar with an in-fill count, and a single
  "Next Level" button.

---

## 7. Guides & spotlight tours

**Files** — `src/components/shared/SpotlightCoach.tsx` (the shared overlay),
`src/state/FirstRunTourContext.tsx` (+ `measureRefInWindow`),
`streakGuide.ts` / `StreakGuideContext.tsx` / `StreakGuideHost.tsx` / `…Trigger.tsx`,
`planGuide.ts` / `PlanGuideContext.tsx` / `PlanGuideHost.tsx` / `…Trigger.tsx` /
`PlanGuideSelfTrigger.tsx`.

### SpotlightCoach — the pattern every guide uses
No `Modal`. Shared values, not `entering`. Own-root normalisation for the measure
(§2). A **confirming re-measure at 650 ms plus a snap**, because the anchor can still be
laying out. Children render only once `target != null`. `BackHandler` bound only while
visible. A **30 s watchdog** that bypasses the leaving latch, and an **exactly-once**
exit. Tunables live at the top of the file (`SCRIM_ALPHA 0.72`, `TIP_MAX_W 300`, …).

### Stage machines
Both guides keep a **synchronous `stageRef` mirror** and flip the stage *before*
navigating — the focus-loss dismissal only fires on the step it belongs to, so the
guide can never kill its own hand-off. Both **burn their once-flag on display**, so a
crash mid-guide cannot loop it, and both re-check that flag inside `begin()` because a
trigger can remount while the slot is still granted.

### Rookie streak guide (2 steps)
Fires when a user who has **never** lit a full day (`totalComplete === 0`) has completed
**exactly one** of today's prayers. At most once per calendar day; retires for good the
day she completes both. Final CTA follows `streakScenario()`:
`nightLater` → "Come back tonight" (before 18:00), `startNight` / `startMorning` →
start that prayer.

### Plan-discovery guide (once ever)
- `home` entry — never opened the Plan tab, the prayer CTA has gone quiet (`ctaQuiet`),
  tour behind her. **3 steps**: Plan tab icon → Explore pill → the how-are-you-feeling
  row, CTA "Start Exploring".
- `self` entry — she found the Plan tab herself: **2 steps** from the Explore pill.
- Each step renders only over its own focused screen. Four parties are wired together
  (PrayerScreen, TabBar, PlanScreen, host) — see the header comment in
  `PlanGuideContext.tsx` before changing any of them.

Spotlight alignment is the thing the owner checks first. Measure the anchor, not a
guess; re-measure after any scroll or segment switch the guide itself triggers.

---

## 8. Prayer flow & the weekly screen

**Files** — `src/screens/PrayerFlow.tsx`, `src/components/WeeklyProgressView.tsx`,
`src/screens/PrayerScreen.tsx` (home).

- The flow is a `fullScreenModal` route; the weekly screen is an absolute-fill overlay
  *inside* it (`showWeekly`), not a route. So: no `entering`-only animations you can't
  fall back from, and anything that navigates away must decide between `navigate` and
  `replace` deliberately.
- Morning vs evening drives everything: palette, hero Lottie (first prayer of the day =
  growing sapling, both done = looping streak fire — the fire's end frame is empty, so
  it must loop or it looks like it vanished), headline tier, banner photo.
- "Days prayed this week" counts **days, not sessions**: morning + evening on one
  calendar day is one day.
- `showNext` (today's Gospel & Psalm outstanding) is **frozen at mount** — the screen is
  a snapshot of the session just finished, and a midnight rollover while she lingers
  used to morph Back into a NEXT card for the new day.
- Current layout, top to bottom: headline → white card (Lottie, "Your Nth day of
  prayer" line, the weekday row, the reminder CTA when reminders are off) → **Gospel &
  Psalm banner** → **quiz card** → the way out.
- The banner (owner 2026-08-09): 100 pt — half the old NEXT card — the bundled day/night
  photo cover-cropped, veiled by a left→right white gradient (solid under the serif
  title, thin on the right), the plan name only, and a breathing accent arrow. **The
  whole strip is one target**; the arrow is decorative on purpose, because a nested
  button would carve a dead zone out of the banner. No Continue button.
- Day cells are **squares** (38×38, radius 11 — at radius 13 a 38×38 box reads as a
  circle) with **bold** letters. A prayed day gets a yellow fill; a fully complete day
  shows the fire glyph, a partial day the praying hands; today additionally gets an
  accent ring.
- The quiz card here is the home card verbatim, and taps `navigate('Quiz')` — **not**
  `replace`, so backing out of the quiz returns her to the banner instead of dumping her
  home with the reading silently skipped. The Gospel & Psalm banner *does* `replace`,
  because the prayer flow is finished at that point.
- Home screen: the prayer CTA breathes; when it goes quiet (prayed, or slot locked) the
  animation hands off to the rhythm bar / the Start button, and stops entirely once all
  5 progresses are done.

---

## 9. Paywall / IAP / remove-ads

**Files** — `src/services/iap.ts`, `src/screens/RemoveAdsScreen.tsx`,
`src/state/removeAdsPrompt.ts`, `src/components/RemoveAdsPromptHost.tsx`,
onboarding's paywall step in `OnboardingFlow`.

- One "ad-free" entitlement, granted by any of three products (same ids on both
  stores): `herbible_remove_ads_lifetime` (non-consumable),
  `herbible_premium_annual` (P1Y), `herbible_premium_monthly` (P1M). No backend — trust
  the store client.
- Proactive pitch cadence (owner 2026-08-08): ask #1 is onboarding's paywall step;
  **ask #2 on her second _active_ day, straight after the first interstitial she watches
  that day**; then every `REMOVE_ADS_REPEAT_DAYS = 7` days on the same trigger. Active
  days, not calendar days — install Monday, return Friday → Friday is day 2.
- Each ask runs day one's two-stage rhythm: full paywall → if she closes it, the
  **7-day-free-trial sheet** (same geometry as onboarding's, swipe-down dismissible).
- The host yields to `nudgeActive()` — it navigates to a full-screen route, which would
  otherwise land on top of (Android) or underneath (iOS `fullScreenModal`) a live sheet.
- Declining still **spends the day's ad slot**, so she is asked once, not on every ad.
- A payer is never pitched again (`adsRemoved` short-circuits everything).

---

## 10. Notifications, reminders, widget

**Files** — `src/state/NotificationsContext.tsx`, `notifeeReminders.ts`,
`reminderContent.ts`, `ReminderInterstitialContext.tsx` (the Follow-Him pre-tab gate),
`SetReminderTimeContext.tsx` + `SetReminderTimeHost.tsx`, `WidgetInstallHost.tsx`,
`widgets/*`.

- Permission is asked behind an **in-app rationale**, never cold. We cannot query
  "would the OS grant this?" — only whether it already is granted, which is what
  `permissionGranted` means.
- Reminder re-ask: **daily** (see §4), not an escalating gap.
- Follow-Him is a **pre-tab full-screen gate** for notifications-off users, re-derived
  on every foreground. It replaces the tab tree, which unmounts every home-hosted
  trigger — hence the coordinator's safety valve. It must not silence the coordinator
  beyond its own lifetime (owner: "it can't be allowed to kill the coordinator").
- Widget: `react-native-android-widget`; `WidgetSync` mirrors the hero verse + bg;
  ~1 MB RemoteViews limit; locked 4×2. `WIDGET_PRESENT_KEY` is written by the task
  handler when a host actually renders an instance — that is the only reliable
  "she has one" signal.

---

## 11. Content & data pipeline

- Static content (verses, plans, book lists) lives in `src/constants/`; shared
  primitives in `src/components/shared/`.
- **Two R2 buckets, on purpose**: `herbible-plans-7languages` →
  `covers.everlandapps.com` (plan covers, badge art, prayer audio, legal pages) and
  `herbible-quiz` → `quiz.everlandapps.com` (`/v1/quiz-<lang>.json`).
- Both are **path-versioned**. A custom domain puts Cloudflare's cache in front, so
  re-cut content under the same key can serve stale for a long time — **bump the `/v1/`
  segment, never purge, never per-file SHAs**.
- R2 uploads use `wrangler`. If `CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` /
  `CLOUDFLARE_API_KEY` is set in the shell, wrangler ignores `wrangler login` and a
  stale token 401s forever.
- Cost matters: R2 direct (zero egress). Do not add billable Cloudflare image
  transforms where the original is already cached (`PlanCover` `noTransform`).
- The Cloudflare Access service token (`herbible-app`) is **non-expiring by design** —
  it is inlined into the shipped binary, so rotating it means a release plus waiting for
  users to update. Its `Last Seen` column answers "can live users still reach the plans
  Worker".
- Audio: R2 prayer-bg `m4a`/`mp4` must be `ffmpeg -movflags +faststart` or expo-audio
  silently fails.
- Commentary corpus, per-language style contracts and the `CORPUS_COMMIT` bump workflow
  are covered by the memory notes and `docs/plan-subsystem-handoff.md` — run
  `node scripts/verify_alignment.mjs` after any content change.

---

## 12. Release

Full procedure in `docs/release-build-runbook.md`. The parts that get forgotten:

- **Always build BOTH platforms** — `npm run build:all`. Never hand over an
  Android-only command.
- `eas-cli` is installed nowhere; every EAS command goes through
  `npx --yes eas-cli@latest` (which the `build:*` / `submit:*` scripts already do).
- **Propose the version number and edit it in the same pass** — semver against what
  shipped (new user-facing feature → minor, fixes only → patch). Version lives in
  `app.json` and nowhere else; the Profile footer reads
  `Constants.expoConfig?.version`. `versionCode` / `buildNumber` are remote +
  autoIncrement — never edit by hand.
- `android/` is CNG-gitignored; everything Android-native is a config plugin
  (notifee maven, KGP pin, fbsdk placeholders — the app crashes without those).
- `play-service-account.json` is only needed for `eas submit -p android`.

---

## 13. Mistakes ledger

One line each, with the lesson. Read before declaring a change done.

| What happened | Lesson |
|---|---|
| Rate prompt's "Yes" did nothing — three separate causes: a swallowed rejection into a dead `storeUrl()` fallback; `markYes()` firing *before* the handoff, permanently silencing the prompt; and Play's `launchReviewFlow` resolving **without showing anything** | Never mark a one-shot flag before the thing succeeds. Play offers no API to ask whether the sheet appeared — infer it (`AppState` probe + elapsed time) and verify the API is really in the AAB (`launchReviewFlow` in `classes3.dex`) |
| Quiz progress bar ran off the right edge | `width: '100%'` measures against the parent, not the space left after margins |
| Mood calendar header said July over an August grid | Hermes Android `toLocaleDateString` rendered a local-midnight `Date` in UTC — anchor at noon |
| Loading backdrop showed a sharp strip over grey | A truncated JPEG was left under the final cache name — `.part` + validate + rename |
| I added an emulator ad gate the owner had never asked for | Live units in dev is a **settled decision**. Don't "protect" the owner from his own spec |
| The whole prompt system only worked by luck | `setPromptRoute` was fed from `onStateChange` alone, which RN Navigation skips on first mount. Seed from `onReady` too |
| A regex inserted `dismissRef.current = dismiss;` **inside** the dismiss body — valid JS, tsc green, hardware back silently dead | Never patch code with a regex you haven't proven on the real text. Read the file back |
| `notifyDismissed` not deleting the request → instant re-grant; deleting it then broke the multi-badge queue | Fix the root cause, then re-check every consumer of the thing you changed |
| Three hooks landed below an early return while fixing the above | Scan for it explicitly; a conditional hook throws the moment the condition flips |
| A python heredoc with non-ASCII inside a `b"""` literal; a non-greedy `[\s\S]*?;` matching the first `;` inside a function body; a single-line import regex missing multi-line import blocks | Assert before writing, and assert on a **unique** match. A patch script that fails an assertion and writes nothing is the good outcome |
| Claimed a card had been edited when the patch script had aborted | Verify the write, not the intent |

Longer-standing patterns (CDN/slug curl-verify, layout container traces, shared-value
reset at OPEN, real-data audits, audit-before-fix, never touching the owner's tree,
hash-keyed caches, multi-method audits) live in the memory note
`mistakes_to_never_repeat.md` — that list and this table are meant to be read together.
