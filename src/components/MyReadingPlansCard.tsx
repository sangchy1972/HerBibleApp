import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ROSE, BTN_RADIUS, TXT, TXTSUB, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useUILanguage } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';
import PlanCover from './PlanCover';
import type { ReadingPlansCardModel } from '../services/planRecommendations';

// Home-screen "My Reading Plans" card (flat white, radius 20 — the app's
// card system). Renders the model from buildReadingPlansCard: the user's
// active plans (3:5 portrait cover, title, start date, progress ring) over a
// "Suggested Plans" divider with personalized recommendations, plus a footer
// nudge + outlined "More Plans" button into the explore tab. Covers load the
// R2 ORIGINALS (noTransform — already cached from the Plan screens, so no
// billable Cloudflare variant) and crop on-device via resizeMode="cover".

const COVER_W = 70;
const COVER_H = 90;    // 70x90 (per user)

// Circular progress ring, PlanScreen percent math (completed/total).
function ProgressRing({ percent }: { percent: number }) {
  const size = 46;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, percent));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(30,27,46,0.10)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ROSE}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c}`}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.ringText}>{Math.round(p * 100)}%</Text>
    </View>
  );
}

export default function MyReadingPlansCard({ model, onOpenPlan, onExplore }: {
  model: ReadingPlansCardModel;
  onOpenPlan: (slug: string) => void;
  onExplore: () => void;
}) {
  const t = useT();
  const { lang } = useUILanguage();
  // 'YYYY-MM-DD' → local-midnight timestamp. Parsed by parts, NOT new Date(str),
  // which treats a bare date as UTC and lands on the previous day west of GMT.
  const ymdToTs = (ymd: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
  };
  const fmtDate = (ts: number) =>
    ts > 0 ? new Date(ts).toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric' }) : '';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('prayer.myPlans.title')}</Text>

      {model.active.map(({ plan, percent, startedAt, lastDayYmd }) => (
        <TouchableOpacity key={plan.slug} style={styles.row} activeOpacity={0.85} onPress={() => onOpenPlan(plan.slug)}>
          <PlanCover cover={plan.cover} slug={plan.slug} width={COVER_W} height={COVER_H} radius={8} noTransform />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={2}>{plan.title}</Text>
            {/* LAST READ, not the start date: the list is ordered by recency,
                so showing when she began made the order look arbitrary. Falls
                back to the start date for records predating lastDayYmd. */}
            <Text style={styles.rowMeta}>{fmtDate(ymdToTs(lastDayYmd) ?? startedAt)}</Text>
          </View>
          <ProgressRing percent={percent} />
        </TouchableOpacity>
      ))}

      {model.suggested.length > 0 && (
        <>
          {/* Divider ALWAYS shown above the suggestions (reference layout) —
              with zero active plans it sits right under the card title. */}
          <View style={styles.dividerRow}>
            <Text style={styles.dividerLabel}>{t('prayer.myPlans.suggested').toUpperCase()}</Text>
            <View style={styles.dividerLine} />
          </View>
          {model.suggested.map(plan => (
            <TouchableOpacity key={plan.slug} style={styles.row} activeOpacity={0.85} onPress={() => onOpenPlan(plan.slug)}>
              <PlanCover cover={plan.cover} slug={plan.slug} width={COVER_W} height={COVER_H} radius={8} noTransform />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>{plan.title}</Text>
                <Text style={styles.rowMeta}>{t('plan.dayCount.other', { n: plan.duration_days || plan.duration })}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerNudge} numberOfLines={2}>{t('prayer.myPlans.beginNew')}</Text>
        <TouchableOpacity style={styles.moreBtn} activeOpacity={0.85} onPress={onExplore}>
          <Text style={styles.moreBtnText}>{t('prayer.myPlans.morePlans')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Flat white card — app-wide card system (radius 20, no border/shadow).
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    marginTop: 12,
  },
  title: {
    fontSize: 21, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold, letterSpacing: 0.6,   // Lora 600 (back per user), keep 0.6 tracking
    textAlign: 'center', marginBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16.5, fontWeight: '700', color: TXT, fontFamily: FONTS.latoBold, letterSpacing: 0.5, lineHeight: 22 },
  rowMeta: { fontSize: 13, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, marginTop: 3 },
  ringText: { fontSize: 11.5, fontWeight: '700', color: TXT, fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 2 },
  dividerLabel: { fontSize: 12, fontWeight: '600', color: ROSE, fontFamily: FONTS.latoBold, letterSpacing: 1.1 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(30,27,46,0.14)' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(30,27,46,0.10)' },
  footerNudge: { flex: 1, fontSize: 13.5, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, lineHeight: 18.5 },
  moreBtn: {
    borderWidth: 1.5, borderColor: ROSE, borderRadius: BTN_RADIUS,
    paddingHorizontal: 16, paddingVertical: 8.5, backgroundColor: 'transparent',
  },
  moreBtnText: { fontSize: 13.5, fontWeight: '700', color: ROSE, fontFamily: FONTS.latoBold, letterSpacing: 0.3 },
});
