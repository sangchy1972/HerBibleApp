// State-machine tests for the first-open loading-ad gate. The two swarm
// reviews (2026-08-22) flagged the module as zero-covered; these pin the
// transitions the owner specified: fill→shown→done, no-fill→3s grace→done,
// network→hold→recover, 15s silent watchdog (12s + the 2.5s day-0 ads-init
// stagger budget, see firstOpenAdGate.ts), purchaser release.
jest.mock('../src/services/ads', () => ({
  areAdsRemoved: jest.fn(() => false),
  maybeShowOnboardingInterstitial: jest.fn(() => false),
}));
jest.mock('../src/services/interstitialVisibility', () => {
  let visible = false;
  const subs: Array<() => void> = [];
  return {
    isInterstitialVisible: () => visible,
    // Real unsubscribe — a no-op off() leaked the gate's callback across
    // tests and finished the NEXT test's gate before it even started.
    onInterstitialVisibility: (f: () => void) => {
      subs.push(f);
      return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); };
    },
    __setVisible: (v: boolean) => { visible = v; subs.slice().forEach(f => f()); },
    __reset: () => { visible = false; subs.length = 0; },
  };
});

import {
  startFirstOpenAdGate, getFirstOpenGateState, gateSignalFill, gateSignalError,
  firstOpenGateActive, __resetFirstOpenGateForTest,
} from '../src/services/firstOpenAdGate';

const ads = jest.requireMock('../src/services/ads');
const vis = jest.requireMock('../src/services/interstitialVisibility');

beforeEach(() => {
  jest.useFakeTimers();
  __resetFirstOpenGateForTest();
  ads.areAdsRemoved.mockReturnValue(false);
  ads.maybeShowOnboardingInterstitial.mockReturnValue(false);
  vis.__reset();
});
afterEach(() => { __resetFirstOpenGateForTest(); jest.useRealTimers(); });

test('idle ignores every signal', () => {
  gateSignalFill();
  gateSignalError('nofill');
  gateSignalError('network');
  expect(getFirstOpenGateState()).toBe('idle');
  expect(firstOpenGateActive()).toBe(false);
});

test('a purchaser known at start never waits', () => {
  ads.areAdsRemoved.mockReturnValue(true);
  startFirstOpenAdGate();
  expect(getFirstOpenGateState()).toBe('done');
});

test('a purchaser hydrating AFTER start releases on the next poll', () => {
  startFirstOpenAdGate();
  expect(getFirstOpenGateState()).toBe('pending');
  ads.areAdsRemoved.mockReturnValue(true);
  jest.advanceTimersByTime(400);
  expect(getFirstOpenGateState()).toBe('done');
});

test('fill → shown, ad close → done', () => {
  startFirstOpenAdGate();
  ads.maybeShowOnboardingInterstitial.mockImplementation(() => { vis.__setVisible(true); return true; });
  gateSignalFill();
  expect(getFirstOpenGateState()).toBe('shown');
  vis.__setVisible(false);
  expect(getFirstOpenGateState()).toBe('done');
});

test('real no-fill → 3s grace → done; the pending watchdog no longer applies', () => {
  startFirstOpenAdGate();
  gateSignalError('nofill');
  expect(getFirstOpenGateState()).toBe('grace');
  jest.advanceTimersByTime(2_999);
  expect(getFirstOpenGateState()).toBe('grace');
  jest.advanceTimersByTime(1);
  expect(getFirstOpenGateState()).toBe('done');
});

test('a late fill inside the grace window still shows', () => {
  startFirstOpenAdGate();
  gateSignalError('nofill');
  jest.advanceTimersByTime(1_000);
  ads.maybeShowOnboardingInterstitial.mockImplementation(() => { vis.__setVisible(true); return true; });
  gateSignalFill();
  expect(getFirstOpenGateState()).toBe('shown');
});

test('network holds past every watchdog and recovers on a later fill', () => {
  startFirstOpenAdGate();
  gateSignalError('network');
  expect(getFirstOpenGateState()).toBe('network');
  jest.advanceTimersByTime(60_000);            // far past the 15s pending watchdog
  expect(getFirstOpenGateState()).toBe('network');
  ads.maybeShowOnboardingInterstitial.mockImplementation(() => { vis.__setVisible(true); return true; });
  gateSignalFill();
  expect(getFirstOpenGateState()).toBe('shown');
});

test('network → later real no-fill falls into the 3s grace', () => {
  startFirstOpenAdGate();
  gateSignalError('network');
  gateSignalError('nofill');
  expect(getFirstOpenGateState()).toBe('grace');
  jest.advanceTimersByTime(3_000);
  expect(getFirstOpenGateState()).toBe('done');
});

test('15 silent seconds in pending give up', () => {
  startFirstOpenAdGate();
  jest.advanceTimersByTime(14_999);
  expect(getFirstOpenGateState()).toBe('pending');
  jest.advanceTimersByTime(1);
  expect(getFirstOpenGateState()).toBe('done');
});

test('start is idempotent and terminal states stay terminal', () => {
  startFirstOpenAdGate();
  gateSignalError('nofill');
  jest.advanceTimersByTime(3_000);
  expect(getFirstOpenGateState()).toBe('done');
  startFirstOpenAdGate();                       // must not restart
  expect(getFirstOpenGateState()).toBe('done');
  gateSignalFill();
  expect(getFirstOpenGateState()).toBe('done');
});
