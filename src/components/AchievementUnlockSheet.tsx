import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import Svg, { Polygon, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  Easing,                       // reanimated's Easing — required for UI-thread worklets;
                                // the react-native Easing is a JS-thread function and
                                // crashes when passed into withTiming.
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import BadgeIcon from './BadgeIcon';
import { achievementUi, localizedAchievementName } from '../constants/achievements';
import { useAchievements } from '../state/AchievementsContext';
import { useTranslation } from '../state/TranslationsContext';
import { ROSE, TXT, TXTSUB } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

// Single source of truth for the new-badge popup. Mounted once at the app
// root (next to the navigation container) so it can fire from inside any
// screen — the queue is read off the AchievementsContext.

export default function AchievementUnlockSheet() {
  const { awardQueue, dismissAward } = useAchievements();
  const { current: translation } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const ui = achievementUi(translation.code);

  const visible = awardQueue.length > 0;
  const current = awardQueue[0];

  // Sunburst rays behind the badge — gentle continuous rotation while open.
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    spin.value = 0;
    spin.value = withRepeat(withTiming(360, { duration: 18000, easing: Easing.linear }), -1, false);
  }, [visible, spin]);
  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  // Subtle bounce-in on the badge itself.
  const scale = useSharedValue(0.8);
  useEffect(() => {
    if (!visible) return;
    scale.value = 0.8;
    scale.value = withSequence(
      withTiming(1.06, { duration: 280, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
    );
  }, [visible, scale]);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Stable navigation ref so the View Details button can navigate even after
  // the popup unmounts.
  const navRef = useRef(navigation);
  useEffect(() => { navRef.current = navigation; }, [navigation]);

  if (!current) return null;

  const onViewDetails = () => {
    dismissAward();
    // Defer to next frame so the modal can finish closing animation.
    setTimeout(() => {
      try { navRef.current.navigate('Achievement'); } catch { /* navigator may not yet have the route mounted */ }
    }, 80);
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={dismissAward}>
      <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.backdrop}>
        <TouchableOpacity activeOpacity={1} onPress={dismissAward} style={StyleSheet.absoluteFillObject} />
      </Animated.View>

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View
          entering={FadeIn.duration(260).delay(80)}
          exiting={FadeOut.duration(160)}
          style={styles.card}
        >
          {/* Sunburst rays */}
          <View style={styles.raysWrap} pointerEvents="none">
            <Animated.View style={raysStyle}>
              <Sunburst />
            </Animated.View>
          </View>

          <Animated.View style={[styles.badgeWrap, badgeStyle]}>
            <BadgeIcon
              id={current.id}
              iconKey={current.iconKey}
              rarity={current.rarity}
              size={120}
              label={null}
            />
          </Animated.View>

          <View style={styles.flourishRow}>
            <View style={styles.fl} />
            <Text style={styles.diamond}>✦</Text>
            <Text style={styles.congrats}>{ui.congrats}</Text>
            <Text style={styles.diamond}>✦</Text>
            <View style={styles.fl} />
          </View>

          <Text style={styles.subtitle}>
            {ui.earnedDescription(localizedAchievementName(current, translation.code))}
          </Text>

          <TouchableOpacity onPress={dismissAward} activeOpacity={0.85} style={styles.okBtn}>
            <Text style={styles.okText}>{ui.ok}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onViewDetails} activeOpacity={0.7} style={styles.detailsBtn}>
            <Text style={styles.detailsText}>{ui.viewDetails}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// 12-spoke peach sunburst behind the badge. Each ray is a trapezoid that
// widens from inside (narrow, near the badge) to outside (wide, at the rim);
// a single radial gradient fades opacity from solid near the center to fully
// transparent at the edge so the rays bleed off into the card background.
function Sunburst() {
  const W = 280;
  const center = W / 2;
  const innerR = 26;
  const outerR = W / 2 - 4;
  const halfIn = 4;
  const halfOut = 22;
  const rays: number[] = [];
  for (let i = 0; i < 12; i++) rays.push(i * 30);
  return (
    <Svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
      <Defs>
        <RadialGradient id="rayFade" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F8B68C" stopOpacity={0.7} />
          <Stop offset="55%" stopColor="#F8B68C" stopOpacity={0.35} />
          <Stop offset="100%" stopColor="#F8B68C" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {rays.map(angle => {
        const rad = (angle * Math.PI) / 180;
        const ortho = rad + Math.PI / 2;
        const ix = center + Math.cos(rad) * innerR;
        const iy = center + Math.sin(rad) * innerR;
        const ox = center + Math.cos(rad) * outerR;
        const oy = center + Math.sin(rad) * outerR;
        const i1x = ix + Math.cos(ortho) * halfIn;
        const i1y = iy + Math.sin(ortho) * halfIn;
        const i2x = ix - Math.cos(ortho) * halfIn;
        const i2y = iy - Math.sin(ortho) * halfIn;
        const o1x = ox + Math.cos(ortho) * halfOut;
        const o1y = oy + Math.sin(ortho) * halfOut;
        const o2x = ox - Math.cos(ortho) * halfOut;
        const o2y = oy - Math.sin(ortho) * halfOut;
        return (
          <Polygon
            key={angle}
            points={`${i1x},${i1y} ${o1x},${o1y} ${o2x},${o2y} ${i2x},${i2y}`}
            fill="url(#rayFade)"
          />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,16,28,0.55)' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
    overflow: 'hidden',
  },
  raysWrap: {
    position: 'absolute',
    top: -40,
    left: 0, right: 0,
    alignItems: 'center',
  },
  badgeWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  flourishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  fl: { height: 1, width: 28, backgroundColor: 'rgba(196,140,90,0.5)' },
  diamond: { color: 'rgba(196,140,90,0.7)', fontSize: 12 },
  congrats: { fontSize: 22, fontWeight: '800', color: ROSE, letterSpacing: 1.5 },
  subtitle: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 18,
    color: TXT,
    paddingHorizontal: 8,
    lineHeight: 25,
  },
  okBtn: {
    marginTop: 22,
    backgroundColor: ROSE,
    borderRadius: 32,
    paddingVertical: 16,
    paddingHorizontal: 80,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: ROSE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  okText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  detailsBtn: { marginTop: 14, paddingVertical: 6 },
  detailsText: { color: TXTSUB, fontSize: 15, textDecorationLine: 'underline' },
});
