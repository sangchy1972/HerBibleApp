import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { ROSE, TXT, FONTS } from '../../constants/theme';

// The two faces of a mystery card, and the typewriter that reveals the front.
//
// Split out of the overlay because the collection and the share image render
// the same front with no animation — one source of truth for what a card looks
// like, so a padding tweak can't make the shared image disagree with the app.

/** Satin back: ROSE in the middle, lifted above and deepened below, plus a
 *  diagonal sheen band. Flat pink read as a placeholder; the gradient is what
 *  makes it look like something worth turning over. */
export const CARD_SATIN: readonly [string, string, string] = ['#F4587E', ROSE, '#C0325A'];
export const CARD_CREAM = '#FFFCF8';
export const CARD_RADIUS = 16;

/** Fixed, never scaled by the OS font setting. The card is a fixed-size object
 *  and an accessibility bump would push the text out of it. 14.1 is the quiz's
 *  +8% scale over a 13.05 base, NOT a fraction of the reader's 18. */
export const CARD_FONT = 14.1;

export function MysteryCardBack({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={CARD_SATIN}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.face, styles.back, style]}
    >
      {/* Sheen. pointerEvents none so it can never eat the tap that picks the card. */}
      <View pointerEvents="none" style={styles.sheen} />
      <Svg width={54} height={54} viewBox="0 0 64 64">
        <Path
          d="M32 6 C36 18, 46 22, 58 22 C46 26, 42 36, 38 50 C34 38, 26 32, 6 32 C26 28, 32 18, 32 6 Z"
          fill="#FFFFFF"
        />
      </Svg>
    </LinearGradient>
  );
}

/**
 * The written side. `typing` runs the reveal; `false` renders it complete.
 *
 * Quotation marks are part of the design — she is being quoted something said
 * to her, and without them the sentence reads as app copy.
 */
export function MysteryCardFront({
  body, typing = false, onTypingDone, inline = false, style,
}: {
  body: string;
  typing?: boolean;
  onTypingDone?: () => void;
  /**
   * `false` (default) is a card FACE: absolutely filling a parent whose size is
   * animated by the draw overlay. `true` sizes itself to the text — used by the
   * collection detail, where the card has to grow with a 30- to 46-word body
   * rather than clip the long ones or leave the short ones swimming.
   */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const quoted = useMemo(() => `“${body}”`, [body]);
  const shown = useTypewriter(quoted, typing, onTypingDone);

  return (
    <View style={[inline ? styles.faceInline : styles.face, styles.front, style]}>
      {/* The FULL text is always laid out, transparent, and the visible copy is
          absolutely positioned over it — the wrapper takes its size from the
          ghost, so the overlay lands on exactly the same box.

          A growing substring instead would reflow the centred block on every
          new line and the text would visibly jump. That reads as a rendering
          bug, not as typing. */}
      <View>
        <Text style={[styles.body, styles.ghost]} allowFontScaling={false}>
          {quoted}
        </Text>
        <Text
          style={[styles.body, styles.overlayText]}
          allowFontScaling={false}
          accessibilityLabel={quoted}
        >
          {shown}
        </Text>
      </View>
    </View>
  );
}

/**
 * Reveals `text` one character at a time.
 *
 * Total duration is CLAMPED to 3.0-3.6s regardless of length. At a fixed
 * per-character speed the shortest card takes ~3.4s and the longest ~5.9s —
 * what she notices is how long she waited, not how fast the letters appeared.
 */
export function useTypewriter(text: string, active: boolean, onDone?: () => void) {
  const [n, setN] = useState(active ? 0 : text.length);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!active) { setN(text.length); return; }
    setN(0);
    const total = Math.min(3600, Math.max(3000, text.length * 24));
    const per = total / Math.max(1, text.length);
    let i = 0;
    const h = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) {
        clearInterval(h);
        doneRef.current?.();
      }
    }, per);
    return () => clearInterval(h);
  }, [text, active]);

  return text.slice(0, n);
}

const styles = StyleSheet.create({
  face: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    // No border on either face — an outline made the card read as a UI panel
    // rather than as an object.
    backfaceVisibility: 'hidden',
  },
  /** Same box as `face` minus the absolute fill, so the card grows with its
   *  text instead of being sized by an animated parent. */
  faceInline: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  back: { alignItems: 'center', justifyContent: 'center' },
  sheen: {
    position: 'absolute',
    top: '-30%', left: '-10%', width: '60%', height: '170%',
    transform: [{ rotate: '18deg' }],
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  front: {
    backgroundColor: CARD_CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 34,
    paddingHorizontal: 22,
  },
  body: {
    fontFamily: FONTS.merriweather,
    fontSize: CARD_FONT,
    lineHeight: CARD_FONT * 1.8,
    color: TXT,
    textAlign: 'center',
  },
  ghost: { opacity: 0 },
  overlayText: { position: 'absolute', top: 0, left: 0, right: 0 },
});
