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

import { Platform, NativeModules, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent, setUserProps } from './firebase';
import { startUsController, stopUsController, usOnShowOpportunity, isUsControllerActive } from './usInterstitial';

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

// App Tracking Transparency (iOS only). Guarded require so a build made before
// the module was added doesn't crash at import; Android has no ATT so this stays
// null and the call below is skipped.
let requestTrackingPermissions: null | (() => Promise<{ status: string }>) = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  requestTrackingPermissions = require('expo-tracking-transparency').requestTrackingPermissionsAsync;
} catch {
  /* module not in this build */
}

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
const MIN_INTERVAL_MS = 60 * 1000;

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

export async function setAdsRemoved(value: boolean): Promise<void> {
  adsRemoved = value;
  setUserProps({ ads_removed: value ? 'on' : 'off' });   // payer cohort for BigQuery
  // Tear the US waterfall down on purchase so its ticker + cached/in-flight ads
  // stop immediately (not just no-op behind the flag).
  if (value) { try { stopUsController(); } catch {} }
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
const REGION_RE = /[_-]([A-Za-z]{2})(?:[_@.-]|$)/;

// US IANA timezones (Hermes Intl gives the real device tz on both platforms).
// Third-level fallback for devices whose locale carries no region (bare "en").
const US_TZ_RE = /^(America\/(New_York|Detroit|Kentucky\/|Indiana\/|Chicago|Menominee|North_Dakota\/|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak)|Pacific\/Honolulu)/;

function deviceRegion(): string | null {
  // 1) Hermes Intl — the only source that works reliably under the NEW
  //    ARCHITECTURE (bridgeless): NativeModules.SettingsManager is undefined on
  //    iOS and I18nManager.localeIdentifier is unreliable on Android there,
  //    which silently routed every user away from the US controller.
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;   // e.g. "en-US"
    const m = String(loc || '').match(REGION_RE);
    if (m) return m[1].toUpperCase();
  } catch { /* fall through */ }
  // 2) Legacy NativeModules constants (old architecture builds).
  try {
    const { SettingsManager, I18nManager } = NativeModules as any;
    let loc: string | undefined;
    if (Platform.OS === 'ios') {
      loc = SettingsManager?.settings?.AppleLocale
        || (Array.isArray(SettingsManager?.settings?.AppleLanguages) ? SettingsManager.settings.AppleLanguages[0] : undefined);
    } else {
      loc = I18nManager?.localeIdentifier;
    }
    const m = loc ? String(loc).match(REGION_RE) : null;
    if (m) return m[1].toUpperCase();
  } catch { /* fall through */ }
  // 3) Timezone heuristic for region-less locales (bare "en" is common on US
  //    Android devices) — a US tz is a good-enough proxy for the US rollout.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && US_TZ_RE.test(tz)) return 'US';
  } catch { /* fall through */ }
  return null;
}

export function isUsUser(): boolean {
  return deviceRegion() === 'US';
}

// Initialize the SDK once at app launch and preload the first interstitial.
export async function initAds(): Promise<void> {
  if (initialized || !mobileAdsFn) return;
  try {
    const stored = await AsyncStorage.getItem(REMOVE_ADS_KEY);
    adsRemoved = stored === '1';
  } catch { /* default: ads on */ }
  if (adsRemoved) { initialized = true; return; }
  try {
    // UMP consent — MUST run BEFORE initializing the ads SDK. Fetches the latest
    // consent info and, where the user's region (EEA / UK / Switzerland / etc.)
    // requires it AND a consent message is configured in the AdMob console
    // (Privacy & messaging), shows the consent form. Errors here must never
    // block ads or the app, so each call is guarded.
    if (AdsConsentObj) {
      try {
        // Bounded: a UMP call that never settles would strand the whole init
        // chain below it. Falling through just means the SDK serves per-region
        // defaults — degraded, not broken.
        await bounded(AdsConsentObj.requestInfoUpdate(), CONSENT_TIMEOUT_MS, null, 'ump_info');
        await bounded(AdsConsentObj.loadAndShowConsentFormIfRequired(), CONSENT_TIMEOUT_MS, null, 'ump_form');
      } catch { /* consent failure → fall through; SDK serves per region defaults */ }
    }
    // iOS App Tracking Transparency — prompt for tracking BEFORE the GMA SDK
    // reads the IDFA. On "granted" AdMob serves personalized ads + the real
    // IDFA; on denied/restricted it serves non-personalized (the app still works
    // fully). REQUIRED by Apple because App Privacy declares tracking (IDFA).
    // Runs after UMP so EEA users see the GDPR form then the ATT prompt. No-op on
    // Android. Awaited so the SDK inits with the resolved authorization status.
    if (Platform.OS === 'ios' && requestTrackingPermissions) {
      // Generous bound — this one legitimately waits on a human tapping the OS
      // prompt. It's here only for the case where the prompt never resolves
      // (app backgrounded mid-prompt), which would otherwise strand ads forever.
      try {
        await bounded(requestTrackingPermissions(), ATT_TIMEOUT_MS, { status: 'unknown' }, 'att');
      } catch { /* never block ads/app on ATT */ }
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
    // US users (iOS OR Android) → the 26-unit waterfall controller. The ladder
    // is platform-selected INSIDE usInterstitial (HB_int_splash_* on Android,
    // HB_ios_splash_* on iOS), so each binary requests only its own units — the
    // same JS ships in both. Everyone else (non-US, or region-undetectable) takes
    // the simple single-unit preload (REAL_INTERSTITIAL_UNIT_ID, also per-platform).
    // NOT in __DEV__: the ladder ids are LIVE units with no TestIds equivalent —
    // same account-safety policy as INTERSTITIAL_UNIT_ID above. Verify the
    // controller with a release build (internal/TestFlight) or by registering
    // the device as an AdMob test device.
    // Onboarding unit loads FIRST and in parallel with whichever route below —
    // an extra independent request, so the first-open ad is ready as early as
    // the SDK allows (the biggest fill-speed lever available: consent + ATT +
    // initialize() are policy-ordered and can't be skipped or reordered).
    preloadOnboarding();
    const region = deviceRegion();
    const useController = region === 'US' && (Platform.OS === 'ios' || Platform.OS === 'android') && !!InterstitialAdCls && !__DEV__;
    logEvent('ads_route', { region: region ?? 'unknown', path: useController ? 'us_controller' : 'preload' });
    if (useController) {
      startUsController({ Interstitial: InterstitialAdCls, AdEventType: AdEventTypeEnum, isAdsRemoved: () => adsRemoved });
    } else {
      preload();
    }
  } catch { /* never crash on ads init */ }
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
    interstitial.addAdEventListener(AdEventTypeEnum.CLOSED, () => { loaded = false; preload(); });
    interstitial.addAdEventListener(AdEventTypeEnum.ERROR, () => { loaded = false; });
    interstitial.load();
  } catch { /* swallow — maybeShow will just no-op until one loads */ }
}

function preloadOnboarding(): void {
  if (!InterstitialAdCls || adsRemoved || onboardingShown) return;
  try {
    onboardingInterstitial = InterstitialAdCls.createForAdRequest(ONBOARDING_INTERSTITIAL_UNIT_ID, {});
    onboardingLoaded = false;
    onboardingInterstitial.addAdEventListener(AdEventTypeEnum.LOADED, () => { onboardingLoaded = true; });
    onboardingInterstitial.addAdEventListener(AdEventTypeEnum.CLOSED, () => { onboardingLoaded = false; });
    onboardingInterstitial.addAdEventListener(AdEventTypeEnum.ERROR, () => {
      onboardingLoaded = false;
      // Fresh units no-fill often; a few spaced retries raise the odds it's
      // ready before onboarding ends. Latches off for good once shown.
      if (onboardingRetries < 3 && !onboardingShown) {
        onboardingRetries += 1;
        setTimeout(() => { if (!onboardingShown) preloadOnboarding(); }, 8000);
      }
    });
    onboardingInterstitial.load();
  } catch { /* attempts simply no-op */ }
}

// Show the dedicated first-open interstitial ONCE. Returns true if it showed.
// Callers (the onboarding flow) attempt right after the welcome screen and
// then on each later step transition until it succeeds — it can never fire
// twice (onboardingShown latches) and never fires after onboarding because
// the flow stops calling. Bypasses the 60s cap (nothing can have shown
// before it on a first open) but SETS lastShownAt so the next regular
// interstitial keeps its distance.
export function maybeShowOnboardingInterstitial(): boolean {
  if (adsRemoved || !initialized || onboardingShown) return false;
  if (!onboardingInterstitial || !onboardingLoaded) return false;
  if (AppState.currentState !== 'active') return false;
  try {
    onboardingInterstitial.show();
    onboardingShown = true;
    lastShownAt = Date.now();
    logEvent('ad_impression_custom', { format: 'interstitial', placement: 'onboarding_first' });
    return true;
  } catch { return false; }
}

// Show an interstitial at a natural break (e.g. after Amen, after finishing a
// plan day). Respects the remove-ads flag and the frequency cap, and silently
// no-ops if no ad is loaded yet (a fresh one is always preloading for next time).
export function maybeShowInterstitial(placement: 'prayer_end' | 'gospel_end' | 'plan_end' | 'nav' | 'app_open' | 'unknown' = 'unknown'): void {
  if (adsRemoved || !initialized) return;
  // US users go through the waterfall controller (own cache, frequency cap,
  // impression-level logging). It returns silently if nothing is cached yet.
  if (isUsControllerActive()) { usOnShowOpportunity(placement); return; }
  // Non-US simple path: show the single preloaded interstitial.
  if (!interstitial || !loaded) return;
  if (AppState.currentState !== 'active') return;   // never show off-foreground
  const now = Date.now();
  if (now - lastShownAt < MIN_INTERVAL_MS) return;
  try {
    interstitial.show();
    lastShownAt = now;
    // NOT `ad_impression` — that's a Firebase auto-collected reserved event
    // (AdMob link). `placement` distinguishes the two call sites.
    logEvent('ad_impression_custom', { format: 'interstitial', placement });
  } catch { /* if show fails, the CLOSED/ERROR handlers will reload */ }
}
