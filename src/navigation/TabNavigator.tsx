import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import PrayerScreen from '../screens/PrayerScreen';
import BibleScreen from '../screens/BibleScreen';
import PlanScreen from '../screens/PlanScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TabBar from '../components/shared/TabBar';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      // animation 'none' — the per-screen `useTabFocusEntrance` hook owns the
      // tab-switch animation (slide-up + fade, 600 ms). The default
      // bottom-tabs animation would compete with that and cause double
      // motion.
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Tab.Screen name="prayer" component={PrayerScreen} />
      <Tab.Screen name="bible" component={BibleScreen} />
      <Tab.Screen name="plan" component={PlanScreen} />
      <Tab.Screen name="profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
