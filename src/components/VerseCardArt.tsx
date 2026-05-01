import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { ROSE, LAV, FONTS } from '../constants/theme';

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
}

export default function VerseCardArt({ format, reference, text, width }: Props) {
  const meta = VERSE_FORMATS[format];
  const height = (width * meta.h) / meta.w;
  const scale = width / meta.w;        // 1 when rendering full-size, < 1 for previews

  const verseFont = Math.round(54 * scale);
  const refFont = Math.round(34 * scale);
  const brandFont = Math.round(22 * scale);
  const padX = Math.round(96 * scale);

  return (
    <View style={[styles.canvas, { width, height }]}>
      <LinearGradient
        colors={['#F9D6E2', '#E9C9F0', '#C9B7F4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Soft decorative blob behind the text */}
      <View style={[styles.blob, { width: width * 1.4, height: width * 1.4, top: -width * 0.3, right: -width * 0.5 }]} />

      <View style={[styles.body, { paddingHorizontal: padX }]}>
        <FlowerMark size={Math.round(64 * scale)} />
        <Text
          style={[styles.verse, { fontSize: verseFont, lineHeight: Math.round(verseFont * 1.36), marginTop: Math.round(36 * scale) }]}
          numberOfLines={format === 'square' ? 6 : format === 'portrait' ? 9 : 12}
        >
          “{text}”
        </Text>
        <Text style={[styles.ref, { fontSize: refFont, marginTop: Math.round(36 * scale) }]}>
          {reference}
        </Text>
      </View>

      <Text style={[styles.brand, { fontSize: brandFont, bottom: Math.round(56 * scale) }]}>
        Her Bible
      </Text>
    </View>
  );
}

function FlowerMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M32 6 C36 18, 46 22, 58 22 C46 26, 42 36, 38 50 C34 38, 26 32, 6 32 C26 28, 32 18, 32 6 Z"
        fill={ROSE}
        opacity={0.85}
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
    color: '#3A2548',
    fontWeight: '500',
    textAlign: 'center',
  },
  ref: {
    color: LAV,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  brand: {
    position: 'absolute',
    color: 'rgba(58,37,72,0.55)',
    fontWeight: '700',
    letterSpacing: 1.6,
  },
});
