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

// Real interstitial ad units for the simple single-unit path (everyone who is
// NOT routed to the US waterfall controller: non-US Android, all iOS, and any
// device whose region can't be detected). Android uses a DEDICATED unit so its
// global traffic no longer pollutes the US ladder's unit-0 (3482477831) stats
// in the AdMob console. Per-platform — AdMob unit IDs are NOT interchangeable
// across iOS/Android, and each lives under its own platform App ID (see
// app.json react-native-google-mobile-ads androidAppId / iosAppId).
const REAL_INTERSTITIAL_UNIT_ID = Platform.select({
  ios:     'ca-app-pub-4656643588243987/9512513187',
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
        await AdsConsentObj.requestInfoUpdate();
        await AdsConsentObj.loadAndShowConsentFormIfRequired();
      } catch { /* consent failure → fall through; SDK serves per region defaults */ }
    }
    await mobileAdsFn().initialize();
    initialized = true;
    // US ANDROID users → the 26-unit waterfall controller (the HB_int_splash_*
    // ladder ids are Android units; requesting them from iOS would be invalid
    // AND skip the real iOS unit). Everyone else — including iOS US users until
    // an iOS ladder exists — takes the simple single-unit preload.
    // NOT in __DEV__: the ladder ids are LIVE units with no TestIds equivalent —
    // same account-safety policy as INTERSTITIAL_UNIT_ID above. Verify the
    // controller with a release build (internal testing track) or by registering
    // the device as an AdMob test device.
    const region = deviceRegion();
    const useController = region === 'US' && Platform.OS === 'android' && !!InterstitialAdCls && !__DEV__;
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

// Show an interstitial at a natural break (e.g. after Amen, after finishing a
// plan day). Respects the remove-ads flag and the frequency cap, and silently
// no-ops if no ad is loaded yet (a fresh one is always preloading for next time).
export function maybeShowInterstitial(placement: 'prayer_end' | 'plan_end' | 'nav' | 'app_open' | 'unknown' = 'unknown'): void {
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
