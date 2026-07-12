import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type NudgeId, type ArbiterReq,
  MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN, BUDGETED_NUDGE_FLOOR_MS, pickActiveNudge,
} from './nudgePriority';
import { useReminderInterstitial } from './ReminderInterstitialContext';
import { useFirstRunTour } from './FirstRunTourContext';

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
}

interface NudgeCoordinatorState {
  requestSlot: (req: NudgeRequest) => void;
  releaseSlot: (id: NudgeId) => void;
  isActive: (id: NudgeId) => boolean;
  notifyDismissed: (id: NudgeId) => void;
}

const Ctx = createContext<NudgeCoordinatorState | null>(null);

export function NudgeCoordinatorProvider({ children }: { children: React.ReactNode }) {
  const requests = useRef<Map<NudgeId, NudgeRequest>>(new Map());
  const [activeId, setActiveId] = useState<NudgeId | null>(null);
  const budgetUsed = useRef(0);
  const shownThisOpen = useRef(0);          // TOTAL blocking prompts shown this open (the 2-cap)
  const lastBudgetedAt = useRef(0);         // persisted; drives the 6h floor between budgeted nudges
  // Bumped on any change that should re-run arbitration.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  // Suppress ALL coordinator prompts while the full-screen "Follow Him" opt-in
  // (a pre-tab gate that replaces the tabs) is showing — otherwise a sheet could
  // render on top of it (both are notif-off surfaces, so they collide).
  const reminder = useReminderInterstitial();
  const reminderGateUp = reminder.ready && reminder.shouldShow;

  // Same idea for the first-run home tour. Priority alone would NOT be enough:
  // arbitration never preempts a visible prompt, and the mood sheet self-fires
  // on a 600 ms timer the instant onboarding completes — i.e. before the tour
  // has even measured its anchors. So we hard-gate on `pending` too, which is
  // true from the first render after hydration.
  const tour = useFirstRunTour();
  const tourGateUp = tour.ready && (tour.pending || tour.active);

  useEffect(() => {
    AsyncStorage.getItem(LAST_BUDGETED_KEY).then(v => { if (v) lastBudgetedAt.current = Number(v) || 0; }).catch(() => {});
  }, []);

  // Reset the per-open counters on every return to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') { budgetUsed.current = 0; shownThisOpen.current = 0; bump(); }
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

  const releaseSlot = useCallback((id: NudgeId) => {
    if (!requests.current.has(id)) return;
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
    const now = Date.now();
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
      setActiveId(pick);
    }
  }, [version, activeId, reminderGateUp, tourGateUp]);

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
