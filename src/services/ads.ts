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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from './firebase';

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

// Real interstitial ad unit (user-provided; the first of the planned waterfall).
const REAL_INTERSTITIAL_UNIT_ID = 'ca-app-pub-4656643588243987/3482477831';
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
const MIN_INTERVAL_MS = 90 * 1000;

let adsRemoved = false;
let initialized = false;
let interstitial: any = null;
let loaded = false;
let lastShownAt = 0;

export async function setAdsRemoved(value: boolean): Promise<void> {
  adsRemoved = value;
  try { await AsyncStorage.setItem(REMOVE_ADS_KEY, value ? '1' : '0'); } catch {}
}

export function areAdsRemoved(): boolean {
  return adsRemoved;
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
    preload();
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
export function maybeShowInterstitial(): void {
  if (adsRemoved || !initialized || !interstitial || !loaded) return;
  const now = Date.now();
  if (now - lastShownAt < MIN_INTERVAL_MS) return;
  try {
    interstitial.show();
    lastShownAt = now;
    logEvent('ad_impression', { format: 'interstitial' });
  } catch { /* if show fails, the CLOSED/ERROR handlers will reload */ }
}
