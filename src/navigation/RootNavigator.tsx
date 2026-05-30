import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import StreakScreen from '../screens/StreakScreen';
import PrayerFlow from '../screens/PrayerFlow';
import OnboardingScreen from '../screens/OnboardingScreen';
import MoodFlow from '../screens/MoodFlow';
import MoodCalendarScreen from '../screens/MoodCalendarScreen';
import RemoveAdsScreen from '../screens/RemoveAdsScreen';
import HelpCenterScreen from '../screens/HelpCenterScreen';
import HelpAnswerScreen from '../screens/HelpAnswerScreen';
import AddWidgetScreen from '../screens/AddWidgetScreen';
import AboutUsScreen from '../screens/AboutUsScreen';
import PolicyScreen from '../screens/PolicyScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import AchievementScreen from '../screens/AchievementScreen';
import ReflectionsScreen from '../screens/ReflectionsScreen';
import PastVersesScreen from '../screens/PastVersesScreen';
import FeaturedPlanDetail from '../screens/FeaturedPlanDetail';
import PlanCategoryScreen from '../screens/PlanCategoryScreen';
import PlanDayWalk from '../screens/PlanDayWalk';
// PlanDayVerses removed — verse_wall pages now live inline inside PlanDayWalk.
import PlanVerseRead from '../screens/PlanVerseRead';
import PlanDayDone from '../screens/PlanDayDone';
import FollowHimScreen from '../screens/FollowHimScreen';
import { useOnboarding } from '../state/OnboardingContext';
import { useReminderInterstitial } from '../state/ReminderInterstitialContext';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { ready, done } = useOnboarding();
  const reminder = useReminderInterstitial();
  // Gate on BOTH ready flags so we never flash the main tabs and then snap
  // to the interstitial — splash holds until we know which to show.
  if (!ready || !reminder.ready) return null;

  if (!done) return <OnboardingScreen />;

  // Returning user (day 2+), notifications still off, not yet shown today →
  // the full-screen "Follow Him" opt-in. Only Skip/Continue dismiss it
  // (markShownToday flips shouldShow false → re-render into the tabs).
  if (reminder.shouldShow) {
    return <FollowHimScreen onDone={reminder.markShownToday} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Streak" component={StreakScreen} />
      <Stack.Screen
        name="PrayerFlow"
        component={PrayerFlow}
        // 700 → 320 — modal slide was the slowest nav action; PrayerFlow now lifts in feels-instant.
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: 320 }}
      />
      <Stack.Screen
        name="MoodFlow"
        component={MoodFlow}
        // 800 → 320 — same fix applied to MoodFlow.
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: 320 }}
      />
      <Stack.Screen
        name="MoodCalendar"
        component={MoodCalendarScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="RemoveAds"
        component={RemoveAdsScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: 280 }}
      />
      <Stack.Screen
        name="HelpCenter"
        component={HelpCenterScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="HelpAnswer"
        component={HelpAnswerScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="AddWidget"
        component={AddWidgetScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: 280 }}
      />
      <Stack.Screen
        name="AboutUs"
        component={AboutUsScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="Policy"
        component={PolicyScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="Achievement"
        component={AchievementScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="Reflections"
        component={ReflectionsScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="PastVerses"
        component={PastVersesScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="FeaturedPlanDetail"
        component={FeaturedPlanDetail}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="PlanCategory"
        component={PlanCategoryScreen}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="PlanDayWalk"
        component={PlanDayWalk}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="PlanVerseRead"
        component={PlanVerseRead}
        options={{ animation: 'slide_from_right', animationDuration: 240 }}
      />
      <Stack.Screen
        name="PlanDayDone"
        component={PlanDayDone}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: 280 }}
      />
    </Stack.Navigator>
  );
}
