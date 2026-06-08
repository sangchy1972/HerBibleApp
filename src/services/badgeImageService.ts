import { File, Directory, Paths } from 'expo-file-system';
import { badgeUrl, badgeFileName } from '../constants/badgeImageCdn';
import { cfImage } from './cfImage';

// Achievement badge art — download-once + local cache.
//
// Badges are NOT bundled in the app binary. The first time the Achievement
// screen mounts we pull every badge PNG from the CDN into this cache dir;
// thereafter BadgeIcon renders straight from disk (offline-safe, instant).
// Files are tiny transparent PNGs, so all 72 together are only a few hundred
// KB — we keep them permanently rather than pruning.
//
// Cache key is the SUBDIR version. Bumped v1 → v2 to abandon any caches
// POISONED by the old code path: a 404 (badge not yet on the CDN at first
// prefetch) could write the 404 HTML body to the cache file, after which
// `f.exists` was true forever and the real PNG was never re-fetched — so a
// device that prefetched early showed only the handful of badges that existed
// then. v2 starts clean, and downloadBadge below now HEAD-guards every fetch
// so a non-image response is never written.
const BADGE_CACHE_SUBDIR = 'badge-images:v2';

function cacheDir(): Directory | null {
  try {
    return new Directory(Paths.cache, BADGE_CACHE_SUBDIR);
  } catch {
    return null;
  }
}

function cachedFile(id: string): File | null {
  const dir = cacheDir();
  if (!dir) return null;
  try {
    return new File(dir, badgeFileName(id));
  } catch {
    return null;
  }
}

// Local `file://` URI if this badge is already on disk, else null.
// Synchronous — safe to call from render.
export function cachedBadgeUri(id: string): string | null {
  const f = cachedFile(id);
  try {
    return f && f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

// Download one badge into the cache if it isn't there yet. Returns true once
// the file exists locally (already-cached or freshly downloaded), false on
// any failure (e.g. CDN 404 before art is deployed, or offline) — callers
// fall back to the gradient medallion in that case.
export async function downloadBadge(id: string): Promise<boolean> {
  const f = cachedFile(id);
  if (!f) return false;
  try {
    if (f.exists) return true;
    // Prefer the Cloudflare-resized variant (badges render ≤ ~110 dp, so a
    // 384-px transform is plenty and a fraction of the original PNG); fall
    // back to the untransformed URL when transformations aren't enabled on
    // the zone. Both candidates go through the same HEAD-guard.
    const original = badgeUrl(id);
    const candidates = [...new Set([cfImage(original, 120), original])];
    for (const url of candidates) {
      // HEAD-guard: only download when the object actually exists AND is an
      // image. Prevents a 404 body from being written into the cache file —
      // which previously made f.exists permanently true so the real PNG was
      // never re-fetched once it landed on R2.
      const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
      if (!head?.ok || !(head.headers.get('content-type') || '').toLowerCase().includes('image')) {
        continue;
      }
      const parent = f.parentDirectory;
      if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
      await File.downloadFileAsync(url, f);
      if (f.exists) return true;
    }
    return false;
  } catch {
    // Clean up any half-written file so it isn't mistaken for a valid cache hit.
    try { if (f.exists) f.delete(); } catch {}
    return false;
  }
}
