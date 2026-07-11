import { useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { isConfigured } from '../constants/oauth';
import { useAuth } from '../state/AuthContext';
import { googleAuthAvailable, facebookAuthAvailable } from '../services/firebaseAuth';
import { useT } from '../i18n/useT';

export type SignInProvider = 'apple' | 'google' | 'facebook';

// Shared OAuth sign-in flows. One `busy` provider is mid-flight at a time —
// it drives the in-button spinner AND lets callers disable sibling buttons so
// a slow native picker can't be double-fired. Used by the SignInSheet
// (Profile / post-onboarding prompts) and the onboarding login page.
export function useProviderSignIn({ onSuccess, onError }: {
  onSuccess: () => void;
  onError?: (msg: string) => void;
}) {
  const { signIn, signInWithGoogle, signInWithFacebook } = useAuth();
  const t = useT();
  const [busy, setBusy] = useState<SignInProvider | null>(null);

  // Google goes through Firebase Authentication via the native SDK (account
  // picker → Firebase credential → stable uid + email).
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
      onSuccess();
    } catch (e: any) {
      if (e?.message === 'CANCELLED') return;   // user dismissed the picker — stay silent
      // Surface the real code (DEVELOPER_ERROR = SHA-1 mismatch,
      // auth/network-request-failed = blocked/VPN, FIREBASE_TIMEOUT = stalled)
      // so the actual cause is visible instead of a silent forever-spinner.
      const code = e?.code || e?.message || 'unknown';
      onError?.(`Google sign-in failed (${code}). Please try again.`);
    } finally {
      setBusy(null);
    }
  };

  const onFacebook = async () => {
    if (busy) return;
    if (!facebookAuthAvailable()) {
      onError?.('Facebook sign-in is unavailable in this build.');
      return;
    }
    setBusy('facebook');
    try {
      await signInWithFacebook();
      onSuccess();
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
      onSuccess();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED') return;          // user dismissed — no toast
      onError?.(t('signIn.error.appleFailed'));
    } finally {
      setBusy(null);
    }
  };

  return { busy, onGoogle, onApple, onFacebook };
}
