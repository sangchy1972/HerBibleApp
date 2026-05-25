import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTabFocusEntrance } from './useTabFocusEntrance';

// One animated block inside a tab screen. Stagger several of these with
// increasing `delay` to make the screen lift into place in waves —
// `<TabSection delay={0}>` for the hero, `<TabSection delay={120}>` for the
// next block, and so on. Each section runs the slide-up + fade entrance on
// every focus, not just on mount, so coming back to the tab always feels
// fresh.
export default function TabSection({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const animStyle = useTabFocusEntrance(delay);
  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}
