import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as AppleAuthentication from 'expo-apple-authentication';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { GOOGLE_CLIENT_IDS, FACEBOOK_APP_ID, isConfigured } from '../constants/oauth';
import { useAuth } from '../state/AuthContext';

WebBrowser.maybeCompleteAuthSession();

const SHEET_ENTERING = SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic));

interface Props {
  onClose: () => void;
  onError?: (msg: string) => void;
}

export default function SignInSheet({ onClose, onError }: Props) {
  const { signIn } = useAuth();

  // Google: ID-token flow (gives us a JWT we can decode for name/email/photo locally).
  const [, googleResp, promptGoogle] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_CLIENT_IDS.ios,
    androidClientId: GOOGLE_CLIENT_IDS.android,
    clientId: GOOGLE_CLIENT_IDS.web,
    scopes: ['openid', 'profile', 'email'],
  });

  // Facebook: token flow → Graph API for name/email/picture.
  const [, fbResp, promptFb] = Facebook.useAuthRequest({
    clientId: FACEBOOK_APP_ID,
    scopes: ['public_profile', 'email'],
  });

  useEffect(() => {
    if (googleResp?.type !== 'success') return;
    const idToken = googleResp.params.id_token;
    if (!idToken) return;
    const claims = decodeJwt(idToken);
    if (!claims?.email) {
      onError?.('Google did not return an email address.');
      return;
    }
    signIn({
      name: claims.name || claims.email.split('@')[0],
      email: claims.email,
      photoUri: claims.picture,
    });
    onClose();
  }, [googleResp]);

  useEffect(() => {
    if (fbResp?.type !== 'success') return;
    const token = fbResp.authentication?.accessToken;
    if (!token) return;
    fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${token}`)
      .then(r => r.json())
      .then(profile => {
        if (!profile?.email) {
          onError?.('Facebook did not return an email address. Make sure email permission was granted.');
          return;
        }
        signIn({
          name: profile.name,
          email: profile.email,
          photoUri: profile.picture?.data?.url,
        });
        onClose();
      })
      .catch(() => onError?.('Could not load your Facebook profile.'));
  }, [fbResp]);

  const onGoogle = () => {
    if (!isConfigured.google()) {
      onError?.('Google sign-in not yet configured. See src/constants/oauth.ts.');
      return;
    }
    promptGoogle();
  };

  const onFacebook = () => {
    if (!isConfigured.facebook()) {
      onError?.('Facebook sign-in not yet configured. See src/constants/oauth.ts.');
      return;
    }
    promptFb();
  };

  // Apple is iOS-only. fullName + email come back ONLY on the very first
  // sign-in for a given Apple ID + bundle pair — re-signs return only the
  // stable user identifier. We handle that by falling back to the email
  // prefix for the display name on subsequent sign-ins. Cancel is silent.
  const onApple = async () => {
    if (!isConfigured.apple()) {
      onError?.('Apple sign-in is iOS-only.');
      return;
    }
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
      onError?.('Apple sign-in failed. Please try again.');
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
      <Animated.View entering={SHEET_ENTERING} style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Sign in to Her Bible</Text>
        <Text style={styles.desc}>
          Sync your highlights, notes, saved verses, and reading streak across devices.
        </Text>

        {Platform.OS === 'ios' && (
          // Apple HIG requires Sign in with Apple to sit at-or-above any
          // other social sign-in option, so it leads the stack on iOS.
          <TouchableOpacity onPress={onApple} style={[styles.providerBtn, styles.providerBtnApple]} activeOpacity={0.85}>
            <AppleGlyph />
            <Text style={[styles.providerText, { color: '#fff' }]}>Continue with Apple</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onGoogle} style={styles.providerBtn} activeOpacity={0.85}>
          <GoogleGlyph />
          <Text style={styles.providerText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onFacebook} style={[styles.providerBtn, styles.providerBtnFb]} activeOpacity={0.85}>
          <FacebookGlyph />
          <Text style={[styles.providerText, { color: '#fff' }]}>Continue with Facebook</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          By continuing you agree to our{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL('https://example.com/terms')}>Terms</Text>
          {' and '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL('https://example.com/privacy')}>Privacy Policy</Text>.
          We only request your name, email, and profile picture.
        </Text>

        <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.cancel}>
          <Feather name="x" size={18} color={TXTSUB} />
          <Text style={styles.cancelText}>Not now</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// Decode a JWT payload without verification — fine for client-side display only.
// We trust the token because it came back through the OAuth flow on this device;
// real auth verification happens server-side if the user upgrades to a backend.
function decodeJwt(token: string): { name?: string; email?: string; picture?: string } | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
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

function AppleGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#FFFFFF"
        d="M16.365 1.43c0 1.14-.43 2.25-1.21 3.06-.83.86-2.21 1.5-3.36 1.42-.13-1.13.4-2.32 1.18-3.13C13.83 1.83 15.21 1.2 16.365 1.43zM20.5 17.27c-.46 1.07-1.01 2.06-1.66 2.99-.85 1.21-1.55 2.05-2.08 2.51-.83.74-1.72 1.12-2.67 1.13-.68 0-1.5-.19-2.46-.58-.96-.39-1.84-.58-2.65-.58-.85 0-1.76.19-2.74.58-.98.39-1.77.6-2.38.62-.91.04-1.82-.34-2.73-1.16-.57-.5-1.31-1.37-2.21-2.61-.96-1.32-1.76-2.85-2.39-4.6-.67-1.89-1-3.72-1-5.49 0-2.03.44-3.78 1.32-5.24.69-1.18 1.61-2.11 2.76-2.79C3.46 1.59 4.71 1.24 6.06 1.22c.71 0 1.66.22 2.86.65 1.19.43 1.96.65 2.3.65.25 0 1.1-.26 2.55-.77 1.37-.47 2.52-.67 3.46-.59 2.55.21 4.46 1.21 5.74 3.02-2.28 1.38-3.41 3.32-3.39 5.79.02 1.93.72 3.53 2.1 4.81.62.59 1.32 1.05 2.09 1.38-.17.49-.34.96-.52 1.41z"
      />
    </Svg>
  );
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
