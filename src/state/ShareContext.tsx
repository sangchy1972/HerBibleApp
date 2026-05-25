import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lifetime count of share actions — verses or plans the user has shared.
// Used by the Achievement evaluator (Share the Word, Faithful Sower).
const STORAGE_KEY = 'shares:count';

interface ShareState {
  shareCount: number;
  recordShare: () => void;
}

const Ctx = createContext<ShareState | null>(null);

export function ShareProvider({ children }: { children: React.ReactNode }) {
  const [shareCount, setShareCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      const n = raw ? parseInt(raw, 10) : 0;
      if (!Number.isNaN(n)) setShareCount(n);
    });
  }, []);

  const value = useMemo<ShareState>(() => ({
    shareCount,
    recordShare: () => {
      setShareCount(prev => {
        const next = prev + 1;
        AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => {});
        return next;
      });
    },
  }), [shareCount]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShare() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShare must be used inside ShareProvider');
  return ctx;
}
