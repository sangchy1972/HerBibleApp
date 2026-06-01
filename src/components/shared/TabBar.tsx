import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ROSE, LAV, TXTSUB } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import type { TabId } from '../../navigation/types';

function PrayerTabIcon({ active }: { active: boolean }) {
  const color = active ? ROSE : TXTSUB;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2C12 2 7 7.5 7 12.5C7 15.538 9.239 18 12 18C14.761 18 17 15.538 17 12.5C17 10.5 15.5 8.5 15.5 8.5C15.5 8.5 15 11 13 11C13 11 14 7 12 2Z" fill={color} />
      <Path d="M8 19C8 21.2 9.8 22 12 22C14.2 22 16 21.2 16 19" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function BibleTabIcon({ active }: { active: boolean }) {
  const color = active ? ROSE : TXTSUB;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4C4 3 5 2 6 2H18C19 2 20 3 20 4V20C20 21 19 22 18 22H6C5 22 4 21 4 20V4Z" stroke={color} strokeWidth="1.6" />
      <Path d="M9 2V22" stroke={color} strokeWidth="1.6" />
      <Path d="M12 7H17M12 11H17M12 15H15" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

function PlanTabIcon({ active }: { active: boolean }) {
  const color = active ? ROSE : TXTSUB;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
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
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth="1.6" />
      <Path d="M4 20C4 16.686 7.582 14 12 14C16.418 14 20 16.686 20 20" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

// Labels resolved at render time so they react to the UI language toggle.
const TABS: { id: TabId; labelKey: string; Icon: React.FC<{ active: boolean }> }[] = [
  { id: 'prayer',  labelKey: 'nav.tab.prayer',  Icon: PrayerTabIcon  },
  { id: 'bible',   labelKey: 'nav.tab.bible',   Icon: BibleTabIcon   },
  { id: 'plan',    labelKey: 'nav.tab.plan',    Icon: PlanTabIcon    },
  { id: 'profile', labelKey: 'nav.tab.profile', Icon: ProfileTabIcon },
];

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const active = state.routes[state.index].name as TabId;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 11) }]}>
      {TABS.map(({ id, labelKey, Icon }) => {
        const label = t(labelKey);
        const isActive = id === active;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => navigation.navigate(id)}
            style={styles.tab}
            activeOpacity={0.7}
          >
            {/* Fixed-size icon slot decouples per-icon SVG dimensions
                (prayer is 30×27, bible 26×25, etc.) from the row's layout.
                The 1.12 scale on active is a visual-only transform, so it
                doesn't bleed into measured height. */}
            <View style={styles.iconSlot}>
              <View style={{ transform: [{ scale: isActive ? 1.12 : 1 }] }}>
                <Icon active={isActive} />
              </View>
            </View>
            <Text
              style={[styles.label, { color: isActive ? ROSE : TXTSUB, fontWeight: isActive ? '700' : '500' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {label}
            </Text>
            {/* The bar is always rendered; opacity hides it on inactive
                tabs. Conditional render previously left the inactive tabs
                5 px shorter, so the bar height changed when switching. */}
            <LinearGradient
              colors={[ROSE, LAV]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.activeBar, !isActive && { opacity: 0 }]}
            />
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
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  // Fixed-size icon container so per-icon SVG dimensions don't shift row
  // layout. 30 covers the tallest icon (prayer 27 + the 1.12 active scale).
  iconSlot: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,                          // +10 % per user (was 10)
    letterSpacing: 0.3,
    // Fill the cell width + shrink-to-fit on one line so long translations
    // (es "Oración" / pt "Oração" / de "Profil") never wrap or overflow —
    // adjustsFontSizeToFit on the Text scales them down only when needed.
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  activeBar: {
    width: 18,
    height: 2.5,
    borderRadius: 2,
    marginTop: 1,
  },
});
