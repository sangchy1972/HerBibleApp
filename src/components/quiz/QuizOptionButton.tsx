import React from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, GREEN_DONE, TXT, TXTSUB, BTN_RADIUS, FONTS, INK_06, INK_10 } from '../../constants/theme';

// One answer option.
//
// Owns ONLY its visual state — it is handed a state and never decides
// correctness itself. That keeps the grading logic in one place (QuizContext,
// against the resolved question) instead of smeared across the view layer.
//
//   idle      untouched, awaiting a tap
//   correct   the user picked this and it was right
//   wrong     the user picked this and it was wrong
//   tried     picked-and-wrong in an EARLIER round; greyed and inert, so the
//             retry doesn't ask her to rule out the same option twice
//
// THERE IS NO "revealed" STATE. A wrong pick used to tint the right answer green
// immediately, which handed her the answer before the retry round could ask the
// question again — the retry was pointless and the miss taught nothing. The
// answer is now only ever confirmed by her getting it right. Do not add it back.
//
// Styling is the app's ordinary button: no scalloped/filigree borders, and a
// LIGHT INK HAIRLINE so a white option still separates from the off-white screen.
// That hairline was removed once as clutter and replaced with the faintest
// possible shadow; the owner reversed it on 2026-08-09 because on the white quiz
// card the shadow was too faint to read as an edge and the options looked like
// floating text. A border is unambiguous at any brightness and renders identically
// on both platforms — Android drew that shadow as its own grey rim anyway.

export type OptionState = 'idle' | 'correct' | 'wrong' | 'tried';

export default function QuizOptionButton({
  label, state, disabled, onPress,
}: {
  label: string;
  state: OptionState;
  disabled: boolean;
  onPress: () => void;
}) {
  const filled = state === 'correct' || state === 'wrong';
  return (
    <TouchableOpacity
      style={[styles.base, STATE_BOX[state]]}
      activeOpacity={0.85}
      onPress={onPress}
      // `disabled` comes from the CALLER, and `tried` is no longer folded in here.
      // The full screen still refuses a tried option (QuizQuestionView passes it),
      // but the home card passes disabled={false} on purpose so EVERY option can
      // hand off to the full screen — and this line silently overrode that, so a
      // greyed option on a retry round fired neither startAndPick nor the
      // navigation. A tap that does nothing at all, on the card whose whole job
      // is to hand off.
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: filled }}
    >
      <Text
        style={[styles.label, STATE_TEXT[state]]}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
      {state === 'correct' ? (
        <Feather name="check" size={21} color="#FFFFFF" style={styles.mark} />
      ) : state === 'wrong' ? (
        <Feather name="x" size={21} color="#FFFFFF" style={styles.mark} />
      ) : state === 'tried' ? (
        <Feather name="x" size={18} color={TXTSUB} style={styles.mark} />
      ) : (
        // Reserve the mark's width in every state so the label doesn't reflow
        // when a reveal lands — a text jump on answer is the kind of jitter
        // that reads as a bug.
        <View style={styles.markSpacer} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: BTN_RADIUS,
    paddingVertical: 17,   // 14 → 17 (+3px above and below the label, per user — taller cards)
    paddingHorizontal: 16,
    marginBottom: 11,
    backgroundColor: '#FFFFFF',
    // A light hairline, NOT a shadow (per user 2026-08-09). The shadow was too
    // faint to read as an edge on the white quiz card — on the prayer-end screen
    // the options looked like floating text. A 1px INK_10 border is unambiguous
    // at any brightness, costs no overdraw, and renders identically on both
    // platforms (Android drew the shadow as its own grey rim anyway).
    borderWidth: 1,
    borderColor: INK_10,
  },
  // Merriweather for the answer text (bundled; the reader already uses it).
  // 16 → 17.3 = the +8 % scale the user asked for over the reference design.
  label: {
    flex: 1,
    fontFamily: FONTS.merriweather,
    fontSize: 17.3,
    lineHeight: 24,
    color: TXT,
    letterSpacing: 0.1,
  },
  mark: { marginLeft: 10 },
  markSpacer: { width: 31 },
});

const STATE_BOX: Record<OptionState, object> = {
  idle: {},
  correct: { backgroundColor: GREEN_DONE, borderColor: GREEN_DONE },
  wrong: { backgroundColor: ROSE, borderColor: ROSE },
  // Inert, and flat: no shadow, because a greyed-out option should read as
  // recessed rather than as another card sitting on the page.
  tried: { backgroundColor: INK_06, borderColor: 'transparent' },
};

const STATE_TEXT: Record<OptionState, object> = {
  idle: {},
  correct: { color: '#FFFFFF', fontFamily: FONTS.merriweatherBold, fontWeight: '700' },
  wrong: { color: '#FFFFFF', fontFamily: FONTS.merriweatherBold, fontWeight: '700' },
  tried: { color: TXTSUB },
};
