import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { ROSE, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useTranslation } from '../state/TranslationsContext';
import { useUILanguage, type UILanguageCode } from '../state/UILanguageContext';
import { localizeReference } from '../services/parseReference';
import ShareVerseSheet from '../components/ShareVerseSheet';
import { useT } from '../i18n/useT';
import { localeFor } from '../i18n/locale';
import type { RootStackScreenProps } from '../navigation/types';

// How many calendar days back to show. 14 covers two weeks of morning + night
// pairs — enough for the user to scroll through recent reading without
// scrolling forever.
const HISTORY_DAYS = 14;

function SunGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Circle cx={12} cy={12} r={4} />
      <Line x1={12} y1={2} x2={12} y2={5} strokeLinecap="round" />
      <Line x1={12} y1={19} x2={12} y2={22} strokeLinecap="round" />
      <Line x1={2} y1={12} x2={5} y2={12} strokeLinecap="round" />
      <Line x1={19} y1={12} x2={22} y2={12} strokeLinecap="round" />
      <Line x1={4.9} y1={4.9} x2={6.9} y2={6.9} strokeLinecap="round" />
      <Line x1={17.1} y1={17.1} x2={19.1} y2={19.1} strokeLinecap="round" />
      <Line x1={4.9} y1={19.1} x2={6.9} y2={17.1} strokeLinecap="round" />
      <Line x1={17.1} y1={6.9} x2={19.1} y2={4.9} strokeLinecap="round" />
    </Svg>
  );
}

function MoonGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShareGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

function dateLabel(offset: number, d: Date, t: (k: string, p?: Record<string, string | number>) => string, lang: UILanguageCode): string {
  if (offset === 0) return t('pastVerses.today');
  if (offset === 1) return t('pastVerses.yesterday');
  if (offset < 7) return d.toLocaleDateString(localeFor(lang), { weekday: 'short' });
  return d.toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric' });
}

interface Row {
  key: string;
  segment: 'morning' | 'evening';
  ref: string;
  refRaw: string;             // English form, used as the share-sheet's reference
  text: string;
  verseLabel: string | null;  // e.g. "9" or "1-3" — rendered as a superscript
  date: string;
}

export default function PastVersesScreen({ navigation }: RootStackScreenProps<'PastVerses'>) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang } = useUILanguage();
  const { getVerse, todayDay } = useDailyVerses();
  const { current: translation } = useTranslation();
  const [shareTarget, setShareTarget] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const today = new Date();
    for (let i = 0; i < HISTORY_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayOfCycle = todayDay - i;             // getVerse handles negative values via modulus
      const label = dateLabel(i, d, t, lang);
      for (const seg of ['morning', 'evening'] as const) {
        const v = getVerse(dayOfCycle, seg);
        if (!v) continue;
        const refRaw = v.reference.full_reference;
        out.push({
          key: `${i}-${seg}`,
          segment: seg,
          ref: localizeReference(translation.code, refRaw),
          refRaw,
          text: v.modernText,
          verseLabel: v.reference.verse ? String(v.reference.verse) : null,
          date: label,
        });
      }
    }
    return out;
  }, [getVerse, todayDay, translation.code, t, lang]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('pastVerses.title')}</Text>
        <View style={styles.headerBtn} />
      </View>
      <View style={styles.divider} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {rows.map(r => {
          const isMorning = r.segment === 'morning';
          return (
            <View key={r.key} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  {isMorning ? <SunGlyph color={TXT} /> : <MoonGlyph color={TXT} />}
                  <Text style={styles.cardRef}>{r.ref}</Text>
                </View>
                <Text style={styles.cardDate}>{r.date}</Text>
              </View>

              <Text style={styles.cardBody}>
                {r.verseLabel ? <Text style={styles.verseNumber}>{r.verseLabel} </Text> : null}
                {r.text}
              </Text>

              <View style={styles.cardFoot}>
                <TouchableOpacity onPress={() => setShareTarget(r)} hitSlop={8} style={styles.footBtn}>
                  <ShareGlyph color={TXTSUB} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {shareTarget && (
        <ShareVerseSheet
          reference={shareTarget.ref}
          text={shareTarget.text}
          onClose={() => setShareTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingBottom: 14,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: TXT },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { paddingTop: 4 },
  card: {
    paddingHorizontal: P + 4,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.06)',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardRef: { fontSize: 17, fontWeight: '700', color: TXT },
  cardDate: { fontSize: 14, color: TXTSUB },
  cardBody: {
    fontFamily: FONTS.serif,
    fontVariationSettings: SERIF_BODY,    // Source Serif 4 VF — body opsz/wght
    fontSize: 19,
    lineHeight: 28,
    color: TXT,
  },
  verseNumber: { fontSize: 12, color: TXTSUB, fontWeight: '600' },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 18,
  },
  footBtn: { padding: 6 },
});

void ROSE;
