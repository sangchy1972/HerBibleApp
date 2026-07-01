import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import MoodEmoji, { indexToMood, moodToIndex, MOOD_COLOR, type Mood } from '../MoodEmoji';
import MoodSlider from '../MoodSlider';
import { useT } from '../../i18n/useT';
import { ROSE, TXT, TXTSUB, FONTS } from '../../constants/theme';

// The mood-input card (demo screen 1): title, big emoji, mood label, rainbow
// slider, optional note, Save. Shared by the daily bottom sheet and the
// day-detail editor so both look and behave identically.

interface Props {
  dateLabel: string;
  title: string;
  saveLabel: string;
  initialMood?: Mood;
  initialNote?: string;
  onSave: (mood: Mood, note: string) => void;
  onClose?: () => void;
}

export default function MoodInputCard({
  dateLabel, title, saveLabel, initialMood, initialNote, onSave, onClose,
}: Props) {
  const t = useT();
  const [index, setIndex] = useState(() => (initialMood ? moodToIndex(initialMood) : moodToIndex('calm')));
  const [note, setNote] = useState(initialNote ?? '');
  const mood = indexToMood(index);

  // Liquid-squeeze: on every mood change the emoji stretches wide + squashes
  // flat, then jelly-springs back to round — a soft "gel" pinch.
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const spring = { damping: 6, stiffness: 170, mass: 0.6 } as const;
    sx.value = withSequence(withTiming(1.18, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(1, spring));
    sy.value = withSequence(withTiming(0.82, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(1, spring));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  const squeezeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: sx.value }, { scaleY: sy.value }] }));

  return (
    <View>
      <View style={styles.topRow}>
        <Text style={styles.date}>{dateLabel}</Text>
        {onClose ? (
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Feather name="x" size={20} color={TXT} />
          </TouchableOpacity>
        ) : <View style={{ width: 34 }} />}
      </View>

      <Text style={styles.title}>{title}</Text>

      <View style={styles.emojiWrap}>
        <Animated.View style={[styles.emojiCircle, { shadowColor: MOOD_COLOR[mood] }, squeezeStyle]}>
          <MoodEmoji mood={mood} size={96} />
        </Animated.View>
        <Text style={styles.moodLabel}>{t(`mood.label.${mood}`)}</Text>
      </View>

      <MoodSlider index={index} onIndexChange={setIndex} />
      <View style={styles.endsRow}>
        <Text style={styles.endLabel}>{t('moodCheckIn.slider.heavy')}</Text>
        <Text style={styles.endLabel}>{t('moodCheckIn.slider.radiant')}</Text>
      </View>

      <View style={styles.divider} />
      <Text style={styles.noteLabel}>{t('moodCheckIn.input.noteLabel')}</Text>
      <TextInput
        style={styles.note}
        value={note}
        onChangeText={setNote}
        placeholder={t('moodCheckIn.input.notePlaceholder')}
        placeholderTextColor={TXTSUB}
        multiline
        maxLength={280}
        textAlignVertical="top"
      />

      <TouchableOpacity style={styles.saveBtn} activeOpacity={0.9} onPress={() => onSave(mood, note)}>
        <Text style={styles.saveText}>{saveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: TXTSUB, textTransform: 'uppercase' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,27,46,0.06)' },
  title: {
    fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT,
    fontSize: 27, lineHeight: 34, marginTop: 10,
  },
  emojiWrap: { alignItems: 'center', marginTop: 18, marginBottom: 20 },
  emojiCircle: {
    width: 150, height: 150, borderRadius: 75, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 6,
  },
  moodLabel: {
    fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT,
    fontSize: 24, marginTop: 16,
  },
  endsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 2 },
  endLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: TXTSUB, textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)', marginTop: 22, marginBottom: 14 },
  noteLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: TXTSUB, textTransform: 'uppercase', marginBottom: 8 },
  note: {
    minHeight: 64, fontSize: 15, lineHeight: 22, color: TXT, fontFamily: FONTS.lato,
    fontStyle: 'italic',
  },
  saveBtn: {
    marginTop: 22, backgroundColor: ROSE, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  saveText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
});
