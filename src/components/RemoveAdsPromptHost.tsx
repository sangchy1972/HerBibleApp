import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { logEvent } from '../services/firebase';
import { onInterstitialVisibility } from '../services/interstitialVisibility';
import { areAdsRemoved } from '../services/ads';
import { removeAdsShouldAsk, type RemoveAdsPromptState } from '../state/removeAdsPrompt';
import type { RootStackParamList } from '../navigation/types';

// Proactive remove-ads pitch (owner 2026-08-08). Renders NOTHING: it listens
// for an interstitial closing and, on the days the cadence allows, opens the
// paywall — which itself offers the 7-day trial when closed, so one navigation
// delivers day one's whole two-stage rhythm (see state/removeAdsPrompt for the
// rules and RemoveAdsScreen for the trial sheet).
//
// Deliberately NOT coordinator-managed. The coordinator serialises prompts that
// compete for the HOME screen; this one is anchored to a moment (the ad just
// closed, the user is already interrupted) and would otherwise be starved for
// waves behind the per-wave blocking cap. It cannot collide with a sheet either, because
// it navigates to a full-screen route instead of painting an overlay.

const KEY = 'removeAdsPrompt:v1';

const ymdOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function RemoveAdsPromptHost() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const [state, setState] = useState<RemoveAdsPromptState | null>(null);
  // Mirrored so the visibility listener — registered once — always reads the
  // live snapshot instead of the one captured when it was attached.
  const stateRef = useRef<RemoveAdsPromptState | null>(null);
  stateRef.current = state;

  const save = (next: RemoveAdsPromptState) => {
    stateRef.current = next;
    setState(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };

  // Hydrate + count today as an active day. Also re-counted on every foreground
  // so a session left open across midnight rolls the day over.
  useEffect(() => {
    let alive = true;
    const bump = (prev: RemoveAdsPromptState | null) => {
      const today = ymdOf(new Date());
      const base: RemoveAdsPromptState = prev ?? { activeDays: 0, lastAskYmd: '', lastAdDayYmd: '' };
      // `lastActiveYmd` lives inside the same record; keeping it out of the pure
      // rules keeps those about ASKING, not about bookkeeping.
      const seen = (base as RemoveAdsPromptState & { lastActiveYmd?: string }).lastActiveYmd ?? '';
      if (seen === today) return base;
      return { ...base, activeDays: base.activeDays + 1, lastActiveYmd: today } as RemoveAdsPromptState;
    };

    (async () => {
      let parsed: RemoveAdsPromptState | null = null;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const p = raw ? JSON.parse(raw) : null;
        if (p && typeof p === 'object') {
          parsed = {
            activeDays: typeof p.activeDays === 'number' && p.activeDays >= 0 ? Math.floor(p.activeDays) : 0,
            lastAskYmd: typeof p.lastAskYmd === 'string' ? p.lastAskYmd : '',
            lastAdDayYmd: typeof p.lastAdDayYmd === 'string' ? p.lastAdDayYmd : '',
            ...(typeof p.lastActiveYmd === 'string' ? { lastActiveYmd: p.lastActiveYmd } : {}),
          } as RemoveAdsPromptState;
        }
      } catch { /* fresh state */ }
      if (!alive) return;
      save(bump(parsed));
    })();

    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      const cur = stateRef.current;
      if (!cur) return;                      // hydration will count it
      const next = bump(cur);
      if (next !== cur) save(next);
    });
    return () => { alive = false; sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The trigger: an interstitial just went away.
  useEffect(() => {
    const off = onInterstitialVisibility(visible => {
      if (visible) return;                   // only the CLOSE edge
      const cur = stateRef.current;
      if (!cur) return;
      const today = ymdOf(new Date());
      if (!removeAdsShouldAsk(cur, today, areAdsRemoved())) {
        // Still spend today's ad slot: "the FIRST ad of the day" must mean the
        // first one, not "the first one that happened to qualify".
        if (cur.lastAdDayYmd !== today) save({ ...cur, lastAdDayYmd: today });
        return;
      }
      save({ ...cur, lastAdDayYmd: today, lastAskYmd: today });
      logEvent('remove_ads_prompt', { active_days: cur.activeDays, repeat: cur.lastAskYmd === '' ? 0 : 1 });
      // Let the ad's own dismissal animation finish before we push a full-screen
      // route over it — presenting into a closing native overlay drops the
      // transition on Android.
      setTimeout(() => {
        try { nav.navigate('RemoveAds', { proactive: true }); } catch { /* route not mounted */ }
      }, 450);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
