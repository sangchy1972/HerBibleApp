import { pickHomeBanner, type HomeBannerInput } from '../src/state/homeNudges';

const base: HomeBannerInput = {
  daysSinceFirstLaunch: 5,
  everPrayed: true,
  mDone: false,
  eDone: false,
  hour: 10,
  gospelReady: true,
  gospelSlotDone: true,
  hasAnyPlan: true,
  hasSuggestablePlan: true,
  dismissed: [],
};

describe('pickHomeBanner — single priority-ordered slot', () => {
  it('coaches a brand-new user who has not prayed', () => {
    expect(pickHomeBanner({ ...base, daysSinceFirstLaunch: 0, everPrayed: false })).toBe('coachPray');
  });
  it('evening + morning done + evening pending → completeStreak', () => {
    expect(pickHomeBanner({ ...base, hour: 20, mDone: true, eDone: false })).toBe('completeStreak');
  });
  it('evening + nothing done → notPrayed', () => {
    expect(pickHomeBanner({ ...base, hour: 20, mDone: false, eDone: false, gospelSlotDone: true })).toBe('notPrayed');
  });
  it('gospel unread wins over plan recommendation', () => {
    expect(pickHomeBanner({ ...base, gospelSlotDone: false, hasAnyPlan: false })).toBe('gospel');
  });
  it('no plan started (day>=2) → planRec', () => {
    expect(pickHomeBanner({ ...base, hasAnyPlan: false })).toBe('planRec');
  });
  it('returns null when nothing applies', () => {
    expect(pickHomeBanner(base)).toBeNull();
  });
  it('respects dismissals (falls through to the next eligible)', () => {
    const i = { ...base, hour: 20, mDone: false, eDone: false, gospelSlotDone: false };
    expect(pickHomeBanner(i)).toBe('notPrayed');
    expect(pickHomeBanner({ ...i, dismissed: ['notPrayed'] })).toBe('gospel');
    expect(pickHomeBanner({ ...i, dismissed: ['notPrayed', 'gospel'] })).toBeNull();
  });
  it('completeStreak and notPrayed are mutually exclusive', () => {
    // morning done → not "notPrayed"; morning not done → not "completeStreak"
    expect(pickHomeBanner({ ...base, hour: 20, mDone: true, eDone: false, gospelSlotDone: true })).toBe('completeStreak');
    expect(pickHomeBanner({ ...base, hour: 20, mDone: false, eDone: false, gospelSlotDone: true })).toBe('notPrayed');
  });
});
