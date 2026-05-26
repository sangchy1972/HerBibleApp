import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';
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
      .catch(() => setError('Could not load this chapter. Please check your connection.'));
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

  // Partition the chapter so the JSX below stays readable. Memoized so
  // the three .filter() passes only run when the chapter or focus range
  // actually changes — parent re-renders (e.g. from a sibling state
  // update) don't trigger a re-partition of every verse.
  const { preFocus, inFocus, postFocus } = useMemo(() => {
    if (!chapter) return { preFocus: [], inFocus: [], postFocus: [] };
    const pre: typeof chapter.verses = [];
    const inF: typeof chapter.verses = [];
    const post: typeof chapter.verses = [];
    for (const v of chapter.verses) {
      if (v.verse < focus.verseStart) pre.push(v);
      else if (v.verse <= focus.verseEnd) inF.push(v);
      else post.push(v);
    }
    return { preFocus: pre, inFocus: inF, postFocus: post };
  }, [chapter, focus.verseStart, focus.verseEnd]);

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

          {preFocus.length > 0 && (
            <Text style={styles.chapterBody}>
              {preFocus.map((v, i) => (
                <Text key={v.verse} style={styles.dimVerse}>
                  {i > 0 ? '  ' : ''}<Text style={styles.verseNum}>{v.verse}</Text>{' '}{v.text}
                </Text>
              ))}
            </Text>
          )}

          {inFocus.length > 0 && (
            <View
              onLayout={onFocusLayout}
              style={preFocus.length > 0 ? styles.focusBlockGap : undefined}
            >
              <Text style={styles.chapterBody}>
                {inFocus.map((v, i) => (
                  <Text key={v.verse} style={styles.focusVerse}>
                    {i > 0 ? '  ' : ''}<Text style={styles.verseNum}>{v.verse}</Text>{' '}{v.text}
                  </Text>
                ))}
              </Text>
            </View>
          )}

          {postFocus.length > 0 && (
            <Text style={[styles.chapterBody, styles.focusBlockGap]}>
              {postFocus.map((v, i) => (
                <Text key={v.verse} style={styles.dimVerse}>
                  {i > 0 ? '  ' : ''}<Text style={styles.verseNum}>{v.verse}</Text>{' '}{v.text}
                </Text>
              ))}
            </Text>
          )}
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
  // Source Serif 4 Variable — opsz axis pinned to body-text master via
  // SERIF_BODY (see theme.ts) so the chapter renders with sturdy/open
  // letterforms instead of the static Regular's flat shape.
  chapterBody: {
    fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY, fontSize: 18, lineHeight: 30, color: TXT,
  },
  // Small visible break between pre / focus / post blocks. Without this the
  // three blocks would butt up against each other (no inline flow across
  // sibling Texts), making the focus highlight harder to spot.
  focusBlockGap: { marginTop: 10 },
  focusVerse: { color: TXT, backgroundColor: 'rgba(232,97,154,0.18)' },
  dimVerse: { color: 'rgba(30,27,46,0.45)' },
  verseNum: { fontSize: 11, color: TXTSUB, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 14 },
  emptyText: { fontSize: 15, lineHeight: 22, color: TXTSUB, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
