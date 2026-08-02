// The puzzle artworks — one painting per 4 completed quiz sets.
//
// PLACEHOLDER ART. Every entry currently has `url: null`, which makes
// PuzzleArt render a bundled vector composition instead of an image. When real
// artwork is commissioned, set `url` to a CDN path
// (covers.everlandapps.com/v1/quiz-art/...) and the renderer switches over with
// no other change — the registry shape, the ids, and the tile maths all stay.
//
// ⚠️ ORDER IS DURABLE. `puzzleView` addresses these by INDEX derived from
// completedSets, so a user who has finished painting 2 will see whatever sits
// at index 2 forever. APPEND new artwork; never reorder or delete, or you
// silently rewrite what people have already collected.
//
// The palettes live here rather than in theme.ts on purpose: these are content
// (a picture's colours), not UI chrome. CLAUDE.md's "never hardcode colors"
// rule is about the interface, and src/constants/ is where this repo keeps
// static content.

export type ArtMotif = 'lily' | 'dove' | 'lamp' | 'vine' | 'crown' | 'sunrise';

export interface QuizArtwork {
  /** Stable id — used for keys and analytics. Never reuse one. */
  id: string;
  /** i18n key for the caption in the collection. */
  titleKey: string;
  motif: ArtMotif;
  /** Background wash, top → bottom. */
  bg: [string, string];
  /** Line colour of the motif. */
  ink: string;
  /** Real artwork, once it exists. null = draw the vector placeholder. */
  url: string | null;
}

export const QUIZ_ART: readonly QuizArtwork[] = [
  { id: 'lily',    titleKey: 'quiz.art.lily',    motif: 'lily',    bg: ['#FBEFF3', '#F3DCE5'], ink: '#C4708D', url: null },
  { id: 'dove',    titleKey: 'quiz.art.dove',    motif: 'dove',    bg: ['#EFF1FA', '#DFE2F4'], ink: '#7C79B8', url: null },
  { id: 'lamp',    titleKey: 'quiz.art.lamp',    motif: 'lamp',    bg: ['#FCF4E9', '#F6E5CE'], ink: '#C79556', url: null },
  { id: 'vine',    titleKey: 'quiz.art.vine',    motif: 'vine',    bg: ['#EDF5EF', '#DCEBE0'], ink: '#6E9E7A', url: null },
  { id: 'crown',   titleKey: 'quiz.art.crown',   motif: 'crown',   bg: ['#F7F0FA', '#EADFF3'], ink: '#9273B5', url: null },
  { id: 'sunrise', titleKey: 'quiz.art.sunrise', motif: 'sunrise', bg: ['#FDF1EC', '#F8DED2'], ink: '#D0805F', url: null },
];

/** How many paintings exist. Fed to puzzleView, which CLAMPS to it. */
export const QUIZ_ART_COUNT = QUIZ_ART.length;

/** Never throws and never returns undefined — a reward screen is the last place
 *  an out-of-range index should be allowed to land. */
export function artworkAt(index: number): QuizArtwork {
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  return QUIZ_ART[Math.max(0, Math.min(i, QUIZ_ART.length - 1))];
}
