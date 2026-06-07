import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthChanged, googleSignIn, facebookSignIn, firebaseSignOut, type AuthUser } from '../services/firebaseAuth';
import { setAnalyticsUser } from '../services/firebase';

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
  /** Legacy local sign-in — still used by Apple until it migrates to Firebase. */
  signIn: (u: User) => void;
  signOut: () => void;
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

  const signInWithGoogle = useCallback(async () => {
    await googleSignIn();   // onAuthChanged fires with the new user
  }, []);

  const signInWithFacebook = useCallback(async () => {
    await facebookSignIn();   // onAuthChanged fires with the new user
  }, []);

  const signIn = useCallback((u: User) => {
    setLocalUser(u);
    AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u)).catch(() => {});
  }, []);

  const signOut = useCallback(() => {
    firebaseSignOut().catch(() => {});
    setLocalUser(null);
    AsyncStorage.removeItem(LOCAL_USER_KEY).catch(() => {});
    setAnalyticsUser(null);
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
    user, signInWithGoogle, signInWithFacebook, signIn, signOut, updateProfile,
  }), [user, signInWithGoogle, signInWithFacebook, signIn, signOut, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
