import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, LAV, TXT, TXTSUB, FONTS } from '../constants/theme';
import { useGospelsPsalms, type Slot } from '../state/GospelsPsalmsContext';
import { useTranslation } from '../state/TranslationsContext';
import { localizeBookName } from '../constants/bibleBookNames';
import { useT } from '../i18n/useT';

// Home-screen entry for the 89-day Gospels & Psalms plan. Two cards (Morning +
// Evening) built to MATCH PlanProgressCard byte-for-byte — same card metrics
// (white, 12.7 radius, 11.4/12 padding, soft shadow), same 92.15² left tile,
// and the SAME meta typography (label 13 Lato, title 16 Lato-bold / 21 line)
// so this section reads as one continuous stack with "Plans In Progress".
const GREEN = '#3FAE6A';

function SlotCard({ slot, done, title, subtitle, onPress }: {
  slot: Slot; done: boolean; title: string; subtitle: string; onPress: () => void;
}) {
  const accent = slot === 'morning' ? ROSE : LAV;
  const t = useT();
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Left tile — same 92.15² footprint as the plan cover, tinted with the
          slot accent and centring the sunrise/moon glyph. */}
      <View style={[styles.tile, { backgroundColor: `${accent}1A` }]}>
        <Feather name={slot === 'morning' ? 'sunrise' : 'moon'} size={34} color={accent} />
      </View>
      <View style={styles.meta}>
        {/* Top row mirrors PlanProgressCard's "Day N" row metrics. */}
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: accent }]}>
            {slot === 'morning' ? t('gp.morning') : t('gp.evening')}
          </Text>
          {done && <Feather name="check-circle" size={15} color={GREEN} />}
        </View>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={22} color={TXTSUB} />
    </TouchableOpacity>
  );
}

export default function GospelPsalmCards({ onOpen }: { onOpen: (slot: Slot) => void }) {
  const t = useT();
  const { current: translation } = useTranslation();
  const { ready, morning, evening, planComplete } = useGospelsPsalms();

  // NEVER return null while the store hydrates. This block used to render
  // nothing until AsyncStorage resolved and then pop ~250 px of content into
  // the middle of the home screen. Besides the visible jump, that late growth
  // happened INSIDE PrayerScreen's Reanimated entrance wrapper and left every
  // element below it with a stale native touch region on Android — the cards,
  // "Explore Plans", "Plans In Progress" and "Continue Reading" all rendered
  // but swallowed every tap. Rendering the real structure from the first frame
  // (subtitle blanked to a space so the row height is identical) keeps the
  // layout fixed, so nothing below ever shifts.
  const cardTitle = t('gp.cardTitle');
  // Per-slot readings — morning and evening advance independently now, so the
  // two cards may reference DIFFERENT plan days. Localized book names so the
  // subtitle follows the UI language, not English.
  const gospelBook = localizeBookName(translation.code, morning.today.gospel.bookSlug, morning.today.gospel.bookName);
  const psalmBook = localizeBookName(translation.code, 'psalms', 'Psalms');
  const mSub = !ready
    ? ' '
    : morning.complete
      ? t('gp.slotComplete')
      : `${gospelBook} ${morning.today.gospel.chapter} · ${psalmBook} ${morning.today.morningPsalm.chapter}`;
  const eSub = !ready
    ? ' '
    : evening.complete
      ? t('gp.slotComplete')
      : `${psalmBook} ${evening.today.eveningPsalm.chapter}`;

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('gp.section')}</Text>
      {ready && planComplete && <Text style={styles.completeNote}>{t('gp.planComplete')}</Text>}
      <SlotCard slot="morning" done={ready && (morning.doneToday || morning.complete)} title={cardTitle} subtitle={mSub} onPress={() => onOpen('morning')} />
      <SlotCard slot="evening" done={ready && (evening.doneToday || evening.complete)} title={cardTitle} subtitle={eSub} onPress={() => onOpen('evening')} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches PrayerScreen.sectionTitle ("Plans In Progress") so the heading is identical.
  sectionTitle: { fontSize: 19.85, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
  completeNote: { fontSize: 13, color: '#3FAE6A', fontFamily: FONTS.latoBold, marginTop: 4 },
  // card byte-matches PlanProgressCard.
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 12.7,                             // 9.8 → 12.7 (+30 % card radius per user)
    paddingVertical: 10.26, paddingHorizontal: 12, marginTop: 12,                // 11.4 × 0.9 (-10 % card height per user; text unchanged)
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  tile: {
    width: 82.01, height: 82.01, borderRadius: 10,                              // 92.15 × 0.89 (-11 % per user)
    alignItems: 'center', justifyContent: 'center',
  },
  meta: { flex: 1, minWidth: 0 },
  // labelRow matches PlanProgressCard.dayRow (gap 6, marginBottom 6).
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 14.04, fontFamily: FONTS.latoBold, letterSpacing: 0.3 },                          // 13 × 1.08 (+8 % per user)
  // title matches PlanProgressCard.title, +8 % per user (16→17.28, lh 21→22.68).
  title: { fontSize: 17.28, fontWeight: '600', color: TXT, lineHeight: 22.68, fontFamily: FONTS.latoBold },
  subtitle: { fontSize: 14.04, color: TXTSUB, fontFamily: FONTS.lato, marginTop: 4 },                  // 13 × 1.08 (+8 % per user)
});
