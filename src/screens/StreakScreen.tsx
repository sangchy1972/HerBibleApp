import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import LottieView from 'lottie-react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { DAYS } from '../constants/data';
import { useT } from '../i18n/useT';
import { useUILanguage, type UILanguageCode } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';

// Lato — non-title body sans. Two weights bundled (400 / 700); prior
// Medium (500) usages collapse onto Regular.
const LATO_REG = 'Lato_400Regular';
const LATO_BOLD = 'Lato_700Bold';
import DayCircle from '../components/shared/DayCircle';
import FireFlame from '../components/shared/FireFlame';
import { usePrayer } from '../state/PrayerContext';
import type { RootStackScreenProps } from '../navigation/types';

// Animated hero flame (user's FireStreak Lottie, extracted from dotLottie to
// plain JSON). Replaces the static FireFlame SVG for the BIG flame only —
// the small milestone/day-circle flames stay on the lightweight SVG.
// Source comp is 500×690, so width = height × 0.725 keeps its aspect.
const LOTTIE_FIRE = require('../../assets/lottie/fire-streak.json');

// Staggered entrance: each content block fades/slides in from the RIGHT,
// top to bottom, the whole sequence wrapping up at ~0.7 s (last delay 300 +
// duration 400). Used instead of the hard cut the screen had before.
const ENTER = (slot: number) => FadeInRight.duration(400).delay(slot * 75);

function splitDate(s: string): string {
  return s.split(',').map(p => p.trim()).filter(Boolean).join('\n');
}

// Format an ISO 'YYYY-MM-DD' as "Mon DD, YYYY"; em-dash when no streak yet.
function formatStreakStart(iso: string | null, lang: UILanguageCode): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(localeFor(lang), {
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

// Level name resolved via t() at render time; `nameKey` keys into the catalog
// so the badge name follows the user's UI language.
const LEVEL_INFO: Record<number, { nameKey: string; next: number }> = {
  1: { nameKey: 'streak.level.spark',   next: 3 },
  2: { nameKey: 'streak.level.small',   next: 5 },
  3: { nameKey: 'streak.level.medium',  next: 7 },
  4: { nameKey: 'streak.level.big',     next: 14 },
  5: { nameKey: 'streak.level.blazing', next: 30 },
};

function flameSizeForLevel(level: number) {
  const s = level >= 5 ? 1.12 : level >= 4 ? 1.0 : level >= 3 ? 0.88 : level >= 2 ? 0.72 : 0.55;
  return Math.round(172 * s);
}

export default function StreakScreen({ navigation }: RootStackScreenProps<'Streak'>) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang } = useUILanguage();
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

  // Mirrors PlanProgressCard 1:1 per user — same bg / radius / shadow as
  // the home-screen "Plans In Progress" card, no border.
  const card = {
    backgroundColor: '#FFFFFF',
    borderRadius: 9.8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
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
        <Text style={styles.headerTitle}>{t('streak.daysPrayed')}</Text>
        <TouchableOpacity onPress={() => setInfo(v => !v)} style={styles.headerBtn}>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </TouchableOpacity>
      </View>

      {info && (
        <TouchableOpacity style={styles.infoOverlay} onPress={() => setInfo(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.infoCard}>
            {/* hitSlop 10 → 18: the 32-px ✕ was genuinely hard to hit (per
                user) — effective touch target now ≈ 68×68, comfortably above
                the 48-px Android minimum. */}
            <TouchableOpacity onPress={() => setInfo(false)} hitSlop={18} style={styles.infoClose}>
              <Feather name="x" size={20} color={TXT} />
            </TouchableOpacity>
            <Text style={styles.infoTitle}>{t('streak.info.title')}</Text>
            <Text style={styles.infoBody}>{t('streak.info.body1')}</Text>
            <Text style={[styles.infoBody, { marginTop: 14 }]}>{t('streak.info.body2')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Flame + count. Count + label sit on the same row per user — big
            numeral on the left, "Days\nPrayed" wrapping to two lines on the
            right (left-aligned). */}
        <Animated.View entering={ENTER(0)} style={styles.flameSection}>
          <LottieView
            source={LOTTIE_FIRE}
            autoPlay
            loop
            style={{
              width: Math.round(flameSizeForLevel(lvl) * 0.725),
              height: flameSizeForLevel(lvl),
            }}
          />
          <View style={styles.streakNumRow}>
            <Text style={styles.streakNum}>{totalComplete}</Text>
            <Text style={styles.streakLabel}>{t('streak.daysPrayedTwoLine')}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={ENTER(1)} style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={styles.statValueWrap}>
              <Text style={styles.statValueDate}>{splitDate(formatStreakStart(firstCompleteDate, lang))}</Text>
            </View>
            <Text style={styles.statLabel}>{t('streak.stat.started')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statValueWrap}>
              <Text style={styles.statValue}>{t(LEVEL_INFO[lvl].nameKey)}</Text>
            </View>
            <Text style={styles.statLabel}>{t('streak.stat.prayerStreak')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statValueWrap}>
              <Text style={styles.statValueXL}>{maxStreak}</Text>
            </View>
            <Text style={styles.statLabel}>{t('streak.stat.maxStreak')}</Text>
          </View>
        </Animated.View>

        {/* This Week */}
        <Animated.View entering={ENTER(2)} style={styles.sectionPad}>
          <View style={[card, styles.weekCard]}>
            <View style={styles.weekHeader}>
              <Text style={styles.weekTitle}>{t('streak.thisWeek')}</Text>
              <Text style={styles.weekSub}>{t('streak.thisWeek.count', { n: completeThisWeek })}</Text>
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
        </Animated.View>

        <Animated.View entering={ENTER(3)} style={styles.sectionPad}>
          <View style={[card, styles.milestoneCard]}>
            <View style={styles.milestoneRow}>
              <View style={styles.milestoneFlame}>
                <FireFlame size={40} />
                <Text style={styles.milestoneDays}>{totalComplete}</Text>
              </View>

              <View style={styles.milestoneMiddle}>
                <Text style={styles.milestoneMoreDays}>{t('streak.milestone.moreDays', { n: remaining })}</Text>
                <View style={styles.milestoneTrack}>
                  <View style={[styles.milestoneFill, {
                    width: `${Math.min(100, totalComplete / next * 100)}%` as any,
                    backgroundColor: ROSE,
                  }]} />
                </View>
                <Text style={styles.milestoneCaption}>{t('streak.milestone.unlock')}</Text>
              </View>

              <View style={styles.milestoneFlame}>
                <FireFlame size={40} opacity={0.55} />
                <Text style={[styles.milestoneDays, { color: TXTSUB }]}>{next}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Footer */}
        <Animated.View entering={ENTER(4)} style={styles.footerCard}>
          <Text style={styles.footerTitle}>{t('streak.footer.title')}</Text>
          <Text style={styles.footerBody}>{t('streak.footer.body')}</Text>
        </Animated.View>

        <View style={{ height: 146 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Slightly cooler / grayer than the theme BG (#FBF7F6) per user — the
    // large warm flame above makes the page read as "peachy" with the
    // standard rose-leaning off-white, so this screen drops the red bias
    // to land at a more neutral gray-white.
    backgroundColor: '#F6F4F3',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingBottom: 9,
  },
  headerBtn: {
    // 39×41 read visibly egg-shaped on the ⓘ button (per user) — locked to a
    // true circle.
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 26, color: TXT, lineHeight: 32 },
  infoIcon: { fontSize: 19, color: TXT },
  headerTitle: {                                                                 // mirrors PlanScreen.heading ("My Plans") 1:1 per user
    fontSize: 25.31,
    fontWeight: '600',
    color: TXT,
    fontFamily: FONTS.loraBold,
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
    paddingTop: 30,                                                              // 50 → 30 (-20 px top margin per user)
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
  infoTitle: {                                                                   // Lora 600 per user
    fontSize: 21,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    marginBottom: 14,
  },
  infoBody: {
    fontSize: 16,                    // +10% from 14.5
    fontFamily: LATO_REG,
    lineHeight: 23.4,                                                            // 26 → 23.4 (-10 % per user)
    color: TXTSUB,
  },
  flameSection: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: -1,                                                           // 7 → -1 (-8 px to the row below per user)
  },
  // Big numeral + two-line "Days\nPrayed" caption sit side-by-side, left
  // numeral / right caption (left-aligned), vertically centred.
  streakNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 5,
  },
  streakNum: {
    fontSize: 74,
    fontWeight: '700',
    color: TXT,
    lineHeight: 77,
  },
  streakLabel: {                                                                 // 13 → 13.65 (+5 % per user). Left-aligned, wraps to two lines via \n in the JSX.
    fontSize: 13.65,
    fontWeight: '700',
    color: TXT,
    letterSpacing: 2.4,
    textAlign: 'left',
    lineHeight: 17,
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
  statValue: {                                                                   // Lora 600 per user
    fontSize: 19,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    textAlign: 'center',
  },
  statValueXL: {                                                                 // Lora 600 per user
    fontSize: 23,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    textAlign: 'center',
  },
  statValueDate: {                                                               // Lora 600 per user
    fontSize: 16,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    textAlign: 'center',
    lineHeight: 22,
  },
  statLabel: {                       // "Streak started" / "Prayer streak" / "Max streak": +10% from 12
    fontSize: 13,
    fontFamily: LATO_REG,
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
    paddingBottom: 12,                                                           // 22 → 12 (-10 px between the two cards per user)
  },
  weekCard: {
    padding: 20,
    paddingTop: 16,                                                              // 20 → 16 (-4 px gap from card top to "This Week" per user)
    paddingBottom: 20,
    // Both cards locked to the same height so the home / milestone rhythm
    // matches per user. Tall enough to comfortably fit the 7-day circle row
    // + header in week-card AND the flame / progress / caption stack in
    // milestone-card.
    minHeight: 135,                                                              // 150 → 135 (-10 % per user; matches milestoneCard so the stack stays even)
    justifyContent: 'space-between',
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,                                                            // 23 → 14 — header sat too far from the SU–SA row per user
  },
  weekTitle: {                                                                   // 16 → 19.2 (+20 % per user). Lora 600.
    fontSize: 19.2,
    fontWeight: '600',
    color: TXT,
    fontFamily: FONTS.loraBold,
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
    paddingHorizontal: 14,
    minHeight: 135,                                                              // 150 → 135 (-10 %), stays equal to weekCard per user
    justifyContent: 'center',
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
    fontFamily: LATO_BOLD,
    color: TXT,
  },
  milestoneMiddle: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  milestoneMoreDays: {                                                           // matches weekTitle size per user (19.2 Lora 600)
    fontSize: 19.2,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
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
    fontFamily: LATO_REG,
    color: TXTSUB,
    textAlign: 'center',
    lineHeight: 20,
  },
  footerCard: {
    paddingHorizontal: P + 10,                                                   // +10 px both sides per user (so the two lines sit further from the screen edges)
    paddingTop: 19,                                                              // 29 → 19 (-10 px top margin per user)
    paddingBottom: 19,
  },
  footerTitle: {                                                                 // medium-dark grey per user (between TXT and TXTSUB), centered
    fontSize: 16.56,
    fontFamily: LATO_REG,
    color: 'rgba(30,27,46,0.78)',
    marginBottom: 9,
    textAlign: 'center',
  },
  footerBody: {                                                                  // centered per user
    fontSize: 14,
    fontFamily: LATO_REG,
    color: TXTSUB,
    lineHeight: 20.7,
    textAlign: 'center',
  },
});
