import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  name: string;
  email: string;
  photoUri?: string;
}

interface AuthState {
  user: User | null;
  signIn: (u: User) => void;
  signOut: () => void;
  updateProfile: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = 'auth:user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setUser(JSON.parse(raw) as User); } catch {}
      }
    });
  }, []);

  const persist = (next: User | null) => {
    setUser(next);
    if (next) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    else AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  };

  const value = useMemo<AuthState>(() => ({
    user,
    signIn: (u) => persist(u),
    signOut: () => persist(null),
    updateProfile: (patch) => {
      if (!user) return;
      persist({ ...user, ...patch });
    },
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
