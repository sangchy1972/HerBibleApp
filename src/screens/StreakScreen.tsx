import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { DAYS } from '../constants/data';

const NOTO_REG = 'NotoSansSC_400Regular';
const NOTO_MED = 'NotoSansSC_500Medium';
const NOTO_BOLD = 'NotoSansSC_700Bold';
import DayCircle from '../components/shared/DayCircle';
import FireFlame from '../components/shared/FireFlame';
import { usePrayer } from '../state/PrayerContext';
import type { RootStackScreenProps } from '../navigation/types';

function splitDate(s: string): string {
  return s.split(',').map(p => p.trim()).filter(Boolean).join('\n');
}

// Format an ISO 'YYYY-MM-DD' as "Mon DD, YYYY"; em-dash when no streak yet.
function formatStreakStart(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

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

function flameSizeForLevel(level: number) {
  const s = level >= 5 ? 1.12 : level >= 4 ? 1.0 : level >= 3 ? 0.88 : level >= 2 ? 0.72 : 0.55;
  return Math.round(172 * s);
}

export default function StreakScreen({ navigation }: RootStackScreenProps<'Streak'>) {
  const insets = useSafeAreaInsets();
  const { mDone, eDone, totalComplete, maxStreak, firstCompleteDate, wasCompleteOn } = usePrayer();
  const [info, setInfo] = useState(false);
  // Headline number = total days at 100 % progress. Flame level scales with it.
  const lvl = streakLevel(totalComplete);
  const next = LEVEL_INFO[lvl].next;
  const remaining = Math.max(0, next - totalComplete);

  // Build the current week's date keys (Sun → Sat) so the day row reflects
  // the same record source as the headline streak number.
  const today = new Date();
  const TODAY_IDX = today.getDay();
  const weekKeys = (() => {
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - TODAY_IDX);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  })();
  const completeThisWeek = weekKeys.filter(k => wasCompleteOn(k)).length;

  const card = {
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        {/* Was "DAY STREAK"; renamed to match the big-number label below
            since both describe the lifetime `totalComplete`, not an active
            streak. The legitimate streak number lives in the "Max streak"
            stat further down the page. */}
        <Text style={styles.headerTitle}>DAYS PRAYED</Text>
        <TouchableOpacity onPress={() => setInfo(v => !v)} style={styles.headerBtn}>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </TouchableOpacity>
      </View>

      {info && (
        <TouchableOpacity style={styles.infoOverlay} onPress={() => setInfo(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.infoCard}>
            <TouchableOpacity onPress={() => setInfo(false)} hitSlop={10} style={styles.infoClose}>
              <Feather name="x" size={20} color={TXT} />
            </TouchableOpacity>
            <Text style={styles.infoTitle}>Why Streaks?</Text>
            <Text style={styles.infoBody}>
              Your relationship with God is more than a number, but let's allow your Streak to simply remind you to engage with God and His Words daily.
            </Text>
            <Text style={[styles.infoBody, { marginTop: 14 }]}>
              Streaks are gentle reminders, not a measure of your faith. Miss a day? Tomorrow is a fresh page — show up again, and your streak starts to grow.
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Flame + count */}
        <View style={styles.flameSection}>
          <FireFlame size={flameSizeForLevel(lvl)} />
          <Text style={styles.streakNum}>{totalComplete}</Text>
          {/* The big number is `totalComplete` — lifetime count of days where
              both prayers were finished, not an active consecutive streak.
              Label was "DAY STREAK" which conflated the two; "DAYS PRAYED"
              describes the actual quantity. The "Max streak" stat below
              remains the page's single legitimate streak indicator. */}
          <Text style={styles.streakLabel}>DAYS PRAYED</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={styles.statValueWrap}>
              <Text style={styles.statValueDate}>{splitDate(formatStreakStart(firstCompleteDate))}</Text>
            </View>
            <Text style={styles.statLabel}>Streak started</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statValueWrap}>
              <Text style={styles.statValue}>{LEVEL_INFO[lvl].name}</Text>
            </View>
            <Text style={styles.statLabel}>Prayer streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statValueWrap}>
              <Text style={styles.statValueXL}>{maxStreak}</Text>
            </View>
            <Text style={styles.statLabel}>Max streak</Text>
          </View>
        </View>

        {/* This Week */}
        <View style={styles.sectionPad}>
          <View style={[card, styles.weekCard]}>
            <View style={styles.weekHeader}>
              <Text style={styles.weekTitle}>THIS WEEK</Text>
              <Text style={styles.weekSub}>{completeThisWeek} / 7 days</Text>
            </View>
            <View style={styles.weekDays}>
              {DAYS.map((d, i) => {
                const isToday = i === TODAY_IDX;
                const done = wasCompleteOn(weekKeys[i]);
                const half = isToday && (mDone || eDone) && !(mDone && eDone);
                return <DayCircle key={d} label={d} done={done} half={half} isToday={isToday} morning={true} />;
              })}
            </View>
          </View>
        </View>

        <View style={styles.sectionPad}>
          <View style={[card, styles.milestoneCard]}>
            <View style={styles.milestoneRow}>
              <View style={styles.milestoneFlame}>
                <FireFlame size={40} />
                <Text style={styles.milestoneDays}>{totalComplete}</Text>
              </View>

              <View style={styles.milestoneMiddle}>
                <Text style={styles.milestoneMoreDays}>{remaining} more days</Text>
                <View style={styles.milestoneTrack}>
                  <View style={[styles.milestoneFill, {
                    width: `${Math.min(100, totalComplete / next * 100)}%` as any,
                    backgroundColor: ROSE,
                  }]} />
                </View>
                <Text style={styles.milestoneCaption}>to unlock your next milestone.</Text>
              </View>

              <View style={styles.milestoneFlame}>
                <FireFlame size={40} opacity={0.55} />
                <Text style={[styles.milestoneDays, { color: TXTSUB }]}>{next}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>A slow burn toward a stronger soul</Text>
          <Text style={styles.footerBody}>
            Every prayer is a step closer to His heart, weaving a bond that never breaks.
          </Text>
        </View>

        <View style={{ height: 146 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF7F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingBottom: 9,
  },
  headerBtn: {
    width: 39,
    height: 41,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 26, color: TXT, lineHeight: 32 },
  infoIcon: { fontSize: 19, color: TXT },
  headerTitle: {
    fontSize: 15,                    // +15% from 13
    fontWeight: '700',
    color: TXT,
    letterSpacing: 2.4,
  },
  infoOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    backgroundColor: 'rgba(30,27,46,0.45)',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 25,
  },
  infoCard: {
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  infoClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(30,27,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    fontSize: 21,                    // +10% from 19
    fontFamily: NOTO_BOLD,
    color: TXT,
    marginBottom: 14,
  },
  infoBody: {
    fontSize: 16,                    // +10% from 14.5
    fontFamily: NOTO_REG,
    lineHeight: 26,
    color: TXTSUB,
  },
  flameSection: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 7,
  },
  streakNum: {
    fontSize: 74,
    fontWeight: '700',
    color: TXT,
    lineHeight: 77,
    marginTop: 5,
  },
  streakLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TXT,
    letterSpacing: 2.4,
    marginTop: 2,
  },
  // Stats row: +5 px above (between "DAY STREAK" label and these stats),
  //            +6 px below (between these stats and the white THIS WEEK card).
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingTop: 35,                  // 30 → 35 (+5 px)
    paddingBottom: 27,                // 21 → 27 (+6 px)
    gap: 9,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  // Fixed-height wrap so single-line values vertically center against the two-line date.
  statValueWrap: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  statValue: {                       // "Big": +20% from 16, Noto Sans bold
    fontSize: 19,
    fontFamily: NOTO_BOLD,
    color: TXT,
    textAlign: 'center',
  },
  statValueXL: {                     // "28": another +20% on top of statValue (≈ +44% over baseline)
    fontSize: 23,
    fontFamily: NOTO_BOLD,
    color: TXT,
    textAlign: 'center',
  },
  statValueDate: {                   // "Mar 15\n2025": two lines, Noto Sans bold
    fontSize: 16,
    fontFamily: NOTO_BOLD,
    color: TXT,
    textAlign: 'center',
    lineHeight: 22,
  },
  statLabel: {                       // "Streak started" / "Prayer streak" / "Max streak": +10% from 12
    fontSize: 13,
    fontFamily: NOTO_REG,
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
    paddingTop: 5,
    paddingBottom: 22,                 // +10 px gap between THIS WEEK and Milestone
  },
  weekCard: {
    padding: 20,
    paddingBottom: 20,
  },
  weekHeader: {                      // mirrors PrayerScreen weekHeader (was 32 → 28)
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  weekTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TXT,
    letterSpacing: 1.8,
  },
  weekSub: {
    fontSize: 12,
    color: TXTSUB,
    letterSpacing: 0.3,
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  milestoneCard: {
    padding: 19,
    paddingHorizontal: 14,             // tighter padding so the bar + text get more width
  },
  // Bare flames now hug the edges; the middle column expands to fill
  // whatever's left, giving the progress bar and caption full width.
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,                            // 15 → 8 (flames are smaller without circles)
  },
  milestoneFlame: {
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    width: 44,                         // fixed slot so the row balances symmetrically
  },
  milestoneDays: {
    fontSize: 18,
    fontFamily: NOTO_BOLD,
    color: TXT,
  },
  milestoneMiddle: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  milestoneMoreDays: {
    fontSize: 17,
    fontFamily: NOTO_BOLD,
    color: TXT,
    textAlign: 'center',
  },
  milestoneTrack: {
    width: '100%',
    height: 7,
    borderRadius: 6,
    backgroundColor: 'rgba(30,27,46,0.08)',
    overflow: 'hidden',
  },
  milestoneFill: {
    height: '100%',
    borderRadius: 6,
  },
  milestoneCaption: {
    fontSize: 14,
    fontFamily: NOTO_REG,
    color: TXTSUB,
    textAlign: 'center',
    lineHeight: 20,
  },
  footerCard: {
    // Doubled horizontal padding (P × 2) because there's no card background
    // — without the inset the text felt glued to the screen edges.
    paddingHorizontal: P * 2,
    paddingTop: 29,                  // +10 px above the "A slow burn" title
    paddingBottom: 19,
  },
  footerTitle: {
    fontSize: 18,
    fontFamily: NOTO_MED,
    color: TXT,
    marginBottom: 9,
  },
  footerBody: {
    fontSize: 14,
    fontFamily: NOTO_REG,
    color: TXTSUB,
    lineHeight: 23,
  },
});
