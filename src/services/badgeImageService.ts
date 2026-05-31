import { File, Directory, Paths } from 'expo-file-system';
import { badgeUrl, badgeFileName } from '../constants/badgeImageCdn';

// Achievement badge art — download-once + local cache.
//
// Badges are NOT bundled in the app binary. The first time the Achievement
// screen mounts we pull every badge PNG from the CDN into this cache dir;
// thereafter BadgeIcon renders straight from disk (offline-safe, instant).
// Files are tiny transparent PNGs, so all 72 together are only a few hundred
// KB — we keep them permanently rather than pruning.
//
// Cache key is the SUBDIR version. Bump `:v1` (in lockstep with the CDN
// `/v1/badges` path) on a re-art pass to invalidate every stale local file.
const BADGE_CACHE_SUBDIR = 'badge-images:v1';

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
    const parent = f.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
    await File.downloadFileAsync(badgeUrl(id), f);
    return f.exists;
  } catch {
    return false;
  }
}
