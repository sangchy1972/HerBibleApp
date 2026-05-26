import type { ImageSourcePropType } from 'react-native';

// Per-badge PNG overrides. When an entry exists for a badge id, BadgeIcon
// renders that PNG; otherwise it renders the per-rarity gradient medallion
// fallback (see RARITY in components/BadgeIcon.tsx).
//
// **v1 decision (2026-05): ship without per-badge PNGs.** The gradient
// medallions (two-stop filled body + highlight arc + white Feather glyph
// + soft drop shadow) were redesigned to read as intentional art, not a
// "missing image" placeholder, so every tier looks finished even with
// this map empty. Per-rarity palette communicates value progression
// (sand→caramel / sky→ocean / lilac→plum / gold→bronze) and the Feather
// glyph carries each badge's identity. Bespoke per-badge art can be
// layered in post-launch by populating this map — no BadgeIcon changes
// needed; the PNG branch automatically takes over per id.
export const BADGE_IMAGES: Record<string, ImageSourcePropType> = {};
