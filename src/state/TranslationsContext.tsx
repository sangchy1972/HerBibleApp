import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadFullTranslation, getDownloadState } from '../services/bibleService';
import { CORPUS_CDN_BASE as CDN } from '../constants/corpus';

export type LanguageCode = 'en' | 'zh-Hans' | 'zh-Hant' | 'de' | 'fr' | 'es' | 'pt';

export interface Translation {
  code: LanguageCode;
  language: string;       // English-language name
  nativeName: string;     // shown in picker
  edition: string;        // Bible edition (KJV, 和合本, etc.)
  source: string;         // recommended public-domain JSON source
}

export const TRANSLATIONS: Translation[] = [
  { code: 'en',      language: 'English',              nativeName: 'English',      edition: 'King James Version 1769',  source: `${CDN}/en` },
  { code: 'zh-Hans', language: 'Simplified Chinese',   nativeName: '简体中文',       edition: '圣经和合本 1919（简体）',     source: `${CDN}/zh-Hans` },
  { code: 'zh-Hant', language: 'Traditional Chinese',  nativeName: '繁體中文',       edition: '聖經和合本 1919（繁體）',     source: `${CDN}/zh-Hant` },
  { code: 'de',      language: 'German',               nativeName: 'Deutsch',      edition: 'Lutherbibel 1912',          source: `${CDN}/de` },
  { code: 'fr',      language: 'French',               nativeName: 'Français',     edition: 'Louis Segond 1910',         source: `${CDN}/fr` },
  { code: 'es',      language: 'Spanish',              nativeName: 'Español',      edition: 'Reina-Valera 1909',         source: `${CDN}/es` },
  { code: 'pt',      language: 'Portuguese',           nativeName: 'Português',    edition: 'João Ferreira de Almeida',  source: `${CDN}/pt` },
];

interface TranslationsState {
  current: Translation;
  setTranslation: (code: LanguageCode) => void;
}

const TranslationsContext = createContext<TranslationsState | null>(null);

function detectSystemLanguage(): LanguageCode {
  let raw = '';
  if (Platform.OS === 'ios') {
    raw =
      NativeModules.SettingsManager?.settings?.AppleLocale ||
      NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
      '';
  } else if (Platform.OS === 'android') {
    raw = NativeModules.I18nManager?.localeIdentifier || '';
  }
  raw = (raw || 'en').toLowerCase().replace('_', '-');
  if (raw.startsWith('zh')) {
    if (raw.includes('hant') || raw.includes('tw') || raw.includes('hk') || raw.includes('mo')) return 'zh-Hant';
    return 'zh-Hans';
  }
  const prefix = raw.split('-')[0];
  if (['en', 'de', 'fr', 'es', 'pt'].includes(prefix)) return prefix as LanguageCode;
  return 'en';
}

const FIRST_LAUNCH_KEY = 'bible:first-launch-prefetched';

export function TranslationsProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<LanguageCode>(() => detectSystemLanguage());

  // On first launch, kick off a background prefetch of the system-language Bible.
  // Runs delayed (4s) so the app's first paint isn't competing for bandwidth.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const done = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
      if (done || cancelled) return;
      const sys = detectSystemLanguage();
      const tr = TRANSLATIONS.find(x => x.code === sys);
      if (!tr) return;
      const state = await getDownloadState(sys);
      if (state.status === 'complete') {
        await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
        return;
      }
      try {
        await downloadFullTranslation(sys, tr.source);
        await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
      } catch {
        // best effort — user can manually retry from Profile
      }
    }, 4000);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const value = useMemo<TranslationsState>(() => ({
    current: TRANSLATIONS.find(t => t.code === code) || TRANSLATIONS[0],
    setTranslation: setCode,
  }), [code]);

  return <TranslationsContext.Provider value={value}>{children}</TranslationsContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(TranslationsContext);
  if (!ctx) throw new Error('useTranslation must be used inside TranslationsProvider');
  return ctx;
}
