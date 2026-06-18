// Loading-screen background images.
//
// The 10 photos live on the public covers domain under /v1/loading/. NONE are
// bundled (≈25 MB total). Before any CDN image is cached (fresh install), the
// loading screen shows a white→pink silk GRADIENT fallback (see
// components/LoadingOverlay). After first launch the rotating CDN images are
// cached on disk (see services/loadingCache.ts) and shown thereafter.
//
// Upload target (public bucket behind covers.everlandapps.com):
//   covers.everlandapps.com/v1/loading/<filename>.jpg
export const LOADING_IMG_BASE = 'https://covers.everlandapps.com/v1/loading';

// Filenames as uploaded (kept verbatim). Rotation cycles through this list.
export const LOADING_IMAGE_FILES: string[] = [
  '122f7999ed9ff50d5e0f29c67ee36a88.jpg',
  '2686ea51f9ad6d875e147e323bf6c18d.jpg',
  '310498ff09484bd20217f0de37ca9364.jpg',
  '4e059cc5e71f54c4ffb5335a0cee165b.jpg',
  '628176c4b5e651212e6e5473c42a39f7.jpg',
  '6c9c724657ce138a8320764517f8a422.jpg',
  'a20124561a3de40bf0c21aa887bc77e0.jpg',
  'a6d04288bb8ed44a1695ac5b12c75602.jpg',
  'f3b276150da56ae8d6566cadfef24eba.jpg',
  'pexels-vurzie-kim-325095862-27256971.jpg',
];

export function loadingImageUrl(filename: string): string {
  return `${LOADING_IMG_BASE}/${filename}`;
}
