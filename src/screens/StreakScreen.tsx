import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { DAYS, WEEK, STREAK_DAYS, MAX_STREAK, STREAK_START } from '../constants/data';
import DayCircle from '../components/shared/DayCircle';

function streakLevel(d: number) {
  if (d >= 14) return 5;
  if (d >= 7) return 4;
  if (d >= 5) return 3;
  if (d >= 3) return 2;
  return 1;
}

const LEVEL_INFO: Record<number, { name: string; next: number; nextLabel: string }> = {
  1: { name: 'Spark', next: 3, nextLabel: 'Small flame' },
  2: { name: 'Small', next: 5, nextLabel: 'Medium flame' },
  3: { name: 'Medium', next: 7, nextLabel: 'Big flame' },
  4: { name: 'Big', next: 14, nextLabel: 'Blazing flame' },
  5: { name: 'Blazing', next: 30, nextLabel: 'Legendary' },
};

function FlameIcon({ level }: { level: number }) {
  const c1 = level >= 5 ? '#FFE259' : level >= 4 ? '#FFD15C' : level >= 3 ? '#FFB347' : '#FF9559';
  const c2 = level >= 5 ? '#FF3B2E' : level >= 4 ? '#FF4E2B' : level >= 3 ? '#FF6033' : '#FF7A4A';
  const c3 = level >= 5 ? '#7A0E1F' : level >= 4 ? '#9C1430' : '#B82347';
  const s = level >= 5 ? 1.12 : level >= 4 ? 1.0 : level >= 3 ? 0.88 : level >= 2 ? 0.72 : 0.55;
  const sz = Math.round(160 * s);

  return (
    <Svg width={sz} height={Math.round(176 * s)} viewBox="0 0 100 110">
      <Defs>
        <SvgGradient id="outer" x1="50%" y1="100%" x2="50%" y2="0%">
          <Stop offset="0%" stopColor={c3} />
          <Stop offset="45%" stopColor={c2} />
          <Stop offset="100%" stopColor={c1} />
        </SvgGradient>
        <SvgGradient id="inner" x1="50%" y1="100%" x2="50%" y2="0%">
          <Stop offset="0%" stopColor="#7BD8FF" stopOpacity="0" />
          <Stop offset="30%" stopColor="#7BD8FF" stopOpacity="0.55" />
          <Stop offset="100%" stopColor="#E8F9FF" />
        </SvgGradient>
      </Defs>
      <Path
        d="M50 5 C 38 28, 22 38, 22 62 C 22 83, 35 100, 50 100 C 65 100, 78 83, 78 62 C 78 48, 70 42, 70 42 C 70 50, 62 55, 58 52 C 60 38, 56 22, 50 5 Z"
        fill="url(#outer)"
      />
      <Path
        d="M50 50 C 44 60, 40 68, 40 80 C 40 90, 45 96, 50 96 C 55 96, 60 90, 60 80 C 60 68, 56 60, 50 50 Z"
        fill="url(#inner)"
        opacity={0.85}
      />
    </Svg>
  );
}

interface StreakScreenProps {
  onBack: () => void;
  mDone: boolean;
  eDone: boolean;
}

export default function StreakScreen({ onBack, mDone, eDone }: StreakScreenProps) {
  const [info, setInfo] = useState(false);
  const lvl = streakLevel(STREAK_DAYS);
  const next = LEVEL_INFO[lvl].next;
  const remaining = Math.max(0, next - STREAK_DAYS);
  const TODAY_IDX = new Date().getDay();

  const card = {
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  };

  return (
    <View style={[styles.container, StyleSheet.absoluteFillObject]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DAY STREAK</Text>
        <TouchableOpacity onPress={() => setInfo(v => !v)} style={styles.headerBtn}>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </TouchableOpacity>
      </View>

      {/* Info popover */}
      {info && (
        <TouchableOpacity style={styles.infoOverlay} onPress={() => setInfo(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={[card, styles.infoCard]}>
            <Text style={styles.infoTitle}>Why Streaks?</Text>
            <Text style={styles.infoBody}>
              Your relationship with God is more than a number, but let's allow your Streak to simply remind you to engage with God and His Words daily.
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Flame + count */}
        <View style={styles.flameSection}>
          <FlameIcon level={lvl} />
          <Text style={styles.streakNum}>{STREAK_DAYS}</Text>
          <Text style={styles.streakLabel}>DAY STREAK</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{STREAK_START}</Text>
            <Text style={styles.statLabel}>Streak started</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: ROSE }]}>{LEVEL_INFO[lvl].name}</Text>
            <Text style={[styles.statLabel, { letterSpacing: 1.4 }]}>PRAYER STREAK</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{MAX_STREAK}</Text>
            <Text style={styles.statLabel}>Max streak</Text>
          </View>
        </View>

        {/* This Week */}
        <View style={styles.sectionPad}>
          <View style={[card, styles.weekCard]}>
            <View style={styles.weekHeader}>
              <Text style={styles.weekTitle}>THIS WEEK</Text>
              <Text style={styles.weekSub}>3 / 7 days</Text>
            </View>
            <View style={styles.weekDays}>
              {DAYS.map((d, i) => {
                const isToday = i === TODAY_IDX;
                const done = WEEK[i] || (isToday && mDone && eDone);
                const half = isToday && (mDone || eDone) && !(mDone && eDone);
                return <DayCircle key={d} label={d} done={done} half={half} isToday={isToday} morning={true} />;
              })}
            </View>
          </View>
        </View>

        {/* Milestone */}
        <View style={styles.sectionPad}>
          <View style={[card, styles.milestoneCard]}>
            <View style={styles.milestoneRow}>
              {/* Left: current flame */}
              <View style={styles.milestoneFlame}>
                <View style={styles.flameCircleActive}>
                  <Text style={{ fontSize: 24 }}>🔥</Text>
                </View>
                <Text style={styles.milestoneDays}>{STREAK_DAYS}</Text>
              </View>

              {/* Middle: progress */}
              <View style={styles.milestoneMiddle}>
                <Text style={styles.milestoneMoreDays}>{remaining} more days</Text>
                <View style={styles.milestoneTrack}>
                  <View style={[styles.milestoneFill, {
                    width: `${Math.min(100, STREAK_DAYS / next * 100)}%` as any,
                    backgroundColor: ROSE,
                  }]} />
                </View>
                <Text style={styles.milestoneCaption}>to unlock your next milestone.</Text>
              </View>

              {/* Right: next milestone */}
              <View style={styles.milestoneFlame}>
                <View style={styles.flameCircleLocked}>
                  <Text style={{ fontSize: 24, opacity: 0.55 }}>🔥</Text>
                </View>
                <Text style={[styles.milestoneDays, { color: TXTSUB }]}>{next}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.sectionPad}>
          <View style={[card, styles.footerCard]}>
            <Text style={styles.footerTitle}>A slow burn toward a stronger soul</Text>
            <Text style={styles.footerBody}>
              Every prayer is a step closer to His heart, weaving a bond that never breaks.
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FBF7F6',
    zIndex: 150,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingTop: 54,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 24, color: TXT, lineHeight: 30 },
  infoIcon: { fontSize: 18, color: TXT },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TXT,
    letterSpacing: 2.2,
  },
  infoOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 5,
    backgroundColor: 'rgba(30,27,46,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  infoCard: {
    padding: 22,
    maxWidth: 320,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TXT,
    marginBottom: 10,
  },
  infoBody: {
    fontSize: 13.5,
    lineHeight: 22,
    color: TXTSUB,
  },
  flameSection: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 6,
  },
  streakNum: {
    fontSize: 76,
    fontWeight: '500',
    color: TXT,
    lineHeight: 80,
    marginTop: 4,
  },
  streakLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: TXT,
    letterSpacing: 2.4,
    marginTop: 6,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingVertical: 26,
    paddingBottom: 18,
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: TXT,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: TXTSUB,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(30,27,46,0.10)',
  },
  sectionPad: {
    paddingHorizontal: P,
    paddingTop: 4,
    paddingBottom: 10,
  },
  weekCard: {
    padding: 14,
    paddingHorizontal: 16,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weekTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TXT,
    letterSpacing: 1.8,
  },
  weekSub: {
    fontSize: 11,
    color: TXTSUB,
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  milestoneCard: {
    padding: 18,
    paddingHorizontal: 16,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  milestoneFlame: {
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  flameCircleActive: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,97,154,0.05)',
  },
  flameCircleLocked: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(30,27,46,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneDays: {
    fontSize: 15,
    fontWeight: '700',
    color: TXT,
  },
  milestoneMiddle: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  milestoneMoreDays: {
    fontSize: 14,
    fontWeight: '700',
    color: TXT,
    textAlign: 'center',
  },
  milestoneTrack: {
    width: '100%',
    height: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(30,27,46,0.08)',
    overflow: 'hidden',
  },
  milestoneFill: {
    height: '100%',
    borderRadius: 6,
  },
  milestoneCaption: {
    fontSize: 11.5,
    color: TXTSUB,
    textAlign: 'center',
    lineHeight: 16,
  },
  footerCard: {
    padding: 18,
  },
  footerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TXT,
    marginBottom: 8,
  },
  footerBody: {
    fontSize: 13,
    color: TXTSUB,
    lineHeight: 21,
  },
});
