import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useGospelsPsalms, type Slot } from '../state/GospelsPsalmsContext';
import { useT } from '../i18n/useT';

// Home-screen entry for the 89-day Gospels & Psalms plan. Renders TWO white
// cards (Morning + Evening) styled to match PlanProgressCard, so the home
// screen reads as one consistent stack. Each card shows the plan title with
// the current day (e.g. "Gospel & Psalm (1/89)"), the slot label, and a
// green check once that slot is read. Both are openable any time today — the
// user can do the evening reading in the morning if they like.
const GREEN = '#3FAE6A';

function SlotCard({ slot, done, title, subtitle, onPress }: {
  slot: Slot; done: boolean; title: string; subtitle: string; onPress: () => void;
}) {
  const accent = slot === 'morning' ? ROSE : LAV;
  const t = useT();
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.iconWrap, { backgroundColor: `${accent}1A` }]}>
        <Feather name={slot === 'morning' ? 'sunrise' : 'moon'} size={20} color={accent} />
      </View>
      <View style={styles.meta}>
        <View style={styles.slotRow}>
          <Text style={[styles.slot, { color: accent }]}>
            {slot === 'morning' ? t('gp.morning') : t('gp.evening')}
          </Text>
          {done && <Feather name="check-circle" size={15} color={GREEN} />}
        </View>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={22} color={TXTSUB} />
    </TouchableOpacity>
  );
}

export default function GospelPsalmCards({ onOpen }: { onOpen: (slot: Slot) => void }) {
  const t = useT();
  const { ready, day, total, today, morningDone, eveningDone } = useGospelsPsalms();
  if (!ready) return null;

  const cardTitle = t('gp.cardTitle', { day, total });
  // Morning subtitle = today's gospel + psalm; evening = the evening psalm.
  const mSub = `${today.gospel.bookName} ${today.gospel.chapter} · Psalm ${today.morningPsalm.chapter}`;
  const eSub = `Psalm ${today.eveningPsalm.chapter}`;

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('gp.section')}</Text>
      <SlotCard slot="morning" done={morningDone} title={cardTitle} subtitle={mSub} onPress={() => onOpen('morning')} />
      <SlotCard slot="evening" done={eveningDone} title={cardTitle} subtitle={eSub} onPress={() => onOpen('evening')} />
    </View>
  );
}

const styles = StyleSheet.create({
  // sectionTitle mirrors PrayerScreen.sectionTitle so "Gospel & Psalm" sits
  // visually identical to "Plans In Progress" below it.
  sectionTitle: { fontSize: 19.2, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold, marginBottom: 2 },
  // card byte-matches PlanProgressCard (white, 9.8 radius, soft shadow).
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 9.8,
    paddingVertical: 11.4, paddingHorizontal: 12, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  iconWrap: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1, minWidth: 0 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  slot: { fontSize: 13, fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  title: { fontSize: 15.5, fontWeight: '600', color: TXT, fontFamily: FONTS.latoBold },
  subtitle: { fontSize: 12.5, color: TXTSUB, fontFamily: FONTS.lato, marginTop: 1 },
});
