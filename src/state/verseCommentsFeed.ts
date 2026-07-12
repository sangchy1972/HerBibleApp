import { VERSE_COMMENTS, COMMENT_NAMES } from '../constants/verseComments';
import type { LanguageCode } from './TranslationsContext';

// Pure, deterministic generator for the daily-verse comment feed. The feed's
// identity is (ymd, slot): the same local day + slot produces a byte-identical
// list (names, ago labels, like counts, order) on every open — reopening the
// sheet no longer re-rolls it (user-reported: "liked a comment, reopened,
// everything changed"). Texts draw from the ACTIVE language's pool on a
// separate seed stream, so switching UI language mid-day swaps only the words
// — the commenters, timestamps, like counts, order and row ids stay put (and
// with them the user's likes, stored by id in verseCommentLikes.ts).
// Zero RN imports → unit-testable (see __tests__/verseCommentsFeed.test.ts).

export type VerseSlot = 'morning' | 'evening';

export interface FeedComment {
  id: number;        // 0..n-1, stable per (ymd, slot), language-independent
  name: string;
  text: string;
  agoLabel: string;  // "2m".."12h" — fixed for the day, newest first
  likes: number;     // canned baseline 0..239
}

// FNV-1a → uint32. Tiny, stable string hash for seeding.
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — small fast seeded PRNG, plenty for decorative shuffling.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic per-day pseudo-random count — the sin formula PrayerScreen
// always used for the card badges (moved here verbatim, date injected, so
// shipped badge numbers don't jump on update). Stable within a calendar day.
export function dailyCount(ymd: string, salt: number, min: number, range: number): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const seed = y * 10000 + m * 100 + d + salt * 137;
  return min + Math.floor(Math.abs(Math.sin(seed)) * range);
}

// Seeded Fisher–Yates; returns the first n of a shuffled copy.
function seededSample<T>(arr: readonly T[], n: number, rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

export function buildCommentFeed({ ymd, slot, lang, count }: {
  ymd: string; slot: VerseSlot; lang: LanguageCode; count: number;
}): FeedComment[] {
  const pool = VERSE_COMMENTS[lang] || VERSE_COMMENTS.en;
  // Every row needs a distinct text AND a distinct name, so both pools clamp.
  const n = Math.max(0, Math.min(count, pool.length, COMMENT_NAMES.length));

  // Two streams: meta (names/ago/likes/order) is language-INDEPENDENT so a
  // mid-day language switch keeps the same thread; text keys the language in.
  const metaRng = mulberry32(hashStr(`${ymd}|${slot}`));
  const textRng = mulberry32(hashStr(`${ymd}|${slot}|${lang}`));

  // Draw order is part of the determinism contract — do not reorder:
  // (1) names, (2) per-row agoMin + likes, (3) texts, (4) sort + ids.
  const names = seededSample(COMMENT_NAMES, n, metaRng);
  const meta = names.map((name) => ({
    name,
    agoMin: 2 + Math.floor(metaRng() * 719),        // 2m .. ~12h — today's verse only
    likes: Math.floor(metaRng() * 240),
  }));
  const texts = seededSample(pool, n, textRng);

  return meta
    .map((m, i) => ({ ...m, text: texts[i] }))
    .sort((a, b) => a.agoMin - b.agoMin)             // newest first, like a real thread
    .map((m, i) => ({
      id: i,
      name: m.name,
      text: m.text,
      agoLabel: m.agoMin < 60 ? `${m.agoMin}m` : `${Math.floor(m.agoMin / 60)}h`,
      likes: m.likes,
    }));
}
