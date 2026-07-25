// Shape + baked-in defaults for the remotely-hosted ad-revenue config.
//
// WHY THIS IS REMOTE
// ──────────────────
// Two knobs have to be changeable WITHOUT shipping a new binary:
//
//  1. `manualAdImpression` — whether WE log the reserved `ad_impression` event.
//     The AdMob↔Firebase app link makes the NATIVE GMA SDK emit `ad_impression`
//     straight to Firebase. That happens inside native code: JS never sees it,
//     cannot intercept it, and cannot de-duplicate it. So if the link is ON and
//     we ALSO log `ad_impression`, Firebase receives two identical events and
//     Google Ads counts both — there is no client-side fix. The only correct
//     rule is "exactly one producer at a time", and flipping producers must not
//     require an App Store review cycle (days of double- or zero-counting).
//
//     Current state (verified 2026-07-25 in the AdMob console):
//       Android "Her Bible: KJV Bible for Women" → Linked   ⇒ manual = false
//       iOS     "Her Bible"                      → Not linked ⇒ manual = true
//     Hence the flag is PER-PLATFORM. Change the link in AdMob, flip the value
//     in ad-config.json, push — the app follows within a day.
//
//  2. `adLtvThresholds` — nobody hands you these. Firebase/GA4 does NOT compute
//     or expose AdLTV percentile thresholds through any API. They come from your
//     own data (BigQuery export → per-user daily revenue percentiles by country)
//     or from a Google rep's benchmark table. So we ship EMPTY (phase 1: collect
//     data, AdLTV events stay silent) and fill them in remotely later (phase 2)
//     without a release.
//
// CURRENCY — READ THIS BEFORE TOUCHING THRESHOLDS
// ───────────────────────────────────────────────
// `AdValue.currencyCode` is the AdMob ACCOUNT's reporting currency, not the
// user's local currency. This account reports in **HKD** (Settings → Account →
// Currency, verified 2026-07-25), so `value` arrives in Hong Kong dollars.
// Thresholds quoted in USD are therefore ~7.8× too small — using them unchanged
// would fire Total_Ads_Revenue_001 on nearly every impression and push every
// user past Top10% on day one. That is why every threshold below is keyed by
// CURRENCY first. If the account currency ever changes, add a new key rather
// than editing the old one, so historical data stays interpretable.

export const AD_CONFIG_URL = 'https://everlandapps.com/ad-config.json';

// Refetch at most once a day; serve the cached copy instantly meanwhile.
export const AD_CONFIG_TTL_MS = 24 * 60 * 60 * 1000;
export const AD_CONFIG_CACHE_KEY = 'ad-revenue-config:v1';

/** The four AdLTV tiers, ordered cheapest → richest. Order matters: a single
 *  impression can cross several at once and they must fire low-to-high. */
export const AD_LTV_TIERS = ['top50', 'top30', 'top20', 'top10'] as const;
export type AdLtvTier = typeof AD_LTV_TIERS[number];

/** Firebase event name per tier. Names are fixed by the media-buying spec —
 *  Google Ads selects them by exact string, so never "tidy" these up. */
export const AD_LTV_EVENT_NAME: Record<AdLtvTier, string> = {
  top50: 'AdLTV_OneDay_Top50Percent',
  top30: 'AdLTV_OneDay_Top30Percent',
  top20: 'AdLTV_OneDay_Top20Percent',
  top10: 'AdLTV_OneDay_Top10Percent',
};

export const TOTAL_ADS_REVENUE_EVENT = 'Total_Ads_Revenue_001';
export const AD_IMPRESSION_EVENT = 'ad_impression';

/** null = tier disabled (phase 1). A number = fire when the day's running
 *  total first reaches it, in the currency this table is keyed under. */
export type ThresholdSet = Partial<Record<AdLtvTier, number | null>>;

export interface AdRevenueConfig {
  v: number;
  /** Per-platform: do WE log the reserved `ad_impression` event? */
  manualAdImpression: { ios: boolean; android: boolean };
  /**
   * The AdMob account's reporting currency, used whenever a PAID callback
   * hands us an unusable currency code. It must NOT default to USD: `value`
   * would still be HKD, so Google Ads would read every impression as ~7.8×
   * its real worth. Change this only in lockstep with AdMob → Settings →
   * Account → Currency.
   */
  accountCurrency: string;
  /** Micro-threshold for Total_Ads_Revenue_001, keyed by currency. */
  totalRevenueStep: Record<string, number>;
  /** currency → (ISO-3166 country | 'default') → thresholds. */
  adLtvThresholds: Record<string, Record<string, ThresholdSet>>;
}

/**
 * Smallest step we will accept from the remote file. A step of, say, 1e-9
 * doesn't just make events frequent — it makes EVERY impression emit the
 * per-call cap of events, forever, for every user, until someone notices.
 * Rejecting the value outright is far safer than honouring an obvious typo.
 */
export const MIN_REVENUE_STEP = 0.001;

// Baked-in fallback: used on first launch, offline, or if the fetch/parse ever
// fails. Must be safe on its own — the app has to behave sanely if
// everlandapps.com is unreachable forever.
export const DEFAULT_AD_REVENUE_CONFIG: AdRevenueConfig = {
  v: 1,
  // Mirrors the console state documented above.
  manualAdImpression: { ios: true, android: false },
  accountCurrency: 'HKD',
  // HK$0.078 ≈ US$0.01 at the time of writing. Tune remotely, not here.
  // `default` is on the HKD scale too: an unknown currency code still means
  // HKD-denominated money, so a USD-scaled fallback would fire ~8× too often.
  totalRevenueStep: { HKD: 0.078, USD: 0.01, default: 0.078 },
  // PHASE 1: empty on purpose — no thresholds means no AdLTV events, which is
  // correct while we have no data to derive percentiles from. Do NOT invent
  // numbers here; wrong thresholds are worse than silence because Google Ads
  // will optimise toward a bogus signal.
  adLtvThresholds: {},
};

/** Currency-keyed lookup with a `default` fallback, for step + thresholds. */
export function stepForCurrency(cfg: AdRevenueConfig, currency: string): number {
  const table = cfg.totalRevenueStep || {};
  const v = table[currency] ?? table.default;
  return typeof v === 'number' && isFinite(v) && v >= MIN_REVENUE_STEP
    ? v
    : DEFAULT_AD_REVENUE_CONFIG.totalRevenueStep.default;
}

/** The currency to stamp on an event when the SDK gave us an unusable code. */
export function effectiveCurrency(cfg: AdRevenueConfig, currency: string): string {
  return currency || cfg.accountCurrency || DEFAULT_AD_REVENUE_CONFIG.accountCurrency;
}

/** Country-specific thresholds if present, else the currency's `default` row,
 *  else nothing (tiers stay disabled). */
export function thresholdsFor(
  cfg: AdRevenueConfig,
  currency: string,
  country: string | null,
): ThresholdSet {
  const byCountry = cfg.adLtvThresholds?.[currency];
  if (!byCountry) return {};
  return (country && byCountry[country]) || byCountry.default || {};
}
