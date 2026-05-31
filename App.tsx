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
import { NotoSansSC_400Regular, NotoSansSC_500Medium, NotoSansSC_600SemiBold, NotoSansSC_700Bold } from '@expo-google-fonts/noto-sans-sc';
import { Inter_400Regular } from '@expo-google-fonts/inter';
// Merriweather — purpose-built for on-screen reading. Used as the default
// body font in the Bible reader. Regular (400) + Bold (700) cover the verse
// text and verse-number weight; loading just two keeps the bundle slim.
import { Merriweather_400Regular, Merriweather_700Bold } from '@expo-google-fonts/merriweather';
import { Lato_400Regular, Lato_700Bold } from '@expo-google-fonts/lato';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
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
import { PlanProfileProvider } from './src/state/PlanProfileContext';
import { PlansProvider } from './src/state/PlansContext';
import { PlanCompletionProvider } from './src/state/PlanCompletionContext';
import AchievementUnlockSheet from './src/components/AchievementUnlockSheet';
import DeepLinkHandler from './src/navigation/DeepLinkHandler';

export default function App() {
  const [fontsLoaded] = useFonts({
    'SourceSerif4Variable-Roman':  require('./assets/fonts/SourceSerif4Variable-Roman.ttf'),
    'SourceSerif4Variable-Italic': require('./assets/fonts/SourceSerif4Variable-Italic.ttf'),
    NotoSansSC_400Regular,
    NotoSansSC_500Medium,
    NotoSansSC_600SemiBold,
    NotoSansSC_700Bold,
    Inter_400Regular,
    Merriweather_400Regular,
    Merriweather_700Bold,
    Lato_400Regular,
    Lato_700Bold,
    Lora_400Regular,
    Lora_700Bold,
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
                            <PlanProfileProvider>
                            <PlansProvider>
                            <PlanCompletionProvider>
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
                            </PlanCompletionProvider>
                            </PlansProvider>
                            </PlanProfileProvider>
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
