import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import Glass from '../components/shared/Glass';
import DayCircle from '../components/shared/DayCircle';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { DAYS, WEEK, PSALMS_CARDS, MV, EV } from '../constants/data';

interface PrayerScreenProps {
  mDone: boolean;
  eDone: boolean;
  morning: boolean;
  setMorning: (v: boolean) => void;
  onOpenStreak: () => void;
  onOpenBible: () => void;
  openFlow: (kind: 'morning' | 'evening') => void;
}

function SmallFlame() {
  return (
    <Svg width={15} height={18} viewBox="0 0 100 110">
      <Path
        d="M50 5 C 38 28, 22 38, 22 62 C 22 83, 35 100, 50 100 C 65 100, 78 83, 78 62 C 78 48, 70 42, 70 42 C 70 50, 62 55, 58 52 C 60 38, 56 22, 50 5 Z"
        fill="#FF7043"
      />
      <Path
        d="M50 50 C 44 60, 40 68, 40 80 C 40 90, 45 96, 50 96 C 55 96, 60 90, 60 80 C 60 68, 56 60, 50 50 Z"
        fill="rgba(255,220,180,0.7)"
      />
    </Svg>
  );
}

function HeartIcon({ filled, color }: { filled?: boolean; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.7}>
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function CommentIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Svg>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={color} stroke="none">
      <Circle cx={5} cy={12} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={19} cy={12} r={1.6} />
    </Svg>
  );
}

function VerseHeroCard({ morning, isDone, onBegin }: {
  morning: boolean;
  isDone: boolean;
  onBegin: () => void;
}) {
  const [liked, setLiked] = React.useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const verse = morning ? MV : EV;
  const colors = morning
    ? (['#C2547A', '#7B2255', '#2D0A1A'] as const)
    : (['#5B3A9E', '#2D1660', '#100525'] as const);
  const iconColor = 'rgba(255,255,255,0.80)';

  // Pulse animation for Start Prayer button
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isDone) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.04, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isDone]);

  const handleLike = () => {
    setLiked(l => !l);
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.4, duration: 130, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View>
      <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Text style={styles.heroLabel}>
            {morning ? 'Daily Verse of the Day' : 'Daily Verse of the Night'}
          </Text>
          <Text style={styles.heroRef}>{verse.ref}</Text>
        </View>
        <View style={styles.heroBody}>
          <Text style={styles.heroText}>{verse.text}</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <HeartIcon filled={liked} color={liked ? '#FFB3CC' : iconColor} />
            </Animated.View>
            <Text style={[styles.actionLabel, { color: liked ? '#FFB3CC' : iconColor }]}>1.1K</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <CommentIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>24</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <ShareIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <MoreIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>More</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {!isDone ? (
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity
            onPress={onBegin}
            activeOpacity={0.9}
            style={[styles.startBtn, { backgroundColor: morning ? ROSE : LAV }]}
          >
            <Text style={styles.startBtnText}>Start Prayer</Text>
            <Feather name="arrow-right" size={15} color="#fff" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={styles.completedBtn}>
          <Feather name="check-circle" size={16} color={TXTSUB} />
          <Text style={[styles.completedText, { color: TXTSUB }]}>Completed</Text>
        </View>
      )}
    </View>
  );
}

export default function PrayerScreen({
  mDone, eDone, morning, setMorning, onOpenStreak, onOpenBible, openFlow
}: PrayerScreenProps) {
  const ac = morning ? ROSE : LAV;
  const pct = (mDone ? 50 : 0) + (eDone ? 50 : 0);
  const isDone = morning ? mDone : eDone;
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const TODAY_IDX = today.getDay();

  // Stagger mount animations
  const anims = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      70,
      anims.map(a =>
        Animated.timing(a, { toValue: 1, duration: 420, useNativeDriver: true })
      )
    ).start();
  }, []);

  const fadeUp = (i: number) => ({
    opacity: anims[i],
    transform: [{
      translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
    }],
  });

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {/* Header */}
      <Animated.View style={[styles.header, fadeUp(0)]}>
        <View>
          <Text style={styles.dateText}>{dateStr.toUpperCase()}</Text>
          <Text style={styles.greetText}>{morning ? 'Good Morning' : 'Good Evening'}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onOpenStreak} style={styles.streakBadge}>
            <SmallFlame />
            <Text style={styles.streakNum}>12</Text>
          </TouchableOpacity>
          <LinearGradient
            colors={morning ? ['#F9A8C9', '#E8619A'] : ['#C4B5FD', '#9D7FE0']}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>S</Text>
          </LinearGradient>
        </View>
      </Animated.View>

      {/* Progress bar */}
      <Animated.View style={[styles.progressSection, fadeUp(1)]}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Today's Progress</Text>
          <Text style={[styles.progressPct, { color: ac }]}>{pct}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={['#F9A8C9', '#C4B5FD', '#9D7FE0']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${pct}%` as any }]}
          />
          <View style={styles.progressDivider} />
        </View>
      </Animated.View>

      {/* Morning/Evening toggle */}
      <Animated.View style={[styles.toggle, fadeUp(2)]}>
        {(['morning', 'evening'] as const).map(s => (
          <TouchableOpacity
            key={s}
            onPress={() => setMorning(s === 'morning')}
            style={[
              styles.toggleBtn,
              { backgroundColor: (s === 'morning') === morning ? ac : 'transparent' }
            ]}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.toggleText,
              { color: (s === 'morning') === morning ? '#fff' : TXTSUB }
            ]}>
              {s === 'morning' ? 'Morning' : 'Evening'}
              {s === 'morning' && mDone ? ' ✓' : ''}
              {s === 'evening' && eDone ? ' ✓' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>

      {/* Hero verse card */}
      <Animated.View style={[styles.section, fadeUp(3)]}>
        <VerseHeroCard
          morning={morning}
          isDone={isDone}
          onBegin={() => openFlow(morning ? 'morning' : 'evening')}
        />
      </Animated.View>

      {/* This Week */}
      <Animated.View style={[styles.section, fadeUp(4)]}>
        <Glass onPress={onOpenStreak} style={styles.weekCard}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekTitle}>THIS WEEK</Text>
            <Text style={styles.weekSub}>3 / 7 days</Text>
          </View>
          <View style={styles.weekDays}>
            {DAYS.map((d, i) => {
              const isToday = i === TODAY_IDX;
              const done = WEEK[i] || (isToday && mDone && eDone);
              const half = isToday && (mDone || eDone) && !(mDone && eDone);
              return <DayCircle key={d} label={d} done={done} half={half} isToday={isToday} morning={morning} />;
            })}
          </View>
        </Glass>
      </Animated.View>

      {/* Psalms for You */}
      <Animated.View style={[styles.psalmsSection, fadeUp(5)]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Psalms for You</Text>
          <TouchableOpacity style={styles.seeAllRow}>
            <Text style={[styles.seeAll, { color: ac }]}>See all</Text>
            <Feather name="chevron-right" size={13} color={ac} />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.psalmsScroll}>
          {PSALMS_CARDS.map((c, i) => (
            <TouchableOpacity key={i} style={styles.psalmCard} activeOpacity={0.85}>
              <View>
                <LinearGradient
                  colors={i === 0 ? ['#F9A8C9', '#E8619A'] : i === 1 ? ['#C4B5FD', '#9D7FE0'] : ['#FDE68A', '#F59E0B']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.psalmAccentBar}
                />
              </View>
              <View style={[styles.psalmTag, { backgroundColor: c.acl }]}>
                <Text style={[styles.psalmTagText, { color: c.ac }]}>{c.tag}</Text>
              </View>
              <Text style={styles.psalmName}>{c.psalm}</Text>
              <Text style={styles.psalmSub}>{c.subtitle}</Text>
              <TouchableOpacity style={styles.psalmReadRow}>
                <Text style={[styles.psalmRead, { color: c.ac }]}>Read</Text>
                <Feather name="chevron-right" size={12} color={c.ac} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Continue Reading */}
      <Animated.View style={[styles.section, fadeUp(5)]}>
        <Text style={styles.sectionTitle}>Continue Reading</Text>
        <TouchableOpacity onPress={onOpenBible} activeOpacity={0.85} style={styles.continueCard}>
          <LinearGradient
            colors={['rgba(249,168,201,0.38)', 'rgba(196,181,253,0.38)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.continueInner}
          >
            <LinearGradient colors={['#F9A8C9', '#E8619A']} style={styles.continueIcon}>
              <Feather name="book-open" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.continueMeta}>
              <Text style={styles.continueCaption}>CONTINUE READING</Text>
              <Text style={styles.continueTitle}>Psalms · Chapter 23</Text>
              <View style={styles.continueProgressTrack}>
                <LinearGradient
                  colors={['#F9A8C9', '#E8619A']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.continueProgressFill}
                />
              </View>
            </View>
            <Text style={[styles.continuePct, { color: ROSE }]}>38%</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 4 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: P,
    paddingTop: 5,
    paddingBottom: 4,
  },
  dateText: { fontSize: 12, color: TXTSUB, letterSpacing: 1.8, marginBottom: 2 },
  greetText: { fontSize: 24, fontWeight: '500', color: TXT },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(232,97,154,0.22)',
    borderRadius: 24,
    paddingHorizontal: 13,
    paddingVertical: 5,
  },
  streakNum: { fontSize: 14, fontWeight: '700', color: TXT },
  avatar: {
    width: 41, height: 41, borderRadius: 20.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  progressSection: { paddingHorizontal: P, paddingTop: 12 },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  progressLabel: { fontSize: 13, fontWeight: '600', color: TXT },
  progressPct: { fontSize: 13, fontWeight: '700' },
  progressTrack: {
    height: 9, borderRadius: 10,
    backgroundColor: 'rgba(30,27,46,0.10)',
    overflow: 'hidden', position: 'relative',
  },
  progressFill: { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 10 },
  progressDivider: {
    position: 'absolute', left: '50%', top: 1.5, bottom: 1.5,
    width: 1.5, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 2,
  },
  toggle: {
    flexDirection: 'row',
    marginHorizontal: P, marginTop: 15,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 13, padding: 3,
  },
  toggleBtn: {
    flex: 1, borderRadius: 10, height: 35,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.4 },
  section: { paddingHorizontal: P, paddingTop: 12 },
  heroCard: { borderRadius: 13, overflow: 'hidden' },
  heroTop: { padding: 20, paddingBottom: 0 },
  heroLabel: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  heroRef: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  heroBody: { padding: 20, paddingTop: 28, paddingBottom: 24 },
  heroText: { fontSize: 16, lineHeight: 24, color: 'rgba(255,255,255,0.96)' },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginHorizontal: 20 },
  heroActions: {
    flexDirection: 'row', paddingHorizontal: 8,
    paddingTop: 4, paddingBottom: 12,
  },
  actionBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6 },
  actionLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.3 },
  startBtn: {
    marginTop: 14, height: 40, borderRadius: 20,
    width: 330, alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  completedBtn: {
    marginTop: 10, paddingVertical: 13,
    backgroundColor: 'rgba(30,27,46,0.06)',
    borderRadius: 27, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  completedText: { fontSize: 14, fontWeight: '600' },
  weekCard: { padding: 16, paddingBottom: 14 },
  weekHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  weekTitle: { fontSize: 11, fontWeight: '700', color: TXT, letterSpacing: 1.8 },
  weekSub: { fontSize: 11, color: TXTSUB, letterSpacing: 0.3 },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  psalmsSection: { paddingTop: 16 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 11, paddingHorizontal: P,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: TXT },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAll: { fontSize: 12, fontWeight: '600' },
  psalmsScroll: { paddingHorizontal: P, paddingBottom: 6, gap: 11 },
  psalmCard: {
    width: 152, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)',
    padding: 16, paddingHorizontal: 14,
  },
  psalmAccentBar: { height: 3, width: 34, borderRadius: 3, marginBottom: 11 },
  psalmTag: {
    alignSelf: 'flex-start', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 7, marginBottom: 10,
  },
  psalmTagText: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  psalmName: { fontSize: 20, fontWeight: '600', color: TXT, marginBottom: 4, lineHeight: 24 },
  psalmSub: { fontSize: 12, color: TXTSUB, lineHeight: 18, marginBottom: 12 },
  psalmReadRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  psalmRead: { fontSize: 12, fontWeight: '600' },
  continueCard: {
    marginTop: 11, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.90)',
  },
  continueInner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 14,
  },
  continueIcon: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  continueMeta: { flex: 1 },
  continueCaption: {
    fontSize: 11, color: ROSE, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: 2,
  },
  continueTitle: { fontSize: 15, fontWeight: '600', color: TXT, marginBottom: 5 },
  continueProgressTrack: {
    height: 4, borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.10)', overflow: 'hidden',
  },
  continueProgressFill: { height: '100%', width: '38%', borderRadius: 4 },
  continuePct: { fontSize: 12, fontWeight: '700' },
});
