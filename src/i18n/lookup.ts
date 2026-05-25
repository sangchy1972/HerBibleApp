// Non-React string lookup. Use this anywhere we need a translated string
// OUTSIDE a React render — scheduled notification content, deep-link
// handlers, AsyncStorage write paths, anywhere a hook can't run.
//
// React render code should keep using `useT()` from `./useT` (which is just
// this function wrapped in a `useCallback` over the current UI language).
// Both go through the same fallback chain so behaviour is identical.
//
// Fallback chain (in order):
//   1. STRINGS[lang][key]   — the translated value, if any
//   2. SOURCE_CATALOG[key].en — the English source, if the key exists
//   3. key                  — last-resort: render the key path so the UI
//                             never shows nothing (and dev warns)

import type { UILanguageCode } from '../state/UILanguageContext';
import { STRINGS } from './strings';
import { SOURCE_CATALOG } from './sourceCatalog';

export function lookupString(key: string, lang: UILanguageCode, params?: Record<string, string | number>): string {
  let raw: string | undefined;
  if (lang !== 'en') {
    raw = STRINGS[lang]?.[key];
  }
  if (raw == null) raw = SOURCE_CATALOG[key]?.en;
  if (raw == null) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] Unknown key "${key}" (lang=${lang}) — neither in STRINGS nor SOURCE_CATALOG`);
    }
    return key;
  }
  return params ? interpolate(raw, params) : raw;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, name) => (params[name] != null ? String(params[name]) : m));
}
