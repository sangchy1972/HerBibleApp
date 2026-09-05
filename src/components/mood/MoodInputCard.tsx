import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, {
  Easing, useSharedValue, useAnimatedStyle, withDelay, withSequence, withSpring, withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { type Mood } from '../MoodEmoji';

// Grid order mirrors the owner's artwork sheet row by row (NOT the old
// slider's heavy→radiant ramp): the faithful praying-hands sit at the centre
// of the nine, exactly as designed.
const MOOD_ORDER: Mood[] = ['angry', 'weak', 'anxious', 'fearful', 'faithful', 'sad', 'calm', 'happy', 'blessed'];
import { useT } from '../../i18n/useT';
import { ROSE, TXT, TXTSUB, FONTS } from '../../constants/theme';

// The mood-input surface (owner redesign 2026-09-06): the rainbow slider gave
// way to a full 3×3 grid of the new clay-style mood avatars — she taps how she
// feels. Shared by the daily full-screen check-in and the day-detail editor so
// both look and behave identically.
//
// Entrance choreography (owner: title first, then the nine faces one by one,
// everything inside 3 seconds): title fades up over ~0.5s, then each avatar
// pops in with a small spring, staggered so the last one lands ≈2.9s. With
// the OS reduce-motion switch on, everything renders instantly (house rule).
//
// The 9 sliced avatars are bundled (assets/mood/*.webp, ~164KB total, cut from
// the owner's tile sheet with the dark background flood-filled away).
const AVATAR: Record<Mood, ReturnType<typeof require>> = {
  angry: require('../../../assets/mood/angry.webp'),
  weak: require('../../../assets/mood/weak.webp'),
  anxious: require('../../../assets/mood/anxious.webp'),
  fearful: require('../../../assets/mood/fearful.webp'),
  faithful: require('../../../assets/mood/faithful.webp'),
  sad: require('../../../assets/mood/sad.webp'),
  calm: require('../../../assets/mood/calm.webp'),
  happy: require('../../../assets/mood/happy.webp'),
  blessed: require('../../../assets/mood/blessed.webp'),
};

const TITLE_MS = 500;          // title beat
const STAGGER_MS = 250;        // avatar i enters at TITLE_MS + i*STAGGER
const POP_MS = 420;            // each avatar's own pop duration
// Last avatar starts at 500 + 8×250 = 2500 and lands by ~2920ms — inside 3s.

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
  const { width } = useWindowDimensions();
  // Daily check-in starts with NOTHING selected — the pick must be hers, not a
  // default (the old slider pre-parked on 'blessed' for the same reason, but a
  // grid can do better: no selection at all until she taps). The day-detail
  // editor still opens on the entry being edited.
  const [mood, setMood] = useState<Mood | null>(initialMood ?? null);
  const [note, setNote] = useState(initialNote ?? '');
  const reduceMotion = useReducedMotion();

  // Grid geometry: three columns inside the sheet's 22px side padding.
  // Cell width drives avatar size so SE → Pro Max all hold three across.
  const cellW = useMemo(() => Math.floor((width - 44 - 2 * 12) / 3), [width]);
  const avatarSize = Math.min(104, cellW - 14);

  // Title-first entrance.
  const titleP = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    titleP.value = withTiming(1, { duration: TITLE_MS, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleP.value,
    transform: [{ translateY: (1 - titleP.value) * 10 }],
  }));

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

      <Animated.Text style={[styles.title, titleStyle]}>{title}</Animated.Text>

      <View style={styles.grid}>
        {MOOD_ORDER.map((m, i) => (
          <MoodTile
            key={m}
            mood={m}
            index={i}
            label={t(`mood.label.${m}`)}
            selected={mood === m}
            dimmed={mood !== null && mood !== m}
            size={avatarSize}
            cellW={cellW}
            reduceMotion={reduceMotion}
            onPress={() => setMood(m)}
          />
        ))}
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

      {/* Save waits for a pick — a grid has no honest default. */}
      <TouchableOpacity
        style={[styles.saveBtn, mood === null && styles.saveBtnDisabled]}
        activeOpacity={0.9}
        disabled={mood === null}
        onPress={() => mood !== null && onSave(mood, note)}
      >
        <Text style={[styles.saveText, mood === null && styles.saveTextDisabled]}>{saveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function MoodTile({ mood, index, label, selected, dimmed, size, cellW, reduceMotion, onPress }: {
  mood: Mood; index: number; label: string; selected: boolean; dimmed: boolean;
  size: number; cellW: number; reduceMotion: boolean; onPress: () => void;
}) {
  // Staggered pop-in, then a jelly squeeze on every selection tap.
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  const squeeze = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    enter.value = withDelay(
      TITLE_MS + index * STAGGER_MS,
      withSpring(1, { damping: 13, stiffness: 160, mass: 0.7 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (!selected || reduceMotion) return;
    squeeze.value = withSequence(
      withTiming(1.12, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 9, stiffness: 170, mass: 0.6 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  // Watchdog: a dropped spring must never leave a face invisible — snap in
  // shortly after the full choreography window (same idiom as the verse step).
  useEffect(() => {
    if (reduceMotion) return;
    const wd = setTimeout(() => { enter.value = 1; }, TITLE_MS + 8 * STAGGER_MS + POP_MS + 600);
    return () => clearTimeout(wd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const st = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: (0.5 + enter.value * 0.5) * squeeze.value }],
  }));

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.cell, { width: cellW }]}>
      <Animated.View style={[styles.tileInner, st]}>
        <View style={[
          styles.avatarRing,
          { width: size + 14, height: size + 14, borderRadius: (size + 14) / 2 },
          selected && styles.avatarRingOn,
        ]}>
          <Image
            source={AVATAR[mood]}
            style={{ width: size, height: size, opacity: dimmed ? 0.45 : 1 }}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.tileLabel, selected && styles.tileLabelOn]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
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
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    rowGap: 14, marginTop: 20,
  },
  cell: { alignItems: 'center' },
  tileInner: { alignItems: 'center' },
  avatarRing: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'transparent',
  },
  avatarRingOn: { borderColor: ROSE, backgroundColor: 'rgba(230,63,105,0.07)' },
  tileLabel: {
    marginTop: 6, fontSize: 13.5, color: TXTSUB,
    fontFamily: FONTS.lato, letterSpacing: 0.3,
  },
  tileLabelOn: { color: TXT, fontFamily: FONTS.latoBold, fontWeight: '700' },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)', marginTop: 22, marginBottom: 14 },
  noteLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: TXTSUB, textTransform: 'uppercase', marginBottom: 8 },
  note: {
    minHeight: 64, fontSize: 15, lineHeight: 22, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.4,
    fontStyle: 'italic',
  },
  saveBtn: {
    marginTop: 22, backgroundColor: ROSE, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: 'rgba(30,27,46,0.10)' },
  saveText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  saveTextDisabled: { color: TXTSUB },
});
