// Fetches + caches the remote ad-revenue config (see constants/adRevenueConfig
// for WHY it is remote and what each field means).
//
// Read path is deliberately synchronous: `currentConfig()` never awaits, so the
// PAID callback — which fires on a hot path during an ad impression and must
// not be delayed or dropped — always has a config in hand. The refresh is a
// separate fire-and-forget call made at startup.
//
// Failure policy: ANY problem (offline, 404, bad JSON, wrong shape) leaves the
// last-known-good config in place, falling back to the baked-in default. There
// is no error path that can make revenue logging stop.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from './firebase';
import {
  AD_CONFIG_CACHE_KEY,
  AD_CONFIG_TTL_MS,
  AD_CONFIG_URL,
  DEFAULT_AD_REVENUE_CONFIG,
  MIN_REVENUE_STEP,
  type AdRevenueConfig,
} from '../constants/adRevenueConfig';

let config: AdRevenueConfig = DEFAULT_AD_REVENUE_CONFIG;
let lastFetchedAt = 0;
let hydrating: Promise<void> | null = null;

/** Never throws, never awaits. Safe to call from an ad callback. */
export function currentConfig(): AdRevenueConfig {
  return config;
}

// Accept only what we understand, and merge field-by-field over the defaults so
// a partial or half-broken payload can never blank out a working knob. A remote
// file is untrusted input: it's edited by hand and served by a CDN.
function sanitize(raw: any): AdRevenueConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  // Merge over the CURRENT config, not the baked-in default: a field that the
  // payload omits or corrupts should keep whatever we last knew to be good.
  const base = config;

  const mai = raw.manualAdImpression;
  const manualAdImpression = {
    ios: typeof mai?.ios === 'boolean' ? mai.ios : base.manualAdImpression.ios,
    android: typeof mai?.android === 'boolean' ? mai.android : base.manualAdImpression.android,
  };

  // Present-and-usable → replace wholesale, so removing a currency from the
  // remote file actually removes it. Additive merging made a key published once
  // permanent, and (because the merged result is what gets cached) permanent on
  // that device. Absent/garbage → keep what we had.
  const stepGiven = raw.totalRevenueStep && typeof raw.totalRevenueStep === 'object' && !Array.isArray(raw.totalRevenueStep);
  const totalRevenueStep: Record<string, number> = stepGiven ? {} : { ...base.totalRevenueStep };
  if (stepGiven) {
    for (const [k, v] of Object.entries(raw.totalRevenueStep)) {
      // Reject rather than clamp. A zero/negative/NaN step is obviously bad,
      // but so is an implausibly tiny one: it would make every impression emit
      // the per-call event cap, for every user, until someone noticed.
      if (typeof v === 'number' && isFinite(v) && v >= MIN_REVENUE_STEP) totalRevenueStep[k] = v;
    }
    // A table that rejected every entry would leave stepForCurrency with no
    // `default` to fall back to; restore the known-good one.
    if (typeof totalRevenueStep.default !== 'number') {
      totalRevenueStep.default = base.totalRevenueStep.default;
    }
  }

  // Unlike the scalars above, a threshold table is all-or-nothing: half a table
  // is not a safer table. If the field is absent or not an object, keep the
  // previous one rather than silently switching every AdLTV tier off.
  let adLtvThresholds: AdRevenueConfig['adLtvThresholds'] = base.adLtvThresholds;
  if (raw.adLtvThresholds && typeof raw.adLtvThresholds === 'object' && !Array.isArray(raw.adLtvThresholds)) {
    adLtvThresholds = {};
    for (const [currency, byCountry] of Object.entries<any>(raw.adLtvThresholds)) {
      if (!byCountry || typeof byCountry !== 'object') continue;
      const rows: Record<string, any> = {};
      for (const [country, set] of Object.entries<any>(byCountry)) {
        if (!set || typeof set !== 'object') continue;
        const clean: Record<string, number | null> = {};
        for (const [tier, value] of Object.entries<any>(set)) {
          // null is meaningful (tier explicitly disabled); anything else must
          // be a positive finite number or it is dropped.
          if (value === null) clean[tier] = null;
          else if (typeof value === 'number' && isFinite(value) && value > 0) clean[tier] = value;
        }
        rows[country] = clean;
      }
      adLtvThresholds[currency] = rows;
    }
  }

  const accountCurrency = /^[A-Z]{3}$/.test(String(raw.accountCurrency ?? '').toUpperCase())
    ? String(raw.accountCurrency).toUpperCase()
    : base.accountCurrency;

  return {
    v: typeof raw.v === 'number' ? raw.v : base.v,
    manualAdImpression,
    accountCurrency,
    totalRevenueStep,
    adLtvThresholds,
  };
}

/** True when we have never successfully read a remote config on this device. */
export function isFirstRun(): boolean {
  return lastFetchedAt === 0;
}

/** Load the cached copy into memory. Call once at startup, before ads init. */
export async function hydrateAdRevenueConfig(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(AD_CONFIG_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const at = Number(parsed?.at) || 0;
      // A network refresh can win the race against this disk read. Applying an
      // older cached copy over a fresher live one would also rewind
      // lastFetchedAt, suppressing the next refresh for a full TTL.
      if (at <= lastFetchedAt && lastFetchedAt > 0) return;
      const clean = sanitize(parsed?.config);
      if (clean) {
        config = clean;
        lastFetchedAt = at;
      }
    } catch { /* keep defaults */ }
  })();
  return hydrating;
}

/**
 * Stale-while-revalidate refresh. Returns immediately if the cache is fresh.
 * Fire-and-forget from the caller — nothing waits on the network.
 */
export async function refreshAdRevenueConfig(force = false): Promise<void> {
  if (!force && Date.now() - lastFetchedAt < AD_CONFIG_TTL_MS) return;
  // Every exit below reports. Without this the failure mode is invisible: the
  // app quietly runs baked-in defaults forever while phase 2's thresholds sit
  // unread on the CDN, and nothing in Firebase says so.
  let reason = 'unknown';
  try {
    // Bounded: a hung request must not keep a timer/promise alive for the
    // whole session (same discipline as the ads init path).
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(AD_CONFIG_URL, { signal: ctrl.signal, cache: 'no-cache' } as any);
    } finally {
      clearTimeout(kill);
    }
    if (!res.ok) { reason = `http_${res.status}`; logEvent('ad_config_fetch', { ok: 0, reason }); return; }
    const clean = sanitize(await res.json());
    if (!clean) { logEvent('ad_config_fetch', { ok: 0, reason: 'bad_shape' }); return; }
    config = clean;
    lastFetchedAt = Date.now();
    logEvent('ad_config_fetch', {
      ok: 1,
      v: clean.v,
      // Cheap way to see from Firebase alone whether phase 2 has actually
      // landed on devices, without waiting for AdLTV volume to show up.
      ltv_currencies: Object.keys(clean.adLtvThresholds).length,
    });
    // Own try: the config is already applied in memory and reported ok above,
    // so a failed cache write must not re-report the same fetch as a failure.
    try {
      await AsyncStorage.setItem(
        AD_CONFIG_CACHE_KEY,
        JSON.stringify({ at: lastFetchedAt, config: clean }),
      );
    } catch { /* memory copy still good; we refetch next launch */ }
  } catch (e: any) {
    // Offline / aborted / unparseable → keep last-known-good, but say so.
    try { logEvent('ad_config_fetch', { ok: 0, reason: String(e?.name || reason) }); } catch {}
  }
}

/** Test seam — exercises the untrusted-input parser directly. */
export function __sanitizeForTest(raw: any): AdRevenueConfig | null {
  return sanitize(raw);
}

/** Test seam. */
export function __setConfigForTest(next: Partial<AdRevenueConfig> | null): void {
  config = next
    ? { ...DEFAULT_AD_REVENUE_CONFIG, ...next }
    : DEFAULT_AD_REVENUE_CONFIG;
  lastFetchedAt = 0;
  hydrating = null;
}
