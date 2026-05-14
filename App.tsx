import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { RobotoSerif_400Regular, RobotoSerif_600SemiBold } from '@expo-google-fonts/roboto-serif';
import { NotoSansSC_400Regular, NotoSansSC_500Medium, NotoSansSC_700Bold } from '@expo-google-fonts/noto-sans-sc';
import { Inter_400Regular } from '@expo-google-fonts/inter';
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
    RobotoSerif_400Regular,
    RobotoSerif_600SemiBold,
    NotoSansSC_400Regular,
    NotoSansSC_500Medium,
    NotoSansSC_700Bold,
    Inter_400Regular,
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
