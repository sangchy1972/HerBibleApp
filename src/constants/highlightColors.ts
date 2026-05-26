// Shared highlight-color palette. Single source of truth — any UI that
// renders a highlight swatch (BibleScreen verse toolbar, PlanDayWalk
// verse-popup, ProfileScreen highlights list) imports this list so
// adding a sixth color OR re-tinting an existing one is one-file work.
//
// Each entry carries:
//   • `name`  — id stored on the highlight record + saved to AsyncStorage
//               via HighlightsContext; must stay stable across releases.
//   • `bg`    — translucent fill painted behind the verse number + text.
//   • `dot`   — opaque circle rendered in the color-picker row.

export interface HighlightColor {
  name: string;
  bg: string;
  dot: string;
}

export const HL_COLORS: HighlightColor[] = [
  { name: 'rose',  bg: 'rgba(245,194,213,0.55)', dot: '#F5C2D5' },
  { name: 'lav',   bg: 'rgba(203,192,232,0.55)', dot: '#CBC0E8' },
  { name: 'amber', bg: 'rgba(244,221,158,0.55)', dot: '#F4DD9E' },
  { name: 'sage',  bg: 'rgba(186,224,198,0.55)', dot: '#BAE0C6' },
  { name: 'sky',   bg: 'rgba(184,210,238,0.55)', dot: '#B8D2EE' },
];

// Convenience lookup — pass the persisted color name, get back the full
// HighlightColor record (or undefined if the name's been retired).
const BY_NAME = new Map(HL_COLORS.map(c => [c.name, c]));
export function getHighlightColor(name: string | undefined | null): HighlightColor | undefined {
  if (!name) return undefined;
  return BY_NAME.get(name);
}
