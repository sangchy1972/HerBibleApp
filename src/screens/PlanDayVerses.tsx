import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { bookCodeToSlug, parseVerseRange } from '../constants/bibleBookCode';
import type { FullPlan, PlanVerseRef } from '../services/featuredPlansService';
import type { RootStackScreenProps } from '../navigation/types';

// Final stop in the daily flow before the congrats screen. Shows the
// `verse_wall` block — the verses the user just walked through. Tapping
// any card pushes PlanVerseRead so they can read it in the Bible without
// losing the plan stack.

export default function PlanDayVerses({ route, navigation }: RootStackScreenProps<'PlanDayVerses'>) {
  const insets = useSafeAreaInsets();
  const { slug, day } = route.params;
  const { loadPlan, loadedPlans, getSummary } = useFeaturedPlans();
  const { markDayComplete } = usePlanCompletion();
  const [plan, setPlan] = useState<FullPlan | null>(loadedPlans[slug] || null);
  const summary = getSummary(slug);

  useEffect(() => {
    if (!plan) loadPlan(slug).then(setPlan).catch(() => {});
  }, [slug, plan, loadPlan]);

  const dayContent = plan?.days.find(d => d.day === day);
  const verseWall = dayContent?.sections.find(s => s.type === 'verse_wall');
  const verses: PlanVerseRef[] = verseWall && 'verses' in verseWall ? verseWall.verses : [];

  const onVerseTap = (v: PlanVerseRef) => {
    const bookSlug = bookCodeToSlug(v.bookCode);
    if (!bookSlug) return;
    const { start, end } = parseVerseRange(v.verses);
    navigation.navigate('PlanVerseRead', {
      focus: { bookSlug, chapter: v.chapter, verseStart: start, verseEnd: end },
      planSlug: slug,
      day,
    });
  };

  const onMarkComplete = () => {
    if (!plan) return;
    markDayComplete(slug, day, plan.duration);
    navigation.replace('PlanDayDone', { slug, day });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {summary ? `Back to ${summary.title}` : 'Back to plan'}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {!plan ? (
        <View style={styles.loading}><ActivityIndicator color={ROSE} /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        >
          <Animated.Text entering={FadeIn.duration(360)} style={styles.title}>
            Verses for today
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(140).duration(360)} style={styles.subtitle}>
            Day {day}{dayContent ? ` · ${dayContent.title}` : ''}
          </Animated.Text>

          {verses.map((v, i) => (
            <Animated.View key={i} entering={FadeIn.delay(280 + i * 100).duration(360)}>
              <TouchableOpacity
                onPress={() => onVerseTap(v)}
                activeOpacity={0.85}
                style={styles.card}
              >
                <Text style={styles.verseRef}>{v.display}</Text>
                {!!v.text && <Text style={styles.verseText}>"{v.text}"</Text>}
                <View style={styles.cardFoot}>
                  <Text style={styles.readHint}>Read in Bible</Text>
                  <Feather name="chevron-right" size={18} color={ROSE} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <TouchableOpacity
          onPress={onMarkComplete}
          activeOpacity={0.9}
          disabled={!plan}
          style={[styles.completeBtn, !plan && { opacity: 0.5 }]}
        >
          <Text style={styles.completeBtnText}>Mark Day {day} Complete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: P, paddingBottom: 14,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', fontFamily: FONTS.loraBold, color: TXT, textAlign: 'center', paddingHorizontal: 8 },
  scroll: { paddingHorizontal: P + 4, paddingTop: 12 },
  title: {
    fontFamily: FONTS.serif, fontSize: 28, fontWeight: '700', color: TXT,
    lineHeight: 36, letterSpacing: 0.2,
  },
  subtitle: { fontSize: 15, fontFamily: FONTS.lato, color: TXTSUB, marginTop: 6, marginBottom: 22 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6, elevation: 1,
  },
  // Verse-card text bumped +10 % per design spec (was 14 / 17 / 13). The body
  // (verseText) got an additional +10 % pass on user feedback — total 1.21× the
  // original 17 / 26 — because the verse body is the primary reading surface
  // here and the previous size felt cramped under the Psalm/Isaiah refs.
  verseRef: { fontSize: 15.4, fontWeight: '700', fontFamily: FONTS.loraBold, color: ROSE, letterSpacing: 0.4, marginBottom: 10 },
  verseText: { fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY, fontSize: 20.57, lineHeight: 31.46, color: TXT, marginBottom: 12 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  readHint: { fontSize: 14.3, color: ROSE, fontWeight: '600', fontFamily: FONTS.latoBold },
  footer: {
    paddingHorizontal: P + 4, paddingTop: 12,
    backgroundColor: '#FBF7F6',
    borderTopWidth: 1, borderTopColor: 'rgba(30,27,46,0.06)',
  },
  completeBtn: {
    height: 56, borderRadius: 28, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ROSE, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 14, elevation: 4,
  },
  completeBtnText: { fontSize: 16, fontWeight: '700', fontFamily: FONTS.latoBold, color: '#FFFFFF', letterSpacing: 0.4 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
