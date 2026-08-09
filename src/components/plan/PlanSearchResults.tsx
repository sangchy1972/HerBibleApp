import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { PLAN_SECTIONS, PLAN_SECTION_LABELS, type PlanSectionId } from '../../constants/plansApi';
import type { PlanSummary } from '../../constants/featuredPlansSummary';
import { isSearchable, SEARCH_TOPICS, type PlanSearchHit } from '../../services/planSearch';

// What Explore shows once she is searching, in three states:
//
//   empty query  → suggestion chips + every category. She has just tapped the
//                  field and has nothing to go on; this is where discovery
//                  either happens or doesn't, so it must be useful on the FIRST
//                  open (which is why it isn't a recent-searches list).
//   hits         → the plan rows, rendered by PlanScreen so the row component
//                  and its styles stay in one place.
//   no hits      → the same chips and categories, under a short message. A dead
//                  end becomes a browse entry rather than a full stop.
//
// The 12 suggestion topics are onboarding's own vocabulary, already translated
// into all 7 languages, and every one of them is measured to return at least one
// plan in every language (see __tests__/planSearch.test.ts). Tapping a chip types
// its localized label into the field, so chips and typing are ONE code path.

// A long tail of rows means a long tail of CDN cover requests; 30 is plenty to
// scroll and she can ask for the rest.
const VISIBLE_LIMIT = 30;

export default function PlanSearchResults({
  query, hits, showAll, onShowAll, renderPlanRow, onPickTopic, onOpenCategory,
}: {
  /** The live query (already trimmed by the caller). */
  query: string;
  hits: PlanSearchHit[];
  showAll: boolean;
  onShowAll: () => void;
  renderPlanRow: (plan: PlanSummary, rank: number) => React.ReactNode;
  onPickTopic: (topic: string, label: string) => void;
  onOpenCategory: (section: PlanSectionId, title: string) => void;
}) {
  const t = useT();

  const browse = (
    <>
      <Text style={styles.label}>{t('planSearch.suggested')}</Text>
      <View style={styles.chips}>
        {SEARCH_TOPICS.map(topic => {
          const label = t(`onboarding.topics.opt.${topic}`);
          return (
            <TouchableOpacity
              key={topic}
              onPress={() => onPickTopic(topic, label)}
              activeOpacity={0.85}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.label, { marginTop: 26 }]}>{t('planSearch.categories')}</Text>
      {PLAN_SECTIONS.map(section => {
        const title = t(PLAN_SECTION_LABELS[section]);
        return (
          <TouchableOpacity
            key={section}
            onPress={() => onOpenCategory(section, title)}
            activeOpacity={0.75}
            style={styles.catRow}
          >
            <Text style={styles.catText} numberOfLines={1}>{title}</Text>
            <Feather name="chevron-right" size={20} color={TXTSUB} />
          </TouchableOpacity>
        );
      })}
    </>
  );

  // A query too short to run (one Latin letter) shows the chips, NOT an empty
  // result state — she is mid-word, not out of luck.
  if (!isSearchable(query)) return <View>{browse}</View>;

  if (hits.length === 0) {
    return (
      <View>
        <View style={styles.empty}>
          <Feather name="inbox" size={34} color={TXTSUB} />
          <Text style={styles.emptyTitle}>{t('planSearch.empty.title', { query })}</Text>
          <Text style={styles.emptyDesc}>{t('planSearch.empty.desc')}</Text>
        </View>
        {browse}
      </View>
    );
  }

  const shown = showAll ? hits : hits.slice(0, VISIBLE_LIMIT);
  return (
    <View>
      <Text style={styles.label}>{t('planCategory.count', { n: hits.length })}</Text>
      {shown.map((hit, i) => (
        <View key={hit.plan.slug}>{renderPlanRow(hit.plan, i + 1)}</View>
      ))}
      {!showAll && hits.length > VISIBLE_LIMIT && (
        <TouchableOpacity onPress={onShowAll} activeOpacity={0.8} style={styles.showAll}>
          <Text style={styles.showAllText}>{t('planSearch.showAll', { n: hits.length })}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12.65,
    fontFamily: FONTS.latoBold,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: TXTSUB,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  // Same pill as PlanCategoryScreen's sub-tab strip, so the vocabulary reads as
  // one system across the two screens.
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: 'rgba(30,27,46,0.05)' },
  chipText: { fontSize: 14, fontWeight: '700', fontFamily: FONTS.latoBold, color: TXTSUB, letterSpacing: 0.4 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(30,27,46,0.10)',
  },
  catText: { flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT },
  empty: { alignItems: 'center', gap: 10, paddingTop: 14, paddingBottom: 30, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, textAlign: 'center' },
  emptyDesc: { fontSize: 14.5, color: TXTSUB, textAlign: 'center', lineHeight: 21 },
  showAll: { alignSelf: 'center', marginTop: 8, paddingVertical: 10, paddingHorizontal: 18 },
  showAllText: { fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold, color: ROSE },
});
