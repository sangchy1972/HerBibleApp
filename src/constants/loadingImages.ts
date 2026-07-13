// Loading-screen background images.
//
// The photos live on the public covers domain under /backgrounds/loading/. NONE
// are bundled. Before any CDN image is cached (fresh install) the loading screen
// falls back to the bundled `follow_him_day.webp` (see components/LoadingOverlay),
// so there is always a photo behind the verse. From the second launch on, the
// rotating CDN images are cached on disk (see services/loadingCache.ts) and the
// pool keeps exactly the current + next image.
//
// v2 (2026-07-12, per user): a fresh 28-photo set replaces the old 10. The
// sources were 2–13 MB straight off Pexels/Unsplash; they're resampled to a
// 2200 px long edge at q76 (progressive JPEG, EXIF stripped) — 80.8 MB → 7.5 MB,
// ~270 KB each. The long edge keeps headroom over a 2796 pt phone because the
// overlay pushes the photo in from 100 % → 110 % while it's on screen.
//
// The path is NEW on purpose: the old /v1/loading/ objects stay put, so clients
// still running the previous build keep working. loadingCache's pruneExcept()
// deletes the old cached files by name on the first launch of this build.
//
// ⚠️ The custom domain is bound to the bucket ROOT, so the URL path IS the R2
// object key — there is no rewrite in between. Bucket layout:
//   v1/covers/<slug>.webp             plan covers
//   v1/loading/<hash>.jpg             the OLD 10-photo set (left in place)
//   backgrounds/loading/<file>.jpg    THIS set — note: NO v1/ prefix
// So the base below must match the upload key EXACTLY, prefix for prefix. A
// mismatch doesn't crash: every image 404s and the loading screen silently falls
// back to the bundled photo forever, which is easy to not notice.
//
// Upload target (bucket herbible-plans-7languages):
//   R2 key   backgrounds/loading/loading-01.jpg
//   URL      https://covers.everlandapps.com/backgrounds/loading/loading-01.jpg
export const LOADING_IMG_BASE = 'https://covers.everlandapps.com/backgrounds/loading';

// Filenames as uploaded. Rotation cycles through this list, one per cold start.
export const LOADING_IMAGE_FILES: string[] = [
  'loading-01.jpg',
  'loading-02.jpg',
  'loading-03.jpg',
  'loading-04.jpg',
  'loading-05.jpg',
  'loading-06.jpg',
  'loading-07.jpg',
  'loading-08.jpg',
  'loading-09.jpg',
  'loading-10.jpg',
  'loading-11.jpg',
  'loading-12.jpg',
  'loading-13.jpg',
  'loading-14.jpg',
  'loading-15.jpg',
  'loading-16.jpg',
  'loading-17.jpg',
  'loading-18.jpg',
  'loading-19.jpg',
  'loading-20.jpg',
  'loading-21.jpg',
  'loading-22.jpg',
  'loading-23.jpg',
  'loading-24.jpg',
  'loading-25.jpg',
  'loading-26.jpg',
  'loading-27.jpg',
  'loading-28.jpg',
];

export function loadingImageUrl(filename: string): string {
  return `${LOADING_IMG_BASE}/${filename}`;
}
