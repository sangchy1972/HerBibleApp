// AdMob interstitial ads via react-native-google-mobile-ads.
//
// App ID (app.json) + the interstitial UNIT below are the REAL ones. The dev
// build still uses the TEST interstitial (via the __DEV__ guard) so we never
// serve / click our own LIVE ad in debug (which flags the account). More
// waterfall units can be added later. UMP consent is wired in initAds()
// (requestInfoUpdate + show form if required).
//
// The native module is loaded with a guarded require (not a static import) so a
// dev client built BEFORE the module was added doesn't crash at import time —
// the same defensive pattern used in services/firebase.ts. On such a build all
// functions below become silent no-ops.
//
// ─── ⏳ LEGACY GMA SDK HAS A DEATH DATE — READ THIS BEFORE Q2 2027 ───────────
// On 2026-07-06 Google announced GMA Next-Gen SDK (Android) and declared the
// SDK this file uses to be LEGACY:
//   https://ads-developers.googleblog.com/2026/07/announcing-google-mobile-ads-next-gen.html
//   "Google Mobile Ads SDK for Android is now legacy."
// Timetable (https://developers.google.com/admob/android/deprecation):
//   2027-06-30  Deprecated — ads still serve, technical support ENDS.
//   2028-06-30  Sunset     — ads at RISK OF NOT SERVING, and Play blocks
//                            releases for shipping an "outdated SDK".
// We are deliberately NOT migrating yet (decision 2026-07-12). Why:
//   • Next-Gen is ANDROID-ONLY. No iOS version exists and Google has not
//     announced one — the word "iOS" doesn't appear in the announcement.
//   • NO React Native / Expo / Flutter / Unity wrapper exists for it, from
//     anyone. Migrating means hand-writing a Kotlin Expo module (init on a
//     background thread, ~30 interstitial units, a callback bridge that
//     marshals Next-Gen's background-thread callbacks back to the main thread)
//     and owning it forever.
//   • Next-Gen and legacy CANNOT coexist in one Android binary — they share the
//     com.google.android.gms.ads namespace, so we'd also have to patch
//     react-native-google-mobile-ads to strip its Android half while keeping it
//     for iOS. Two ad stacks, two consent wirings, one waterfall behaving two ways.
//   • The headline Next-Gen win (banner latency) doesn't apply — we run
//     interstitials only.
// The RIGHT outcome is the RN library gaining Next-Gen support once, for
// everyone. Track: https://github.com/invertase/react-native-google-mobile-ads/issues/836
// (opened Feb 2026, still UNANSWERED as of 2026-07-12).
// ⇒ REVISIT BY Q2 2027. If issue #836 is still dead by then and Google still
//   hasn't shipped Next-Gen for iOS, we have to plan the bespoke Android module
//   with real lead time — not discover the problem when Play blocks a release.
// Mediation is NOT a blocker either way: Next-Gen reuses the SAME
// com.google.ads.mediation:* adapters (see plugins/withAdMobMediation.js), ad
// unit IDs are unchanged, and the UMP API is identical — so the port, when it
// happens, is about the SDK surface, not the ad business config.

import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent, setUserProps } from './firebase';
import { ensureAttRequested } from './att';
import { startUsController, stopUsController, usOnShowOpportunity, isUsControllerActive } from './usInterstitial';
import { startAdEngine, stopAdEngine, isAdEngineActive, engineOnShowOpportunity } from './adEngine';
import { hydrateAdValueStore } from './adValueStore';
import { setInterstitialVisible, noteInterstitialShown } from './interstitialVisibility';
import { deviceRegion } from './deviceRegion';
import { initAdRevenue, onAdPaid } from './adRevenue';
import { hydrateAdRevenueConfig, refreshAdRevenueConfig, isFirstRun } from './adRevenueConfig';
import { MIN_AD_INTERVAL_MS, type AdPlacement } from '../constants/adPacing';

let mobileAdsFn: any = null;
let InterstitialAdCls: any = null;
let AdEventTypeEnum: any = null;
let TestIdsObj: any = null;
let AdsConsentObj: any = null;   // UMP (User Messaging Platform) consent API
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ads = require('react-native-google-mobile-ads');
  mobileAdsFn = ads.default;
  InterstitialAdCls = ads.InterstitialAd;
  AdEventTypeEnum = ads.AdEventType;
  TestIdsObj = ads.TestIds;
  AdsConsentObj = ads.AdsConsent;
} catch {
  /* native module not in this build → no-op everywhere below */
}

// ATT lives in its own module now (services/att) so it can be fired at app root
// BEFORE ads, independently of the consent flow — see the note there and the
// 5.1.2(i) rejection. We only AWAIT it here so the SDK inits with the resolved
// status; we no longer own the prompt.

// Real interstitial ad units for the simple single-unit path (everyone who is
// NOT routed to the US waterfall controller: non-US Android, all iOS, and any
// device whose region can't be detected). Android uses a DEDICATED unit so its
// global traffic no longer pollutes the US ladder's unit-0 (3482477831) stats
// in the AdMob console. Per-platform — AdMob unit IDs are NOT interchangeable
// across iOS/Android, and each lives under its own platform App ID (see
// app.json react-native-google-mobile-ads androidAppId / iosAppId).
const REAL_INTERSTITIAL_UNIT_ID = Platform.select({
  // Dedicated non-US units per platform (HB_ios_splash_ww_00 / a dedicated
  // Android ww unit) so worldwide traffic never pollutes the US ladder's unit-0
  // stats in the AdMob console.
  ios:     'ca-app-pub-4656643588243987/8692353122',
  android: 'ca-app-pub-4656643588243987/5238876625',
  default: 'ca-app-pub-4656643588243987/5238876625',
}) as string;
// In a DEV build ALWAYS use Google's TEST interstitial so we never serve / click
// our own LIVE ad (that gets the AdMob account flagged). The production build
// uses the real unit. To verify the real unit on a device safely, register it as
// a test device in AdMob instead of removing this guard.
const INTERSTITIAL_UNIT_ID: string = __DEV__
  ? (TestIdsObj?.INTERSTITIAL ?? 'ca-app-pub-3940256099942544/1033173712')
  : REAL_INTERSTITIAL_UNIT_ID;

// Dedicated FIRST-OPEN onboarding interstitials (text/image/rich-media only —
// the units have no video formats configured). Loaded in PARALLEL with the
// regular preload/US-controller as a third independent request, and shown
// with PRIORITY during onboarding: the flow attempts it right after the
// welcome screen and again on every step transition until it has shown once
// (per user: it MUST show once before onboarding completes, then never
// again). Per-platform units under their own App IDs; same __DEV__ test-unit
// policy as above.
const REAL_ONBOARDING_UNIT_ID = Platform.select({
  android: 'ca-app-pub-4656643588243987/5004598985',
  ios:     'ca-app-pub-4656643588243987/7247618944',
  default: 'ca-app-pub-4656643588243987/5004598985',
}) as string;
const ONBOARDING_INTERSTITIAL_UNIT_ID: string = __DEV__
  ? (TestIdsObj?.INTERSTITIAL ?? 'ca-app-pub-3940256099942544/1033173712')
  : REAL_ONBOARDING_UNIT_ID;

// ─── Startup must never hang on the ad stack ────────────────────────────────
// mobileAds().initialize() initializes EVERY mediation adapter on the classpath
// (Liftoff today; Pangle / InMobi / Meta when they're switched on). An adapter
// that is compiled in but NOT yet configured in the AdMob console — or one that
// is just slow on a bad network — can leave that promise pending forever. It
// can't crash us (the whole of initAds is inside a try/catch and it's called
// fire-and-forget off runAfterInteractions, so the UI never waits on it), but an
// unbounded await here would silently kill the ENTIRE ad pipeline for the
// session: `initialized` would never flip, so preloadOnboarding / preload /
// startUsController would never run. Invisible zero-revenue.
//
// So every await in the init path is bounded, and on timeout we go ahead anyway:
// ad requests made before the SDK finishes initializing are queued by the native
// SDK, and if one really does fail, the ERROR handler already reloads.
const INIT_TIMEOUT_MS = 8000;      // SDK + adapter initialization
const CONSENT_TIMEOUT_MS = 6000;   // UMP info update / form
const ATT_TIMEOUT_MS = 30000;      // waits on a human tapping the iOS prompt

/** Resolves to `fallback` if `p` hasn't settled within `ms`. Never rejects. */
function bounded<T>(p: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      logEvent('ads_init_timeout', { step: label });
      resolve(fallback);
    }, ms);
    p.then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(timer); resolve(fallback); } },
    );
  });
}

/** Per-adapter init result, flattened for a Firebase event (params are limited
 *  in count and length, so this is one compact string, not one event each).
 *  Exported for the unit test. */
export function summarizeAdapterStatuses(list: unknown): { ready: number; total: number; detail: string } {
  if (!Array.isArray(list)) return { ready: 0, total: 0, detail: '' };
  const parts: string[] = [];
  let ready = 0;
  for (const s of list) {
    const st = s as { name?: string; state?: number };
    const name = String(st?.name ?? '?')
      .replace(/^com\.google\.ads\.mediation\./, '')   // com.google.ads.mediation.vungle → vungle
      .replace(/Adapter$/i, '')
      .slice(0, 24);
    const ok = st?.state === 1;                        // AdapterInitializationStateReady
    if (ok) ready += 1;
    parts.push(`${name}:${ok ? 'ok' : 'no'}`);
  }
  return { ready, total: list.length, detail: parts.join(',').slice(0, 90) };
}

// Persisted "user removed ads" flag — flip to true from the Remove-Ads IAP once
// that's wired (call setAdsRemoved(true) on a successful purchase / restore).
const REMOVE_ADS_KEY = 'ads:removed:v1';

// Frequency cap: never show two interstitials within this window, so e.g.
// finishing morning prayer and a plan day back-to-back won't double-pop.
// One shared constant across all three show paths — see constants/adPacing.
const MIN_INTERVAL_MS = MIN_AD_INTERVAL_MS;   // shared — see constants/adPacing

let adsRemoved = false;
let initialized = false;
let interstitial: any = null;
let loaded = false;
let lastShownAt = 0;

// Onboarding interstitial state — independent of the regular path.
let onboardingInterstitial: any = null;
let onboardingLoaded = false;
let onboardingShown = false;
let onboardingRetries = 0;

// Bumped on every GRANT. A revoke path captures this before its store queries
// and bails if it changed meanwhile — otherwise a launch-time check that started
// before a purchase could resume afterwards and undo it.
let grantGeneration = 0;
export function adsGrantGeneration(): number { return grantGeneration; }

export async function setAdsRemoved(value: boolean): Promise<void> {
  if (value) grantGeneration += 1;
  adsRemoved = value;
  setUserProps({ ads_removed: value ? 'on' : 'off' });   // payer cohort for BigQuery
  // Tear the request machinery down on purchase so tickers + cached/in-flight
  // ads stop immediately (not just no-op behind the flag).
  if (value) {
    try { stopUsController(); } catch {}
    try { stopAdEngine(); } catch {}
  }
  try { await AsyncStorage.setItem(REMOVE_ADS_KEY, value ? '1' : '0'); } catch {}
}

export function areAdsRemoved(): boolean {
  return adsRemoved;
}

// Device-region detection (no extra dependency — reads the OS locale via RN's
// built-in native modules). Used to route US users through the waterfall
// controller. NOTE: this is the DEVICE region, a client-side proxy for the
// ad-serving country (which AdMob ultimately decides by IP). Good enough for
// the US-only rollout; swap for a real geo/IP signal later if needed.
export function isUsUser(): boolean {
  return deviceRegion() === 'US';
}

// Initialize the SDK once at app launch and preload the first interstitial.
export async function initAds(): Promise<void> {
  if (initialized || !mobileAdsFn) return;
  try {
    const stored = await AsyncStorage.getItem(REMOVE_ADS_KEY);
    // ONE-WAY: only ever turn the flag ON from storage. initIap runs in the same
    // tick and may grant the entitlement in memory before its setItem commits —
    // assigning `stored === '1'` here would overwrite that grant and serve ads
    // to a paying user for the whole session.
    if (stored === '1') adsRemoved = true;
  } catch { /* default: ads on */ }
  if (adsRemoved) { initialized = true; return; }
  // Impression-level revenue plumbing. BOTH must be in memory before the first
  // ad can serve: the accumulators (so a mid-day relaunch resumes instead of
  // re-firing today's LTV tiers) and the config (so the very first impression
  // already knows whether WE own `ad_impression` on this platform). Both read
  // from cache only — the network refresh below is fire-and-forget.
  // Bounded like every other await in this function: neither call can reject,
  // but a wedged AsyncStorage would hang here forever, and `initialized` would
  // never flip — no preload, no onboarding ad, no US controller. Invisible
  // zero-revenue for the session, which is worse than missing accumulators.
  // On timeout adRevenue stays un-hydrated, and its `hydrated` gate makes that
  // degrade to "don't persist" rather than "overwrite good state with empty".
  try {
    await bounded(Promise.all([initAdRevenue(), hydrateAdRevenueConfig()]), 2000, undefined, 'ad_revenue_state');
  } catch {}
  if (isFirstRun()) {
    // Fresh install: there is no cached config, so `manualAdImpression` is
    // whatever was baked into the binary. If the AdMob link state has changed
    // since this build shipped, every impression until the first fetch lands is
    // double- or zero-counted. Wait briefly — no ad can serve this fast anyway
    // — then proceed regardless.
    await bounded(refreshAdRevenueConfig(), 3000, undefined, 'ad_config');
  } else {
    void refreshAdRevenueConfig().catch(() => {});
  }
  try {
    // UMP consent. Two orders, on purpose:
    //  • ANDROID (ad-request spec v1.0): UMP runs IN PARALLEL with SDK init and
    //    never blocks any request. A request that goes out before the TCF
    //    signal lands simply serves non-personalized; once the form is done the
    //    SDK carries the signal automatically. Owner-confirmed trade-off.
    //  • iOS (untouched until its own unit set arrives): serial, bounded —
    //    consent gathered before the SDK reads the IDFA, as before.
    if (AdsConsentObj) {
      const umpFlow = async () => {
        try {
          // Bounded: a UMP call that never settles must strand nothing.
          await bounded(AdsConsentObj.requestInfoUpdate(), CONSENT_TIMEOUT_MS, null, 'ump_info');
          await bounded(AdsConsentObj.loadAndShowConsentFormIfRequired(), CONSENT_TIMEOUT_MS, null, 'ump_form');
        } catch { /* consent failure → SDK serves per-region defaults */ }
      };
      if (Platform.OS === 'android') void umpFlow();
      else await umpFlow();
    }
    // iOS App Tracking Transparency — prompt for tracking BEFORE the GMA SDK
    // reads the IDFA. On "granted" AdMob serves personalized ads + the real
    // IDFA; on denied/restricted it serves non-personalized (the app still works
    // fully). REQUIRED by Apple because App Privacy declares tracking (IDFA).
    // Runs after UMP so EEA users see the GDPR form then the ATT prompt. No-op on
    // Android. Awaited so the SDK inits with the resolved authorization status.
    // ATT was already fired at app root (App.tsx → ensureAttRequested). Await the
    // SAME one-shot so the GMA SDK initializes AFTER the user's tracking choice
    // is resolved — on "authorized" it reads the real IDFA and serves
    // personalized; otherwise non-personalized. Bounded so a prompt the user
    // never answers (app backgrounded mid-prompt) can't strand ad init.
    if (Platform.OS === 'ios') {
      try { await bounded(ensureAttRequested(), ATT_TIMEOUT_MS, 'unknown', 'att'); }
      catch { /* never block ads/app on ATT */ }
    }

    // The mediation-adapter hazard lives here — see the note on INIT_TIMEOUT_MS.
    // `statuses` is one entry per adapter the SDK found and tried to bring up.
    const statuses = await bounded(mobileAdsFn().initialize(), INIT_TIMEOUT_MS, null, 'gma_init');
    initialized = true;   // proceed even on timeout — see the note above

    // Per-adapter readiness, straight to Firebase. This is how you verify a
    // mediation config WITHOUT a device: an adapter that's in the binary but has
    // no AdMob mediation group yet reports NOT_READY here, and once you finish
    // configuring it in the console it flips to ok on the next launch. Also the
    // first thing to look at if a network mysteriously never gets fill.
    if (statuses) {
      const { ready, total, detail } = summarizeAdapterStatuses(statuses);
      logEvent('ads_adapters', { ready, total, detail });
    }
    // ── ANDROID: the ad-request-spec engine, ALL regions, dev builds included
    // (owner decision 2026-08-05: live units only — the ladders have no TestIds
    // equivalents; register debug devices as AdMob test devices instead). It
    // owns the newbie unit too, so the legacy per-platform preloads below are
    // iOS-only now. The engine logs its own ads_route.
    if (Platform.OS === 'android' && InterstitialAdCls) {
      await bounded(hydrateAdValueStore(), 2000, undefined, 'ad_value_store');
      void startAdEngine({ Interstitial: InterstitialAdCls, AdEventType: AdEventTypeEnum, isAdsRemoved: () => adsRemoved });
      return;
    }

    // ── iOS (untouched until its own unit set arrives): US → the 26-unit
    // waterfall controller (LIVE units, hence !__DEV__ — verify via TestFlight
    // or an AdMob test device); everyone else → the single-unit preload. The
    // onboarding unit loads first, in parallel, as its own request.
    preloadOnboarding();
    const region = deviceRegion();
    const useController = region === 'US' && Platform.OS === 'ios' && !!InterstitialAdCls && !__DEV__;
    logEvent('ads_route', { region: region ?? 'unknown', path: useController ? 'us_controller' : 'preload' });
    if (useController) {
      startUsController({ Interstitial: InterstitialAdCls, AdEventType: AdEventTypeEnum, isAdsRemoved: () => adsRemoved });
    } else {
      preload();
    }
  } catch { /* never crash on ads init */ }
}

/**
 * Attach the impression-level-revenue listener to an ad object.
 *
 * Attached at CREATE time and never removed: the docs are explicit that a
 * listener added later can miss the callback, and some mediation adapters
 * deliver PAID *after* the ad is dismissed — a listener torn down on close
 * would silently drop that revenue. Never throws.
 */
function attachPaidListener(ad: any, adUnitName: string): void {
  try {
    if (!ad || !AdEventTypeEnum?.PAID) return;
    let paidSeen = false;
    ad.addAdEventListener(AdEventTypeEnum.PAID, (e: any) => {
      if (paidSeen) return;                    // one impression = one accrual
      paidSeen = true;
      onAdPaid({
        value: e?.value,
        currency: e?.currency,
        precision: e?.precision,
        format: 'interstitial',
        adUnitName,
      });
    });
  } catch { /* older client without PAID → no revenue data, but ads still run */ }
}

function preload(): void {
  if (!InterstitialAdCls || adsRemoved) return;
  try {
    // No manual requestNonPersonalizedAdsOnly: with UMP integrated (initAds
    // gathers consent first), the SDK reads the user's consent (IAB TCF string)
    // and automatically serves personalized vs non-personalized per their choice
    // and region — forcing non-personalized here would needlessly drop revenue
    // for users who DID consent.
    interstitial = InterstitialAdCls.createForAdRequest(INTERSTITIAL_UNIT_ID, {});
    loaded = false;
    interstitial.addAdEventListener(AdEventTypeEnum.LOADED, () => { loaded = true; });
    // When the user closes the ad, immediately preload the next one.
    interstitial.addAdEventListener(AdEventTypeEnum.CLOSED, () => { loaded = false; setInterstitialVisible(false); preload(); });
    interstitial.addAdEventListener(AdEventTypeEnum.ERROR, () => { loaded = false; setInterstitialVisible(false); });
    // Impression-level ad revenue — the worldwide path (every non-US user and
    // all of iOS), which until now captured NO revenue at all.
    //
    // Subscribed LAST and in its own try/catch on purpose: the library THROWS
    // on an unknown event type, so on a dev client built before PAID existed
    // `AdEventTypeEnum.PAID` is undefined and this call blows up. Higher in the
    // function that would have skipped LOADED/CLOSED/ERROR and load() itself —
    // turning "no revenue data" into "no ads at all". Analytics must never be
    // able to take the ad stack down with it.
    attachPaidListener(interstitial, 'ww_interstitial');
    interstitial.load();
  } catch { /* swallow — maybeShow will just no-op until one loads */ }
}

function preloadOnboarding(): void {
  if (!InterstitialAdCls || adsRemoved || onboardingShown) return;
  try {
    onboardingInterstitial = InterstitialAdCls.createForAdRequest(ONBOARDING_INTERSTITIAL_UNIT_ID, {});
    onboardingLoaded = false;
    onboardingInterstitial.addAdEventListener(AdEventTypeEnum.LOADED, () => { onboardingLoaded = true; });
    onboardingInterstitial.addAdEventListener(AdEventTypeEnum.CLOSED, () => { onboardingLoaded = false; setInterstitialVisible(false); });
    onboardingInterstitial.addAdEventListener(AdEventTypeEnum.ERROR, () => {
      onboardingLoaded = false;
      // Fresh units no-fill often; a few spaced retries raise the odds it's
      // ready before onboarding ends. Latches off for good once shown.
      if (onboardingRetries < 3 && !onboardingShown) {
        onboardingRetries += 1;
        setTimeout(() => { if (!onboardingShown) preloadOnboarding(); }, 8000);
      }
    });
    // First-open impression — the single highest-value one for LTV modelling,
    // since it is the only ad a same-day churner ever sees. Subscribed last;
    // see the note in preload().
    attachPaidListener(onboardingInterstitial, 'onboarding_first');
    onboardingInterstitial.load();
  } catch { /* attempts simply no-op */ }
}

// Show the dedicated first-open interstitial ONCE. Returns true if it showed.
// Callers (the onboarding flow) attempt right after the welcome screen and
// then on each later step transition until it succeeds — it can never fire
// twice (onboardingShown latches) and never fires after onboarding because
// the flow stops calling. Bypasses the interval cap (nothing can have shown
// before it on a first open) but SETS lastShownAt so the next regular
// interstitial keeps its distance.
export function maybeShowOnboardingInterstitial(): boolean {
  if (adsRemoved || !initialized || onboardingShown) return false;
  // ANDROID: the engine owns the newbie unit now. This shows the best cached ad
  // (usually the newbie fill on a first open), bypassing the interval floor — nothing
  // can have shown before it — while still starting the interval clock. The
  // once-per-onboarding latch stays HERE: the unit itself is reusable under the
  // new spec, but the onboarding flow still only interrupts once.
  if (isAdEngineActive()) {
    if (!engineOnShowOpportunity('onboarding_first', true)) return false;
    onboardingShown = true;
    lastShownAt = Date.now();
    noteInterstitialShown();
    return true;
  }
  if (!onboardingInterstitial || !onboardingLoaded) return false;
  if (AppState.currentState !== 'active') return false;
  try {
    onboardingInterstitial.show();
    setInterstitialVisible(true);
    onboardingShown = true;
    lastShownAt = Date.now();
    noteInterstitialShown();
    logEvent('ad_impression_custom', { format: 'interstitial', placement: 'onboarding_first' });
    return true;
  } catch { return false; }
}

// Show an interstitial at a natural break (e.g. after Amen, after finishing a
// plan day). Respects the remove-ads flag and the frequency cap, and silently
// no-ops if no ad is loaded yet (a fresh one is always preloading for next time).
export function maybeShowInterstitial(placement: AdPlacement = 'unknown'): void {
  if (adsRemoved || !initialized) return;
  // ANDROID: the spec engine (own cache, shared interval floor, paid-side impression
  // logging). Returns silently if nothing is cached yet.
  if (isAdEngineActive()) { engineOnShowOpportunity(placement); return; }
  // iOS US: the waterfall controller (own cache, frequency cap,
  // impression-level logging). It returns silently if nothing is cached yet.
  if (isUsControllerActive()) { usOnShowOpportunity(placement); return; }
  // Non-US simple path: show the single preloaded interstitial.
  if (!interstitial || !loaded) return;
  if (AppState.currentState !== 'active') return;   // never show off-foreground
  const now = Date.now();
  if (now - lastShownAt < MIN_INTERVAL_MS) return;
  try {
    interstitial.show();
    setInterstitialVisible(true);
    lastShownAt = now;
    noteInterstitialShown();
    // NOT `ad_impression` — that's a Firebase auto-collected reserved event
    // (AdMob link). `placement` distinguishes the two call sites.
    logEvent('ad_impression_custom', { format: 'interstitial', placement });
  } catch { /* if show fails, the CLOSED/ERROR handlers will reload */ }
}
