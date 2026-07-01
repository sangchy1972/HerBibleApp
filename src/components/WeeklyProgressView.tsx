import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import LottieView from 'lottie-react-native';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB, FONTS } from '../constants/theme';
import { usePrayer } from '../state/PrayerContext';
import { useT } from '../i18n/useT';
import { useGospelsPsalms } from '../state/GospelsPsalmsContext';

// Hero animation (replaces the old assets/weekly-jesus.png placeholder slot):
// the user's plant-loader Lottie, extracted from dotLottie into plain JSON.
// Plays ONCE on mount and freezes on its final frame (loop={false} holds the
// last frame in lottie-react-native).
const HERO_LOTTIE = require('../../assets/lottie/weekly-plant.json');
// Evening completion shows the streak fire instead of the plant (per user).
const FIRE_LOTTIE = require('../../assets/lottie/fire-streak.json');

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Counts DAYS prayed this week, not prayer sessions. v1 added morning and
// evening separately (`(r.m?1:0)+(r.e?1:0)`), so finishing both prayers on
// the same day read "Two Days Strong! / Your 2nd prayer of the week" — wrong
// per user: morning + evening on one calendar day is ONE day. A day counts
// as prayed when it has at least one completed session (matching the day
// circles, which already used m || e).
function countPrayersThisWeek(
  recordOn: (k: string) => { m: boolean; e: boolean },
): { count: number; weekFlags: boolean[]; bothFlags: boolean[]; todayIdx: number } {
  const today = new Date();
  const todayIdx = today.getDay();             // 0 = Sunday
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - todayIdx);
  const weekFlags: boolean[] = [];
  // bothFlags[i] = that day had BOTH morning AND evening done → a fully
  // completed day, which the calendar marks with the streak-fire glyph
  // (a partially-done day keeps the praying-hands glyph). Per user.
  const bothFlags: boolean[] = [];
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const r = recordOn(dateKey(d));
    const prayedThatDay = r.m || r.e;
    weekFlags.push(prayedThatDay);
    bothFlags.push(r.m && r.e);
    if (i <= todayIdx && prayedThatDay) count += 1;
  }
  return { count, weekFlags, bothFlags, todayIdx };
}

// 10 morning headlines, rotated by calendar day so each morning reads fresh.
const MORNING_KEYS = [
  'weekly.morning.h1', 'weekly.morning.h2', 'weekly.morning.h3', 'weekly.morning.h4', 'weekly.morning.h5',
  'weekly.morning.h6', 'weekly.morning.h7', 'weekly.morning.h8', 'weekly.morning.h9', 'weekly.morning.h10',
];

interface Props {
  morning: boolean;
  onOpenReminder: () => void;
  onBack: () => void;
  /** Open today's Gospel & Psalms reader for this slot (the "next" CTA). */
  onStartGospelPsalm: () => void;
}

export default function WeeklyProgressView({ morning, onOpenReminder, onBack, onStartGospelPsalm }: Props) {
  const t = useT();
  const { recordOn, mDone, eDone } = usePrayer();
  const { count, weekFlags, bothFlags, todayIdx } = countPrayersThisWeek(recordOn);
  const accent = morning ? ROSE : LAV;

  // Day completion is what drives the hero + today's calendar glyph — NOT which
  // slot was just prayed. Per user: the FIRST prayer of the day (morning OR
  // evening) shows the growing sapling; once BOTH are done the day is complete
  // and we switch to the streak fire (hero + calendar). markDone() already ran
  // for the just-finished slot before this screen mounts, so these are current.
  const dayComplete = mDone && eDone;

  // Today's Gospel & Psalms — if the slot matching this prayer isn't read yet,
  // surface a "next" card with a Continue button below the weekly card.
  const { ready: gpReady, day: gpDay, total: gpTotal, morningDone, eveningDone } = useGospelsPsalms();
  const showNext = gpReady && !(morning ? morningDone : eveningDone);

  // Headline (resolves to a catalog key so every language renders its own form):
  //   • day complete (both done) → weekly milestone tier, regardless of which
  //     slot finished last — so finishing the 2nd prayer always reads as a
  //     "day done" celebration.
  //   • first prayer of the day is the MORNING one → a rotating fresh-morning
  //     affirmation (10 phrases by day).
  //   • first prayer of the day is the EVENING one → the neutral milestone tier
  //     (the morning phrases are morning-specific, so we don't use them at night).
  const headlineKey = dayComplete || !morning
    ? count >= 7 ? 'weekly.headline.perfect' :
      count >= 5 ? 'weekly.headline.onFire' :
      count >= 3 ? 'weekly.headline.halfway' :
      count === 2 ? 'weekly.headline.twoStrong' :
                    'weekly.headline.greatStart'
    : MORNING_KEYS[(new Date().getDate() - 1) % MORNING_KEYS.length];
  const headline = t(headlineKey);

  return (
    <View style={styles.root}>
      {/* Full-screen pink gradient + soft blurry blobs. Renders behind all
          content as a non-interactive backdrop. The blobs are oversized
          translucent circles that extend past the screen edges; their
          low opacity + scale + overlap blends them into the gradient with
          no hard color boundaries (no native blur lib needed). */}
      <BackgroundDecor morning={morning} />

      <Hero dayComplete={dayComplete} />

      <Animated.View
        entering={SlideInDown.duration(500).delay(200).easing(Easing.out(Easing.cubic))}
        style={styles.card}
      >
        <View style={styles.dayRow}>
          {DAY_LABELS.map((d, i) => {
            const isToday = i === todayIdx;
            const done = weekFlags[i];
            const both = bothFlags[i];
            // A prayed day (past OR today) gets a yellow fill. A FULLY completed
            // day (both morning + evening) shows the streak-fire glyph; a
            // partially completed day keeps the praying-hands glyph (per user).
            // Today is additionally marked with an accent ring to read as
            // "today / selected".
            return (
              <View
                key={i}
                style={[
                  styles.dayCircle,
                  done && styles.dayDone,
                  isToday && { borderWidth: 2, borderColor: accent },
                ]}
              >
                {done ? (
                  both ? <FireGlyph /> : <PrayingHandsGlyph color={accent} />
                ) : (
                  <Text style={styles.dayLetter}>{d}</Text>
                )}
              </View>
            );
          })}
        </View>

        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.sub}>
          {t('weekly.subPrefix')} <Text style={[styles.subStrong, { color: accent }]}>{ordinal(count)}</Text> {t('weekly.subSuffix')}
        </Text>

        <TouchableOpacity onPress={onOpenReminder} activeOpacity={0.85} style={[styles.reminderBtn, { backgroundColor: accent }]}>
          <View style={styles.reminderIcon}>
            <PrayingHandsGlyph color={accent} small />
            <View style={styles.reminderDot} />
          </View>
          <Text style={styles.reminderText}>{t('weekly.openReminder')}</Text>
          <View style={styles.reminderToggle}>
            <View style={styles.reminderKnob} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Below the card: when today's Gospel & Psalms isn't read, a "next"
          card (with Start) is the primary CTA + a small "Maybe later" keeps
          the plain dismiss. Otherwise the plain Back button. 50 px below the
          card per user; text color follows the slot accent. */}
      <Animated.View entering={FadeIn.duration(360).delay(360)}>
        {showNext ? (
          <>
            <View style={styles.nextCard}>
              <View style={styles.nextMeta}>
                <Text style={[styles.nextLabel, { color: accent }]}>{t('weekly.next.label')}</Text>
                <Text style={styles.nextTitle} numberOfLines={1}>
                  {t('gp.section')}<Text style={styles.nextProgress}>  {gpDay}/{gpTotal}</Text>
                </Text>
              </View>
              {/* Continue sits full-width at the BOTTOM of the card so tapping it
                  reads as "carry straight on into Gospel & Psalm" (per user). */}
              <TouchableOpacity onPress={onStartGospelPsalm} activeOpacity={0.85} style={[styles.nextContinueBtn, { backgroundColor: accent }]}>
                <Text style={styles.nextContinueText}>{t('weekly.next.start')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.laterBtn}>
              <Text style={[styles.laterText, { color: accent }]}>{t('weekly.later')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={styles.backBtn}>
            <Text style={[styles.backText, { color: accent }]}>{t('weekly.back')}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

// Background gradient + decorative blurry blobs. Sits in absoluteFill so
// content (hero, card, back) renders on top with no z-index ceremony.
// Morning/evening picks the palette: pink gradient + rose blobs for morning,
// lavender gradient + lav blobs for evening. Blob alphas pulled lighter per
// user — the circles were reading too solid against the gradient.
function BackgroundDecor({ morning }: { morning: boolean }) {
  const gradient = morning
    ? (['#FEF1F6', '#FBDCE9', '#F6C5DC', '#FCE1ED'] as const)                      // soft pinks, lighter than before
    : (['#F1EDF8', '#DDD2EF', '#C8B6E4', '#E5DBF4'] as const);                     // soft lavenders
  // Each blob's tint follows the palette. Alphas all pulled down a notch
  // (≤ 0.30) per user — the previous values (up to 0.55) made the circles
  // look like distinct shapes instead of soft washes.
  const blobs = morning
    ? {
        a: 'rgba(232,97,154,0.14)',                                                // ROSE @ 14 % (was 22)
        b: 'rgba(255,255,255,0.28)',                                               // white @ 28 % (was 32)
        c: 'rgba(249,168,201,0.28)',                                               // soft pink @ 28 % (was 45)
        d: 'rgba(252,217,232,0.32)',                                               // very-light pink @ 32 % (was 55)
        e: 'rgba(232,97,154,0.10)',                                                // ROSE @ 10 % (was 16)
      }
    : {
        a: 'rgba(134,107,192,0.14)',                                               // LAV @ 14 %
        b: 'rgba(255,255,255,0.28)',
        c: 'rgba(186,160,233,0.28)',                                               // soft lavender
        d: 'rgba(220,205,242,0.32)',                                               // very-light lavender
        e: 'rgba(134,107,192,0.10)',
      };
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={gradient}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.blob, styles.blobA, { backgroundColor: blobs.a }]} />
      <View style={[styles.blob, styles.blobB, { backgroundColor: blobs.b }]} />
      <View style={[styles.blob, styles.blobC, { backgroundColor: blobs.c }]} />
      <View style={[styles.blob, styles.blobD, { backgroundColor: blobs.d }]} />
      <View style={[styles.blob, styles.blobE, { backgroundColor: blobs.e }]} />
    </View>
  );
}

function Hero({ dayComplete }: { dayComplete: boolean }) {
  return (
    <View style={styles.hero}>
      <LottieView
        source={dayComplete ? FIRE_LOTTIE : HERO_LOTTIE}                         // both prayers done = streak fire; first of the day = growing sapling (per user)
        autoPlay
        loop={dayComplete}                                                       // fire LOOPS so it keeps burning (its end frame is empty → looked like it vanished); the sapling still plays once and holds its grown final frame
        style={{ width: 195.5, height: 195.5 }}                                  // 230 → 195.5 (-15 % per user)
      />
    </View>
  );
}

// Streak-fire glyph for the calendar's fully-completed days (both prayers
// done). Small monochrome flame in the slot accent — distinct from the
// praying-hands used for partially-done days.
function FireGlyph({ color = '#F2722B' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M12.8 2 C12.8 5.2 9.2 6.6 9.2 10.8 C8 9.8 7.6 8.2 7.6 8.2 C6.6 9.6 6 11.3 6 13.2 C6 16.95 8.69 20 12 20 C15.31 20 18 16.95 18 13.2 C18 10.2 16.2 7.6 15.2 6.2 C14.7 8 13.4 8.6 13.4 6.8 C13.4 5 13.2 3.4 12.8 2 Z"
        fill={color}
      />
      <Path
        d="M12 12 C12 13.6 10.8 14.4 10.8 16 C10.8 17.2 11.3 18.2 12 18.2 C12.7 18.2 13.2 17.2 13.2 16.2 C13.2 15 12 14.4 12 12 Z"
        fill="#FFE9A8"
      />
    </Svg>
  );
}

function PrayingHandsGlyph({ color, small }: { color: string; small?: boolean }) {
  const size = small ? 18 : 22;
  // Simple stylised praying hands (two leaf-like shapes meeting at center).
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11.4 2.5 C9.8 2.8, 9 4.5, 9 7 L9 13 C9 15, 8.2 16.5, 6 17.5 L6 19 C6 20, 7 21, 8 21 L11.4 21 L11.4 2.5 Z"
        fill={color}
      />
      <Path
        d="M12.6 2.5 C14.2 2.8, 15 4.5, 15 7 L15 13 C15 15, 15.8 16.5, 18 17.5 L18 19 C18 20, 17 21, 16 21 L12.6 21 L12.6 2.5 Z"
        fill={color}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // Base color is the lightest stop of the gradient so a flash of solid
  // background during initial paint matches the gradient's top-left.
  root: { flex: 1, backgroundColor: '#FBE5EF' },
  hero: {
    height: '38%',
    marginTop: 30,                                                               // +30 px from the top edge per user
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  placeholderTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    // Darker tag so it stays legible over the bright pink gradient.
    backgroundColor: 'rgba(30,27,46,0.32)',
  },
  placeholderText: { color: 'rgba(255,255,255,0.95)', fontSize: 13, fontWeight: '600' },
  // Decorative blobs — large, soft, translucent. Position is hand-tuned
  // so the colors stack pleasantly in the upper third (where the hero
  // shows through) and ease off below the card.
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  // Blob positions + sizes only — backgroundColor is supplied inline by
  // BackgroundDecor so morning/evening palettes can swap without forking
  // five styles.
  blobA: { width: 380, height: 380, top: -110, right: -90 },
  blobB: { width: 460, height: 460, top: '8%', left: -200 },
  blobC: { width: 300, height: 300, top: '18%', right: -60 },
  blobD: { width: 360, height: 360, bottom: -80, left: -100 },
  blobE: { width: 240, height: 240, bottom: '12%', right: -50 },
  card: {
    marginTop: -22,                                                              // -32 → -22 (+10 px gap below the lottie per user)
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,                                                            // 22 → 11 (-50 % per user)
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 6,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(30,27,46,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Completed day — yellow fill, no border. The accent "today" ring is added
  // inline only for the current day (replaces the old today-only style).
  dayDone: {
    borderWidth: 0,
    backgroundColor: '#F4D58A',
  },
  dayLetter: { fontSize: 13, color: TXTSUB, fontWeight: '600' },
  headline: {
    fontSize: 22,
    fontWeight: '600',                                                            // project rule: loraBold + 600 (700 → Android system sans)
    fontFamily: FONTS.loraBold,                                                   // Lora bold per user
    color: TXT,
    textAlign: 'center',
    marginBottom: 6,
  },
  sub: {
    fontSize: 18,
    color: TXT,
    textAlign: 'center',
    marginBottom: 22,
  },
  subStrong: { fontWeight: '700' },
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10.8,                                                          // 18 → 10.8 (-40 % per user)
    marginHorizontal: -8,                                                        // bleed ~8 px each side past the card padding ≈ +5 % width (per user)
  },
  reminderIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  reminderDot: {
    position: 'absolute', top: 4, right: 4,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFE066',
  },
  reminderText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  reminderToggle: {
    width: 40, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'flex-end',
    paddingHorizontal: 2,
  },
  reminderKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
  backBtn: {
    marginHorizontal: 16,
    marginTop: 50,                                                                // 50 px below the card per user (was pushed to screen bottom by a flex:1 spacer)
    height: 47.6,                                                                 // 56 → 47.6 (-15 % per user)
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  backText: { fontSize: 18, fontWeight: '700' },                                  // color set inline (morning → ROSE / evening → LAV)
  // Gospel & Psalms "next" card — shown in the Back slot when today's reading
  // isn't done. Same 50 px top gap as the Back button.
  // Vertical layout (was a single row): meta on top, full-width Continue at the
  // bottom. The column + button make the card ~60 % taller per user.
  nextCard: {
    marginHorizontal: 16,
    marginTop: 30,                                                                // 50 → 30 (-20 px gap to the weekly card above per user)
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingVertical: 36,                                                          // 20 → 36 (+~30 % card height per user)
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  nextMeta: { minWidth: 0 },
  nextLabel: { fontSize: 12.65, fontFamily: FONTS.lato, fontWeight: '600', letterSpacing: 1.2, marginBottom: 4, textAlign: 'center' },  // Lato 600; centered with the title per user
  nextTitle: { fontSize: 20.24, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold, textAlign: 'center' },   // 17.6 → 20.24 (+15 %), centered per user
  nextProgress: { fontSize: 16.1, color: TXTSUB, fontFamily: FONTS.lato, fontWeight: '600' },                        // "1/89" inline; +15 % to track the title
  nextContinueBtn: {
    marginTop: 20,                                                               // 16 → 20 (a little more breathing room in the taller card)
    alignSelf: 'stretch',
    height: 54,                                                                  // 46 → 54 (taller card per user)
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextContinueText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  laterBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  laterText: { fontSize: 15, fontWeight: '600' },
});
