import React from 'react';
import { View, Text, ImageBackground, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { ROSE, LAV, TXT, TXTSUB } from '../constants/theme';
import { usePrayer } from '../state/PrayerContext';

// Drop your flat-illustration art at assets/weekly-jesus.png and uncomment.
// Until then we render a soft gradient with a placeholder badge.
const HERO_SOURCE: number | null = null;
// const HERO_SOURCE = require('../../assets/weekly-jesus.png');

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
    weekFlags.push(r.m || r.e);
    if (i <= todayIdx) count += (r.m ? 1 : 0) + (r.e ? 1 : 0);
  }
  return { count, weekFlags, todayIdx };
}

interface Props {
  morning: boolean;
  onOpenReminder: () => void;
  onBack: () => void;
}

export default function WeeklyProgressView({ morning, onOpenReminder, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { recordOn } = usePrayer();
  const { count, weekFlags, todayIdx } = countPrayersThisWeek(recordOn);
  const accent = morning ? ROSE : LAV;

  const headline =
    count >= 7 ? 'A perfect week!' :
    count >= 5 ? "You're on fire!" :
    count >= 3 ? 'Halfway through the week!' :
    count === 2 ? 'Two days strong!' :
    'Great start of the week!';

  return (
    <View style={styles.root}>
      {/* Full-screen pink gradient + soft blurry blobs. Renders behind all
          content as a non-interactive backdrop. The blobs are oversized
          translucent circles that extend past the screen edges; their
          low opacity + scale + overlap blends them into the gradient with
          no hard color boundaries (no native blur lib needed). */}
      <BackgroundDecor />

      <Hero />

      <Animated.View
        entering={SlideInDown.duration(500).delay(200).easing(Easing.out(Easing.cubic))}
        style={styles.card}
      >
        <View style={styles.dayRow}>
          {DAY_LABELS.map((d, i) => {
            const isToday = i === todayIdx;
            const done = weekFlags[i];
            return (
              <View
                key={i}
                style={[
                  styles.dayCircle,
                  done && { borderColor: accent, backgroundColor: `${accent}1A` },
                  isToday && styles.dayCircleToday,
                ]}
              >
                {isToday ? (
                  <PrayingHandsGlyph color={accent} />
                ) : (
                  <Text style={[styles.dayLetter, done && { color: accent, fontWeight: '700' }]}>{d}</Text>
                )}
              </View>
            );
          })}
        </View>

        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.sub}>
          Your <Text style={[styles.subStrong, { color: accent }]}>{ordinal(count)}</Text> prayer of the week!
        </Text>

        <TouchableOpacity onPress={onOpenReminder} activeOpacity={0.85} style={[styles.reminderBtn, { backgroundColor: ROSE }]}>
          <View style={styles.reminderIcon}>
            <PrayingHandsGlyph color={ROSE} small />
            <View style={styles.reminderDot} />
          </View>
          <Text style={styles.reminderText}>Open Daily Verse Reminder</Text>
          <View style={styles.reminderToggle}>
            <View style={styles.reminderKnob} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Spacer between card and Back: flex:1 expands to fill the remaining
          vertical space; minHeight: 24 guarantees at least 24 px even on
          short phones where the card + hero eat into the available area.
          Replaces the old `backWrap` flex container that collapsed when
          hero + card content together exceeded the screen and pushed Back
          up against the card edge. */}
      <View style={styles.spacer} />

      <Animated.View entering={FadeIn.duration(360).delay(360)}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={[styles.backBtn, { marginBottom: insets.bottom + 24 }]}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// Background gradient + decorative blurry blobs. Sits in absoluteFill so
// content (hero, card, back) renders on top with no z-index ceremony.
function BackgroundDecor() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        // Soft pink → deeper pink → soft pink — top-left to bottom-right.
        // Four stops with low-contrast neighbors mean no visible band.
        colors={['#FBE5EF', '#F8C5DA', '#F0A8C9', '#FAD2E4']}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Oversized translucent circles, partially off-screen, with
          opacities in the 0.2–0.5 range. Overlapping at low alpha
          stacks the tints additively for a painterly, no-edge feel. */}
      <View style={[styles.blob, styles.blobA]} />
      <View style={[styles.blob, styles.blobB]} />
      <View style={[styles.blob, styles.blobC]} />
      <View style={[styles.blob, styles.blobD]} />
      <View style={[styles.blob, styles.blobE]} />
    </View>
  );
}

function Hero() {
  if (HERO_SOURCE) {
    return <ImageBackground source={HERO_SOURCE} style={styles.hero} resizeMode="cover" />;
  }
  // No image yet — leave the hero area transparent so the global gradient
  // + blobs show through. The placeholder tag is centered so the user can
  // still see exactly where the asset slot is during development.
  return (
    <View style={styles.hero}>
      <View style={styles.placeholderTag} pointerEvents="none">
        <Feather name="image" size={18} color="rgba(255,255,255,0.95)" />
        <Text style={styles.placeholderText}>assets/weekly-jesus.png</Text>
      </View>
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
  blobA: {
    width: 380, height: 380,
    backgroundColor: 'rgba(232,97,154,0.22)',   // ROSE @ 22 %
    top: -110, right: -90,
  },
  blobB: {
    width: 460, height: 460,
    backgroundColor: 'rgba(255,255,255,0.32)',
    top: '8%', left: -200,
  },
  blobC: {
    width: 300, height: 300,
    backgroundColor: 'rgba(249,168,201,0.45)',  // soft pink @ 45 %
    top: '18%', right: -60,
  },
  blobD: {
    width: 360, height: 360,
    backgroundColor: 'rgba(252,217,232,0.55)',  // very-light pink @ 55 %
    bottom: -80, left: -100,
  },
  blobE: {
    width: 240, height: 240,
    backgroundColor: 'rgba(232,97,154,0.16)',   // ROSE @ 16 %
    bottom: '12%', right: -50,
  },
  card: {
    marginTop: -32,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
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
  dayCircleToday: {
    borderWidth: 0,
    backgroundColor: '#F4D58A',
    shadowColor: '#F4B860',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  dayLetter: { fontSize: 13, color: TXTSUB, fontWeight: '600' },
  headline: {
    fontSize: 22,
    fontWeight: '700',
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
    borderRadius: 18,
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
  // Replaces the old `backWrap` (flex:1 + justifyContent:'flex-end' +
  // paddingTop:32). That layout collapsed when hero + card + reminder
  // button together overflowed available height — paddingTop went away,
  // Back hit the card edge. Now the spacer's minHeight:24 is a hard
  // floor that survives even when the rest is squeezed.
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  backBtn: {
    marginHorizontal: 16,
    height: 56,
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
  backText: { fontSize: 18, fontWeight: '700', color: TXT },
});
