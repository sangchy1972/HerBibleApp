import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setUserProps } from '../services/firebase';
import { detectDeviceLanguage } from '../i18n/detectDeviceLanguage';

// The 7 supported UI languages. Mirrors TranslationsContext.LanguageCode so a
// user can sensibly say "switch my UI to Português → switch my Bible to João
// Ferreira de Almeida too". UI language and Bible language are kept in
// separate contexts because they're intentionally independently choosable
// (e.g. UI in English, Bible in zh-Hans — the user reads English chrome but
// studies the Chinese Union Version).
export type UILanguageCode = 'en' | 'zh-Hans' | 'zh-Hant' | 'de' | 'fr' | 'es' | 'pt';

export interface UILanguageMeta {
  code: UILanguageCode;
  nativeName: string;     // shown in chip picker (本地名)
  englishName: string;    // for analytics / debug
}

// Chip order per design: English, then the Latin-script languages
// (Español / Português / Français / Deutsch), with the two Chinese scripts
// moved to the end. UI_LANGUAGES[0] must stay 'en' (the default fallback).
export const UI_LANGUAGES: UILanguageMeta[] = [
  { code: 'en',      nativeName: 'English',     englishName: 'English' },
  { code: 'es',      nativeName: 'Español',     englishName: 'Spanish' },
  { code: 'pt',      nativeName: 'Português',   englishName: 'Portuguese' },
  { code: 'fr',      nativeName: 'Français',    englishName: 'French' },
  { code: 'de',      nativeName: 'Deutsch',     englishName: 'German' },
  { code: 'zh-Hans', nativeName: '简体中文',     englishName: 'Simplified Chinese' },
  { code: 'zh-Hant', nativeName: '繁體中文',     englishName: 'Traditional Chinese' },
];

const STORAGE_KEY = 'ui:lang:v1';

interface UILanguageState {
  lang: UILanguageCode;
  meta: UILanguageMeta;
  setLang: (code: UILanguageCode) => void;
  // True until AsyncStorage has been consulted on cold start. Components that
  // need to defer first-paint translation (rare) can gate on this; most just
  // render against the system-detected default until hydration finishes.
  hydrated: boolean;
}

const UILanguageContext = createContext<UILanguageState | null>(null);

export function UILanguageProvider({ children }: { children: React.ReactNode }) {
  // Follow the device locale by default so a Spanish/Chinese/… user lands in a
  // UI they can read — this is also what the onboarding language step
  // pre-selects. A returning user's stored choice overrides it on hydrate.
  const [lang, setLangState] = useState<UILanguageCode>(() => detectDeviceLanguage());
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from AsyncStorage on mount — overrides the system-detected default
  // if the user has previously picked something.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (stored && UI_LANGUAGES.some(l => l.code === stored)) {
          setLangState(stored as UILanguageCode);
        }
      } catch { /* fall back to system-detected default */ }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const setLang = useCallback((code: UILanguageCode) => {
    setLangState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  }, []);

  // Durable analytics dimension — keep app_language current for BigQuery cohorting.
  useEffect(() => { setUserProps({ app_language: lang }); }, [lang]);

  const value = useMemo<UILanguageState>(() => ({
    lang,
    meta: UI_LANGUAGES.find(l => l.code === lang) || UI_LANGUAGES[0],
    setLang,
    hydrated,
  }), [lang, setLang, hydrated]);

  return <UILanguageContext.Provider value={value}>{children}</UILanguageContext.Provider>;
}

export function useUILanguage() {
  const ctx = useContext(UILanguageContext);
  if (!ctx) throw new Error('useUILanguage must be used inside UILanguageProvider');
  return ctx;
}
