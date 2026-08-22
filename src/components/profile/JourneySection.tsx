import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Glass from '../shared/Glass';
import BadgeIcon from '../BadgeIcon';
import PlanCover from '../PlanCover';
import { FONTS, INK_06, TXT, TXTSUB } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { useUILanguage } from '../../state/UILanguageContext';
import { localeFor } from '../../i18n/locale';
import { ACHIEVEMENTS, localizedAchievementName } from '../../constants/achievements';
import { useFeaturedPlans } from '../../state/FeaturedPlansContext';
import { artThumbSource, artTitle, artworkAt } from '../../constants/quizArt';
import type { JourneyEntry } from '../../state/journeyLog';

// The Activity journey on Profile (owner 2026-08-22, competitor-modeled):
// one row per milestone — badge earned, plan started, puzzle piece collected —
// date at the row's top right, newest first. Entries carry only ids; every
// name and image resolves through the same helpers the rest of the app uses,
// and an id the current build no longer ships (a retired badge, a delisted
// plan) drops its row silently rather than rendering a husk.
const SHOW_MAX = 10;
const THUMB = 54;

export default function JourneySection({ entries }: { entries: JourneyEntry[] }) {
  const t = useT();
  const { lang } = useUILanguage();
  const { getSummary } = useFeaturedPlans();

  const fmtDay = (at: number): string => {
    try { return new Date(at).toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric' }); }
    catch { return ''; }
  };

  const rows = entries.slice(0, SHOW_MAX).flatMap((e): Array<{
    key: string; at: number; title: string; sub: string; thumb: React.ReactNode;
  }> => {
    if (e.kind === 'badge') {
      const def = ACHIEVEMENTS.find(a => a.id === e.badgeId);
      if (!def) return [];
      return [{
        key: e.id, at: e.at,
        title: localizedAchievementName(def, lang),
        sub: t('profile.journey.badge'),
        thumb: <BadgeIcon id={def.id} iconKey={def.iconKey} rarity={def.rarity} size={THUMB} count={e.count} shine={false} />,
      }];
    }
    if (e.kind === 'plan') {
      const plan = getSummary(e.slug);
      if (!plan) return [];
      return [{
        key: e.id, at: e.at,
        title: plan.title,
        sub: t('profile.journey.plan'),
        thumb: <PlanCover cover={plan.cover} slug={e.slug} width={THUMB} height={THUMB} radius={10} noTransform />,
      }];
    }
    const art = artworkAt(e.paintingIndex);
    return [{
      key: e.id, at: e.at,
      title: artTitle(art, lang),
      sub: t(e.finishedPainting ? 'profile.journey.paintingDone' : 'profile.journey.puzzle'),
      thumb: <Image source={artThumbSource(art)} style={styles.artThumb} resizeMode="cover" />,
    }];
  });

  if (rows.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>{t('profile.journey.title')}</Text>
      <Glass style={styles.card}>
        {rows.map((r, i) => (
          <View key={r.key} style={[styles.row, i > 0 && styles.rowBorder]}>
            <View style={styles.thumbBox}>{r.thumb}</View>
            <View style={styles.body}>
              <Text style={styles.rowTitle} numberOfLines={2}>{r.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{r.sub}</Text>
            </View>
            <Text style={styles.date}>{fmtDay(r.at)}</Text>
          </View>
        ))}
      </Glass>
    </>
  );
}

const styles = StyleSheet.create({
  // Mirrors ProfileScreen's sectionTitle + the inline margins its neighbours
  // use — the section reads as a native sibling of My Notes / Quiz / Account.
  sectionTitle: {
    fontSize: 19.85, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold,
    marginTop: 28, marginBottom: 14,
  },
  card: { paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(30,27,46,0.05)' },
  // Fixed square box for every kind of art — the row's layout is identical
  // whether the image has loaded, failed, or is a badge medallion.
  thumbBox: { width: THUMB, height: THUMB, alignItems: 'center', justifyContent: 'center' },
  artThumb: { width: THUMB, height: THUMB, borderRadius: 10, backgroundColor: INK_06 },
  body: { flex: 1, marginLeft: 12, paddingTop: 2 },
  rowTitle: { fontSize: 15, lineHeight: 20, color: TXT, fontFamily: FONTS.loraBold, fontWeight: '600' },
  rowSub: { marginTop: 3, fontSize: 12.5, color: TXTSUB, fontFamily: FONTS.lato },
  date: { marginLeft: 10, paddingTop: 2, fontSize: 12, color: TXTSUB, fontFamily: FONTS.lato },
});
