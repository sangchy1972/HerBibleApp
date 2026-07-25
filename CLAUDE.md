# CLAUDE.md

Standing guidance for working on **HerBibleApp** (Everland Apps). Read `README.md` for the
project map; this file is the durable "how we work" rulebook. It captures the owner's
requirements — follow them by default without re-asking.

## Communication

- Reply in **Chinese** unless asked otherwise.
- Be **concise and direct**. Cut words that don't change the meaning. No filler preamble,
  no restating the question, no long postambles after delivering a file.
- Surface the answer/result first; keep explanation to what's needed.

## Design & UI

- **Vectors over emoji** everywhere.
- **Never hardcode colors** — use theme tokens from `src/constants/theme.ts`
  (`ROSE`, `LAV`, `TXT`, `TXTSUB`, `P`, `BG`, …).
- Backgrounds lean **white / grey-white, not pink**. Keep the rose as an accent, not a wash.
- **Adaptive layouts** must work iPhone SE → Pro Max. No fixed widths that break small screens.
- **Sheet pattern**: dim + slide-up from bottom, swipe-down dismiss (see `useSheetPan`).
- Titles use Roboto Serif; body uses Noto Sans (CJK-capable).
- Respect deliberate tweaks already in components (e.g. `RatePromptSheet` emoji sizing,
  no-shadow CTAs) — don't revert them.

## Engineering

- **TypeScript strict** — fix types, never silence them.
- **Crash-free is non-negotiable** — defensive null checks at boundaries; never assume a
  context is loaded before its render gate passes. Guarded `require` for native modules so
  older dev clients degrade to no-ops instead of crashing (pattern in `services/*`).
- Static content (verses, plans, book lists) lives in `src/constants/`; shared primitives in
  `src/components/shared/`.

## Verify before commit

- Run `npx tsc --noEmit` **and** `npm test` (jest) before committing. Don't commit red.
- Commits **auto-sync** to GitHub out of band. A manual `git push` fails (no credentials) —
  that's expected, not a bug to chase.

## Product facts (do not re-derive)

- Bundle id: `com.holy.bible.kjv.audio.prayer`. Firebase project `herbible-d1cc7`.
- **IAP** (`src/services/iap.ts`): one "ad-free" entitlement granted by any of three products —
  `herbible_remove_ads_lifetime` (non-consumable), `herbible_premium_annual` (P1Y sub),
  `herbible_premium_monthly` (P1M sub). Same ids on both stores. No backend; trust the store client.
- **ATT fires before ads init** (`ensureAttRequested().finally(initAds)` in `App.tsx`) — keep that order.
- **EAS**: `appVersionSource: "remote"` + `autoIncrement`. Build/versionCode auto-climbs every
  production upload; the marketing **version** (e.g. 1.0) only changes when you edit `app.json`.
- US-only interstitial floor ladder is gated `region === 'US' && !__DEV__` — won't run on a
  non-US/dev device.
