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
  `BG #FBF7F6`, `SCREEN_BG #F9F7F7` (was #F2F2F2, owner 2026-08-21), `INK_06/10/28`, `GREEN_DONE #7DB87D`.
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
- **Corner-radius rule (owner 2026-08-21: everything −30%)**: buttons =
  `BTN_RADIUS` (**12**, was 17), cards = `CARD_RADIUS` (**14**, was 20) — both
  live in `theme.ts` and NOTHING hardcodes its own card/button radius. The
  home screen is fully converted; convert other screens' hardcoded 20s to
  `CARD_RADIUS` as you touch them. Inner elements (pills, badges, bars,
  circles) keep their own proportional values.
- `BTN_RADIUS` pairs with bold labels for primary buttons.
- Content cards: flat, `CARD_RADIUS`, `#FFFFFF`, **no shadow**. Stacked cards must
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
- **`backfaceVisibility: 'hidden'` is unreliable on new-architecture Android.** Shipped
  bug (2026-08-14): the mystery-card spread showed every card's FRONT text, mirrored —
  the rotated front simply painted over the satin back. Any two-face flip must ALSO
  swap face opacity in the rotation worklet (`opacity: flip < 0.5 ? 1 : 0` per face);
  the swap lands at 90° where the card is edge-on, so it is invisible. Keep
  backfaceVisibility for clean edges where it does work — but never rely on it.
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
`firstRunTour 5` · `achievementUnlock 10` · `streakDaily 12` · `followHimOptin 20` · `setReminderTime 30` ·
`streakGuide 35` · `planGuide 38` · `bibleGuide 39` · `moodCheckIn 40` · `login 50` · `widgetInstall 60` ·
`overlayCards 62` ·
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
| `streakDaily` | full-screen ritual, FIRST open of each local day, only while `currentStreak ≥ 1` (day-1 users → streak guide owns that moment; broken-streak users are spared the big "0"); `ignoresBudget`; back key = Continue. Keys everything off the CONSECUTIVE streak — StreakScreen keys off lifetime `totalComplete`; the two share the level ladder (`constants/streakLevels`) on purpose and must NOT be "unified" |
| `resumeReminders` | the >3-min-away **resume ritual** (owner 2026-08-21, `ResumeRitualHost`): a ~1.9s replay of the launch cover (`ResumeCoverSplash` — SAME photo/line via `peekRotation`, registers `useSheetSurface` + `setResumeSplashUp`; adFrequency defers the app_open decision one beat past it so the cover isn't cut at 600ms), then — notification-less users only — the standalone `RemindersOffScreen` pitch. Splash skips: ad-caused episodes, overlay-card entries (15s), stashed notification routes (`peekPendingRoute`), cold starts. Pitch bounds (swarm r2): **once per app-day** (makes the skip-copy's "again tomorrow" literally true; owner can lift via `PITCH_YMD_KEY`), skipped when the FollowHim gate owns the window, queued request self-releases after 30s un-granted (never a cold pop later). CTA: `canAskAgain` snapshotted BEFORE the request — soft deny closes quietly; only hard-denied goes to system settings, with `suppressNextHotStart()` so the return is ad-free |
| `login` | one-time triggers (`first_highlight`, `day1`) + a global 1-per-3-days cap; arms 3 s after boot |
| `setReminderTime` | first ask ~20 h after becoming eligible, then **once per local calendar day** (owner: the old escalating gap was too long); disappears when permission is granted |
| `widgetInstall` | from day 1, needs **≥ 1** core feature used (`FEATURES_REQUIRED = 0`, strictly greater); repeats daily; after 3 unacted asks backs off to every 3 days; silent once `WIDGET_PRESENT_KEY` exists |
| `overlayCards` | Android only; same ≥ 1-feature signal as the widget; asks every 4 days, after 3 unacted asks every 7; silent forever once "Appear on top" is granted (re-checked live on every foreground). On MIUI, ONE follow-up card after the grant points at Xiaomi's own "background pop-up" permission (flag written at show time — never loops). Respects the Profile master switch: flipped off → never nudges |
| `quizPromo` | gap grows `1 + promptCount` days, capped at 14; **terminal** once she has played |
| `rate` | "No" → 30 days. Dismissed → escalating 3, 4, 5, 6, 7 … capped at 15 days |
| `removeAds` | see §9 |

**Rate prompt is two stages** (owner 2026-08-16). "Yes" no longer talks to the store —
it swaps the sheet's content to an appreciation screen (five lit gold stars, the fifth
circled in rose with a hand-drawn arrow from "The best we can get"), and only that
screen's CTA ("Rate on Google Play" / "Rate on the App Store" — brand names, never
translated, never uppercased) starts the handoff machinery. The `busyRef` one-handoff
latch lives on the CTA, not on Yes; backdrop/X on either stage still record *dismissed*
(escalating cadence), so bailing at stage 2 costs nothing permanent. The stage swap is
deliberately **unanimated** — an opacity-owning Reanimated wrapper around the CTA is
the §3 frozen-hit-region class. Owner decision, recorded: no reward is offered for the
rating, so the screen is appreciation, not solicitation.

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

### SDK layer — GMA "Next-Gen" status (checked 2026-08-16, owner-sanctioned)
Google's Next-Gen Android SDK (`com.google.android.libraries.ads.mobile.sdk`,
announced 2026-07) **cannot be adopted yet**: we ride
`react-native-google-mobile-ads`, `16.4.0` is the LATEST release, and its
entire Android layer wraps the CLASSIC SDK (`play-services-ads:25.4.0`, every
import `com.google.android.gms.ads.*`). Upstream's open placeholder —
invertase/react-native-google-mobile-ads **#864** — says the maintainers are
"thinking through internally"; no timeline. Migrating today would mean forking
the native ads bridge that carries all revenue, plus an unresolved Meta-bidding
adapter question. Decision (owner asked, judge ruled, ruflo memory
`gma-next-gen-sdk-verdict-2026-08`): stay on classic — Google still ships it —
watch #864, and migrate the moment the wrapper does. Until then, "upgrade to
Next-Gen" emails are marketing aimed at native Android apps, not at us.
- The app renders **interstitials only**. No banners, no rewarded, no native.
- `MIN_AD_INTERVAL_MS = 60 * 1000` in `constants/adPacing.ts` is the **single global
  floor** (owner 2026-08-14: density felt too high; the 2026-08-08 spell at 30 s is also
  what made the ad-close hot-start chain reachable). It used to be re-typed in three
  files — never reintroduce a local copy.

### Triggers
| Placement | Rule |
|---|---|
| `prayer_end`, `plan_end` | baseline, every user |
| `nav` | every 3rd qualifying transition, **day ≥ 3 only**. A run of consecutive tab↔tab switches collapses to +1. Flow/utility screens never count and never trigger (`EXCLUDED` in `adFrequency.ts`) |
| `nav_churn` | **more than 5** screen switches **and** ≥ 60 s since an ad actually presented (owner 2026-08-09). Counts **every** switch — no tab-run collapsing, **no day gate**. Fires on the transition that crosses the threshold |
| `first_open_loading` | **first-open loading-ad gate** (owner 2026-08-22, `services/firstOpenAdGate.ts`, 10 unit tests): a brand-new user's LoadingOverlay HOLDS until the GMA SDK initialized and the first-open interstitial resolved — goal: one ad DURING loading. Shows through `maybeShowOnboardingInterstitial` (same once-latch as the onboarding flow — never double-fires; the flow's own step-transition attempts stay as catch-up). Exits: fill→shown→ad-close; real no-fill→**3s grace** (a late fill inside it still shows); NETWORK error→a house-styled centered dialog (white card, Try-again rose pill — the button re-kicks the iOS unit; automatic retries continue) and an unbounded hold (the engine retries forever; the iOS onboarding unit's 3× retry cap is LIFTED while the gate is active — swarm: capped retries made iOS a dead end); 12s silent watchdog for a stalled init/ATT. The overlay's 11s cap is suspended while the gate holds; the hot-start decision defers to an active gate (back-to-back double-interstitial race); a purchaser hydrating late releases on the next 400ms poll; the Android 6s init-deferral exemption widened from install-day to **onboarding-incomplete**. Progress bar persists into stage 2 (bottom) with "This process may contain ads." ⚠️ Play policy: an interstitial over the app's own loading screen sits near AdMob's ads-at-launch guidance — owner-decided risk, same family as `app_open`; do not re-open. |
| `app_open` | hot start after ≥ 15 s backgrounded, **every user from day 0** (owner 2026-08-08). `suppressNextHotStart()` exempts the store-review excursion for 10 min — and, since 2026-08-17, **any notification/widget tap that routes into PrayerFlow** (`suppressHotStartIfPrayer` in DeepLinkHandler, all three arrival paths): she answered our own reminder to pray, so the ad waits for the `prayer_end` PrayerFlow already fires on completion. To make that suppression win the warm-tap race ('active' fires before the notification listeners deliver), the decision now runs **600 ms after 'active'** (`HOTSTART_DECISION_DELAY_MS`; timer cancelled on re-backgrounding, suppress flag consumed at decision time, foreground re-checked at fire time). Overlay-card entries have their own veto (`overlayEntry`, native tap stamp). **A backgrounding caused by our own interstitial never counts** (fix 2026-08-14): on Android showing an ad backgrounds the app and closing it foregrounds it, so a ≥30s creative chained `app_open` off every ad close — "three ads in a row after night prayer". The cause is stamped at 'background' time (`bgCausedByAd`), because at 'active' time CLOSED has already cleared the visibility flag. Rule is the pure `shouldFireHotStart()`, 5 tests |
| `quiz_retry` | every tap of "Try those again", **uncapped** by design, 400 ms delay |

Why two nav rules and not one tuned rule: `nav`'s tab-run collapse means pure
tab-hopping (`prayer→bible→plan→profile→…`) scores **+1 for the whole run** and
essentially never reaches its threshold — the most common idle-browsing pattern in the
app was unmonetized. `nav_churn` counts raw switches to catch exactly that, and pays for
the extra reach with a 60 s quiet period (matching the global floor) instead of a day gate.
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
- `SET_SIZE = 5` questions per set, `DAILY_SET_LIMIT = 10` sets per day (owner
  2026-08-14, was 3: play volume outranks pacing — a maxed-out user now burns the
  130-set bank in 13 days instead of 43 and earns up to 3⅓ card draws a day; the
  trade-off table lives at the constant's declaration). A live session always beats
  the cap — refusing it would strand her on a half-answered screen.
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

### The mystery-earn ceremony (owner 2026-08-14)
The set that fills the bar no longer jumps to the "unlocked" pill. Sequence, ≈3 s felt:
the bar animates its LAST step (2/3 → full, the same 0.9 s fill the other sets show;
`justEarned` + un-incremented `completedSets` on `MysteryRewardBar`) → the fill's
completion edge stops the gift's shake (`onFillDone`, reanimated callback +
watchdog) → `MysteryGiftBurst` swells a centre-screen copy to **half the screen
width** with a 12-wedge GOLD ray burst and burns out (~1.5 s) → the pill lands in the
bar's place. The burst layer is `pointerEvents: none` — Continue stays tappable the
whole time, so the ceremony is skippable by simply moving on. Reduce-motion collapses
to the old instant pill. The four cards still arrive after Continue (the draw grant
lands in `finish()`; opening the spread before the commit would break pendingDraw's
force-quit recovery).

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
Four rules hard-won on 2026-08-14 (PT screenshots: a hole a status-bar height below
the header icons; a bubble ridden off the top of the screen; and the worst — a fully
armed scrim with hole AND bubble both off-screen, an unescapable black screen):
- **SpotlightCoach settles FIRST, arms SECOND.** The hole does not exist until two
  consecutive samples (280 ms apart) agree within 1 px — screens measure mid-motion
  constantly (TabSection entrances, guide-driven scrolls). Until then the root has no
  children and every touch goes to the ordinary app. ~14 samples, then
  `onUnmeasurable` — never a trap.
- **An off-viewport anchor is treated exactly like an unmeasurable one.** The Bible
  guide's final step measures a button mid-`scrollToEnd`; accepting its
  below-the-screen rect armed the shield with nothing visible to tap. In-viewport is
  part of the acceptance test, in acquisition AND in the drift sampler.
- **After arming, drift is corrected by settling, not by clock** (covers reflows and
  foreground returns): re-measure every 300 ms, snap once when two samples agree,
  10-sample quiet cap. Never snap onto a moving anchor — that is the "bubble jitters
  in place" bug.
- **The bubble picks the side that FITS and is clamped into the safe viewport** —
  `Pular`/skip must be reachable on every language length and every anchor position.
  Reachable-but-overlapping beats perfectly-spaced-but-off-screen.

**A reveal that scrolls an anchor into place must VERIFY the arrival** (measure →
scroll the remaining delta → wait for the animated scroll to land → re-check, only
returning in-band), not fire one scroll and resolve on faith — clamps, late mounts
and language-length reflows all leave a single blind scroll short. `revealMood` in
PlanScreen is the reference implementation.

---

## 8. Prayer flow & the weekly screen

**Files** — `src/screens/PrayerFlow.tsx`, `src/components/WeeklyProgressView.tsx`,
`src/screens/PrayerScreen.tsx` (home).

- The flow is a `fullScreenModal` route; the weekly screen is an absolute-fill overlay
  *inside* it (`showWeekly`), not a route. So: no `entering`-only animations you can't
  fall back from, and anything that navigates away must decide between `navigate` and
  `replace` deliberately.
- **A programmatic pager flip can steal an in-flight tap** (shipped incident,
  2026-08-14): narration auto-advance flips page 2 → 3 with no user input, pages 2/3
  share one skeleton (caption → body → one terminal button), so a finger descending on
  "Write reflection" landed on **Amen** — which synchronously fires the `prayer_end`
  interstitial and whose effect marks the day done. Exactly the user's report: tap
  reflection → instant ad → settlement. Rules now in `PrayerFlow`:
  `advanceNarration()` is the ONE place the pager moves programmatically and it arms
  `autoFlipAtRef`; `handleAmen` ignores presses within `AUTO_FLIP_TAP_GUARD_MS` (700 ms)
  of it — Amen is the flow's only irreversible tap, so only Amen is guarded. A clip
  finishing while the reflection sheet is open **parks** the advance
  (`pendingAdvanceRef`) and flushes it on sheet close (still narrating only; toggling
  Listen off cancels it) — otherwise the next clip narrates over her typing and the
  flush recreates the same tap-steal against the sheet's bottom buttons. If you add
  another programmatic `setPage`, route it through `advanceNarration` or arm the guard
  yourself.
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
- Home screen: the prayer CTA breathes while the slot is actionable and goes quiet
  once prayed / locked. The Daily Rhythm bar was REMOVED 2026-08-22 (code in
  `backup/2026-08-22-daily-rhythm-bar/`, never bundled); its slot is the
  **week fire strip** (`components/home/WeekFireStrip.tsx`): the current
  Sun–Sat week as date numbers — sapling final-frame (LottieView progress=1,
  static, per owner) for one prayer, flame for both, rose dashed ring for an
  untouched today. Pure display: no CTA, no progress animation, no tour step
  (the first-run tour is 2 steps now: streak → verse). The wrapper ref in
  PrayerScreen doubles as the streak-star flight origin; QuizPromoHost's
  afternoon `inGap` is now `mDone && !eDone && hour ∈ [12,18)` — slightly
  wider than the old waitEvening (readings no longer gate it).
- **Share promo card** (`components/home/SharePromoCard.tsx`, 2026-08-22): the
  very last card of the home stack. One big square image (CDN
  `v1/share-promo/ShareHerBible-<EN|ES|DE|FR|PT>.webp`, ~160KB each; zh → EN
  per owner); tap anywhere → `Share.share` with the localized
  `sharePromo.message` + store link (Android: Play URL inline in the message —
  RN drops the `url` field on Android; iOS: numeric id resolved once via the
  iTunes lookup, same as RatePromptSheet). Layout is constant by construction
  (`aspectRatio: 1`, fallback gradient renders inside the same box) — that is
  the defense against the frozen-touch-region bug; keep it if you restyle.

---

## 8b. Prayer audio — background music and the narration

**Files** — `src/state/PrayerBackgroundsContext.tsx` (music), `src/screens/PrayerFlow.tsx`
(both players + the coach mark), `src/state/listenGuide.ts` (pure guide rules),
`__tests__/listenGuide.test.ts`.

Two players run at once and always have: background music at volume 0.8 and the
narration on top. The audio session DEFAULTS app-wide to MIX, not duck — the
one exception is the Bible chapter-listening session (doNotMix; see "Bible
narration goes places" below), which restores MIX when it ends.

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

### Bible narration goes places (background + lock screen, owner 2026-08-24)

**Files** — `services/audioSession.ts` (the ONLY two audio modes),
`screens/BibleScreen.tsx` (session start + lock-screen assert),
`state/AudioMiniContext.tsx` (`stopNarration`), `components/AudioMiniHost.tsx`
(pill X), `screens/PrayerFlow.tsx` (session end on entry).

- **Two global modes, nobody hand-rolls options** (expo-audio's mode is sticky
  and a partial set REPLACES it — the inline PrayerFlow call once silently
  dropped `shouldPlayInBackground` for the whole process): `applyMixAudioMode`
  (default; §8b's two simultaneous prayer players depend on it) and
  `applyNarrationAudioMode` (doNotMix + background) for the Bible
  chapter-listening session only.
- **Session lifecycle**: the FAB tap starts playback, but the doNotMix focus
  grab AND the lock-screen assert key on `audioPlaying` flipping TRUE — real
  playback, never the tap. Four of seven languages have no human voice yet
  and a missing chapter 404s silently; keying on real playback means a
  silent play button never kills her music for nothing and never posts a
  dead notification. (One accepted edge, swarm F3: a transport crossing
  INTO a missing chapter — EN/ES/PT catalog gaps — can briefly assert over
  the 404 source via the stale coarse flag; it self-heals on any next
  action and only paused controls linger.) `stopNarration()` (pill X, or
  PrayerFlow mount — two
  narrations at once is never right) pauses, clears the lock-screen
  controls, restores MIX; `openPlayer` clears the per-instance assert guard
  so a session restart on the same chapter puts the controls back up.
  Pausing does NOT end the session — the media notification stays so she
  can resume from the lock screen.
- **Lock-screen assert is per PLAYER INSTANCE, on first real play of that
  instance** (guard reset by `openPlayer` for same-instance session
  restarts). `useAudioPlayer` creates a new native player per (translation,
  book, chapter), so the re-assert IS the chapter-crossing metadata update.
  Background-safety, stated precisely (swarm F5 corrected the first
  wording): a release runs clearSession → stopForeground FIRST; a re-assert
  re-promotes the STILL-RUNNING service via `startForeground` from inside
  it — never `Context.startForegroundService`, the call Android 12+
  restricts from the background. And today every chapter change is
  foreground-only anyway (reader UI / transport Modal; lock-screen commands
  are play/pause/seek only; no auto-advance). ⚠️ If auto-advance is ever
  added, background crossing becomes real — re-verify first. Every call is
  try/caught: no controls beats a crash.
- **Focus behavior** (the owner's ask) — and the trap that nearly shipped
  (swarm F1): Android requests focus ONLY inside `play()`, and skips the
  request under MIX — which is the mode when a session's first play starts
  (the doNotMix flip waits for real sound). Writing the mode grabs nothing.
  So the rising-edge effect SEQUENCES: once the doNotMix write has landed it
  re-issues `play()` on the still-playing instance — idempotent for
  playback, but it runs the native focus request under the new mode. Her
  music therefore pauses a beat after our sound starts, and from then on
  another app starting audio pauses US (`AUDIOFOCUS_LOSS` on Android,
  AVAudioSession interruption on iOS — handled inside expo-audio). The same
  compensation heals lock-screen resumes, which drive the raw player
  through the media session and never request focus themselves.
- **Instance release tears the media session down natively on BOTH
  platforms** (`sharedObjectDidRelease → clearSession` on Android,
  `sharedObjectWillRelease → setActivePlayer(nil)` on iOS). Combined with
  the native-playing guard in the assert effect (`!audioPlayer.playing` —
  the coarse audioPlaying lags an instance swap by one bridge tick and
  briefly reports the RELEASED player's true), a manual chapter turn or
  translation switch while listening reads as an implicit stop: audio
  stops, controls drop, they return on the next real play. The transport's
  own prev/next crossing auto-resumes and re-asserts (pre-existing flag).
- **No auto-advance at chapter end** — the chapter finishes and playback
  stops; continuous-book playback was NOT requested. The paused media
  notification lingers until she swipes it away (Android) or the system
  reclaims it (iOS) — the pill is hidden once playing=false, so the
  notification is the visible remnant; accepted.
- The karaoke status bridge keeps ticking (~250 ms) while backgrounded —
  battery cost accepted while a session is live; it dies with the player.
- **Content gap, not code**: human voice exists for EN/ES/PT only
  (`bibleAudioCdn.ts` allowlist); zh-Hans/zh-Hant/de/fr fall to the legacy
  TTS path and 404 silently where absent. Filling the bucket is a content
  task; the allowlist grows one line per language when files land.
- Play declaration: `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (from expo-audio's
  manifest) is now genuinely used — declaration + demo-video script in the
  release runbook §5.
- **Upstream watch (expo-audio 1.1.1, swarm 2026-08-24)**: (a) iOS
  `MediaController.enableRemoteCommands` adds 6 CLOSURE targets per assert
  and `removeTarget(self)` cannot remove closures — every chapter crossing
  leaks a set; if MPRemoteCommandCenter dispatches to all targets, one
  lock-screen +10s tap seeks N×10s after N crossings. DEVICE TEST: listen
  across 3+ crossings, tap +10s once — a ~30s jump confirms it; then
  patch-package MediaController to store and remove the returned targets
  (do NOT patch blind before a failing device test — the Swift compiles
  only on EAS). (b) Android keeps the mediaPlayback FGS foregrounded while
  PAUSED until the X (upstream media3 default) — battery-attribution
  optics, no policy violation. Both recorded, neither app-fixable cleanly
  today.

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

### Overlay cards (Android) — `modules/expo-overlay-cards`
Daily popups drawn OVER the launcher / other apps, styled after the competitor
screenshots the owner supplied (owner verified the policy question himself,
2026-08-16 — do not re-open it). **Five cards under a budget + rotation
engine** (owner 2026-08-21):
- `morning` — **morning verse card** (verse over the morning art, Amen pill).
  Eligible 00:00–16:00 and **silenced the moment the morning prayer is done**
  (JS stamps `prayedAmYmd` into the payload on completion).
- `evening` — **evening verse card** (evening verse + evening art). Eligible
  16:00–24:00, silenced by the evening prayer. Both verse cards keep their
  reminder-toggle pairing and their alarm anchors at her reminder times.
- `quiz` — ✦ badge, question, 2 stacked / 4 in a 2×2 grid (the bank has both
  shapes, never assume one). **Roams the whole day, max 2 successful shows a
  day**, rotation-only (no alarm of its own).
- `sleep` — 21:58 fixed reflect card ("Before You Sleep", five rotating examen
  questions, No→evening prayer / Yes→today's verse). Own lane: **exempt from
  the period budgets** so a busy evening can't starve the ritual.
- `plan` — "Continue with Your Bible Plan" over the most recently started
  in-progress plan's title (parchment panel, rose Continue pill →
  `herbible://plan` → the Plans tab). Rotation-only; exists only while an
  in-progress plan exists.
**Budgets & rotation**: successful shows are capped per half-day — 00:00–16:00
and 16:00–24:00, `PERIOD_CAP_AM`/`PERIOD_CAP_PM` = 3/3. ⚠️ The owner's message
gave 3 for the night period; the MORNING number was garbled in transit and is
mirrored at 3 until he corrects it. Each attempt (alarm anchor or unlock)
picks the **least-shown eligible card** (oldest-shown breaks ties) — the
owner's "even out the chances". A 3-min global gap sits between any two
shows; per-card engagement (tap or X) still ends that card's day absolutely,
and the 8/slot sanity cap survives underneath. Alarm anchors: morning
reminder (1001), night reminder → `evening` (1002, cleanly replacing the
pre-rotation night-quiz alarm), 21:58 (1003).

The physics, because every piece follows from them:
- **The process may be dead at fire time.** AlarmManager → BroadcastReceiver →
  pure-native window. Nothing on that path may touch React/expo machinery;
  content (pre-localized strings, verse, question, a LOCAL image path) is
  mirrored ahead of time by `OverlayCardsSync` — WidgetSync's twin — into
  SharedPreferences. `imageFor('morning')` is only useful when it returns the
  disk-cache `file://`; the CDN fallback URL is worthless to a cold process,
  so no cache yet → native gradient.
- **Permission is a settings TOGGLE** (`SYSTEM_ALERT_WINDOW`, "Appear on top"),
  not a runtime dialog. `OverlayCardsPromptHost` (nudge 62) explains and jumps;
  the grant is detected on the next foreground by `OverlayCardsSync`, which
  also drains the receiver's queued analytics (`overlay_card_shown/tap/dismiss`
  — logged natively into prefs because the cold path has no Firebase JS).
- **Unlock-driven since 2026-08-21 (owner Option A, costs accepted).** The
  timed alarms alone were a lottery: locked at slot time + no pickup inside
  the 40-min retry window = no card that day. `OverlayCardService` — a
  foreground service whose ONLY job is holding a dynamic
  `ACTION_USER_PRESENT`/`ACTION_SCREEN_ON` receiver (no polling, no wake
  locks) — shows the day's due card at the unlock moment, exactly like the
  competitor. **Semantics: the card RE-SHOWS on every unlock until she
  ENGAGES it** (tap-through or X) — ignoring it (30-min self-destruct,
  screen off) leaves it eligible, matching the reference screenshots (same
  card at 12:31 and 12:46). Guardrails in `OverlayCardGate`, shared by BOTH
  triggers so they can never disagree: engagement ends the slot's day
  absolutely (the honoured X is load-bearing for review defense), cap 8
  re-shows/slot/day, ≥3-min gap, never over a still-visible card, never over
  our own foreground app. The rotation (least-shown eligible card) decides
  what shows; one card per unlock.
- **Service lifecycle**: started by `configure()` (Sync re-runs each
  foreground, so a permission granted late is picked up), by boot, and
  re-ensured on every alarm fire (daily heartbeat vs OEM kills;
  START_STICKY). Stops itself when SAW is revoked or no cards are configured;
  master switch OFF → `cancelAll()` stops it. Background-start legality on
  12+: holding SYSTEM_ALERT_WINDOW is a documented FGS-from-background
  exemption. The persistent notification (IMPORTANCE_MIN, localized copy fed
  by JS via `serviceTitle`/`serviceText` in the configure payload) is the
  OS-required anchor. **Play Console: the `specialUse` foregroundServiceType
  requires a declaration at submission** — see the release runbook.
- **Receiver guard order** (alarm path, unchanged in spirit): re-arm tomorrow
  FIRST (a crash may not kill the schedule) + ensure the service; then
  permission / `OverlayCardGate.mayShow`; screen off or keyguard up or our
  own app foreground → retry +8 min, max 5 — now just the belt for the
  window where the service was killed and its heartbeat hasn't landed.
- The window survives only as long as the process (a visible overlay bumps us
  to perceptible priority — usually enough, not guaranteed; the failure mode is
  a vanished card, which is fine). 30-min self-destruct, settings-coach removal
  discipline (clear refs only after a removeView that didn't throw).
- `FLAG_NOT_FOCUSABLE` only — the card IS touchable (unlike the settings
  coach), and back-key can't dismiss it: the X is the only way out, per spec.
- Taps open `herbible://verse-of-day` / `herbible://quiz` (+`&opt=N` on a quiz
  answer) — plain VIEW intents; SAW grants the background-activity-launch
  exemption. `DeepLinkHandler.routeForUrl` owns the mapping.
- OEM notes: MIUI additionally needs "后台弹出界面" for reliable display
  (owner 2026-08-16: ask for it) — `openMiuiPermissionEditor()` opens MIUI's
  per-app editor (two known activity names, app-details fallback) and
  `miuiBackgroundPopupAllowed()` best-effort reads AppOps op 10021 by
  reflection (1/0/-1; -1 = unknowable → treat as "show the step"). Samsung
  needs only the standard toggle. Android 12+ lets individual apps block
  overlays over their own windows (`setHideOverlayWindows`) — over the
  launcher, which is the normal case, this doesn't apply.
- Surfaces: the nudge (62) sells + jumps; on MIUI it shows ONE follow-up card
  after the grant. The Settings row ("Cards on your screen", rose "Not on yet"
  while off — its main job is inviting users who never enabled it, owner
  2026-08-16; moved from Profile's Account card into Settings 2026-08-22,
  sheet extracted to `components/OverlayCardsSheet.tsx`) opens a sheet with
  the master switch + per-step status rows
  (SAW for everyone, MIUI row on Xiaomi only), statuses re-read on every
  foreground. The master switch lives in `state/overlayCardsPrefs.ts`
  (module store, default ON); OFF → OverlayCardsSync tears the alarms down
  via cancelOverlayCards() and the nudge goes silent. Notification + popup
  double-fire at the same slot time is ACCEPTED (owner 2026-08-16) — do not
  add suppression.
- Kotlin traps already paid for: `const val` rejects `.toInt()` (use `val`);
  the card's width must live on the WINDOW LayoutParams and the verse body's
  height on the `addView` lp — `addView(lp)` silently replaces whatever the
  child set on itself.
- **RED LINE — no ads in overlay windows, ever.** Play's Ads policy (checked
  against the live text, 2026-08-16): *"Ads may only be displayed inside of
  the app serving them… This includes overlays."* The cards are compliant
  precisely BECAUSE they carry only content (verse, quiz) — the moment any ad,
  paywall promo, or third-party anything rides in an overlay, this feature
  becomes the thing that clause bans. Relatedly: a tap-through entry suppresses
  the hot-start interstitial (`overlayEntry` veto in `shouldFireHotStart`, fed
  by a native tap stamp written before the app opens) — she tapped a devotional
  card; the ad on arrival would be the Better-Ads "unexpected, user chose
  something else" shape. This is an entry-path veto only; the settled `app_open`
  decision is untouched.

---

## 10b. Profile — Activity journey

**Files** — `src/state/journeyLog.ts` (module store, key `journey:v1`),
`src/components/profile/JourneySection.tsx`, mounted in ProfileScreen directly
above the Account block; merger in `services/progressMerge.ts`; tests
`__tests__/journeyLog.test.ts` + journey cases in `progressMerge.test.ts`.

- **Exactly three kinds** (owner 2026-08-22): badge earned/re-earned
  (AchievementsContext, keyed off `newAwards` ONLY — never earned-diffing, the
  cold-start hydration race would duplicate), plan started
  (PlanCompletionContext — the record's birth in `markDayComplete`; there is no
  explicit start-write in this app, the Start CTA only navigates), puzzle piece
  collected (QuizContext drain effect via `rewardPreview`; `freshTile === null`
  past the shipped art → nothing recorded). Daily devotions are deliberately
  NOT recorded. Gospels & Psalms is not a "plan started" either.
- **Ids encode the milestone** — `badge:<id>:<count>`, `plan:<slug>`,
  `puzzle:<setOrdinal>` — so re-fired awards dedupe in the store and the backup
  merger collapses the same milestone from two devices into one row.
- **Entries store ids only** (badge id / plan slug / painting index); names and
  art resolve at render through `localizedAchievementName`, `getSummary`,
  `artworkAt`+`artThumbSource`. An id the build no longer ships drops its row
  silently. Never store titles or URLs in the log.
- **Store contract**: `hydrateJourney()` is a disk-UNION and deliberately
  re-runnable (cloud restore writes disk + remounts → next Profile mount
  absorbs it); records run on ONE serialized write chain, each re-reading disk
  immediately before its write — an event fired before Profile ever mounted
  can't clobber history, and the restore-vs-record race is a microtask-sized
  window instead of a collectLocal round-trip (swarm F1). A no-change absorb
  keeps the old snapshot reference and stays silent (useSyncExternalStore
  contract). Cap 100, newest first. `journey:v1` is in MERGERS (union by id,
  at-desc, cap; kind/at deliberately NOT validated there — a newer build's
  rows must survive the merge).
- **Record-forward**: pre-feature milestones have no trustworthy dates — never
  backfill. Empty log (or all-stale ids) hides title and card together.
- Row: 54pt fixed thumb box (BadgeIcon `shine={false}` — ten standing sheen
  loops on an always-mounted tab is GPU spent on a record, not a reward /
  PlanCover `noTransform` / painting thumb on `INK_06`), Lora 600 title, small
  kind label, date top-right via
  `toLocaleDateString(localeFor(lang), { month:'short', day:'numeric' })`.
  Shows the 10 newest.

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
  `node scripts/verify_alignment.mjs` after any content change (its section 3 is a
  HARD gate over the authoring batch dir — non-zero exit on any failure; keep its
  `COMMIT` pin in lockstep with `constants/corpus.ts`, it drifted once).

### Daily-verse batches (batch 2 integration, 2026-08-30)

- **The verses bucket (`verses.everlandapps.com`) is its own animal**: shipped
  builds re-fetch it on EVERY cold start (`DailyVersesContext` language effect),
  so a content-breaking batch must NEVER overwrite the keys an old build reads —
  batch 2 would have blanked live users' verse pages (empty `modern.text` +
  the old `slim()` accepting it). Every breaking batch gets its own key prefix
  (`DAILY_VERSES_PATH`, now `v2/`), bumped in LOCKSTEP with the upload script's
  `VERSION` and `DAILY_VERSES_VERSION` (the AsyncStorage cache tag). Same-key
  overwrite + ETag remains fine only for shape-compatible fixes within a batch.
- **modern vs traditional (owner plan C)**: the modern editions (NIV/CCB/…) are
  in copyright and ship EMPTY until licensed; `slim()` (service + bundled gen,
  kept mirror-identical) prefers `modern.text` when non-empty, else falls back
  to the public-domain `traditional` — byte-identical to the in-app chapter.
  Backfill is per-entry and needs no client change. An entry with no usable
  text now DROPS instead of rendering blank.
- **Narration audio is OFF for batch 2** (`AVAILABLE_DAILY_VERSE_AUDIO_LANGS`
  emptied): the audio manifest maps by BARE verseId and batch 2 reuses batch 1's
  ids for different verses — re-enabling without regenerating the manifest from
  batch-2 recordings would voice the WRONG verse. Listen button, prefetch and
  the listen coach all die from that one set; re-add langs only after
  `gen_dailyverse_audio_manifest.mjs` + a full-coverage probe — and when you
  do, re-check the ⓘ-dialog/listen-coach stacking (dialog z60, coaches z90;
  both are one-shots so a collision is rare, but the choreography has never
  been exercised live).
- **`verse_local`** (schema 3.2): Segond/Luther count long psalm titles as v1 —
  5 psalm entries carry a shifted local number, shown when the ACTIVE Bible is
  fr/de (PrayerFlow `refSource`). Known accepted edge: an en-UI user reading a
  de Bible sees the KJV number on those 5 (the en file carries no verse_local).
- **`context_note`** (schema 3.2): per-language background note behind the ⓘ
  on the verse page; house dialog + a one-shot SpotlightCoach
  (`guide:contextNote:v1`, burned on display, yields to the listen coach).
- **Upstream corpus defects** found by content-side: de ×2 (Ps 119:105
  `meine→meines`, Isa 25:1 `dein→deine`) + es/pt ×7 from batch 1 — fix in
  pd-text-corpus then bump `CORPUS_COMMIT` AND the verify script's pin;
  content deliberately quotes the corpus verbatim, so the app text follows
  the fix automatically.

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

### Stability playbook — why our crashes & ANRs happened, and the rules for every new feature
Written 2026-08-18 at the owner's direction after the ANR (~1% vs 0.47% cap) and
user-perceived-crash (cap 1.09%) crises. Both metrics gate Google Ads delivery
and Play ranking. **Read this before building ANY new feature.** The ledgers
below record what happened; this section is why, and what to do instead.

**Why they actually happened — three mechanisms, all receipted below:**
1. **Main-thread lock convoys at cold start (the ANRs).** Heavy SDK inits
   (GMA, UMP) plus an *invisible* dependency chain — RN wires a WebView-backed
   cookie jar into every `fetch`, so the first network call did first-touch
   WebView init on an OkHttp thread while holding process-wide locks
   (DisplayManagerGlobal) that main needs for layout. Nobody "added a bug";
   four legitimate initializations convoyed on hidden global locks, and slow
   devices stretched the window past the 5s input budget.
2. **Async animation vs. tree ownership races (the crashes).** reanimated
   layout animations schedule native mutations across threads; on a stalled
   UI thread the view can be deleted before the scheduled work runs, and the
   zombie work then mutates a dead tree (`Unable to find viewState`). Any
   library that touches native views asynchronously can lose this race, and
   low-end devices widen every window.
3. **Hidden library contracts (the near-misses that reviews caught).** A
   shared provider's swap crashed because *other* consumers cast unchecked
   (Pattern S); a faithful backport carried the upstream bug its own
   follow-up had to fix (Pattern T). Compile success proves nothing about
   runtime casts, JNI name lookups, or ProGuard survival.

**The rules — apply to every feature, no exceptions:**
- **Main-thread budget is ~zero.** No disk I/O (SharedPreferences first
  load, file reads), no bitmap decode, no synchronous binder-heavy calls on
  main or in BroadcastReceivers. Anything that can take >1ms goes to a
  background thread; only view building and `addView` stay on main. (The
  overlay-cards module violated this on day one — decode at the unlock
  moment — and was caught by review, not by testing.)
- **Nothing new in the cold-start window.** No SDK init, warmup, or fetch
  added to `Application.onCreate` / first frames without explicit deferral
  reasoning written down. The 6s Android ads deferral and the cookie-inert
  client exist to EMPTY that window — do not refill it.
- **New dependency = check its Android vitals record first.** Before adopting
  any native-code library: search its issue tracker for "ANR", "viewState",
  "deadlock"; read how it initializes; know which threads it touches. Pin
  exact versions via the lockfile. Upgrades only with receipts — tarball-diff
  the classes in your crash stacks (never upgrade-theater).
- **Layout animations (`entering`/`exiting`) are the #1 crash source on
  low-end Android.** Keep them off unbounded lists; prefer shared values for
  sheets (already the design rule); when the reanimated patch or version
  changes, re-walk its upstream fix history (Pattern T).
- **Shared providers/factories/registries: close the safety argument over
  ALL consumers** — grep node_modules, not just the file you read (Pattern S).
- **Runtime claims need runtime receipts.** JNI by-name lookups, ProGuard/R8
  survival (check consumer rules AND the shipped AAR's proguard.txt),
  unchecked casts, feature flags — verify each against source; a green local
  compile is table stakes, not proof.
- **Native/plugin changes verify locally before EAS**: node-simulate config
  plugins against the real generated files; `compileDebugKotlin` /
  NDK-compile the touched module; both platforms build together.
- **After every release**: read Play vitals **split by app version** ~3 days
  post-rollout (never the blended 28-day number), export the CSV for real
  volumes, and sweep Crashlytics for new issue signatures. A regression
  caught in week one is a patch; caught in week four it is a 28-day-window
  penalty.
- **When a crash/ANR batch lands**: traces first, families second, receipts
  third — no fix without a named mechanism, and every claimed fix states how
  it will be verified (which metric, which version, which date). Record the
  verdicts in the ledgers below so the next batch starts warm.

### Crash triage ledger (Crashlytics batch 2026-08-13, 6 issues / 17 events)
Verdicts recorded so the next report starts here instead of from scratch. Method for
"can a dependency patch fix it": **download the patch tarball and diff the exact class
in the stack** — RN 0.81.6 and worklets 0.5.2 were both checked this way and neither
touches the crashing classes, so no upgrade theater.

### User-perceived crash 2026-08-18 (`RetryableMountingLayerException: Unable to find viewState for tag`)
NOT the ANR problem — this is a hard crash: RN Fabric's `addViewAt` inserts into a
parent whose viewState is gone, the exception is not in `ReactIgnorableMountingException`'s
allowlist, and the process dies. `com.facebook.*` frames mean React Native itself
(Meta authored RN — every RN app's stacks look like this), NOT the Meta ads SDK.
Receipts chain, so the next reader can re-verify in minutes:
- Two Play samples, one via React's own frame callback, one via
  **reanimated's UI flush** (`worklets AnimationFrameQueue → NativeProxy.performOperations
  → scheduleMountItem` draining the mount queue synchronously). Real low-end
  devices (Redmi, moto g15), 1.3.0/1.4.0/1.4.1 all affected — NOT the emulator farm.
- All three shipped releases pinned reanimated **4.1.7** (verified via
  `git show <tag>:package-lock.json`), and 4.1.7's release notes carry none of the
  upstream fixes for this family.
- Upstream: software-mansion/react-native-reanimated#7493 is the canonical issue
  (Android + Fabric + entering/exiting animations; the start lambda is scheduled
  to the UI thread, the view can be deleted before it runs). Fix lineage:
  #7798 (Jul 2025, merged before the 4.1 branch cut → presumed in 4.1.x),
  **#8083** (Sep 2025, "check if view is mounted before each animation-frame
  update" via `FabricUIManager.resolveView`), **#9660** (Jun 2026, don't resurrect
  cancelled animations — the final fix that closed #7493).
- What we ship: **patches/react-native-reanimated+4.1.7.patch = a backport of
  #8083 PLUS the #9649 guard** (8 files, all Android behavior `#ifdef
  ANDROID`-gated; positional struct init orders verified against 4.1.7;
  `resolveView` exists in RN 0.81.5 FabricUIManager.java:1018; `jsInvoker_`
  inherited from TurboModule). Applied by patch-package via the `postinstall`
  script — EAS runs it on `npm install`, and a non-applying patch FAILS the
  EAS build loudly (patch-package's ci-info knows EAS_BUILD).
  ⚠️ The #9649 guard is NOT optional: bare #8083's `preserveMountedTags`
  crashes with `IllegalViewOperationException` when a tag is registered but
  its view is mid-preallocation and a third-party ViewManager dispatches an
  event synchronously from createView — **lottie-react-native does exactly
  that**, and we ship it. Upstream issue #9636; the fix was emergency
  cherry-picked into BOTH maintained stables (#9827/#9758). Caught by the
  round-2 swarm review BEFORE any build carried the bare backport.
  Inherited-and-accepted (upstream-identical, do NOT hand-fix): a JS-thread
  pull skips updates but still cleans finished animations (upstream PR #8852,
  open) — only bites duration-0 animations, which src/ has none of; and the
  unmerged teardown guard PR #9449. Re-evaluate both when upstream merges.
  #9660 is NOT backportable: it targets the Legacy/Experimental proxy split that
  4.1.7 predates, ±300 lines of concurrency C++ — that's the fork-the-bridge risk
  class. Residual: the resurrection path #9660 fixes can still fire; expect
  reduced-not-zero. Watch the 4.1-stable branch for cherry-pick releases (4.1.8+)
  and DROP our patch when one carries #8083/#9660.
- reanimated 4.5.x requires RN 0.83–0.86 + worklets 0.10+ → a line upgrade is an
  RN/SDK upgrade, not a crash fix. Do not "just bump".

### ANR batch 2026-08-17 (Play rate ~1%, threshold 0.47% — 5 traces, 3 families)
The rate is a **28-day trailing window**: it falls only as fixed builds take over
the fleet, never overnight. Families, each with its receipt:
- **B — cold-start lock convoy (traces 1, 4; the bulk).** Four parties convoy on
  the WebView/Display global locks at launch on slow devices: the WebView
  provider load (held for SECONDS on old hardware, entered via the first
  fetch's `ForwardingCookieHandler → CookieManager.getInstance`), GMA
  `MobileAds.initialize` (Blocked on DisplayManagerGlobal, on mqt_native), UMP's
  `WebSettings.getDefaultUserAgent` (Blocked on WebViewFactory), and main's own
  layout `getDisplayInfo` → 5s input budget gone. The traces show pre-1.4.1
  sessions (getInstance on an OkHttp request thread; no warmup thread) — but
  **that proves only their age, NOT that 1.4.1 works** (owner correction
  2026-08-17: Play vitals lag ~3 days and 1.4.1 had just shipped, so old
  sessions are all the data COULD contain; fix efficacy stays unproven until
  per-version vitals land). Hence 1.4.2 stops betting on timing and removes the
  trigger class outright, three layers:
  1. A **cookie-inert jar that implements `CookieJarContainer`** injected as
     the OkHttp factory in MainApplication (withCookieWarmup.js layer 1) —
     `loadForRequest` returns empty without ever touching
     `ForwardingCookieHandler`, and `setCookieJar` discards the WebView-backed
     jar every consumer tries to wire in. So the CookieManager hop is gone
     from RN fetch AND Fresco image requests, on any device, at any time.
     ⚠️ **NOT `CookieJar.NO_COOKIES`** — the first cut used that, and it was
     a guaranteed cold-start ClassCastException caught by the 2026-08-17
     swarm review before any build carried it: the factory client feeds EVERY
     `OkHttpClientProvider` consumer, and two of them cast the jar UNCHECKED
     at startup (`FrescoModule.kt:161`, eager-init; `ExpoFetchModule.kt:31/47`,
     registered by every Expo app). Only NetworkingModule type-checks. The
     "NetworkingModule is safe" audit was true and insufficient — a safety
     argument must close over ALL consumers of a shared provider. Audited
     cookie-free: CDN public, CF Access header-based, Firebase native
     networking, no WebSockets, no clearCookies callers.
  2. The warmup thread stays for the remaining WebView consumers (UMP's
     consent form is a WebView).
  3. Android ads init (GMA + UMP) deferred 6s past interactions-settled
     (`ADS_INIT_COLD_START_DELAY_MS`, App.tsx). **Install day is exempt**
     (swarm finding): onboarding_first must land before onboarding ends, and
     the fresh install is the slowest init path; the ANR cohort is existing
     users' daily cold starts. A hot-start return whose excursion fits inside
     the init window is dropped — known, rare, fail-safe. iOS untouched.
  **Swarm-review hardening of the hot-start beat (same batch)**: the suppress
  flag is consumed only when it actually decided the outcome (an iOS
  control-center flap during the ~4s TestFlight fallback fetch was burning
  the store-review protection); and the decision no longer bets on the
  PRAY-action drain landing inside 600 ms — it reads the pending-route stash
  itself (`peekPendingRoute`; `src/services/pendingNotifRoute.ts` owns the
  key for index.ts + DeepLinkHandler + adFrequency). Overlay-cards module:
  verse art now decodes off-main before the window posts, and `remove()`
  clears refs on "already detached" instead of pinning a bitmap-sized tree in
  a cached process.
  **Verification plan, not assumption**: Play Console → Android vitals → ANR
  rate split BY APP VERSION, first readable ~3 days after 1.4.1/1.4.2 reach
  users. Judge each version's own rate; never read the blended 28-day number
  as a fix signal.
- **A — worklets serialization burst on main (trace 2; the Play-titled issue).**
  Main runs a deep recursive `SerializableWorklet/SerializableObject::toJSValue`
  chain (each worklet evaluated onto the UI runtime, hermes memset = source
  copy) on an armeabi-v7a device while mqt_v_js is also Runnable — a big
  worklet tree being installed on a weak 32-bit phone, through the
  mutex-guarded `RetainingSerializable` (the AroundLock/ReentrancyCheck frames).
  **Upstream receipt (checked 2026-08-17)**: reanimated PR #10264 is a complete
  rewrite of exactly this class — lock-free per-runtime cache for
  `RetainingSerializable`, "major performance gains where 2+ runtimes use the
  serializable" — merged 2026-08-14 into a FEATURE BRANCH, in no release yet
  (worklets latest 0.11.4 predates it). Watch for the release that carries it;
  upgrading before then is the exact upgrade-theater this ledger bans. If B's
  elimination alone doesn't pull the rate under 0.47%, the interim lever is
  reducing first-paint worklet volume — profile on a real armeabi-v7a device
  first.
- **C — HardwareRenderer.setStopped future-wait while backgrounding (traces 3,
  5).** Main waits for the render thread during window stop; trace 3's RT is
  mid-draw calling the Java frame-complete callback and stalled in an art
  transition; trace 5's RT is already idle (snapshot after the fact). AOSP
  stop-handshake stall on loaded devices — no app-side lock of ours in any
  frame; expected to shrink as A and B shrink the load spikes. Watch, don't
  chase.
**Emulator-farm / analysis-sandbox noise. ZERO real users. No code change — and none
possible.** Read the four receipts before ever re-panicking over this bucket:
1. **Every trace runs as x86_64 while claiming to be "OnePlus8Pro"** (`Native lib dir:
   …/lib/x86_64`). A real OnePlus 8 Pro is a Snapdragon 865 — arm64 — and physically
   cannot run an x86_64 process. Device mix on the issue: 78% "OnePlus", 19% "Google"
   (the stock AVD reports as a Pixel), and **3% literally "Qemu"**. 97% proximity-on,
   3% rooted, 50% background — all emulator defaults.
2. **Our AAB ships the library they can't find.** Verified in the 1.4.0 artifact:
   `base/lib/x86_64/libreactnative.so` present (all 4 ABIs). Any install SERVED BY
   PLAY has working libs on any ABI — a Chromebook user does not crash. The crashing
   installs' SO-source lists lack the libs entirely (arm-only sideloads/repacks on x86
   images; one trace even hunts `x86_64` INSIDE `split_config.arm64_v8a.apk`).
3. **`com.mojito.*` / `org.mojitoaspectj` frames woven into system classes**
   (MessageDigest, Locale, SharedPreferences, getPackageInfo) and an
   `InMemoryDexClassLoader` hook that DUMPS Meta's in-memory ads DEX to disk. That is
   an AspectJ instrumentation sandbox — analysis/repack tooling, present on no real
   user's phone.
4. **Cadence is a machine's**: 15 of 17 exported traces landed 06:19–06:31 on one day,
   with TWO different install hashes inside those 12 minutes (uninstall→reinstall
   loop), and the crash exists identically on 1.3.0 / 1.4.0 / 1.4.1 → not a
   regression from anything we shipped. Absolute volume: ~32 events over 6 days
   against the whole live install base; 1.4.1 shows exactly 1.
**Standing rule**: this bucket is only worth reopening if a trace shows an arm64
`Native lib dir` + real Play split paths for arm64 + a device model whose hardware
matches its ABI. Otherwise it is farm traffic scanning the APK. Do not "fix" it by
catching the SoLoader throw in onCreate — an app without its native library has
nothing to fall back to, and the only population served would be sandboxes.

| Issue | Verdict |
|---|---|
| `SurfaceMountingManager.getViewState` — "Unable to find viewState for tag" (7 users, 1.3.0–1.4.0) | **RN Fabric internal race — verified against the FULL trace** (owner exported issue `4f8a216f…`, session `6A7DA281…`, read 2026-08-13; the first verdict predated the export and said so). Hard facts from it: the fatal op is `addViewAt` → **parent** tag's viewState already gone, `Surface stopped: false`; the throw escalates because `dispatchMountItems` only soft-logs `ReactIgnorableMountingException` and RETHROWS everything else (MountItemDispatcher.kt:238); **all 179 threads carry zero app frames** and `mqt_v_js` was idle-polling at crash time, so the batch was not a JS-side commit; device was MIUI, session had live audio streams + AdWorkers + a WebView. Unchanged in 0.81.6 (tarball diffed). Two in-app suspects CATALOGUED, not accused: `PlanCategoryScreen`'s FlatList runs `removeClippedSubviews` (clip-culling is the classic parent-gone-mid-batch source), and 6 `exiting=` layout animations (BibleScreen ×3, PlanDayWalk ×2, ProfileScreen ×1 — exit animations delay removal on Fabric). **Decision rule:** when `last_screen` data arrives, if crashes cluster on one of those screens → drop `removeClippedSubviews` / convert that screen's `exiting=` to shared-value fades. No blind mutation before attribution. 2026-08-28 batch: one more session (`6A914DDB…`, still **1.4.2 (32)** — pre-patch) via the plain Fabric frame callback, and one on **1.4.0 (26)** (`5385729e…`) surfaced through `reanimated NativeProxy.performOperations` — squarely the class the 1.4.3 patch (#8083+#9649) claims. Every sighting to date is a pre-33 build; the fix's verdict still rides on 33+ vitals |
| `MainApplication.onCreate` — SoLoader "couldn't find DSO: libreactnative.so" (2 users, 6 events, 1.4.0) | **Install integrity, not code.** The ABI split is missing → sideload / backup-restore of the base APK alone. Play's installer-check protection is already ON; the old `play:core` MissingSplits reinstall dialog has no equivalent in the modern Play libraries (verified in the local gradle cache). JS never runs, so nothing in this repo can catch it. Watch whether it spreads past sideloaders. 2026-08-28: sibling signature on **1.5.0 (35)** (`266d1822…`) — `libc++_shared.so` missing, and the SoSource dump shows the install's own lib dir as **x86_64** while every split is **arm64-v8a**: an ABI-mismatched install (backup-restore onto different silicon / cloner / x86 emulator image). Same verdict: install integrity, zero app frames, not app-fixable |
| `AndroidUIScheduler.triggerUI` (worklets) → RetryableMountingLayerException (1 event) | Same Fabric race surfaced through a worklet callback. worklets 0.5.2 doesn't touch the class. Monitor |
| `HsdpShimActivity` — targetPackageName null (1 event, **1.2.0 only**) | Google's own Play-delivered shim (`com.google.android.play:hsdp`), Google-internal IllegalStateException, zero frames of ours possible. n=1, so "gone since 1.3.0" would be an overclaim — one event just never repeated. **Close** (not mute): Crashlytics auto-reopens a closed issue on recurrence and fires a regression alert, so closing costs nothing and keeps the Open list meaning something |
| `NativeAnimatedNodesManager.connectAnimatedNodes` — "child [1114] does not exist" (1 event, 1.4.0) | **Full trace read** (owner export `bb42a75e…`, 2026-08-13). The connect flushes in `didDispatchMountItems` against an already-dropped child node — a native-DRIVER RN Animated op racing an unmount. Investigation, recorded because the first two steps were wrong turns: (1) "we only use Reanimated" was FALSE — `WideSwitch` imports RN core Animated; (2) but WideSwitch is `useNativeDriver: false` (JS driver never enqueues connect ops), so it is CLEARED; (3) the ubiquitous native-driver producer is **RN's own TouchableOpacity press feedback** (`TouchableOpacity.js:242`, `useNativeDriver: true`) — a tap whose press animation races the navigation-unmount it triggers, reachable from any screen. RN-internal; the only app lever is a wholesale Pressable migration, unjustified at n=1. Monitor with `last_screen` |
| `Preconditions.checkState` (Fresco, 1 event, 1.3.0, Android 11) | **Full trace read** (owner export `ed6a19cf…`): fatal is pure Fresco — `PipelineDraweeController.getImageInfo` checkState on a closed image ref during `reportSuccess`, i.e. the result arrived after the drawee was torn down. Zero app frames in 1,730 lines; the only our-side activity was an expo-file-system download coroutine (prefetch). Fresco is RN's Android `<Image>` backend — library-internal. Monitor |
| `ViewGroup.dispatchVisibilityChanged` NPE (1 event, 1 user, **1.4.2 (32)**, Motorola, Android 12, backgrounded) | **Full trace read** (owner export `bacaba93…`, 2026-08-22). Fatal is 100% framework: `handleStopActivity` → `setVisibility` walks 8 levels down and hits a **null slot in a ViewGroup child array** — the corruption happened EARLIER; backgrounding only tripped over it. All 148 threads carry zero app/RN frames at crash time (JS + mounting idle; live prayer-audio sockets in the dump = she backgrounded while listening). Same unmount/detach-bookkeeping family as the `getViewState` row above (clip-culling / delayed removals are the classic null-slot sources), but a DIFFERENT signature — the 1.4.3+ reanimated patch does not claim it. Pre-fix build: **monitor whether it ever appears on build 33+**; if it clusters, attribute via `last_screen` before touching anything. 2026-08-28: second event (`6A8DF741…`, 2026-08-25), still 1.4.2 (32), different Android build (ViewGroup.java:1612) — n=2, both pre-fix, still nothing on 33+ |

### ANR batch 2026-08-14 (Play console, 1.4.0 (26)) — all four traces read
Four issues, 4 events, 4 users; threshold breach is small-denominator arithmetic, but
one class had a real app-side trigger and it is now FIXED. All four are `Input
dispatching timed out (No focused window)`. Verdicts, each from its exported trace:
| Wait site | Trace verdict |
|---|---|
| `ForwardingCookieHandler.getCookies` (Android 11) | **CONFIRMED + FIXED (`plugins/withCookieWarmup.js`).** Holder identified: our own ad-config fetch thread (`OkHttp everlandapps.com`) doing FIRST-TOUCH WebView init through RN's cookie jar — `CookieManager.getInstance → WebViewFactory → createApplicationContext → DisplayManagerGlobal.getDisplayInfo` (takes the process-wide DMG lock) → a binder `IDisplayManager.getDisplayInfo` that hung >5s. Main thread blocked on the same lock in ReactRootView's layout-time orientation check. The plugin pre-warms `CookieManager.getInstance()` on a background thread in `Application.onCreate`, so the first touch happens before React's layout listener exists and never again on a request path. Residual: a >5s system_server stall can still hurt anything display-locked; our standing trigger is gone |
| `libhwui setStopped` (Redmi Note 12, Android 15) | Main thread waits in `HardwareRenderer.nSetStopped` (window STOPPING — activity transition) for the render thread, which is itself blocked calling BACK into Java (`setFrameCompleteCallback` JNI). System/RN-internal suspension tangle; no app frames, no lever. Watch with `last_screen` |
| `libart WaitHoldingLocks` (OnePlus N100, Android 11) | Same `nSetStopped` wait — but the RenderThread was IDLE (`waitForWork`): the stop request was lost/never picked up. hwui/driver bug on that device class; no lever |
| `libworklets jsi::WithRuntime` (Galaxy A10s, armv7) | Main thread >5s inside `SerializableWorklet::toJSValue` + Hermes on a weak 32-bit device — reanimated serializing worklets on the UI thread. worklets 0.5.2 is native-identical (verified), no upgrade fix. If it recurs with `last_screen`, the lever is reducing simultaneous worklet mounts on that screen |

**`last_screen`**: every navigation stamps a Crashlytics attribute + breadcrumb
(`setCrashScreen` in services/firebase.ts, fed from App.tsx's nav hook). RN-internal
crashes carry no app frames — this key is the only attribution the next occurrence
will have. Filter by it in Crashlytics before theorizing.

### Crash 2026-08-31 (1.4.2 (32)) — `IllegalStateException: targetPackageName is null`, HsdpShimActivity
Google's Play `hsdp` library (transitive dep of `play-services-ads` — we never
reference it) ships `HsdpShimActivity`, which validates
`intent.getStringExtra("target_package_name")` only in `onAttachedToWindow` and
throws when it's missing → process death. **No upgrade exit** (receipts
2026-09-05): GMA 25.4.0 (latest; what RNGMA 16.4.0 pins) still declares hsdp
2.0.1 in `play-services-ads-api`'s POM, and a javap diff of hsdp 2.0.1 vs 2.1.0
(latest) shows the identical unguarded throw; the launch-intent construction
lives outside our APK (Play/GMA side). FIXED app-side:
`plugins/withHsdpCrashGuard.js` registers ActivityLifecycleCallbacks in
MainApplication and `finish()`es exactly the doomed configuration (shim created
with the extra null) in `onActivityCreated`, before the window can attach —
launches carrying the extra are untouched. Verify: issue 80e49a5e stays at zero
events on builds ≥36. Drop the guard only when a future hsdp's shim handles the
null itself (re-run the javap check on upgrade).

### Crash 2026-09-04 (1.4.2 (32)) — `OutOfMemoryError` in `RNWidget.drawViewToBitmap`
`react-native-android-widget` 0.20.3 renders the home-screen widget by drawing
its view tree into an ARGB_8888 bitmap; the `Bitmap.createBitmap` at
RNWidget.java:137 is unguarded, and the module entry points catch only
`Exception` — an OOM (an `Error`) escapes and kills the process. Trigger is
heap-pressure timing, not payload: our widget bg is server-cropped to 384×192
(`widgetBgUrlFor`), tiny; the redraw just landed while the app's heap was full
(images/ads). FIXED via `patches/react-native-android-widget+0.20.3.patch`
(patch-package, applied by the existing `postinstall`): (1) `drawViewToBitmap`
catches OOM and retries at half resolution (¼ memory; launcher upscales), then
converts a second OOM into a checked Exception; (2) all three
`AndroidWidgetModule` entry points catch `Throwable`, so the worst case is a
skipped widget refresh (stale content until the next sync), never a crash.
`:react-native-android-widget:compileDebugJavaWithJavac` green 2026-09-05. On
any library upgrade, re-verify the patch still applies (patch-package fails the
EAS build loudly if not — re-cut it against the new sources, or drop it if
upstream guards the draw path).

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
