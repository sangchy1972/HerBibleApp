import React from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, GREEN_DONE, TXT, TXTSUB, BTN_RADIUS, FONTS } from '../../constants/theme';

// One answer option.
//
// Owns ONLY its visual state — it is handed a state and never decides
// correctness itself. That keeps the grading logic in one place (QuizContext,
// against the resolved question) instead of smeared across the view layer.
//
//   idle      untouched, awaiting a tap
//   correct   the user picked this and it was right
//   wrong     the user picked this and it was wrong
//   revealed  the right answer, shown after a wrong pick
//   tried     picked-and-wrong in an EARLIER round; greyed and inert, so the
//             retry doesn't ask her to rule out the same option twice
//
// Styling is the app's ordinary button — no scalloped/filigree borders and no
// shadow. CLAUDE.md keeps calling out the no-shadow CTAs, and Android's
// elevation reads as a grey outline on a white card (the reason DailyRhythmBar
// went flat).

export type OptionState = 'idle' | 'correct' | 'wrong' | 'revealed' | 'tried';

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
      disabled={disabled || state === 'tried'}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || state === 'tried', selected: filled }}
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
      {state === 'correct' || state === 'revealed' ? (
        <Feather name="check" size={21} color={state === 'correct' ? '#FFFFFF' : GREEN_DONE} style={styles.mark} />
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.10)',
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
  // The right answer surfaced after a miss: tinted, not filled, so it reads as
  // information rather than as something the user did.
  revealed: { backgroundColor: 'rgba(125,184,125,0.14)', borderColor: GREEN_DONE, borderWidth: 1.5 },
  tried: { backgroundColor: 'rgba(30,27,46,0.06)', borderColor: 'transparent' },
};

const STATE_TEXT: Record<OptionState, object> = {
  idle: {},
  correct: { color: '#FFFFFF', fontFamily: FONTS.merriweatherBold, fontWeight: '700' },
  wrong: { color: '#FFFFFF', fontFamily: FONTS.merriweatherBold, fontWeight: '700' },
  revealed: {},
  tried: { color: TXTSUB },
};
