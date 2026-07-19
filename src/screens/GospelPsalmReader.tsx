import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ImageBackground,
  ActivityIndicator, AppState,
  type NativeSyntheticEvent, type NativeScrollEvent, type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import LottieView from 'lottie-react-native';
import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer } from 'expo-audio';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS, BTN_RADIUS } from '../constants/theme';
import { useGospelsPsalms, type Slot } from '../state/GospelsPsalmsContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useTranslation } from '../state/TranslationsContext';
import { fetchChapter, type Verse } from '../services/bibleService';
import { localizeBookName } from '../constants/bibleBookNames';
import { useT } from '../i18n/useT';
import { logEvent } from '../services/firebase';
import { maybeShowInterstitial } from '../services/ads';
import type { RootStackScreenProps } from '../navigation/types';
import { GOSPELS_PSALMS_PLAN, type PsalmRef, type GPlanDay } from '../constants/gospelsPsalmsPlan';

// Gospel & Psalm reader. Morning shows a Gospel chapter + a Psalm; Evening
// shows the Psalm alone. Layout mirrors the daily-verse reading screen the
// user referenced: hero photo (morning = Verse-of-Day image, evening =
// Verse-of-Night image) → section title + reference rule → serif body, with
// share / copy actions, a background-music toggle in the header, and an Amen
// button that marks the slot done. All colours/fonts are the app's own.

interface Section {
  caption: string;     // "Gospels of the Day" / "Psalms of the Day"
  reference: string;   // "Matthew 7" / "Psalms 47:2-7"
  body: string;        // joined verse text
}

function rangeText(verses: Verse[], ref?: PsalmRef): string {
  let vs = verses;
  if (ref?.vStart != null && ref?.vEnd != null) {
    vs = verses.filter(v => v.verse >= ref.vStart! && v.verse <= ref.vEnd!);
  }
  return vs.map(v => v.text.trim()).join('\n');
}

// `psalmBook` = the localized name for Psalms (e.g. "诗篇"), so the reference
// line follows the UI language instead of always reading "Psalms".
function psalmReference(ref: PsalmRef, psalmBook: string): string {
  return ref.vStart != null && ref.vEnd != null
    ? `${psalmBook} ${ref.chapter}:${ref.vStart}-${ref.vEnd}`
    : `${psalmBook} ${ref.chapter}`;
}

export default function GospelPsalmReader({ route, navigation }: RootStackScreenProps<'GospelPsalm'>) {
  const { slot } = route.params;
  const insets = useSafeAreaInsets();
  const t = useT();
  const { total, round, markDone, morning: mView, evening: eView, planComplete } = useGospelsPsalms();
  const prayerBg = usePrayerBackgrounds();
  const { current: translation } = useTranslation();
  const morning = slot === 'morning';
  // Per-slot view — morning and evening advance independently, so THIS
  // reader renders its own slot's current day.
  const sv = morning ? mView : eView;
  const today = sv.today;
  const accent = morning ? ROSE : LAV;

  const [sections, setSections] = useState<Section[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);   // bump to re-run the fetch after a failure

  // Background music — ambient (NOT the spoken narration). Per user, this must
  // sound DIFFERENT from the Verse-card music (which plays this slot's track),
  // so we deliberately pull the OPPOSITE slot's track. Auto-plays on enter.
  // Memoized so the source object identity is stable — otherwise useAudioPlayer
  // rebuilds the player on every render (stutter / leaked handles).
  const musicSlot = morning ? 'evening' : 'morning';
  const audioSource = useMemo(() => prayerBg.audioFor(musicSlot), [prayerBg, musicSlot]);
  const player = useAudioPlayer(audioSource ?? null);
  const [musicOn, setMusicOn] = useState(true);   // auto-play on enter
  useEffect(() => {
    if (!audioSource) return;
    try {
      player.loop = true;
      if (musicOn) player.play();
      else player.pause();
    } catch { /* player may be null on unsupported envs */ }
  }, [musicOn, audioSource, player]);
  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);
  // Pause when the app leaves the foreground so the ambient music never keeps
  // playing in the background (call, app switch, lock); resume on return only
  // if the user still has it on.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') { try { player.pause(); } catch {} }
      else { try { if (musicOn && audioSource) player.play(); } catch {} }
    });
    return () => sub.remove();
  }, [player, musicOn, audioSource]);

  // Fetch the day's scripture. Morning = gospel chapter + morning psalm;
  // evening = evening psalm only. Verse text comes from the corpus CDN
  // (cached by fetchChapter), so a revisit is instant + offline-safe.
  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setFailed(false);
    (async () => {
      try {
        const psalmBook = localizeBookName(translation.code, 'psalms', 'Psalms');
        const out: Section[] = [];
        if (morning) {
          const g = await fetchChapter(translation.code, translation.source, today.gospel.bookSlug, today.gospel.chapter);
          out.push({
            caption: t('gp.gospelsOfDay'),
            reference: `${localizeBookName(translation.code, today.gospel.bookSlug, today.gospel.bookName)} ${today.gospel.chapter}`,
            body: rangeText(g.verses),
          });
        }
        const pref = morning ? today.morningPsalm : today.eveningPsalm;
        const ps = await fetchChapter(translation.code, translation.source, 'psalms', pref.chapter);
        out.push({
          caption: t('gp.psalmsOfDay'),
          reference: psalmReference(pref, psalmBook),
          body: rangeText(ps.verses, pref),
        });
        if (!cancelled) setSections(out);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [morning, today, translation.code, translation.source, retry]);

  // Prefetch caching: warm BOTH today's full set and TOMORROW's into the
  // fetchChapter AsyncStorage cache (fire-and-forget). Per user — so a user
  // who opens the app on a no-signal subway the next day still has that day's
  // Gospel + Psalms available offline. fetchChapter no-ops when already cached.
  const warmDay = useCallback((d?: GPlanDay) => {
    if (!d) return;
    const f = (slug: string, ch: number) =>
      fetchChapter(translation.code, translation.source, slug, ch).catch(() => {});
    f(d.gospel.bookSlug, d.gospel.chapter);
    f('psalms', d.morningPsalm.chapter);
    f('psalms', d.eveningPsalm.chapter);
  }, [translation.code, translation.source]);
  useEffect(() => {
    // Warm BOTH slots' current day + their tomorrows — the two slots may sit
    // on different plan days now. fetchChapter dedupes, so overlap costs nil.
    warmDay(mView.today);
    if (mView.day < total) warmDay(GOSPELS_PSALMS_PLAN[mView.day]); // day is 1-based → index = tomorrow
    warmDay(eView.today);
    if (eView.day < total) warmDay(GOSPELS_PSALMS_PLAN[eView.day]);
  }, [mView.today, mView.day, eView.today, eView.day, total, warmDay]);

  const heroImg = useMemo(() => prayerBg.imageFor(slot), [prayerBg, slot]);

  // Copy the WHOLE reading (all sections) — replaces the old per-section share,
  // which used the verse-card template that truncated the long Gospel+Psalm.
  const onCopyAll = async () => {
    if (!sections) return;
    const text = sections.map(s => `${s.caption}\n${s.reference}\n\n${s.body}`).join('\n\n———\n\n');
    await Clipboard.setStringAsync(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // After Amen, show a celebration overlay (instead of jumping straight back)
  // so the reading clearly registers — and, importantly, it tells the user WHY
  // the "Day N/89" counter doesn't move yet (it advances the next calendar day
  // once both slots are done). Continue there returns home.
  const [showDone, setShowDone] = useState(false);
  const onAmen = () => {
    markDone(slot);
    logEvent('gospel_psalm_complete', { slot, day: sv.day, round });
    setShowDone(true);
  };

  // Amen stays disabled (grey) until the reader has been scrolled to the end,
  // so the user can only complete after reading the whole passage (per user).
  // Short passages that fit on screen with no scroll enable immediately (see
  // onContentSizeChange) so the button is never permanently stuck.
  const [atBottom, setAtBottom] = useState(false);
  const scrollLayoutH = useRef(0);
  const contentH = useRef(0);
  // If the passage fits on screen (not scrollable) there's nothing to scroll
  // past, so Amen unlocks immediately. We can only know this once BOTH the
  // viewport height (onLayout) and content height (onContentSizeChange) are in,
  // and those two callbacks can fire in either order — so recompute from both.
  const maybeUnlockShort = () => {
    if (scrollLayoutH.current > 0 && contentH.current > 0 && contentH.current <= scrollLayoutH.current + 4) {
      setAtBottom(true);
    }
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 28) setAtBottom(true);
  };
  const onScrollLayout = (e: LayoutChangeEvent) => { scrollLayoutH.current = e.nativeEvent.layout.height; maybeUnlockShort(); };
  const onContentSizeChange = (_w: number, h: number) => { contentH.current = h; maybeUnlockShort(); };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerBtn}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('gp.readerTitle')}</Text>
        <TouchableOpacity onPress={() => setMusicOn(m => !m)} hitSlop={12} style={styles.headerBtn} disabled={!audioSource}>
          <Feather
            name="music"
            size={22}
            color={!audioSource ? 'rgba(30,27,46,0.25)' : musicOn ? accent : TXT}
          />
        </TouchableOpacity>
      </View>

      {!sections && !failed && (
        <View style={styles.center}><ActivityIndicator color={accent} /></View>
      )}
      {failed && (
        <View style={styles.center}>
          <Text style={styles.errText}>{t('gp.loadError')}</Text>
          <TouchableOpacity
            onPress={() => { setFailed(false); setSections(null); setRetry(r => r + 1); }}
            activeOpacity={0.85}
            style={[styles.retryBtn, { backgroundColor: accent }]}
          >
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {sections && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onLayout={onScrollLayout}
          onContentSizeChange={onContentSizeChange}
        >
          <ImageBackground source={heroImg} style={styles.hero} resizeMode="cover" />

          {sections.map((s, i) => (
            <Animated.View key={s.caption} entering={FadeIn.duration(320).delay(i * 80)} style={styles.sectionWrap}>
              <Text style={styles.sectionCaption}>{s.caption}</Text>
              <View style={styles.refRow}>
                <View style={styles.refLine} />
                <Text style={styles.refText}>{s.reference}</Text>
                <View style={styles.refLine} />
              </View>
              {/* Each verse rendered as its own paragraph so we can give a 10px
                  after-gap (per user); Merriweather body, line-height −10%. */}
              {s.body.split('\n').filter(Boolean).map((para, j) => (
                <Text key={j} style={styles.body}>{para}</Text>
              ))}
            </Animated.View>
          ))}

          {/* Single Copy button — copies the entire reading (share removed:
              the verse-card share template truncated the long Gospel+Psalm). */}
          <TouchableOpacity onPress={onCopyAll} activeOpacity={0.8} style={styles.copyAllBtn}>
            <Feather name="copy" size={18} color={accent} />
            <Text style={[styles.copyAllText, { color: accent }]}>{t('common.copy')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Amen — marks this slot complete. Pinned to the bottom over the scroll.
          Disabled (grey) until the passage is scrolled to the end. */}
      <View style={[styles.amenWrap, { paddingBottom: insets.bottom + 24 }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={atBottom ? onAmen : undefined}
          disabled={!atBottom}
          activeOpacity={0.9}
          style={[styles.amenBtn, atBottom ? { backgroundColor: accent } : styles.amenBtnDisabled]}
        >
          <Text style={[styles.amenText, !atBottom && styles.amenTextDisabled]}>{t('prayerFlow.amen')}</Text>
        </TouchableOpacity>
      </View>

      {copied && (
        <View style={[styles.toast, { bottom: insets.bottom + 90 }]} pointerEvents="none">
          <Text style={styles.toastText}>{t('common.copied')}</Text>
        </View>
      )}

      {showDone && (
        <GPDoneCard
          slot={slot}
          day={sv.day}
          total={total}
          slotComplete={sv.complete}
          planComplete={planComplete}
          nextRound={round + 1}
          accent={accent}
          onContinue={() => {
            // Interstitial at this natural break — reading is complete and the
            // user is returning home. Frequency-capped (60s floor) + remove-ads
            // aware inside the service, so it won't double-pop with a just-shown
            // prayer_end ad.
            maybeShowInterstitial('gospel_end');
            // popToTop, NOT goBack: tapping a reminder while a reader is open
            // can stack PrayerFlow→(replace)→a second reader on top of a stale
            // first one — goBack would land on that stale reader instead of
            // home. popToTop always lands on Tabs; in the normal single-reader
            // stack it's identical to goBack.
            navigation.popToTop();
          }}
        />
      )}
    </View>
  );
}

// Completion celebration shown after Amen. Single-slot (morning and evening
// advance independently now, so cross-slot pills would mislead): confirms the
// reading, then one message — round complete / this slot's 89 all done /
// "day N+1 continues tomorrow" — so the pacing never looks "stuck".
// Confetti celebration that bursts from BEHIND the checkmark on the completion
// card. Same asset as PlanDayDone's plan-complete animation; plays ONCE.
const LOTTIE_CONGRATS = require('../../assets/lottie/plan-congrats.json');

function GPDoneCard({
  slot, day, total, slotComplete, planComplete, nextRound, accent, onContinue,
}: {
  slot: Slot; day: number; total: number;
  slotComplete: boolean; planComplete: boolean; nextRound: number;
  accent: string; onContinue: () => void;
}) {
  const t = useT();
  const gradient = slot === 'morning'
    ? (['#FEF1F6', '#FBDCE9', '#FCE1ED'] as const)
    : (['#F1EDF8', '#DDD2EF', '#E5DBF4'] as const);

  const pop = useSharedValue(0);
  useEffect(() => { pop.value = withSpring(1, { damping: 9, stiffness: 140, mass: 0.7 }); }, [pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const message = planComplete
    ? t('gpDone.roundComplete', { round: nextRound })
    : slotComplete
      ? t(slot === 'morning' ? 'gpDone.morningAllDone' : 'gpDone.eveningAllDone')
      : t('gpDone.nextTomorrow', { next: Math.min(total, day + 1) });

  return (
    <View style={styles.doneOverlay}>
      <LinearGradient colors={gradient} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <View style={styles.checkWrap}>
        {/* Confetti sits BEHIND the checkmark and plays once (per user). */}
        <LottieView source={LOTTIE_CONGRATS} autoPlay loop={false} style={styles.congratsLottie} />
        <Animated.View style={[styles.doneCheck, { backgroundColor: accent }, popStyle]}>
          {/* -15 % glyph (54 → 46); white tick thickened ~50 % via a same-colour
              text-shadow (Feather is an icon font, so no true stroke width). */}
          <Feather name="check" size={46} color="#FFFFFF" style={styles.checkGlyph} />
        </Animated.View>
      </View>

      <Animated.Text entering={FadeInDown.duration(360).delay(120)} style={styles.doneTitle}>
        {slot === 'morning' ? t('gpDone.morningTitle') : t('gpDone.eveningTitle')}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.duration(360).delay(200)} style={styles.doneDay}>
        {t('gpDone.dayOf', { day, total })}
      </Animated.Text>

      <Animated.Text entering={FadeInDown.duration(360).delay(360)} style={styles.doneMsg}>
        {message}
      </Animated.Text>

      <Animated.View entering={FadeInDown.duration(360).delay(440)} style={styles.doneBtnWrap}>
        <TouchableOpacity onPress={onContinue} activeOpacity={0.9} style={[styles.doneBtn, { backgroundColor: accent }]}>
          <Text style={styles.doneBtnText}>{t('common.continue')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: P, paddingBottom: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errText: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { marginTop: 18, height: 44, borderRadius: 22, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  hero: { width: '100%', height: 215, backgroundColor: '#EADFE8' },
  sectionWrap: { paddingHorizontal: P + 7, paddingTop: 26 },
  sectionCaption: {
    fontSize: 25, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold,
    textAlign: 'center', marginBottom: 14,
  },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, paddingHorizontal: 6 },
  refLine: { flex: 1, height: 1, backgroundColor: 'rgba(30,27,46,0.18)' },
  refText: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.3 },
  body: {
    // Byte-matched to the home Verse card body (PrayerScreen `heroText`) per
    // user: same face, size, and line-height. Only the colour differs — the
    // hero text is white on a dark photo; the reader sits on a light page, so
    // it keeps the dark TXT colour for legibility.
    fontFamily: FONTS.merriweather,     // = heroText
    fontSize: 17.82,                    // 19.16 → 17.82 (-7 % per user)
    lineHeight: 34.03,                  // 29.59 → 34.03 (+15 % line spacing per user)
    color: TXT,
    marginBottom: 14.38,                // 12.5 → 14.38 (+15 % paragraph spacing per user)
  },
  copyAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    alignSelf: 'center', marginTop: 18, paddingVertical: 10, paddingHorizontal: 18,
  },
  copyAllText: { fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  amenWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: P + 7, alignItems: 'center',
  },
  amenBtn: {
    alignSelf: 'stretch', height: 50.54, borderRadius: 17.07,   // 53.2 → 50.54 (-5 % per user)
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
  },
  // Locked state until the passage is read to the end — flat grey, no shadow.
  amenBtnDisabled: {
    backgroundColor: '#DEDAE3',
    shadowOpacity: 0, elevation: 0,
  },
  amenText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.5, fontFamily: FONTS.loraBold },
  amenTextDisabled: { color: '#A49DAE' },
  toast: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(30,27,46,0.88)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 14, fontFamily: FONTS.latoBold, letterSpacing: 0.4 },

  // Completion celebration overlay.
  doneOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  // Fixed box that holds the confetti (behind) + the checkmark (on top),
  // centered on the same point. Owns the gap to the title below.
  checkWrap: { width: 260, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  congratsLottie: { ...StyleSheet.absoluteFillObject },
  doneCheck: {
    width: 92, height: 92, borderRadius: 46,                                       // 108 → 92 (-15 % per user)
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 8,
  },
  checkGlyph: { textShadowColor: '#FFFFFF', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1.1 },   // ~+50 % bolder tick
  doneTitle: {
    fontSize: 26, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT,
    textAlign: 'center', marginBottom: 8,
  },
  doneDay: {
    fontSize: 14, fontFamily: FONTS.lato, color: TXTSUB, letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 22,
  },
  doneMsg: {
    fontSize: 17.05, fontFamily: FONTS.lato, letterSpacing: 0.4, color: 'rgba(30,27,46,0.72)',   // 15.5 → 17.05 (+10 % per user)
    textAlign: 'center', lineHeight: 25.3, marginBottom: 60, paddingHorizontal: 10,               // marginBottom 30 → 60 (CTA gap +30 px per user)
  },
  doneBtnWrap: { alignSelf: 'stretch', paddingHorizontal: 8 },
  // Matches the app's canonical CTA (ROSE, BTN_RADIUS, sans-serif bold) — the
  // radius was a full 26 pill before; now identical to buttons elsewhere.
  doneBtn: {
    height: 52, borderRadius: BTN_RADIUS, alignItems: 'center', justifyContent: 'center',
    shadowColor: ROSE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 4,
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.3, fontFamily: FONTS.sansBold },
});
