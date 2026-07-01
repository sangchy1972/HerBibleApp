import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { type NudgeId, type ArbiterReq, MAX_BUDGETED_PER_OPEN, pickActiveNudge } from './nudgePriority';

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
  // Bumped on any change that should re-run arbitration.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  // Reset the per-open budget on every return to the foreground — a fresh open
  // may surface one new budgeted nudge.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') { budgetUsed.current = 0; bump(); }
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
    const reqs: ArbiterReq[] = [...requests.current.values()].map(r => ({
      id: r.id, priority: r.priority, eligible: r.canShow(), ignoresBudget: r.ignoresBudget,
    }));
    const pick = pickActiveNudge(reqs, MAX_BUDGETED_PER_OPEN - budgetUsed.current);
    if (pick) {
      const req = requests.current.get(pick);
      if (req && !req.ignoresBudget) budgetUsed.current += 1;
      setActiveId(pick);
    }
  }, [version, activeId]);

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
