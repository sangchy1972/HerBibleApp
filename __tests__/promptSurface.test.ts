// The gate that stops a prompt ambushing a user who is looking at something
// else. Every blocking prompt in the app goes through it (the nudge coordinator
// reads it before granting), so a hole here is a sheet over the Bible reader.

import {
  setPromptRoute, promptSurfaceSafe, setLaunchOverlayUp, pushSheet, popSheet,
  setNudgeActive, nudgeActive, __resetPromptSurfaceForTest,
} from '../src/state/promptSurface';
import { setInterstitialVisible } from '../src/services/interstitialVisibility';

// The launch overlay starts UP (nothing may be granted under it), so every test
// that expects a grant has to put the app past launch first.
const onTab = (r = 'prayer') => { setPromptRoute(r); setLaunchOverlayUp(false); };

beforeEach(() => { __resetPromptSurfaceForTest(); setInterstitialVisible(false); });
afterEach(() => { setInterstitialVisible(false); __resetPromptSurfaceForTest(); });

describe('promptSurfaceSafe', () => {
  it('allows the browse tabs', () => {
    for (const r of ['prayer', 'plan', 'profile']) {
      onTab(r);
      expect(promptSurfaceSafe()).toBe(true);
    }
  });

  it('BLOCKS the Bible tab — that screen IS the reader', () => {
    // BibleScreen holds the chapter and verse list itself; it is not a pushed
    // route. Allowing it would permit a sheet over the chapter she is reading,
    // which is the ambush the owner named first.
    onTab('bible');
    expect(promptSurfaceSafe()).toBe(false);
  });

  it('blocks every flow / reader / modal route she chose to be in', () => {
    for (const r of [
      'PrayerFlow', 'GospelPsalm', 'PlanDayWalk', 'PlanVerseRead', 'PlanDayDone',
      'Quiz', 'QuizProgress', 'PuzzleCollection', 'CardCollection',
      'RemoveAds', 'AddWidget', 'Policy', 'HelpCenter', 'HelpAnswer', 'AboutUs',
      'Notifications', 'MoodDashboard', 'Streak', 'PastVerses',
    ]) {
      onTab(r);
      expect(promptSurfaceSafe()).toBe(false);
    }
  });

  it('blocks before the first navigation event lands', () => {
    setLaunchOverlayUp(false);
    expect(promptSurfaceSafe()).toBe(false);
  });

  it('blocks under the launch overlay — it is pointerEvents:none, so a prompt there is invisible but live', () => {
    setPromptRoute('prayer');
    expect(promptSurfaceSafe()).toBe(false);   // overlay still up
    setLaunchOverlayUp(false);
    expect(promptSurfaceSafe()).toBe(true);
  });

  it('blocks while a fullscreen interstitial is up, even on a tab', () => {
    onTab();
    expect(promptSurfaceSafe()).toBe(true);
    setInterstitialVisible(true);
    expect(promptSurfaceSafe()).toBe(false);   // the ad owns the screen
    setInterstitialVisible(false);
    expect(promptSurfaceSafe()).toBe(true);    // and it comes back after
  });

  it('blocks while an in-screen sheet is open, and nests', () => {
    onTab();
    pushSheet();
    expect(promptSurfaceSafe()).toBe(false);
    pushSheet();                               // cross-fade: two at once
    popSheet();
    expect(promptSurfaceSafe()).toBe(false);   // still one open
    popSheet();
    expect(promptSurfaceSafe()).toBe(true);
  });

  it('an unbalanced popSheet cannot drive the depth negative and unlock the gate', () => {
    onTab();
    popSheet(); popSheet();
    pushSheet();
    expect(promptSurfaceSafe()).toBe(false);   // one real sheet is open
  });

  it('an unknown / future route name is blocked, not allowed', () => {
    // Fail CLOSED: a new screen added later must not silently become a place
    // where prompts can ambush her.
    onTab('SomeScreenAddedNextYear');
    expect(promptSurfaceSafe()).toBe(false);
  });
});

describe('nudgeActive — for non-coordinator surfaces', () => {
  it('reports whether a coordinator prompt holds the screen', () => {
    expect(nudgeActive()).toBe(false);
    setNudgeActive(true);
    expect(nudgeActive()).toBe(true);
    setNudgeActive(false);
    expect(nudgeActive()).toBe(false);
  });
  it('is independent of the surface gate — the paywall checks it separately', () => {
    onTab();
    setNudgeActive(true);
    expect(promptSurfaceSafe()).toBe(true);    // a NEW grant is still allowed…
    expect(nudgeActive()).toBe(true);          // …but the paywall must yield
  });
});
