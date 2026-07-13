// Guards the invariants in plugins/withAdMobMediation.js that actually cause
// production incidents. None of this is style — every rule here maps to a real
// failure mode we've either hit or verified in the vendor docs.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADAPTERS } = require('../plugins/withAdMobMediation.js');

type Adapter = {
  key: string; label: string; enabled: boolean;
  androidDep: string; androidMavenRepos?: string[];
  iosPod: string; iosPodVersion: string; iosNeedsObjCLinkerFlag?: boolean;
  skAdNetworkIds?: string[];
};
const adapters: Adapter[] = ADAPTERS;

describe('AdMob mediation adapter table', () => {
  it('has no duplicate keys', () => {
    const keys = adapters.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(adapters.map(a => [a.key, a] as const))('%s: both platforms are filled in', (_k, a) => {
    expect(a.androidDep).toMatch(/^com\.google\.ads\.mediation:[a-z]+:[\d.]+$/);
    expect(a.iosPod).toMatch(/^GoogleMobileAdsMediation[A-Za-z]+$/);
    expect(a.iosPodVersion).toBeTruthy();
  });

  // A floating version (7.7.+ / ~> 7.7) is how you end up with a build that
  // works today and NoClassDefFoundErrors next month when the vendor ships an
  // adapter built against a newer GMA than the one react-native-google-mobile-ads
  // pins. Everything must be an exact pin.
  it.each(adapters.map(a => [a.key, a] as const))('%s: versions are exactly pinned', (_k, a) => {
    const androidVersion = a.androidDep.split(':')[2];
    expect(androidVersion).toMatch(/^\d+(\.\d+)*$/);
    expect(a.iosPodVersion).toMatch(/^\d+(\.\d+)*$/);
  });

  // Pangle's SDK is not on Maven Central. Enabling it without ByteDance's repo
  // is an unresolvable Gradle dependency.
  it('pangle carries its ByteDance maven repo', () => {
    const pangle = adapters.find(a => a.key === 'pangle')!;
    expect(pangle.androidMavenRepos).toEqual(
      expect.arrayContaining([expect.stringContaining('artifact.bytedance.com')]),
    );
  });

  // Only InMobi needs -ObjC; if that ever changes, the Podfile post_install hook
  // in the plugin has to be revisited.
  it('only InMobi asks for the -ObjC linker flag', () => {
    const objc = adapters.filter(a => a.iosNeedsObjCLinkerFlag).map(a => a.key);
    expect(objc).toEqual(['inmobi']);
  });

  it('every adapter declares its SKAdNetwork ids', () => {
    for (const a of adapters) {
      expect(Array.isArray(a.skAdNetworkIds)).toBe(true);
      for (const id of a.skAdNetworkIds!) expect(id).toMatch(/^[a-z0-9]+\.skadnetwork$/);
    }
  });

  // Liftoff is the only one live right now. This is a tripwire: turning another
  // network on ships a new ad SDK into the binary, so it should be a deliberate,
  // reviewed change — not something that slips in.
  it('liftoff is the only enabled adapter', () => {
    expect(adapters.filter(a => a.enabled).map(a => a.key)).toEqual(['liftoff']);
  });
});
