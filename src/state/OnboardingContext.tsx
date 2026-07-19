import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_DONE = 'onboarding:done:v1';
const KEY_NOTIF_RATIONALE = 'onboarding:notif-rationale-shown:v1';
const KEY_ANSWERS = 'onboarding:answers:v1';

// The new-user questionnaire answers. All optional — a user can skip any
// screen. Used to tailor content: `bibleLevel` sets reading depth, `topics`
// pre-selects plans/moods, `timeCommitment` sizes the daily plan, etc.
export interface OnboardingAnswers {
  goal?: string;               // 'closer' | 'peace' | 'habit' | 'understand' | 'hope'
  age?: string;                // '18-24' | '25-34' | '35-49' | '50-64' | '65+'
  bibleLevel?: string;         // 'new' | 'basics' | 'familiar' | 'regular'
  topics?: string[];           // subset of TOPIC_OPTS: anxiety | hope | gratitude | family | marriage | belonging | strength | healing | identity | purpose | faith | sleep  (each must map in TOPIC_TAGS → planRecommendations.ts)
  timeCommitment?: number;     // 5 | 10 | 15 | 30  (minutes/day)
}

interface OnboardingState {
  ready: boolean;     // false until we've read AsyncStorage
  done: boolean;
  /** Persisted questionnaire answers (empty object until set). */
  answers: OnboardingAnswers;
  /** Save the questionnaire answers (merged with any prior). */
  saveAnswers: (a: OnboardingAnswers) => void;
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
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [notifRationaleShown, setNotifRationaleShown] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(KEY_DONE),
      AsyncStorage.getItem(KEY_NOTIF_RATIONALE),
      AsyncStorage.getItem(KEY_ANSWERS),
    ]).then(([d, r, a]) => {
      if (d === '1') setDone(true);
      if (r === '1') setNotifRationaleShown(true);
      if (a) { try { setAnswers(JSON.parse(a) as OnboardingAnswers); } catch { /* keep {} */ } }
    }).finally(() => setReady(true));
  }, []);

  const value = useMemo<OnboardingState>(() => ({
    ready,
    done,
    answers,
    saveAnswers: (a) => {
      setAnswers(prev => {
        const next = { ...prev, ...a };
        AsyncStorage.setItem(KEY_ANSWERS, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    finish: () => {
      setDone(true);
      AsyncStorage.setItem(KEY_DONE, '1').catch(() => {});
    },
    notifRationaleShown,
    markNotifRationaleShown: () => {
      setNotifRationaleShown(true);
      AsyncStorage.setItem(KEY_NOTIF_RATIONALE, '1').catch(() => {});
    },
  }), [ready, done, answers, notifRationaleShown]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
