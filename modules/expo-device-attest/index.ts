// JS-side surface of the expo-device-attest local module.
//
// iOS: thin wrapper over DCAppAttestService (DeviceCheck.framework).
// Android: thin wrapper over Google Play Integrity (classic IntegrityManager).
//
// All byte-array values cross the bridge as base64 / base64url strings — that
// way we never have to deal with platform-specific byte representations on the
// JS side.

import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

interface NativeModule {
  // iOS only
  isSupported?(): boolean;
  generateKey?(): Promise<string>;
  // clientDataHashB64 must be the **base64** of a raw 32-byte SHA256 digest.
  attestKey?(keyId: string, clientDataHashB64: string): Promise<string>;
  generateAssertion?(keyId: string, clientDataHashB64: string): Promise<string>;

  // Android only
  isPlayIntegrityAvailable?(): Promise<boolean>;
  // nonceB64u: base64url string. cloudProjectNumber: GCP project number (long).
  requestPlayIntegrityToken?(nonceB64u: string, cloudProjectNumber: number): Promise<string>;
}

const native: NativeModule | null = (() => {
  try {
    return requireNativeModule('ExpoDeviceAttest') as NativeModule;
  } catch {
    // Module not linked (e.g. running in Expo Go or web). Surface as no-op so
    // higher layers can fall back to dev bypass when DEV_BYPASS_ATTEST=1.
    return null;
  }
})();

export function isModuleAvailable(): boolean {
  return native !== null;
}

// --------------- iOS ---------------

export function iosIsSupported(): boolean {
  if (Platform.OS !== 'ios' || !native?.isSupported) return false;
  try { return native.isSupported(); } catch { return false; }
}

export async function iosGenerateKey(): Promise<string> {
  if (Platform.OS !== 'ios' || !native?.generateKey) {
    throw new Error('App Attest not available on this platform');
  }
  return native.generateKey();
}

export async function iosAttestKey(keyId: string, clientDataHashB64: string): Promise<string> {
  if (Platform.OS !== 'ios' || !native?.attestKey) {
    throw new Error('App Attest not available on this platform');
  }
  return native.attestKey(keyId, clientDataHashB64);
}

export async function iosGenerateAssertion(keyId: string, clientDataHashB64: string): Promise<string> {
  if (Platform.OS !== 'ios' || !native?.generateAssertion) {
    throw new Error('App Attest not available on this platform');
  }
  return native.generateAssertion(keyId, clientDataHashB64);
}

// --------------- Android ---------------

export async function androidIsPlayIntegrityAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android' || !native?.isPlayIntegrityAvailable) return false;
  try { return await native.isPlayIntegrityAvailable(); } catch { return false; }
}

export async function androidRequestPlayIntegrityToken(
  nonceB64u: string,
  cloudProjectNumber: number,
): Promise<string> {
  if (Platform.OS !== 'android' || !native?.requestPlayIntegrityToken) {
    throw new Error('Play Integrity not available on this platform');
  }
  return native.requestPlayIntegrityToken(nonceB64u, cloudProjectNumber);
}
