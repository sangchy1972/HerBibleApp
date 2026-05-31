import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import MoodEmoji, { MOOD_LIST, type Mood } from '../components/MoodEmoji';
import MoodCalendar from '../components/MoodCalendar';
import { getMoodVerse, getFunFacts, type FunFact } from '../constants/moodContent';
import { useUILanguage } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { ROSE, TXT, TXTSUB, FONTS, SERIF_BODY } from '../constants/theme';
import type { RootStackScreenProps } from '../navigation/types';
import { useT } from '../i18n/useT';

type Step = 'pick' | 'verse' | 'calendar' | 'fact';

const SCREEN_W = Dimensions.get('window').width;
// Tiles deliberately shrunk to ~90% of the natural 3-col-fit-width.
// The 0.9 multiplier shaves ~10% off both card width AND emoji size (emoji
// inherits from TILE_W via `TILE_W * 0.62`). Extra horizontal space lands
// as outer padding on the grid wrap so the row stays centered without
// changing the inter-card gap — the visual hierarchy gets a bit more
// breathing room while keeping the 3×3 layout intact.
const TILE_W = ((SCREEN_W - 16 * 2 - 12 * 2) / 3) * 0.9;
const GRID_OUTER_PAD = (SCREEN_W - (TILE_W * 3 + 12 * 2)) / 2;

export default function MoodFlow({ navigation }: RootStackScreenProps<'MoodFlow'>) {
  const insets = useSafeAreaInsets();
  const { todayMood, recordPick } = useMoodCheckIn();
  const { lang } = useUILanguage();
  // Localized fact list, memoized so the array reference is stable across
  // re-renders. Re-resolves only on lang switch — that's the only time
  // the user expects the deck to flip to a different language.
  const funFacts = useMemo(() => getFunFacts(lang), [lang]);
  const [step, setStep] = useState<Step>(todayMood ? 'calendar' : 'pick');
  const [factIdx, setFactIdx] = useState(() => Math.floor(Math.random() * funFacts.length));
  const mood: Mood | null = todayMood ?? null;

  const exit = () => navigation.goBack();

  const onPick = (m: Mood) => {
    recordPick(m);
    setStep('verse');
  };

  return (
    <View style={styles.root}>
      {/* Top-right close lives on the picker only. The verse and calendar
          steps each have their own primary CTA — a redundant × there is
          visual noise. */}
      {step === 'pick' && (
        <View style={[styles.topRow, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={exit} style={styles.closeBtn} hitSlop={10}>
            <Feather name="x" size={22} color={TXT} />
          </TouchableOpacity>
        </View>
      )}
      {(step === 'verse' || step === 'calendar') && (
        <View style={{ paddingTop: insets.top + 8, paddingBottom: 6 }} />
      )}

      {step === 'pick' && <PickStep onPick={onPick} />}
      {step === 'verse' && mood && <VerseStep mood={mood} onClose={() => setStep('calendar')} />}
      {step === 'calendar' && <CalendarStep onContinue={exit} />}
      {step === 'fact' && (
        <FactModal
          fact={funFacts[factIdx]}
          onShuffle={() => setFactIdx(i => (i + 1) % funFacts.length)}
          onShare={() => { /* hook into ShareVerseSheet later if needed */ }}
          onClose={() => setStep('calendar')}
        />
      )}
    </View>
  );
}

// ─── Step 1: Pick a mood ──────────────────────────────────────────────────────
function PickStep({ onPick }: { onPick: (m: Mood) => void }) {
  const t = useT();
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.pickWrap}>
      <Text style={styles.pickTitle}>{t('mood.howFeel')}</Text>
      <View style={styles.grid}>
        {MOOD_LIST.map((m) => (
          <TouchableOpacity key={m} style={styles.tile} activeOpacity={0.85} onPress={() => onPick(m)}>
            <View style={styles.tileFace}>
              <MoodEmoji mood={m} size={TILE_W * 0.62} />
            </View>
            <Text style={styles.tileLabel}>{t(`mood.label.${m}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Step 3: Calendar review ────────────────────────────────────────────────
// Calendar step. The Done CTA sits INSIDE the scroll, 50 px below the calendar
// (not pinned to the screen bottom — on tall phones the pinned button was a
// long reach, and on short phones it clipped below the calendar). Everything
// scrolls, so the button is always reachable regardless of device height.
function CalendarStep({ onContinue }: { onContinue: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.calWrap}
      contentContainerStyle={[styles.calScroll, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <MoodCalendar />
      <TouchableOpacity style={styles.calCta} onPress={onContinue} activeOpacity={0.9}>
        <Text style={styles.calCtaText}>{t('common.done')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step 2: Verse for the chosen mood ───────────────────────────────────────
function VerseStep({ mood, onClose }: { mood: Mood; onClose: () => void }) {
  const t = useT();
  const { lang } = useUILanguage();
  const v = getMoodVerse(mood, lang);
  const today = new Date();
  const dateStr = today.toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric', year: 'numeric' });
  // Pick the same prayer-bg image library the home verse card uses, so the
  // mood card carries an actual photo backdrop instead of a brown gradient.
  // Slot is time-of-day based — keeps the card feeling situated in the
  // moment the user opens MoodFlow rather than always using one orientation.
  const prayerBg = usePrayerBackgrounds();
  const hr = today.getHours();
  const slot: 'morning' | 'evening' = hr >= 5 && hr < 18 ? 'morning' : 'evening';
  const bgSource = prayerBg.imageFor(slot);

  // Animation cascade per user spec:
  //   • Title  — fade in over 500 ms starting at t=0
  //   • Card   — fade in over 800 ms starting at t=500 (right when title settles)
  //   • Close  — fade in over 500 ms starting at t=1300 (right when card settles)
  // Sequential, no overlap; total reveal time = 1800 ms.
  return (
    <View style={styles.verseWrap}>
      <Animated.View entering={FadeIn.duration(500)}>
        <Text style={styles.verseHeaderTitle}>
          {t('mood.verseHeading', { mood: t(`mood.label.${mood}`).toLowerCase() })}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(500).duration(800)} style={styles.verseCardWrap}>
        <ImageBackground source={bgSource} style={styles.verseCard} imageStyle={styles.verseCardImage} resizeMode="cover">
          {/* Soft top-to-bottom scrim so white text holds against any photo
              — mirrors the gradient veil on PrayerScreen's hero card. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
            start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.verseInner}>
            <Text style={styles.verseDate}>{dateStr}</Text>
            <Text style={styles.verseRef}>{v.ref}</Text>
            <Text style={styles.verseText}>{v.text}</Text>
          </View>
        </ImageBackground>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(1300).duration(500)} style={styles.verseCloseWrap}>
        <TouchableOpacity onPress={onClose} style={styles.verseCloseBtn} activeOpacity={0.9}>
          <Text style={styles.verseCloseText}>{t('prayerFlow.close')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}



// ─── Step 4: Did You Know? card ─────────────────────────────────────────────
function FactModal({
  fact, onShuffle, onShare, onClose,
}: {
  fact: FunFact;
  onShuffle: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <View style={styles.factOverlay}>
      <View style={StyleSheet.absoluteFillObject as any} pointerEvents="none">
        <View style={styles.factScrim} />
      </View>
      <Animated.View entering={FadeIn.duration(220)} style={styles.factCard}>
        <View style={styles.factHeaderRow}>
          <Text style={styles.factTitle}>{t('moodFlow.fact.title')}</Text>
          <TouchableOpacity onPress={onShuffle} hitSlop={10}>
            <Feather name="refresh-cw" size={20} color={TXT} />
          </TouchableOpacity>
        </View>
        <Text style={styles.factBody}>{fact.text}</Text>
        {fact.relatedRefs.length > 0 && (
          <>
            <Text style={styles.factSub}>{t('moodFlow.fact.related')}</Text>
            {fact.relatedRefs.map((r: string) => (
              <Text key={r} style={styles.factRef}>{r}</Text>
            ))}
          </>
        )}
        <View style={styles.factDivider} />
        <View style={styles.factActions}>
          <TouchableOpacity onPress={onShare} style={styles.factAction} hitSlop={10}>
            <Feather name="share-2" size={18} color="#A8744D" />
            <Text style={[styles.factActionText, { color: ROSE }]}>{t('moodFlow.fact.share')}</Text>
          </TouchableOpacity>
          <View style={styles.factActionSep} />
          <TouchableOpacity onPress={onClose} style={styles.factAction} hitSlop={10}>
            <Text style={[styles.factActionText, { color: ROSE }]}>{t('moodFlow.fact.close')}</Text>
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

  // Pick step. GRID_OUTER_PAD recalculates whenever TILE_W changes so the
  // 3×3 grid stays horizontally centered after the 10% shrink — gap
  // between tiles is unchanged, the extra width lands on the outside.
  pickWrap: { flex: 1, paddingHorizontal: GRID_OUTER_PAD, paddingTop: 36 },
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

  // Verse step — title at top, photo card in the middle, Close CTA at
  // the bottom. Margins match user spec: 50 px between title↔card and
  // card↔button. Card height bumped via paddingVertical so the verse copy
  // has room to breathe at the new shape.
  verseWrap: { flex: 1, paddingHorizontal: 22, paddingTop: 12, justifyContent: 'flex-start' },
  // Title — Lora 600 (`FONTS.loraBold` + fontWeight 600 per the project
  // memory rule; 700 makes Android drop Lora and fall back to system sans).
  verseHeaderTitle: {
    fontFamily: FONTS.loraBold,
    fontWeight: '600',
    color: TXT,
    fontSize: 24,
    lineHeight: 32,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 50,                      // 50 px gap to the card below per user
  },
  // Photo card. Backdrop image is the same prayer-bg the home verse card
  // pulls from, with a dark scrim painted on top for text contrast. Height
  // bumped per user — minHeight gives the card room to settle taller than
  // the old brown rectangle while still letting tall verses expand it.
  verseCardWrap: {
    marginBottom: 50,                      // 50 px gap to the Close button below per user
  },
  verseCard: {
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 360,                        // was implicit ~270 — taller card per user
    paddingVertical: 38,
    paddingHorizontal: 26,
    justifyContent: 'center',
    // Same shadow recipe as PrayerScreen.heroCard so the card lifts off
    // the page the same way the home verse card does.
    backgroundColor: '#2D0A1A',            // fallback while the photo loads
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.084,
    shadowRadius: 5.6,
  },
  verseCardImage: {
    // Match the outer borderRadius so the photo doesn't ghost a hairline
    // outside the card during transitions.
    borderRadius: 14,
  },
  verseInner: {
    // Sits above the scrim. Text styles mirror PrayerScreen.hero{Label,Ref,Text}
    // 1:1 — same Serif body face, same opsz/wght variation, same colour
    // treatment — so the mood card and the home card read as one design.
  },
  verseDate: {
    fontSize: 12.52,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 8,
  },
  verseRef: {
    fontSize: 18.3,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
    marginBottom: 24,
  },
  verseText: {
    fontFamily: FONTS.serif,
    fontVariationSettings: SERIF_BODY,
    fontSize: 17.82,
    lineHeight: 27.54,
    color: 'rgba(255,255,255,0.96)',
  },
  // Close button — byte-for-byte mirror of PrayerScreen.styles.startBtn:
  // same ROSE fill, same 49.41 px height, same 17.07 px radius, same
  // alignSelf stretch so it spans the card width. The wrap is just a
  // pass-through (no margin — margins live on the card wrap above).
  verseCloseWrap: { alignSelf: 'stretch' },
  verseCloseBtn: {
    backgroundColor: ROSE,
    height: 49.41,
    borderRadius: 17.07,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verseCloseText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Calendar step — everything lives in one scroll. calWrap is the ScrollView;
  // calScroll its content container (bottom padding added inline w/ safe area).
  calWrap: { flex: 1, paddingHorizontal: 18, paddingTop: 4 },
  calScroll: { paddingTop: 4 },
  // Done CTA mirrors PrayerScreen.styles.startBtn 1:1 (ROSE fill, 49.41 height,
  // 17.07 radius, stretch). Sits 50 px below the calendar inside the scroll.
  calCta: {
    marginTop: 50,
    backgroundColor: ROSE,
    height: 49.41,
    borderRadius: 17.07,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calCtaText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

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


