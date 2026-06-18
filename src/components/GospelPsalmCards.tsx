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
// (white, 9.8 radius, 11.4/12 padding, soft shadow), same 92.15² left tile,
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
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={22} color={TXTSUB} />
    </TouchableOpacity>
  );
}

export default function GospelPsalmCards({ onOpen }: { onOpen: (slot: Slot) => void }) {
  const t = useT();
  const { current: translation } = useTranslation();
  const { ready, day, total, today, morningDone, eveningDone } = useGospelsPsalms();
  if (!ready) return null;

  const cardTitle = t('gp.cardTitle', { day, total });
  // Localized book names so the subtitle follows the UI language, not English.
  const gospelBook = localizeBookName(translation.code, today.gospel.bookSlug, today.gospel.bookName);
  const psalmBook = localizeBookName(translation.code, 'psalms', 'Psalms');
  const mSub = `${gospelBook} ${today.gospel.chapter} · ${psalmBook} ${today.morningPsalm.chapter}`;
  const eSub = `${psalmBook} ${today.eveningPsalm.chapter}`;

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('gp.section')}</Text>
      <SlotCard slot="morning" done={morningDone} title={cardTitle} subtitle={mSub} onPress={() => onOpen('morning')} />
      <SlotCard slot="evening" done={eveningDone} title={cardTitle} subtitle={eSub} onPress={() => onOpen('evening')} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches PrayerScreen.sectionTitle ("Plans In Progress") so the heading is identical.
  sectionTitle: { fontSize: 19.85, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
  // card byte-matches PlanProgressCard.
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 9.8,
    paddingVertical: 11.4, paddingHorizontal: 12, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  tile: {
    width: 92.15, height: 92.15, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  meta: { flex: 1, minWidth: 0 },
  // labelRow matches PlanProgressCard.dayRow (gap 6, marginBottom 6).
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 13, fontFamily: FONTS.latoBold, letterSpacing: 0.3 },
  // title matches PlanProgressCard.title (16 / Lato-bold / 21 line height).
  title: { fontSize: 16, fontWeight: '600', color: TXT, lineHeight: 21, fontFamily: FONTS.latoBold },
  subtitle: { fontSize: 13, color: TXTSUB, fontFamily: FONTS.lato, marginTop: 4 },
});
