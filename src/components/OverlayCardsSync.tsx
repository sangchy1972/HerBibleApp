import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDailyVerses } from '../state/DailyVersesContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useQuiz } from '../state/QuizContext';
import { useNotifications } from '../state/NotificationsContext';
import { usePrayer } from '../state/PrayerContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import {
  getOverlayCardsEnabled, hydrateOverlayCardsEnabled, subscribeOverlayCardsEnabled,
} from '../state/overlayCardsPrefs';
import { useT } from '../i18n/useT';
import { logEvent } from '../services/firebase';
import {
  overlayCardsSupported, canDrawOverlays, configureOverlayCards, cancelOverlayCards,
  drainOverlayEvents, type OverlayCardPayload,
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
  const { mDone, eDone } = usePrayer();
  const { records: planRecords } = usePlanCompletion();
  const { getSummary, summary: planSummaries } = useFeaturedPlans();
  const t = useT();
  const last = useRef('');
  // Re-evaluate permission on every foreground — the grant happens in system
  // settings, OUTSIDE the app, so this is the only way we ever learn of it.
  const [fgTick, setFgTick] = useState(0);
  // The Profile sheet's master switch. Flipping OFF must tear the alarms down,
  // not just stop refreshing content.
  const enabled = useSyncExternalStore(subscribeOverlayCardsEnabled, getOverlayCardsEnabled);
  useEffect(() => { void hydrateOverlayCardsEnabled(); }, []);

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
    if (!enabled) {
      // Master switch off — tear down schedule + content, and forget the last
      // payload so re-enabling always re-configures.
      cancelOverlayCards();
      last.current = '';
      return;
    }
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

    // Evening verse card (owner 2026-08-21): the 16:00–24:00 half-day gets its
    // own verse card, anchored on the night reminder time and silenced once
    // the evening prayer is done — the native gate owns both rules.
    const ev = getVerse(todayDay, 'evening');
    if (ev && settings.night.enabled) {
      const eimg = imageFor('evening') as { uri?: string } | number;
      const euri = typeof eimg === 'object' && typeof eimg?.uri === 'string' ? eimg.uri : '';
      cards.push({
        slot: 'evening',
        hour: settings.night.hour,
        minute: settings.night.minute,
        kind: 'verse',
        deepLink: 'herbible://verse-of-day?src=overlay',
        verseText: ev.modernText,
        verseRef: ev.reference.full_reference,
        ctaLabel: t('widget.amen'),
        imagePath: euri.startsWith('file://') ? euri.slice('file://'.length) : '',
      });
    }

    // Quiz card — roams the WHOLE day now (owner 2026-08-21), capped at two
    // successful shows natively; no alarm anchor, the rotation carries it.
    // The teaser question is the first of the set she would land in next —
    // resolved by QuizContext exactly the way the home card resolves it.
    const q = quiz.ready && quiz.bank ? quiz.questions[0] : undefined;
    if (q) {
      cards.push({
        slot: 'quiz',
        hour: 12, minute: 0,   // nominal — no alarm is armed for this slot
        kind: 'quiz',
        deepLink: 'herbible://quiz?src=overlay',
        badge: t('overlayCards.quizBadge'),
        question: q.question,
        options: [...q.options],
      });
    }

    // Plan card — "Continue with Your Bible Plan" over the most recently
    // started in-progress plan's title. Rotation-only, like the quiz.
    const inProgress = Object.entries(planRecords)
      .filter(([, r]) => r.completedDays.length > 0 && !r.finishedAt)
      .sort(([, a], [, b]) => (b.firstStartedAt ?? 0) - (a.firstStartedAt ?? 0));
    const planTitle = inProgress.length > 0 ? getSummary(inProgress[0][0])?.title : undefined;
    if (planTitle) {
      cards.push({
        slot: 'plan',
        hour: 12, minute: 0,   // nominal — no alarm is armed for this slot
        kind: 'plan',
        deepLink: 'herbible://plan?src=overlay',
        badge: t('overlayCards.plan.title'),
        question: planTitle,
        ctaLabel: t('common.continue'),
      });
    }

    // Before-You-Sleep reflection card — fixed 21:58 (owner 2026-08-21), no
    // reminder pairing: the master switch alone governs. One of five nightly
    // examen questions rotates by day; No routes into the evening prayer flow
    // (she hasn't prayed — invite her now), Yes lands on today's verse.
    const SLEEP_QS = [
      'overlayCards.sleep.q1', 'overlayCards.sleep.q2', 'overlayCards.sleep.q3',
      'overlayCards.sleep.q4', 'overlayCards.sleep.q5',
    ] as const;
    cards.push({
      slot: 'sleep',
      hour: 21,
      minute: 58,
      kind: 'reflect',
      deepLink: 'herbible://verse-of-day?src=sleepcard',
      badge: t('overlayCards.sleep.title'),
      question: t(SLEEP_QS[((todayDay % SLEEP_QS.length) + SLEEP_QS.length) % SLEEP_QS.length]),
      options: [t('overlayCards.sleep.no'), t('overlayCards.sleep.yes')],
      linkYes: 'herbible://verse-of-day?src=sleepcard&ans=yes',
      linkNo: 'herbible://prayer?src=sleepcard&ans=no',
    });

    if (cards.length === 0) return;
    // Prayer-done stamps ride the payload so completing a prayer mid-day
    // re-configures and silences that half-day's verse card natively.
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const state = { prayedAmYmd: mDone ? ymd : '', prayedPmYmd: eDone ? ymd : '' };
    const ser = JSON.stringify([cards, state]);
    if (ser === last.current) return;
    last.current = ser;
    configureOverlayCards('Her Bible', cards, {
      title: t('overlayCards.svcTitle'),
      body: t('overlayCards.svcBody'),
    }, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getVerse, todayDay, imageFor, loaded, quiz.ready, quiz.bank, quiz.questions, settings, t, fgTick, enabled, mDone, eDone, planRecords, planSummaries, getSummary]);

  return null;
}
