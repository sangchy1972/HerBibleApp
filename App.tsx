import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
// Source Serif 4 is loaded as the variable-font TTF (with the opsz +
// wght axes), not the static per-weight files. The default instance is
// already at opsz 14 / wght 400 (the body-text master), and any style
// can override via `fontVariationSettings` to push toward Caption (small
// opsz) or Display (large opsz) shapes. See `serifVariation` in theme.ts.
import { NotoSansSC_400Regular, NotoSansSC_500Medium, NotoSansSC_700Bold } from '@expo-google-fonts/noto-sans-sc';
import { Inter_400Regular } from '@expo-google-fonts/inter';
// Merriweather — purpose-built for on-screen reading. Used as the default
// body font in the Bible reader. Regular (400) + Bold (700) cover the verse
// text and verse-number weight; loading just two keeps the bundle slim.
import { Merriweather_400Regular, Merriweather_700Bold } from '@expo-google-fonts/merriweather';
import RootNavigator from './src/navigation/RootNavigator';
import { PrayerProvider } from './src/state/PrayerContext';
import { NotesProvider } from './src/state/NotesContext';
import { TranslationsProvider } from './src/state/TranslationsContext';
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
import { DailyVersesProvider } from './src/state/DailyVersesContext';
import { ShareProvider } from './src/state/ShareContext';
import { AchievementsProvider } from './src/state/AchievementsContext';
import { PlanCompletionProvider } from './src/state/PlanCompletionContext';
import { PlanProfileProvider } from './src/state/PlanProfileContext';
import { PlansProvider } from './src/state/PlansContext';
import AchievementUnlockSheet from './src/components/AchievementUnlockSheet';

export default function App() {
  const [fontsLoaded] = useFonts({
    'SourceSerif4Variable-Roman':  require('./assets/fonts/SourceSerif4Variable-Roman.ttf'),
    'SourceSerif4Variable-Italic': require('./assets/fonts/SourceSerif4Variable-Italic.ttf'),
    NotoSansSC_400Regular,
    NotoSansSC_500Medium,
    NotoSansSC_700Bold,
    Inter_400Regular,
    Merriweather_400Regular,
    Merriweather_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <PrayerProvider>
            <NotesProvider>
              <SavedVersesProvider>
                <HighlightsProvider>
                  <BookmarksProvider>
                    <ReadChaptersProvider>
                      <ActivityProvider>
                        <TranslationsProvider>
                          <DailyVersesProvider>
                            <ShareProvider>
                              {/* PlanCompletionProvider must wrap AchievementsProvider
                                  — AchievementsContext reads `completedPlans` /
                                  `completedPlanFinishedDates` from it. */}
                              <PlanCompletionProvider>
                                <AchievementsProvider>
                                  <OnboardingProvider>
                                    <RatePromptProvider>
                                      <MoodCheckInProvider>
                                        <NotificationsProvider>
                                          <PlanProfileProvider>
                                            <PlansProvider>
                                              <NavigationContainer>
                                                <StatusBar style="dark" />
                                                <RootNavigator />
                                                {/* Mounted inside NavigationContainer
                                                    so the View Details button can
                                                    navigate; reads its queue off
                                                    AchievementsContext, so it fires
                                                    from anywhere a counter changes. */}
                                                <AchievementUnlockSheet />
                                              </NavigationContainer>
                                            </PlansProvider>
                                          </PlanProfileProvider>
                                        </NotificationsProvider>
                                      </MoodCheckInProvider>
                                    </RatePromptProvider>
                                  </OnboardingProvider>
                                </AchievementsProvider>
                              </PlanCompletionProvider>
                            </ShareProvider>
                          </DailyVersesProvider>
                        </TranslationsProvider>
                      </ActivityProvider>
                    </ReadChaptersProvider>
                  </BookmarksProvider>
                </HighlightsProvider>
              </SavedVersesProvider>
            </NotesProvider>
          </PrayerProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
