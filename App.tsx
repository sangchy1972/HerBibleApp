import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput, InteractionManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, useNavigationContainerRef } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SCREEN_BG } from './src/constants/theme';

// Pin the navigator's scene background to our canonical SCREEN_BG (same value
// as RN's implicit default, just made explicit) so the Prayer / Bible / Plan /
// Profile tabs are guaranteed to share one exact background colour.
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
import { AudioMiniProvider } from './src/state/AudioMiniContext';
import { SetReminderTimeProvider } from './src/state/SetReminderTimeContext';
import { QuizPromoProvider } from './src/state/QuizPromoContext';
import LoginPromptHost from './src/components/LoginPromptHost';
import MoodCheckInSheet from './src/components/MoodCheckInSheet';
import SetReminderTimeHost from './src/components/SetReminderTimeHost';
import WidgetInstallHost from './src/components/WidgetInstallHost';
import FirstRunTourHost from './src/components/FirstRunTourHost';
import AudioMiniHost from './src/components/AudioMiniHost';
import DeepLinkHandler from './src/navigation/DeepLinkHandler';
import PrefetchManager from './src/components/PrefetchManager';
import WidgetSync from './src/components/WidgetSync';
import LoadingOverlay from './src/components/LoadingOverlay';
import { setAudioModeAsync } from 'expo-audio';
import { initFirebase, logScreenView } from './src/services/firebase';
import { setAppRemountHandler, initCloudBackup } from './src/services/cloudBackup';
import { initAds } from './src/services/ads';
import { ensureAttRequested } from './src/services/att';
import { initAdFrequency, noteNavigation } from './src/services/adFrequency';
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
    const task = InteractionManager.runAfterInteractions(() => {
      // ATT FIRST, on its own — Apple requires the tracking prompt to appear
      // before tracking begins, and burying it inside initAds got the app
      // rejected (5.1.2(i)). initAds awaits the same one-shot internally, so the
      // GMA SDK still initializes with the resolved status; this only guarantees
      // the human is asked early and unconditionally.
      ensureAttRequested().finally(() => { initAds(); });
      initAdFrequency();
      initIap();
    });
    return () => task.cancel();
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
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: true,
    }).catch(() => {});
  }, []);

  // One central screen-view hook: log the active route on every navigation
  // state change so Firebase Analytics gets a complete screen funnel without
  // touching each screen. getCurrentRoute() reflects the deepest active route.
  const navRef = useNavigationContainerRef();
  const onNavStateChange = React.useCallback(() => {
    const name = navRef.getCurrentRoute()?.name;
    if (name) { logScreenView(name); noteNavigation(name); }
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
                                <AudioMiniProvider>
                                  <RatePromptProvider>
                                    <MoodCheckInProvider>
                                      <NotificationsProvider>
                                        <ReminderInterstitialProvider>
                                        <LoginPromptProvider>
                                        <NudgeCoordinatorProvider>
                                        <SetReminderTimeProvider>
                                        <QuizPromoProvider>
                                        <NavigationContainer ref={navRef} theme={NAV_THEME} onStateChange={onNavStateChange} onReady={() => setAppReady(true)}>
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
                                          {/* One-time widget-install nudge
                                              (engaged users, day 3+). */}
                                          <WidgetInstallHost />
                                          {/* 3-step first-run spotlight. Mounted
                                              at app root so it covers the tab bar
                                              as well as the screen. */}
                                          {/* Floating control for Bible narration
                                              that's still playing after the user
                                              left the Bible tab. Above the tabs,
                                              below the tour + launch overlay. */}
                                          <AudioMiniHost />
                                          <FirstRunTourHost />
                                          {/* Mirrors today's verse + the card's
                                              background image to the home-screen
                                              widget. Null render; needs DailyVerses
                                              + PrayerBackgrounds (both above). */}
                                          <WidgetSync />
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
