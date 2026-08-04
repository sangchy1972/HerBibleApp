import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking, Platform, type ImageSourcePropType } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, G } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import Constants from 'expo-constants';
import RNShare, { Social } from 'react-native-share';

// Inside Expo Go, Linking.canOpenURL is gated by Expo Go's own Info.plist /
// AndroidManifest — which doesn't declare fb / instagram / whatsapp schemes —
// so the check always returns false even when the apps are installed. We
// only run it in builds that include OUR plist + queries (dev clients, EAS,
// store builds), which is where it'll actually be correct.
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';
import ViewShot, { captureRef } from 'react-native-view-shot';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import VerseCardArt, { VERSE_FORMATS, type VerseFormat } from './VerseCardArt';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { useShare } from '../state/ShareContext';
import { logEvent } from '../services/firebase';
import { useT } from '../i18n/useT';

const FORMAT_LABEL_KEYS: Record<VerseFormat, string> = {
  square: 'shareVerse.format.square',
  portrait: 'shareVerse.format.portrait',
  story: 'shareVerse.format.story',
};

interface Props {
  reference: string;
  text: string;
  onClose: () => void;
  // Optional photo backdrop — when present, every preview + the captured
  // share image use this as the card background instead of the default
  // pink/lav gradient. Pass the prayer-bg image that was on screen so
  // the share matches what the user just saw.
  bgSource?: ImageSourcePropType;
}

const PREVIEW_W = 110;             // small width used for the in-sheet thumbnails
const FORMATS: VerseFormat[] = ['square', 'portrait', 'story'];

type AppKey = 'facebook' | 'whatsapp' | 'instagram';

// JPEG @ q=0.8 caps a 1080×1920 capture at ~800 KB and a 1080×1080 capture
// at ~400 KB — well under the user's 1.5 MB ceiling for every format.
// PNG previously hit 3–5 MB on photo-backed cards, which is what made the
// system share sheet drop on weaker phones. Re-encoding as JPG also
// matches what social apps re-encode to anyway.
const CAPTURE_QUALITY = 0.8;
const CAPTURE_FORMAT = 'jpg' as const;
const CAPTURE_MIME = 'image/jpeg';

// Friendly install-prompt copy uses these labels.

// URL scheme + store deep links for each target app. The scheme is what we
// hand to `Linking.canOpenURL` to detect installation; the store URLs are
// the install prompt fallbacks (https links work on both stores even without
// the native app installed).
const APP_CONFIG: Record<AppKey, { label: string; scheme: string; iosStore: string; playStore: string }> = {
  facebook: {
    label: 'Facebook',
    scheme: 'fb://',
    iosStore: 'https://apps.apple.com/app/id284882215',
    playStore: 'https://play.google.com/store/apps/details?id=com.facebook.katana',
  },
  whatsapp: {
    label: 'WhatsApp',
    scheme: 'whatsapp://send',
    iosStore: 'https://apps.apple.com/app/id310633997',
    playStore: 'https://play.google.com/store/apps/details?id=com.whatsapp',
  },
  instagram: {
    label: 'Instagram',
    scheme: 'instagram://app',
    iosStore: 'https://apps.apple.com/app/id389801252',
    playStore: 'https://play.google.com/store/apps/details?id=com.instagram.android',
  },
};

export default function ShareVerseSheet({ reference, text, onClose, bgSource }: Props) {
  const { recordShare } = useShare();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [selected, setSelected] = useState<VerseFormat>('square');
  const [busy, setBusy] = useState(false);
  const fullRefs = useRef<Record<VerseFormat, ViewShot | null>>({
    square: null, portrait: null, story: null,
  });

  // Swipe-down dismiss.
  const dragY = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate(e => { 'worklet'; if (e.translationY > 0) dragY.value = e.translationY; })
    .onEnd(e => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        dragY.value = withTiming(800, { duration: 280 }, f => { if (f) runOnJS(onClose)(); });
      } else {
        dragY.value = withTiming(0, { duration: 240 });
      }
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  const promptInstall = (app: AppKey) => {
    const cfg = APP_CONFIG[app];
    // Brand names ("Facebook", "WhatsApp", "Instagram") stay inline as the
    // {app} interpolation — they're proper nouns and the catalog context
    // explicitly says to keep them untranslated.
    Alert.alert(
      t('shareVerse.install.title', { app: cfg.label }),
      t('shareVerse.install.body', { app: cfg.label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('shareVerse.install.getApp'),
          onPress: () => {
            const url = Platform.OS === 'ios' ? cfg.iosStore : cfg.playStore;
            Linking.openURL(url).catch(() => {});
          },
        },
      ],
    );
  };

  // Toast for confirmations like "Saved to Photos" without taking over the
  // sheet with an Alert dialog.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Capture the selected format as a tmp JPG. Reused by every action
  // (per-app share, download, system share sheet).
  const captureCard = async (): Promise<string> => {
    const node = fullRefs.current[selected];
    if (!node) throw new Error('Card not ready');
    const uri = await captureRef(node, {
      format: CAPTURE_FORMAT,
      quality: CAPTURE_QUALITY,
      result: 'tmpfile',
    });
    return uri.startsWith('file://') ? uri : `file://${uri}`;
  };

  // Per-app share via react-native-share's `shareSingle`. This invokes the
  // platform-specific intent that opens THAT app with the image attached
  // (Android: ACTION_SEND with explicit package; iOS: app-specific URL
  // scheme + image data). Falls back to the install prompt when the app
  // isn't on the device.
  // Narrow the Social type to the non-Story variants — Facebook/Instagram
  // Stories require an `appId` in their options shape, which we don't
  // pass; pinning to the base trio lets TS pick `BaseShareSingleOptions`.
  type BaseSocial = Exclude<Social, Social.FacebookStories | Social.InstagramStories>;
  const SOCIAL_MAP: Record<AppKey, BaseSocial> = {
    facebook:  Social.Facebook,
    whatsapp:  Social.Whatsapp,
    instagram: Social.Instagram,
  };
  const shareSelected = async (app: AppKey) => {
    if (busy) return;
    const cfg = APP_CONFIG[app];

    // Detect installation before we capture — saves rendering work when
    // the user is just going to be redirected to the store. Skipped in
    // Expo Go (whose plist doesn't declare these schemes, so canOpenURL
    // always lies).
    if (!IS_EXPO_GO) {
      let installed = false;
      try { installed = await Linking.canOpenURL(cfg.scheme); } catch { installed = false; }
      if (!installed) { promptInstall(app); return; }
    }

    setBusy(true);
    try {
      const url = await captureCard();
      await RNShare.shareSingle({
        url,
        type: CAPTURE_MIME,
        social: SOCIAL_MAP[app],
      });
      recordShare();
      logEvent('share', { content_type: 'verse', item_id: reference, method: app });
    } catch (e) {
      // react-native-share emits a generic "User did not share" on cancel,
      // which isn't an error worth alerting about.
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|dismiss|did not share/i.test(msg)) return;
      // App-specific failures (e.g. Facebook's app rejects raw image
      // intents) — fall back to the system share sheet so the user can
      // still pick a destination.
      try {
        const url = await captureCard();
        await Sharing.shareAsync(url, { mimeType: CAPTURE_MIME, dialogTitle: t('shareVerse.appShare.dialogTitle', { app: cfg.label }) });
        recordShare();
        logEvent('share', { content_type: 'verse', item_id: reference, method: app });
      } catch {
        Alert.alert(t('error.couldNotShare'), msg);
      }
    } finally {
      setBusy(false);
    }
  };

  // Download — save the captured card straight to the user's photo library.
  // Requests permission the first time; remembers the grant for subsequent
  // taps. iOS surfaces the "Add to Photos" permission with the strings in
  // app.json's `NSPhotoLibraryAddUsageDescription`.
  const downloadCard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await captureCard();
      // No media permission request: saveToLibraryAsync writes the image via
      // Android MediaStore (needs NO read permission on Android 10+) and, on iOS,
      // triggers the add-only Photos prompt (NSPhotoLibraryAddUsageDescription).
      // We deliberately no longer request READ_MEDIA_IMAGES — Google Play's Photo
      // & Video Permissions policy rejects it as non-core for a Bible app (the
      // manifest entry is stripped by android.blockedPermissions in app.json).
      await MediaLibrary.saveToLibraryAsync(url);
      showToast(t('shareVerse.saveAlert.title'));
    } catch (e) {
      Alert.alert(t('error.couldNotSave'), e instanceof Error ? e.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  };

  // Generic "Share" — the system share sheet, which lists every app that
  // accepts images: Telegram, Messages, Mail, Drive, ad infinitum. The
  // three per-app buttons above are shortcuts for the most common targets;
  // this one is the catch-all for everything else.
  const shareMore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await captureCard();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(t('shareVerse.alert.shareUnavail.title'), t('shareVerse.alert.shareUnavail.body'));
        return;
      }
      await Sharing.shareAsync(url, { mimeType: CAPTURE_MIME, dialogTitle: t('shareVerse.share.dialogTitle') });
      recordShare();
      logEvent('share', { content_type: 'verse', item_id: reference, method: 'system' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|dismiss/i.test(msg)) return;
      Alert.alert(t('error.couldNotShare'), msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          entering={SlideInDown.duration(360).easing(Easing.out(Easing.cubic))}
          style={[styles.sheet, sheetStyle, { paddingBottom: insets.bottom + 8 }]}
        >{/* +22 → +8 — chops ~14 px of empty space below the button row (user said ~30 px total below is plenty) */}
          <View style={styles.handle} />
          <Text style={styles.title}>{t('shareVerse.title')}</Text>
          <Text style={styles.desc}>{t('shareVerse.desc')}</Text>

          <View style={styles.previewRow}>
            {FORMATS.map(fmt => {
              const meta = VERSE_FORMATS[fmt];
              const previewH = (PREVIEW_W * meta.h) / meta.w;
              const isSelected = selected === fmt;
              return (
                <TouchableOpacity
                  key={fmt}
                  onPress={() => setSelected(fmt)}
                  activeOpacity={0.85}
                  style={styles.previewItem}
                >
                  <View style={[
                    styles.previewFrame,
                    { width: PREVIEW_W, height: previewH },
                    isSelected && styles.previewFrameSelected,
                  ]}>
                    <VerseCardArt format={fmt} reference={reference} text={text} width={PREVIEW_W} bgSource={bgSource} />
                    {isSelected && (
                      <View style={styles.previewCheck}>
                        <Svg width={14} height={14} viewBox="0 0 24 24">
                          <Path d="M5 12 L10 17 L19 7" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </Svg>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.previewLabel, isSelected && { color: ROSE }]}>{t(FORMAT_LABEL_KEYS[fmt])}</Text>
                  <Text style={styles.previewRatio}>{meta.ratio}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.appRow}>
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={ROSE} />
                <Text style={styles.busyText}>Preparing…</Text>
              </View>
            ) : (
              <>
                <AppButton label="Facebook"  brand="#1877F2" onPress={() => shareSelected('facebook')}  glyph={<FacebookGlyph />} />
                <AppButton label="WhatsApp"  brand="#25D366" onPress={() => shareSelected('whatsapp')}  glyph={<WhatsAppGlyph />} />
                <AppButton label="Instagram" brand="#E1306C" onPress={() => shareSelected('instagram')} glyph={<InstagramGlyph />} />
                <AppButton label="Download"  brand="rgba(30,27,46,0.85)" onPress={downloadCard} glyph={<Feather name="download" size={20} color="#fff" />} />
                <AppButton label="Share"     brand={ROSE} onPress={shareMore} glyph={<Feather name="share" size={20} color="#fff" />} />
              </>
            )}
          </View>

          {/* Off-screen full-resolution canvases — captured on demand.
              Capture options match the runtime capture (JPG @ 0.8) so the
              ViewShot tree doesn't pre-allocate a PNG buffer we won't use. */}
          <View style={styles.offscreen} pointerEvents="none">
            {FORMATS.map(fmt => {
              const meta = VERSE_FORMATS[fmt];
              return (
                <ViewShot
                  key={fmt}
                  ref={r => { fullRefs.current[fmt] = r; }}
                  options={{ format: CAPTURE_FORMAT, quality: CAPTURE_QUALITY, result: 'tmpfile' }}
                  // Opaque backing: JPEG has no alpha, so any transparent pixel
                  // (a rounded corner, an image that fails to load) flattens to
                  // BLACK in the shared file. Same fix as the badge card.
                  style={{ width: meta.w, height: meta.h, backgroundColor: '#FFFFFF' }}
                >
                  <VerseCardArt format={fmt} reference={reference} text={text} width={meta.w} bgSource={bgSource} />
                </ViewShot>
              );
            })}
          </View>

          {toast && (
            <Animated.View entering={FadeIn.duration(160)} style={styles.toast}>
              <Text style={styles.toastText}>{toast}</Text>
            </Animated.View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function AppButton({ label, brand, glyph, onPress }: { label: string; brand: string; glyph: React.ReactNode; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.appBtn}>
      <View style={[styles.appGlyph, { backgroundColor: brand }]}>{glyph}</View>
      <Text style={styles.appLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function FacebookGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path fill="#FFFFFF" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987H7.898V12h2.54V9.797c0-2.506 1.493-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46H15.19c-1.243 0-1.628.771-1.628 1.562V12h2.773l-.443 2.891h-2.33v6.987C18.343 21.128 22 16.991 22 12z" />
    </Svg>
  );
}

function WhatsAppGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path fill="#FFFFFF" d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.595 5.404l-.999 3.648 3.893-.751zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </Svg>
  );
}

function InstagramGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <G fill="#FFFFFF">
        <Path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0z" />
        <Path d="M12 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
        <Path d="M18.406 4.155a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 200 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: P + 4,
    paddingTop: 14,
  },
  handle: {
    width: 40, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center', marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: '700', color: TXT, textAlign: 'center', marginBottom: 6 },     // +10%
  desc: { fontSize: 14, color: TXTSUB, textAlign: 'center', lineHeight: 21, marginBottom: 22 },     // +10%
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  previewItem: { alignItems: 'center', gap: 6 },
  previewFrame: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',          // no outline by default
  },
  previewFrameSelected: {
    borderColor: ROSE,                   // rose ring is the only thing marking the chosen one
  },
  previewCheck: {
    position: 'absolute',
    top: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  previewLabel: { fontSize: 14, fontWeight: '700', color: TXT, marginTop: 4 },     // +10%
  previewRatio: { fontSize: 12, color: TXTSUB, fontWeight: '600' },                 // +10%
  // App-button row. `marginHorizontal: -10` extends the row 10 px wider
  // than the rest of the sheet content on each side — the user found the
  // default sheet padding too tight around these 5 buttons. minHeight
  // dropped from 78 → 62 and padding tightened so the row stops
  // hogging vertical space.
  appRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 0,
    marginHorizontal: -10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,27,46,0.06)',
    minHeight: 62,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  busyText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },                    // +10%
  appBtn: { alignItems: 'center', gap: 6, paddingVertical: 8, flex: 1, paddingHorizontal: 1 },
  appGlyph: {
    width: 42, height: 42, borderRadius: 21,                                       // 44 → 42 — 5 buttons in the row need tighter glyphs to fit "Download" + "Instagram" on small phones without truncation
    alignItems: 'center', justifyContent: 'center',
  },
  appLabel: { fontSize: 11.5, fontWeight: '600', color: TXT },                     // 12.5 → 11.5 — keeps every label single-line in a 5-button row
  // Mounted but completely off-screen — kept in the tree so view-shot can capture them.
  offscreen: { position: 'absolute', left: -10000, top: -10000, opacity: 0 },

  // Toast pinned to the bottom of the sheet for action confirmations.
  toast: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,27,46,0.92)',
    borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
