# HerBibleApp

A Bible & prayer companion designed for women — daily Scripture, guided morning/evening prayer flows, mood check-ins, reading plans, streak tracking, and 7 Bible translations. Built with Expo + React Native, targeted at the Apple App Store and Google Play.

> **Company:** Everland Apps · **Support:** support@everlandapps.com

---

## Where we left off

This file is a hand-off document for picking the project up in a fresh chat. Most recent work, oldest first:

1. **Profile screen** redesigned — Hero → Stats (Day Streak / Days Read / Widget) → Faith Achievement → My Notes → Saved Verses → Learning Bible (Calendar / My Plan / Quiz / Did you know) → Study Progress → Remove Ads → Account.
2. **Bible reading screen** — verse toolbar (Save / Copy / Notes / Share / Explore), inline rose-tinted explanation, last-read persisted via AsyncStorage, cross-Bible streaming search.
3. **7 translations** wired through a personal jsDelivr-served `pd-text-corpus` mirror (commit pinned in `src/constants/corpus.ts`). Translation switching is gated on completed download.
4. **Mood check-in** flow (4 steps: pick → verse → calendar → fact) with an 8-hour gate, MoodCalendar component, and full-screen `MoodCalendarScreen`.
5. **Notifications** — 4 sections (morning / night / quiz / plan) each with toggle + time-picker sheet; persisted in `NotificationsContext`.
6. **Help Center**, **About Us**, **Policy** (Terms / Privacy / Content) screens with single-source-of-truth support email.
7. **Add Widget** screen with three preview sizes (2×2 / 4×2 / 5×2), bottom-anchored CTA pill, adaptive cell sizing across iPhone SE → 14 Pro Max.
8. **Remove Ads** paywall (Lifetime / Annual / Monthly) — UI only; IAP not yet wired.
9. **Onboarding** flow gating first-run.
10. **Prayer closing screen** (most recent change) — redrawn praying-hand SVG (4 fingertip arches + thumb bump + wrist taper + finger separators), 8 sparkle stars twinkling continuously for ~4 s, and phased fade-in for closing text:
    - Heading "We hope this prayer time encouraged you. Come back again soon." — 0.7 s fade
    - 0.3 s gap → "In Jesus' name" — 0.7 s fade
    - 0.5 s gap → Continue button — 0.5 s fade

`tsc --noEmit` is clean as of this commit. No tests yet.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Expo SDK 54, React Native 0.81, React 19 |
| Architecture | New Architecture enabled (Fabric + TurboModules) |
| Language | TypeScript (strict) |
| Navigation | `@react-navigation/native-stack` + `@react-navigation/bottom-tabs` |
| State | React contexts + AsyncStorage (no backend) |
| Fonts | `@expo-google-fonts/roboto-serif`, `@expo-google-fonts/noto-sans-sc`, `@expo-google-fonts/inter` |
| UI | `expo-linear-gradient`, `expo-blur`, `react-native-svg`, `@expo/vector-icons`, `lottie-react-native` |
| Animation | `react-native-reanimated` v4, `react-native-gesture-handler` |
| Native modules | `react-native-share`, `react-native-iap` (installed; not yet wired), `react-native-view-shot`, `expo-notifications`, `expo-store-review`, `expo-clipboard`, `expo-image-picker`, `expo-auth-session` |

---

## Project structure

```
HerBibleApp/
├── App.tsx                     # Provider stack + font loading
├── index.ts                    # Expo entry
├── app.json                    # Expo config
├── eas.json                    # EAS build/submit config
├── assets/
│   └── lottie/                 # Lottie animations
└── src/
    ├── navigation/
    │   ├── RootNavigator.tsx   # Stack: Tabs, Streak, PrayerFlow, MoodFlow,
    │   │                       #        MoodCalendar, RemoveAds, HelpCenter,
    │   │                       #        HelpAnswer, AddWidget, AboutUs,
    │   │                       #        Policy, Notifications
    │   ├── TabNavigator.tsx    # Bottom tabs: prayer / bible / plan / profile
    │   └── types.ts            # RootStackParamList + TabParamList
    ├── screens/
    │   ├── PrayerScreen.tsx           # Daily verse, mood toggle, morning/evening cards
    │   ├── PrayerFlow.tsx             # 4-step modal (Verse → Meditation → Action → Prayer)
    │   ├── BibleScreen.tsx            # Reader with toolbar + cross-Bible search
    │   ├── PlanScreen.tsx             # Devotional plans
    │   ├── ProfileScreen.tsx          # Stats, notes, saved verses, settings
    │   ├── StreakScreen.tsx           # Calendar of completed days
    │   ├── OnboardingScreen.tsx       # First-run gate
    │   ├── MoodFlow.tsx               # Mood check-in 4-step
    │   ├── MoodCalendarScreen.tsx     # Mood calendar history
    │   ├── NotificationsScreen.tsx    # 4 reminder sections
    │   ├── RemoveAdsScreen.tsx        # IAP paywall (UI only)
    │   ├── AddWidgetScreen.tsx        # Home-screen widget previews
    │   ├── HelpCenterScreen.tsx       # 7 help items
    │   ├── HelpAnswerScreen.tsx       # Single help item detail
    │   ├── AboutUsScreen.tsx          # Company info + policy links
    │   └── PolicyScreen.tsx           # Terms / Privacy / Content
    ├── components/
    │   ├── shared/                    # TabBar, Glass, Pill, DayCircle, FireFlame
    │   ├── MoodCalendar.tsx
    │   ├── MoodEmoji.tsx              # 9 SVG mood faces
    │   ├── ProfileTiles.tsx
    │   ├── RatePromptSheet.tsx
    │   ├── ShareVerseSheet.tsx
    │   ├── SignInSheet.tsx
    │   ├── TimePickerSheet.tsx
    │   ├── VerseCardArt.tsx
    │   ├── VerseNoteSheet.tsx
    │   ├── WeeklyProgressView.tsx
    │   └── WidgetPreview.tsx          # 2×2 / 4×2 / 5×2 widgets
    ├── state/                         # AsyncStorage-backed contexts
    │   ├── AuthContext.tsx
    │   ├── PrayerContext.tsx          # day records → totalComplete, maxStreak
    │   ├── NotesContext.tsx
    │   ├── SavedVersesContext.tsx
    │   ├── HighlightsContext.tsx
    │   ├── BookmarksContext.tsx
    │   ├── ReadChaptersContext.tsx
    │   ├── ActivityContext.tsx
    │   ├── TranslationsContext.tsx    # 7 translations + download progress
    │   ├── OnboardingContext.tsx
    │   ├── RatePromptContext.tsx      # cadence rules
    │   ├── MoodCheckInContext.tsx     # picks + 8h gate
    │   └── NotificationsContext.tsx   # 4 reminder schedules
    ├── services/
    │   └── bibleService.ts            # jsDelivr fetch + streaming search
    └── constants/
        ├── theme.ts                   # ROSE, LAV, TXT, TXTSUB, P, BG…
        ├── data.ts                    # Verses, plans, prayer flow data
        ├── corpus.ts                  # CORPUS_COMMIT pin + jsDelivr URL builder
        ├── bibleBookNames.ts
        ├── moodContent.ts
        ├── helpContent.ts             # 7 Q&A items + SUPPORT_EMAIL re-export
        ├── aboutContent.ts            # SUPPORT_EMAIL = 'support@everlandapps.com'
        └── oauth.ts
```

---

## Bible content pipeline

- 7 translations: **KJV**, **Lutherbibel 1912**, **Louis Segond 1910**, **Reina-Valera 1909**, **Almeida**, **和合本 1919 繁體**, **和合本 1919 簡體**.
- Source repo: `sangchy1972/pd-text-corpus` (user's personal mirror of public-domain Bible text).
- Served via **jsDelivr**: `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@<COMMIT>/...`
- The commit SHA is pinned in `src/constants/corpus.ts` (`CORPUS_COMMIT`); cache keys are namespaced by this commit so bumping it invalidates old caches automatically.
- `bibleService.ts` exposes `searchCachedVerses` and `streamingSearchVerses` for cross-Bible searches starting from the current book.

---

## Prerequisites

- Node.js 20+
- npm
- Xcode 16+ (iOS)
- Android Studio + emulator or a physical device (Android)
- Expo CLI via `npx expo`

## Install & run

```bash
npm install
npm start          # Expo dev tools
npm run ios        # iOS simulator
npm run android    # Android emulator
```

Expo Go works for most flows. Native-only features (notifications, IAP, share to specific apps, widget pinning) need a development build.

---

## Pre-release checklist

- [ ] Set `ios.bundleIdentifier` and `android.package` in `app.json`.
- [ ] Add `ios.buildNumber` / `android.versionCode`; bump on every submission.
- [ ] Replace placeholder icons in `assets/` (1024×1024 + adaptive icon foreground + splash artwork).
- [ ] Splash background → `#FBF7F6` (matches `BG`).
- [ ] Host privacy policy publicly; link in store listings.
- [ ] Apple/Google content-rating questionnaires.
- [ ] App Tracking Transparency disclosures if analytics or ads ship.
- [ ] Wire `react-native-iap` for the Remove Ads paywall (Lifetime / Annual / Monthly).
- [ ] Apple requires Sign in with Apple if Facebook/Google login ships (see `oauth.ts`).
- [ ] Screenshots: 6.7″ iPhone, 12.9″ iPad, Android phone & tablet.

---

## Building & publishing with EAS

`eas.json` is already in the repo. One-time setup:

```bash
npm install -g eas-cli
eas login
eas init       # if projectId isn't set yet
```

### iOS

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

### Android

```bash
eas build --platform android --profile production
eas submit --platform android --latest
```

First Android submission requires a manual `.aab` upload to create the listing.

### OTA JS updates

```bash
npx expo install expo-updates
eas update:configure
eas update --branch production --message "tweak prayer copy"
```

---

## Conventions

- **Theme tokens** live in `src/constants/theme.ts` — use `ROSE`, `LAV`, `TXT`, `TXTSUB`, `P`, `BG`. Don't hardcode colors.
- **Static content** (verses, plans, book lists) lives in `src/constants/`.
- **Shared UI primitives** go in `src/components/shared/`.
- **Sheet pattern**: 0.3 s dim + 0.1 s-delayed 0.5 s slide-down + swipe-down dismiss (centralized via `useSheetPan` where applicable).
- **Fonts**: titles use Roboto Serif; non-title text uses Noto Sans (CJK-capable).
- **Vectors over emoji** everywhere.
- **Adaptive layouts**: must work iPhone SE → 14 Pro Max — no fixed widths that break on small screens.
- **TypeScript strict** — fix types, don't silence them.
- **Crash-free is non-negotiable** — defensive null checks at boundaries, never assume context is loaded before render gates pass.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` | Open iOS simulator |
| `npm run android` | Open Android emulator |
| `npm run web` | Web preview (limited) |
| `npx tsc --noEmit` | Type-check without emitting |

## License

Proprietary — all rights reserved unless a `LICENSE` file is added.
