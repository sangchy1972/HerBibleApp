// Localized section labels for the daily verse card and prayer flow.
// The upstream JSON only ships the per-verse content (text, meditation,
// action_step, prayer); the framing labels around them ("Verse of the Day",
// "Reflection", etc.) live here so a translation update doesn't need a
// content republish.

import type { LanguageCode } from '../state/TranslationsContext';

export interface DailyLabels {
  verseOfDay: string;
  verseOfNight: string;
  meditationTitle: string;
  actionTitleMorning: string;
  actionTitleEvening: string;
  prayerTitle: string;
}

const LABELS: Record<LanguageCode, DailyLabels> = {
  en: {
    verseOfDay: 'Verse of the Day',
    verseOfNight: 'Verse of the Night',
    meditationTitle: 'Reflection',
    actionTitleMorning: "Today's Practice",
    actionTitleEvening: "Tonight's Practice",
    prayerTitle: 'Closing Prayer',
  },
  'zh-Hans': {
    verseOfDay: '今日经文',
    verseOfNight: '今夜经文',
    meditationTitle: '默想',
    actionTitleMorning: '今日实践',
    actionTitleEvening: '今晚实践',
    prayerTitle: '结束祷告',
  },
  'zh-Hant': {
    verseOfDay: '今日經文',
    verseOfNight: '今夜經文',
    meditationTitle: '默想',
    actionTitleMorning: '今日實踐',
    actionTitleEvening: '今晚實踐',
    prayerTitle: '結束禱告',
  },
  de: {
    verseOfDay: 'Vers des Tages',
    verseOfNight: 'Vers des Abends',
    meditationTitle: 'Betrachtung',
    actionTitleMorning: 'Heutige Übung',
    actionTitleEvening: 'Heutige Abendübung',
    prayerTitle: 'Abschlussgebet',
  },
  fr: {
    verseOfDay: 'Verset du jour',
    verseOfNight: 'Verset du soir',
    meditationTitle: 'Méditation',
    actionTitleMorning: 'Pratique du jour',
    actionTitleEvening: 'Pratique du soir',
    prayerTitle: 'Prière de clôture',
  },
  es: {
    verseOfDay: 'Versículo del día',
    verseOfNight: 'Versículo de la noche',
    meditationTitle: 'Meditación',
    actionTitleMorning: 'Práctica de hoy',
    actionTitleEvening: 'Práctica de esta noche',
    prayerTitle: 'Oración final',
  },
  pt: {
    verseOfDay: 'Versículo do dia',
    verseOfNight: 'Versículo da noite',
    meditationTitle: 'Meditação',
    actionTitleMorning: 'Prática de hoje',
    actionTitleEvening: 'Prática desta noite',
    prayerTitle: 'Oração final',
  },
};

export function dailyLabels(code: LanguageCode): DailyLabels {
  return LABELS[code] || LABELS.en;
}
