import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ImageBackground,
  ActivityIndicator, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer } from 'expo-audio';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';
import { useGospelsPsalms } from '../state/GospelsPsalmsContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useTranslation } from '../state/TranslationsContext';
import { fetchChapter, type Verse } from '../services/bibleService';
import ShareVerseSheet from '../components/ShareVerseSheet';
import { useT } from '../i18n/useT';
import type { RootStackScreenProps } from '../navigation/types';
import type { PsalmRef } from '../constants/gospelsPsalmsPlan';

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

function psalmReference(ref: PsalmRef): string {
  return ref.vStart != null && ref.vEnd != null
    ? `Psalms ${ref.chapter}:${ref.vStart}-${ref.vEnd}`
    : `Psalms ${ref.chapter}`;
}

export default function GospelPsalmReader({ route, navigation }: RootStackScreenProps<'GospelPsalm'>) {
  const { slot } = route.params;
  const insets = useSafeAreaInsets();
  const t = useT();
  const { today, markDone } = useGospelsPsalms();
  const prayerBg = usePrayerBackgrounds();
  const { current: translation } = useTranslation();
  const morning = slot === 'morning';
  const accent = morning ? ROSE : LAV;

  const [sections, setSections] = useState<Section[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shareTarget, setShareTarget] = useState<Section | null>(null);
  const [copied, setCopied] = useState(false);

  // Background music — reuse the prayer-screen ambient track for this slot
  // (NOT the spoken narration). Loops while the screen is open; user toggles
  // it from the header note icon. Starts OFF so we never autoplay audio.
  const audioSource = prayerBg.audioFor(slot);
  const player = useAudioPlayer(audioSource ?? null);
  const [musicOn, setMusicOn] = useState(false);
  useEffect(() => {
    try {
      if (musicOn) { player.loop = true; player.play(); }
      else player.pause();
    } catch { /* player may be null on unsupported envs */ }
  }, [musicOn, player]);
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
        const out: Section[] = [];
        if (morning) {
          const g = await fetchChapter(translation.code, translation.source, today.gospel.bookSlug, today.gospel.chapter);
          out.push({
            caption: t('gp.gospelsOfDay'),
            reference: `${today.gospel.bookName} ${today.gospel.chapter}`,
            body: rangeText(g.verses),
          });
        }
        const pref = morning ? today.morningPsalm : today.eveningPsalm;
        const ps = await fetchChapter(translation.code, translation.source, 'psalms', pref.chapter);
        out.push({
          caption: t('gp.psalmsOfDay'),
          reference: psalmReference(pref),
          body: rangeText(ps.verses, pref),
        });
        if (!cancelled) setSections(out);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [morning, today, translation.code, translation.source]);

  const heroImg = useMemo(() => prayerBg.imageFor(slot), [prayerBg, slot]);

  const onCopy = async (s: Section) => {
    await Clipboard.setStringAsync(`${s.reference}\n\n${s.body}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const onAmen = () => {
    markDone(slot);
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
        </View>
      )}

      {sections && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
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
              <Text style={styles.body}>{s.body}</Text>

              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setShareTarget(s)} hitSlop={10} style={styles.actionBtn}>
                  <Feather name="share-2" size={20} color={TXTSUB} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onCopy(s)} hitSlop={10} style={styles.actionBtn}>
                  <Feather name="copy" size={20} color={TXTSUB} />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}
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

      <Modal visible={!!shareTarget} animationType="fade" transparent onRequestClose={() => setShareTarget(null)}>
        {shareTarget && (
          <ShareVerseSheet
            reference={shareTarget.reference}
            text={shareTarget.body}
            bgSource={heroImg}
            onClose={() => setShareTarget(null)}
          />
        )}
      </Modal>
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
  errText: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.lato },
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
    fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY,
    fontSize: 21, lineHeight: 34, color: TXT,
  },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 56, marginTop: 22 },
  actionBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
