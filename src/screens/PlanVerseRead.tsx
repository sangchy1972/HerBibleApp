import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { fetchChapter, type Chapter } from '../services/bibleService';
import { adjustFocus } from '../constants/versification';
import { useTranslation } from '../state/TranslationsContext';
import { localizeBookName, englishBookName } from '../constants/bibleBookNames';
import type { RootStackScreenProps } from '../navigation/types';
import { useT } from '../i18n/useT';

// Slim chapter view used by the plan flow's "tap a verse to read it in
// context" jump. Reuses fetchChapter + adjustFocus from the existing infra
// so cross-translation versification works the same as the main reader,
// but lives in its own stack frame so the back chevron always returns to
// the plan's verse list — never gets lost in the Bible tab.
//
// Auto-scrolls to the focus verses on load. Implementation: chapter is
// rendered in three inline-flow blocks (pre / focus / post) so the focus
// block can carry an `onLayout` and report its y. After layout we animate
// the scroll to land the focus block ~80 px below the header — close
// enough to feel intentional, far enough to give the eye context above.

const FOCUS_TOP_OFFSET = 80;

export default function PlanVerseRead({ route, navigation }: RootStackScreenProps<'PlanVerseRead'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { focus: incoming } = route.params;
  const { current: translation } = useTranslation();
  const focus = adjustFocus(translation.code, incoming);

  // Mirror the Bible reader's typography EXACTLY: Merriweather at the user's
  // saved reader size / line-height (same AsyncStorage key the reader + plan
  // walk use). Without this the jump-to-verse screen rendered in Source Serif
  // at a fixed size, looking nothing like the reader.
  const [readPrefs, setReadPrefs] = useState({ fontSize: 18, lineH: 1.8, paragraphSpacing: 24 });
  useEffect(() => {
    AsyncStorage.getItem('bible:reader-settings:v1').then(raw => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw);
        setReadPrefs(p => ({
          fontSize: typeof s.fontSize === 'number' ? s.fontSize : p.fontSize,
          lineH: typeof s.lineH === 'number' ? s.lineH : p.lineH,
          paragraphSpacing: typeof s.paragraphSpacing === 'number' ? s.paragraphSpacing : p.paragraphSpacing,
        }));
      } catch { /* keep defaults */ }
    }).catch(() => {});
  }, []);
  const bodyType = { fontFamily: FONTS.merriweather, fontSize: readPrefs.fontSize, lineHeight: readPrefs.fontSize * readPrefs.lineH };

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  // Latched after the first scroll fires so re-layouts (orientation change,
  // keyboard show, etc.) don't re-trigger the auto-jump and yank the user.
  const scrolledRef = useRef(false);

  useEffect(() => {
    setChapter(null);
    setError(null);
    scrolledRef.current = false;
    fetchChapter(translation.code, translation.source, focus.bookSlug, focus.chapter)
      .then(setChapter)
      .catch(() => setError(t('planRead.chapterError')));
  }, [translation.code, translation.source, focus.bookSlug, focus.chapter]);

  const onFocusLayout = (e: LayoutChangeEvent) => {
    if (scrolledRef.current) return;
    const y = e.nativeEvent.layout.y;
    scrolledRef.current = true;
    // requestAnimationFrame: defer one frame so the ScrollView's contentSize
    // is settled by the time we scroll — without this, scrollTo on the very
    // first layout pass can no-op on iOS.
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - FOCUS_TOP_OFFSET), animated: true });
    });
  };

  const bookName = localizeBookName(translation.code, focus.bookSlug, englishBookName(focus.bookSlug));
  const headerTitle = `${bookName} ${focus.chapter}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerSubtitle}>{t('plan.verseRead.back')}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>
      <View style={styles.divider} />

      {error ? (
        <View style={styles.empty}>
          <Feather name="cloud-off" size={36} color={TXTSUB} />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !chapter ? (
        <View style={styles.loading}><ActivityIndicator color={ROSE} /></View>
      ) : (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        >
          <Text style={styles.chapterLabel}>{t('plan.verseRead.chapter', { n: focus.chapter })}</Text>

          {/* Each verse is its own paragraph block (matches the Bible reader /
              plan walk) — the old inline single-Text made verses 3+ clump into
              one wall of text. Focus verses get the pink highlight + full color;
              the rest are dimmed for context. */}
          {chapter.verses.map((v) => {
            const inFocus = v.verse >= focus.verseStart && v.verse <= focus.verseEnd;
            const isFirstFocus = v.verse === focus.verseStart;
            return (
              <View
                key={v.verse}
                onLayout={isFirstFocus ? onFocusLayout : undefined}
                style={styles.verseBlock}
              >
                <Text style={[
                  bodyType,
                  { color: inFocus ? TXT : 'rgba(30,27,46,0.38)' },
                  inFocus ? styles.focusHl : null,
                ]}>
                  <Text style={[styles.verseNum, { color: inFocus ? ROSE : 'rgba(232,97,154,0.45)' }]}>{v.verse}{'  '}</Text>
                  {v.text}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: P, paddingBottom: 12,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerSubtitle: {
    fontSize: 11, fontWeight: '800', color: ROSE, letterSpacing: 1.6,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: TXT, marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { paddingHorizontal: P + 4, paddingTop: 18 },
  chapterLabel: {
    fontSize: 12, fontWeight: '800', color: TXTSUB, letterSpacing: 1.6,
    marginBottom: 16, textAlign: 'center',
  },
  // One block per verse — 18px gap matches the reader / plan-walk verse rhythm.
  verseBlock: { marginBottom: 18 },
  // Pink highlight on the focus verses (rounded, like the reader's highlight).
  focusHl: { backgroundColor: 'rgba(232,97,154,0.18)', borderRadius: 6 },
  // Verse number — Lato bold 14, colour set inline (ROSE for focus / dim rose).
  verseNum: { fontFamily: FONTS.latoBold, fontWeight: '700', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 14 },
  emptyText: { fontSize: 15, lineHeight: 22, color: TXTSUB, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
