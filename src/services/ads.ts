// AdMob interstitial ads via react-native-google-mobile-ads.
//
// Currently wired with GOOGLE TEST AD UNIT IDs so we can verify the integration
// without risking the AdMob account (never serve / click your own LIVE ads in a
// debug build — it gets the account flagged). Before the production launch,
// replace INTERSTITIAL_UNIT_ID below with your real ad unit ID, and swap the
// test App ID in app.json (plugin "react-native-google-mobile-ads").
//
// The native module is loaded with a guarded require (not a static import) so a
// dev client built BEFORE the module was added doesn't crash at import time —
// the same defensive pattern used in services/firebase.ts. On such a build all
// functions below become silent no-ops.

import AsyncStorage from '@react-native-async-storage/async-storage';

let mobileAdsFn: any = null;
let InterstitialAdCls: any = null;
let AdEventTypeEnum: any = null;
let TestIdsObj: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ads = require('react-native-google-mobile-ads');
  mobileAdsFn = ads.default;
  InterstitialAdCls = ads.InterstitialAd;
  AdEventTypeEnum = ads.AdEventType;
  TestIdsObj = ads.TestIds;
} catch {
  /* native module not in this build → no-op everywhere below */
}

// TEST interstitial unit. TODO(prod): replace with the real AdMob interstitial
// ad unit ID (ca-app-pub-<account>/<unit>) before launch.
const INTERSTITIAL_UNIT_ID: string =
  TestIdsObj?.INTERSTITIAL ?? 'ca-app-pub-3940256099942544/1033173712';

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
    await mobileAdsFn().initialize();
    initialized = true;
    preload();
  } catch { /* never crash on ads init */ }
}

function preload(): void {
  if (!InterstitialAdCls || adsRemoved) return;
  try {
    interstitial = InterstitialAdCls.createForAdRequest(INTERSTITIAL_UNIT_ID, {
      // Non-personalized keeps us clear of consent requirements for the first
      // launch; switch to personalized once a UMP consent flow is added.
      requestNonPersonalizedAdsOnly: true,
    });
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
  } catch { /* if show fails, the CLOSED/ERROR handlers will reload */ }
}
