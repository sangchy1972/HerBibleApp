import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VerseSlot } from './verseCommentsFeed';

// The ONE piece of comment-feed state that cannot be derived: which rows the
// user liked. Everything else (texts, names, ages, counts, order) regenerates
// deterministically from (ymd, slot) — see verseCommentsFeed.ts. Likes live
// under today's ymd only and expire naturally with the feed: a new day's
// first toggle overwrites the single key, so there is no per-day key
// accumulation and no cleanup pass.

const KEY = 'verseCommentLikes:v1';

interface Stored { ymd: string; morning: number[]; evening: number[] }

let cache: Stored | null = null;
let hydrated = false;

/** Read persisted likes into the module cache. Fire-and-forget at app start;
 *  a toggle that lands before hydration wins (the resolve never clobbers). */
export async function hydrateCommentLikes(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!hydrated && raw) cache = JSON.parse(raw) as Stored;
  } catch { /* decorative feature — never throw */ }
  hydrated = true;
}

function emptyFor(ymd: string): Stored {
  return { ymd, morning: [], evening: [] };
}

/** Synchronous read from the cache; empty when the stored day isn't `ymd`. */
export function getLikedIds(ymd: string, slot: VerseSlot): Set<number> {
  if (!cache || cache.ymd !== ymd) return new Set();
  return new Set(cache[slot]);
}

/** Toggle a row's like and persist. Returns the new liked set for the slot. */
export function toggleCommentLike(ymd: string, slot: VerseSlot, id: number): Set<number> {
  if (!cache || cache.ymd !== ymd) cache = emptyFor(ymd);
  const set = new Set(cache[slot]);
  if (set.has(id)) set.delete(id); else set.add(id);
  cache = { ...cache, [slot]: [...set] };
  hydrated = true;                                   // a live toggle outranks a late hydrate
  AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
  return set;
}
