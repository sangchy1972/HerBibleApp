// The plan-discovery guide's decision rules — entry paths, step order, and the
// counters the bubble shows.

import {
  planGuideSteps, planGuideCounter, planGuideEligibleFromHome, planGuideEligibleSelf,
} from '../src/state/planGuide';

describe('step sequences', () => {
  it('home entry walks tab → explore → mood', () => {
    expect(planGuideSteps('home')).toEqual(['tab', 'explore', 'mood']);
  });
  it('self entry skips the tab step — she already found it', () => {
    expect(planGuideSteps('self')).toEqual(['explore', 'mood']);
  });
  it('counters match each entry: 3-step from home, 2-step self', () => {
    expect(planGuideCounter('home', 'tab')).toEqual({ n: 1, total: 3 });
    expect(planGuideCounter('home', 'explore')).toEqual({ n: 2, total: 3 });
    expect(planGuideCounter('home', 'mood')).toEqual({ n: 3, total: 3 });
    expect(planGuideCounter('self', 'explore')).toEqual({ n: 1, total: 2 });
    expect(planGuideCounter('self', 'mood')).toEqual({ n: 2, total: 2 });
  });
  it('a step outside the entry\'s sequence clamps to 1, never 0', () => {
    expect(planGuideCounter('self', 'tab').n).toBe(1);
  });
});

describe('eligibility', () => {
  it('home nudge: never-visited users only, and only while the CTA is quiet', () => {
    expect(planGuideEligibleFromHome(false, false, true)).toBe(true);
    expect(planGuideEligibleFromHome(false, false, false)).toBe(false);  // prayer CTA is the target
    expect(planGuideEligibleFromHome(false, true, true)).toBe(false);    // she's been to the tab
    expect(planGuideEligibleFromHome(true, false, true)).toBe(false);    // once ever
  });
  it('self path: once ever, nothing else', () => {
    expect(planGuideEligibleSelf(false)).toBe(true);
    expect(planGuideEligibleSelf(true)).toBe(false);
  });
});
