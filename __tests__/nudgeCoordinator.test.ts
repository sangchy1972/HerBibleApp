import { pickActiveNudge, NUDGE_PRIORITY, MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN, type ArbiterReq } from '../src/state/nudgePriority';

const req = (id: any, priority: number, eligible: boolean, ignoresBudget = false): ArbiterReq =>
  ({ id, priority, eligible, ignoresBudget });

describe('pickActiveNudge — arbitration', () => {
  it('returns null when nothing is eligible', () => {
    expect(pickActiveNudge([req('login', 50, false)], 1, 2)).toBeNull();
    expect(pickActiveNudge([], 1, 2)).toBeNull();
  });

  it('picks the highest priority (lowest number) eligible request', () => {
    const reqs = [req('login', 50, true), req('achievementUnlock', 10, true, true), req('setReminderTime', 30, true)];
    expect(pickActiveNudge(reqs, 1, 2)).toBe('achievementUnlock');
  });

  it('skips ineligible higher-priority requests', () => {
    const reqs = [req('achievementUnlock', 10, false, true), req('setReminderTime', 30, true)];
    expect(pickActiveNudge(reqs, 1, 2)).toBe('setReminderTime');
  });

  it('a budgeted request is blocked when the budget is exhausted', () => {
    const reqs = [req('login', 50, true)];
    expect(pickActiveNudge(reqs, 0, 2)).toBeNull();          // budget 0 → login can't show
    expect(pickActiveNudge(reqs, 1, 2)).toBe('login');       // budget 1 → shows
  });

  it('an ignoresBudget request still shows when the budget is exhausted', () => {
    const reqs = [req('login', 50, true), req('moodCheckIn', 40, true, true)];
    expect(pickActiveNudge(reqs, 0, 2)).toBe('moodCheckIn');
  });

  it('HARD 2-cap: nothing shows once two blocking prompts already appeared this open', () => {
    // Even a reward/ritual (ignoresBudget) is refused once blockingRemaining hits 0.
    const reqs = [req('achievementUnlock', 10, true, true), req('moodCheckIn', 40, true, true)];
    expect(pickActiveNudge(reqs, 1, 0)).toBeNull();
    expect(pickActiveNudge(reqs, 1, 1)).toBe('achievementUnlock');
  });

  it('reward + ritual win over a budgeted nudge on a full open', () => {
    const reqs = [req('login', 50, true), req('moodCheckIn', 40, true, true), req('achievementUnlock', 10, true, true)];
    expect(pickActiveNudge(reqs, 1, 2)).toBe('achievementUnlock');
    expect(pickActiveNudge([req('login', 50, true), req('moodCheckIn', 40, true, true)], 1, 1)).toBe('moodCheckIn');
  });

  it('the priority table is a strict total order (no ties)', () => {
    const vals = Object.values(NUDGE_PRIORITY);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it('caps: 1 budgeted, 2 total blocking per open', () => {
    expect(MAX_BUDGETED_PER_OPEN).toBe(1);
    expect(MAX_BLOCKING_PER_OPEN).toBe(2);
  });
});
