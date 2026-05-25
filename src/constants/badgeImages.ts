import type { ImageSourcePropType } from 'react-native';

// Originally a map of badge id → require()'d PNG (44 entries). The PNG
// files lived in `assets/badges/` and were lost when a worktree was
// deleted (never committed). Per the original file's own comment:
//
//   "Optional PNG override per badge id... BadgeIcon render[s] the image
//   instead of the Feather-icon placeholder."
//
// So leaving the map empty is the documented graceful path — every badge
// falls back to its Feather-icon placeholder until the PNG inventory is
// restored.
export const BADGE_IMAGES: Record<string, ImageSourcePropType> = {};
