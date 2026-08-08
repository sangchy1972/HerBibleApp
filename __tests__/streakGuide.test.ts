// The rookie streak guide's decision rules — the scenario table drives which
// copy and which final CTA the user gets, so every branch is pinned.

import { streakScenario, streakGuideEligible } from '../src/state/streakGuide';

describe('streakScenario', () => {
  it('morning done before 18:00 → night prayer is not open yet: come back tonight', () => {
    expect(streakScenario(true, false, 8)).toBe('nightLater');
    expect(streakScenario(true, false, 17)).toBe('nightLater');
  });

  it('morning done at/after 18:00 → night prayer is open: start it', () => {
    expect(streakScenario(true, false, 18)).toBe('startNight');
    expect(streakScenario(true, false, 23)).toBe('startNight');
  });

  it('evening done first (night-time installer) → morning remains, any hour', () => {
    expect(streakScenario(false, true, 22)).toBe('startMorning');
    expect(streakScenario(false, true, 9)).toBe('startMorning');
  });

  it('safety rails: both done or neither done → nothing to sell', () => {
    expect(streakScenario(true, true, 12)).toBe('done');
    expect(streakScenario(false, false, 12)).toBe('done');
  });
});

describe('streakGuideEligible', () => {
  const TODAY = '2026-08-08';

  it('fires at the half-lit moment for a rookie', () => {
    expect(streakGuideEligible(0, true, false, null, TODAY)).toBe(true);
    expect(streakGuideEligible(0, false, true, null, TODAY)).toBe(true);
  });

  it('never fires for anyone who has ever lit a full day', () => {
    expect(streakGuideEligible(1, true, false, null, TODAY)).toBe(false);
    expect(streakGuideEligible(40, false, true, null, TODAY)).toBe(false);
  });

  it('not before the first prayer, not after both', () => {
    expect(streakGuideEligible(0, false, false, null, TODAY)).toBe(false);
    expect(streakGuideEligible(0, true, true, null, TODAY)).toBe(false);
  });

  it('at most once per calendar day, re-arms the next day', () => {
    expect(streakGuideEligible(0, true, false, TODAY, TODAY)).toBe(false);
    expect(streakGuideEligible(0, true, false, '2026-08-07', TODAY)).toBe(true);
  });
});
