import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// Local-timezone YYYY-MM-DD string. Day boundaries are local — morning prayer
// should roll forward when the user's wall clock crosses midnight, regardless
// of UTC. Exported for callers that need the FRESH value at call time (e.g.
// GospelsPsalms markDone stamps completion dates — a stale hook closure there
// could stamp the wrong day; see the v1 stuck-progress bug).
export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// React-aware "today" hook. Returns a fresh YMD whenever the calendar day
// changes — used as a dependency by contexts that compute daily picks
// (verse-of-day, prayer-bg image / audio) so the picks invalidate when the
// user re-opens the app on a new day.
//
// Why this is needed: those contexts memoize on `[manifest, loaded]` /
// `[firstLaunch, coverageDays]`, none of which change at midnight. Without a
// dependency that ticks per-day, React holds the prior render — the user
// sees yesterday's verse / image / audio.
//
// Update triggers:
//   1. App returns to foreground (AppState → 'active'). Catches the common
//      "I opened the app today after closing it last night" case.
//   2. A midnight setTimeout. Catches the rare "I left the app open across
//      midnight" case — the screen still flips to today's content without
//      needing a backgrounding event. The timeout reschedules itself
//      recursively so the next midnight is also covered.
export function useCurrentDayYmd(): string {
  const [ymd, setYmd] = useState<string>(todayYmd);

  useEffect(() => {
    const refresh = () => {
      const fresh = todayYmd();
      setYmd(prev => (prev === fresh ? prev : fresh));
    };

    // AppState — fires when user returns from background.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refresh();
    });

    // Schedule a tick at the next local midnight (+1 s slack to be safe).
    // On fire, refresh and reschedule for the day after.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const ms = Math.max(1000, next.getTime() - now.getTime());
      timer = setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, ms);
    };
    scheduleMidnight();

    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return ymd;
}
