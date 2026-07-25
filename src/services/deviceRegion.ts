// Device country/region detection, shared by the ad stack.
//
// Extracted from services/ads.ts so services/adRevenue can use the SAME logic:
// the two must agree or a user routed into the US waterfall by the timezone
// fallback would be scored against the `default` LTV thresholds instead of the
// US ones — precisely the cohort the ladder exists to monetise.
//
// Standalone on purpose (no imports beyond react-native) so both ads.ts and
// adRevenue.ts can depend on it without a cycle.

import { Platform, NativeModules } from 'react-native';

const REGION_RE = /[_-]([A-Za-z]{2})(?:[_@.-]|$)/;

// US IANA timezones (Hermes Intl gives the real device tz on both platforms).
// Third-level fallback for devices whose locale carries no region (bare "en").
const US_TZ_RE = /^(America\/(New_York|Detroit|Kentucky\/|Indiana\/|Chicago|Menominee|North_Dakota\/|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak)|Pacific\/Honolulu)/;

export function deviceRegion(): string | null {
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
