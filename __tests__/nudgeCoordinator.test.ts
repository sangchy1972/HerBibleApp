import { pickActiveNudge, NUDGE_PRIORITY, MAX_BUDGETED_PER_OPEN, type ArbiterReq } from '../src/state/nudgePriority';

const req = (id: any, priority: number, eligible: boolean, ignoresBudget = false): ArbiterReq =>
  ({ id, priority, eligible, ignoresBudget });

describe('pickActiveNudge — arbitration', () => {
  it('returns null when nothing is eligible', () => {
    expect(pickActiveNudge([req('login', 50, false)], 1)).toBeNull();
    expect(pickActiveNudge([], 1)).toBeNull();
  });

  it('picks the highest priority (lowest number) eligible request', () => {
    const reqs = [req('login', 50, true), req('achievementUnlock', 10, true, true), req('setReminderTime', 30, true)];
    expect(pickActiveNudge(reqs, 1)).toBe('achievementUnlock');
  });

  it('skips ineligible higher-priority requests', () => {
    const reqs = [req('achievementUnlock', 10, false, true), req('setReminderTime', 30, true)];
    expect(pickActiveNudge(reqs, 1)).toBe('setReminderTime');
  });

  it('a budgeted request is blocked when the budget is exhausted', () => {
    const reqs = [req('login', 50, true)];
    expect(pickActiveNudge(reqs, 0)).toBeNull();          // budget 0 → login can't show
    expect(pickActiveNudge(reqs, 1)).toBe('login');       // budget 1 → shows
  });

  it('an ignoresBudget request still shows when the budget is exhausted', () => {
    const reqs = [req('login', 50, true), req('moodCheckIn', 40, true, true)];
    // budget 0: login (budgeted) is skipped, mood (ignoresBudget) shows
    expect(pickActiveNudge(reqs, 0)).toBe('moodCheckIn');
  });

  it('reward + ritual win over a budgeted nudge on a full open', () => {
    // achievement(10, ignore) < mood(40, ignore) < login(50, budgeted)
    const reqs = [req('login', 50, true), req('moodCheckIn', 40, true, true), req('achievementUnlock', 10, true, true)];
    expect(pickActiveNudge(reqs, 1)).toBe('achievementUnlock');   // top priority first
    // after achievement (ignore, no budget spent) dismisses → mood next
    expect(pickActiveNudge([req('login', 50, true), req('moodCheckIn', 40, true, true)], 1)).toBe('moodCheckIn');
  });

  it('the priority table is a strict total order (no ties)', () => {
    const vals = Object.values(NUDGE_PRIORITY);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it('MAX_BUDGETED_PER_OPEN is 1', () => {
    expect(MAX_BUDGETED_PER_OPEN).toBe(1);
  });
});
