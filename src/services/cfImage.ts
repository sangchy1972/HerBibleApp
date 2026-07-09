import { PixelRatio } from 'react-native';

// Cloudflare Image Transformations — request right-sized images instead of
// the full-resolution originals (https://developers.cloudflare.com/images/).
//
// URL shape: https://<zone-host>/cdn-cgi/image/<options>/<original-path>
// We pass an EXPLICIT width (render width × device pixel ratio) rather than
// `width=auto`: auto relies on browser client hints / user-agent sniffing,
// which React Native's native image loaders don't send — explicit width is
// the deterministic equivalent for an app, where we always know the slot
// size at the call site.
//
// `format=auto` lets Cloudflare serve AVIF/WebP per the Accept header;
// `quality=80` is visually lossless for photos at these sizes.
//
// ⚠ Requires "Image Transformations" to be ENABLED for the zone in the
// Cloudflare dashboard (Images → Transformations → everlandapps.com). If
// it's off, /cdn-cgi/image/ URLs 404 — every consumer below therefore keeps
// a fallback path to the original URL.
const TRANSFORM_HOSTS = new Set(['covers.everlandapps.com']);

// Snap requested widths to a small set of buckets so different devices hit
// the SAME transformed variant on Cloudflare's cache (3× cache hit-rate vs
// per-pixel widths), and Cloudflare bills/transforms fewer unique variants.
const WIDTH_BUCKETS = [128, 256, 384, 512, 768, 1080, 1440];

function bucketFor(px: number): number {
  for (const b of WIDTH_BUCKETS) if (px <= b) return b;
  return WIDTH_BUCKETS[WIDTH_BUCKETS.length - 1];
}

/**
 * Rewrite a CDN image URL to a Cloudflare-resized variant.
 * @param url      original image URL
 * @param cssWidth the width the image renders at, in dp (style width)
 * @param quality  1-100, default 80
 */
export function cfImage(url: string, cssWidth: number, quality = 80): string {
  try {
    const m = url.match(/^https:\/\/([^/]+)(\/.*)$/);
    if (!m) return url;
    const [, host, path] = m;
    if (!TRANSFORM_HOSTS.has(host)) return url;            // unknown zone — leave untouched
    if (path.startsWith('/cdn-cgi/')) return url;          // already transformed
    const dpr = Math.min(3, Math.max(1, PixelRatio.get())); // cap 3× — beyond is invisible
    const w = bucketFor(Math.ceil(cssWidth * dpr));
    return `https://${host}/cdn-cgi/image/width=${w},quality=${quality},format=auto${path}`;
  } catch {
    return url;
  }
}

/**
 * Cover-CROP a CDN image to an exact box (width × height, dp), preserving aspect
 * ratio and cropping the overflow — `fit=cover` + `gravity=auto`. Used by the
 * home-screen widget, whose landscape box would otherwise STRETCH the portrait
 * verse-card background (react-native-android-widget's ImageWidget scales the
 * bitmap straight to its box with no scale-type). Requires Cloudflare Image
 * Transformations on the zone; callers must keep a non-transform fallback.
 * @param cssW target width in dp   @param cssH target height in dp
 */
export function cfCoverImage(url: string, cssW: number, cssH: number, quality = 80): string {
  try {
    const m = url.match(/^https:\/\/([^/]+)(\/.*)$/);
    if (!m) return url;
    const [, host, path] = m;
    if (!TRANSFORM_HOSTS.has(host)) return url;
    if (path.startsWith('/cdn-cgi/')) return url;
    const dpr = Math.min(3, Math.max(1, PixelRatio.get()));
    const w = bucketFor(Math.ceil(cssW * dpr));
    const h = Math.round(w * (cssH / cssW));   // keep the requested box ratio
    return `https://${host}/cdn-cgi/image/width=${w},height=${h},fit=cover,gravity=auto,quality=${quality},format=auto${path}`;
  } catch {
    return url;
  }
}
