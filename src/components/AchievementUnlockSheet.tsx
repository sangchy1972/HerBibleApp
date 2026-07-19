import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import Svg, { Polygon, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, withDelay, runOnJS,
  Easing,                       // reanimated's Easing — required for UI-thread worklets;
                                // the react-native Easing is a JS-thread function and
                                // crashes when passed into withTiming.
} from 'react-native-reanimated';
import { isInterstitialVisible, onInterstitialVisibility } from '../services/interstitialVisibility';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import BadgeIcon from './BadgeIcon';
import { achievementUi, localizedAchievementName } from '../constants/achievements';
import { useAchievements } from '../state/AchievementsContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { useTranslation } from '../state/TranslationsContext';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';
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

  // Route through the nudge coordinator so a badge popup never stacks with the
  // mood sheet / login. ignoresBudget: rewards always show, and a multi-badge
  // queue drains one-by-one across successive activations.
  const coord = useNudgeCoordinator();
  useEffect(() => {
    if (visible) coord.requestSlot({ id: 'achievementUnlock', priority: NUDGE_PRIORITY.achievementUnlock, canShow: () => true, ignoresBudget: true });
    else coord.releaseSlot('achievementUnlock');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const active = coord.isActive('achievementUnlock');
  // Advance the coordinator when this popup closes, then pop the queue.
  const close = useCallback(() => { coord.notifyDismissed('achievementUnlock'); dismissAward(); }, [coord, dismissAward]);

  // Sunburst rays behind the badge — gentle continuous rotation while open.
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    spin.value = 0;
    spin.value = withRepeat(withTiming(360, { duration: 18000, easing: Easing.linear }), -1, false);
  }, [visible, spin]);
  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  // ── Ceremony entrance: the whole card pops small → big over 0.7 s ──────────
  // Shared-value driven (never layout `entering` — first-frame flash on the new
  // arch, project memory). When a fullscreen interstitial is on screen the play
  // is DEFERRED until the user closes it — otherwise the ceremony has already
  // silently finished underneath the native ad overlay.
  const show = visible && active;
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.4);
  const cardOpacity = useSharedValue(0);
  const scale = useSharedValue(0.8);           // badge's own extra bounce
  // Android/Fabric: a Reanimated-owned wrapper can leave its children's touch
  // regions stale — hand the card back to plain RN once the entrance lands
  // (same pattern as FirstRunTourHost / useTabFocusEntrance).
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!show || !current) return;
    setSettled(false);
    backdropOpacity.value = 0;
    cardOpacity.value = 0;
    cardScale.value = 0.4;
    scale.value = 0.8;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const play = () => {
      if (cancelled) return;
      backdropOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
      cardOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) });
      // 460 + 240 = 0.7 s total: overshoot then settle.
      cardScale.value = withSequence(
        withTiming(1.05, { duration: 460, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 240, easing: Easing.inOut(Easing.quad) }, (fin) => {
          if (fin) runOnJS(setSettled)(true);
        }),
      );
      // Badge pop rides on top of the card growth, slightly offset.
      scale.value = withDelay(320, withSequence(
        withTiming(1.06, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
      ));
      // runOnJS callbacks can be dropped under load — never leave the buttons
      // inside a Reanimated-owned subtree forever.
      watchdog = setTimeout(() => { if (!cancelled) setSettled(true); }, 1000);
    };
    if (isInterstitialVisible()) {
      unsub = onInterstitialVisibility(v => {
        if (!v) { unsub?.(); unsub = null; setTimeout(play, 150); }
      });
    } else {
      play();
    }
    return () => {
      cancelled = true;
      unsub?.();
      if (watchdog) clearTimeout(watchdog);
    };
    // Re-plays per badge as a multi-badge queue drains.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, current?.id]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  const SETTLED = { opacity: 1 } as const;
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Stable navigation ref so the View Details button can navigate even after
  // the popup unmounts.
  const navRef = useRef(navigation);
  useEffect(() => { navRef.current = navigation; }, [navigation]);

  if (!current) return null;

  const onViewDetails = () => {
    close();
    // Defer to next frame so the modal can finish closing animation.
    setTimeout(() => {
      try { navRef.current.navigate('Achievement'); } catch { /* navigator may not yet have the route mounted */ }
    }, 80);
  };

  // The badge name inside the earned line renders rose + bold: build the line
  // around a sentinel so the split works for every language's word order.
  const badgeName = localizedAchievementName(current, translation.code);
  const descParts = ui.earnedDescription('\u0000').split('\u0000');

  return (
    <Modal transparent visible={visible && active} animationType="none" onRequestClose={close}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <TouchableOpacity activeOpacity={1} onPress={close} style={StyleSheet.absoluteFillObject} />
      </Animated.View>

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={[styles.card, settled ? SETTLED : cardStyle]}>
          {/* CONGRATS — title at the very top, in Lora (per user). */}
          <Text style={styles.congratsTitle}>{ui.congrats}</Text>

          {/* Badge with the rotating sunburst centered behind it. */}
          <View style={styles.badgeArea}>
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
          </View>

          <Text style={styles.subtitle}>
            {descParts.map((part, i) => (
              <React.Fragment key={i}>
                {part}
                {i < descParts.length - 1 && <Text style={styles.subtitleName}>{badgeName}</Text>}
              </React.Fragment>
            ))}
          </Text>

          <TouchableOpacity onPress={close} activeOpacity={0.85} style={styles.okBtn}>
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

// 8-spoke peach sunburst behind the badge. Each ray is a trapezoid that
// widens from inside (narrow, near the badge) to outside (wide, at the rim);
// a single radial gradient fades opacity from solid near the center to fully
// transparent at the edge so the rays bleed off into the card background.
// Per user: 12 → 8 rays, each widened, and ~30% more transparent.
function Sunburst() {
  const W = 280;
  const center = W / 2;
  const innerR = 26;
  const outerR = W / 2 - 4;
  const halfIn = 6;      // 4 → 6 (wider — fewer rays, so each is broader)
  const halfOut = 33;    // 22 → 33 (wider)
  const rays: number[] = [];
  for (let i = 0; i < 8; i++) rays.push(i * 45);
  return (
    <Svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
      <Defs>
        <RadialGradient id="rayFade" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F8B68C" stopOpacity={0.49} />
          <Stop offset="55%" stopColor="#F8B68C" stopOpacity={0.245} />
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
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
    overflow: 'hidden',
  },
  // CONGRATS — title at the top of the card, in Lora (per user).
  congratsTitle: {
    fontSize: 26,
    fontFamily: FONTS.loraBold,
    fontWeight: '600',                                                           // loraBold pairs with 600 (700 drops Lora on Android)
    color: ROSE,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 6,
    // The 280-px sunburst overflows the 150-px badgeArea upward into the title's
    // row; badgeArea is a LATER sibling so by default its rays paint OVER this
    // title. Lift the title above the rays (zIndex + Android elevation).
    zIndex: 2,
    elevation: 2,
  },
  // Relative box holding the badge with the sunburst centered behind it.
  // Kept BELOW the title in paint order so the overflowing rays sit behind it.
  badgeArea: {
    width: '100%',
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    zIndex: 1,
  },
  raysWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: { alignItems: 'center', justifyContent: 'center' },
  subtitle: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: FONTS.lora,                                                      // Lora (per user)
    color: TXT,
    paddingHorizontal: 8,
    lineHeight: 25,
    // The 280-px sunburst overflows badgeArea (zIndex 1) downward into this
    // line's row — lift the text above the rays, same as the title.
    zIndex: 2,
    elevation: 2,
  },
  // The badge's name inside the earned line — rose + bold (per user).
  subtitleName: { color: ROSE, fontFamily: FONTS.loraBold, fontWeight: '600' },
  okBtn: {
    marginTop: 22,
    backgroundColor: ROSE,
    borderRadius: 16,                                                            // 32 → 16 (-50 % per user)
    paddingVertical: 13.12,                                                      // 16 → 13.12 (-18 % height per user)
    paddingHorizontal: 80,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: ROSE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  okText: { color: '#fff', fontSize: 20.7, fontWeight: '700', letterSpacing: 0.5 },   // 18 → 20.7 (+15 % per user)
  detailsBtn: { marginTop: 14, paddingVertical: 6 },
  detailsText: { color: TXTSUB, fontSize: 15, textDecorationLine: 'underline' },
});
