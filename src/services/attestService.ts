// Talks to the Cloudflare Worker at PLANS_API_BASE to obtain a short-lived
// JWT session token. The Worker (herbible-plans-7languages v2.1) signs
// tokens with HS256 in dev-bypass mode and exposes its discovery doc at
// `/.well-known/openid-configuration` for the eventual switch to RS256.
//
// Endpoint contract (probed against the live Worker):
//   POST /v1/attest
//   Body: { platform: 'ios' | 'android' }     // dev-bypass ignores `attest`
//   Response: { token: <JWT>, expires_in: 86400 }   // seconds
//
// Token caching: stored in AsyncStorage under `plansTokenKey()` (key from
// constants/plansApi.ts so it bumps cleanly with summary-schema versions).
// On 401 from the API, plansService calls `invalidateSessionToken()` and
// then re-requests via `getSessionToken()`.
//
// TODO(android+prod): when bypass-attest is turned OFF Worker-side, wire
// `expo-play-integrity` (Android) / `react-native-device-check` (iOS) to
// solve `/v1/attest/challenge` and pass the verdict here as `attest`.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { PLANS_API_BASE, plansTokenKey } from '../constants/plansApi';

// In-storage envelope. We materialise `expiresAt` (absolute ms) from the
// Worker's `expires_in` (relative seconds) at mint time so the freshness
// check stays a plain numeric compare with no clock-skew arithmetic.
interface TokenEnvelope {
  token: string;
  expiresAt: number;
}

// In-memory mirror of the AsyncStorage record so back-to-back fetches in
// the same JS tick don't hammer storage. Cleared on invalidation.
let memo: TokenEnvelope | null = null;

function isFresh(env: TokenEnvelope | null): env is TokenEnvelope {
  if (!env?.token) return false;
  return env.expiresAt > Date.now() + 30_000;  // 30 s safety margin
}

async function readCached(): Promise<TokenEnvelope | null> {
  if (memo) return memo;
  try {
    const raw = await AsyncStorage.getItem(plansTokenKey());
    if (!raw) return null;
    const env = JSON.parse(raw) as TokenEnvelope;
    memo = env;
    return env;
  } catch {
    return null;
  }
}

async function writeCached(env: TokenEnvelope): Promise<void> {
  memo = env;
  try { await AsyncStorage.setItem(plansTokenKey(), JSON.stringify(env)); } catch {}
}

async function mintToken(): Promise<TokenEnvelope> {
  const res = await fetch(`${PLANS_API_BASE}/v1/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: Platform.OS }),
  });
  if (!res.ok) {
    throw new Error(`attest /v1/attest: HTTP ${res.status}`);
  }
  const parsed = (await res.json()) as { token?: string; expires_in?: number };
  if (!parsed?.token) throw new Error('attest /v1/attest: missing token in response');
  const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600;
  const env: TokenEnvelope = {
    token: parsed.token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  await writeCached(env);
  return env;
}

export async function getSessionToken(): Promise<string> {
  const cached = await readCached();
  if (isFresh(cached)) return cached.token;
  const fresh = await mintToken();
  return fresh.token;
}

export async function invalidateSessionToken(): Promise<void> {
  memo = null;
  try { await AsyncStorage.removeItem(plansTokenKey()); } catch {}
}
