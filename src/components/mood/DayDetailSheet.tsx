import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions,
  Keyboard, Platform, useWindowDimensions,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import MoodEmoji, { type Mood } from '../MoodEmoji';
import MoodInputCard from './MoodInputCard';
import { useMoodCheckIn } from '../../state/MoodCheckInContext';
import { useUILanguage } from '../../state/UILanguageContext';
import { localeFor } from '../../i18n/locale';
import { useT } from '../../i18n/useT';
import { ROSE, TXT, TXTSUB, FONTS } from '../../constants/theme';

const SCREEN_H = Dimensions.get('window').height;

// Bottom sheet for a single day: review its mood + note, or edit / back-fill it.
export default function DayDetailSheet({ dateKey, onClose }: { dateKey: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang } = useUILanguage();
  const { entryFor, recordPickFor } = useMoodCheckIn();
  const entry = entryFor(dateKey);
  // Days with no entry open straight into edit (back-fill).
  const [editing, setEditing] = useState(!entry);
  const { height: winH } = useWindowDimensions();

  // Keyboard avoidance (same approach as the daily sheet).
  const scrollRef = useRef<ScrollView>(null);
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => {
      setKb(e.endCoordinates?.height ?? 0);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    const h = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => { s.remove(); h.remove(); };
  }, []);

  const backdropO = useSharedValue(0);
  const sheetTY = useSharedValue(SCREEN_H);
  useEffect(() => {
    backdropO.value = withTiming(1, { duration: 200 });
    sheetTY.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) });
  }, [backdropO, sheetTY]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));
  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTY.value }] }));

  const dismiss = () => {
    backdropO.value = withTiming(0, { duration: 180 });
    sheetTY.value = withTiming(SCREEN_H, { duration: 240, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(onClose)();
    });
  };

  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const longLabel = date.toLocaleDateString(localeFor(lang), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const onSave = (mood: Mood, note: string) => {
    Keyboard.dismiss();
    recordPickFor(dateKey, mood, note);
    setEditing(false);
  };

  return (
    <View style={styles.overlay}>
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={dismiss} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { height: winH - 50 }, sheetAnim]}>
        <View style={styles.handle} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: kb > 0 ? kb + 16 : insets.bottom + 24 }}
        >
            {editing ? (
              <MoodInputCard
                dateLabel={longLabel}
                title={t('moodDashboard.dayDetail.title')}
                saveLabel={t('moodCheckIn.input.save')}
                initialMood={entry?.mood}
                initialNote={entry?.note}
                onSave={onSave}
                onClose={dismiss}
              />
            ) : entry ? (
              <View style={{ paddingTop: 6 }}>
                <View style={styles.topRow}>
                  <Text style={styles.date}>{longLabel}</Text>
                  <TouchableOpacity onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
                    <Feather name="x" size={20} color={TXT} />
                  </TouchableOpacity>
                </View>
                <View style={styles.emojiWrap}>
                  <MoodEmoji mood={entry.mood} size={84} />
                  <Text style={styles.moodLabel}>{t(`mood.label.${entry.mood}`)}</Text>
                </View>
                <Text style={entry.note ? styles.note : styles.noNote}>
                  {entry.note || t('moodDashboard.dayDetail.noNote')}
                </Text>
                <TouchableOpacity style={styles.editBtn} activeOpacity={0.9} onPress={() => setEditing(true)}>
                  <Feather name="edit-2" size={16} color={ROSE} />
                  <Text style={styles.editText}>{t('moodDashboard.dayDetail.edit')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 220 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#FBF7F6', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(30,27,46,0.16)', alignSelf: 'center', marginBottom: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 13, fontWeight: '700', letterSpacing: 1, color: TXTSUB, textTransform: 'uppercase', flexShrink: 1 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,27,46,0.06)' },
  emojiWrap: { alignItems: 'center', marginTop: 22, marginBottom: 18 },
  moodLabel: { fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT, fontSize: 24, marginTop: 12 },
  note: { fontSize: 16, lineHeight: 24, color: TXT, fontFamily: FONTS.lato, fontStyle: 'italic' },
  noNote: { fontSize: 15, lineHeight: 22, color: TXTSUB, fontStyle: 'italic' },
  editBtn: {
    marginTop: 26, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    height: 50, borderRadius: 25, backgroundColor: '#FBE3EE',
  },
  editText: { fontSize: 17, fontWeight: '700', color: ROSE },
});
