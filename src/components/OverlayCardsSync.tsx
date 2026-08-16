import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDailyVerses } from '../state/DailyVersesContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useQuiz } from '../state/QuizContext';
import { useNotifications } from '../state/NotificationsContext';
import { useT } from '../i18n/useT';
import { logEvent } from '../services/firebase';
import {
  overlayCardsSupported, canDrawOverlays, configureOverlayCards, drainOverlayEvents,
  type OverlayCardPayload,
} from '../../modules/expo-overlay-cards';

// Mirrors today's content into the native overlay-card store, the same way
// WidgetSync feeds the home-screen widget: the native side shows cards from a
// COLD process (AlarmManager → receiver, app possibly dead), so everything it
// needs — pre-localized strings, the verse, the quiz question, a local image
// path — must be written ahead of time, on every app open.
//
// Slot mapping (owner 2026-08-16): the popups fire at the SAME times as her
// own daily reminders — morning reminder time → the VERSE card (morning verse
// over the morning art), night reminder time → the QUIZ card. Each slot also
// respects that reminder's enabled toggle: switching a reminder off switches
// its popup off too.
const GRANT_LOGGED_KEY = 'overlayCards:grantedLogged:v1';

export default function OverlayCardsSync() {
  const { getVerse, todayDay } = useDailyVerses();
  const { imageFor, loaded } = usePrayerBackgrounds();
  const quiz = useQuiz();
  const { settings } = useNotifications();
  const t = useT();
  const last = useRef('');
  // Re-evaluate permission on every foreground — the grant happens in system
  // settings, OUTSIDE the app, so this is the only way we ever learn of it.
  const [fgTick, setFgTick] = useState(0);

  useEffect(() => {
    if (!overlayCardsSupported()) return;
    const drain = () => {
      // Events the cold receiver queued (shown / tap / dismiss) — feed them to
      // Firebase now that JS exists again.
      for (const e of drainOverlayEvents()) logEvent(e.n, e.p);
    };
    drain();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') { setFgTick(n => n + 1); drain(); }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!overlayCardsSupported()) return;
    if (!canDrawOverlays()) return;   // not granted (yet) — nothing to schedule

    // Log the grant exactly once, however it happened (our nudge or the user
    // finding the system toggle herself).
    AsyncStorage.getItem(GRANT_LOGGED_KEY).then(v => {
      if (v === '1') return;
      AsyncStorage.setItem(GRANT_LOGGED_KEY, '1').catch(() => {});
      logEvent('overlay_cards_granted');
    }).catch(() => {});

    const cards: OverlayCardPayload[] = [];

    const m = getVerse(todayDay, 'morning');
    if (m && settings.morning.enabled) {
      // Only a LOCAL file is useful to the cold native path; the CDN fallback
      // uri would need network at 8am in a process with no fetch stack. No
      // cache yet → empty path → the native side paints its gradient.
      const img = imageFor('morning') as { uri?: string } | number;
      const uri = typeof img === 'object' && typeof img?.uri === 'string' ? img.uri : '';
      cards.push({
        slot: 'morning',
        hour: settings.morning.hour,
        minute: settings.morning.minute,
        kind: 'verse',
        deepLink: 'herbible://verse-of-day?src=overlay',
        verseText: m.modernText,
        verseRef: m.reference.full_reference,
        ctaLabel: t('widget.amen'),
        imagePath: uri.startsWith('file://') ? uri.slice('file://'.length) : '',
      });
    }

    // The teaser question is the first of the set she would land in next —
    // resolved by QuizContext exactly the way the home card resolves it.
    const q = quiz.ready && quiz.bank ? quiz.questions[0] : undefined;
    if (q && settings.night.enabled) {
      cards.push({
        slot: 'night',
        hour: settings.night.hour,
        minute: settings.night.minute,
        kind: 'quiz',
        deepLink: 'herbible://quiz?src=overlay',
        badge: t('overlayCards.quizBadge'),
        question: q.question,
        options: [...q.options],
      });
    }

    if (cards.length === 0) return;
    const ser = JSON.stringify(cards);
    if (ser === last.current) return;
    last.current = ser;
    configureOverlayCards('Her Bible', cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getVerse, todayDay, imageFor, loaded, quiz.ready, quiz.bank, quiz.questions, settings, t, fgTick]);

  return null;
}
