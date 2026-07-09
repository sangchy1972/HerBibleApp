// Sentence-level follow-along highlight for the daily-verse narration.
//
// Each narration step (scripture / reflection / simple-step / prayer) has a
// sibling `.json` next to its `.mp3` on the CDN, an array of ElevenLabs
// sentence timings: { text, start, end, sentence_index }. We keep the curated
// on-screen text exactly as-is and locate each spoken sentence inside it
// (Option B), so the highlight tracks the voice without changing the copy.
//
// The only sentence that won't be found is the scripture step's spoken
// reference ("John chapter fourteen, verse one.") — it's read aloud but not
// part of the on-screen verse body, so it simply matches nothing and the
// highlight pauses for those seconds. That's expected.

import { DAILY_VERSE_AUDIO_STEPS, DAILY_VERSE_AUDIO_LANG } from '../constants/dailyVerseAudioCdn';
import {
  loadManifest, loadHolidayManifest, remoteStepUrls, remoteHolidayStepUrls, readCachedStepTimingsRaw,
} from './dailyVerseAudioService';

export interface SentenceTiming { text: string; start: number; end: number; }
export interface Segment { text: string; start?: number; end?: number; }

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A regex that matches `sentence` inside the display text, tolerant to
// whitespace differences (collapsed/newlines) but exact on words+punctuation.
function sentenceRegex(sentence: string): RegExp | null {
  const words = sentence.trim().split(/\s+/).filter(Boolean).map(escapeRe);
  if (!words.length) return null;
  return new RegExp(words.join('\\s+'));
}

// Break `text` into ordered segments, attaching {start,end} to the spans that
// correspond to a spoken sentence. Unmatched sentences are skipped (cursor not
// advanced) so a spoken-only line like the reference never corrupts the map.
export function buildSegments(text: string, timings: SentenceTiming[] | null | undefined): Segment[] {
  if (!text) return [];
  if (!timings || !timings.length) return [{ text }];
  const segs: Segment[] = [];
  let cursor = 0;
  for (const t of timings) {
    const re = sentenceRegex(t.text);
    if (!re) continue;
    const m = re.exec(text.slice(cursor));
    if (!m) continue;                          // spoken-only (e.g. reference) → skip
    const start = cursor + m.index;
    const end = start + m[0].length;
    if (start > cursor) segs.push({ text: text.slice(cursor, start) });   // filler (whitespace/punct between)
    segs.push({ text: text.slice(start, end), start: t.start, end: t.end });
    cursor = end;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor) });
  return segs;
}

// True when this segment is the one being spoken at `time` (seconds).
export function isSegmentActive(seg: Segment, time: number): boolean {
  return seg.start != null && seg.end != null && time >= seg.start && time <= seg.end;
}

// ── Fetch + cache (memory; timings are a few KB each) ────────────────────────

const timingsCache = new Map<string, (SentenceTiming[] | null)[]>();

function parseTimings(raw: unknown): SentenceTiming[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => ({ text: String(r.text ?? ''), start: Number(r.start ?? 0), end: Number(r.end ?? 0) }))
    .filter(t => t.text && Number.isFinite(t.start) && Number.isFinite(t.end));
}

// Resolve the four step timing arrays for a verse, in PAGE order. Returns an
// array of length 4; any step whose JSON is missing/unreachable is null (that
// step just won't highlight). Cached per verseId.
export async function fetchStepTimings(
  verseId: string,
  isHoliday: boolean,
  lang: string = DAILY_VERSE_AUDIO_LANG,
): Promise<(SentenceTiming[] | null)[] | null> {
  // Language rides the memo key + the disk/network paths: es/pt timing .json
  // siblings mirror the English filenames, so a lang-blind lookup would pin
  // English sentence timings onto Spanish audio after a UI-language switch.
  // Holiday narration is now EN/ES/PT too, so it honors `lang` as well.
  const cacheKey = `${isHoliday ? 'h' : 'd'}:${lang}:${verseId}`;
  const hit = timingsCache.get(cacheKey);
  if (hit) return hit;

  // Disk-first: the timing .json siblings are cached next to the audio (by
  // prepareVerseAudio / the launch prefetch), so they're instant + offline.
  // We only hit the network for steps not yet on disk.
  const localRaw = readCachedStepTimingsRaw(verseId, isHoliday, lang);

  const manifest = await (isHoliday ? loadHolidayManifest() : loadManifest());
  // Holiday URLs live under a different base (+ UPPERCASE lang folder), so build
  // them with the holiday URL builder — not the regular remoteStepUrls.
  const mp3Urls = manifest
    ? (isHoliday ? remoteHolidayStepUrls(manifest, verseId, lang) : remoteStepUrls(manifest, verseId, lang))
    : null;
  // No manifest/urls: still serve whatever timings are already on disk.
  if (!mp3Urls) {
    if (!localRaw.some(Boolean)) return null;
    const out = localRaw.map(r => (r ? parseTimings(r) : null));
    timingsCache.set(cacheKey, out);
    return out;
  }

  const out = await Promise.all(
    DAILY_VERSE_AUDIO_STEPS.map(async (_step, i) => {
      const local = localRaw[i];
      if (local) return parseTimings(local);               // disk-cached → instant
      const jsonUrl = mp3Urls[i].replace(/\.mp3$/i, '.json');
      try {
        const res = await fetch(jsonUrl);
        if (!res.ok) return null;
        return parseTimings(await res.json());
      } catch {
        return null;
      }
    }),
  );
  // Don't permanently memo a total failure — let a later attempt retry the
  // network once the connection is back.
  if (out.some(t => t && t.length)) timingsCache.set(cacheKey, out);
  return out;
}
