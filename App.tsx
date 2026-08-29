import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput, InteractionManager, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, useNavigationContainerRef } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SCREEN_BG } from './src/constants/theme';

// Pin the navigator's scene background to our canonical SCREEN_BG so the
// Prayer / Bible / Plan / Profile tabs are guaranteed to share one exact
// background colour (was RN's default #F2F2F2; #F9F7F7 since 2026-08-21).
const NAV_THEME = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: SCREEN_BG } };

// Global default font: Lato 400 Regular. Many Text/TextInput styles in
// the app set `fontSize` and `fontWeight` but forget `fontFamily` — without
// this default they would render in the platform system sans (San Francisco
// on iOS, Roboto on Android), which clashes with the brand fonts elsewhere.
// Per-style `fontFamily` overrides this default normally.
const DEFAULT_FONT_STYLE = { fontFamily: 'Lato_400Regular' };
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [DEFAULT_FONT_STYLE, (Text as any).defaultProps.style];
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [DEFAULT_FONT_STYLE, (TextInput as any).defaultProps.style];
// Source Serif 4 is loaded as the variable-font TTF (with the opsz +
// wght axes), not the static per-weight files. The default instance is
// already at opsz 14 / wght 400 (the body-text master), and any style
// can override via `fontVariationSettings` to push toward Caption (small
// opsz) or Display (large opsz) shapes. See `serifVariation` in theme.ts.
// Fonts are loaded by require()-ing the SPECIFIC weight .ttf files below (see
// useFonts). We deliberately do NOT `import { X_400Regular } from
// '@expo-google-fonts/x'` — that package entry statically requires EVERY weight
// (Metro can't tree-shake it), so a single named import drags the whole family
// into the bundle (e.g. Noto Sans SC = 9 × 10 MB = 90 MB, Merriweather = 14 MB).
// Requiring the exact .ttf bundles only the weights we actually use.
// Noto Sans SC is not bundled at all — Chinese falls back to the system CJK font.
import RootNavigator from './src/navigation/RootNavigator';
import { PrayerProvider } from './src/state/PrayerContext';
import { NotesProvider } from './src/state/NotesContext';
import { TranslationsProvider } from './src/state/TranslationsContext';
import { UILanguageProvider, useUILanguage } from './src/state/UILanguageContext';
import { SavedVersesProvider } from './src/state/SavedVersesContext';
import { ActivityProvider } from './src/state/ActivityContext';
import { AuthProvider } from './src/state/AuthContext';
import { HighlightsProvider } from './src/state/HighlightsContext';
import { BookmarksProvider } from './src/state/BookmarksContext';
import { ReadChaptersProvider } from './src/state/ReadChaptersContext';
import { OnboardingProvider } from './src/state/OnboardingContext';
import { RatePromptProvider } from './src/state/RatePromptContext';
import { MoodCheckInProvider } from './src/state/MoodCheckInContext';
import { NotificationsProvider } from './src/state/NotificationsContext';
import { ReminderInterstitialProvider } from './src/state/ReminderInterstitialContext';
import { DailyVersesProvider } from './src/state/DailyVersesContext';
import { PrayerBackgroundsProvider } from './src/state/PrayerBackgroundsContext';
import { ShareProvider } from './src/state/ShareContext';
import { AchievementsProvider } from './src/state/AchievementsContext';
import { QuizProvider } from './src/state/QuizContext';
import { BadgesProvider } from './src/state/BadgesContext';
import { FeaturedPlansProvider } from './src/state/FeaturedPlansContext';
import { PlanCompletionProvider } from './src/state/PlanCompletionContext';
import { GospelsPsalmsProvider } from './src/state/GospelsPsalmsContext';
import AchievementUnlockSheet from './src/components/AchievementUnlockSheet';
import { LoginPromptProvider } from './src/state/LoginPromptContext';
import { NudgeCoordinatorProvider } from './src/state/NudgeCoordinatorContext';
import { FirstRunTourProvider } from './src/state/FirstRunTourContext';
import { StreakGuideProvider } from './src/state/StreakGuideContext';
import StreakGuideHost from './src/components/StreakGuideHost';
import { PlanGuideProvider } from './src/state/PlanGuideContext';
import PlanGuideHost from './src/components/PlanGuideHost';
import { BibleGuideProvider } from './src/state/BibleGuideContext';
import BibleGuideHost from './src/components/BibleGuideHost';
import { AudioMiniProvider } from './src/state/AudioMiniContext';
import { SetReminderTimeProvider } from './src/state/SetReminderTimeContext';
import { QuizPromoProvider } from './src/state/QuizPromoContext';
import LoginPromptHost from './src/components/LoginPromptHost';
import MoodCheckInSheet from './src/components/MoodCheckInSheet';
import SetReminderTimeHost from './src/components/SetReminderTimeHost';
import WidgetInstallHost from './src/components/WidgetInstallHost';
import OverlayCardsPromptHost from './src/components/OverlayCardsPromptHost';
import OverlayCardsSync from './src/components/OverlayCardsSync';
import StreakDailyHost from './src/components/StreakDailyHost';
import ResumeRitualHost from './src/components/ResumeRitualHost';
import RemoveAdsPromptHost from './src/components/RemoveAdsPromptHost';
import FirstRunTourHost from './src/components/FirstRunTourHost';
import AudioMiniHost from './src/components/AudioMiniHost';
import DeepLinkHandler from './src/navigation/DeepLinkHandler';
import PrefetchManager from './src/components/PrefetchManager';
import WidgetSync from './src/components/WidgetSync';
import LoadingOverlay from './src/components/LoadingOverlay';
import { applyMixAudioMode } from './src/services/audioSession';
import { initFirebase, logScreenView, setCrashScreen } from './src/services/firebase';
import { setAppRemountHandler, initCloudBackup } from './src/services/cloudBackup';
import { initAds } from './src/services/ads';
import { ensureAttRequested } from './src/services/att';
import { initAdFrequency, isInstallDay, isFirstOpenUser, noteNavigation } from './src/services/adFrequency';
import { setPromptRoute, setLaunchOverlayUp } from './src/state/promptSurface';
import { initIap } from './src/services/iap';

export default function App() {
  // Enable Firebase Analytics + Crashlytics collection once on launch, and
  // initialize AdMob (preloads the first interstitial). Both no-op safely on a
  // build that doesn't yet have the respective native module.
  // Firebase is light + needed early (analytics/auth). The AdMob GMA SDK is
  // heavy native init — defer it past the launch animations (InteractionManager)
  // so it never competes with the loading screens / first render.
  React.useEffect(() => {
    initFirebase();
    initCloudBackup();
    // ANDROID: ads init leaves the cold-start window entirely (ANR batch
    // 2026-08-17, Play traces 1/4). At launch, four parties convoy on the
    // WebView/Display global locks on slow devices: the WebView provider load
    // (seconds on old hardware), MobileAds.initialize (blocked on
    // DisplayManagerGlobal, on mqt_native), UMP's getDefaultUserAgent (blocked
    // on WebViewFactory), and main's own layout getDisplayInfo — main blows the
    // 5s input budget. Pushing GMA+UMP 6s past interactions-settled removes two
    // of the four from the window.
    //
    // Known costs, stated (swarm review 2026-08-17): a hot-start return whose
    // excursion fits inside the init window is silently dropped (rare — needs
    // backgrounding within the first seconds AND ≥15s away), and every second
    // of deferral eats into onboarding_first's once-only window on fresh
    // installs — which is why install day is EXEMPT below. The ANR cohort is
    // existing users' daily cold starts; a day-0 device cold-starts in that
    // state once ever, and keeps the other two layers (cookie-inert client +
    // WebView warmup).
    const ADS_INIT_COLD_START_DELAY_MS = 6000;
    let adsTimer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      // ATT FIRST, on its own — Apple requires the tracking prompt to appear
      // before tracking begins, and burying it inside initAds got the app
      // rejected (5.1.2(i)). initAds awaits the same one-shot internally, so the
      // GMA SDK still initializes with the resolved status; this only guarantees
      // the human is asked early and unconditionally.
      ensureAttRequested().finally(() => {
        if (Platform.OS === 'android') {
          // The callback MUST null the handle: the day-0 check below keys on
          // it, and a stale handle after firing would run initAds a second
          // time concurrently — initialized only latches after its awaits, so
          // the guard alone doesn't stop overlap (swarm r2).
          adsTimer = setTimeout(() => { adsTimer = null; initAds(); }, ADS_INIT_COLD_START_DELAY_MS);
          Promise.all([isInstallDay(), isFirstOpenUser()]).then(([day0, firstOpen]) => {
            if ((day0 || firstOpen) && adsTimer) {
              clearTimeout(adsTimer);
              adsTimer = null;
              initAds();
            }
          }).catch(() => { /* keep the deferral */ });
        } else {
          // iOS: untouched — its convoy isn't implicated, and the ATT→init
          // ordering guarantees stay exactly as reviewed by Apple.
          initAds();
        }
      });
      initAdFrequency();
      // initIap() is NOT here any more — see the deferred effect below.
    });
    return () => { task.cancel(); if (adsTimer) clearTimeout(adsTimer); };
  }, []);

  // Configure the iOS audio session ONCE, globally, at launch — play through the
  // hardware silent/mute switch (`playsInSilentMode`) and mix rather than duck.
  // Previously this lived only inside PrayerFlow, so Bible narration, Gospel &
  // Psalm, and plan-chapter audio played in the default category that the mute
  // switch silences → no sound on iOS when the phone was on silent. Setting it
  // app-wide fixes every audio surface. No-ops safely on Android.
  React.useEffect(() => {
    // shouldPlayInBackground: narration MUST survive leaving the app — this was
    // missing, so on iOS the system paused audio the moment she backgrounded or
    // locked the phone (Android was unaffected, which is why it only showed up
    // on device). Pairs with ios.infoPlist.UIBackgroundModes = ['audio'] in
    // app.json; without that declaration iOS ignores the flag entirely.
    // interruptionMode stays 'doNotMix' is NOT wanted — 'mixWithOthers' lets a
    // podcast/music keep playing alongside, which is what a devotional reader
    // should do.
    // Centralized in services/audioSession so the Bible-narration session can
    // flip to doNotMix and restore THIS exact mode afterwards.
    applyMixAudioMode();
  }, []);

  // One central screen-view hook: log the active route on every navigation
  // state change so Firebase Analytics gets a complete screen funnel without
  // touching each screen. getCurrentRoute() reflects the deepest active route.
  const navRef = useNavigationContainerRef();
  const onNavStateChange = React.useCallback(() => {
    const name = navRef.getCurrentRoute()?.name;
    // Also feeds the prompt-surface gate: blocking prompts may only be granted
    // while she is on one of the four tabs (state/promptSurface).
    setPromptRoute(name ?? null);
    if (name) { logScreenView(name); noteNavigation(name); setCrashScreen(name); }
  }, [navRef]);

  // Custom launch loading page. Shown over the app until the navigator is ready
  // (onReady) AND a 2s floor has passed — so users see a branded loading screen
  // with a rotating hymn/quote instead of a black screen or a bare logo.
  const [appReady, setAppReady] = React.useState(false);
  const [loadingDone, setLoadingDone] = React.useState(false);
  // Cloud-restore remount: after a sign-in pulls backed-up progress into
  // AsyncStorage, bumping this key remounts the whole provider tree so every
  // context re-hydrates the restored data (pure-JS "reload"; App itself — and
  // thus loadingDone — survives, so the launch overlay does not replay).
  const [treeEpoch, setTreeEpoch] = React.useState(0);
  React.useEffect(() => { setAppRemountHandler(() => setTreeEpoch(e => e + 1)); }, []);
  // Stable callback so LoadingOverlay's timers/effects don't reset on every
  // re-render (an inline arrow would churn its 6s safety-cap effect).
  const hideLoading = React.useCallback(() => setLoadingDone(true), []);
  // The launch overlay is pointerEvents="none", so a prompt granted underneath it
  // is invisible-but-live. Report its state to the prompt-surface gate.
  React.useEffect(() => { setLaunchOverlayUp(!loadingDone); }, [loadingDone]);

  // IAP is initialized AFTER the launch overlay is gone — never during the cold
  // start. Play ANR (v1.2.0, realme Note 70 / Android 15, "Input dispatching
  // timed out (No focused window)"):
  //
  //   OpenIapModule.<init>            (OpenIapModule.kt:110)
  //   SynchronizedLazyImpl.getValue   (LazyJVM.kt:86)
  //   ExpoIapModule.getOpenIap        (ExpoIapModule.kt:62)
  //   Handler.handleCallback -> Looper.loop -> ActivityThread.main
  //
  // expo-iap builds its native OpenIapModule LAZILY AND SYNCHRONOUSLY ON THE
  // MAIN THREAD (that Handler frame is the main Looper), and constructing it
  // stands up the Play BillingClient and binds to the Play Store service. On a
  // low-end device that blocks past the 5s input-dispatch budget, and "no focused
  // window" says it happened before the first frame had focus — i.e. a startup
  // ANR. `InteractionManager.runAfterInteractions` did NOT protect us: it only
  // waits for JS interaction handles, and the block happens natively afterwards.
  //
  // The launch pass still has to happen, so it moves rather than disappears: it
  // drains purchases that completed while the app was dead and finishTransaction()s
  // them — **Play refunds an unacknowledged purchase after 3 days** — and re-grants
  // the entitlement when AsyncStorage was cleared but the store account still owns
  // it. Run here, the same native work costs a few slow frames on a screen that
  // already has focus instead of an ANR.
  //
  // Nothing at startup depends on it: the ad-free flag is read from AsyncStorage
  // by initAds, and both paywalls (RemoveAdsScreen, OnboardingFlow) call initIap()
  // themselves behind a spinner — it is idempotent, so whoever gets there first wins.
  React.useEffect(() => {
    if (!loadingDone) return;
    // 10s, not 4: the overlay's fade and the home screen's staggered entrances
    // are only the first thing this has to clear. A FIRST-RUN user is on the
    // onboarding questionnaire right after the overlay, tapping through options —
    // dropping a main-thread Billing bind under her finger there is the same bug
    // with a focused window instead of none. Ten seconds puts it past both, and
    // nothing is lost: the drain exists for purchases made days ago (Play's
    // acknowledgement window is 3 DAYS), and anyone who reaches a paywall sooner
    // triggers initIap() from the screen itself.
    const tm = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => { initIap(); });
    }, 10_000);
    return () => clearTimeout(tm);
  }, [loadingDone]);

  const [fontsLoaded] = useFonts({
    // Preload the @expo/vector-icons fonts we use up front. Without this they
    // load LAZILY on first render of each set; on some real devices / production
    // builds that lazy load was missing or late, leaving icons blank inside
    // their containers (e.g. the calendar's month-nav buttons rendered as empty
    // grey circles). Bundled already, so this adds no size — just guarantees
    // they're ready before anything draws. (MaterialCommunityIcons is large and
    // used in only one screen, so it stays lazy.)
    ...Feather.font,
    ...Ionicons.font,
    'SourceSerif4Variable-Roman':  require('./assets/fonts/SourceSerif4Variable-Roman.ttf'),
    'SourceSerif4Variable-Italic': require('./assets/fonts/SourceSerif4Variable-Italic.ttf'),
    // Latin fonts are glyph-SUBSET to the Latin range + the few symbols the UI
    // uses (→ ✓ etc.), generated by fonttools and stored locally in assets/fonts.
    // Full families would be ~20 MB; these subsets total ~2 MB. See FONTS.md.
    Inter_400Regular:        require('./assets/fonts/Inter_400Regular.ttf'),
    Merriweather_400Regular: require('./assets/fonts/Merriweather_400Regular.ttf'),
    Merriweather_700Bold:    require('./assets/fonts/Merriweather_700Bold.ttf'),
    Lato_400Regular:         require('./assets/fonts/Lato_400Regular.ttf'),
    Lato_700Bold:            require('./assets/fonts/Lato_700Bold.ttf'),
    Lora_400Regular:         require('./assets/fonts/Lora_400Regular.ttf'),
    Lora_700Bold:            require('./assets/fonts/Lora_700Bold.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <React.Fragment key={treeEpoch}>
        <UILanguageProvider>
        <AuthProvider>
          <PrayerProvider>
            <NotesProvider>
              <SavedVersesProvider>
                <HighlightsProvider>
                  <BookmarksProvider>
                    <ReadChaptersProvider>
                      <ActivityProvider>
                        <TranslationsProvider>
                          <FeaturedPlansProvider>
                            <PlanCompletionProvider>
                          <GospelsPsalmsProvider>
                          <DailyVersesProvider>
                            <PrayerBackgroundsProvider>
                            <ShareProvider>
                              <AchievementsProvider>
                                {/* Below AchievementsProvider: no cross-context
                                    deps, so it sits deep and keeps the top of
                                    the tree shallow. Needs the UI language to
                                    know which CDN bank to fetch. */}
                                <QuizProviderWithLanguage>
                                <BadgesProvider>
                                <OnboardingProvider>
                                {/* Must sit ABOVE MoodCheckInProvider and
                                    NudgeCoordinatorProvider — both gate on the
                                    first-run tour — and BELOW OnboardingProvider,
                                    which it reads. */}
                                <FirstRunTourProvider>
                                <StreakGuideProvider>
                                <PlanGuideProvider>
                                <BibleGuideProvider>
                                <AudioMiniProvider>
                                  <RatePromptProvider>
                                    <MoodCheckInProvider>
                                      <NotificationsProvider>
                                        <ReminderInterstitialProvider>
                                        <LoginPromptProvider>
                                        <NudgeCoordinatorProvider>
                                        <SetReminderTimeProvider>
                                        <QuizPromoProvider>
                                        <NavigationContainer ref={navRef} theme={NAV_THEME} onStateChange={onNavStateChange} onReady={() => { setAppReady(true); onNavStateChange(); }}>
                                          <StatusBar style="dark" />
                                          <RootNavigator />
                                          {/* Mounted inside NavigationContainer
                                              so the View Details button can
                                              navigate; reads its queue off
                                              AchievementsContext, so it fires
                                              from anywhere a counter changes. */}
                                          <AchievementUnlockSheet />
                                          {/* Routes notification taps + widget
                                              deep-link URLs to the right
                                              destination screen. Must sit
                                              inside NavigationContainer so it
                                              can call navigate(). */}
                                          <DeepLinkHandler />
                                          {/* Soft login nudges (first badge /
                                              note / highlight / day-1 / periodic,
                                              frequency-capped). Inside the nav so
                                              SignInSheet's legal links work. */}
                                          <LoginPromptHost />
                                          {/* Daily mood check-in bottom sheet.
                                              Self-triggers once/day off the
                                              MoodCheckInProvider flag; renders
                                              null until due. */}
                                          <MoodCheckInSheet />
                                          {/* Proactive "set your prayer reminders"
                                              nudge for users who finished onboarding
                                              without enabling reminders (coordinator-
                                              managed, gated on notifications-off). */}
                                          <SetReminderTimeHost />
                                          {/* Once-a-day full-screen streak
                                              ritual: first open of each local
                                              day, streak ≥ 1. Priority 12,
                                              daily-ritual class. */}
                                          <StreakDailyHost />
                                          <ResumeRitualHost />
                                          {/* One-time widget-install nudge
                                              (engaged users, day 3+). */}
                                          <WidgetInstallHost />
                                          {/* "Appear on top" ask for the daily
                                              overlay cards (verse + quiz popups
                                              over the launcher). Android only;
                                              silent once granted. */}
                                          <OverlayCardsPromptHost />
                                          {/* Proactive remove-ads pitch: opens
                                              the paywall after the first ad of
                                              a qualifying day (2nd active day,
                                              then every 7). Null render. */}
                                          <RemoveAdsPromptHost />
                                          {/* 3-step first-run spotlight. Mounted
                                              at app root so it covers the tab bar
                                              as well as the screen. */}
                                          {/* Floating control for Bible narration
                                              that's still playing after the user
                                              left the Bible tab. Above the tabs,
                                              below the tour + launch overlay. */}
                                          <AudioMiniHost />
                                          <FirstRunTourHost />
                                          {/* Rookie streak guide overlay (2-step
                                              spotlight). Root-mounted for the
                                              same reason as the tour: it must
                                              cover the tab bar. */}
                                          <StreakGuideHost />
                                          <PlanGuideHost />
                                          {/* 5-step Bible-reader guide, on her
                                              first ever visit to that tab.
                                              Root-mounted for the same reason:
                                              the scrim must cover the tab bar. */}
                                          <BibleGuideHost />
                                          {/* Mirrors today's verse + the card's
                                              background image to the home-screen
                                              widget. Null render; needs DailyVerses
                                              + PrayerBackgrounds (both above). */}
                                          <WidgetSync />
                                          {/* Mirrors today's verse + quiz teaser
                                              into the native overlay-card store
                                              (popups shown over the launcher at
                                              her reminder times). Null render;
                                              Android + permission-gated inside. */}
                                          <OverlayCardsSync />
                                          {/* Quietly pre-warms prayer-flow
                                              narration + plan covers/details
                                              after launch settles (phases 3-4).
                                              Deferred behind InteractionManager;
                                              needs UILanguage + DailyVerses +
                                              FeaturedPlans + PrayerBackgrounds,
                                              all mounted above. */}
                                          <PrefetchManager appReady={appReady} />
                                          {/* Launch loading page — absolute-fill
                                              overlay above everything; hides once
                                              the nav is ready + the 2s floor passes. */}
                                          {!loadingDone && (
                                            <LoadingOverlay appReady={appReady} onHide={hideLoading} />
                                          )}
                                        </NavigationContainer>
                                        </QuizPromoProvider>
                                        </SetReminderTimeProvider>
                                        </NudgeCoordinatorProvider>
                                        </LoginPromptProvider>
                                        </ReminderInterstitialProvider>
                                      </NotificationsProvider>
                                    </MoodCheckInProvider>
                                  </RatePromptProvider>
                                </AudioMiniProvider>
                                </BibleGuideProvider>
                                </PlanGuideProvider>
                                </StreakGuideProvider>
                                </FirstRunTourProvider>
                                </OnboardingProvider>
                                </BadgesProvider>
                                </QuizProviderWithLanguage>
                              </AchievementsProvider>
                            </ShareProvider>
                            </PrayerBackgroundsProvider>
                          </DailyVersesProvider>
                          </GospelsPsalmsProvider>
                            </PlanCompletionProvider>
                          </FeaturedPlansProvider>
                        </TranslationsProvider>
                      </ActivityProvider>
                    </ReadChaptersProvider>
                  </BookmarksProvider>
                </HighlightsProvider>
              </SavedVersesProvider>
            </NotesProvider>
          </PrayerProvider>
        </AuthProvider>
        </UILanguageProvider>
        </React.Fragment>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// QuizProvider needs the UI language to know which CDN bank to fetch, and
// useUILanguage is a hook — so it can't be read inside App's JSX above the
// provider that supplies it. This thin wrapper reads it at the right depth.
function QuizProviderWithLanguage({ children }: { children: React.ReactNode }) {
  const { lang } = useUILanguage();
  return <QuizProvider language={lang}>{children}</QuizProvider>;
}
