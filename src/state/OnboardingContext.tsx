import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'onboarding:done:v1';

interface OnboardingState {
  ready: boolean;     // false until we've read AsyncStorage
  done: boolean;
  finish: () => void;
}

const Ctx = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => {
      if (v === '1') setDone(true);
    }).finally(() => setReady(true));
  }, []);

  const value = useMemo<OnboardingState>(() => ({
    ready,
    done,
    finish: () => {
      setDone(true);
      AsyncStorage.setItem(KEY, '1').catch(() => {});
    },
  }), [ready, done]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
