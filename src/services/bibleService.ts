import AsyncStorage from '@react-native-async-storage/async-storage';
import { localizeBookName } from '../constants/bibleBookNames';
import { CORPUS_COMMIT } from '../constants/corpus';

// Short cache-bust tag derived from the pinned corpus commit. Bumping the pin
// changes this and forces every device to re-fetch fresh chapters/indexes
// (e.g. after we corrected the zh-Hant/zh-Hans whitespace bug).
const CACHE_TAG = CORPUS_COMMIT.slice(0, 7);

export interface Verse {
  verse: number;
  text: string;
}

export interface Chapter {
  verses: Verse[];
}

export interface BookSummary {
  name: string;
  slug: string;
  chapters: number;
}

export interface TranslationIndex {
  code: string;
  name: string;
  license: string;
  source: string;
  generatedAt: string;
  stats: { books: number; chapters: number; verses: number };
  books: BookSummary[];
}

const indexKey = (code: string) => `bible:idx:${CACHE_TAG}:${code}`;
const chapterKey = (code: string, slug: string, ch: number) => `bible:ch:${CACHE_TAG}:${code}:${slug}:${ch}`;
const downloadStateKey = (code: string) => `bible:dl:${CACHE_TAG}:${code}`;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

export async function fetchTranslationIndex(code: string, baseUrl: string): Promise<TranslationIndex> {
  const cached = await AsyncStorage.getItem(indexKey(code));
  let data: TranslationIndex;
  if (cached) {
    data = JSON.parse(cached) as TranslationIndex;
  } else {
    data = await fetchJson<TranslationIndex>(`${baseUrl}/index.json`);
    await AsyncStorage.setItem(indexKey(code), JSON.stringify(data));
  }
  // Upstream pd-text-corpus indexes ship English names. Apply on read so cached
  // payloads from earlier sessions also pick up the localized names.
  return {
    ...data,
    books: data.books.map(b => ({ ...b, name: localizeBookName(code, b.slug, b.name) })),
  };
}

export async function fetchChapter(code: string, baseUrl: string, slug: string, chapter: number): Promise<Chapter> {
  const key = chapterKey(code, slug, chapter);
  const cached = await AsyncStorage.getItem(key);
  if (cached) return JSON.parse(cached) as Chapter;
  const data = await fetchJson<Chapter>(`${baseUrl}/books/${slug}/chapters/${chapter}.json`);
  await AsyncStorage.setItem(key, JSON.stringify(data));
  return data;
}

// Per-verse commentary chapter. Lives at
//   <cdnRoot>/commentary/<lang>/books/<slug>/chapters/<N>.json
// with the same `{ verses: [{ verse, text }, ...] }` shape as the bible
// JSON, so the same `Chapter` type re-applies. Cached locally under a
// dedicated key prefix so a future invalidation of bible-only data (e.g.
// the zh-Hant whitespace fix) doesn't blow away the commentary cache.
//
// Source priority (tried in order, 404 → next, non-404 error → bail):
//   1. `commentary/en-mh/...` — HerBibleApp's bespoke devotional style
//      (warm, women-friendly, avg 30w/verse). Chapters appear here
//      incrementally as they get written; missing chapters 404.
//   2. `commentary/<lang>/...` — the requested locale, when not `en`.
//      Currently only `en` (Tyndale Open Study Notes) ships on the
//      mirror; future zh/de/fr/es/pt drops will activate here.
//   3. `commentary/en/...` — Tyndale (CC BY-SA 4.0) as the universal
//      last-resort fallback. Every KJV verse has an entry here.
// For an English reader the priority collapses to en-mh → en; for a
// non-English reader it's lang → en-mh → en. The hybrid means
// already-rewritten chapters serve the new style and the long tail
// keeps serving Tyndale until we catch up, all behind one fetch call.
const commentaryKey = (lang: string, slug: string, ch: number) =>
  `bible:commentary:${CACHE_TAG}:${lang}:${slug}:${ch}`;

export async function fetchCommentaryChapter(cdnRoot: string, lang: string, slug: string, chapter: number): Promise<Chapter> {
  const key = commentaryKey(lang, slug, chapter);
  const cached = await AsyncStorage.getItem(key);
  if (cached) return JSON.parse(cached) as Chapter;
  const data = await fetchCommentaryWithFallback(cdnRoot, lang, slug, chapter);
  await AsyncStorage.setItem(key, JSON.stringify(data));
  return data;
}

async function fetchCommentaryWithFallback(
  cdnRoot: string, lang: string, slug: string, chapter: number,
): Promise<Chapter> {
  const base = (variant: string) =>
    `${cdnRoot}/commentary/${variant}/books/${slug}/chapters/${chapter}.json`;
  const urls = lang === 'en'
    ? [base('en-mh'), base('en')]
    : [base(lang), base('en-mh'), base('en')];
  let lastErr: string | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        // Any non-200 (404 not-yet-written, or a transient 5xx / jsDelivr
        // cold-start hiccup) → try the next variant rather than bailing. This
        // is what lets en-mh gaps fall through to Tyndale, and stops a flaky
        // en-mh response from blocking the en fallback.
        lastErr = `HTTP ${res.status} for ${url}`;
        continue;
      }
      // Guard JSON parsing too: a truncated body on a weak network would
      // otherwise throw and escape the whole fallback chain.
      return (await res.json()) as Chapter;
    } catch (e) {
      lastErr = `${String(e)} for ${url}`;
      continue;
    }
  }
  throw new Error(`No commentary available — ${lastErr ?? '(unknown)'}`);
}

export interface VerseHit {
  bookSlug: string;
  chapter: number;
  verse: number;
  text: string;
}

// Substring-search every cached chapter for the given translation. Returns
// instantly without touching the network. Used as the fast first pass before
// streaming through uncached chapters.
export async function searchCachedVerses(
  code: string,
  query: string,
  limit = 200,
): Promise<VerseHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const prefix = `bible:ch:${CACHE_TAG}:${code}:`;
  const allKeys = await AsyncStorage.getAllKeys();
  const chapterKeys = allKeys.filter(k => k.startsWith(prefix));
  if (chapterKeys.length === 0) return [];
  const pairs = await AsyncStorage.multiGet(chapterKeys);
  const hits: VerseHit[] = [];
  for (const [key, value] of pairs) {
    if (!value) continue;
    let data: Chapter;
    try { data = JSON.parse(value) as Chapter; } catch { continue; }
    const tail = key.slice(prefix.length);
    const sep = tail.lastIndexOf(':');
    const bookSlug = tail.slice(0, sep);
    const chapter = Number(tail.slice(sep + 1));
    if (!Number.isFinite(chapter)) continue;
    for (const v of data.verses) {
      if (v.text.toLowerCase().includes(q)) {
        hits.push({ bookSlug, chapter, verse: v.verse, text: v.text });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

// Streaming cross-Bible search:
//   1. Hit the cached chapters first (instant, returns synchronously-ish)
//   2. Then fetch every uncached chapter in book order, prioritising the
//      user's current book, searching as each chapter arrives
// Calls `onBatch` whenever new hits are ready, calls `onProgress` after each
// chapter so the UI can show "Searching Genesis 12 / 1189 chapters". Aborts
// cleanly when the AbortSignal fires.
export interface SearchProgress {
  done: number;
  total: number;
  currentBook: string;
}

export async function streamingSearchVerses(
  code: string,
  baseUrl: string,
  books: BookSummary[],
  query: string,
  options: {
    onBatch: (hits: VerseHit[]) => void;
    onProgress?: (p: SearchProgress) => void;
    onComplete?: () => void;
    signal: AbortSignal;
    startBookSlug?: string;
  },
): Promise<void> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) { options.onComplete?.(); return; }

  // Phase 1: cache scan.
  const cached = await searchCachedVerses(code, q);
  if (options.signal.aborted) return;
  if (cached.length > 0) options.onBatch(cached);

  // Build the work queue: current book first (if provided), then the rest in
  // canonical order (Genesis → Revelation, which is the order `books` arrives
  // in from the index).
  const ordered: BookSummary[] = [];
  if (options.startBookSlug) {
    const cur = books.find(b => b.slug === options.startBookSlug);
    if (cur) ordered.push(cur);
  }
  for (const b of books) {
    if (b.slug === options.startBookSlug) continue;
    ordered.push(b);
  }

  // Skip whatever we already searched in phase 1.
  const cachedKeyPrefix = `bible:ch:${CACHE_TAG}:${code}:`;
  const cachedSet = new Set(
    (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(cachedKeyPrefix)),
  );

  const total = ordered.reduce((n, b) => n + b.chapters, 0);
  let done = 0;
  let pending: VerseHit[] = [];
  let lastFlush = Date.now();
  const flush = () => {
    if (pending.length === 0) return;
    options.onBatch(pending);
    pending = [];
    lastFlush = Date.now();
  };

  for (const book of ordered) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      if (options.signal.aborted) { flush(); return; }
      done++;
      options.onProgress?.({ done, total, currentBook: book.name });

      const key = `bible:ch:${CACHE_TAG}:${code}:${book.slug}:${ch}`;
      if (cachedSet.has(key)) continue;     // already counted in cached pass

      let data: Chapter;
      try {
        data = await fetchChapter(code, baseUrl, book.slug, ch);
      } catch {
        continue;                           // best-effort: skip transient fetch failures
      }
      if (options.signal.aborted) { flush(); return; }

      for (const v of data.verses) {
        if (v.text.toLowerCase().includes(q)) {
          pending.push({ bookSlug: book.slug, chapter: ch, verse: v.verse, text: v.text });
        }
      }
      if (pending.length > 0 && Date.now() - lastFlush > 350) flush();
    }
  }
  flush();
  options.onComplete?.();
}

export interface DownloadState {
  status: 'none' | 'in-progress' | 'complete';
  fetched: number;
  total: number;
  updatedAt: string;
}

export async function getDownloadState(code: string): Promise<DownloadState> {
  const raw = await AsyncStorage.getItem(downloadStateKey(code));
  if (!raw) return { status: 'none', fetched: 0, total: 0, updatedAt: '' };
  return JSON.parse(raw) as DownloadState;
}

async function setDownloadState(code: string, state: DownloadState) {
  await AsyncStorage.setItem(downloadStateKey(code), JSON.stringify(state));
}

/**
 * Download every chapter of a translation, in parallel batches.
 * Reports progress via onProgress(fetched, total).
 * Idempotent: skips chapters already in cache.
 */
export async function downloadFullTranslation(
  code: string,
  baseUrl: string,
  onProgress?: (fetched: number, total: number) => void,
  signal?: AbortSignal,
): Promise<DownloadState> {
  const idx = await fetchTranslationIndex(code, baseUrl);
  const tasks: { slug: string; chapter: number }[] = [];
  for (const b of idx.books) {
    for (let c = 1; c <= b.chapters; c++) {
      tasks.push({ slug: b.slug, chapter: c });
    }
  }
  const total = tasks.length;
  let fetched = 0;
  await setDownloadState(code, { status: 'in-progress', fetched: 0, total, updatedAt: new Date().toISOString() });
  if (onProgress) onProgress(0, total);

  const concurrency = 8;
  let cursor = 0;
  let lastReport = 0;

  async function worker() {
    while (true) {
      if (signal?.aborted) return;
      const i = cursor++;
      if (i >= tasks.length) return;
      const t = tasks[i];
      try {
        await fetchChapter(code, baseUrl, t.slug, t.chapter);
      } catch {
        // best effort; will retry next time user runs download
      }
      fetched++;
      const now = Date.now();
      if (onProgress && now - lastReport > 120) {
        lastReport = now;
        onProgress(fetched, total);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const final: DownloadState = {
    status: signal?.aborted ? 'in-progress' : 'complete',
    fetched,
    total,
    updatedAt: new Date().toISOString(),
  };
  await setDownloadState(code, final);
  if (onProgress) onProgress(fetched, total);
  return final;
}
