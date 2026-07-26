import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { ACHIEVEMENTS } from '../constants/achievements';
import { BADGE_IMAGES, EARLY_BADGE_IDS } from '../constants/badgeImages';
import { cachedBadgeUri, downloadBadge } from '../services/badgeImageService';

// Badge-art availability layer.
//
// Holds no image bytes itself — it tracks which badge PNGs are already cached
// on disk and kicks off a one-time background prefetch of the rest from the
// CDN. `prefetchAll()` is called when the Achievement screen first mounts
// ("first login to that screen"); each file that lands bumps a version so the
// BadgeIcon instances re-read the cache and swap their medallion placeholder
// for the real art. Cheap: synchronous disk checks + a single sequential
// download pass guarded against re-entry.
interface BadgesState {
  /** Local `file://` URI for a badge, or null if not yet cached. */
  badgeUri: (id: string) => string | null;
  /** Pull every not-yet-cached badge from the CDN (runs once per app launch). */
  prefetchAll: () => void;
}

const Ctx = createContext<BadgesState | null>(null);

/**
 * Prefetch order: the badges that can unlock on a fresh install first.
 *
 * The pass is sequential and HEAD-guards every file, so on a weak connection it
 * can take minutes to walk all ~72. In array order the art for a badge the user
 * might earn in the first five minutes sat behind dozens of downloads for
 * badges that need weeks of streaks — so the unlock screen showed the gradient
 * placeholder instead of the real art (user-reported on device).
 */
function downloadOrder(): typeof ACHIEVEMENTS {
  const rank = new Map(EARLY_BADGE_IDS.map((id, i) => [id, i]));
  const early = EARLY_BADGE_IDS
    .map(id => ACHIEVEMENTS.find(a => a.id === id))
    .filter((a): a is typeof ACHIEVEMENTS[number] => !!a);
  const rest = ACHIEVEMENTS.filter(a => !rank.has(a.id));
  return [...early, ...rest];
}

export function BadgesProvider({ children }: { children: React.ReactNode }) {
  // Bumped each time a badge finishes downloading → new context value → every
  // BadgeIcon re-renders and re-reads cachedBadgeUri for its id.
  const [version, setVersion] = useState(0);
  const startedRef = useRef(false);

  const prefetchAll = useCallback(() => {
    if (startedRef.current) return;          // once per launch
    startedRef.current = true;
    (async () => {
      let landed = 0;
      for (const a of downloadOrder()) {
        if (BADGE_IMAGES[a.id]) continue;      // bundled in the binary already
        if (cachedBadgeUri(a.id)) continue;    // already on disk
        const ok = await downloadBadge(a.id);  // best-effort; 404/offline → false
        // Re-render every few that land so badges appear progressively instead
        // of all-at-once only after the full 72-item pass finishes (which a
        // user might leave before — the files cache regardless, but this makes
        // them show THIS session too).
        if (ok && ++landed % 4 === 0) setVersion(v => v + 1);
      }
      if (landed > 0) setVersion(v => v + 1);  // final re-render for the remainder
    })();
  }, []);

  const value = useMemo<BadgesState>(
    () => ({ badgeUri: (id) => cachedBadgeUri(id), prefetchAll }),
    // version in deps so a completed prefetch produces a fresh value object
    // and consumers re-render with the now-cached URIs.
    [prefetchAll, version],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Safe outside a provider (returns inert defaults) so BadgeIcon never crashes
// if rendered before the tree is wired — it simply shows the medallion.
export function useBadges(): BadgesState {
  return useContext(Ctx) ?? { badgeUri: () => null, prefetchAll: () => {} };
}
