// Achievement badge art — CDN location + naming rule.
//
// **The APK ships WITHOUT any badge PNGs.** On first visit to the
// Achievement screen the client pulls every badge from this public R2 path
// into a local cache (see services/badgeImageService.ts), then renders from
// disk forever after (offline-safe). Until a badge's bytes land, BadgeIcon
// shows the per-rarity gradient medallion placeholder.
//
// Hosted on the same public R2 bucket as plan covers
// (covers.everlandapps.com), under a path-versioned `/v1/badges` prefix.
// Re-art pass → bump the version segment (v1 → v2) to cache-bust every file
// at once (per project rule: path-version, never per-file SHAs).
export const BADGE_CDN_BASE = 'https://covers.everlandapps.com/v1/badges';

// The hourglass-365 artwork was uploaded under the Devoted Learner filename
// by mistake (user-confirmed 2026-06-07), and A Full Year's filename carries
// the other art. Swap the two at the URL/cache-key level so each badge shows
// its intended art WITHOUT touching the bucket. Bonus: devices that already
// cached the hourglass under 'plan-speed10in30.png' instantly show it for
// A Full Year, since the cache is keyed by this same filename.
// (If the two objects ever get renamed properly on R2, delete this map.)
const FILE_REMAP: Record<string, string> = {
  'milestone.fullYear': 'plan-speed10in30.png',
  'plan.speed10in30': 'milestone-fullYear.png',
};

// Filename for a badge id: lowercase the dots away so the on-disk / on-CDN
// name is filesystem- and URL-clean. The achievement id is the source of
// truth; the `.`→`-` swap is purely cosmetic.
//   'prayer.first'      → 'prayer-first.png'
//   'scripture.read25'  → 'scripture-read25.png'
//   'milestone.crown'   → 'milestone-crown.png'
export function badgeFileName(id: string): string {
  return FILE_REMAP[id] ?? `${id.replace(/\./g, '-')}.png`;
}

export function badgeUrl(id: string): string {
  return `${BADGE_CDN_BASE}/${badgeFileName(id)}`;
}
