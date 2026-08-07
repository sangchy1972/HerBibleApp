// Emulator detection for the ad stack — zero dependencies, reads the Build
// fields React Native already exposes through Platform.constants.
//
// WHY: a Crashlytics SIGSEGV (2026-08-05, "OnePlus8Pro") died inside
// libGLESv2_swiftshader.so while a Vungle creative was on screen — SwiftShader
// is the software GL rasterizer that only exists where there is no usable GPU,
// i.e. emulators and cloud-phone farms; a real OnePlus renders on Adreno.
// Serving LIVE ads to such machines is all downside: their clicks are invalid
// traffic (an AdMob account risk), and their software-GL stacks segfault under
// ad creatives in ways we cannot fix from JS.
//
// HONEST LIMIT: this catches genuine emulators (AVD, Genymotion, VirtualBox
// farms). A cloud phone that carefully spoofs real Build props — like the one
// that crashed — will pass. That residue is vendor-native and unfixable
// client-side; this gate removes the detectable slice and the account risk.

import { Platform } from 'react-native';

export interface BuildProps {
  brand?: string;
  manufacturer?: string;
  model?: string;
  fingerprint?: string;
}

const NEEDLES = [
  'generic', 'emulator', 'goldfish', 'ranchu', 'cutf', 'vbox', 'virtualbox',
  'genymotion', 'sdk_gphone', 'google_sdk', 'android sdk built for', 'sdk_google',
];

/** Pure classifier — unit-tested against real and emulator fingerprints. */
export function looksLikeEmulator(p: BuildProps): boolean {
  const hay = `${p.brand ?? ''} ${p.manufacturer ?? ''} ${p.model ?? ''} ${p.fingerprint ?? ''}`.toLowerCase();
  return NEEDLES.some(n => hay.includes(n));
}

/** Android only — iOS simulators never reach the ad stack (no fill by design). */
export function isEmulatorDevice(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    const c = (Platform as { constants?: Record<string, unknown> }).constants ?? {};
    return looksLikeEmulator({
      brand: typeof c.Brand === 'string' ? c.Brand : undefined,
      manufacturer: typeof c.Manufacturer === 'string' ? c.Manufacturer : undefined,
      model: typeof c.Model === 'string' ? c.Model : undefined,
      fingerprint: typeof c.Fingerprint === 'string' ? c.Fingerprint : undefined,
    });
  } catch {
    return false;   // never let detection failure block ads on a real device
  }
}
