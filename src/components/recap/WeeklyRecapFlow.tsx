import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, ImageBackground, StyleSheet, Modal, ScrollView,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROSE, LAV, TXT, TXTSUB, FONTS, BTN_RADIUS, CARD_RADIUS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { useUILanguage } from '../../state/UILanguageContext';
import { localeFor } from '../../i18n/locale';
import { usePrayer } from '../../state/PrayerContext';
import { useActivity } from '../../state/ActivityContext';
import { useQuiz } from '../../state/QuizContext';
import { useReadChapters } from '../../state/ReadChaptersContext';
import { logEvent } from '../../services/firebase';
import {
  computeWeeklyStats, coveredWeekOf, ymdOf, type WeeklyStats,
} from '../../services/weeklyRecap';

// The 4-page Weekly Recap flow (owner spec 2026-09-05): ① stats grid
// ② seven-day trail ③ persona card ④ closing + share. Every number is REAL —
// aggregated from the same stores the rest of the app writes (prayer records,
// activity dates, chapter daily counts, quiz history). Deltas compare the
// covered week to the one before it; a user with no prior-week data sees a
// "fresh start" line, never a fake −0.
//
// Backgrounds are bundled (the recap must render offline — its data is local)
// and every text block sits on a white/near-white card, so a busy painting can
// never swallow the copy (owner rule).
const BG_STATS = require('../../../assets/recap/bg-stats.jpg');
const BG_DAYS = require('../../../assets/recap/bg-days.jpg');
const BG_PERSONA = require('../../../assets/recap/bg-persona.jpg');
const BG_CLOSING = require('../../../assets/recap/bg-closing.jpg');

export default function WeeklyRecapFlow({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang } = useUILanguage();
  const insets = useSafeAreaInsets();
  const prayer = usePrayer();
  const activity = useActivity();
  const quiz = useQuiz();
  const chapters = useReadChapters();
  const [page, setPage] = useState(0);
  const shotRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  // Aggregate ONCE per open — the flow is a snapshot, not a live dashboard.
  const stats: WeeklyStats = useMemo(() => {
    const today = ymdOf(new Date());
    const { start } = coveredWeekOf(today);
    // Pull exactly the 14 day-records the two slices need via recordOn.
    const prayerRecords: Record<string, { m: boolean; e: boolean }> = {};
    for (let i = -7; i < 7; i++) {
      const d = new Date();
      const [y, m, dd] = start.split('-').map(Number);
      d.setFullYear(y, m - 1, dd);
      d.setDate(d.getDate() + i);
      const k = ymdOf(d);
      const r = prayer.recordOn(k);
      if (r.m || r.e) prayerRecords[k] = { m: r.m, e: r.e };
    }
    return computeWeeklyStats({
      prayerRecords,
      activityDates: activity.dates,
      quizDays: quiz.history.days,
      chapterCounts: chapters.dailyCounts,
    }, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    logEvent('weekly_recap_open', { persona: stats.persona, active_days: stats.cur.activeCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rangeLabel = useMemo(() => {
    const fmt = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric' });
    };
    return `${fmt(stats.weekStartYmd)} – ${fmt(stats.weekEndYmd)}`;
  }, [lang, stats.weekStartYmd, stats.weekEndYmd]);

  // Localized single-letter-ish weekday labels, Sunday-first to match the data.
  const dayLabels = useMemo(() => {
    const base = new Date(2026, 0, 4); // a known Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(localeFor(lang), { weekday: 'short' });
    });
  }, [lang]);

  const deltaLine = (v: number | null | undefined, pct = false): string => {
    if (stats.delta === null) return t('recap.stats.fresh');
    if (v === null || v === undefined) return t('recap.stats.same');
    if (v > 0) return t('recap.stats.up', { n: `${v}${pct ? '%' : ''}` });
    if (v < 0) return t('recap.stats.down', { n: `${Math.abs(v)}${pct ? '%' : ''}` });
    return t('recap.stats.same');
  };

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    logEvent('weekly_recap_share', { persona: stats.persona });
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 0.95 });
      await Sharing.shareAsync(uri.startsWith('file://') ? uri : `file://${uri}`);
    } catch { /* she dismissed the sheet or capture failed — nothing to do */ }
    setSharing(false);
  };

  const personaTitle = t(`recap.persona.${stats.persona}.title`);
  const personaBody = t(`recap.persona.${stats.persona}.body`);

  const grid: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value: string; sub: string }[] = [
    { icon: 'heart', label: t('recap.stats.amenLabel'), value: String(stats.cur.amen), sub: deltaLine(stats.delta?.amen) },
    { icon: 'calendar', label: t('recap.stats.activeLabel'), value: `${stats.cur.activeCount}/7`, sub: deltaLine(stats.delta?.activeDays) },
    { icon: 'book-open', label: t('recap.stats.chaptersLabel'), value: String(stats.cur.chapters), sub: deltaLine(stats.delta?.chapters) },
    {
      icon: 'edit-3', label: t('recap.stats.quizLabel'),
      value: stats.cur.quizPct === null ? '—' : `${stats.cur.quizPct}%`,
      sub: stats.cur.quizPct === null ? t('recap.stats.noQuiz') : deltaLine(stats.delta?.quizPct ?? null, true),
    },
  ];

  return (
    <Modal animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={styles.root}>
        <PagerView style={{ flex: 1 }} initialPage={0} onPageSelected={e => setPage(e.nativeEvent.position)}>
          {/* ① Stats grid */}
          <ImageBackground key="stats" source={BG_STATS} style={styles.page} resizeMode="cover">
            <ScrollView contentContainerStyle={[styles.pageContent, { paddingTop: insets.top + 64 }]} showsVerticalScrollIndicator={false}>
              <View style={styles.headCard}>
                <Text style={styles.kicker}>{rangeLabel}</Text>
                <Text style={styles.pageTitle}>{t('recap.stats.title')}</Text>
                {!stats.cur.hasAnyData && <Text style={styles.emptySub}>{t('recap.stats.emptySub')}</Text>}
              </View>
              <View style={styles.grid}>
                {grid.map(cell => (
                  <View key={cell.label} style={styles.cell}>
                    <View style={styles.cellHead}>
                      <Feather name={cell.icon} size={15} color={ROSE} />
                      <Text style={styles.cellLabel} numberOfLines={1}>{cell.label}</Text>
                    </View>
                    <Text style={styles.cellValue}>{cell.value}</Text>
                    <Text style={styles.cellSub} numberOfLines={2}>{cell.sub}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </ImageBackground>

          {/* ② Seven-day trail */}
          <ImageBackground key="days" source={BG_DAYS} style={styles.page} resizeMode="cover">
            <View style={[styles.pageContent, { paddingTop: insets.top + 64 }]}>
              <View style={styles.headCard}>
                <Text style={styles.pageTitle}>{t('recap.days.title')}</Text>
                <Text style={styles.daysCount}>{t('recap.days.count', { n: stats.cur.activeCount })}</Text>
              </View>
              <View style={styles.daysRow}>
                {stats.cur.activeDays.map((on, i) => (
                  <View key={i} style={styles.dayCol}>
                    <View style={[styles.dayDot, on ? styles.dayDotOn : styles.dayDotOff]}>
                      {on && <Feather name="check" size={16} color="#FFFFFF" />}
                    </View>
                    <Text style={[styles.dayLabel, on && styles.dayLabelOn]} numberOfLines={1}>{dayLabels[i]}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ImageBackground>

          {/* ③ Persona card (also the share art, captured via shotRef) */}
          <ImageBackground key="persona" source={BG_PERSONA} style={styles.page} resizeMode="cover">
            <View style={[styles.pageContent, { paddingTop: insets.top + 64 }]}>
              <ViewShot ref={shotRef} style={styles.personaShot}>
                <ImageBackground source={BG_PERSONA} style={styles.personaShotBg} resizeMode="cover">
                  <View style={styles.personaCard}>
                    <Text style={styles.kicker}>{t('recap.persona.kicker')}</Text>
                    <Text style={styles.personaTitle}>{personaTitle}</Text>
                    <Text style={styles.personaBody}>{personaBody}</Text>
                    <View style={styles.personaFootRow}>
                      <Text style={styles.personaFoot}>Her Bible · {rangeLabel}</Text>
                    </View>
                  </View>
                </ImageBackground>
              </ViewShot>
            </View>
          </ImageBackground>

          {/* ④ Closing */}
          <ImageBackground key="closing" source={BG_CLOSING} style={styles.page} resizeMode="cover">
            <View style={[styles.pageContent, styles.closingContent, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 40 }]}>
              <View style={styles.headCard}>
                <Text style={styles.pageTitle}>{t('recap.closing.title')}</Text>
                <Text style={styles.closingBody}>{t('recap.closing.body')}</Text>
              </View>
              <View style={styles.closingBtns}>
                <TouchableOpacity onPress={share} disabled={sharing} activeOpacity={0.9} style={styles.shareBtn}>
                  <Feather name="share-2" size={17} color="#FFFFFF" />
                  <Text style={styles.shareText}>{t('recap.closing.share')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} activeOpacity={0.8} style={styles.closeBtn}>
                  <Text style={styles.closeText}>{t('recap.closing.done')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ImageBackground>
        </PagerView>

        {/* Chrome: X + page dots, over every page. */}
        <TouchableOpacity onPress={onClose} hitSlop={10} style={[styles.x, { top: insets.top + 10 }]}>
          <Feather name="x" size={21} color={TXT} />
        </TouchableOpacity>
        <View style={[styles.dots, { top: insets.top + 22 }]} pointerEvents="none">
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.dot, i === page ? styles.dotOn : null]} />
          ))}
        </View>
      </View>
    </Modal>
  );
}

const WHITE_CARD = 'rgba(255,255,255,0.92)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F7F7' },
  page: { flex: 1 },
  pageContent: { paddingHorizontal: 22, paddingBottom: 40 },
  // Every heading sits on a soft white card so busy art can't eat the copy.
  headCard: {
    backgroundColor: WHITE_CARD, borderRadius: CARD_RADIUS,
    paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center',
  },
  kicker: { fontSize: 13, color: ROSE, fontFamily: FONTS.latoBold, letterSpacing: 0.6 },
  pageTitle: {
    fontSize: 23, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT,
    textAlign: 'center', marginTop: 6,
  },
  emptySub: { fontSize: 14, color: TXTSUB, fontFamily: FONTS.lato, marginTop: 8, textAlign: 'center', letterSpacing: 0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  cell: {
    backgroundColor: WHITE_CARD, borderRadius: CARD_RADIUS,
    paddingVertical: 15, paddingHorizontal: 15,
    flexBasis: '47%', flexGrow: 1,
  },
  cellHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellLabel: { fontSize: 13, color: TXTSUB, fontFamily: FONTS.latoBold, letterSpacing: 0.3, flexShrink: 1 },
  cellValue: { fontSize: 30, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold, marginTop: 6 },
  cellSub: { fontSize: 12.5, color: TXTSUB, fontFamily: FONTS.lato, marginTop: 4, letterSpacing: 0.2 },
  daysCount: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.latoBold, marginTop: 8, letterSpacing: 0.4 },
  daysRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: WHITE_CARD, borderRadius: CARD_RADIUS,
    paddingVertical: 18, paddingHorizontal: 12, marginTop: 16,
  },
  dayCol: { alignItems: 'center', flex: 1, gap: 7 },
  dayDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayDotOn: { backgroundColor: ROSE },
  dayDotOff: { backgroundColor: 'rgba(148,132,148,0.18)' },
  dayLabel: { fontSize: 11, color: TXTSUB, fontFamily: FONTS.lato },
  dayLabelOn: { color: TXT, fontFamily: FONTS.latoBold },
  personaShot: { borderRadius: CARD_RADIUS + 4, overflow: 'hidden' },
  personaShotBg: { width: '100%' },
  personaCard: {
    backgroundColor: WHITE_CARD, borderRadius: CARD_RADIUS,
    margin: 18, paddingVertical: 24, paddingHorizontal: 22, alignItems: 'center',
  },
  personaTitle: {
    fontSize: 27, fontWeight: '600', fontFamily: FONTS.loraBold, color: ROSE,
    marginTop: 8, textAlign: 'center',
  },
  personaBody: {
    fontSize: 15.5, lineHeight: 24, color: TXT, fontFamily: FONTS.lato,
    marginTop: 12, textAlign: 'center', letterSpacing: 0.3,
  },
  personaFootRow: { marginTop: 18 },
  personaFoot: { fontSize: 12, color: TXTSUB, fontFamily: FONTS.latoBold, letterSpacing: 0.8 },
  closingContent: { flex: 1, justifyContent: 'space-between' },
  closingBody: {
    fontSize: 15.5, lineHeight: 24, color: TXT, fontFamily: FONTS.lato,
    marginTop: 10, textAlign: 'center', letterSpacing: 0.3,
  },
  closingBtns: { gap: 12 },
  shareBtn: {
    height: 52, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  shareText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.5 },
  closeBtn: { height: 46, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: LAV, fontSize: 15.5, fontWeight: '600', fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  x: {
    position: 'absolute', left: 16, width: 40, height: 40,
    borderRadius: 20, backgroundColor: WHITE_CARD,
    alignItems: 'center', justifyContent: 'center',
  },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(120,105,120,0.30)' },
  dotOn: { backgroundColor: ROSE },
});
