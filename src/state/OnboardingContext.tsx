import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_DONE = 'onboarding:done:v1';
const KEY_NOTIF_RATIONALE = 'onboarding:notif-rationale-shown:v1';

interface OnboardingState {
  ready: boolean;     // false until we've read AsyncStorage
  done: boolean;
  finish: () => void;
  // Tracks whether the post-Amen "Stay close to God" rationale has fired
  // for this user. Once true, we never show that screen again — fresh
  // taps on Amen go straight to home (or to the Weekly evening flow).
  notifRationaleShown: boolean;
  markNotifRationaleShown: () => void;
}

const Ctx = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [notifRationaleShown, setNotifRationaleShown] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(KEY_DONE),
      AsyncStorage.getItem(KEY_NOTIF_RATIONALE),
    ]).then(([d, r]) => {
      if (d === '1') setDone(true);
      if (r === '1') setNotifRationaleShown(true);
    }).finally(() => setReady(true));
  }, []);

  const value = useMemo<OnboardingState>(() => ({
    ready,
    done,
    finish: () => {
      setDone(true);
      AsyncStorage.setItem(KEY_DONE, '1').catch(() => {});
    },
    notifRationaleShown,
    markNotifRationaleShown: () => {
      setNotifRationaleShown(true);
      AsyncStorage.setItem(KEY_NOTIF_RATIONALE, '1').catch(() => {});
    },
  }), [ready, done, notifRationaleShown]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
