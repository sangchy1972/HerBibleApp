import React from 'react';
import { View, Text, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FONTS } from '../../constants/theme';
import Logo from '../shared/Logo';
import { CARD_SATIN, CARD_CREAM } from './MysteryCardFace';

// The shareable image for a completed painting.
//
// Same frame as MysteryCardArt so the two reward types read as one family: rose
// satin border, cream mount, drop shadow plus a hairline rim, HER BIBLE inside
// the mount so it survives a crop.
//
// The painting is shown WHOLE and unseamed. The jigsaw is how she earned it,
// not what it is — a picture with visible cut lines shared out of the app looks
// broken to everyone who did not play.
//
// Title and artist are printed because these are real works by real people, and
// because they are the reward: she collected a Caravaggio, not a texture.

export const PAINTING_SHARE_WIDTH = 1080;

export default function PaintingShareArt({
  source, aspect, title, artist, year, width = PAINTING_SHARE_WIDTH,
}: {
  /** A source, not a URL: painting one is a bundled require(), the rest are URIs. */
  source: ImageSourcePropType;
  aspect: number;
  title: string;
  artist: string;
  year: string;
  width?: number;
}) {
  const k = width / 330;
  const px = (n: number) => Math.round(n * k);
  const inner = width - px(15) * 2 - px(18) * 2;
  const imgH = Math.round(inner / (aspect || 1));

  return (
    <LinearGradient
      colors={CARD_SATIN}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ width, padding: px(15), borderRadius: px(16) }}
    >
      <View
        style={[
          styles.mount,
          {
            borderRadius: px(12),
            padding: px(18),
            shadowRadius: px(11),
            shadowOffset: { width: 0, height: px(3) },
            borderWidth: Math.max(1, px(0.6)),
          },
        ]}
      >
        <Image
          source={source}
          style={{ width: inner, height: imgH, borderRadius: px(4) }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />

        <Text style={[styles.title, { fontSize: px(13), marginTop: px(14) }]} allowFontScaling={false} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.artist, { fontSize: px(10.5), marginTop: px(4) }]} allowFontScaling={false} numberOfLines={1}>
          {year ? `${artist} · ${year}` : artist}
        </Text>

        <View style={[styles.brand, { marginTop: px(16), gap: px(8) }]}>
          <Logo size={px(17)} />
          <Text style={[styles.wordmark, { fontSize: px(10.5) }]} allowFontScaling={false}>
            HER BIBLE
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  mount: {
    backgroundColor: CARD_CREAM,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    elevation: 6,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  title: {
    fontFamily: FONTS.loraBold, fontWeight: '600',
    color: '#1E1B2E', textAlign: 'center', letterSpacing: 0.2,
  },
  artist: { fontFamily: FONTS.lato, color: 'rgba(30,27,46,0.55)', textAlign: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // Matches VerseCardArt exactly — Lora at weight 600 (paired with '700' it
  // silently falls back to system sans on Android) and the same muted plum.
  wordmark: {
    fontFamily: FONTS.loraBold, fontWeight: '600',
    color: 'rgba(58,37,72,0.78)', letterSpacing: 0.6,
  },
});
