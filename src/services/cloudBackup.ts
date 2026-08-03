// Cloud backup & restore of user progress, keyed by Firebase uid.
//
// Storage model: ONE Firestore doc per user — users/{uid} = { schema, updatedAt,
// payload } where payload is the JSON-stringified snapshot of the whitelisted
// AsyncStorage keys (see progressMerge.BACKUP_KEYS). A single string field keeps
// us clear of Firestore's per-field index machinery and keeps ALL merge logic
// client-side in the pure, unit-tested progressMerge module.
//
// Flow:
//   • sign-in with a uid we haven't restored on this install → download doc,
//     merge with local (union/max — never lossy), write changed keys back to
//     AsyncStorage, upload the merged snapshot, then remount the provider tree
//     so every context re-hydrates (deferred to onboarding-finish when the
//     sign-in happened inside onboarding).
//   • app goes to background (and other significant moments) → throttled upload.
//
// The Firestore native module is require-guarded like every other native dep —
// a build without it degrades to a silent no-op.

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthChanged } from './firebaseAuth';
import { BACKUP_KEYS, mergeSnapshots, type Snapshot } from './progressMerge';

let fsMod: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  fsMod = require('@react-native-firebase/firestore');
} catch { /* native module not in this build */ }

const SCHEMA = 1;
// Which uid this install has already restored — restore runs once per (install, uid).
const RESTORED_UID_KEY = 'cloudBackup:restoredUid:v1';
const MIN_BACKUP_INTERVAL_MS = 60_000;

let initialized = false;
let currentUid: string | null = null;
let lastBackupAt = 0;
let backupInFlight = false;
let pendingRemount = false;
let remountHandler: (() => void) | null = null;

export function cloudBackupAvailable(): boolean {
  return !!fsMod;
}

// App.tsx registers the provider-tree remount here (bumps the tree's key).
export function setAppRemountHandler(fn: () => void): void {
  remountHandler = fn;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('CLOUD_BACKUP_TIMEOUT')), ms)),
  ]);
}

function userDoc(uid: string) {
  return fsMod.doc(fsMod.getFirestore(), 'users', uid);
}

async function collectLocal(): Promise<Snapshot> {
  const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
  const snap: Snapshot = {};
  for (const [k, v] of pairs) if (v != null) snap[k] = v;
  return snap;
}

// Upload the current local snapshot. Throttled unless `force`. Fire-and-forget
// safe — never throws.
export async function backupNow(force = false): Promise<void> {
  if (!fsMod || !currentUid) return;
  const now = Date.now();
  if (backupInFlight || (!force && now - lastBackupAt < MIN_BACKUP_INTERVAL_MS)) return;
  backupInFlight = true;
  try {
    const snap = await collectLocal();
    await withTimeout(
      fsMod.setDoc(userDoc(currentUid), {
        schema: SCHEMA,
        updatedAt: fsMod.serverTimestamp(),
        payload: JSON.stringify(snap),
      }),
      20000,
    );
    lastBackupAt = Date.now();
  } catch { /* offline / rules not set yet — next trigger retries */ }
  finally { backupInFlight = false; }
}

// Download + merge + apply. Returns true when anything on-device changed
// (i.e. the UI needs a re-hydration). Only marks the uid restored on success,
// so an offline failure retries on the next launch/sign-in.
async function restoreAndMerge(uid: string, wasOnboardingDone: boolean): Promise<void> {
  const snapDoc: any = await withTimeout(fsMod.getDoc(userDoc(uid)), 20000);
  const exists = typeof snapDoc.exists === 'function' ? snapDoc.exists() : !!snapDoc.exists;
  const remote: Snapshot = exists ? (JSON.parse(snapDoc.data()?.payload ?? '{}') as Snapshot) : {};
  const local = await collectLocal();
  const { merged, changedKeys } = mergeSnapshots(local, remote);
  if (changedKeys.length) {
    await AsyncStorage.multiSet(changedKeys.map(k => [k, merged[k]] as [string, string]));
  }
  await AsyncStorage.setItem(RESTORED_UID_KEY, uid);

  // ⚠️ REMOUNT BEFORE THE UPLOAD, AND DO NOT AWAIT THE UPLOAD.
  //
  // Every provider still mounted is holding PRE-restore state and will write it
  // back the moment anything changes. backupNow is a network round trip with a
  // 20 s timeout, so awaiting it here left a 20-second window in which finishing
  // one quiz set — or tapping a single heart — would overwrite the freshly
  // merged keys with the stale in-memory copy, and the upload would then push
  // that clobbered version to the cloud. Progress from her other device would be
  // gone from BOTH ends, unrecoverably.
  //
  // Remounting first re-hydrates every provider from the merged disk state, so
  // there is no stale writer left. The upload is fire-and-forget; if it fails
  // the next launch re-runs the merge, which is idempotent.
  if (changedKeys.length) requestRemount(wasOnboardingDone);
  void backupNow(true);
}

// Remount immediately when the app is past onboarding; otherwise hold it until
// OnboardingFlow.finishAll → flushPendingRemount(), so the user is never thrown
// out of a flow she's mid-way through. `wasOnboardingDone` is the flag as it
// stood BEFORE the restore (the restored flag says nothing about this session).
function requestRemount(wasOnboardingDone: boolean): void {
  if (wasOnboardingDone) remountHandler?.();
  else pendingRemount = true;
}

// Called by OnboardingFlow.finishAll after onboarding state is persisted.
export async function flushPendingRemount(): Promise<void> {
  if (!pendingRemount) return;
  pendingRemount = false;
  // finishAll just completed onboarding. AsyncStorage requests are FIFO, so
  // awaiting this write guarantees finish()'s own done-flag + answers writes
  // (queued earlier) have landed before the tree re-hydrates — the remount can
  // never bounce the user back into onboarding.
  try { await AsyncStorage.setItem('onboarding:done:v1', '1'); } catch {}
  remountHandler?.();
}

// Remove the user's cloud copy (account deletion). Must run BEFORE the Firebase
// auth user is deleted — the security rules require an authenticated uid.
export async function deleteCloudBackup(): Promise<void> {
  if (!fsMod || !currentUid) return;
  try { await withTimeout(fsMod.deleteDoc(userDoc(currentUid)), 20000); } catch { /* best effort */ }
  try { await AsyncStorage.removeItem(RESTORED_UID_KEY); } catch {}
}

// Wire auth + AppState. Called once from App launch; safe to call again (e.g.
// if a future refactor moves it into a remounting component).
export function initCloudBackup(): void {
  if (initialized || !fsMod) return;
  initialized = true;

  onAuthChanged(async (user) => {
    currentUid = user?.uid ?? null;
    if (!currentUid) return;
    try {
      const restoredUid = await AsyncStorage.getItem(RESTORED_UID_KEY);
      if (restoredUid === currentUid) { backupNow(); return; }
      const wasOnboardingDone = (await AsyncStorage.getItem('onboarding:done:v1')) === '1';
      await restoreAndMerge(currentUid, wasOnboardingDone);
    } catch { /* offline — retry next auth event / launch */ }
  });

  // Session-end snapshot: 'background' on Android, 'inactive'→'background' on iOS.
  AppState.addEventListener('change', (s) => {
    if (s === 'background' || s === 'inactive') backupNow();
  });
}
