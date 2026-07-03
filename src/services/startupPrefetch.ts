import { Image, Dimensions } from 'react-native';
import { prepareVerseAudio, verseIdFor } from './dailyVerseAudioService';
import { fetchStepTimings } from './verseHighlight';
import { resolveDailyVerseAudioLang, isDailyVerseAudioAvailable } from '../constants/dailyVerseAudioCdn';
import { cfImage } from './cfImage';
import { PLAN_COVER_CDN_BASE } from '../constants/plansApi';

// ───────────────────────────────────────────────────────────────────────────
// Startup background prefetch — "warm everything the user is bound to see
// soon, quietly, while they read the home verse".
//
// WHY: on a slow network the Plan covers + the prayer-flow narration only
// started downloading when the user first navigated to those screens, so they
// sat on blank cards / a greyed-out Listen button. Since every user reaches
// these eventually, we pull them ahead of time into the same on-disk / native
// caches the screens already read from — so by the time they arrive, it's
// instant.
//
// ORDER (most-visible first, cheapest first):
//   Phase 1  home verse-card background image      ── owned by
//   Phase 2  prayer-flow background music              PrayerBackgroundsContext
//            (both fire on its manifest load — earliest, see that file)
//   Phase 3  prayer-flow narration audio + timestamps  ┐ this module,
//   Phase 4  plan covers + plan detail bodies           ┘ deferred + sequential
//
// SAFETY (low-end devices / ANR):
//   • Caller defers us behind InteractionManager + a delay, so we never run
//     during the launch frame or compete with Firebase / AdMob init.
//   • Everything here is native I/O (Image.prefetch, expo-file-system
//     downloads, fetch) — no heavy JS on the main thread.
//   • Phases run SEQUENTIALLY with small gaps so we never fire a burst of
//     concurrent downloads that saturates a cheap radio / CPU.
//   • Every step is wrapped + fire-and-forget: a failure is silent and the
//     on-demand path on each screen still works exactly as before.
// ───────────────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Phase 3 — today's prayer-flow narration (4 clips × morning + evening) and
// the follow-along sentence timings. No-ops cleanly when: the narration
// manifest is still the empty placeholder (returns null), or the user's UI
// language has no recorded narration yet (resolve → null) — so we never waste
// bandwidth pulling English audio a non-English reader will never be offered.
async function prefetchNarration(todayDay: number, uiLang: string): Promise<void> {
  const lang = resolveDailyVerseAudioLang(uiLang);
  if (!lang) return;                       // language not recorded yet → skip
  const morningId = verseIdFor(todayDay, 'morning');
  const eveningId = verseIdFor(todayDay, 'evening');
  const keep = [morningId, eveningId];     // prune everything except today
  for (const verseId of keep) {
    // Per-verse upload holes (es/pt have a few) → the Listen button is hidden
    // for that verse anyway, so don't burn bandwidth on guaranteed 404s.
    if (!isDailyVerseAudioAvailable(lang, verseId)) continue;
    // Downloads the 4 step clips into the day-scoped cache (stream-first;
    // the download happens in the background inside prepareVerseAudio).
    await prepareVerseAudio(verseId, keep, lang).catch(() => {});
    // Sentence timings live as a sibling .json next to each clip; warm the
    // in-memory cache so the highlight is ready the instant playback starts.
    await fetchStepTimings(verseId, false, lang).catch(() => {});
    await sleep(150);                       // gentle pacing between verses
  }
}

// Phase 4a — plan cover images. Warms the native Image cache for the plans the
// user is most likely to see first (the Explore "Featured" carousel), at the
// big-card render width. Row thumbnails are tiny and load on scroll; we only
// pre-pull the prominent ones to keep this light on a cheap device.
async function prefetchPlanCovers(slugs: string[]): Promise<void> {
  for (const slug of slugs) {
    const url = `${PLAN_COVER_CDN_BASE}/${slug}.webp`;
    Image.prefetch(cfImage(url, SCREEN_W)).catch(() => {});
    await sleep(60);
  }
}

// Phase 4b — plan detail bodies. loadPlan caches the fetched JSON into
// FeaturedPlansContext, so opening a featured plan's detail screen renders
// instantly instead of sitting on a spinner. Sequential so we don't fan out a
// dozen CDN requests at once.
async function prefetchPlanDetails(
  slugs: string[],
  loadPlan: (slug: string) => Promise<unknown>,
): Promise<void> {
  for (const slug of slugs) {
    await loadPlan(slug).catch(() => {});
    await sleep(120);
  }
}

export interface StartupPrefetchInput {
  todayDay: number;
  uiLang: string;
  /** Featured plan slugs to warm (covers + detail bodies). Keep this small. */
  featuredSlugs: string[];
  loadPlan: (slug: string) => Promise<unknown>;
}

// Run phases 3 → 4 in order. Resolves when done; never throws.
export async function runStartupPrefetch(input: StartupPrefetchInput): Promise<void> {
  const { todayDay, uiLang, featuredSlugs, loadPlan } = input;
  try { await prefetchNarration(todayDay, uiLang); } catch {}
  await sleep(200);
  try { await prefetchPlanCovers(featuredSlugs); } catch {}
  try { await prefetchPlanDetails(featuredSlugs, loadPlan); } catch {}
}
