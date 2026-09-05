import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, LAV, TXT, TXTSUB, FONTS } from '../constants/theme';
import { useGospelsPsalms, type Slot } from '../state/GospelsPsalmsContext';
import { useTranslation } from '../state/TranslationsContext';
import { localizeBookName } from '../constants/bibleBookNames';
import { useT } from '../i18n/useT';
import { gpGospelHeroUrl, gpPsalmHeroUrl } from '../constants/gpHeroImages';

// Home-screen entry for the 89-day Gospels & Psalms plan. Two cards (Morning +
// Evening). Historically byte-matched PlanProgressCard; the left tile has
// since diverged on purpose (owner 2026-09-05): it now shows the DAY'S OWN
// chapter art (morning = the gospel chapter's piece, evening = the evening
// psalm's) at 4:3 instead of the square sunrise/moon glyph tile — the glyph
// tile stays underneath as loading/offline fallback. Meta typography still
// matches the plan cards so the stack reads as one family.
const GREEN = '#3FAE6A';

function SlotCard({ slot, done, title, subtitle, art, onPress }: {
  slot: Slot; done: boolean; title: string; subtitle: string; art: string | null; onPress: () => void;
}) {
  const accent = slot === 'morning' ? ROSE : LAV;
  const t = useT();
  // Art failure (offline first day, CDN hiccup) falls back to the glyph tile
  // underneath; reset when the day rolls over and the url changes.
  const [artBroken, setArtBroken] = useState(false);
  useEffect(() => { setArtBroken(false); }, [art]);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Left tile — 4:3 chapter art over the tinted glyph fallback. */}
      <View style={[styles.tile, { backgroundColor: `${accent}1A` }]}>
        <Feather name={slot === 'morning' ? 'sunrise' : 'moon'} size={34} color={accent} />
        {art != null && !artBroken && (
          <Image
            source={{ uri: art }}
            style={styles.tileArt}
            resizeMode="cover"
            onError={() => setArtBroken(true)}
          />
        )}
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
      <SlotCard slot="morning" done={ready && (morning.doneToday || morning.complete)} title={cardTitle} subtitle={mSub} art={ready ? gpGospelHeroUrl(morning.today.gospel) : null} onPress={() => onOpen('morning')} />
      <SlotCard slot="evening" done={ready && (evening.doneToday || evening.complete)} title={cardTitle} subtitle={eSub} art={ready ? gpPsalmHeroUrl(evening.today.eveningPsalm) : null} onPress={() => onOpen('evening')} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches PrayerScreen.sectionTitle ("Plans In Progress") so the heading is identical.
  sectionTitle: { fontSize: 19.85, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
  completeNote: { fontSize: 13, color: '#3FAE6A', fontFamily: FONTS.latoBold, letterSpacing: 0.4, marginTop: 4 },
  // card metrics started as PlanProgressCard's; padding re-raised 2026-09-05
  // (+10 % card height per user, to let the new art tile breathe).
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 20,
    paddingVertical: 11.29, paddingHorizontal: 12, marginTop: 12,                // 10.26 × 1.1 (+10 % per user 2026-09-05)
  },
  tile: {
    width: 120.28, height: 90.21, borderRadius: 10,                             // 4:3, height 82.01 × 1.1 (art tile per user 2026-09-05)
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',                                                          // clips the art to the tile's radius
  },
  // Chapter art over the glyph tile; same rounding via the parent's clip.
  tileArt: { ...StyleSheet.absoluteFillObject },
  meta: { flex: 1, minWidth: 0 },
  // labelRow matches PlanProgressCard.dayRow (gap 6, marginBottom 6).
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 14.04, fontFamily: FONTS.latoBold, letterSpacing: 0.3 },                          // 13 × 1.08 (+8 % per user)
  // title matches PlanProgressCard.title, +8 % per user (16→17.28, lh 21→22.68).
  title: { fontSize: 17.28, fontWeight: '600', color: TXT, lineHeight: 22.68, fontFamily: FONTS.latoBold, letterSpacing: 0.5 },
  subtitle: { fontSize: 14.04, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.5, marginTop: 4 },                  // 13 × 1.08 (+8 % per user)
});
