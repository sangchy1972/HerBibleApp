// The ad-init path must be UNKILLABLE. A mediation adapter that's compiled into
// the binary but not yet configured in the AdMob console (or one that's just
// slow) must not be able to strand the app or the ad pipeline.
//
// Two properties are tested here:
//   1. summarizeAdapterStatuses() never throws, whatever the native side hands
//      it — this is the value we log to Firebase to VERIFY a mediation config
//      remotely, so it has to survive nulls, junk and future shape changes.
//   2. The bounded() pattern the init path relies on: it always settles.
//
// react-native-google-mobile-ads is required defensively inside ads.ts (guarded
// require), so importing the module in a test env without the native module is
// exactly the "module missing" path — every export must still be callable.
import { summarizeAdapterStatuses } from '../src/services/ads';

describe('summarizeAdapterStatuses', () => {
  it('reports ready vs not-ready per adapter', () => {
    const out = summarizeAdapterStatuses([
      { name: 'com.google.ads.mediation.vungle.VungleMediationAdapter', description: '', state: 1 },
      { name: 'com.google.ads.mediation.pangle.PangleMediationAdapter', description: '', state: 0 },
    ]);
    expect(out.ready).toBe(1);
    expect(out.total).toBe(2);
    // The com.google.ads.mediation prefix is stripped so the whole thing fits in
    // a Firebase param.
    expect(out.detail).toContain('vungle.VungleMediation:ok');
    expect(out.detail).toContain('pangle.PangleMediation:no');
  });

  // An adapter that is in the binary with NO AdMob mediation group configured is
  // exactly this: present, initialized, NOT_READY. It must be reported, not
  // treated as an error.
  it('treats an unconfigured adapter as not-ready, not as a failure', () => {
    const out = summarizeAdapterStatuses([
      { name: 'com.google.android.gms.ads.MobileAds', description: '', state: 1 },
      { name: 'com.google.ads.mediation.vungle.VungleMediationAdapter', description: 'not configured', state: 0 },
    ]);
    expect(out).toEqual(expect.objectContaining({ ready: 1, total: 2 }));
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'boom'],
    ['an object', { nope: true }],
    ['a number', 42],
  ])('never throws on %s from the native side', (_label, input) => {
    expect(() => summarizeAdapterStatuses(input)).not.toThrow();
    expect(summarizeAdapterStatuses(input)).toEqual({ ready: 0, total: 0, detail: '' });
  });

  it('survives malformed entries', () => {
    const out = summarizeAdapterStatuses([null, {}, { name: 123 }, { state: 1 }]);
    expect(out.total).toBe(4);
    expect(out.ready).toBe(1);            // only the {state: 1} counts
    expect(typeof out.detail).toBe('string');
  });

  it('keeps the detail inside a Firebase param length limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `com.google.ads.mediation.network${i}.SomeVeryLongMediationAdapterName`,
      description: '',
      state: i % 2,
    }));
    expect(summarizeAdapterStatuses(many).detail.length).toBeLessThanOrEqual(90);
  });
});
