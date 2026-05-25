// Plan-cover thumbnail. Renders the WebP at `covers.everlandapps.com/v1/
// covers/<slug>.webp` over a gradient (colorPrimary → colorSecondary) that
// serves as the loading + 404 fallback. The image sits on top of the
// gradient with the same dimensions, so a successful load hides the
// gradient; a missing or still-loading image keeps the gradient visible
// and the layout stable.
import React from 'react';
import { View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ROSE, LAV } from '../constants/theme';
import { PLAN_COVER_CDN_BASE } from '../constants/plansApi';

// Accept either the legacy bundled shape (`cover: string`) or the new
// CDN-summary shape (`cover: PlanCover` object).
type CoverShape =
  | string
  | { color_primary?: string; color_secondary?: string; image_url?: string | null }
  | null
  | undefined;

interface Props {
  /** Optional cover record (bundled summary uses string; CDN summary uses object). */
  cover?: CoverShape;
  /** Plan slug — used to compose the CDN image URL when `cover.image_url` is absent. */
  slug?: string;
  /** Optional explicit gradient pair. Falls back to (cover.color_primary, cover.color_secondary), then (ROSE, LAV). */
  gradient?: [string, string];
  width: number;
  height: number;
  radius: number;
}

function PlanCoverImpl({ cover, slug, gradient, width, height, radius }: Props) {
  const gradColors: [string, string] = gradient
    ?? (typeof cover === 'object' && cover?.color_primary && cover?.color_secondary
      ? [cover.color_primary, cover.color_secondary]
      : [ROSE, LAV]);

  const uri =
    (typeof cover === 'object' && cover?.image_url)
      ? cover.image_url
      : slug
        ? `${PLAN_COVER_CDN_BASE}/${slug}.webp`
        : null;

  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden' }}>
      <LinearGradient
        colors={gradColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, width, height }}
      />
      {uri ? (
        <Image source={{ uri }} style={{ width, height }} resizeMode="cover" />
      ) : null}
    </View>
  );
}

// React.memo with a strict prop comparator. PlanCover renders inside list
// rows; without memoization, every parent re-render (e.g. someone scrolling
// nearby, lang change, theme change) rebuilds 30+ LinearGradient + Image
// trees synchronously, which is one of the bigger sources of frame drops
// during transitions to PlanCategoryScreen.
export default React.memo(PlanCoverImpl, (prev, next) => (
  prev.slug === next.slug
  && prev.width === next.width
  && prev.height === next.height
  && prev.radius === next.radius
  && prev.gradient?.[0] === next.gradient?.[0]
  && prev.gradient?.[1] === next.gradient?.[1]
  // Cover object identity is stable per-plan in the bundled summary, so
  // reference equality is sufficient. A new identity means the underlying
  // plan changed → re-render.
  && prev.cover === next.cover
));
