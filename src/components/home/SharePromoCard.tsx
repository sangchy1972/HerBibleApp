import React, { useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Share, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CARD_RADIUS, FONTS, TXT } from '../../constants/theme';
import { useUILanguage } from '../../state/UILanguageContext';
import { useT } from '../../i18n/useT';
import { logEvent } from '../../services/firebase';

// "Share our app" promo card at the very bottom of the home screen (owner
// 2026-08-22, competitor-modeled): one big image, tap ANYWHERE → the system
// share sheet with a recommendation message + store link.
//
// LAYOUT IS CONSTANT BY CONSTRUCTION — the hard rule here. The card is
// aspectRatio 1 (the art is square), so its height is final at first layout
// and NEVER changes: not when the remote image lands, not when it fails
// (the fallback renders inside the same box). This is the guard against the
// "home cards eat taps" bug — Android freezes a subtree's touch regions to
// the layout that existed when the entrance animation attached, so a block
// that grows or collapses after mount puts every tap in the wrong place
// (the full mechanism lives in useTabFocusEntrance.ts).
const PACKAGE_ID = 'com.holy.bible.kjv.audio.prayer';
const PLAY_SHARE_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_ID}`;
const IMG_BASE = 'https://covers.everlandapps.com/v1/share-promo';
// Art exists in five languages; Chinese falls back to English (owner).
const IMG_LANG: Record<string, string> = { en: 'EN', es: 'ES', de: 'DE', fr: 'FR', pt: 'PT' };

// The App Store has no bundle-id link; resolve the numeric id once via
// Apple's public lookup (same approach as RatePromptSheet). Cached for the
// process; null (unpublished / timeout / offline) → share the message alone.
let appleUrlPromise: Promise<string | null> | null = null;
function appleStoreUrl(): Promise<string | null> {
  if (appleUrlPromise) return appleUrlPromise;
  appleUrlPromise = (async () => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${PACKAGE_ID}`, { signal: ctl.signal });
      const json = await res.json();
      const id = json?.results?.[0]?.trackId;
      return typeof id === 'number' ? `https://apps.apple.com/app/id${id}` : null;
    } catch {
      appleUrlPromise = null;   // a failed lookup may retry on a later tap
      return null;
    } finally { clearTimeout(to); }
  })();
  return appleUrlPromise;
}

export default function SharePromoCard() {
  const t = useT();
  const { lang } = useUILanguage();
  const [broken, setBroken] = useState(false);
  const busyRef = useRef(false);

  const suffix = IMG_LANG[lang] ?? 'EN';
  const uri = `${IMG_BASE}/ShareHerBible-${suffix}.webp`;

  const onShare = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    logEvent('share_app_tap', { src: 'home_promo' });
    try {
      const url = Platform.OS === 'android' ? PLAY_SHARE_URL : await appleStoreUrl();
      const message = t('sharePromo.message', { url: url ?? '' }).trim();
      await Share.share({ message });
    } catch { /* she dismissed the sheet or the OS refused — nothing to do */ }
    busyRef.current = false;
  };

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onShare} style={styles.card}>
      {!broken ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onError={() => setBroken(true)}
        />
      ) : (
        // Offline / CDN miss: the box keeps its exact size (no collapse — see
        // the layout rule above) and still shares on tap.
        <LinearGradient colors={['#F9D9E6', '#F4A6C0']} style={styles.fallback}>
          <Text style={styles.fallbackTitle}>{t('sharePromo.fallbackTitle')}</Text>
          <Text style={styles.fallbackBody}>{t('sharePromo.fallbackBody')}</Text>
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  fallbackTitle: {
    fontSize: 22, color: TXT, textAlign: 'center',
    fontFamily: FONTS.loraBold, fontWeight: '600',
  },
  fallbackBody: {
    marginTop: 10, fontSize: 15, lineHeight: 22, color: TXT, textAlign: 'center',
    fontFamily: FONTS.lato, opacity: 0.85,
  },
});
