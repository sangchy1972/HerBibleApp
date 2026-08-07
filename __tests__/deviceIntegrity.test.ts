// The emulator classifier that gates the whole ad stack — a false POSITIVE
// here silently zeroes a real user's ad revenue, so the real-device cases
// matter more than the emulator ones.

import { looksLikeEmulator } from '../src/services/deviceIntegrity';

describe('looksLikeEmulator', () => {
  it('flags the classic emulators', () => {
    expect(looksLikeEmulator({
      brand: 'google', manufacturer: 'Google', model: 'sdk_gphone64_x86_64',
      fingerprint: 'google/sdk_gphone64_x86_64/emu64x:14/UE1A.230829.036/11228894:userdebug/dev-keys',
    })).toBe(true);
    expect(looksLikeEmulator({
      brand: 'generic', manufacturer: 'unknown', model: 'Android SDK built for x86',
      fingerprint: 'generic/sdk/generic:9/PSR1.180720.075/5124027:userdebug/test-keys',
    })).toBe(true);
    expect(looksLikeEmulator({
      brand: 'Android', manufacturer: 'Genymotion', model: 'Samsung Galaxy S10',
      fingerprint: 'samsung/beyond1qlteue/beyond1q:9/PPR1/G973U1UES2ASJ1:user/release-keys',
    })).toBe(true);
    expect(looksLikeEmulator({
      brand: 'Android', manufacturer: 'unknown', model: 'vbox86p',
      fingerprint: 'Android/vbox86p/vbox86p:7.1.1/NMF26Q/gen:userdebug/test-keys',
    })).toBe(true);
  });

  it('passes real devices — including the ones our users actually carry', () => {
    expect(looksLikeEmulator({
      brand: 'samsung', manufacturer: 'samsung', model: 'SM-G991B',
      fingerprint: 'samsung/o1sxxx/o1s:14/UP1A.231005.007/G991BXXSGGXL1:user/release-keys',
    })).toBe(false);
    expect(looksLikeEmulator({
      brand: 'OnePlus', manufacturer: 'OnePlus', model: 'OnePlus8Pro',
      fingerprint: 'OnePlus/OnePlus8Pro/OnePlus8Pro:11/RP1A.201005.001/2110082153:user/release-keys',
    })).toBe(false);
    expect(looksLikeEmulator({
      brand: 'google', manufacturer: 'Google', model: 'Pixel 8',
      fingerprint: 'google/shiba/shiba:15/AP4A.250105.002/12701944:user/release-keys',
    })).toBe(false);
    expect(looksLikeEmulator({
      brand: 'Xiaomi', manufacturer: 'Xiaomi', model: '23021RAA2Y',
      fingerprint: 'Xiaomi/ruby_global/ruby:13/TP1A.220624.014/V14.0.4.0:user/release-keys',
    })).toBe(false);
  });

  it('missing fields never flag', () => {
    expect(looksLikeEmulator({})).toBe(false);
  });
});
