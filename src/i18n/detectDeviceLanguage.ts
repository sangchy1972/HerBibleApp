// Device-language detection shared by UILanguageContext (UI chrome default)
// and TranslationsContext (Bible translation default) — the two previously
// carried identical private copies built on NativeModules constants, which are
// DEAD under the new architecture (bridgeless): SettingsManager is undefined
// on iOS and I18nManager.localeIdentifier is unreliable on Android, so every
// release-build user silently defaulted to English/KJV and the onboarding
// language step pre-selected English for everyone. Hermes `Intl` is the
// reliable source there; the legacy constants remain as an old-arch fallback.

import { NativeModules, Platform } from 'react-native';
// expo-localization reads the OS's PREFERRED-LANGUAGES LIST directly (the same
// list Settings shows), which is the only authoritative source. Guarded require
// so a build without the native module still falls through to Intl.
let ExpoLocalization: { getLocales?: () => Array<{ languageTag?: string; languageCode?: string }> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ExpoLocalization = require('expo-localization');
} catch { /* not in this build */ }

export type DetectedLanguage = 'en' | 'zh-Hans' | 'zh-Hant' | 'de' | 'fr' | 'es' | 'pt';

// Map a raw locale tag ("pt-BR", "zh_TW", "zh-Hant-HK", "es") onto the 7
// supported codes; null = unsupported language (caller falls back to English).
function normalize(rawTag: string): DetectedLanguage | null {
  const s = rawTag.toLowerCase().replace(/_/g, '-');
  if (!s) return null;
  if (s.startsWith('zh')) {
    // Traditional script: explicit Hant subtag, or a region that writes it.
    if (s.includes('hant') || s.includes('-tw') || s.includes('-hk') || s.includes('-mo')) return 'zh-Hant';
    return 'zh-Hans';
  }
  const prefix = s.split('-')[0];
  if (prefix === 'en' || prefix === 'de' || prefix === 'fr' || prefix === 'es' || prefix === 'pt') return prefix;
  return null;
}

// Fallback when the device language is one we don't ship. Spanish per the
// owner: it is the largest non-English audience for this app, so an unsupported
// locale lands somewhere useful rather than on English by accident. NOTE this
// only applies when detection finds NO supported language — an English phone
// still gets English, because 'en' is detected and returned above.
const UNSUPPORTED_FALLBACK: DetectedLanguage = 'es';

export function detectDeviceLanguage(): DetectedLanguage {
  // 0) The OS preferred-languages LIST, in order. This is the authoritative
  //    source and the reason detection used to look "wrong": Intl below reports
  //    a single RESOLVED locale, which on Android can be a region/format locale
  //    rather than the language she actually reads in. Walking the real list in
  //    priority order and taking the first SUPPORTED entry is what the OS itself
  //    does for app resources.
  try {
    const locales = ExpoLocalization?.getLocales?.() ?? [];
    for (const l of locales) {
      const m = normalize(String(l?.languageTag || l?.languageCode || ''));
      if (m) return m;
    }
  } catch { /* fall through */ }
  // 1) Hermes Intl — works on both platforms under the new architecture.
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;   // e.g. "pt-BR"
    const m = normalize(String(loc || ''));
    if (m) return m;
  } catch { /* fall through */ }
  // 2) Legacy NativeModules constants (old-architecture builds).
  try {
    let raw = '';
    if (Platform.OS === 'ios') {
      const sm = (NativeModules as { SettingsManager?: { settings?: { AppleLocale?: string; AppleLanguages?: string[] } } }).SettingsManager;
      raw = sm?.settings?.AppleLocale
        || (Array.isArray(sm?.settings?.AppleLanguages) ? sm.settings.AppleLanguages[0] : '')
        || '';
    } else {
      raw = (NativeModules as { I18nManager?: { localeIdentifier?: string } }).I18nManager?.localeIdentifier || '';
    }
    const m = normalize(String(raw));
    if (m) return m;
  } catch { /* fall through */ }
  return UNSUPPORTED_FALLBACK;
}
