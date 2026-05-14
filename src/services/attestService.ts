import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { PLANS_API_BASE, PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER, plansTokenKey } from '../constants/plansApi';
import {
  androidRequestPlayIntegrityToken,
  iosAttestKey,
  iosGenerateAssertion,
  iosGenerateKey,
  iosIsSupported,
  isModuleAvailable,
} from '../../modules/expo-device-attest';

// ---------------------------------------------------------------------------
// Device attestation → session JWT.
//
// Phase D flow:
//   1. GET  /v1/attest/challenge  → { challengeId, challenge (base64url), exp }
//   2. iOS: SHA256(challengeBytes) = clientDataHash. If first-launch, call
//      generateKey() + attestKey() and POST with mode="register". Otherwise
//      call generateAssertion() and POST with mode="assert".
//      Android: pass challenge directly as the nonce to Play Integrity.
//   3. POST /v1/attest → JWT (24h TTL).
//
// keyId is persisted in AsyncStorage. If the server rejects an assertion
// (e.g. KV state was wiped), we drop the local keyId and re-register.
// ---------------------------------------------------------------------------

interface TokenRecord {
  token: string;
  expiresAt: number; // epoch seconds
}

const TOKEN_REFRESH_BUFFER_SEC = 300; // refresh 5 min before expiry
const IOS_KEYID_STORAGE = 'plans:appattest:keyId';

let inMemoryToken: TokenRecord | null = null;
let inFlight: Promise<string> | null = null;

// ---- token cache ----

async function readCachedToken(): Promise<TokenRecord | null> {
  if (inMemoryToken) return inMemoryToken;
  const raw = await AsyncStorage.getItem(plansTokenKey());
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as TokenRecord;
    inMemoryToken = rec;
    return rec;
  } catch {
    return null;
  }
}

async function storeToken(rec: TokenRecord) {
  inMemoryToken = rec;
  try { await AsyncStorage.setItem(plansTokenKey(), JSON.stringify(rec)); } catch {}
}

// ---- base64(url) helpers (no Buffer in RN) ----

function base64Chars() {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
}

function b64encode(bytes: Uint8Array): string {
  const chars = base64Chars();
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(v >> 18) & 63] + chars[(v >> 12) & 63] + chars[(v >> 6) & 63] + chars[v & 63];
  }
  if (i < bytes.length) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const v = (a << 16) | (b << 8);
    out += chars[(v >> 18) & 63] + chars[(v >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(v >> 6) & 63] : '=';
    out += '=';
  }
  return out;
}

function b64urlDecode(input: string): Uint8Array {
  const chars = base64Chars();
  const lookup = new Int8Array(128).fill(-1);
  for (let k = 0; k < chars.length; k++) lookup[chars.charCodeAt(k)] = k;
  // accept both standard + url-safe + missing padding
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const out = new Uint8Array(Math.floor((padded.length * 3) / 4) - (padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0));
  let oi = 0;
  for (let i = 0; i < padded.length; i += 4) {
    const v0 = lookup[padded.charCodeAt(i)] ?? -1;
    const v1 = lookup[padded.charCodeAt(i + 1)] ?? -1;
    const v2 = padded[i + 2] === '=' ? 0 : (lookup[padded.charCodeAt(i + 2)] ?? -1);
    const v3 = padded[i + 3] === '=' ? 0 : (lookup[padded.charCodeAt(i + 3)] ?? -1);
    if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) throw new Error('bad base64');
    const merged = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    out[oi++] = (merged >> 16) & 0xff;
    if (padded[i + 2] !== '=') out[oi++] = (merged >> 8) & 0xff;
    if (padded[i + 3] !== '=') out[oi++] = merged & 0xff;
  }
  return out.subarray(0, oi);
}

async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  // Crypto.digest accepts ArrayBuffer; copy the typed-array view into a fresh
  // backing buffer so we don't trip TS's Uint8Array<ArrayBufferLike> variance.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const out = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, ab);
  return new Uint8Array(out);
}

// ---- challenge ----

interface Challenge {
  challengeId: string;
  challenge: string; // base64url
  expiresIn: number;
}

async function fetchChallenge(): Promise<Challenge> {
  const res = await fetch(`${PLANS_API_BASE}/v1/attest/challenge`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`challenge fetch failed: HTTP ${res.status} ${text}`);
  }
  return (await res.json()) as Challenge;
}

// ---- platform attest ----

async function attestIos(challenge: Challenge): Promise<Response> {
  if (!iosIsSupported()) {
    throw new Error('App Attest not supported on this device (need iOS 14+ real device)');
  }

  const challengeBytes = b64urlDecode(challenge.challenge);
  const clientDataHash = b64encode(await sha256Bytes(challengeBytes));

  let keyId = await AsyncStorage.getItem(IOS_KEYID_STORAGE);
  let mode: 'register' | 'assert' = 'assert';

  if (!keyId) {
    keyId = await iosGenerateKey();
    mode = 'register';
  }

  const body: Record<string, unknown> = {
    platform: 'ios',
    mode,
    challengeId: challenge.challengeId,
    keyId,
  };
  if (mode === 'register') {
    body.attestation = await iosAttestKey(keyId, clientDataHash);
  } else {
    body.assertion = await iosGenerateAssertion(keyId, clientDataHash);
  }

  const res = await fetch(`${PLANS_API_BASE}/v1/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // First-time registration succeeded: lock in the keyId locally.
  if (res.ok && mode === 'register') {
    try { await AsyncStorage.setItem(IOS_KEYID_STORAGE, keyId); } catch {}
  }

  // Server lost our keyId (KV wiped, app moved buckets, etc.): forget and let
  // the caller retry — the next requestToken() call will re-register.
  if (!res.ok && mode === 'assert') {
    const errBody = await res.clone().json().catch(() => null);
    if (errBody?.error?.message?.includes('unknown keyId')) {
      try { await AsyncStorage.removeItem(IOS_KEYID_STORAGE); } catch {}
    }
  }

  return res;
}

async function attestAndroid(challenge: Challenge): Promise<Response> {
  if (!PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER) {
    throw new Error('PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER not configured');
  }
  // Play Integrity wants a string nonce. We pass the base64url challenge
  // verbatim, and the Worker compares it byte-for-byte.
  const integrityToken = await androidRequestPlayIntegrityToken(
    challenge.challenge,
    PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER,
  );
  return fetch(`${PLANS_API_BASE}/v1/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: 'android',
      challengeId: challenge.challengeId,
      integrityToken,
    }),
  });
}

async function attestDevFallback(challenge: Challenge): Promise<Response> {
  // Used in Expo Go / web preview where the native module isn't linked. The
  // Worker only accepts this when DEV_BYPASS_ATTEST=1.
  return fetch(`${PLANS_API_BASE}/v1/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      challengeId: challenge.challengeId,
      attestation: `dev-${Platform.OS}-${Date.now().toString(36)}`,
    }),
  });
}

// ---- main entry ----

async function requestToken(): Promise<string> {
  const challenge = await fetchChallenge();

  let res: Response;
  if (!isModuleAvailable()) {
    res = await attestDevFallback(challenge);
  } else if (Platform.OS === 'ios') {
    res = await attestIos(challenge);
  } else if (Platform.OS === 'android') {
    res = await attestAndroid(challenge);
  } else {
    res = await attestDevFallback(challenge);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`attest failed: HTTP ${res.status} ${text}`);
  }
  const data = (await res.json()) as { token: string; expires_in: number };
  const rec: TokenRecord = {
    token: data.token,
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  };
  await storeToken(rec);
  return rec.token;
}

export async function getSessionToken(): Promise<string> {
  const cached = await readCachedToken();
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - TOKEN_REFRESH_BUFFER_SEC > now) return cached.token;
  if (inFlight) return inFlight;
  inFlight = requestToken().finally(() => { inFlight = null; });
  return inFlight;
}

export async function invalidateSessionToken() {
  inMemoryToken = null;
  try { await AsyncStorage.removeItem(plansTokenKey()); } catch {}
}

// Wipe both the session token AND the iOS attestation key (useful for E2E
// debugging when the server has lost KV state).
export async function resetAttestation() {
  await invalidateSessionToken();
  try { await AsyncStorage.removeItem(IOS_KEYID_STORAGE); } catch {}
}
