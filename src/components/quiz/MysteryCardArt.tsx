import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FONTS } from '../../constants/theme';
import Logo from '../shared/Logo';
import { CARD_SATIN, CARD_CREAM } from './MysteryCardFace';

// The shareable image for a mystery card.
//
// Rendered off-screen and captured with captureRef, exactly like VerseCardArt
// and BadgeCardArt. Every size is derived from `width` so one component serves
// both the tiny on-screen preview and the full-resolution capture.
//
// TWO LAYERS, ON PURPOSE
// ======================
// The card face alone is cream — nearly white — so a bare screenshot floats on
// whatever the recipient's chat background happens to be and reads as a
// screenshot rather than as a card. The satin frame plus a drop shadow and a
// hairline white rim gives it the two levels of depth that make it read as an
// object sitting on paper. Shadow alone looks dirty; rim alone looks flat.
//
// NO SCRIPTURE REFERENCE
// ======================
// Deliberate, and the same rule as the in-app card: the words are ours, not the
// passage's, and printing a citation under them would claim they ARE that verse.
// The `ref` on the card model is internal provenance and is never rendered.
//
// The HER BIBLE wordmark sits INSIDE the cream card rather than on the frame, so
// it survives anyone who crops the border off.

/** Capture size. 1080 is the width every social target downscales from. */
export const CARD_SHARE_WIDTH = 1080;

export default function MysteryCardArt({
  body, width = CARD_SHARE_WIDTH,
}: {
  body: string;
  width?: number;
}) {
  // Everything scales off the design width so the captured image is identical
  // to the preview, just larger.
  const k = width / 330;
  const px = (n: number) => Math.round(n * k);

  const font = px(13.4);

  return (
    <LinearGradient
      colors={CARD_SATIN}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ width, padding: px(15), borderRadius: px(16) }}
    >
      <View
        style={[
          styles.card,
          {
            borderRadius: px(12),
            paddingTop: px(32),
            paddingHorizontal: px(24),
            paddingBottom: px(18),
            // iOS shadow + Android elevation. The 1px white rim is a border
            // rather than a second shadow because Android cannot stack two.
            shadowRadius: px(11),
            shadowOffset: { width: 0, height: px(3) },
            borderWidth: Math.max(1, px(0.6)),
          },
        ]}
      >
        <Text
          style={[styles.body, { fontSize: font, lineHeight: Math.round(font * 1.8) }]}
          allowFontScaling={false}
        >
          {`“${body}”`}
        </Text>

        <View style={[styles.brand, { marginTop: px(24), gap: px(8) }]}>
          <Logo size={px(19)} />
          <Text style={[styles.wordmark, { fontSize: px(11.5) }]} allowFontScaling={false}>
            HER BIBLE
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_CREAM,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    elevation: 6,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  body: {
    fontFamily: FONTS.merriweather,
    color: '#1E1B2E',
    textAlign: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // Matches VerseCardArt's brand row exactly — Lora at weight 600 (per the
  // project rule, loraBold with '700' silently falls back to system sans on
  // Android) and the same muted plum.
  wordmark: {
    fontFamily: FONTS.loraBold,
    fontWeight: '600',
    color: 'rgba(58,37,72,0.78)',
    letterSpacing: 0.6,
  },
});
