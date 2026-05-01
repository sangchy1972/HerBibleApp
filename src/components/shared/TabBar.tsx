import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ROSE, LAV, TXTSUB } from '../../constants/theme';
import type { TabId } from '../../navigation/types';

// Tab icon size — bumped 10% (24 → 26) along with label and bar height.
const ICON_SIZE = 26;

function PrayerTabIcon({ active }: { active: boolean }) {
  const color = active ? ROSE : TXTSUB;
  // Per-icon override: width +15%, height +5% (relative to ICON_SIZE 26).
  return (
    <Svg width={Math.round(ICON_SIZE * 1.15)} height={Math.round(ICON_SIZE * 1.05)} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2C12 2 7 7.5 7 12.5C7 15.538 9.239 18 12 18C14.761 18 17 15.538 17 12.5C17 10.5 15.5 8.5 15.5 8.5C15.5 8.5 15 11 13 11C13 11 14 7 12 2Z" fill={color} />
      <Path d="M8 19C8 21.2 9.8 22 12 22C14.2 22 16 21.2 16 19" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function BibleTabIcon({ active }: { active: boolean }) {
  const color = active ? ROSE : TXTSUB;
  // Per-icon override: keep width, shrink height -5%.
  return (
    <Svg width={ICON_SIZE} height={Math.round(ICON_SIZE * 0.95)} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4C4 3 5 2 6 2H18C19 2 20 3 20 4V20C20 21 19 22 18 22H6C5 22 4 21 4 20V4Z" stroke={color} strokeWidth="1.6" />
      <Path d="M9 2V22" stroke={color} strokeWidth="1.6" />
      <Path d="M12 7H17M12 11H17M12 15H15" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

function PlanTabIcon({ active }: { active: boolean }) {
  const color = active ? ROSE : TXTSUB;
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={17} rx={3} stroke={color} strokeWidth="1.6" />
      <Path d="M3 9H21" stroke={color} strokeWidth="1.6" />
      <Path d="M8 2V6M16 2V6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <Path d="M7 14H10M7 18H13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Circle cx={16} cy={16} r={3.5} fill={active ? `${ROSE}33` : 'transparent'} stroke={color} strokeWidth="1.4" />
      <Path d="M15 16L16 17L17.5 15" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ProfileTabIcon({ active }: { active: boolean }) {
  const color = active ? ROSE : TXTSUB;
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth="1.6" />
      <Path d="M4 20C4 16.686 7.582 14 12 14C16.418 14 20 16.686 20 20" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

const TABS: { id: TabId; label: string; Icon: React.FC<{ active: boolean }> }[] = [
  { id: 'prayer', label: 'Prayer', Icon: PrayerTabIcon },
  { id: 'bible', label: 'Bible', Icon: BibleTabIcon },
  { id: 'plan', label: 'Plan', Icon: PlanTabIcon },
  { id: 'profile', label: 'Profile', Icon: ProfileTabIcon },
];

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const active = state.routes[state.index].name as TabId;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 11) }]}>
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => navigation.navigate(id)}
            style={styles.tab}
            activeOpacity={0.7}
          >
            <View style={{ transform: [{ scale: isActive ? 1.12 : 1 }] }}>
              <Icon active={isActive} />
            </View>
            <Text style={[styles.label, { color: isActive ? ROSE : TXTSUB, fontWeight: isActive ? '700' : '500' }]}>
              {label}
            </Text>
            {isActive && (
              <LinearGradient
                colors={[ROSE, LAV]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.activeBar}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    paddingTop: 9,        // +2 to grow the bar a touch
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,               // 3 → 4
    paddingTop: 8,        // 7 → 8
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 12,         // 11 → 12 (~+10%)
    letterSpacing: 0.3,
  },
  activeBar: {
    width: 21,            // 19 → 21 (+10%)
    height: 3,
    borderRadius: 2,
    marginTop: 2,         // 1 → 2
  },
});
