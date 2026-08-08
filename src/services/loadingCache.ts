import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import { LOADING_IMAGE_FILES, loadingImageUrl } from '../constants/loadingImages';
import { LOADING_LINES_COUNT } from '../constants/loadingContent';
import { cfImage } from './cfImage';

const SCREEN_W = Dimensions.get('window').width;

// Loading-screen rotation + image cache.
//
// Rotation: a single persisted counter advances by 1 on every cold start, so
// launch N shows line N and image N (each cycling through its own list). Lines
// are bundled (always available); images are pulled from the CDN and cached on
// disk, keeping a small pool (current + next) so there's always at least one
// cached image ready — per product: "the local pool always holds one image and
// (bundled) sentences", new art replaces old once it lands.

const ROT_KEY = 'loading:rot-index:v1';
const CACHE_SUBDIR = 'loading-bg';

// Read + increment the rotation counter. Returns the index to use THIS launch.
export async function advanceRotation(): Promise<number> {
  let n = 0;
  try { n = parseInt((await AsyncStorage.getItem(ROT_KEY)) ?? '0', 10) || 0; } catch {}
  AsyncStorage.setItem(ROT_KEY, String(n + 1)).catch(() => {});
  return n;
}

export function lineIndexFor(rot: number): number {
  return ((rot % LOADING_LINES_COUNT) + LOADING_LINES_COUNT) % LOADING_LINES_COUNT;
}
export function imageFileFor(rot: number): string {
  const n = LOADING_IMAGE_FILES.length;
  return LOADING_IMAGE_FILES[((rot % n) + n) % n];
}

function cacheDir(): Directory | null {
  try { return new Directory(Paths.cache, CACHE_SUBDIR); } catch { return null; }
}
function cacheFile(filename: string): File | null {
  const dir = cacheDir();
  try { return dir ? new File(dir, filename) : null; } catch { return null; }
}

// ── Truncation guard ─────────────────────────────────────────────────────────
// A download interrupted mid-stream (app killed during the background warm-up,
// connection cut) used to leave a PARTIAL file on disk, and `exists` treated it
// as done forever. Android decodes a truncated JPEG as a sharp top strip over
// flat grey — exactly the broken launch screen the owner screenshotted
// (2026-08-08). Two defenses now:
//   • downloads land in a .part temp file and are RENAMED into the real name
//     only after validating — the final name never holds an incomplete file;
//   • every read re-validates, so devices already poisoned by an old build
//     heal themselves (bad file deleted → bundled fallback this launch →
//     re-downloaded clean in the background).
const MIN_VALID_BYTES = 16 * 1024;   // variants are ~100-300 KB; anything under 16 KB is debris

function isHealthyImageFile(f: File): boolean {
  try {
    if (!f.exists || f.size < MIN_VALID_BYTES) return false;
    const b = f.bytesSync();
    if (b.length < 4) return false;
    // Only JPEG carries a cheap completeness proof: it must END with the EOI
    // marker FF D9. A non-JPEG variant (webp/avif via format=auto) is accepted
    // as-is — for those the atomic rename above is the completeness guarantee.
    const isJpeg = b[0] === 0xff && b[1] === 0xd8;
    if (!isJpeg) return true;
    return b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
  } catch { return false; }
}

// Local file:// URI for a cached loading image, or null if not on disk (or on
// disk but truncated — deleted on sight so the pool re-downloads it).
// Synchronous — safe to call during render to pick the instant backdrop.
export function cachedLoadingImage(filename: string): string | null {
  const f = cacheFile(filename);
  try {
    if (!f || !f.exists) return null;
    if (!isHealthyImageFile(f)) {
      try { f.delete(); } catch {}
      return null;
    }
    return f.uri;
  } catch { return null; }
}

async function downloadIfMissing(filename: string): Promise<void> {
  const f = cacheFile(filename);
  if (!f) return;
  try {
    if (f.exists) {
      if (isHealthyImageFile(f)) return;
      // Poisoned partial from an interrupted session — replace it.
      try { f.delete(); } catch {}
    }
    const parent = f.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
    // Download to a TEMP name and publish by rename. downloadFileAsync writes
    // straight into its target, so a mid-stream kill used to leave a partial
    // file under the REAL name — permanently trusted by the exists check.
    // The .part name is never read by anyone and pruneExcept sweeps strays.
    const tmp = cacheFile(`${filename}.part`);
    if (!tmp) return;
    try { if (tmp.exists) tmp.delete(); } catch {}
    const raw = loadingImageUrl(filename);
    // Prefer a Cloudflare screen-width variant (~100-200 KB) over the multi-MB
    // original — a loading screen shouldn't pull a 6 MB photo. If Image
    // Transformations aren't enabled on the zone, that URL errors, so fall back
    // to the raw original. Either way we end up with a usable cached file.
    const sized = cfImage(raw, SCREEN_W);
    try {
      await File.downloadFileAsync(sized, tmp);
    } catch {
      // A failed first attempt can leave a partial temp → delete before the
      // raw retry so downloadFileAsync doesn't throw on an existing target.
      try { if (tmp.exists) tmp.delete(); } catch {}
      if (sized !== raw) await File.downloadFileAsync(raw, tmp);
    }
    if (!isHealthyImageFile(tmp)) {
      try { tmp.delete(); } catch {}
      return;                          // next warm-up retries from scratch
    }
    tmp.move(f);                       // atomic publish — complete files only
  } catch { /* offline / not uploaded yet → fallback image is used */ }
}

// Keep only the given filenames cached; delete the rest (pool stays small).
function pruneExcept(keep: Set<string>): void {
  try {
    const dir = cacheDir();
    if (!dir || !dir.exists) return;
    for (const entry of dir.list()) {
      if (entry instanceof File && !keep.has(entry.name)) {
        try { entry.delete(); } catch {}
      }
    }
  } catch {}
}

// Background warm-up: cache THIS launch's image + the NEXT one, then prune any
// older cached images. Fire-and-forget; never blocks the UI. After it finishes
// the pool holds exactly the current + next image.
export async function warmLoadingPool(rot: number): Promise<void> {
  const cur = imageFileFor(rot);
  const next = imageFileFor(rot + 1);
  await downloadIfMissing(cur);
  await downloadIfMissing(next);
  pruneExcept(new Set([cur, next]));
}
