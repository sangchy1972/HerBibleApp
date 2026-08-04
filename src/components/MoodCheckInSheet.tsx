import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions,
  ImageBackground, Keyboard, Platform, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeIn, useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS, cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import MoodInputCard from './mood/MoodInputCard';
import MonthCalendar from './mood/MonthCalendar';
import { type Mood } from './MoodEmoji';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { useUILanguage } from '../state/UILanguageContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { getMoodVerse } from '../constants/moodContent';
import { monthStats } from '../state/moodStats';
import { localeFor } from '../i18n/locale';
import { useT } from '../i18n/useT';
import { ROSE, BTN_RADIUS, TXT, FONTS } from '../constants/theme';

const SCREEN_H = Dimensions.get('window').height;
const TOP_GAP = 50;   // sheets rise to ~full height, leaving 50px at the top
// Slow, curved rise (per user): 0.6 s on a long-tail deceleration — quick to
// commit, then a soft landing, so the sheet reads as gliding into place.
const ENTER_MS = 600;
const RISE_EASE = Easing.bezier(0.22, 1, 0.36, 1);

type Step = 'input' | 'verse' | 'done';

// Global daily mood bottom-sheet. Mounted once at the app root; renders only
// when the context's promptVisible flag is set (self-triggered once/day) AND
// the nudge coordinator has granted it the single on-screen slot.
export default function MoodCheckInSheet() {
  const { promptVisible } = useMoodCheckIn();
  const coord = useNudgeCoordinator();
  useEffect(() => {
    if (promptVisible) {
      // Daily ritual → ignoresBudget (shows alongside a reward/nudge, but still
      // strictly one overlay at a time).
      coord.requestSlot({ id: 'moodCheckIn', priority: NUDGE_PRIORITY.moodCheckIn, canShow: () => true, ignoresBudget: true });
    } else {
      coord.releaseSlot('moodCheckIn');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptVisible]);
  if (!promptVisible || !coord.isActive('moodCheckIn')) return null;
  return <Sheet />;
}

function Sheet() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang } = useUILanguage();
  const { closePrompt, recordPick, picks } = useMoodCheckIn();

  const [step, setStep] = useState<Step>('input');
  const [saved, setSaved] = useState<Mood | null>(null);
  const { height: winH } = useWindowDimensions();

  // Keyboard avoidance: an absolute-fill bottom sheet can't rely on
  // KeyboardAvoidingView on Android, so track the keyboard height directly and
  // pad the scroll content by it, then scroll the focused note into view.
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

  // Entrance via shared values (matches the app's sheet idiom). 420 → 600 ms
  // per user, on a long-tail deceleration curve so it reads as ONE slow,
  // deliberate rise rather than a snap. The backdrop fades across most of that
  // span instead of beating the sheet to the screen.
  const backdropO = useSharedValue(0);
  const sheetTY = useSharedValue(SCREEN_H);
  useEffect(() => {
    backdropO.value = withTiming(1, { duration: 440, easing: Easing.out(Easing.quad) });
    sheetTY.value = withTiming(0, { duration: ENTER_MS, easing: RISE_EASE });
    // Watchdog: if the rise is cancelled/dropped (saturated UI thread, dev fast
    // refresh), snap the sheet into place. Without this the sheet could sit
    // off-screen while its backdrop dims the app — visible lock-up.
    // MUST bail once we're leaving: dismissing inside this window used to let
    // the watchdog cancel the exit and slam the sheet back to fully visible,
    // where it sat inert until the exit watchdog unmounted it.
    enterWatchdog.current = setTimeout(() => {
      if (closingRef.current) return;
      cancelAnimation(sheetTY); cancelAnimation(backdropO);
      sheetTY.value = 0; backdropO.value = 1;
    }, ENTER_MS + 400);
    return () => { if (enterWatchdog.current) clearTimeout(enterWatchdog.current); };
  }, [backdropO, sheetTY]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));
  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTY.value }] }));

  // Guarded so a double-tap can't restart the exit timing, and the overlay stops
  // intercepting touches the moment it starts leaving (it used to keep eating
  // them for the whole 260 ms slide-out).
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (exitTimer.current) clearTimeout(exitTimer.current); }, []);
  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    if (enterWatchdog.current) { clearTimeout(enterWatchdog.current); enterWatchdog.current = null; }
    backdropO.value = withTiming(0, { duration: 200 });
    sheetTY.value = withTiming(SCREEN_H, { duration: 260, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(closePrompt)();
    });
    // Watchdog: a dropped runOnJS would leave this mounted forever (promptVisible
    // stuck true). closePrompt is idempotent, so firing twice is harmless.
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(closePrompt, 700);
  };

  const onSave = (mood: Mood, note: string) => {
    Keyboard.dismiss();
    recordPick(mood, note);
    setSaved(mood);
    setStep('verse');
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString(localeFor(lang), { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    // The ROOT is box-none, always: it spans the whole screen (including the
    // top), so if it ever captured touches while the sheet was invisible —
    // entrance animation dropped, exit callback lost — the user would see the
    // home screen and be unable to tap ANYTHING. Only the backdrop (a
    // deliberate dismiss target) and the sheet itself capture, and both go
    // inert while leaving.
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]}
        pointerEvents={closing ? 'none' : 'auto'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={dismiss} />
      </Animated.View>

      {/* The BODY goes inert while leaving too — the header comment promised
          this but only the backdrop had it, so a tap on Save during the 260 ms
          exit still ran recordPick + setStep on an unmounting sheet. */}
      <Animated.View
        style={[styles.sheet, { height: winH - TOP_GAP }, sheetAnim]}
        pointerEvents={closing ? 'none' : 'auto'}
      >
        <View style={styles.handle} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingBottom: kb > 0 ? kb + 16 : insets.bottom + 24,
            // Fill the tall sheet + center the content so a short step (input /
            // verse) has no bottom-only gap. When the keyboard is up the content
            // outgrows the viewport → this is ignored and it scrolls to the end.
            flexGrow: 1,
            justifyContent: 'center',
          }}
        >
          {step === 'input' && (
            <Animated.View key="input" entering={FadeIn.duration(220)}>
              <MoodInputCard
                dateLabel={dateLabel}
                title={t('moodCheckIn.input.title')}
                saveLabel={t('moodCheckIn.input.save')}
                onSave={onSave}
                onClose={dismiss}
              />
            </Animated.View>
          )}

          {step === 'verse' && saved && (
            <Animated.View key="verse" entering={FadeIn.duration(320)}>
              <VerseStep mood={saved} onContinue={() => setStep('done')} />
            </Animated.View>
          )}

          {step === 'done' && (
            <Animated.View key="done" entering={FadeIn.duration(320)}>
              <DoneStep picks={picks} onDone={dismiss} />
            </Animated.View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ── Verse step (waits for the user to tap Continue) ────────────────────────

// ── Verse-step choreography (3.3 s total, per user) ─────────────────────────
// The content beats overlap so it reads as one continuous reveal, and they all
// land by 2500. Then a deliberate HALF-SECOND of stillness — she finishes
// reading the verse before anything asks for a tap — and only then the button:
//   0    ─620─▶ heading fades up
//   450  ─700─▶ card fades + lifts + settles from 0.96
//   1100 ─200─▶ date
//   1250 ─250─▶ reference
//   1450 ─1050▶ verse, word by word (the "typing" beat)      → content done 2500
//   ...............  500 ms pause, nothing moves  ...............
//   3000 ─300─▶ Continue button                                   → ends at 3300
const VS_HEADING = { at: 0, ms: 620 };
const VS_CARD = { at: 450, ms: 700 };
const VS_DATE = { at: 1100, ms: 200 };
const VS_REF = { at: 1250, ms: 250 };
const VS_VERSE = { at: 1450, ms: 1050 };
const VS_CONTENT_END = VS_VERSE.at + VS_VERSE.ms;   // 2500
const VS_GAP = 500;
const VS_BTN = { at: VS_CONTENT_END + VS_GAP, ms: 300 };   // 3000
const VS_TOTAL = VS_BTN.at + VS_BTN.ms;   // 3300

// Words reveal in sequence off a single 0→1 value. Each word owns a slice of the
// timeline and fades+rises within it, so a long verse still finishes on time
// regardless of length. Word-level (not per-character) on purpose: a 100-char
// verse would mean 100 animated views on a low-end device for no visible gain.
function TypedText({ text, progress, style }: { text: string; progress: SharedValue<number>; style?: any }) {
  const words = useMemo(() => text.split(/(\s+)/).filter(w => w.length > 0), [text]);
  const n = words.filter(w => !/^\s+$/.test(w)).length || 1;
  let wordIdx = -1;
  return (
    <View style={styles.typedWrap}>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return <Text key={i} style={style}>{w}</Text>;
        wordIdx += 1;
        return <TypedWord key={i} word={w} index={wordIdx} total={n} progress={progress} style={style} />;
      })}
    </View>
  );
}

function TypedWord({ word, index, total, progress, style }: {
  word: string; index: number; total: number; progress: SharedValue<number>; style?: any;
}) {
  const st = useAnimatedStyle(() => {
    // Each word's window is 35 % of the timeline, offset by its position — so
    // words overlap and the line flows instead of ticking one at a time.
    const span = 0.35;
    const start = total > 1 ? (index / total) * (1 - span) : 0;
    const p = Math.min(1, Math.max(0, (progress.value - start) / span));
    return { opacity: p, transform: [{ translateY: (1 - p) * 5 }] };
  });
  return <Animated.Text style={[style, st]}>{word}</Animated.Text>;
}

function VerseStep({ mood, onContinue }: { mood: Mood; onContinue: () => void }) {
  const t = useT();
  const { lang } = useUILanguage();
  const v = getMoodVerse(mood, lang);
  const prayerBg = usePrayerBackgrounds();
  const hr = new Date().getHours();
  const slot: 'morning' | 'evening' = hr >= 5 && hr < 18 ? 'morning' : 'evening';
  const bgSource = prayerBg.imageFor(slot);
  const today = new Date();
  const dateStr = today.toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric', year: 'numeric' });

  // One shared value per beat; the card's texts share `textP` so their windows
  // stay locked to each other. Watchdog snaps everything visible if any timing
  // is dropped — a reveal that stalls must never leave the verse blank.
  const headP = useSharedValue(0);
  const cardP = useSharedValue(0);
  const dateP = useSharedValue(0);
  const refP = useSharedValue(0);
  const verseP = useSharedValue(0);
  const btnP = useSharedValue(0);
  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    headP.value = withTiming(1, { duration: VS_HEADING.ms, easing: ease });
    cardP.value = withDelay(VS_CARD.at, withTiming(1, { duration: VS_CARD.ms, easing: ease }));
    dateP.value = withDelay(VS_DATE.at, withTiming(1, { duration: VS_DATE.ms }));
    refP.value = withDelay(VS_REF.at, withTiming(1, { duration: VS_REF.ms }));
    verseP.value = withDelay(VS_VERSE.at, withTiming(1, { duration: VS_VERSE.ms, easing: Easing.linear }));
    btnP.value = withDelay(VS_BTN.at, withTiming(1, { duration: VS_BTN.ms, easing: ease }));
    const wd = setTimeout(() => {
      headP.value = 1; cardP.value = 1; dateP.value = 1; refP.value = 1; verseP.value = 1; btnP.value = 1;
    }, VS_TOTAL + 600);
    return () => clearTimeout(wd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const headStyle = useAnimatedStyle(() => ({ opacity: headP.value, transform: [{ translateY: (1 - headP.value) * 12 }] }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardP.value,
    transform: [{ translateY: (1 - cardP.value) * 16 }, { scale: 0.96 + cardP.value * 0.04 }],
  }));
  const dateStyle = useAnimatedStyle(() => ({ opacity: dateP.value }));
  const refStyle = useAnimatedStyle(() => ({ opacity: refP.value }));
  const btnStyle = useAnimatedStyle(() => ({ opacity: btnP.value, transform: [{ translateY: (1 - btnP.value) * 10 }] }));

  return (
    <View style={{ paddingTop: 12 }}>
      <Animated.Text style={[styles.verseTitle, headStyle]}>
        {t('mood.verseHeading', { mood: t(`mood.label.${mood}`).toLowerCase() })}
      </Animated.Text>
      <Animated.View style={[styles.verseCardWrap, cardStyle]}>
        <ImageBackground source={bgSource} style={styles.verseCard} imageStyle={styles.verseCardImg} resizeMode="cover">
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
            start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View>
            <Animated.Text style={[styles.verseDate, dateStyle]}>{dateStr}</Animated.Text>
            <Animated.Text style={[styles.verseRef, refStyle]}>{v.ref}</Animated.Text>
            {/* The "typing" beat — words arrive in sequence. */}
            <TypedText text={v.text} progress={verseP} style={styles.verseText} />
          </View>
        </ImageBackground>
      </Animated.View>
      {/* Last beat. The animated style wraps the button rather than sitting on
          it, so the touchable itself is never Reanimated-owned once the reveal
          has finished (stale-hit-region rule this repo already follows). */}
      <Animated.View style={btnStyle}>
        <TouchableOpacity style={styles.doneBtn} activeOpacity={0.9} onPress={onContinue}>
          <Text style={styles.doneBtnText}>{t('common.continue')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── Month completion ──────────────────────────────────────────────────────
function DoneStep({ picks, onDone }: { picks: Record<string, Mood>; onDone: () => void }) {
  const t = useT();
  const now = new Date();
  const { count } = monthStats(picks, now.getFullYear(), now.getMonth());
  const entriesForCal = React.useMemo(() => {
    const m: Record<string, { mood: Mood; at: number }> = {};
    for (const [k, mood] of Object.entries(picks)) m[k] = { mood, at: 0 };
    return m;
  }, [picks]);
  return (
    <View style={{ paddingTop: 14 }}>
      <Text style={styles.doneTitle}>{t('moodCheckIn.done.title', { count })}</Text>
      <View style={{ marginTop: 18 }}>
        <MonthCalendar cursor={now} entries={entriesForCal} today={now} />
      </View>
      <TouchableOpacity style={styles.doneBtn} activeOpacity={0.9} onPress={onDone}>
        <Text style={styles.doneBtnText}>{t('moodCheckIn.done.cta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 210, elevation: 210 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#FBF7F6',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 8,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(30,27,46,0.16)', alignSelf: 'center', marginBottom: 6 },

  verseTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT,
    fontSize: 22, lineHeight: 30, textAlign: 'center', marginTop: 14, marginBottom: 26,
  },
  verseCardWrap: { marginBottom: 8 },
  verseCard: { borderRadius: 20, overflow: 'hidden', paddingTop: 56, paddingBottom: 72, paddingHorizontal: 24, backgroundColor: '#2D0A1A' },   // 14 → 18.2 (+30 % card radius per user)
  verseCardImg: { borderRadius: 20 },
  verseDate: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 8 },
  verseRef: { fontSize: 18.3, fontWeight: '700', color: '#fff', letterSpacing: 0.3, marginBottom: 22 },
  // Word-reveal container: row + wrap reproduces Text's line breaking.
  typedWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  verseText: { fontFamily: FONTS.merriweather, fontSize: 17.5, lineHeight: 27, color: 'rgba(255,255,255,0.96)' },

  doneTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT,
    fontSize: 24, lineHeight: 32, textAlign: 'center',
  },
  doneBtn: { marginTop: 26, backgroundColor: ROSE, height: 52, borderRadius: BTN_RADIUS, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
});
