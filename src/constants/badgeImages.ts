import type { ImageSourcePropType } from 'react-native';

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
