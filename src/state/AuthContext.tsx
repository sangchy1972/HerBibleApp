import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthChanged, googleSignIn, facebookSignIn, appleFirebaseSignIn, firebaseSignOut, deleteAccount as fbDeleteAccount, sendEmailSignInLink, completeEmailSignIn, type AuthUser } from '../services/firebaseAuth';
import { setAnalyticsUser, logEvent, setUserProps } from '../services/firebase';
import { deleteCloudBackup } from '../services/cloudBackup';

export interface User {
  uid?: string;          // Firebase UID when signed in via Firebase (Google); undefined for legacy local sign-ins
  name: string;
  email: string;
  photoUri?: string;
}

interface AuthState {
  user: User | null;
  /** Native Google → Firebase. Resolves on success; throws 'CANCELLED' if dismissed. */
  signInWithGoogle: () => Promise<void>;
  /** Native Facebook (fbsdk) → Firebase. Resolves on success; throws 'CANCELLED' if dismissed. */
  signInWithFacebook: () => Promise<void>;
  /** Apple identity token → Firebase (same uid pool as Google/email). */
  signInWithApple: (identityToken: string, rawNonce: string, displayName?: string) => Promise<void>;
  /** Email magic-link (passwordless): sends a one-tap sign-in link to the email. */
  sendEmailLink: (email: string, appLanguage?: string) => Promise<void>;
  /** Completes magic-link sign-in from the tapped link (called by DeepLinkHandler). */
  completeEmailLink: (link: string) => Promise<void>;
  /** Redeeming a tapped link right now. The sheet shows a spinner rather than
   *  leaving "Check your email" on screen while the network round-trip runs. */
  emailLinkBusy: boolean;
  /** The last redemption failed (expired link, wrong device, no stored email).
   *  DeepLinkHandler used to swallow this, so a dead link looked exactly like a
   *  link she had not tapped yet. Cleared when she retries. */
  emailLinkFailed: boolean;
  clearEmailLinkError: () => void;
  /** Legacy local sign-in — still used by Apple until it migrates to Firebase. */
  signIn: (u: User) => void;
  signOut: () => void;
  /** Permanently delete the account (Firebase user, if any) AND clear all local
   *  identity/data. Throws 'REQUIRES_RECENT_LOGIN' if the provider needs a fresh
   *  sign-in first (caller should ask the user to sign in again and retry). */
  deleteAccount: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthState | null>(null);

// Legacy local user (Facebook/Apple, pre-Firebase). The Firebase user always
// takes precedence when present.
const LOCAL_USER_KEY = 'auth:user';
// A photo the user picked themselves (expo-image-picker) — layered on top of
// whatever avatar the identity provider returned.
const PHOTO_OVERRIDE_KEY = 'auth:photo-override';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<AuthUser | null>(null);
  const [localUser, setLocalUser] = useState<User | null>(null);
  const [photoOverride, setPhotoOverride] = useState<string | undefined>(undefined);

  // Firebase auth state drives the signed-in user. setAnalyticsUser ties every
  // event (and Crashlytics) to the uid; cleared to null on sign-out.
  useEffect(() => {
    return onAuthChanged((u) => {
      setFirebaseUser(u);
      setAnalyticsUser(u?.uid ?? null);
    });
  }, []);

  // Hydrate the legacy local user + the photo override on cold start.
  useEffect(() => {
    AsyncStorage.getItem(LOCAL_USER_KEY)
      .then(raw => { if (raw) { try { setLocalUser(JSON.parse(raw) as User); } catch {} } })
      .catch(() => {});
    AsyncStorage.getItem(PHOTO_OVERRIDE_KEY)
      .then(p => { if (p) setPhotoOverride(p); })
      .catch(() => {});
  }, []);

  // Firebase user wins; fall back to the legacy local user. The self-chosen
  // photo override (if any) sits on top of the provider avatar.
  const base: User | null = firebaseUser
    ? { uid: firebaseUser.uid, name: firebaseUser.name, email: firebaseUser.email, photoUri: firebaseUser.photoUri }
    : localUser;
  const user: User | null = base ? { ...base, photoUri: photoOverride ?? base.photoUri } : null;

  // Fires `login` on every sign-in, and `sign_up` (Firebase Recommended) ONCE —
  // on the user's first-ever authentication (persisted flag). `prompt_source`
  // attributes the conversion to whichever login prompt was last shown (written
  // by the onboarding login screen / LoginPromptContext). Also sets the durable
  // `is_signed_up` user property for BigQuery cohorting.
  const recordSignInEvent = useCallback(async (method: string) => {
    logEvent('login', { method });
    try {
      const done = await AsyncStorage.getItem('auth:signed-up:v1');
      if (done !== '1') {
        const src = (await AsyncStorage.getItem('loginPrompt:lastTrigger')) || 'unknown';
        logEvent('sign_up', { method, prompt_source: src });
        setUserProps({ is_signed_up: 'yes' });
        await AsyncStorage.setItem('auth:signed-up:v1', '1');
      }
    } catch { /* analytics best-effort */ }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await googleSignIn();   // onAuthChanged fires with the new user
    recordSignInEvent('google');
  }, [recordSignInEvent]);

  const signInWithFacebook = useCallback(async () => {
    await facebookSignIn();   // onAuthChanged fires with the new user
    recordSignInEvent('facebook');
  }, [recordSignInEvent]);

  const signInWithApple = useCallback(async (identityToken: string, rawNonce: string, displayName?: string) => {
    await appleFirebaseSignIn(identityToken, rawNonce, displayName);   // onAuthChanged fires with the new user
    recordSignInEvent('apple');
  }, [recordSignInEvent]);

  // Pass the app's current language so Firebase picks the matching email
  // template — a CUSTOMISED template is never auto-localised, so without this
  // a Spanish user gets the English mail.
  const sendEmailLink = useCallback(async (email: string, appLanguage?: string) => {
    await sendEmailSignInLink(email, appLanguage);
  }, []);

  // Redemption state, surfaced so the sheet can stop lying. The call is made
  // by DeepLinkHandler, which has no UI of its own and was discarding the
  // rejection — an expired or already-used link left her on "Check your email"
  // indefinitely, indistinguishable from not having tapped it.
  const [emailLinkBusy, setEmailLinkBusy] = useState(false);
  const [emailLinkFailed, setEmailLinkFailed] = useState(false);
  const clearEmailLinkError = useCallback(() => setEmailLinkFailed(false), []);

  const completeEmailLink = useCallback(async (link: string) => {
    setEmailLinkBusy(true);
    setEmailLinkFailed(false);
    try {
      await completeEmailSignIn(link);   // onAuthChanged fires with the new user
      recordSignInEvent('email_link');
    } catch (e) {
      setEmailLinkFailed(true);
      throw e;                            // callers may still want to know
    } finally {
      setEmailLinkBusy(false);
    }
  }, [recordSignInEvent]);

  const signIn = useCallback((u: User) => {
    setLocalUser(u);
    AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u)).catch(() => {});
    recordSignInEvent('apple');   // legacy local path = Apple today
  }, [recordSignInEvent]);

  const signOut = useCallback(() => {
    firebaseSignOut().catch(() => {});
    setLocalUser(null);
    AsyncStorage.removeItem(LOCAL_USER_KEY).catch(() => {});
    setAnalyticsUser(null);
  }, []);

  // Delete the server account first (throws on failure so the UI can react),
  // THEN wipe every trace of local identity + data and sign out. Order matters:
  // if the delete fails (e.g. needs re-auth) we must NOT pretend it succeeded.
  const deleteAccount = useCallback(async () => {
    await deleteCloudBackup(); // server-side progress copy — needs auth, so BEFORE the user is deleted
    await fbDeleteAccount();   // deletes the Firebase user (or no-ops for Apple/local)
    setLocalUser(null);
    setPhotoOverride(undefined);
    await AsyncStorage.multiRemove([LOCAL_USER_KEY, PHOTO_OVERRIDE_KEY, 'auth:signed-up:v1']).catch(() => {});
    try { await firebaseSignOut(); } catch {}
    setAnalyticsUser(null);
    logEvent('account_delete');
  }, []);

  const updateProfile = useCallback((patch: Partial<User>) => {
    if (patch.photoUri !== undefined) {
      setPhotoOverride(patch.photoUri);
      AsyncStorage.setItem(PHOTO_OVERRIDE_KEY, patch.photoUri).catch(() => {});
    }
    // Name/email edits only apply to a legacy local user (the Firebase profile
    // is owned by the provider). No-op when signed in via Firebase.
    setLocalUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<AuthState>(() => ({
    user, signInWithGoogle, signInWithFacebook, signInWithApple, sendEmailLink, completeEmailLink, signIn, signOut, deleteAccount, updateProfile,
    emailLinkBusy, emailLinkFailed, clearEmailLinkError,
  }), [user, signInWithGoogle, signInWithFacebook, signInWithApple, sendEmailLink, completeEmailLink, signIn, signOut, deleteAccount, updateProfile,
       emailLinkBusy, emailLinkFailed, clearEmailLinkError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
