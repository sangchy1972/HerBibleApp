export const ROSE = '#E63F69';
export const LAV = '#866BC0';
export const TXT = '#1E1B2E';
export const TXTSUB = 'rgba(30,27,46,0.50)';
export const BG = '#FBF7F6';
// The app's "done" green. Was hardcoded in five places (plan covers' check
// badge, FeaturedPlanDetail, three spots in ProfileScreen) before being given a
// name; the quiz's correct-answer state is the sixth consumer and the reason it
// finally got one. CLAUDE.md: never hardcode colors.
export const GREEN_DONE = '#7DB87D';
// Canonical app screen background. Pinned to React Navigation v7's default
// scene colour (rgb(242,242,242)) — the exact neutral grey the Prayer / Plan /
// Profile tabs already render — and fed into both the NavigationContainer theme
// (App.tsx) and the Bible reader's "default" theme so every screen shares one
// color code. (The reader previously used a warm #F0EEEB that read yellowish
// next to these.)
export const SCREEN_BG = '#F2F2F2';
export const P = 17; // horizontal padding
// Canonical corner radius for solid-accent CTA buttons (matches the Prayer
// home's "Start Morning Prayer" button). Every rose primary button uses this
// so the app reads as one system; heights may still vary per context.
export const BTN_RADIUS = 17;

// `serif*` aliases all map to **Source Serif 4 Variable** — the same
// TTF file is used for every weight, with the actual weight controlled
// at runtime via `fontVariationSettings` (see `serifVariation` below).
// Italic uses the companion Italic VF.
//
// The variable font carries TWO axes:
//   • opsz (8 → 60) — optical size: shape adapts for small/large rendering.
//                     Default 14 = body-text master.
//   • wght (200 → 900) — weight, default 400.
//
// Without explicit `fontVariationSettings`, the font renders at its
// default instance (opsz 14, wght 400) which is already the body-text
// master — fixes the "扁/flat" look of the static Regular variant.
export const FONTS = {
  serif:          'SourceSerif4Variable-Roman',
  serifMedium:    'SourceSerif4Variable-Roman',
  serifSemiBold:  'SourceSerif4Variable-Roman',
  serifItalic:    'SourceSerif4Variable-Italic',
  // Noto Sans SC (CJK) ships ONE ~10 MB file PER weight (≈40 MB for four
  // weights). We DON'T bundle it at all: Chinese glyphs fall back to the
  // device's system CJK font (Noto Sans CJK on Android, PingFang on iOS, present
  // on virtually every device), which is also what the Bible reader already uses
  // since its body faces (Merriweather / Source Serif) are Latin-only. The
  // `sans*` families therefore point at Lato (a bundled Latin sans) so Latin
  // characters stay on-brand while CJK uses the system fallback. Saves ~40 MB.
  sans:           'Lato_400Regular',
  sansMedium:     'Lato_400Regular',
  sansSemiBold:   'Lato_700Bold',
  sansBold:       'Lato_700Bold',
  inter:          'Inter_400Regular',
  // Merriweather — slab-influenced serif optimized for on-screen reading;
  // used as the default body font in the Bible reader.
  merriweather:     'Merriweather_400Regular',
  merriweatherBold: 'Merriweather_700Bold',
  // Lato — Latin-friendly humanist sans used in tab labels, badges,
  // counters, and CTA captions. Pairs with Source Serif 4 in headers.
  lato:           'Lato_400Regular',
  latoBold:       'Lato_700Bold',
  // Lora — display serif used in section headers and decorative captions.
  // IMPORTANT: per project memory, `FONTS.loraBold` must pair with
  // `fontWeight: '600'` (not '700'), otherwise Android drops Lora and
  // falls back to system sans. The font FAMILY is `Lora_700Bold` (the
  // 600 SemiBold cut doesn't exist on Google Fonts); the '600' weight is
  // applied at the *style* level on consumers.
  lora:           'Lora_400Regular',
  loraBold:       'Lora_700Bold',
};

// `fontVariationSettings` payload for Source Serif 4 Variable. Use on
// any style that targets `FONTS.serif` to lock in a specific opsz / wght.
//
// Concrete pairings used in the app:
//   • Body text (verses, paragraphs, prayer body):
//       SERIF_BODY  → opsz 14, wght 400  (default body master, sturdy + open)
//   • Headings / hero text (page titles, share card):
//       SERIF_HEADING → opsz 24, wght 600 (Subhead master, slightly delicate)
//
// For dynamic font sizes (e.g. the Bible reader's 16-30 pt slider) call
// `serifVariation(fontSize)` so the opsz axis tracks the rendered size.
// We bias opsz ~70 % of the rendered size — Adobe's masters are slightly
// fragile when opsz === fontSize on retina screens; nudging Caption-ward
// keeps letterforms upright at body sizes (clamped to the axis's 8-60 range).
export function serifVariation(fontSize = 18, weight = 400) {
  const opsz = Math.max(8, Math.min(60, Math.round(fontSize * 0.7)));
  return [
    { axis: 'opsz', value: opsz },
    { axis: 'wght', value: weight },
  ];
}

// Body text — explicit Subhead-ish opsz (35) at Regular weight (400).
// Picked deliberately rather than via `serifVariation(fontSize)` so the
// shape stays consistent across the Bible reader's user-adjustable size
// slider and all plan/prayer body styles.
export const SERIF_BODY: ReadonlyArray<{ axis: string; value: number }> = [
  { axis: 'opsz', value: 35 },
  { axis: 'wght', value: 400 },
];
export const SERIF_HEADING = serifVariation(34, 600);   // opsz 24, wght 600
