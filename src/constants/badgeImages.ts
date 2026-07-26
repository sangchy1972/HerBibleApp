import type { ImageSourcePropType } from 'react-native';

/**
 * Badges reachable in a SINGLE user action, cheapest-to-reach first.
 *
 * Everything else in ACHIEVEMENTS needs a streak, a cumulative count, or a
 * finished plan — days of use at minimum. These six are the only ones that can
 * fire on a brand-new install, which makes them the only ones whose art can be
 * demanded before the CDN prefetch has had time to run.
 *
 * Used to order the prefetch queue (state/BadgesContext) so the art that might
 * be needed within minutes is not stuck behind ~70 downloads that cannot be.
 *
 * Ranked by how the app actually funnels a new user:
 *   prayer.first     — first Amen. The home screen's primary CTA; onboarding
 *                      leads straight into it. Effectively everyone's first.
 *   scripture.first  — fires automatically after 5 min on the Bible tab (or the
 *                      explicit Mark-as-Complete), and Bible is a main tab.
 *   note/highlight   — need the verse toolbar, so a level deeper.
 *   share1           — needs a share.
 *   plan.first       — needs a WHOLE plan finished; days away, listed last.
 */
export const EARLY_BADGE_IDS: readonly string[] = [
  'prayer.first',
  'scripture.first',
  'note.first',
  'highlight.first',
  'milestone.share1',
  'plan.first',
];

// BUNDLED per-badge PNG overrides — normally EMPTY.
//
// Badge art is NOT shipped in the binary. It's pulled from the CDN on first
// visit to the Achievement screen and cached on disk (see
// state/BadgesContext.tsx + services/badgeImageService.ts); BadgeIcon reads
// the cached file via useBadges(). Until art lands (or if offline / before
// it's deployed), BadgeIcon renders the per-rarity gradient medallion
// placeholder (two-stop body + highlight arc + white Feather glyph + soft
// shadow) — every tier looks finished even with no PNG.
//
// This map is the highest-priority source: to bundle a specific badge in the
// app binary (e.g. a hero badge that must show instantly offline before any
// download), add `id → require(...)` here and it wins over the CDN copy.
// Left empty by design.
export const BADGE_IMAGES: Record<string, ImageSourcePropType> = {};
