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
): { count: number; weekFlags: boolean[]; todayIdx: number } {
  const today = new Date();
  const todayIdx = today.getDay();             // 0 = Sunday
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - todayIdx);
  const weekFlags: boolean[] = [];
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const r = recordOn(dateKey(d));
    const prayedThatDay = r.m || r.e;
    weekFlags.push(prayedThatDay);
    if (i <= todayIdx && prayedThatDay) count += 1;
  }
  return { count, weekFlags, todayIdx };
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
  const { recordOn } = usePrayer();
  const { count, weekFlags, todayIdx } = countPrayersThisWeek(recordOn);
  const accent = morning ? ROSE : LAV;

  // Today's Gospel & Psalms — if the slot matching this prayer isn't read yet,
  // surface a "next" card with a Start button below the weekly card.
  const { ready: gpReady, day: gpDay, total: gpTotal, morningDone, eveningDone } = useGospelsPsalms();
  const showNext = gpReady && !(morning ? morningDone : eveningDone);

  // Headline: morning gets a rotating affirmation (10 phrases, by day);
  // evening keeps the prayer-count tier. Each resolves to a catalog key so
  // every language renders its own form.
  const headlineKey = morning
    ? MORNING_KEYS[(new Date().getDate() - 1) % MORNING_KEYS.length]
    : count >= 7 ? 'weekly.headline.perfect' :
      count >= 5 ? 'weekly.headline.onFire' :
      count >= 3 ? 'weekly.headline.halfway' :
      count === 2 ? 'weekly.headline.twoStrong' :
                    'weekly.headline.greatStart';
  const headline = t(headlineKey);

  return (
    <View style={styles.root}>
      {/* Full-screen pink gradient + soft blurry blobs. Renders behind all
          content as a non-interactive backdrop. The blobs are oversized
          translucent circles that extend past the screen edges; their
          low opacity + scale + overlap blends them into the gradient with
          no hard color boundaries (no native blur lib needed). */}
      <BackgroundDecor morning={morning} />

      <Hero morning={morning} />

      <Animated.View
        entering={SlideInDown.duration(500).delay(200).easing(Easing.out(Easing.cubic))}
        style={styles.card}
      >
        <View style={styles.dayRow}>
          {DAY_LABELS.map((d, i) => {
            const isToday = i === todayIdx;
            const done = weekFlags[i];
            // A completed day (past OR today) shows the praying-hands glyph on
            // a yellow fill. Today is additionally marked with an accent ring
            // (~30% bolder border) to read as "today / selected".
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
                  <PrayingHandsGlyph color={accent} />
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
                <Text style={styles.nextTitle} numberOfLines={1}>{t('gp.section')}</Text>
                <Text style={styles.nextSub} numberOfLines={1}>{t('gp.cardTitle', { day: gpDay, total: gpTotal })}</Text>
              </View>
              <TouchableOpacity onPress={onStartGospelPsalm} activeOpacity={0.85} style={[styles.nextStartBtn, { backgroundColor: accent }]}>
                <Text style={styles.nextStartText}>{t('weekly.next.start')}</Text>
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

function Hero({ morning }: { morning: boolean }) {
  return (
    <View style={styles.hero}>
      <LottieView
        source={morning ? HERO_LOTTIE : FIRE_LOTTIE}                             // morning = plant, evening = streak fire (per user)
        autoPlay
        loop={false}                                                             // play once, hold the final frame
        style={{ width: 230, height: 230 }}
      />
    </View>
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
  nextCard: {
    marginHorizontal: 16,
    marginTop: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  nextMeta: { flex: 1, minWidth: 0 },
  nextLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 3 },
  nextTitle: { fontSize: 16, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
  nextSub: { fontSize: 13, color: TXTSUB, marginTop: 2 },
  nextStartBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  nextStartText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  laterBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  laterText: { fontSize: 15, fontWeight: '600' },
});
