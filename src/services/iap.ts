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

import { logEvent } from './firebase';
import { setAdsRemoved } from './ads';

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

function settle(outcome: PurchaseOutcome) {
  const r = resolvePending;
  resolvePending = null;
  r?.(outcome);
}

async function handlePurchase(purchase: any): Promise<void> {
  if (!purchase || !ALL_SKUS.has(purchase.productId)) return;
  if (purchase.purchaseState === 'purchased') {
    // Acknowledge/finish FIRST (Android refunds unacknowledged purchases
    // after ~3 days), then grant the entitlement.
    try { await iap.finishTransaction({ purchase, isConsumable: false }); } catch {}
    await setAdsRemoved(true);
    logEvent('iap_purchase', { product_id: purchase.productId });
    settle('purchased');
  } else if (purchase.purchaseState === 'pending') {
    // e.g. Play cash / pending card auth — entitlement arrives via this same
    // listener on a later app start once the store finalizes it.
    logEvent('iap_pending', { product_id: purchase.productId });
    settle('pending');
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
    try {
      iap.requestPurchase({
        request: isSub
          ? { apple: { sku }, google: { skus: [sku], subscriptionOffers } }
          : { apple: { sku }, google: { skus: [sku] } },
        type: isSub ? 'subs' : 'in-app',
      });
    } catch {
      settle('error');
    }
  });
}

// Restore: true if any owned product grants the entitlement.
export async function restorePurchases(): Promise<boolean> {
  if (!connected) return false;
  let owned = false;
  try {
    const purchases: any[] = (await iap.getAvailablePurchases?.()) ?? [];
    owned = purchases.some(p => ALL_SKUS.has(p.productId) && p.purchaseState !== 'unknown');
  } catch {}
  if (!owned) {
    try { owned = !!(await iap.hasActiveSubscriptions?.(SUB_SKUS)); } catch {}
  }
  if (owned) {
    await setAdsRemoved(true);
    logEvent('iap_restore', {});
  }
  return owned;
}
