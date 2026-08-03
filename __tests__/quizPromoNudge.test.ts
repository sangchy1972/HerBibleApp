// The "try the quiz" nudge's cadence.
//
// This app can already show six coordinator-managed prompts plus a stack of
// interruptions that bypass the coordinator entirely, so the bar for adding a
// seventh is that it asks rarely and stops permanently once it has worked. Both
// of those are this file.

import {
  quizPromoShouldShow, quizPromoGapDays, MAX_GAP_DAYS, type QuizPromoPersisted,
} from '../src/state/QuizPromoContext';
import { NUDGE_PRIORITY, pickActiveNudge, MAX_BUDGETED_PER_OPEN } from '../src/state/nudgePriority';

const DAY = 86_400_000;
const T0 = Date.parse('2026-08-03T15:00:00Z');
const st = (o: Partial<QuizPromoPersisted> = {}): QuizPromoPersisted =>
  ({ lastShownAt: 0, promptCount: 0, converted: false, ...o });

describe('quizPromoShouldShow', () => {
  it('shows on the first eligible afternoon, with no extra delay', () => {
    // The host already gates on a rare state — everything else done, before
    // 18:00. Adding a timer on top would skip the first gap for no reason.
    expect(quizPromoShouldShow(st(), T0)).toBe(true);
  });

  it('escalates 2, 3, 4, 5 … and stops widening at 14 days', () => {
    for (let count = 1; count <= 20; count += 1) {
      const gap = quizPromoGapDays(count);
      expect(`${count}:${gap}`).toBe(`${count}:${Math.min(MAX_GAP_DAYS, 1 + count)}`);
      const s = st({ promptCount: count, lastShownAt: T0 });
      // One minute short of the gap: still silent.
      expect(`${count}:early:${quizPromoShouldShow(s, T0 + gap * DAY - 60_000)}`).toBe(`${count}:early:false`);
      expect(`${count}:due:${quizPromoShouldShow(s, T0 + gap * DAY)}`).toBe(`${count}:due:true`);
    }
    expect(quizPromoGapDays(13)).toBe(14);
    expect(quizPromoGapDays(99)).toBe(14);
  });

  it('goes quiet forever once she has played', () => {
    // The prompt introduces a feature. Once she has met it, repeating the
    // introduction is just noise — and this is the only terminal state, so it
    // has to hold against every other input.
    for (const count of [0, 1, 5, 50]) {
      const s = st({ converted: true, promptCount: count, lastShownAt: 0 });
      expect(`${count}:${quizPromoShouldShow(s, T0 + 999 * DAY)}`).toBe(`${count}:false`);
    }
  });

  it('never asks more than 3 times in the first month', () => {
    // The whole point of the escalation. Walk the real schedule from a cold
    // start, granting every showing the instant it becomes due.
    let s = st();
    const days: number[] = [];
    for (let d = 0; d <= 30; d += 1) {
      const now = T0 + d * DAY;
      if (quizPromoShouldShow(s, now)) {
        days.push(d);
        s = { ...s, lastShownAt: now, promptCount: s.promptCount + 1 };
      }
    }
    expect(days).toEqual([0, 2, 5, 9, 14, 20, 27]);
    expect(days.filter(d => d <= 30).length).toBeLessThanOrEqual(7);
    // …and in a year, still a small number.
    expect(quizPromoGapDays(s.promptCount)).toBeGreaterThanOrEqual(8);
  });

  it('survives a corrupt or partial record', () => {
    // The provider spreads the parse over DEFAULT precisely so these cannot
    // become NaN comparisons that silently return false forever.
    const partial = { ...st(), promptCount: NaN as unknown as number };
    expect(() => quizPromoShouldShow(partial, T0)).not.toThrow();
    expect(quizPromoGapDays(NaN)).toBe(0);
    expect(quizPromoGapDays(-4)).toBe(0);
  });
});

describe('where it sits among the other prompts', () => {
  it('is registered, and yields to everything that matters more', () => {
    // 65 is deliberate: below the badge unlock, the reminder ask, the daily
    // mood ritual, the login prompt and the widget ask — all of which are
    // either rewards she earned or asks that unlock real functionality — and
    // above the rate prompt, which can always wait another day.
    expect(NUDGE_PRIORITY.quizPromo).toBe(65);
    expect(NUDGE_PRIORITY.quizPromo).toBeGreaterThan(NUDGE_PRIORITY.widgetInstall);
    expect(NUDGE_PRIORITY.quizPromo).toBeLessThan(NUDGE_PRIORITY.rate);
  });

  it('has no duplicate priority', () => {
    const vals = Object.values(NUDGE_PRIORITY);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it('loses to a badge unlock landing in the same moment', () => {
    const picked = pickActiveNudge(
      [
        { id: 'quizPromo', priority: NUDGE_PRIORITY.quizPromo, eligible: true },
        { id: 'achievementUnlock', priority: NUDGE_PRIORITY.achievementUnlock, eligible: true, ignoresBudget: true },
      ],
      MAX_BUDGETED_PER_OPEN, 2,
    );
    expect(picked).toBe('achievementUnlock');
  });

  it('is BUDGETED, so it cannot be the prompt that uses up her patience', () => {
    // Not `ignoresBudget`. The 2-per-open hard cap is already tight enough that
    // a badge she just earned can be crowded out; a promo that ignored the
    // budget would make that worse, and a promo is the least important thing
    // on the list.
    const reqs = [{ id: 'quizPromo' as const, priority: NUDGE_PRIORITY.quizPromo, eligible: true }];
    expect(pickActiveNudge(reqs, 0, 2)).toBeNull();      // budget spent → silent
    expect(pickActiveNudge(reqs, 1, 2)).toBe('quizPromo');
    expect(pickActiveNudge(reqs, 1, 0)).toBeNull();      // hard cap → silent
  });
});
