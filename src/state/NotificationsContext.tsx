import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotifKey = 'morning' | 'night' | 'quiz' | 'plan';

export interface NotifSettings {
  enabled: boolean;
  hour: number;     // 0–23
  minute: number;   // 0–59
}

export type NotifMap = Record<NotifKey, NotifSettings>;

const STORAGE_KEY = 'notifications:v1';

const DEFAULTS: NotifMap = {
  morning: { enabled: true,  hour: 8,  minute: 0 },
  night:   { enabled: true,  hour: 20, minute: 0 },
  quiz:    { enabled: false, hour: 12, minute: 30 },
  plan:    { enabled: false, hour: 19, minute: 0 },
};

interface NotificationsState {
  ready: boolean;
  settings: NotifMap;
  setEnabled: (key: NotifKey, value: boolean) => void;
  setSchedule: (key: NotifKey, hour: number, minute: number) => void;
}

const Ctx = createContext<NotificationsState | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<NotifMap>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<NotifMap>;
            // Merge over defaults so future-added keys still get sensible values.
            setSettings({ ...DEFAULTS, ...parsed });
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const persist = (next: NotifMap) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<NotificationsState>(() => ({
    ready,
    settings,
    setEnabled: (key, value) => persist({ ...settings, [key]: { ...settings[key], enabled: value } }),
    setSchedule: (key, hour, minute) => persist({ ...settings, [key]: { ...settings[key], hour, minute } }),
  }), [ready, settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}

export function formatHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
