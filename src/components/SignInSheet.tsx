import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform, Pressable, ActivityIndicator } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import Animated, { FadeIn, SlideInDown, Easing, useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { isConfigured } from '../constants/oauth';
import { useAuth } from '../state/AuthContext';
import { googleAuthAvailable, facebookAuthAvailable, warmupGoogleSignIn } from '../services/firebaseAuth';
import { useT } from '../i18n/useT';

interface Props {
  onClose: () => void;
  onError?: (msg: string) => void;
}

type Provider = 'apple' | 'google' | 'facebook';

export default function SignInSheet({ onClose, onError }: Props) {
  const { signIn, signInWithGoogle, signInWithFacebook } = useAuth();
  const t = useT();
  // Which provider is mid-flight. Drives the in-button spinner AND disables
  // every provider row so a slow native picker can't be double-fired.
  const [busy, setBusy] = useState<Provider | null>(null);

  // Pre-warm Google's native stack the moment the sheet opens — configure +
  // Play Services check happen while the user reads the sheet, instead of
  // being paid inside the button tap (was a multi-second silent stall).
  useEffect(() => { warmupGoogleSignIn(); }, []);

  // Google + Facebook both go through Firebase Authentication via native SDKs
  // (Google account picker / Facebook login dialog → Firebase credential →
  // stable uid + email). See onGoogle / onFacebook below.

  const onGoogle = async () => {
    if (busy) return;
    if (!googleAuthAvailable()) {
      // Native module not compiled into this build yet (e.g. an old dev client).
      // A fresh build with @react-native-firebase/auth + google-signin enables it.
      onError?.('Google sign-in is unavailable in this build.');
      return;
    }
    setBusy('google');
    try {
      await signInWithGoogle();
      onClose();   // signed into Firebase → close the sheet
    } catch (e: any) {
      if (e?.message === 'CANCELLED') return;   // user dismissed the picker — stay silent
      onError?.('Google sign-in failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const onFacebook = async () => {
    if (busy) return;
    if (!facebookAuthAvailable()) {
      // Native module not compiled into this build yet, or Firebase auth absent.
      onError?.('Facebook sign-in is unavailable in this build.');
      return;
    }
    setBusy('facebook');
    try {
      await signInWithFacebook();
      onClose();   // signed into Firebase → close the sheet
    } catch (e: any) {
      if (e?.message === 'CANCELLED') return;   // user dismissed the dialog — stay silent
      onError?.('Facebook sign-in failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  // Apple is iOS-only. fullName + email come back ONLY on the very first
  // sign-in for a given Apple ID + bundle pair — re-signs return only the
  // stable user identifier. We handle that by falling back to the email
  // prefix for the display name on subsequent sign-ins. Cancel is silent.
  const onApple = async () => {
    if (busy) return;
    if (!isConfigured.apple()) {
      onError?.(t('signIn.error.appleIOSOnly'));
      return;
    }
    setBusy('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const email = credential.email ?? `${credential.user}@privaterelay.appleid.com`;
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const name = fullName || email.split('@')[0];
      signIn({ name, email });
      onClose();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED') return;          // user dismissed — no toast
      onError?.(t('signIn.error.appleFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.overlay}>
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[StyleSheet.absoluteFillObject, styles.backdrop]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      {/* Inline (fresh) SlideInDown builder per render — NOT a shared
          module-level instance. A reused builder fails to replay on
          remount, leaving the sheet off-screen under the backdrop on
          alternate opens (the bug fixed in ProfileScreen). */}
      <Animated.View entering={SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic))} style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('signIn.sheet.title')}</Text>
        <Text style={styles.desc}>{t('signIn.sub')}</Text>

        {Platform.OS === 'ios' && (
          // Apple HIG requires Sign in with Apple to sit at-or-above any
          // other social sign-in option, so it leads the stack on iOS.
          <ProviderButton
            onPress={onApple}
            style={[styles.providerBtn, styles.providerBtnApple]}
            busy={busy === 'apple'}
            disabled={busy !== null}
            spinnerColor="#fff"
            glyph={<AppleGlyph />}
          >
            <Text style={[styles.providerText, { color: '#fff' }]}>{t('signIn.apple')}</Text>
          </ProviderButton>
        )}

        <ProviderButton
          onPress={onGoogle}
          style={styles.providerBtn}
          busy={busy === 'google'}
          disabled={busy !== null}
          spinnerColor={ROSE}
          glyph={<GoogleGlyph />}
        >
          <Text style={styles.providerText}>{t('signIn.google')}</Text>
        </ProviderButton>

        <ProviderButton
          onPress={onFacebook}
          style={[styles.providerBtn, styles.providerBtnFb]}
          busy={busy === 'facebook'}
          disabled={busy !== null}
          spinnerColor="#fff"
          glyph={<FacebookGlyph />}
        >
          <Text style={[styles.providerText, { color: '#fff' }]}>{t('signIn.facebook')}</Text>
        </ProviderButton>

        <LegalText
          template={t('signIn.legal')}
          termsLabel={t('signIn.legal.terms')}
          privacyLabel={t('signIn.legal.privacy')}
        />

        <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.cancel}>
          <Feather name="x" size={18} color={TXTSUB} />
          <Text style={styles.cancelText}>{t('signIn.notNow')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// Provider row with tactile press feedback + an in-flight spinner (per user:
// the Google button previously gave NO reaction on tap, then the system
// account picker took seconds to appear with zero feedback in between).
//   • Press-in shrinks the row to 96 %; release springs it back.
//   • While `busy`, the brand glyph is swapped for an ActivityIndicator so
//     the wait between tap and the native dialog reads as "working".
//   • `disabled` greys nothing while THIS row is busy (the spinner is the
//     signal) but dims the other rows so only one flow runs at a time.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ProviderButton({
  onPress, style, busy, disabled, spinnerColor, glyph, children,
}: {
  onPress: () => void;
  style: any;
  busy: boolean;
  disabled: boolean;
  spinnerColor: string;
  glyph: React.ReactNode;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => { scale.value = withTiming(0.96, { duration: 90 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 16, stiffness: 320 }); }}
      style={[style, pressStyle, disabled && !busy && { opacity: 0.5 }]}
    >
      {busy ? <ActivityIndicator size="small" color={spinnerColor} /> : glyph}
      {children}
    </AnimatedPressable>
  );
}

// Render the legal sentence with clickable Terms / Privacy links inline.
// The template comes from i18n (`signIn.legal`) and contains `{terms}` and
// `{privacy}` tokens; we replace them with tappable <Text> spans so the
// word order in each language survives translation. The data-scope
// sentence ("We only request your name, email, and profile picture.") is
// baked into the template itself — different languages place it at
// different points in the paragraph, so a single key is cleaner than
// splitting into two concatenated strings.
function LegalText({
  template, termsLabel, privacyLabel,
}: {
  template: string; termsLabel: string; privacyLabel: string;
}) {
  const openTerms = () => Linking.openURL('https://example.com/terms').catch(() => {});
  const openPrivacy = () => Linking.openURL('https://example.com/privacy').catch(() => {});
  const parts = template.split(/(\{terms\}|\{privacy\})/g);
  return (
    <Text style={styles.legal}>
      {parts.map((p, i) => {
        if (p === '{terms}') return <Text key={i} style={styles.legalLink} onPress={openTerms}>{termsLabel}</Text>;
        if (p === '{privacy}') return <Text key={i} style={styles.legalLink} onPress={openPrivacy}>{privacyLabel}</Text>;
        return p;
      })}
    </Text>
  );
}


function GoogleGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <G>
        <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
        <Path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
        <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
      </G>
    </Svg>
  );
}

// Use Ionicons' "logo-apple" — the SVG path I had hand-rolled here was
// malformed (the bite-out arc was placed wrong, so the apple looked like
// it had a chunk cut from the side instead of the top-right). Ionicons
// ships the canonical SF-Symbols-style Apple mark and renders identically
// across iOS / Android. `marginTop: -2` nudges the optical centre to
// match the Google + Facebook glyphs sitting beside it in the row.
function AppleGlyph() {
  return <Ionicons name="logo-apple" size={20} color="#FFFFFF" style={{ marginTop: -2 }} />;
}

function FacebookGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#FFFFFF"
        d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987H7.898V12h2.54V9.797c0-2.506 1.493-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46H15.19c-1.243 0-1.628.771-1.628 1.562V12h2.773l-.443 2.891h-2.33v6.987C18.343 21.128 22 16.991 22 12z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: P,
    paddingTop: 14,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TXT,
    marginBottom: 8,
    textAlign: 'center',
  },
  desc: {
    fontSize: 15,
    color: TXTSUB,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  providerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(30,27,46,0.10)',
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  providerBtnFb: {
    backgroundColor: '#1877F2',
    borderColor: '#1877F2',
  },
  providerBtnApple: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  providerText: {
    fontSize: 16,
    fontWeight: '600',
    color: TXT,
    letterSpacing: 0.2,
  },
  legal: {
    fontSize: 12,
    lineHeight: 18,
    color: TXTSUB,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  legalLink: {
    color: ROSE,
    fontWeight: '600',
  },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    color: TXTSUB,
    fontWeight: '500',
  },
});
