# HerBibleApp

A Bible & prayer companion for women — daily Scripture, guided morning/evening prayer flows,
mood check-ins, reading plans, streak tracking, and 7 Bible translations. Expo + React Native,
shipping to the Apple App Store and Google Play.

> **Company:** Everland Apps · **Support:** support@everlandapps.com
> Working rules live in **`CLAUDE.md`** — read it before making changes.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Expo SDK 54, React Native 0.81, React 19 (New Architecture: Fabric + TurboModules) |
| Language | TypeScript (strict) |
| Navigation | `@react-navigation` native-stack + bottom-tabs |
| State | React contexts + AsyncStorage (no backend) |
| UI / Animation | `expo-linear-gradient`, `expo-blur`, `react-native-svg`, `lottie-react-native`, `react-native-reanimated` v4, `react-native-gesture-handler` |
| Native | `react-native-iap`, `react-native-share`, `react-native-view-shot`, `expo-notifications`, `expo-store-review`, `expo-image-picker`, `expo-tracking-transparency`, Firebase Auth + Google Sign-In |

---

## Project structure

```
HerBibleApp/
├── App.tsx            # Provider stack, font loading, ATT→ads init
├── app.json / eas.json
└── src/
    ├── navigation/    # RootNavigator (stack) + TabNavigator (prayer/bible/plan/profile)
    ├── screens/       # Prayer, PrayerFlow, Bible, Plan, Profile, Streak, Onboarding,
    │                  #   MoodFlow, MoodCalendar, Notifications, RemoveAds, AddWidget,
    │                  #   HelpCenter, HelpAnswer, AboutUs, Policy
    ├── components/     # shared/ primitives + sheets (Rate, ShareVerse, SignIn, TimePicker,
    │                  #   VerseNote…), MoodCalendar, WidgetPreview, VerseCardArt
    ├── state/         # AsyncStorage-backed contexts (Prayer, Notes, SavedVerses, Highlights,
    │                  #   Bookmarks, ReadChapters, Activity, Translations, Onboarding,
    │                  #   RatePrompt, MoodCheckIn, Notifications, Auth)
    ├── services/      # bibleService, iap, ads, att, firebase, firebaseAuth, usInterstitial
    ├── i18n/          # strings, sourceCatalog, useT (7 UI languages)
    └── constants/     # theme, data, corpus, bibleBookNames, moodContent, helpContent,
                       #   aboutContent (SUPPORT_EMAIL), oauth
```

---

## Bible content pipeline

- 7 translations: **KJV**, **Lutherbibel 1912**, **Louis Segond 1910**, **Reina-Valera 1909**,
  **Almeida**, **和合本 1919 繁體**, **和合本 1919 簡體**.
- Source: `sangchy1972/pd-text-corpus` (personal mirror of public-domain text), served via
  jsDelivr: `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@<COMMIT>/...`.
- Commit SHA pinned in `src/constants/corpus.ts` (`CORPUS_COMMIT`); cache keys are namespaced by
  it, so bumping the pin invalidates old caches automatically.
- `bibleService.ts` exposes `searchCachedVerses` + `streamingSearchVerses` for cross-Bible search.

---

## Monetization & auth

- **IAP** (`src/services/iap.ts`): one "ad-free" entitlement granted by any of three products —
  `herbible_remove_ads_lifetime` (non-consumable), `herbible_premium_annual` (P1Y),
  `herbible_premium_monthly` (P1M). Same ids on both stores; no backend (trust the store client).
- **Ads**: AdMob + Meta Audience Network bidding. US-only interstitial floor ladder gated on
  `region === 'US' && !__DEV__` (see `docs/ad-waterfall-US.md`).
- **ATT** fires before ads init (`App.tsx`). **Auth**: Firebase (Google Sign-In + email magic-link).

---

## Install & run

```bash
npm install
npm start            # Expo dev tools
npm run ios          # iOS simulator
npm run android      # Android emulator
npx tsc --noEmit     # type-check
npm test             # jest
```

Expo Go covers most flows. Native-only features (notifications, IAP, share targets, widget
pinning, ATT) need a development build.

---

## Building & publishing (EAS)

`eas.json` is in the repo. `appVersionSource: "remote"` + `autoIncrement` — build/versionCode
climbs automatically each production upload; bump the marketing **version** in `app.json` only
for a new user-facing release.

```bash
# one-time
npm install -g eas-cli && eas login && eas init

# iOS
eas build --platform ios --profile production
eas submit --platform ios --latest

# Android (first submission needs a manual .aab upload to create the listing)
eas build --platform android --profile production
eas submit --platform android --latest

# OTA JS updates
eas update --branch production --message "tweak prayer copy"
```

---

## Conventions

- **Theme tokens** in `src/constants/theme.ts` — use `ROSE`, `LAV`, `TXT`, `TXTSUB`, `P`, `BG`;
  never hardcode colors. Backgrounds lean white/grey-white, rose as accent.
- **Static content** (verses, plans, book lists) → `src/constants/`; **shared primitives** →
  `src/components/shared/`.
- **Sheet pattern**: dim + slide-up from bottom + swipe-down dismiss (`useSheetPan`).
- **Fonts**: titles Roboto Serif; body Noto Sans (CJK-capable). **Vectors over emoji.**
- **Adaptive** iPhone SE → Pro Max — no fixed widths that break small screens.
- **TypeScript strict** — fix types, don't silence. **Crash-free is non-negotiable** —
  defensive null checks; never render before context gates pass.
- Verify `tsc --noEmit` + `npm test` before committing (commits auto-sync to GitHub).

## License

Proprietary — all rights reserved unless a `LICENSE` file is added.
