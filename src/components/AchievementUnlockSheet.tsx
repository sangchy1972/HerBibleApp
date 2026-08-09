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
// Halved speed (per user): 400/600/700 → 800/1200/1400, so the full reveal runs
// 3.4 s instead of 1.7 s and reads as a ceremony rather than a flash.
const RISE_MS = 800;
const BADGE_MS = 1200;
const RAYS_MS = 1400;
const RAYS_DELAY = RISE_MS + BADGE_MS;   // rays only once the badge is fully up


// The same translucent grey pill the save-verse and notes confirmations use.
// Absolutely positioned at app root with pointerEvents="none", so it floats over
// whatever screen she lands on and can never intercept a tap.
function SavedToast({ label, bottom }: { label: string; bottom: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withTiming(1, { duration: 200 });
    return () => { cancelAnimation(o); };
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (1 - o.value) * 8 }] }));
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[styles.toast, { bottom }, st]}>
        <Text style={styles.toastText}>{label}</Text>
      </Animated.View>
    </View>
  );
}

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
  const active = coord.isActive('achievementUnlock');
  // `active` is in the deps for the MULTI-BADGE queue. close() calls
  // notifyDismissed, which drops the request; if another badge is still queued
  // `visible` never changes, so a [visible]-only effect would not re-register
  // and the second badge would never appear. Re-requesting whenever the grant is
  // lost while still visible is what drains the queue one-by-one.
  useEffect(() => {
    if (visible) coord.requestSlot({ id: 'achievementUnlock', priority: NUDGE_PRIORITY.achievementUnlock, canShow: () => true, ignoresBudget: true });
    else coord.releaseSlot('achievementUnlock');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, active]);
  const close = useCallback(() => { coord.notifyDismissed('achievementUnlock'); dismissAward(); }, [coord, dismissAward]);

  // Collect closes the screen — which left a brand-new user with no idea the
  // badge was kept anywhere. A short toast names the destination. It lives in
  // the HOST's tree, not inside the Modal, because the Modal unmounts on the
  // same tap; the host is app-root-mounted and stays.
  const [savedToast, setSavedToast] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
  const onCollect = useCallback(() => {
    setSavedToast(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedToast(false), 2200);
    close();
  }, [close]);

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
    // Watchdog — the only Modal-hosted entrance in the app that lacked one, and
    // the worst one to lack it: this Modal is NOT `transparent`, so RN gives it a
    // white container. A dropped `rise` therefore means a WHITE screen with
    // opacity 0 content — nothing visible, nothing hit-testable, and iOS does not
    // call onRequestClose for it. Force it into place instead.
    const wd = setTimeout(() => { rise.value = 1; badge.value = 1; rays.value = 1; }, RAYS_DELAY + RAYS_MS + 400);
    return () => clearTimeout(wd);
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

  // Not `if (!current) return null` any more: the confirmation toast has to
  // survive the badge being dequeued.
  if (!current) {
    return savedToast ? <SavedToast label={t('achievement.savedToast')} bottom={insets.bottom + 90} /> : null;
  }

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
        {/* Pink pulled 50 % lighter (per user): each stop moved half-way to white
            — #FFF6FA → #FFFBFD, #FBE3EE → #FDF1F6. */}
        <LinearGradient colors={['#FFFBFD', '#FDF1F6']} style={StyleSheet.absoluteFillObject} />
        {/* +20 px at both ends (per user) — the headline sat on the status bar and
            the Collect button on the gesture bar. */}
        <View style={[styles.root, { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 36 }]}>
          {/* Title only — no back button (per user). */}
          <Text style={styles.headerTitle}>{ui.congratsTitle}</Text>

          <View style={styles.center}>
            <Animated.View style={badgeStyle}>
              <BadgeCardArt
                {...cardProps}
                width={CARD_W}
                // The card owns the geometry and hands back the size to fill —
                // that is what keeps the rays' centre exactly on the badge's.
                glow={(size) => (
                  <Animated.View style={raysStyle} pointerEvents="none">
                    <BadgeRays size={size} />
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

          <TouchableOpacity onPress={onCollect} activeOpacity={0.9} style={styles.collectBtn}>
            <Text style={styles.collectText}>{ui.collect}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Off-screen full-resolution copy of the card — the capture source. */}
      <View style={styles.offscreen} pointerEvents="none">
        {/* WHITE BACKING, and it is not cosmetic: we export JPEG, which has no
            alpha channel, so the card's rounded corners — transparent in the
            view — flattened to BLACK in the shared image. Backing the capture
            with an opaque colour makes those corners white instead. (Keeping
            JPEG on purpose: PNG triples the file size for a photo-like card,
            and several social targets recompress or mishandle PNG anyway.) */}
        <ViewShot
          ref={shotRef}
          options={{ format: CAPTURE_FORMAT, quality: CAPTURE_QUALITY, result: 'tmpfile' }}
          style={[styles.captureHost, { width: CAPTURE_W }]}
        >
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
  // Opaque backing for the JPEG export — see the note at the capture host.
  captureHost: { backgroundColor: '#FFFFFF' },
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
