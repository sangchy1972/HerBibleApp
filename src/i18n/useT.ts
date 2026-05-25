import { useCallback } from 'react';
import { useUILanguage } from '../state/UILanguageContext';
import { lookupString } from './lookup';

// React hook for translating strings inside a component render. Returns
// `t(key, params?)` bound to the current UI language. Re-creates the
// callback only when `lang` changes, so descendants memoized on `t` only
// invalidate on language switch.
//
// Code OUTSIDE a render (effects that schedule notifications, deep-link
// resolvers, ...) should import `lookupString` from `./lookup` directly
// instead — same fallback chain, no hook constraint.
export function useT() {
  const { lang } = useUILanguage();
  return useCallback(
    (key: string, params?: Record<string, string | number>) => lookupString(key, lang, params),
    [lang],
  );
}
