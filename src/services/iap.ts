// In-app purchases via expo-iap (OpenIAP: StoreKit 2 + Play Billing 8).
//
// Entitlement model: ONE entitlement ("ad-free") granted by any of three
// products — a non-consumable lifetime unlock or two auto-renewing
// subscriptions. On purchase/restore we flip services/ads.setAdsRemoved(true),
// which persists the flag and tears the US waterfall down immediately.
//
// No backend: we trust the store client (StoreKit 2 already returns verified
// JWS transactions; Play purchases are acknowledged via finishTransaction).
// If server-side receipt validation lands later, hook it in handlePurchase().
//
// The native module is loaded with a guarded require (same pattern as
// services/ads.ts / services/firebase.ts) so a dev client built BEFORE
// expo-iap was added degrades to silent no-ops instead of crashing at import.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from './firebase';
import { setAdsRemoved, areAdsRemoved, adsGrantGeneration } from './ads';

let iap: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  iap = require('expo-iap');
} catch {
  /* native module not in this build → no-op everywhere below */
}

export type PlanId = 'lifetime' | 'annual' | 'monthly';

// ⚠️ PLACEHOLDER product IDs — must match the products created in
// Play Console (Monetize → Products) and App Store Connect (In-App Purchases
// / Subscriptions). Keep the SAME ids on both stores so this map stays flat.
// See docs/iap-store-setup.md for the exact backend setup steps.
export const IAP_SKUS: Record<PlanId, string> = {
  lifetime: 'herbible_remove_ads_lifetime',   // non-consumable in-app product
  annual:   'herbible_premium_annual',        // auto-renewing subscription (P1Y)
  monthly:  'herbible_premium_monthly',       // auto-renewing subscription (P1M)
};
const SUB_SKUS = [IAP_SKUS.annual, IAP_SKUS.monthly];
const INAPP_SKUS = [IAP_SKUS.lifetime];
const ALL_SKUS = new Set<string>(Object.values(IAP_SKUS));

export type PurchaseOutcome = 'purchased' | 'pending' | 'cancelled' | 'error' | 'unavailable';

let connected = false;
let unsubUpdate: (() => void) | null = null;
let unsubError: (() => void) | null = null;
// Store products by sku after fetch — needed for Android subscription offer
// tokens at purchase time and for localized display prices in the paywall.
const productsBySku = new Map<string, any>();
// One-shot resolver bridging the global purchase listeners back to the
// requestPurchase() call site (OpenIAP delivers results via events).
let resolvePending: ((r: PurchaseOutcome) => void) | null = null;

// Ceiling on a single purchase attempt. Generous — the user may be typing a
// password, doing SCA, or reading the Play sheet — but finite, because the
// alternative is a permanently dead Subscribe button.
const PURCHASE_TIMEOUT_MS = 120_000;

function settle(outcome: PurchaseOutcome) {
  const r = resolvePending;
  resolvePending = null;
  r?.(outcome);
}

// NOTE: every path out of this function must reach settle(), or the promise
// returned by purchasePlan() never resolves — and its callers do
// `try { await purchasePlan() } finally { setBusy(false) }`, so a pending
// promise leaves the Subscribe button disabled FOREVER (both paywalls guard on
// `if (busy) return`). The store can hand us states we don't handle
// ('deferred', 'restored', 'unspecified'), so the fall-through settles too.
async function handlePurchase(purchase: any): Promise<void> {
  if (!purchase || !ALL_SKUS.has(purchase.productId)) { settle('error'); return; }
  if (purchase.purchaseState === 'purchased') {
    // Acknowledge/finish FIRST (Android refunds unacknowledged purchases
    // after ~3 days), then grant the entitlement.
    try { await iap.finishTransaction({ purchase, isConsumable: false }); } catch {}
    await setAdsRemoved(true);
    await rememberGrantSku(purchase.productId);
    logEvent('iap_purchase', { product_id: purchase.productId });
    settle('purchased');
  } else if (purchase.purchaseState === 'pending') {
    // e.g. Play cash / pending card auth — entitlement arrives via this same
    // listener on a later app start once the store finalizes it.
    logEvent('iap_pending', { product_id: purchase.productId });
    settle('pending');
  } else {
    // 'deferred' (iOS Ask-to-Buy), 'restored', 'unspecified', anything future.
    // The entitlement, if it ever lands, arrives via this same listener on a
    // later launch; what matters here is that the caller is released.
    logEvent('iap_unhandled_state', { product_id: purchase.productId, state: String(purchase.purchaseState ?? 'unknown') });
    settle('error');
  }
}

// Connect once at app launch (cheap; also drains any purchases completed
// while the app was dead — pending Play purchases, iOS Ask-to-Buy, etc.).
export async function initIap(): Promise<void> {
  if (connected || !iap?.initConnection) return;
  try {
    await iap.initConnection();
    connected = true;
    unsubUpdate?.();
    unsubError?.();
    unsubUpdate = iap.purchaseUpdatedListener((p: any) => { handlePurchase(p); });
    unsubError = iap.purchaseErrorListener((e: any) => {
      const cancelled = e?.code === 'user-cancelled' || e?.code === iap?.ErrorCode?.UserCancelled;
      if (!cancelled) logEvent('iap_error', { code: String(e?.code ?? 'unknown') });
      settle(cancelled ? 'cancelled' : 'error');
    });
    // Re-grant on launch: safety net if AsyncStorage was cleared but the
    // store account still owns the entitlement. Never blocks startup.
    void restorePurchases().catch(() => {});
  } catch {
    connected = false;
  }
}

export function endIap(): void {
  try { unsubUpdate?.(); unsubError?.(); iap?.endConnection?.(); } catch {}
  unsubUpdate = null; unsubError = null; connected = false;
}

export function isIapAvailable(): boolean {
  return connected;
}

// Localized store prices keyed by PlanId (e.g. { lifetime: 'NT$670', … }).
// Empty map when the store is unreachable — the paywall falls back to its
// static display strings.
export async function fetchPrices(): Promise<Partial<Record<PlanId, string>>> {
  const out: Partial<Record<PlanId, string>> = {};
  if (!connected || !iap?.fetchProducts) return out;
  try {
    const [inapp, subs] = await Promise.all([
      iap.fetchProducts({ skus: INAPP_SKUS, type: 'in-app' }),
      iap.fetchProducts({ skus: SUB_SKUS, type: 'subs' }),
    ]);
    for (const p of [...(inapp ?? []), ...(subs ?? [])]) {
      productsBySku.set(p.id, p);
      const plan = (Object.keys(IAP_SKUS) as PlanId[]).find(k => IAP_SKUS[k] === p.id);
      if (plan && p.displayPrice) out[plan] = p.displayPrice;
    }
  } catch { /* store unreachable → static fallback prices */ }
  return out;
}

// Launch the platform purchase sheet and resolve when the store answers.
export async function purchasePlan(plan: PlanId): Promise<PurchaseOutcome> {
  if (!connected || !iap?.requestPurchase) return 'unavailable';
  const sku = IAP_SKUS[plan];
  const isSub = plan !== 'lifetime';
  // Android subscriptions need the offer token from the fetched product.
  let subscriptionOffers: Array<{ sku: string; offerToken: string }> = [];
  if (isSub) {
    const prod = productsBySku.get(sku);
    subscriptionOffers = (prod?.subscriptionOffers ?? [])
      .filter((o: any) => o.offerTokenAndroid)
      .map((o: any) => ({ sku, offerToken: o.offerTokenAndroid }));
  }
  return new Promise<PurchaseOutcome>((resolve) => {
    resolvePending = resolve;
    // Nothing can be allowed to leave this pending. The outcome normally arrives
    // via the global purchase listeners, but requestPurchase is itself a promise
    // (so a synchronous try/catch cannot see an async rejection), and a store
    // sheet can be dismissed in ways that emit no event at all. The cap releases
    // the caller so the Subscribe button comes back to life; a purchase that
    // lands later is still granted by the listener on this or a future launch.
    const cap = setTimeout(() => {
      if (!resolvePending) return;
      logEvent('iap_timeout', { product_id: sku });
      settle('error');
    }, PURCHASE_TIMEOUT_MS);
    const done = (o: PurchaseOutcome) => { clearTimeout(cap); resolve(o); };
    resolvePending = done;
    try {
      // .catch() as well as try/catch: this returns a promise, and an async
      // rejection would otherwise be unhandled and strand the caller.
      Promise.resolve(iap.requestPurchase({
        request: isSub
          ? { apple: { sku }, google: { skus: [sku], subscriptionOffers } }
          : { apple: { sku }, google: { skus: [sku] } },
        type: isSub ? 'subs' : 'in-app',
      })).catch(() => settle('error'));
    } catch {
      settle('error');
    }
  });
}

// Restore: true if any owned product grants the entitlement.
//
// Also the place a LAPSED entitlement is revoked. This used to only ever grant
// (setAdsRemoved(true)) and never revoke, so a monthly subscriber who cancelled
// kept ad-free access forever — the persisted flag was never cleared.
//
// Revoking is deliberately CONSERVATIVE: it happens only when BOTH store
// queries completed WITHOUT throwing and both reported nothing owned. A failed
// / offline / unavailable store leaves the entitlement exactly as it was —
// showing ads to someone who is actually paying is far worse than a lapsed user
// getting a few more ad-free launches, and the next successful check corrects it.
export async function restorePurchases(): Promise<boolean> {
  if (!connected) return false;
  const gen = adsGrantGeneration();          // captured BEFORE any await
  let owned = false;
  let purchasesOk = false;
  let subsOk = false;
  try {
    const purchases: any[] = (await iap.getAvailablePurchases?.()) ?? [];
    purchasesOk = true;
    owned = purchases.some(p => ALL_SKUS.has(p.productId) && p.purchaseState !== 'unknown');
  } catch { /* leave purchasesOk false → no revoke */ }
  if (!owned) {
    try {
      owned = !!(await iap.hasActiveSubscriptions?.(SUB_SKUS));
      subsOk = true;
    } catch { /* leave subsOk false → no revoke */ }
  }
  if (owned) {
    await setAdsRemoved(true);
    logEvent('iap_restore', {});
    return true;
  }
  // ── Nothing owned. Revoking is the ONE operation here that can hurt a paying
  // user, so it needs three more guards beyond "both queries succeeded":
  //
  //  • LIFETIME IS NEVER REVOKED. getAvailablePurchases maps to StoreKit
  //    currentEntitlements, which resolves [] (it does NOT throw) when the
  //    device isn't signed in to the store or entitlements haven't synced yet —
  //    so an empty result is not proof a non-consumable was refunded. A
  //    subscription genuinely lapses; a lifetime unlock does not.
  //  • NO GRANT MAY HAVE RACED US. These queries are awaited, and initIap fires
  //    this fire-and-forget at launch — a purchase completing mid-flight would
  //    otherwise be undone by the stale result resuming afterwards.
  //  • We must currently believe she's entitled, so this is a no-op otherwise.
  if (!(purchasesOk && subsOk && areAdsRemoved())) return false;
  if (await grantedByLifetime()) return false;
  if (adsGrantGeneration() !== gen) return false;
  await setAdsRemoved(false);
  logEvent('iap_entitlement_lapsed', {});
  return false;
}

const GRANT_SKU_KEY = 'iap:grantSku:v1';
async function rememberGrantSku(productId: string): Promise<void> {
  try { await AsyncStorage.setItem(GRANT_SKU_KEY, productId); } catch {}
}
async function grantedByLifetime(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(GRANT_SKU_KEY)) === IAP_SKUS.lifetime; } catch { return true; }
}
