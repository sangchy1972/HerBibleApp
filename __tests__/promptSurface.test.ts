// The gate that stops a prompt ambushing a user who is looking at something
// else. Every blocking prompt in the app goes through it (the nudge coordinator
// reads it before granting), so a hole here is a sheet over the Bible reader.

import { setPromptRoute, promptSurfaceSafe } from '../src/state/promptSurface';
import { setInterstitialVisible } from '../src/services/interstitialVisibility';

afterEach(() => {
  setInterstitialVisible(false);
  setPromptRoute(null);
});

describe('promptSurfaceSafe', () => {
  it('allows the four tab surfaces', () => {
    for (const r of ['prayer', 'bible', 'plan', 'profile']) {
      setPromptRoute(r);
      expect(promptSurfaceSafe()).toBe(true);
    }
  });

  it('blocks every flow / reader / modal route she chose to be in', () => {
    for (const r of [
      'PrayerFlow', 'GospelPsalm', 'PlanDayWalk', 'PlanVerseRead', 'PlanDayDone',
      'Quiz', 'QuizProgress', 'PuzzleCollection', 'CardCollection',
      'RemoveAds', 'AddWidget', 'Policy', 'HelpCenter', 'HelpAnswer', 'AboutUs',
      'Notifications', 'MoodDashboard', 'Streak', 'PastVerses',
    ]) {
      setPromptRoute(r);
      expect(promptSurfaceSafe()).toBe(false);
    }
  });

  it('blocks before the first navigation event lands', () => {
    setPromptRoute(null);
    expect(promptSurfaceSafe()).toBe(false);
  });

  it('blocks while a fullscreen interstitial is up, even on a tab', () => {
    setPromptRoute('prayer');
    expect(promptSurfaceSafe()).toBe(true);
    setInterstitialVisible(true);
    expect(promptSurfaceSafe()).toBe(false);   // the ad owns the screen
    setInterstitialVisible(false);
    expect(promptSurfaceSafe()).toBe(true);    // and it comes back after
  });

  it('an unknown / future route name is blocked, not allowed', () => {
    // Fail CLOSED: a new screen added later must not silently become a place
    // where prompts can ambush her.
    setPromptRoute('SomeScreenAddedNextYear');
    expect(promptSurfaceSafe()).toBe(false);
  });
});
