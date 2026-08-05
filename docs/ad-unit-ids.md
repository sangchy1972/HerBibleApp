# Ad unit / placement ID registry

The one place these live. Nothing here is a secret — ad unit IDs are visible in
any decompiled binary — but they are easy to mix up between platforms and
networks, and a wrong ID fails silently as "no fill" rather than as an error.

## Meta Audience Network (for AdMob mediation bidding)

**App ID: `1020655230368479`**

Created for **Meta bidding inside AdMob mediation groups** — not for a direct
Meta integration. Each placement is pasted into the AdMob mediation group as a
bidding ad source; AdMob then calls Meta through the adapter at auction time.

| # | Format | Placement ID |
| --- | --- | --- |
| 1 | Banner | `1020655230368479_1026027019831300` |
| **2** | **Interstitial** | **`1020655230368479_1026027013164634`** |
| 3 | Medium rectangle | `1020655230368479_1026027023164633` |
| 4 | Native | `1020655230368479_1026027033164632` |
| 5 | Native banner | `1020655230368479_1026027026497966` |
| 6 | Rewarded interstitial | `1020655230368479_1026027029831299` |

A Meta placement ID is always `<appId>_<placementId>`, so every row above starts
with the same App ID. If one doesn't, it was pasted from the wrong account.

### Only #2 is live-relevant today

This app renders **interstitials only** — no banners, no native, no rewarded
(see `services/ads.ts`). Placements 1 and 3–6 exist for formats nothing in the
codebase requests, so wiring them into a mediation group produces exactly zero
impressions. Keep them registered for the day a format is added; don't read
their zero fill as a problem.

### Two things that must be true before #2 earns anything

**1. The adapter has to be in the binary.** ✅ Done — `meta` is `enabled: true`
in `plugins/withAdMobMediation.js` as of 2026-07-26, so the adapter
(`com.google.ads.mediation:facebook` / `GoogleMobileAdsMediationFacebook`) and
Meta's two SKAdNetwork IDs ship from the next build onward. Note this only takes
effect **in a build made after that date** — a bidding source configured in
AdMob cannot respond from a binary that predates it.

**2. Interstitial must go in as BIDDING, not waterfall.** Meta has been
bidding-only for interstitial since 2021. There is no eCPM floor to set; if the
AdMob UI is asking you for one, you are adding it to the wrong kind of group.

### Also required

- **app-ads.txt** — already carries the Meta line at
  `https://everlandapps.com/app-ads.txt`:
  `facebook.com, 1720054809146063, DIRECT, c3e20eee3f780d68`.
  Note that number is the **business ID**, which is a different thing from the
  Audience Network App ID above. Both are correct in their own place.
- **iOS advertiser tracking — DONE.** `plugins/withMetaAdvertiserTracking.js`
  injects `FBAdSettings.setAdvertiserTrackingEnabled(<ATT status>)` into
  `AppDelegate.swift`. It resolves the class through the Objective-C runtime
  rather than importing `FBAudienceNetwork`, so it compiles and no-ops while
  `meta` is still `enabled: false` — no compile-time dependency on a pod that
  isn't linked yet. Applied at `didFinishLaunching` and re-applied on
  `didBecomeActive`, because on a first run ATT is still `.notDetermined` at
  launch (the prompt is fired from JS at app root) and the user's answer needs
  to land afterwards.
  ⚠️ Written without a macOS toolchain to compile against — **check the first
  iOS build after this shipped.** The design fails safe (no flag rather than a
  broken build), but "fails safe" is not "verified".
- **Testing** — the Facebook app must be installed and logged in on the device
  to see Meta test ads.

## AdMob

Publisher ID `pub-4656643588243987`. Units are defined in code rather than
duplicated here, because they are selected at runtime per platform and per
waterfall tier and a stale copy in a doc would be worse than no copy:

> 📍 For WHICH user gets which of these — the region fork, the three parallel
> paths, the dev-build downgrade — see `docs/ad-routing.md`. The table below is
> only a map of where the ids live.

| What | Where |
| --- | --- |
| Worldwide interstitial (non-US + all iOS) | `services/ads.ts` → `REAL_INTERSTITIAL_UNIT_ID` |
| First-open onboarding interstitial | `services/ads.ts` → `REAL_ONBOARDING_UNIT_ID` |
| US waterfall ladder, 26 tiers | `services/usInterstitial.ts` → `ANDROID_SUFFIX` / `IOS_SUFFIX` |

iOS and Android unit IDs are **not** interchangeable — each lives under its own
platform App ID. The US ladder is chosen by `Platform.OS` at runtime, so one JS
bundle ships to both stores and each binary requests its own set.

Dev builds always use Google's **test** interstitial via the `__DEV__` guard, so
we never serve or click our own live ad (which gets an AdMob account flagged).
To check a real unit on a device, register that device as a test device in
AdMob rather than removing the guard.
