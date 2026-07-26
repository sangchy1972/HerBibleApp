import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, cancelAnimation,
} from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { isInterstitialVisible, onInterstitialVisibility } from '../services/interstitialVisibility';
import BadgeCardArt from './BadgeCardArt';
import BadgeRays from './BadgeRays';
import { achievementUi, localizedAchievementName, localizedAchievementRule } from '../constants/achievements';
import { useAchievements } from '../state/AchievementsContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { useTranslation } from '../state/TranslationsContext';
import { useT } from '../i18n/useT';
import { logEvent } from '../services/firebase';
import { ROSE, TXT, FONTS, BTN_RADIUS } from '../constants/theme';

// Full-screen "New Achievement" unlock. Mounted once at the app root (next to
// the navigation container) so it can fire from inside any screen — the queue
// is read off AchievementsContext and drains one badge at a time.
//
// The screen slides up from the bottom (native Modal animationType="slide", so
// there is no Reanimated-owned wrapper and therefore no stale-touch-region
// risk). The centre is a single pink card (BadgeCardArt) that doubles as the
// shareable image: the card's Share button captures it at full resolution and
// hands it to the OS share sheet or saves it to the photo library — the same
// mechanism the verse share uses.

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W - 48, 400);   // on-screen card width
const CAPTURE_W = 1080;                          // exported-image width (crisp)
const CAPTURE_QUALITY = 0.92;
const CAPTURE_FORMAT = 'jpg' as const;
const CAPTURE_MIME = 'image/jpeg';

// ── Entrance choreography ────────────────────────────────────────────────────
// Three beats, each starting as the previous one lands, so the screen reads as
// one continuous reveal rather than three separate effects:
//   1. the whole screen rises from the bottom            (0 → 400 ms)
//   2. the badge card fades up from dim                  (400 → 1000 ms)
//   3. the light rays bloom in behind it and drift       (1000 → 1700 ms)
// Driven here rather than by Modal animationType="slide" because the native
// slide gives no hook to hang beats 2 and 3 off — it finishes whenever it
// finishes. The Modal itself stays a plain native window (animationType="none"),
// so this is only animating its CHILDREN: there is no Reanimated-owned wrapper
// around the modal and therefore none of the stale-touch-region risk that
// motivated the original native-slide choice.
const RISE_MS = 400;
const BADGE_MS = 600;
const RAYS_MS = 700;
const RAYS_DELAY = RISE_MS + BADGE_MS;   // rays only once the badge is fully up
/** Rays overflow the badge so the beams read as light coming from behind it. */
const RAYS_SIZE = Math.round(CARD_W * 0.78);

export default function AchievementUnlockSheet() {
  const { awardQueue, dismissAward } = useAchievements();
  const { current: translation } = useTranslation();
  const t = useT();
  const ui = achievementUi(translation.code);
  const insets = useSafeAreaInsets();

  const visible = awardQueue.length > 0;
  const current = awardQueue[0];

  // Route through the nudge coordinator so a badge unlock never stacks with the
  // mood sheet / login. ignoresBudget: rewards always show; a multi-badge queue
  // drains one-by-one across successive activations.
  const coord = useNudgeCoordinator();
  useEffect(() => {
    if (visible) coord.requestSlot({ id: 'achievementUnlock', priority: NUDGE_PRIORITY.achievementUnlock, canShow: () => true, ignoresBudget: true });
    else coord.releaseSlot('achievementUnlock');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const active = coord.isActive('achievementUnlock');
  const close = useCallback(() => { coord.notifyDismissed('achievementUnlock'); dismissAward(); }, [coord, dismissAward]);

  // Defer opening until any fullscreen interstitial ad has closed — otherwise
  // the slide-up would play hidden underneath the native ad overlay.
  const [adUp, setAdUp] = useState(isInterstitialVisible());
  useEffect(() => onInterstitialVisibility(setAdUp), []);
  const show = visible && active && !adUp;

  // ── Entrance ───────────────────────────────────────────────────────────────
  const rise = useSharedValue(0);    // 0 = off-screen bottom, 1 = settled
  const badge = useSharedValue(0);   // badge card dim → bright
  const rays = useSharedValue(0);    // light rays bloom
  useEffect(() => {
    if (!show) {
      // Reset immediately (not animated) — the modal is gone, and the next
      // badge in the queue must start from the beginning, not mid-sequence.
      cancelAnimation(rise); cancelAnimation(badge); cancelAnimation(rays);
      rise.value = 0; badge.value = 0; rays.value = 0;
      return;
    }
    rise.value = withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) });
    badge.value = withDelay(RISE_MS, withTiming(1, { duration: BADGE_MS, easing: Easing.out(Easing.quad) }));
    rays.value = withDelay(RAYS_DELAY, withTiming(1, { duration: RAYS_MS, easing: Easing.inOut(Easing.quad) }));
  }, [show, rise, badge, rays]);

  const riseStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - rise.value) * SCREEN_H }],
    opacity: rise.value,
  }));
  // Fades AND lifts slightly — a pure opacity fade on a static card reads as a
  // rendering glitch rather than an arrival.
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.94 + badge.value * 0.06 }],
  }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: rays.value }));

  // ── Share / save (mirrors ShareVerseSheet) ────────────────────────────────
  const shotRef = useRef<ViewShot | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const captureCard = useCallback(async (): Promise<string> => {
    const node = shotRef.current;
    if (!node) throw new Error('card not ready');
    const uri = await captureRef(node, { format: CAPTURE_FORMAT, quality: CAPTURE_QUALITY, result: 'tmpfile' });
    return uri.startsWith('file://') ? uri : `file://${uri}`;
  }, []);

  const shareSystem = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await captureCard();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url, { mimeType: CAPTURE_MIME, dialogTitle: current ? localizedAchievementName(current, translation.code) : undefined });
        if (current) logEvent('share', { content_type: 'achievement', item_id: current.id, method: 'system' });
      }
    } catch { /* user cancelled / capture failed — silent */ }
    finally { setBusy(false); setShareOpen(false); }
  }, [busy, captureCard, current, translation.code]);

  const saveToGallery = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await captureCard();
      // No explicit permission request: saveToLibraryAsync writes via Android
      // MediaStore (no READ needed) and triggers the iOS add-only prompt backed
      // by the expo-media-library strings already in app.json.
      await MediaLibrary.saveToLibraryAsync(url);
      if (current) logEvent('share', { content_type: 'achievement', item_id: current.id, method: 'save' });
      setShareOpen(false);
      showToast(t('shareVerse.saveAlert.title'));
    } catch { setShareOpen(false); }
    finally { setBusy(false); }
  }, [busy, captureCard, current, translation.code, showToast, t]);

  if (!current) return null;

  const name = localizedAchievementName(current, translation.code);
  const description = localizedAchievementRule(current, translation.code);
  const cardProps = {
    badgeId: current.id,
    iconKey: current.iconKey,
    rarity: current.rarity,
    name,
    description,
    newAchievementLabel: ui.newAchievement,
  };

  return (
    <Modal visible={show} animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFillObject, riseStyle]}>
        <LinearGradient colors={['#FFF6FA', '#FBE3EE']} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 }]}>
          {/* Title only — no back button (per user). */}
          <Text style={styles.headerTitle}>{ui.congratsTitle}</Text>

          <View style={styles.center}>
            <Animated.View style={badgeStyle}>
              <BadgeCardArt
                {...cardProps}
                width={CARD_W}
                glow={(
                  <Animated.View style={raysStyle} pointerEvents="none">
                    <BadgeRays size={RAYS_SIZE} />
                  </Animated.View>
                )}
              />
              {/* Share button — overlaid, so it never appears in the exported
                  image. Tapping it opens the share / save actions. */}
              <TouchableOpacity
                style={[styles.shareFab, { top: CARD_W * 0.05, right: CARD_W * 0.05 }]}
                activeOpacity={0.85}
                onPress={() => setShareOpen(true)}
                hitSlop={12}
              >
                <Feather name="share-2" size={20} color={ROSE} />
              </TouchableOpacity>
            </Animated.View>
          </View>

          <TouchableOpacity onPress={close} activeOpacity={0.9} style={styles.collectBtn}>
            <Text style={styles.collectText}>{ui.collect}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Off-screen full-resolution copy of the card — the capture source. */}
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot ref={shotRef} options={{ format: CAPTURE_FORMAT, quality: CAPTURE_QUALITY, result: 'tmpfile' }} style={{ width: CAPTURE_W }}>
          <BadgeCardArt {...cardProps} width={CAPTURE_W} />
        </ViewShot>
      </View>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 90 }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Share / save actions — slides up when the Share button is tapped
          (same idea as the verse share). The OS sheet from "Share" lists
          Facebook / Instagram / X / etc.; "Save" writes to the photo library. */}
      <Modal visible={shareOpen} transparent animationType="slide" onRequestClose={() => setShareOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setShareOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.sheetHandle} />
          <TouchableOpacity style={styles.sheetRow} activeOpacity={0.75} onPress={shareSystem} disabled={busy}>
            <Feather name="share-2" size={21} color={TXT} />
            <Text style={styles.sheetRowText}>{t('common.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetRow} activeOpacity={0.75} onPress={saveToGallery} disabled={busy}>
            <Feather name="download" size={21} color={TXT} />
            <Text style={styles.sheetRowText}>{t('shareVerse.btn.save')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  headerTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 27, color: ROSE,
    letterSpacing: 0.4, marginLeft: 4, marginTop: 4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Bare glyph — no white disc, no shadow (per user). The rose icon already has
  // enough contrast on the light-rose card, and the disc read as a stray UI chip
  // sitting on top of the artwork. hitSlop keeps the tap target full size.
  shareFab: {
    position: 'absolute',
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  collectBtn: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 4,
    shadowColor: ROSE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 5,
  },
  collectText: { color: '#FFFFFF', fontFamily: FONTS.sansBold, fontWeight: '700', fontSize: 19, letterSpacing: 0.6 },
  // Off-screen capture host — rendered but pushed far off-screen and invisible.
  offscreen: { position: 'absolute', left: -10000, top: -10000, opacity: 0 },
  toast: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(20,16,28,0.9)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 14, fontFamily: FONTS.sansBold, fontWeight: '600', letterSpacing: 0.3 },
  // Share actions bottom sheet.
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,16,28,0.4)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(30,27,46,0.16)', marginBottom: 8 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15 },
  sheetRowText: { fontSize: 17, color: TXT, fontFamily: FONTS.sansBold, fontWeight: '600', letterSpacing: 0.3 },
});
