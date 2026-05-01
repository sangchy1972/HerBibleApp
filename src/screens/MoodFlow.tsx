import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInRight, Easing } from 'react-native-reanimated';
import MoodEmoji, { MOOD_LIST, MOOD_LABEL, type Mood } from '../components/MoodEmoji';
import MoodCalendar from '../components/MoodCalendar';
import { MOOD_VERSES, FUN_FACTS } from '../constants/moodContent';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { ROSE, TXT, TXTSUB } from '../constants/theme';
import type { RootStackScreenProps } from '../navigation/types';

type Step = 'pick' | 'verse' | 'calendar' | 'fact';

const SCREEN_W = Dimensions.get('window').width;
const TILE_W = (SCREEN_W - 16 * 2 - 12 * 2) / 3;       // 3 cols, 16 outer + 12 gap

export default function MoodFlow({ navigation }: RootStackScreenProps<'MoodFlow'>) {
  const insets = useSafeAreaInsets();
  const { todayMood, recordPick } = useMoodCheckIn();
  const [step, setStep] = useState<Step>(todayMood ? 'calendar' : 'pick');
  const [factIdx, setFactIdx] = useState(() => Math.floor(Math.random() * FUN_FACTS.length));
  const mood: Mood | null = todayMood ?? null;

  const exit = () => navigation.goBack();

  const onPick = (m: Mood) => {
    recordPick(m);
    setStep('verse');
  };

  return (
    <View style={styles.root}>
      {/* Single top-right close — applies to every step. */}
      <View style={[styles.topRow, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={exit} style={styles.closeBtn} hitSlop={10}>
          <Feather name="x" size={22} color={TXT} />
        </TouchableOpacity>
      </View>

      {step === 'pick' && <PickStep onPick={onPick} />}
      {step === 'verse' && mood && <VerseStep mood={mood} onClose={() => setStep('calendar')} />}
      {step === 'calendar' && (
        <CalendarStep
          onViewFact={() => setStep('fact')}
          onReturn={exit}
        />
      )}
      {step === 'fact' && (
        <FactModal
          fact={FUN_FACTS[factIdx]}
          onShuffle={() => setFactIdx(i => (i + 1) % FUN_FACTS.length)}
          onShare={() => { /* hook into ShareVerseSheet later if needed */ }}
          onClose={() => setStep('calendar')}
        />
      )}
    </View>
  );
}

// ─── Step 1: Pick a mood ──────────────────────────────────────────────────────
function PickStep({ onPick }: { onPick: (m: Mood) => void }) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.pickWrap}>
      <Text style={styles.pickTitle}>How do you feel today?</Text>
      <View style={styles.grid}>
        {MOOD_LIST.map((m) => (
          <TouchableOpacity key={m} style={styles.tile} activeOpacity={0.85} onPress={() => onPick(m)}>
            <View style={styles.tileFace}>
              <MoodEmoji mood={m} size={TILE_W * 0.62} />
            </View>
            <Text style={styles.tileLabel}>{MOOD_LABEL[m]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Step 2: Verse for the chosen mood ───────────────────────────────────────
function VerseStep({ mood, onClose }: { mood: Mood; onClose: () => void }) {
  const v = MOOD_VERSES[mood];
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  return (
    <Animated.View entering={SlideInRight.duration(360).easing(Easing.out(Easing.cubic))} style={styles.verseWrap}>
      <View style={styles.verseHeader}>
        <Text style={styles.verseHeaderTitle}>When you feel {MOOD_LABEL[mood]}</Text>
        <View style={{ marginLeft: 6 }}><MoodEmoji mood={mood} size={32} /></View>
      </View>
      <Text style={styles.verseHeaderSub}>God's words for you</Text>

      <LinearGradient colors={['#5A2B14', '#A86430', '#5A2B14']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.verseCard}>
        <View style={styles.verseFrame}>
          <Text style={styles.verseDate}>{dateStr}</Text>
          <Text style={styles.verseRef}>{v.ref}</Text>
          <Text style={styles.verseText}>{v.text}</Text>
        </View>
      </LinearGradient>

      <TouchableOpacity onPress={onClose} style={styles.verseCloseBtn} activeOpacity={0.85}>
        <Text style={styles.verseCloseText}>Close</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Step 3: Check-in calendar ──────────────────────────────────────────────
function CalendarStep({
  onViewFact, onReturn,
}: {
  onViewFact: () => void;
  onReturn: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.calWrap}>
      <MoodCalendar />
      <TouchableOpacity onPress={onViewFact} activeOpacity={0.85} style={styles.calCta}>
        <Text style={styles.calCtaText}>View Today's Did You Know</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onReturn} activeOpacity={0.85} style={styles.calReturn}>
        <Text style={styles.calReturnText}>Return</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Step 4: Did You Know? card ─────────────────────────────────────────────
function FactModal({
  fact, onShuffle, onShare, onClose,
}: {
  fact: typeof FUN_FACTS[number];
  onShuffle: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.factOverlay}>
      <View style={StyleSheet.absoluteFillObject as any} pointerEvents="none">
        <View style={styles.factScrim} />
      </View>
      <Animated.View entering={FadeIn.duration(220)} style={styles.factCard}>
        <View style={styles.factHeaderRow}>
          <Text style={styles.factTitle}>Did you know?</Text>
          <TouchableOpacity onPress={onShuffle} hitSlop={10}>
            <Feather name="refresh-cw" size={20} color={TXT} />
          </TouchableOpacity>
        </View>
        <Text style={styles.factBody}>{fact.text}</Text>
        {fact.relatedRefs.length > 0 && (
          <>
            <Text style={styles.factSub}>Related Verses</Text>
            {fact.relatedRefs.map(r => (
              <Text key={r} style={styles.factRef}>{r}</Text>
            ))}
          </>
        )}
        <View style={styles.factDivider} />
        <View style={styles.factActions}>
          <TouchableOpacity onPress={onShare} style={styles.factAction} hitSlop={10}>
            <Feather name="share-2" size={18} color="#A8744D" />
            <Text style={[styles.factActionText, { color: ROSE }]}>Share</Text>
          </TouchableOpacity>
          <View style={styles.factActionSep} />
          <TouchableOpacity onPress={onClose} style={styles.factAction} hitSlop={10}>
            <Text style={[styles.factActionText, { color: ROSE }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },

  // Pick step
  pickWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 36 },
  pickTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: TXT,
    textAlign: 'center',
    marginBottom: 32,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 22 } as any,
  tile: { width: TILE_W, alignItems: 'center' },
  tileFace: {
    width: TILE_W,
    height: TILE_W,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  tileLabel: {
    color: TXT,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },

  // Verse step
  verseWrap: { flex: 1, paddingHorizontal: 22, paddingTop: 12 },
  verseHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  verseHeaderTitle: { color: TXT, fontSize: 26, fontWeight: '700' },
  verseHeaderSub: { color: TXT, fontSize: 26, fontWeight: '700', marginBottom: 18 },
  verseCard: {
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  verseFrame: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,235,180,0.6)',
    borderRadius: 8,
    paddingVertical: 28,
    paddingHorizontal: 22,
  },
  verseDate: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 18, opacity: 0.85 },
  verseRef:  { color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginBottom: 16 },
  verseText: { color: '#FFFFFF', fontSize: 18, lineHeight: 26, fontWeight: '500' },
  verseCloseBtn: {
    marginTop: 22,
    backgroundColor: '#FF82A8',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  verseCloseText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },

  // Calendar step — calendar grid lives in MoodCalendar; we only own the wrap
  // and the two CTAs underneath.
  calWrap: { flex: 1, paddingHorizontal: 18, paddingTop: 4 },
  calCta: {
    marginTop: 18,
    backgroundColor: '#FF82A8',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  calCtaText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  calReturn: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#FF82A8',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  calReturnText: { color: '#FF82A8', fontSize: 18, fontWeight: '700' },

  // Fact modal
  factOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  factScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  factCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 6,
  },
  factHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  factTitle: { fontSize: 22, fontWeight: '700', color: TXT },
  factBody: { fontSize: 16, lineHeight: 24, color: TXT, marginTop: 18 },
  factSub: { fontSize: 16, fontWeight: '700', color: TXT, marginTop: 18, marginBottom: 6 },
  factRef: { fontSize: 16, color: TXT, textDecorationLine: 'underline' },
  factDivider: { height: 1, backgroundColor: 'rgba(30,27,46,0.10)', marginTop: 18 },
  factActions: { flexDirection: 'row' },
  factAction: { flex: 1, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  factActionSep: { width: 1, backgroundColor: 'rgba(30,27,46,0.10)' },
  factActionText: { fontSize: 17, fontWeight: '700' },
});

// `ScrollView` import kept around for if we later need scrollable variants.
void ScrollView;
