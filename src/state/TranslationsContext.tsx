import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadFullTranslation, getDownloadState, fetchTranslationIndex, fetchChapter } from '../services/bibleService';
import { CORPUS_CDN_BASE as CDN } from '../constants/corpus';
import { useUILanguage } from './UILanguageContext';

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

// A translation being downloaded in the background that will become `current`
// the moment its full download completes (auto-swap). Drives the progress row
// in the Language sheet and the "still downloading" notice in the reader.
export interface PendingDownload {
  code: LanguageCode;
  fetched: number;
  total: number;
  paused: boolean;        // true → stopped by the user (or a network error); resumable
}

interface TranslationsState {
  current: Translation;
  pending: PendingDownload | null;
  // Smart switch. If `code` is fully downloaded → swaps immediately. Otherwise
  // keeps the current translation on screen, downloads `code` in the
  // background, and auto-swaps when it completes. Re-selecting the active
  // language cancels any in-flight switch.
  setTranslation: (code: LanguageCode) => void;
  // Pause / resume the in-flight background download (e.g. to avoid burning
  // mobile data). Resume continues from where it left off (downloads are
  // idempotent — already-cached chapters are skipped).
  pauseDownload: () => void;
  resumeDownload: () => void;
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

// Last committed translation, persisted so the Bible stays in lockstep with
// the chosen UI language across app launches.
const CURRENT_KEY = 'bible:current-translation:v1';
// Mirror of BibleScreen's last-read pointer — lets a language switch prime the
// exact chapter the user is on before swapping, so the reader updates in
// seconds instead of after the whole (~1,189-chapter) Bible downloads.
const LAST_READ_KEY = 'bible:last-read';
const DEFAULT_READ = { bookSlug: 'genesis', chapter: 1 };

async function getPriorityChapter(): Promise<{ bookSlug: string; chapter: number }> {
  try {
    const raw = await AsyncStorage.getItem(LAST_READ_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v.bookSlug === 'string' && typeof v.chapter === 'number') {
        return { bookSlug: v.bookSlug, chapter: v.chapter };
      }
    }
  } catch { /* fall through to default */ }
  return DEFAULT_READ;
}

export function TranslationsProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<LanguageCode>(() => detectSystemLanguage());
  const [pending, setPending] = useState<PendingDownload | null>(null);
  const pendingRef = useRef<LanguageCode | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic switch token — guards against a rapid second switch whose
  // async download-state lookup resolves out of order with the first.
  const seqRef = useRef(0);
  // True while the user has paused the background download — stops progress
  // callbacks from un-pausing the UI and tells runFullDownload not to clear.
  const pausedRef = useRef(false);

  // Hydrate the last committed translation (overrides the system-detected
  // default if the user has switched before).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CURRENT_KEY);
        if (!cancelled && stored && TRANSLATIONS.some(t => t.code === stored)) {
          setCode(stored as LanguageCode);
        }
      } catch { /* fall back to system-detected default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Swap the active translation + persist it. Does NOT touch the background
  // download — that's tracked separately via `pending`.
  const applyCode = useCallback((target: LanguageCode) => {
    setCode(target);
    AsyncStorage.setItem(CURRENT_KEY, target).catch(() => {});
  }, []);

  // Run (or resume) the full background download for `target`. Idempotent —
  // downloadFullTranslation skips already-cached chapters, so resuming just
  // picks up where a pause/abort left off. On completion `pending` clears; if
  // it stops short (user pause or network error) it's left in a resumable
  // `paused` state.
  const runFullDownload = useCallback((target: LanguageCode, source: string, seq: number) => {
    pausedRef.current = false;
    const ctl = new AbortController();
    abortRef.current = ctl;
    (async () => {
      try {
        await downloadFullTranslation(target, source, (fetched, total) => {
          if (seqRef.current === seq && pendingRef.current === target && !pausedRef.current) {
            setPending({ code: target, fetched, total, paused: false });
          }
        }, ctl.signal);
      } catch { /* aborted or network failure — handled below */ }
      if (seqRef.current !== seq || pendingRef.current !== target) return;
      const st = await getDownloadState(target);
      if (st.status === 'complete') {
        pendingRef.current = null;
        setPending(null);
      } else {
        // Paused by the user or stopped by a network error → resumable.
        setPending({ code: target, fetched: st.fetched || 0, total: st.total || 0, paused: true });
      }
    })();
  }, []);

  const setTranslation = useCallback((target: LanguageCode) => {
    const tr = TRANSLATIONS.find(t => t.code === target);
    if (!tr) return;
    if (pendingRef.current === target) return;            // a switch to this is already running
    const seq = ++seqRef.current;                         // invalidate any older in-flight switch
    abortRef.current?.abort();                            // cancel a prior background download
    abortRef.current = null;
    pausedRef.current = false;
    if (target === code) {                                // reverting to the active language
      pendingRef.current = null;
      setPending(null);
      return;
    }
    // Mark the switch as in-flight immediately (drives the reader's "loading"
    // notice + the Language-sheet progress) and keep the CURRENT translation on
    // screen until the priority chapter is ready.
    pendingRef.current = target;
    setPending({ code: target, fetched: 0, total: 0, paused: false });

    (async () => {
      const st = await getDownloadState(target);
      if (seqRef.current !== seq) return;                 // superseded
      if (st.status === 'complete') {                     // fully cached → instant swap, no download
        pendingRef.current = null;
        setPending(null);
        applyCode(target);
        return;
      }
      setPending({ code: target, fetched: st.fetched || 0, total: st.total || 0, paused: false });

      // 1) Prime just the chapter the user is reading (+ the index) so the
      //    swap lands in seconds rather than after the whole Bible.
      try {
        const pos = await getPriorityChapter();
        await fetchTranslationIndex(target, tr.source);
        await fetchChapter(target, tr.source, pos.bookSlug, pos.chapter);
      } catch { /* priming failed → swap anyway; the reader fetches on demand */ }
      if (seqRef.current !== seq) return;

      // 2) Swap now. current.code === pending.code from here, so the reader's
      //    "still loading" notice stops; the reader shows the primed chapter.
      applyCode(target);

      // 3) Download the rest in the background for offline use.
      runFullDownload(target, tr.source, seq);
    })();
  }, [code, applyCode, runFullDownload]);

  const pauseDownload = useCallback(() => {
    pausedRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(p => (p ? { ...p, paused: true } : null));
  }, []);

  const resumeDownload = useCallback(() => {
    const target = pendingRef.current;
    if (!target) return;
    const tr = TRANSLATIONS.find(t => t.code === target);
    if (!tr) return;
    setPending(p => (p ? { ...p, paused: false } : null));
    runFullDownload(target, tr.source, seqRef.current);
  }, [runFullDownload]);

  // Auto-resume a PAUSED download the moment the device returns to Wi-Fi — so a
  // download the user stopped to save mobile data picks itself back up for free.
  // Only resumes when paused (we never auto-pause an active download). Guarded:
  // expo-network is a native module; if it isn't compiled into the running
  // build (e.g. a dev client built before it was added), this silently no-ops
  // and the manual pause/resume buttons still work. Activates after the next
  // native rebuild.
  useEffect(() => {
    let sub: { remove?: () => void } | undefined;
    try {
      // CRITICAL: check the native module with requireOptionalNativeModule
      // (returns null, never throws) BEFORE touching expo-network. expo-network's
      // entry does `requireNativeModule('ExpoNetwork')` at module top level,
      // which throws a FATAL (uncatchable by a normal try around require) when
      // the native side isn't in the running build — e.g. a dev client built
      // before expo-network was added. Gating here means we never load it in
      // that case → no crash. Auto-resume activates after the next native build.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const core = require('expo-modules-core');
      if (typeof core.requireOptionalNativeModule !== 'function'
          || !core.requireOptionalNativeModule('ExpoNetwork')) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Network = require('expo-network');
      sub = Network.addNetworkStateListener((state: { type?: string }) => {
        if (state?.type === Network.NetworkStateType?.WIFI && pendingRef.current && pausedRef.current) {
          resumeDownload();
        }
      });
    } catch { /* never crash on the network listener */ }
    return () => { try { sub?.remove?.(); } catch {} };
  }, [resumeDownload]);

  // Bible follows the UI language. Whenever the chosen UI language settles
  // (including after cold-start hydration), make the Bible track it — commits
  // instantly if that translation is already cached, otherwise (re)starts the
  // background download + auto-swap. This is what couples the two (a zh reader
  // never ends up on an English Bible) AND what resumes a download that an app
  // quit interrupted mid-way. setTranslation no-ops when already on target.
  const { lang: uiLang, hydrated: uiHydrated } = useUILanguage();
  useEffect(() => {
    if (uiHydrated) setTranslation(uiLang);
  }, [uiHydrated, uiLang, setTranslation]);

  // (The old first-launch prefetch lived here; the UI-language coupling effect
  // above now downloads the active language's Bible on first launch too, so a
  // separate prefetch would just double-fetch the same chapters.)

  const value = useMemo<TranslationsState>(() => ({
    current: TRANSLATIONS.find(t => t.code === code) || TRANSLATIONS[0],
    pending,
    setTranslation,
    pauseDownload,
    resumeDownload,
  }), [code, pending, setTranslation, pauseDownload, resumeDownload]);

  return <TranslationsContext.Provider value={value}>{children}</TranslationsContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(TranslationsContext);
  if (!ctx) throw new Error('useTranslation must be used inside TranslationsProvider');
  return ctx;
}
