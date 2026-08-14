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

**Before you audit overlays for a "taps do nothing" report, decide which half of the
problem you have** — the two look identical and need opposite fixes:

- the touch never arrives (something is over the target, or its native hit region is
  stale), or
- the touch arrives and `navigate` does nothing.

Nothing in a screenshot or an overlay sweep distinguishes them, and guessing has now cost
two rounds on the same bug. Two ways to tell them apart:
- **On device:** does the row show its press feedback (`activeOpacity` dim)? Dim = the
  touch arrived. No dim = it never got there.
- **From the field:** every home-screen navigation logs `home_nav_tap` (PrayerScreen's
  `navTap`), and `logScreenView` already fires on every navigation-state change. In
  DebugView, `home_nav_tap` with no `screen_view` behind it means the tap landed and the
  navigation was dropped; no `home_nav_tap` at all means the touch never reached the row.
  Keep both — one event per deliberate tap is what makes this decidable at all.

**Class 4 is not an overlay at all: a Reanimated-owned subtree with stale hit regions.**
See §3 and `entranceSettle.ts`. It is the one that produces "the whole home screen
sometimes eats taps", because every `TabSection` re-arms together on focus.

Three classes of bug have each made the app dead to touch. Check all three whenever you
add anything that floats.

1. **RN `<Modal>` is its own native window** and swallows every app touch while
   mounted — even fully transparent, even zero-opacity. Twice the cause of
   "the screen stopped responding". Prefer a root-mounted absolute-fill view.
   When a Modal is unavoidable, **conditionally mount the element itself**
   (`{open && <Modal visible …>}`) — never toggle `visible` on a kept-mounted
   Modal. On iOS `_shouldShowModal()` is `visible || isRendered`, and
   `isRendered` clears only on the native onDismiss; if that callback is dropped
   (an app switch mid-dismiss — **sharing to WhatsApp/Instagram is exactly this**)
   the transparent window stays up forever with `onStartShouldSetResponder →
   true`. The conditional-CHILD fix protects sheetDepth but NOT the window;
   unmounting the element tears the window down regardless of `isRendered`.
   Applied to PrayerScreen (share + comments), PrayerFlow (share), PlanDayWalk
   (note + share) on 2026-08-13, after "I shared, came back, and the home screen
   was dead".
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

### The seven rules for anything that floats (pre-release audit, 2026-08-09)
A colourless, full-opacity, full-screen `View` with default `pointerEvents`
**swallows** touches — it does not pass them through (`LoadingOverlay` proved this).
Almost every overlay in this app is exactly that shape, with the dim colour on an
*animated child*. So:

1. **`pointerEvents="box-none"` on every overlay root.** Then the root itself can never
   capture; only the backdrop (a deliberate dismiss target) and the sheet do. If an
   entrance drops, the app stays usable instead of dead.
2. **Never `entering=` / `exiting=` inside an RN `<Modal>`** — and every shared-value
   entrance gets a **watchdog** that snaps it into place. `ShareVerseSheet` shipped for
   months as `entering={SlideInDown}` inside a Modal: one dropped animation was a
   screen-wide invisible shield in its own native window with no way out but relaunching.
3. **The dismiss target must not live inside the animated wrapper.** On iOS a view with
   `alpha <= 0.01` and its whole subtree are not hit-testable, so a backdrop stuck at
   opacity 0 takes its own close button with it.
4. **Every transient `<Modal>` must claim `useSheetSurface(open)`** — including the little
   hint/menu/confirm ones. Presenting a second native window over one that is already
   presenting is unrecoverable: RN sets `_isPresented = YES` before it knows UIKit
   accepted, and its later dismiss then targets the wrong window.
5. **Render a Modal's children conditionally, not just its `visible`.** On iOS
   `_shouldShowModal()` is `visible || state.isRendered`, and `isRendered` clears only on
   the native `onDismiss` — which never fires if `visible` flipped false before the
   presentation finished. A stranded child that holds `useSheetSurface` leaves
   `sheetDepth` at 1 and silences every prompt for the session.
6. **A `pointerEvents` blocker must be gated on the thing that makes it VISIBLE**, not on
   its own mount. Both spotlight shields were live while the scrim's opacity was still 0
   — invisible-and-dead, exactly "the screen sometimes ignores me, then recovers".
7. **Never put a translucent `backgroundColor` on a view that also has
   `elevation`.** Android's elevation shadow takes its outline from the view's
   background drawable, so a full-screen dim with `elevation: 60` casts a 60dp-scale
   shadow whose penumbra bleeds *inside* its own left and right edges — and at 45 %
   opacity you see it through itself: symmetric dark vertical bands over the content,
   lighter in the middle (owner photographed it on the widget dialog, 2026-08-09).
   Put the dim on the backdrop child; a background-less view has an empty outline and
   casts nothing, while still taking part in elevation ordering. Rule 1 already asks
   for that shape, which is why only the two hosts that predated it were affected.
8. **Never arm a `BackHandler` on state that outlives the screen.** `BackHandler` runs
   subscriptions last-registered-first, ahead of the navigator's, so a handler left armed
   eats the first back press on every other screen in the app.

### Keyboard
`edgeToEdgeEnabled: true` means the Android window does **not** resize for the IME, and an
absolutely-positioned overlay never moves on iOS either. Any bottom-anchored sheet with a
`TextInput` therefore needs the live keyboard-height listener and `paddingBottom: kbHeight`
— copy `SignInSheet`, which is the reference fix for exactly this (it was a reported P0,
and `ProfileScreen`'s edit-name sheet then shipped with the same bug). `KeyboardAvoidingView`
is not used in this repo; it was unreliable across Androids. Any scroll containing tappables
while a keyboard is up needs `keyboardShouldPersistTaps="handled"`, or the first tap is
swallowed as a dismissal. `Keyboard.dismiss()` alone leaves the input focused on Android —
always `blur()` first if any state mirrors "the keyboard is up".

---

## 3. React / RN traps that have actually bitten us

- **Reanimated layout animations (`entering=`) do not reliably run inside a Modal on the
  new architecture.** Use shared values + `useAnimatedStyle`. Give every entrance a
  watchdog so a dropped timing ends visible and tappable rather than stranded
  off-screen.
- **Reanimated-owned views can freeze native touch regions on Android/Fabric.** Wrap
  tappables in an animated view only for the entrance, then hand back to a plain `View`
  once it settles (`QuizOptionsEntrance` is the reference implementation).
  This is the mechanism behind "the home-screen cards render but eat taps", and it is
  worth knowing in detail because it keeps coming back:
  - While a view carries an animated style, Reanimated pushes props straight to the
    native view and the subtree's hit regions stay pinned to the **attach-time** layout.
    Anything that moves afterwards is drawn in the new place and tappable in the old one.
  - `useTabFocusEntrance` bounds the window two ways: the animation's own completion
    callback, and an **early detach on any layout shift** (`entranceMustSettle`).
    `onLayout` comes from the shadow tree, so it still fires when the UI thread is busy
    decoding images — which is exactly when the entrance runs long and the window is
    widest. **The early-detach path is the reliable one; treat it as load-bearing.**
  - **The layout baseline must never be reset on re-focus.** It was, and that one line
    meant the first real shift of every later focus was consumed as a fresh baseline
    instead of triggering the detach — with usually no second layout pass behind it, so
    the section stayed Reanimated-owned for the rest of the entrance.
    `__tests__/entranceSettle.test.ts` demonstrates the miss; don't "tidy" it away.
  - Every `TabSection` on a screen re-arms **together** on focus, which is why the
    symptom is "the whole screen sometimes", not "one card".
  - The detach itself needs a React commit, so a blocked UI thread also delays the
    recovery. Shortening what the entrance owns beats lengthening the watchdog.
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
- **react-native-share's iOS `shareSingle` is a minefield (v12.3.1, sources read
  2026-08-13).** Three traps, all shipped as bugs once: WhatsAppShare.m returns
  **without resolving or rejecting** when `message` is absent (the await never
  settles → any `busy` flag guarding it freezes forever — pass `message: ''` on
  iOS and wrap every call in a timeout race); RNShare.mm's `isImageMimeType`
  only recognises `data:image` URLs, so a `file://` capture routed Instagram to
  a deep link with the file path pasted in as a Photos LocalIdentifier —
  Instagram opened on the camera roll's latest photo and the promise
  **resolved(true)**, logging a success (iOS Instagram now saves to Photos
  first, then opens `instagram://library`); and a resolved promise generally
  means "a URL was opened", not "the user shared". Android's implementation is
  a real `ACTION_SEND` with a `content://` stream and is fine — the forks in
  `ShareVerseSheet.shareSelected` are iOS-only on purpose.
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
`streakGuide 35` · `planGuide 38` · `bibleGuide 39` · `moodCheckIn 40` · `login 50` · `widgetInstall 60` ·
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
| `nav_churn` | **more than 5** screen switches **and** ≥ 60 s since an ad actually presented (owner 2026-08-09). Counts **every** switch — no tab-run collapsing, **no day gate**. Fires on the transition that crosses the threshold |
| `app_open` | hot start after ≥ 15 s backgrounded, **every user from day 0** (owner 2026-08-08). `suppressNextHotStart()` exempts the store-review excursion for 10 min |
| `quiz_retry` | every tap of "Try those again", **uncapped** by design, 400 ms delay |

Why two nav rules and not one tuned rule: `nav`'s tab-run collapse means pure
tab-hopping (`prayer→bible→plan→profile→…`) scores **+1 for the whole run** and
essentially never reaches its threshold — the most common idle-browsing pattern in the
app was unmonetized. `nav_churn` counts raw switches to catch exactly that, and pays for
the extra reach with a 60 s quiet period (2× the global floor) instead of a day gate.
The two counters are independent; when both come due on one transition only **one** ad is
requested and **both** counters reset. All of it lives in the pure, tested
`reduceNavigation()` — 16 cases in `__tests__/adFrequencyNav.test.ts`. Change the rule
there, not inline.

`nav_churn` reads `msSinceLastInterstitial()` from `interstitialVisibility.ts`, the one
shared clock stamped by all three show paths at the moment an ad **really presents**. The
paths' own `lastShownAt` variables stay private — **if you add a fourth show path, call
`noteInterstitialShown()` there too**, or every trigger gated on the clock will believe no
ad has ever shown and fire on the spot.

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
- **First-ad value exclusion (owner 2026-08-13).** The install's first-ever SHOWN
  interstitial fires `ad_impression_custom` **without** value/currency/precision
  (`value_omitted: 'first_open_ad'` instead) — this is the buy-side event Google Ads
  tracks, and day-0 first-ad revenue must contribute zero to value bidding. Only this
  event is affected: the reserved `ad_impression`, `Total_Ads_Revenue_001`, the AdLTV
  tiers and the ladder's own bookkeeping all still see the real money. The latch
  (`adEngine:firstAd:v1`) burns at SHOW time so a lost PAID can never shift the
  suppression onto a later ad. Full rationale at FIRST-AD VALUE EXCLUSION in
  `adEngine.ts`.
- Never parse a localised number string — decimal separators differ by region (pt-BR).
- iOS is untouched by this engine.

### Order of operations
`ensureAttRequested().finally(initAds)` in `App.tsx`. ATT before ads init — keep it.
UMP runs in parallel. The US floor ladder is gated `region === 'US' && !__DEV__`.

### Nothing heavy and native runs during the cold start
Play ANR on 1.2.0 (realme Note 70 / Android 15, *Input dispatching timed out — no
focused window*): `initIap()` at launch made **expo-iap build its native
OpenIapModule synchronously on the MAIN THREAD** (`SynchronizedLazyImpl.getValue` →
`OpenIapModule.<init>` under `Handler.handleCallback`), standing up the Play
BillingClient and binding to the Play Store service. On a slow device that blew the
5 s input-dispatch budget before the first frame had focus.

- **`InteractionManager.runAfterInteractions` is not protection.** It waits for JS
  interaction handles; a native module that hops to the main thread afterwards is
  entirely outside it. Everything in that block at startup — ads, IAP, anything
  new — has to be judged on what it does natively, not on where it sits in JS.
- IAP now initializes **10 s after the launch overlay dismisses**, which also clears
  the onboarding questionnaire (a first-run user is tapping through it right after
  the overlay, and a Billing bind under her finger is the same ANR with focus).
- The launch pass could not simply be deleted: it drains purchases completed while
  the app was dead and `finishTransaction()`s them, and **Play refunds an
  unacknowledged purchase after 3 days**. It also re-grants the entitlement when
  AsyncStorage was cleared. Nothing at startup needs it — the ad-free flag comes
  from AsyncStorage, and both paywalls call the idempotent `initIap()` themselves.

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
- Question **19 / lineHeight 30** on the full screen, **17.1 / 27** on the card (owner
  −10 % there, 2026-08-09), +3 px left inset on both.
- Options carry a **1 px `INK_10` hairline and NO shadow** (reversed 2026-08-09: the
  shadow was too faint to read as an edge on the white card, so the options looked like
  floating text). The answered states paint the border with their fill so no seam shows,
  and `tried` clears it rather than clearing a shadow. `tried`'s *disabling* belongs to
  the CALLER, not to `QuizOptionButton` — the card passes `disabled={false}` so every
  option can hand off, and folding `tried` in from the inside made a greyed option on a
  retry round a tap that did nothing at all.
- Options slide in from the right, 0.1 s stagger, 0.5 s total, mount-keyed
  `round:position` so a retry replays it. Shared values with a handback (§3).
- Segment bar directly under the title, height **7.2** on the card (+20 %, owner
  2026-08-09), 6 elsewhere. Never give the track a `width: '100%'`.
- The compact "See results" state is **a plain View card with two SIBLING targets** — a
  `Pressable` on the header row and another on the CTA — never one card-wide touchable.
  The owner reported that a card-wide target did nothing; the small-header shape is the
  one configuration he demonstrated working. A first fix blamed nesting a
  TouchableOpacity's legacy Animated view inside TabSection's Reanimated one; that theory
  is wrong (`useTabFocusEntrance` hands the view back to plain RN on BLUR, and there is
  no `freezeOnBlur`, so the compact layout commits un-owned), and it is recorded here so
  nobody re-derives it.
- Verdict: +20 % bold, floats up 30 px over 0.4 s, rendered **below** the options so the
  card grows downward and nothing she is looking at moves.
- Results screen: no level title, no top bar, no medal ring, no score line, no
  "Level N complete". Keeps "PUZZLE PIECE UNLOCKED", the board at 15 dp side margins
  with **dashed** seams (`strokeDasharray="7 7"`), locked quarters showing the art
  through a wash plus a solid lock, the mystery bar with an in-fill count, and a single
  "Next Level" button.

---

## 6b. Explore search (Plan tab)

**Files** — `src/services/planSearch.ts` (pure, unit-tested),
`src/components/plan/PlanSearchField.tsx`, `src/components/plan/PlanSearchResults.tsx`,
wired in `src/screens/PlanScreen.tsx`. Tests: `__tests__/planSearch.test.ts`.

### Shape (owner 2026-08-09)
A **persistent field** at the top of the Explore segment — not a magnifier, not an
overlay. Field unfocused and empty → the normal browse layout. **Focused and empty** →
the 12 suggestion chips + all 5 categories. **Query** → results. The field scrolls with
the page, because this screen pins nothing (restructuring it would move the plan guide's
spotlight anchors).

### What it is for, and what it refuses
Search serves two jobs: finding a plan by name, and finding a topic. The mood row covers
9 emotions (31 plans); **the other 82 have no keyword entry point at all** — that is the
feature's real value. It deliberately has **no duration or length filter**: 107 of 113
plans are 3–7 days and `minutes` is only ever 7 or 8, so a length filter returns either
almost everything or the 6 outliers. That is a content-shape fact, not a UI gap.

### Matching
Five weighted fields: `title 6`, `topic 4` (the app's own localized section + sub-tab
label), `chip 3` (the localized onboarding topics a plan answers to, via the inverted
`TOPIC_TAGS`), `desc 2`, `slug 1`. Score desc, ties by the personalized curation order.
- `foldText` = NFD + strip combining marks + lowercase. `oracion` ≡ `oración`.
- **CJK is not tokenized** — substring, and `minQueryLen` is **1** for CJK/Kana/Hangul.
  `bibleService.ts`'s blanket `q.length < 2` is the bug not to repeat.
- **Latin queries of ≤ 3 chars must match at a word start.** German "Ehe" (marriage) as a
  raw substring matched 37 of 113 plans (it hides inside *geschehen*, *verstehen*,
  *Beziehungen*) — our own chip was promising a topic and delivering spelling accidents.
  At 4+ chars mid-word matching is an asset (it is how "Angst" finds *Zukunftsangst*).
- The `chip` field is why a word the catalog never uses still works: nothing says
  "sleep", but `TOPIC_TAGS.sleep` points at anxiety-fear / weariness-burnout / soul-care.
- `isSearchable()` is the ONE predicate the view and the analytics both use, so a single
  Latin letter neither flashes "no results" nor logs a failed search.
- Deliberately **not** indexed: `primaryLabel` / `secondaryLabel` (drifted CDN strings —
  17 distinct primary labels for 5 sections), `id`, `duration`, `minutes`.
- No fuzzy matching in v1. Measured: the real failure mode is *vocabulary*, not spelling,
  and the chip field fixes that properly. `plan_search_no_results` will say whether typos
  matter before we spend anything on them.

### Two screen-specific hazards (both handled — do not undo)
1. **`plan` IS in `TAB_ROUTES`** (`promptSurface.ts`), so a nudge can paint over a live
   search field with the keyboard up. PlanScreen holds `useSheetSurface(searchActive)`.
2. **The plan guide burns its once-ever flag on display**, and its step-3 anchor is the
   mood row — which results would unmount. While `guide.stage !== 'idle'` the field is
   disabled and any query is cleared.
Also: the page `ScrollView` needs `keyboardShouldPersistTaps="handled"`, or the first tap
on a chip is swallowed as a keyboard dismissal and the blur unmounts what she was
reaching for.

### The keyboard rules (all three exist because of a real failure mode)
`sheetDepth` in `promptSurface.ts` is a **global counter**, and PlanScreen — unlike every
other `useSheetSurface` caller — **never unmounts**. So the hold must be bounded by an
actual keyboard session:
1. Gate on **`searchFocused && useIsFocused()`**, never on "has text". Leaving a word in
   the field or switching tabs while focused would otherwise hold the count for the rest
   of the session and silence *every* blocking prompt in the app.
2. Every exit goes through **one `blurSearch()`**: `blur()` **before**
   `Keyboard.dismiss()`. A bare `Keyboard.dismiss()` hides the keyboard on Android while
   the input keeps focus, so `onBlur` never fires and the flag stops matching reality.
3. **Switching segments unmounts the field**, and React Native does not reliably fire
   `onBlur` for a TextInput unmounted while focused — so the tab change calls
   `blurSearch()` explicitly.
Android hardware back leaves search before it leaves the screen (`BackHandler`, armed only
while searching). Note `edgeToEdgeEnabled: true`: the window does not resize for the
keyboard, so the field is at the TOP of the body on purpose and the results scroll under
the keyboard. No `KeyboardAvoidingView` — this repo has found it unreliable on Android.

### Behaviour details
180 ms debounce (not for the main thread — 113 bundled objects is sub-millisecond — but
to stop the list flickering mid-word). Results capped at 30 rows + "show all N", because
each row mounts a `PlanCover` that hits the CDN. The query **survives a re-focus** on
purpose: search → open a plan → back should not lose it. A result tap dismisses the
keyboard and warms `loadPlan(slug)` so the detail screen renders from cache.
No-results shows the chips and categories, so a dead end becomes a way to browse.

### Analytics (owner chose full funnel with the search term)
`plan_search_open` · `search` (`search_term` truncated to 100, `content_type`, `lang`,
`result_count`) · **`plan_search_no_results`** — the only channel through which "she keeps
looking for X and we don't have it" reaches us · `select_item` (with `rank`, so clustered
low ranks mean the weights are wrong) · `plan_search_suggestion_tap`. One event per
*settled* query, deduped — never per keystroke.

---

## 7. Guides & spotlight tours

**Files** — `src/components/shared/SpotlightCoach.tsx` (the shared overlay),
`src/state/FirstRunTourContext.tsx` (+ `measureRefInWindow`),
`streakGuide.ts` / `StreakGuideContext.tsx` / `StreakGuideHost.tsx` / `…Trigger.tsx`,
`planGuide.ts` / `PlanGuideContext.tsx` / `PlanGuideHost.tsx` / `…Trigger.tsx` /
`PlanGuideSelfTrigger.tsx`,
`bibleGuide.ts` / `BibleGuideContext.tsx` / `BibleGuideHost.tsx` / `BibleGuideTrigger.tsx`.

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

### Bible-reader guide (once ever, 5 steps) — owner 2026-08-09
Fires on her **first ever visit to the Bible tab**, whenever that is: day 0 or day 30.
Deliberately **no day or engagement gate** — a woman who finds the reader on day 3 needs
it more, not less. Gated only on the once-flag and on the chapter having verses, because
four of the five anchors live in or below the verse list and step 5's CTA is not rendered
at all without them; starting against a spinner would bail out through `onUnmeasurable`
and burn the once-flag on a tour she never saw.

Steps, in screen order: header tools (search / bookmark / **T**) → book menu → narration
FAB → the real verse toolbar → Mark-as-Complete.

Three things here are new machinery, not just new copy:

- **`interactiveHole` on SpotlightCoach.** The books step invites her to tap the button
  it highlights, so the single full-screen shield becomes **four bands around the hole**.
  Highlighting a control that then swallows her tap is the dead-tap failure in §2, and it
  is worse inside a tutorial. The bands come from the settled `target`, not the animated
  shared values, so during the close-in the touch hole is *smaller* than the visible one —
  erring that way is deliberate. Any step that turns this on **must** own what the exposed
  control opens: it will paint over the overlay.
- **The drawer closing IS the books step succeeding.** She used the control; re-explaining
  it would be insulting. `bibleGuideAfterDrawer()` returns the next step for `books` and
  `null` for every other stage — the audio player's queue button opens the same drawer, and
  she can open it before the tour ever starts. The transition runs **outside** the
  `setState` updater against a ref mirror; inside it, a double-invoked updater would log
  twice and re-enter the step.
- **Two screen effects the guide drives.** Step 4 opens the *real* toolbar on verse 1
  rather than describing it — `openVerseToolbar()` was split out of `handleVerseTap` for
  this, because tapping an already-selected verse would *close* it. It scrolls to the top
  first and selects only after that settles: `onReaderScroll` clears the selection on any
  scroll, so selecting first would wipe the toolbar in the same beat. Step 5 rides the
  chapter down with `scrollToEnd`. Both wait (≤1.2 s) for verses first, since step 2 may
  have left the reader re-fetching a book she just switched to.

Step 5's hole is **not** interactive on purpose: its anchor marks the chapter read, and a
tour that teaches a button must not press it for her.

Copy rule: **every bolded span names a real control, and each language must reuse that
control's own label character for character** (`verseToolbar.*`, `bibleReader.markComplete`),
with **T** kept as the Latin letter everywhere — it is what is printed on the button. The
translator notes in `sourceCatalog.ts` say so; a guide that calls a button something the
button doesn't say is worse than no guide.

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

## 8b. Prayer audio — background music and the narration

**Files** — `src/state/PrayerBackgroundsContext.tsx` (music), `src/screens/PrayerFlow.tsx`
(both players + the coach mark), `src/state/listenGuide.ts` (pure guide rules),
`__tests__/listenGuide.test.ts`.

Two players run at once and always have: background music at volume 0.8 and the
narration on top. The audio session is configured app-wide to MIX, not duck.

### Background music
- CDN: `https://covers.everlandapps.com/backgrounds/manifest.json`, files at
  `…/backgrounds/audio/<morning|evening>/<file>.m4a`. Adding a track means adding a
  filename to that manifest — **no app change**.
- **Rotation is SEQUENTIAL**, one track per calendar day in list order, wrapping
  (`pickSequential`). The hash pickers were deleted on 2026-08-09: a hash on a
  3–5 item list repeats some tracks before others are ever heard, and `audioFor`
  was hashing while the prefetch was already sequential, so the pick usually
  missed its own cache and fell back to "any leftover file".
- `audioFor` NEVER returns a remote URL — cached file, then any cached file for the
  slot, then the other slot's, then the bundled asset. Silence is not an option;
  the prefetch pulls today's and tomorrow's pick in the background.
- Any new `.m4a` must be `ffmpeg -movflags +faststart` or expo-audio fails silently.

### Narration ("Listen")
- **It does not auto-play** (owner 2026-08-09). Entering a prayer gives her music
  and nothing else; the top-chrome Listen button is the only way in. Do not
  reintroduce an auto-start — the coach mark below exists *because* of this choice.
- Shown only where narration exists for the UI language and that verse
  (`isDailyVerseAudioAvailable`), and disabled until the clips resolve.
- **Coach mark**: one `SpotlightCoach` step on the button, one "Got it" button (no
  counter, no skip — `SpotlightCoach` renders neither when omitted). Offered on her
  **first-ever flow**, or after **four completed flows** with no narration, **twice
  in a lifetime**, and retired for good the moment she plays it. The show is burned
  on DISPLAY so a force-quit cannot hand out the same one twice. It only raises once
  `listenOk && readUris` — spotlighting an absent or disabled button would frame
  empty chrome. The measurer sits on the button itself (a touch responder is never
  view-flattened on Android, which a wrapper View would be).
- Counting **completed** flows, not opens: backing out immediately says nothing
  about whether she wanted narration.

### Analytics
| Signal | Meaning |
|---|---|
| `prayer_audio_play` | narration actually started. Once per flow, not per resume. Params `slot`, `lang`, `step`, `source`. |
| **user property `prayer_audio_user = 'yes'`** | she has listened at least once, ever. This is how "how many users use narration" is answered — a segment, not a distinct-count on an event. |
| `listen_guide_shown` / `listen_guide_ack` | the coach mark, with `reason` (`first_flow` / `four_flows`) and `slot`. The pair measures whether the guide converts. |
`bible_audio_play` is the Bible reader's own, unrelated event — do not conflate them.

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

- The notification ask is **aggressive on purpose** (owner 2026-08-09, after showing a
  competitor's flow — the polite version was "太 mild"). `SetReminderTimeHost` fires the
  **real OS dialog with nothing of ours on screen first**; only a refusal gets an in-app
  card, and that card leads to `PermissionCoachOverlay` → `openNotificationSettings()`.
  We cannot query "would the OS grant this?" — only whether it already is granted, which
  is what `permissionGranted` means.
- **We DO draw over the Settings app now** — `modules/expo-settings-coach`, an Expo
  module that adds a `TYPE_APPLICATION_OVERLAY` window with our icon, our name and the
  switch label. This reverses what this section said until 2026-08-09 (owner asked for it
  twice; the earlier text argued against it). What is worth keeping from that argument:
  - It needs `SYSTEM_ALERT_WINDOW`, which is why that permission moved out of
    `blockedPermissions` into `permissions`. **A permission must be in exactly one of
    those two lists** — `withBlockedPermissions` runs first and strips matches out of
    `permissions`, so leaving it in both silently drops it from the manifest.
  - It is an **enhancement, never the path**. Without the permission the flow is the
    in-app card + deep link, which works on every device and every OS version. The CTA
    never diverts to asking for the overlay permission.
  - **It may simply not appear.** From Android 12 an app can call
    `Window#setHideOverlayWindows(true)`, and Settings does that on some permission
    screens to block overlay tapjacking. Where it does, the OS hides our card. That is
    not a bug to chase.
  - The card is **NOT_FOCUSABLE and NOT_TOUCHABLE**: pure decoration. With only
    NOT_FOCUSABLE, taps inside its rect were delivered to our window and dropped by
    non-clickable views — a dead strip at the bottom of Settings, and the exact shape
    the tapjacking mitigations exist to stop. Never add a tappable control to it.
  - A window that outlives our Activity needs three ways down: the native 25 s timer,
    `hide()` on our own foreground, and `hide()` on the host's **unmount** (the tab tree
    really does get swapped out mid-session here). And never clear the view reference
    before a removal that succeeded — a failed removal with no reference left is a
    window nothing in the process can take down.
  - `openNotificationSettings()` still deep-links to the app's notification page, whose
    first row IS the master switch — so there is no long list to hunt through, which is
    why we never needed the competitor's flashing-row trick (that highlight is Android's
    own, from the package extra; no app can touch another app's UI).
  - **Unresolved and the owner's call, not a code question:** whether Play treats
    `SYSTEM_ALERT_WINDOW` as needing a declaration form. Nothing in this repo documents
    it either way, and an audit could not verify it. Do not assert it in either
    direction from memory.
- Reminder re-ask: **daily** (see §4), not an escalating gap — but it stops for good
  once she picks a time. `SetReminderTimeContext.markConfigured()` is what stops it;
  it shipped unwired for months, so every prayer re-offered a time she had already
  set. Anything that lets her choose a schedule must call it.
- **"Has she scheduled a reminder" and "did the OS grant permission" are two
  different questions.** Gate the *set a time* ask on the schedule only; a denied
  permission must not make the app ask her to set a time she already set. When
  `enableReminderAt` returns false, escalate to the notification rationale — that is
  the screen that knows how to handle both a fresh OS dialog and a permanently
  denied one (system Settings), and it preserves the time she picked.
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

### Play's "recommended actions" — what we deliberately do NOT do
Checked 2026-08-09 against v1.2.0. Three of the four are noise or product decisions;
re-deriving this costs an hour, so it is written down.

| Play says | Verdict |
|---|---|
| **Deprecated edge-to-edge APIs** (`Window.get/setStatusBarColor`, `setNavigationBarColor`) | **Nothing of ours to change.** Every named call site is inside React Native — `StatusBarModule$b.runGuarded`, `StatusBarModule.getTypedExportedConstants`, `WindowUtilKt.enableEdgeToEdge`. Verified: `app.json` sets no `androidStatusBar` / `androidNavigationBar`, and the app's only StatusBar usage is `<StatusBar style="dark" />` (content style, not a colour). Deprecated ≠ broken: under edge-to-edge on Android 15 those setters are already no-ops, which is *why* RN calls `enableEdgeToEdge`. Goes away when RN does. |
| **Remove orientation/resizability restrictions for large screens** | Real, but a **product decision**, not a checkbox. `orientation: "portrait"` + `ios.supportsTablet: false` is the design, and every layout rule here assumes portrait phone widths. From Android 16 large screens ignore the restriction, so the consequence is that our layouts must merely *survive* landscape on a tablet/foldable — phones still honour portrait. Making the app genuinely landscape-capable is a project; do not start it inside a release. |
| **Bitmap image optimization** | **Already satisfied.** The puzzle collection grid uses the 420 px `thumb/` variant (`artThumbSource`); the 1200 px `full/` is only the detail view, the board and the share card. Glide *and* Fresco both appear because RN uses Fresco and a native dependency (widget / notifee) bundles Glide. Generic advice. |
| **R8 optimization** | "Optimization isn't enabled" means R8 **full mode** (Expo's default is compat); we already set `enableProguardInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds`. Full mode can strip what reflection-based libs need (Firebase, Reanimated, Notifee, Play Billing) and is only provable by building and exercising the app on a device. AGP 9.0 is not available on Expo SDK 54 either. **Never inside a release window** — its own build + test pass, or not at all. |

### Reading ANRs
Play's issue clusters only cover the ANRs it could collect a trace for. On v1.2.0 the
CSV export (Android vitals → the metric's ⋮ → Download CSV) showed **12** user-perceived
ANRs while the issue list showed **2**. Always export the CSV for the real volume, and go
to **Firebase Crashlytics** for the traces — it captures Android ANRs automatically via
`ApplicationExitInfo` on API 30+, and `@react-native-firebase/crashlytics` is already
wired with collection enabled.

### Crash triage ledger (Crashlytics batch 2026-08-13, 6 issues / 17 events)
Verdicts recorded so the next report starts here instead of from scratch. Method for
"can a dependency patch fix it": **download the patch tarball and diff the exact class
in the stack** — RN 0.81.6 and worklets 0.5.2 were both checked this way and neither
touches the crashing classes, so no upgrade theater.

| Issue | Verdict |
|---|---|
| `SurfaceMountingManager.getViewState` — "Unable to find viewState for tag" (7 users, 1.3.0–1.4.0) | **RN Fabric internal race — verified against the FULL trace** (owner exported issue `4f8a216f…`, session `6A7DA281…`, read 2026-08-13; the first verdict predated the export and said so). Hard facts from it: the fatal op is `addViewAt` → **parent** tag's viewState already gone, `Surface stopped: false`; the throw escalates because `dispatchMountItems` only soft-logs `ReactIgnorableMountingException` and RETHROWS everything else (MountItemDispatcher.kt:238); **all 179 threads carry zero app frames** and `mqt_v_js` was idle-polling at crash time, so the batch was not a JS-side commit; device was MIUI, session had live audio streams + AdWorkers + a WebView. Unchanged in 0.81.6 (tarball diffed). Two in-app suspects CATALOGUED, not accused: `PlanCategoryScreen`'s FlatList runs `removeClippedSubviews` (clip-culling is the classic parent-gone-mid-batch source), and 6 `exiting=` layout animations (BibleScreen ×3, PlanDayWalk ×2, ProfileScreen ×1 — exit animations delay removal on Fabric). **Decision rule:** when `last_screen` data arrives, if crashes cluster on one of those screens → drop `removeClippedSubviews` / convert that screen's `exiting=` to shared-value fades. No blind mutation before attribution |
| `MainApplication.onCreate` — SoLoader "couldn't find DSO: libreactnative.so" (2 users, 6 events, 1.4.0) | **Install integrity, not code.** The ABI split is missing → sideload / backup-restore of the base APK alone. Play's installer-check protection is already ON; the old `play:core` MissingSplits reinstall dialog has no equivalent in the modern Play libraries (verified in the local gradle cache). JS never runs, so nothing in this repo can catch it. Watch whether it spreads past sideloaders |
| `AndroidUIScheduler.triggerUI` (worklets) → RetryableMountingLayerException (1 event) | Same Fabric race surfaced through a worklet callback. worklets 0.5.2 doesn't touch the class. Monitor |
| `HsdpShimActivity` — targetPackageName null (1 event, **1.2.0 only**) | Google's own Play-delivered shim (`com.google.android.play:hsdp`), Google-internal IllegalStateException, zero frames of ours possible. n=1, so "gone since 1.3.0" would be an overclaim — one event just never repeated. **Close** (not mute): Crashlytics auto-reopens a closed issue on recurrence and fires a regression alert, so closing costs nothing and keeps the Open list meaning something |
| `NativeAnimatedNodesManager.connectAnimatedNodes` — "child [1114] does not exist" (1 event, 1.4.0) | **Full trace read** (owner export `bb42a75e…`, 2026-08-13). The connect flushes in `didDispatchMountItems` against an already-dropped child node — a native-DRIVER RN Animated op racing an unmount. Investigation, recorded because the first two steps were wrong turns: (1) "we only use Reanimated" was FALSE — `WideSwitch` imports RN core Animated; (2) but WideSwitch is `useNativeDriver: false` (JS driver never enqueues connect ops), so it is CLEARED; (3) the ubiquitous native-driver producer is **RN's own TouchableOpacity press feedback** (`TouchableOpacity.js:242`, `useNativeDriver: true`) — a tap whose press animation races the navigation-unmount it triggers, reachable from any screen. RN-internal; the only app lever is a wholesale Pressable migration, unjustified at n=1. Monitor with `last_screen` |
| `Preconditions.checkState` (Fresco, 1 event, 1.3.0, Android 11) | **Full trace read** (owner export `ed6a19cf…`): fatal is pure Fresco — `PipelineDraweeController.getImageInfo` checkState on a closed image ref during `reportSuccess`, i.e. the result arrived after the drawee was torn down. Zero app frames in 1,730 lines; the only our-side activity was an expo-file-system download coroutine (prefetch). Fresco is RN's Android `<Image>` backend — library-internal. Monitor |

**`last_screen`**: every navigation stamps a Crashlytics attribute + breadcrumb
(`setCrashScreen` in services/firebase.ts, fed from App.tsx's nav hook). RN-internal
crashes carry no app frames — this key is the only attribution the next occurrence
will have. Filter by it in Crashlytics before theorizing.

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
