import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer } from 'expo-audio';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useGospelsPsalms } from '../state/GospelsPsalmsContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useTranslation } from '../state/TranslationsContext';
import { fetchChapter, type Verse } from '../services/bibleService';
import { localizeBookName } from '../constants/bibleBookNames';
import { useT } from '../i18n/useT';
import { logEvent } from '../services/firebase';
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
  const { today, day, total, markDone } = useGospelsPsalms();
  const prayerBg = usePrayerBackgrounds();
  const { current: translation } = useTranslation();
  const morning = slot === 'morning';
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
    warmDay(today);
    if (day < total) warmDay(GOSPELS_PSALMS_PLAN[day]); // day is 1-based → index `day` = tomorrow
  }, [today, day, total, warmDay]);

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

  const onAmen = () => {
    markDone(slot);
    logEvent('gospel_psalm_complete', { slot, day: today.day });
    navigation.goBack();
  };

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

      {/* Amen — marks this slot complete. Pinned to the bottom over the scroll. */}
      <View style={[styles.amenWrap, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={onAmen} activeOpacity={0.9} style={[styles.amenBtn, { backgroundColor: accent }]}>
          <Text style={styles.amenText}>{t('prayerFlow.amen')}</Text>
        </TouchableOpacity>
      </View>

      {copied && (
        <View style={[styles.toast, { bottom: insets.bottom + 90 }]} pointerEvents="none">
          <Text style={styles.toastText}>{t('common.copied')}</Text>
        </View>
      )}
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
  errText: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.lato, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { marginTop: 18, height: 44, borderRadius: 22, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold },
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
    fontFamily: FONTS.merriweather,     // Merriweather per user (was Source Serif)
    fontSize: 21,
    lineHeight: 30.6,                    // 34 → 30.6 (−10 % line spacing per user)
    color: TXT,
    marginBottom: 10,                    // 10px after each paragraph per user
  },
  copyAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    alignSelf: 'center', marginTop: 18, paddingVertical: 10, paddingHorizontal: 18,
  },
  copyAllText: { fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold },
  amenWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: P + 7, alignItems: 'center',
  },
  amenBtn: {
    alignSelf: 'stretch', height: 53.2, borderRadius: 17.07,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
  },
  amenText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.5, fontFamily: FONTS.loraBold },
  toast: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(30,27,46,0.88)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 14, fontFamily: FONTS.latoBold },
});
