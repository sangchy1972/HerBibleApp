import React from 'react';
import { View, Text, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { ROSE, LAV, FONTS, SERIF_BODY } from '../constants/theme';
import Logo from './shared/Logo';

export type VerseFormat = 'square' | 'portrait' | 'story';

export const VERSE_FORMATS: Record<VerseFormat, { label: string; w: number; h: number; ratio: string }> = {
  square:   { label: 'Square',   w: 1080, h: 1080, ratio: '1:1' },
  portrait: { label: 'Portrait', w: 1080, h: 1620, ratio: '2:3' },
  story:    { label: 'Story',    w: 1080, h: 1920, ratio: '9:16' },
};

interface Props {
  format: VerseFormat;
  reference: string;
  text: string;
  width: number;        // render width (in display points); height is derived from ratio
  // Optional photo backdrop — when provided, replaces the default pink/lav
  // gradient placeholder. The caller is responsible for passing the prayer
  // background that was on screen when share was tapped, so the share card
  // matches what the user just saw.
  bgSource?: ImageSourcePropType;
}

export default function VerseCardArt({ format, reference, text, width, bgSource }: Props) {
  const meta = VERSE_FORMATS[format];
  const height = (width * meta.h) / meta.w;
  const scale = width / meta.w;        // 1 when rendering full-size, < 1 for previews

  // Iterative sizing per user. Verse + ref bumped another +25 % on top of
  // the previous +20 % round; bottom "Her Bible" wordmark got its own +40 %
  // (text only — Logo stays anchored to `logoBase` so it doesn't outgrow
  // the brand row visually). `padX` is structural safe-area padding to the
  // canvas edge — kept fixed so the wider text just fills more of the
  // existing safe zone instead of pushing the layout outward.
  // Final per-user sizes (2026-05-21): verse 72 / ref 45 / brand text 45 in
  // Lora 600 / Logo 60. `logoBase` is 60 / 1.6 = 37.5 so the Logo component
  // (size = logoBase × 1.6) renders at exactly 60.
  const verseFont = Math.round(66 * scale);                                     // 72 → 66 (−8 % per user — verse copy was reading slightly oversized on the captured card)
  const refFont = Math.round(41 * scale);                                       // 45 → 41 (−8 %, paired with verse)
  const logoBase = Math.round(37.5 * scale);                                    // × 1.6 → Logo size = 60
  const brandTextFont = Math.round(35 * scale);                                 // brand row not in the user's "card text" scope — keeps its size
  const padX = Math.round(96 * scale);

  return (
    <View style={[styles.canvas, { width, height }]}>
      {bgSource ? (
        <Image source={bgSource} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={['#F9D6E2', '#E9C9F0', '#C9B7F4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {/* Soft decorative blob — only shown over the gradient placeholder
          (it would clash with a real photo backdrop). */}
      {!bgSource && (
        <View style={[styles.blob, { width: width * 1.4, height: width * 1.4, top: -width * 0.3, right: -width * 0.5 }]} />
      )}

      <View style={[styles.body, { paddingHorizontal: padX, paddingBottom: Math.round(160 * scale) }]}>
        <FlowerMark size={Math.round(107.52 * scale)} light={!!bgSource} />{/* 64 → 76.8 → 107.52 (+40 % this round) */}
        <Text
          style={[
            styles.verse,
            bgSource ? styles.verseOnPhoto : null,
            { fontSize: verseFont, lineHeight: Math.round(verseFont * 1.36), marginTop: Math.round(36 * scale) },
          ]}
          numberOfLines={format === 'square' ? 6 : format === 'portrait' ? 9 : 12}
        >
          “{text}”
        </Text>
        <Text style={[styles.ref, bgSource ? styles.refOnPhoto : null, { fontSize: refFont, marginTop: Math.round(36 * scale) }]}>
          {reference}
        </Text>
      </View>

      <View style={[styles.brandRow, { bottom: Math.round(97.4 * scale), gap: Math.round(logoBase * 0.5) }]}>{/* 92.4 → 97.4 — brand row moved up 5 design-px per user */}
        <Logo size={Math.round(logoBase * 1.6)} />
        <Text style={[styles.brand, bgSource ? styles.brandOnPhoto : null, { fontSize: brandTextFont }]}>
          Her Bible
        </Text>
      </View>
    </View>
  );
}

function FlowerMark({ size, light = false }: { size: number; light?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M32 6 C36 18, 46 22, 58 22 C46 26, 42 36, 38 50 C34 38, 26 32, 6 32 C26 28, 32 18, 32 6 Z"
        fill={light ? '#FFFFFF' : ROSE}
        opacity={light ? 0.95 : 0.85}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  canvas: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  body: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  verse: {
    fontFamily: FONTS.serif,
    fontVariationSettings: SERIF_BODY,  // Source Serif 4 VF — body opsz/wght
    color: '#3A2548',
    textAlign: 'center',
  },
  ref: {
    color: LAV,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  // Brand row sits absolute-bottom of the card; logo + "Her Bible" rendered
  // in Lora 600 per user (was Merriweather 700). Per the project memory
  // rule, `FONTS.loraBold` must pair with `fontWeight: '600'` — paired with
  // '700' it silently falls back to system sans on Android.
  brandRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  brand: {
    color: 'rgba(58,37,72,0.78)',
    fontFamily: FONTS.loraBold,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  // Over-photo overrides — pure white verse text + brand label, ROSE
  // reference (kept warm against any sky / sunset photo).
  verseOnPhoto: { color: '#FFFFFF' },
  refOnPhoto: { color: '#FFFFFF', opacity: 0.92 },
  brandOnPhoto: { color: 'rgba(255,255,255,0.95)' },                            // 0.75 → 0.95 — Lora bold needs more contrast over real photos
});
