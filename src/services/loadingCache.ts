import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import { LOADING_IMAGE_FILES, loadingImageUrl } from '../constants/loadingImages';
import { LOADING_LINES_COUNT } from '../constants/loadingContent';

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

// Local file:// URI for a cached loading image, or null if not on disk.
// Synchronous — safe to call during render to pick the instant backdrop.
export function cachedLoadingImage(filename: string): string | null {
  const f = cacheFile(filename);
  try { return f && f.exists ? f.uri : null; } catch { return null; }
}

async function downloadIfMissing(filename: string): Promise<void> {
  const f = cacheFile(filename);
  if (!f) return;
  try {
    if (f.exists) return;
    const parent = f.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
    await File.downloadFileAsync(loadingImageUrl(filename), f);
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
