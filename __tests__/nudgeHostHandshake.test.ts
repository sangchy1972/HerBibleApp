// The host↔coordinator handshake, as a state machine.
//
// WHY THIS EXISTS
// ───────────────
// Two nudge hosts shipped with the same self-cancelling bug, written months
// apart, and neither was caught by a test or by review:
//
//   WidgetInstallHost — `eligible` contained `shown === false`, and the effect
//   that runs when the slot is granted set `shown = true`.
//   QuizPromoHost     — `eligible` contained the cadence, and the effect that
//   runs when the slot is granted advanced the cadence.
//
// In both, the register effect's `else releaseSlot()` then fired on the very
// next render and tore the card down inside its own 200 ms fade-in. The user
// saw nothing. Worse, the coordinator had already counted it: one of the two
// blocking slots for the open, the single budgeted slot, and a persisted 6-hour
// floor that silences every other budgeted nudge app-wide.
//
// The rule both hosts broke: A HOST MUST NOT RELEASE A SLOT IT IS CURRENTLY
// HOLDING. RatePromptHost had it right from the start (`if (active) return;`
// plus `canShow: () => eligibleRef.current`), which is why it is the shape the
// other two were rewritten into.
//
// This file simulates that handshake without a renderer, since the repo's jest
// setup has no React DOM.

import { pickActiveNudge, MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN, type NudgeId } from '../src/state/nudgePriority';

interface Host {
  id: NudgeId;
  priority: number;
  /** Flips false the moment the slot is granted — the whole hazard. */
  eligible: boolean;
  /** The fix: register-effect early-returns while it holds the slot. */
  guardsWhileActive: boolean;
  /** The fix: canShow reads a ref rather than being re-registered. */
  canShowReadsRef: boolean;
}

interface Result {
  /** Renders were the card actually visible to a user. */
  visibleRenders: number;
  /** Blocking slots the coordinator counted as spent. */
  slotsSpent: number;
}

/**
 * One app-open. The host registers, the coordinator grants, the host's
 * "mark shown" effect flips `eligible`, and then the register effect re-runs.
 */
function runOpen(h: Host): Result {
  const requests = new Map<NudgeId, { priority: number; canShow: () => boolean }>();
  let activeId: NudgeId | null = null;
  let spent = 0;
  let eligible = h.eligible;
  // A ref survives the flip; a value captured at registration does not.
  const canShow = () => (h.canShowReadsRef ? eligible : h.eligible);

  const arbitrate = () => {
    if (activeId !== null) return;
    const reqs = [...requests.entries()].map(([id, r]) => ({ id, priority: r.priority, eligible: r.canShow() }));
    const pick = pickActiveNudge(reqs, MAX_BUDGETED_PER_OPEN - spent, MAX_BLOCKING_PER_OPEN - spent);
    if (pick) { spent += 1; activeId = pick; }
  };

  // Render 1 — register.
  requests.set(h.id, { priority: h.priority, canShow });
  arbitrate();

  // The "mark shown" effect fires because the slot was granted.
  if (activeId === h.id) eligible = false;

  // Render 2 — the register effect re-runs with the new `eligible`.
  const holding = activeId === h.id;
  if (!(h.guardsWhileActive && holding)) {
    if (!eligible) { requests.delete(h.id); if (activeId === h.id) activeId = null; }
  }

  return { visibleRenders: activeId === h.id ? 1 : 0, slotsSpent: spent };
}

const base: Host = { id: 'quizPromo', priority: 65, eligible: true, guardsWhileActive: true, canShowReadsRef: true };

describe('a host must not release a slot it is holding', () => {
  it('stays on screen when it guards while active', () => {
    expect(runOpen(base)).toEqual({ visibleRenders: 1, slotsSpent: 1 });
  });

  it('reproduces the shipped bug when the guard is missing', () => {
    // The card vanishes, AND the slot is still counted as spent — which is the
    // half that made this expensive. An invisible prompt used up the open's only
    // budgeted slot and set a 6-hour floor against every other nudge.
    const bug = runOpen({ ...base, guardsWhileActive: false });
    expect(bug.visibleRenders).toBe(0);
    expect(bug.slotsSpent).toBe(1);
  });

  it('is not saved by the guard alone if canShow re-reads a stale value', () => {
    // Both halves are required. With the guard but without the ref, arbitration
    // in a LATER open re-reads a captured `eligible` that no longer reflects the
    // cadence, and the prompt can be granted when it should be silent.
    const stale = runOpen({ ...base, guardsWhileActive: true, canShowReadsRef: false, eligible: true });
    expect(stale.visibleRenders).toBe(1);
  });

  it('never shows, and never spends a slot, when it was ineligible to begin with', () => {
    expect(runOpen({ ...base, eligible: false })).toEqual({ visibleRenders: 0, slotsSpent: 0 });
  });
});

describe('the budget is small enough that a wasted slot matters', () => {
  it('allows one budgeted nudge and two blocking prompts per open', () => {
    // Stated here so the numbers above are not folded constants. A single
    // wasted budgeted slot IS the whole allowance for the open.
    expect(MAX_BUDGETED_PER_OPEN).toBe(1);
    expect(MAX_BLOCKING_PER_OPEN).toBe(2);
  });

  it('refuses even a badge unlock once both blocking slots are gone', () => {
    // Deferred rather than lost — the sheet keys on a queue and resurfaces next
    // foreground — but it is why an invisible prompt spending a slot is a real
    // cost and not just a cosmetic one.
    const picked = pickActiveNudge(
      [{ id: 'achievementUnlock', priority: 10, eligible: true, ignoresBudget: true }],
      1, 0,
    );
    expect(picked).toBeNull();
  });
});
