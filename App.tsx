import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
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
import { UILanguageProvider } from './src/state/UILanguageContext';
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
import { BadgesProvider } from './src/state/BadgesContext';
import { FeaturedPlansProvider } from './src/state/FeaturedPlansContext';
import { PlanCompletionProvider } from './src/state/PlanCompletionContext';
import { GospelsPsalmsProvider } from './src/state/GospelsPsalmsContext';
import AchievementUnlockSheet from './src/components/AchievementUnlockSheet';
import DeepLinkHandler from './src/navigation/DeepLinkHandler';
import WidgetSync from './src/components/WidgetSync';
import { initFirebase } from './src/services/firebase';
import { initAds } from './src/services/ads';

export default function App() {
  // Enable Firebase Analytics + Crashlytics collection once on launch, and
  // initialize AdMob (preloads the first interstitial). Both no-op safely on a
  // build that doesn't yet have the respective native module.
  React.useEffect(() => { initFirebase(); initAds(); }, []);

  const [fontsLoaded] = useFonts({
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
                                <BadgesProvider>
                                <OnboardingProvider>
                                  <RatePromptProvider>
                                    <MoodCheckInProvider>
                                      <NotificationsProvider>
                                        <ReminderInterstitialProvider>
                                        <NavigationContainer theme={NAV_THEME}>
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
                                          {/* Mirrors today's verse + the card's
                                              background image to the home-screen
                                              widget. Null render; needs DailyVerses
                                              + PrayerBackgrounds (both above). */}
                                          <WidgetSync />
                                        </NavigationContainer>
                                        </ReminderInterstitialProvider>
                                      </NotificationsProvider>
                                    </MoodCheckInProvider>
                                  </RatePromptProvider>
                                </OnboardingProvider>
                                </BadgesProvider>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
