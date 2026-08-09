import {
  pickActiveNudge, NUDGE_PRIORITY, MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN, type ArbiterReq, startsNewWave, NUDGE_WAVE_QUIET_MS,
} from '../src/state/nudgePriority';

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

  it('caps per WAVE: 2 budgeted, 3 total blocking (owner 2026-08-08)', () => {
    expect(MAX_BUDGETED_PER_OPEN).toBe(2);
    expect(MAX_BLOCKING_PER_OPEN).toBe(3);
    // The total cap is enforced ABOVE ignoresBudget, so it really is the ceiling
    // on how many surfaces she can meet in one wave.
    expect(MAX_BLOCKING_PER_OPEN).toBeGreaterThanOrEqual(MAX_BUDGETED_PER_OPEN);
  });
});

// ── Wave reset: the 2-per-open cap must not starve the queue ────────────────
// Day one queues seven blocking prompts (badge, streak guide, mood, login,
// widget, plan guide, rate). The cap's job is to stop them STACKING; it must
// not mean "the other five are unreachable unless she backgrounds the app".
describe('startsNewWave', () => {
  const NOW = 1_800_000_000_000;

  it('no prompt shown yet → nothing to reset', () => {
    expect(startsNewWave(0, NOW)).toBe(false);
  });

  it('holds the cap while prompts are still recent', () => {
    expect(startsNewWave(NOW - 1000, NOW)).toBe(false);
    expect(startsNewWave(NOW - (NUDGE_WAVE_QUIET_MS - 1), NOW)).toBe(false);
  });

  it('releases it after the quiet window, no foregrounding needed', () => {
    expect(startsNewWave(NOW - NUDGE_WAVE_QUIET_MS, NOW)).toBe(true);
    expect(startsNewWave(NOW - 60 * 60 * 1000, NOW)).toBe(true);
  });

  it('a fresh wave lets the NEXT-highest queued prompt through', () => {
    // Two already shown this open → capped.
    const queue = [
      { id: 'widgetInstall' as const, priority: NUDGE_PRIORITY.widgetInstall, eligible: true },
      { id: 'rate' as const, priority: NUDGE_PRIORITY.rate, eligible: true },
    ];
    expect(pickActiveNudge(queue, 1, 0)).toBeNull();
    // After the wave reset the caps are restored → highest priority wins.
    expect(pickActiveNudge(queue, MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN)).toBe('widgetInstall');
  });
});

// ── Re-grant hazard behind notifyDismissed ─────────────────────────────────
// notifyDismissed now DELETES the request as well as clearing activeId. That
// removed a race (the next arbitration re-granting the prompt she just closed,
// which nothing stopped for `canShow: () => true` hosts) but it puts a duty on
// every host: a prompt that is still WANTED after a dismissal has to
// re-register. Pinning the two shapes here so the next host copies a correct one.
describe('dismiss → re-grant contract', () => {
  it('a queue-style host must re-request: same visible flag, grant lost', () => {
    // The badge sheet's shape. After close() the request is gone and `visible`
    // is unchanged (another badge is queued), so only an `active`-keyed effect
    // re-registers it — otherwise badge #2 never appears.
    const reqs = [{ id: 'achievementUnlock' as const, priority: NUDGE_PRIORITY.achievementUnlock, eligible: true, ignoresBudget: true }];
    expect(pickActiveNudge(reqs, 0, MAX_BLOCKING_PER_OPEN)).toBe('achievementUnlock');
    // …and with nothing registered (the state right after notifyDismissed):
    expect(pickActiveNudge([], MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN)).toBeNull();
  });

  it('a flag-style host needs nothing: its canShow goes false the same tick', () => {
    const reqs = [{ id: 'moodCheckIn' as const, priority: NUDGE_PRIORITY.moodCheckIn, eligible: false, ignoresBudget: true }];
    expect(pickActiveNudge(reqs, MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN)).toBeNull();
  });

  it('an ineligible request never blocks a lower-priority eligible one', () => {
    const reqs = [
      { id: 'setReminderTime' as const, priority: NUDGE_PRIORITY.setReminderTime, eligible: false },
      { id: 'rate' as const, priority: NUDGE_PRIORITY.rate, eligible: true },
    ];
    expect(pickActiveNudge(reqs, MAX_BUDGETED_PER_OPEN, MAX_BLOCKING_PER_OPEN)).toBe('rate');
  });
});
