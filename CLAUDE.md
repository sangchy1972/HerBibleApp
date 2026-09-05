# CLAUDE.md

Standing guidance for working on **HerBibleApp** (Everland Apps). Read `README.md` for the
project map; this file is the durable "how we work" rulebook. It captures the owner's
requirements — follow them by default without re-asking.

**Before touching any subsystem, read the matching section of `docs/dev-guide.md`** —
the module-by-module rulebook (UI style, prompt/nudge coordinator, ads, quiz, guides,
prayer flow, paywall, notifications, content pipeline) plus the ledger of mistakes not to
repeat. Keep it current: when a rule or a number changes, edit that file in the same
commit.

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

## Shipping a release

📖 **Full runbook: `docs/release-build-runbook.md`** — CDN asset upload order, the
Cloudflare purge that a same-name overwrite silently needs, the tsc exit-code
trap, and the two content-asset constraints (paintings append-only; which
collection binds the question budget). The rules below are the short list; the
runbook says WHY, which is the part that stops the mistake recurring.

- **ALWAYS build BOTH platforms.** Every release goes to the App Store and Play
  together. `npm run build:all`. Never hand over an Android-only command.
- `eas-cli` is installed nowhere — not globally, not as a dependency. Every EAS
  command goes through `npx --yes eas-cli@latest`, which is what the `build:*`
  and `submit:*` npm scripts already do.
- **Propose the version number, then edit it — do not ask.** Every release,
  say what the next version should be and why (semver against what shipped:
  new user-facing feature → minor, fixes only → patch), and write it into
  `app.json` in the same pass. The owner overrides if he disagrees; he should
  never have to tell you to make the edit.
- Version lives in `app.json` (`version`) and NOWHERE else — the Profile footer
  reads it via `Constants.expoConfig?.version`. It was hardcoded once and spent
  a release lying about which build the user had. `versionCode` / `buildNumber`
  are remote + autoIncrement — never edit them by hand.
- R2 upload scripts use `wrangler`. If `CLOUDFLARE_API_TOKEN` (or `CF_API_TOKEN`
  / `CLOUDFLARE_API_KEY`) is set in the shell, wrangler uses it and IGNORES
  `wrangler login`, so a stale token 401s forever. Every upload script now warns
  about this up front.
- `play-service-account.json` is gitignored and only needed for
  `eas submit -p android`. Building never needs it, and uploading the AAB
  manually in Play Console never needs it either.

## Settled decisions (do not re-open, do not re-ask)

- **The `app_open` hot-start interstitial STAYS.** Backgrounded ≥15s then
  returning shows an interstitial (`services/adFrequency.ts`, day ≥ 3 users).
  Audits will keep flagging it under Play's Disruptive Ads policy. The owner has
  decided; the risk is understood and accepted. Do not raise it again.
- **The `quiz_retry` interstitial is UNCAPPED.** Every tap of "Try those again"
  fires one, throttled only by the global 60s `MIN_INTERVAL_MS`. More wrong
  answers is intended to mean more impressions. Do not add a per-visit or
  per-day cap.
- The 400ms delay before `quiz_retry` shows is NOT a frequency control — it
  stops a double-tap landing on the creative, which is an invalid-traffic risk
  to the AdMob account. Keep it.

## Product facts (do not re-derive)

- Bundle id: `com.holy.bible.kjv.audio.prayer`.
- Firebase: display **name** `herbible-001`, project **ID** `herbible-d1cc7`, project number
  `553397384848`. Same project — the console breadcrumb shows the name, `google-services.json`
  shows the id. Don't mistake them for two projects.
- **IAP** (`src/services/iap.ts`): one "ad-free" entitlement granted by any of three products —
  `herbible_remove_ads_lifetime` (non-consumable), `herbible_premium_annual` (P1Y sub),
  `herbible_premium_monthly` (P1M sub). Same ids on both stores. No backend; trust the store client.
- **ATT fires before ads init** (`ensureAttRequested().finally(initAds)` in `App.tsx`) — keep that order.
- **EAS**: `appVersionSource: "remote"` + `autoIncrement`. Build/versionCode auto-climbs every
  production upload; the marketing **version** (e.g. 1.0) only changes when you edit `app.json`.
- US-only interstitial floor ladder is gated `region === 'US' && !__DEV__` — won't run on a
  non-US/dev device.
- **R2 buckets** — two, on purpose. `herbible-plans-7languages` → `covers.everlandapps.com`
  (plan covers, badge art, prayer audio, legal pages). `herbible-quiz` → `quiz.everlandapps.com`
  (quiz banks at `/v1/quiz-<lang>.json`). Both are path-versioned: a custom domain puts
  Cloudflare's cache in front, so re-cut content under the same key can serve stale for a long
  time — bump the `/v1/` segment instead of purging. Never per-file SHAs.
- **Cloudflare Access service token** — Zero Trust → Access controls → Service
  credentials → Service Tokens, named `herbible-app`, created 2026-06-06,
  **Non-expiring** and deliberately so: the pair is inlined into the shipped
  binary via `EXPO_PUBLIC_CF_ACCESS_CLIENT_ID` / `_SECRET`, so rotating it means
  a release and waiting for users to update. A self-expiring token in front of a
  client that cannot hot-update is a scheduled outage. Do not "fix" it by adding
  an expiry, and do not confuse it with the User API Tokens under My Profile —
  those are wrangler's and touching them cannot affect live users.
  Its `Last Seen` column is the fastest way to answer "can live users still
  reach the plans Worker".
- **Ad unit / placement IDs** live in the AdMob / Meta consoles (the repo mirror
  `docs/ad-unit-ids.md` was removed in the 2026-09-05 owner cleanup). Meta Audience
  Network app id `1020655230368479` + its 6 placements exist for Meta *bidding*
  inside AdMob mediation. The app renders **interstitials only**, so only the
  Interstitial placement can ever fill, and the Meta adapter is still
  `enabled: false` in `plugins/withAdMobMediation.js`.
