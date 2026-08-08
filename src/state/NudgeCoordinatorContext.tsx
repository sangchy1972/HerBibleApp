import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type NudgeId, type ArbiterReq,
  MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN, BUDGETED_NUDGE_FLOOR_MS,
  NUDGE_WAVE_QUIET_MS, startsNewWave, pickActiveNudge,
} from './nudgePriority';
import { useReminderInterstitial } from './ReminderInterstitialContext';
import { useFirstRunTour } from './FirstRunTourContext';
import { usePromptSurfaceSafe, setNudgeActive } from './promptSurface';

const LAST_BUDGETED_KEY = 'nudge:lastBudgetedAt:v1';

// Coordinator for BLOCKING prompts (bottom sheets / modal overlays) mounted at
// the app root. Guarantees at most one is on screen at a time, chosen by
// priority, with a per-open budget on "nudge" prompts (see nudgePriority.ts).
//
// It does NOT own each prompt's gating — every prompt keeps its own shouldShow
// logic and simply (1) registers a request when it wants to show, (2) renders
// only when `isActive(id)`, (3) calls `notifyDismissed(id)` when it closes.
// Banners and OS notifications do NOT go through here.

interface NudgeRequest {
  id: NudgeId;
  priority: number;
  canShow: () => boolean;
  /** Reward / daily-ritual prompts bypass the per-open budget. */
  ignoresBudget?: boolean;
  /** Optional owner tag for slot ids shared by MORE THAN ONE host (today the
   *  two plan-guide triggers). releaseSlot(id, owner) then deletes the entry
   *  only if it is still that owner's — otherwise the host going ineligible
   *  silently deletes the OTHER host's live request and the nudge is lost. */
  owner?: string;
}

interface NudgeCoordinatorState {
  requestSlot: (req: NudgeRequest) => void;
  releaseSlot: (id: NudgeId, owner?: string) => void;
  isActive: (id: NudgeId) => boolean;
  notifyDismissed: (id: NudgeId) => void;
}

const Ctx = createContext<NudgeCoordinatorState | null>(null);

export function NudgeCoordinatorProvider({ children }: { children: React.ReactNode }) {
  const requests = useRef<Map<NudgeId, NudgeRequest>>(new Map());
  const [activeId, setActiveId] = useState<NudgeId | null>(null);
  const budgetUsed = useRef(0);
  const shownThisOpen = useRef(0);          // TOTAL blocking prompts shown this open (the 2-cap)
  const lastBlockingAt = useRef(0);         // when the last blocking prompt was granted
  const lastBudgetedAt = useRef(0);         // persisted; drives BUDGETED_NUDGE_FLOOR_MS between budgeted nudges
  // Bumped on any change that should re-run arbitration.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  // Suppress ALL coordinator prompts while the full-screen "Follow Him" opt-in
  // (a pre-tab gate that replaces the tabs) is showing — otherwise a sheet could
  // render on top of it (both are notif-off surfaces, so they collide).
  // OBSERVED, not inferred (owner 2026-08-08): only while FollowHimScreen is
  // actually mounted. It used to read `ready && shouldShow`, which is true
  // during the questionnaire too (RootNavigator renders that first), so a
  // returning user mid-onboarding had every coordinator prompt — mood, login,
  // rate, widget, both guides — silenced by a screen that wasn't there. The
  // exclusion itself stays: nothing may paint over a pre-tab full-screen gate.
  const reminder = useReminderInterstitial();
  const reminderGateUp = reminder.onScreen;

  // Same idea for the first-run home tour. Priority alone would NOT be enough:
  // arbitration never preempts a visible prompt, and the mood sheet self-fires
  // on a 600 ms timer the instant onboarding completes — i.e. before the tour
  // has even measured its anchors. So we hard-gate on `pending` too, which is
  // true from the first render after hydration.
  const tour = useFirstRunTour();
  const tourGateUp = tour.ready && (tour.pending || tour.active);

  // WHERE the user is. Five prompt hosts live at app root with no screen gating
  // of their own, so without this a grant could paint a sheet over the Bible
  // reader, a plan day, the prayer flow, the paywall, or a fullscreen ad. Gating
  // the coordinator covers every blocking prompt at once — and can't be
  // forgotten by whoever adds the next host. NEW GRANTS only: a prompt already
  // holding the slot keeps it, and a queued request just waits for a tab.
  const surfaceSafe = usePromptSurfaceSafe();

  useEffect(() => {
    AsyncStorage.getItem(LAST_BUDGETED_KEY).then(v => { if (v) lastBudgetedAt.current = Number(v) || 0; }).catch(() => {});
  }, []);

  // Reset the per-open counters on every return to the foreground.
  const foregroundTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { foregroundTimers.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
        if (s === 'active') {
        budgetUsed.current = 0; shownThisOpen.current = 0; lastBlockingAt.current = 0;
        // DELAYED, not synchronous. On a hot start the app_open interstitial is
        // requested off InteractionManager, so arbitrating here would grant a
        // slot in the same frame and the ad would then cover the prompt it just
        // granted. A beat's delay lets isInterstitialVisible() claim the screen
        // first, and the surface gate refuses.
        const tm = setTimeout(bump, 1200);
        foregroundTimers.current.push(tm);
      }
    });
    return () => sub.remove();
  }, [bump]);

  const requestSlot = useCallback((req: NudgeRequest) => {
    const prev = requests.current.get(req.id);
    requests.current.set(req.id, req);
    // Only re-arbitrate when the request is genuinely new (avoid churn from a
    // host re-registering an identical request every render).
    if (!prev) bump();
  }, [bump]);

  const releaseSlot = useCallback((id: NudgeId, owner?: string) => {
    const cur = requests.current.get(id);
    if (!cur) return;
    // Shared slot id: only the host that actually owns the live request may
    // release it (see NudgeRequest.owner).
    if (owner != null && cur.owner != null && cur.owner !== owner) return;
    requests.current.delete(id);
    setActiveId(a => (a === id ? null : a));
    bump();
  }, [bump]);

  const notifyDismissed = useCallback((id: NudgeId) => {
    setActiveId(a => (a === id ? null : a));
    bump();
  }, [bump]);

  // Arbitrate ONLY when nothing is currently active — a visible prompt is never
  // preempted; the next one is chosen after it dismisses.
  useEffect(() => {
    if (activeId !== null) return;
    if (reminderGateUp) return;   // pre-tab Follow-Him gate up → suppress everything
    if (tourGateUp) return;       // first-run tour owed or running → suppress everything
    if (!surfaceSafe) return;     // she's mid-flow / mid-ad → don't ambush her
    const now = Date.now();
    // A new WAVE: the queue is up to seven deep on day one, and the 2-cap must
    // not hold the rest hostage until she happens to background the app. Ten
    // quiet minutes and the counters reset (see NUDGE_WAVE_QUIET_MS).
    if (startsNewWave(lastBlockingAt.current, now)) {
      budgetUsed.current = 0;
      shownThisOpen.current = 0;
      lastBlockingAt.current = 0;
    }
    const withinFloor = now - lastBudgetedAt.current < BUDGETED_NUDGE_FLOOR_MS;
    const budgetRemaining = withinFloor ? 0 : (MAX_BUDGETED_PER_OPEN - budgetUsed.current);
    const blockingRemaining = MAX_BLOCKING_PER_OPEN - shownThisOpen.current;
    const reqs: ArbiterReq[] = [...requests.current.values()].map(r => ({
      id: r.id, priority: r.priority, eligible: r.canShow(), ignoresBudget: r.ignoresBudget,
    }));
    const pick = pickActiveNudge(reqs, budgetRemaining, blockingRemaining);
    if (pick) {
      const req = requests.current.get(pick);
      shownThisOpen.current += 1;                     // counts toward the 2-cap
      if (req && !req.ignoresBudget) {
        budgetUsed.current += 1;
        lastBudgetedAt.current = now;
        AsyncStorage.setItem(LAST_BUDGETED_KEY, String(now)).catch(() => {});
      }
      lastBlockingAt.current = now;
      setActiveId(pick);
      return;
    }
    // Nothing shown but something IS waiting → re-arbitrate the moment whichever
    // clock is holding it back elapses. Without this the effect only re-runs on
    // the next request/dismiss/foreground, so a queue blocked purely by a timer
    // stalls with slots still free — the 30s budgeted floor inside a 10s wave
    // hits this constantly, and widget + rate were dropping out of day one.
    if (reqs.some(r => r.eligible)) {
      const waits: number[] = [];
      if (blockingRemaining <= 0 && lastBlockingAt.current > 0) {
        waits.push(NUDGE_WAVE_QUIET_MS - (now - lastBlockingAt.current));
      }
      if (withinFloor) waits.push(BUDGETED_NUDGE_FLOOR_MS - (now - lastBudgetedAt.current));
      if (waits.length) {
        const tm = setTimeout(bump, Math.max(250, Math.min(...waits)));
        return () => clearTimeout(tm);
      }
    }
  }, [version, activeId, reminderGateUp, tourGateUp, surfaceSafe, bump]);

  // Publish "a prompt is up" for non-coordinator surfaces — today the proactive
  // paywall, which navigates to a full-screen route and would otherwise land on
  // top of (Android) or underneath (iOS fullScreenModal) a live sheet.
  useEffect(() => { setNudgeActive(activeId !== null); }, [activeId]);

  // SAFETY VALVE. `activeId` is cleared only by notifyDismissed/releaseSlot, so a
  // host that unmounts while holding the slot — and five of them have no unmount
  // release — would block every later prompt for the session. The real path:
  // ReminderInterstitialContext re-derives its day/night slot on every
  // foreground, so a notifications-off user who returns after 18:00 has the whole
  // tab tree swapped out for FollowHimScreen mid-session, unmounting every
  // home-hosted trigger. If the active id has no live request behind it, drop it.
  useEffect(() => {
    if (activeId === null) return;
    const tm = setTimeout(() => {
      if (!requests.current.has(activeId)) {
        setActiveId(null);
        bump();
      }
    }, 1500);
    return () => clearTimeout(tm);
  }, [activeId, bump]);

  const value = useMemo<NudgeCoordinatorState>(() => ({
    requestSlot,
    releaseSlot,
    isActive: (id: NudgeId) => activeId === id,
    notifyDismissed,
  }), [requestSlot, releaseSlot, notifyDismissed, activeId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNudgeCoordinator(): NudgeCoordinatorState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNudgeCoordinator must be used inside NudgeCoordinatorProvider');
  return ctx;
}
