// Firebase Authentication + native Google Sign-In.
//
// Flow: the native Google account picker (@react-native-google-signin) returns
// a Google ID token → we exchange it for a Firebase credential → Firebase signs
// the user in and gives us a stable `uid` + email + name + photo. The uid is
// what we feed to Analytics / (later) AppsFlyer for user tracking.
//
// Native modules are loaded with a guarded require (never a static import), the
// same defensive pattern as services/firebase.ts and services/ads.ts — so a
// build that doesn't yet contain these native modules degrades to no-ops
// instead of crashing at import time.

import AsyncStorage from '@react-native-async-storage/async-storage';

let authMod: any = null;
let GoogleSignin: any = null;
let FBLoginManager: any = null;
let FBAccessToken: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  authMod = require('@react-native-firebase/auth').default;
} catch { /* native module not in this build */ }
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
} catch { /* native module not in this build */ }
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fb = require('react-native-fbsdk-next');
  FBLoginManager = fb.LoginManager;
  FBAccessToken = fb.AccessToken;
} catch { /* native module not in this build */ }

export interface AuthUser {
  uid: string;
  name: string;
  email: string;
  photoUri?: string;
}

export function googleAuthAvailable(): boolean {
  return !!authMod && !!GoogleSignin;
}

// The project's WEB (type 3) OAuth client from google-services.json — the
// audience Firebase requires on the Google ID token. It MUST be passed
// literally: `webClientId: 'autoDetect'` was a myth (that string exists nowhere
// in @react-native-google-signin@16, which forwards the value verbatim into
// GoogleSignInOptions.requestIdToken(...)), so every sign-in asked Google for a
// token audienced to the literal client id "autoDetect" and came back
// DEVELOPER_ERROR (code 10) — the "Google sign-in failed (10)" users saw, on
// every build regardless of SHA-1 registration. Not a secret: it ships inside
// google-services.json in every APK.
const GOOGLE_WEB_CLIENT_ID = '553397384848-3su69vsfrath03gkfq48aeprtm399em2.apps.googleusercontent.com';

let configured = false;
function ensureConfigured(): void {
  if (configured || !GoogleSignin) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
  configured = true;
}

// Pre-warm the Google sign-in stack OFF the tap's critical path. The first
// `googleSignIn()` used to pay configure + the Play Services availability
// check + native picker spin-up all at once — a visible multi-second stall
// between tapping the button and the account chooser appearing. Calling this
// when the sign-in sheet MOUNTS moves the configure + Play Services check to
// the moments while the user is still reading the sheet. Fire-and-forget.
export function warmupGoogleSignIn(): void {
  if (!GoogleSignin) return;
  try {
    ensureConfigured();
    // No update dialog here — this is a silent background probe; the real
    // sign-in call still passes showPlayServicesUpdateDialog: true.
    GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false }).catch(() => {});
  } catch { /* never let warmup break the sheet */ }
}

function mapFirebaseUser(u: any): AuthUser | null {
  if (!u) return null;
  return {
    uid: u.uid,
    name: u.displayName || (u.email ? String(u.email).split('@')[0] : ''),
    email: u.email || '',
    photoUri: u.photoURL || undefined,
  };
}

// Run the native Google sign-in → Firebase. Resolves once Firebase has the
// session (onAuthChanged will also fire with the user). Throws 'CANCELLED' if
// the user dismissed the picker, so the caller can stay silent.
export async function googleSignIn(): Promise<void> {
  if (!authMod || !GoogleSignin) throw new Error('GOOGLE_AUTH_UNAVAILABLE');
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  // v13+ returns { type, data: { idToken, user } }; older returns { idToken }.
  if (result?.type === 'cancelled') throw new Error('CANCELLED');
  const idToken = result?.data?.idToken ?? result?.idToken;
  if (!idToken) throw new Error('NO_ID_TOKEN');
  const credential = authMod.GoogleAuthProvider.credential(idToken);
  // Guard against an indefinite hang: on some devices — and notably behind a
  // VPN/proxy — the Firebase Auth credential exchange can stall and never
  // resolve, leaving the sign-in spinner turning forever with no error. Race it
  // against a timeout so the UI fails visibly instead (see SignInSheet, which
  // surfaces the error code so the real cause is diagnosable).
  await withTimeout(authMod().signInWithCredential(credential), 25000);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('FIREBASE_TIMEOUT')), ms)),
  ]);
}

export function facebookAuthAvailable(): boolean {
  return !!authMod && !!FBLoginManager && !!FBAccessToken;
}

export function appleFirebaseAvailable(): boolean {
  return !!authMod;
}

// Apple identity token (from expo-apple-authentication) → Firebase, so Apple
// users land in the same uid pool as Google/email — required for cloud backup
// & restore. `rawNonce` is the pre-hash nonce whose SHA-256 was passed to
// signInAsync. Apple returns fullName ONLY on first authorization and Firebase
// never sets displayName from Apple, so we set it once ourselves.
export async function appleFirebaseSignIn(identityToken: string, rawNonce: string, displayName?: string): Promise<void> {
  if (!authMod) throw new Error('FIREBASE_AUTH_UNAVAILABLE');
  const credential = authMod.AppleAuthProvider.credential(identityToken, rawNonce);
  await withTimeout(authMod().signInWithCredential(credential), 25000);
  try {
    const u = authMod().currentUser;
    if (u && displayName && !u.displayName) await u.updateProfile({ displayName });
  } catch { /* cosmetic only */ }
}

// Native Facebook login (react-native-fbsdk-next) → Firebase. The official FB
// SDK handles the native login dialog + redirect, then we exchange the FB
// access token for a Firebase credential so the FB user lands in the same
// Firebase Auth pool as Google (same uid model + Analytics). Throws 'CANCELLED'
// if the user dismissed the dialog, so the caller can stay silent.
export async function facebookSignIn(): Promise<void> {
  if (!authMod) throw new Error('FIREBASE_AUTH_UNAVAILABLE');
  if (!FBLoginManager || !FBAccessToken) throw new Error('FB_SDK_UNAVAILABLE');
  const result = await FBLoginManager.logInWithPermissions(['public_profile', 'email']);
  if (result?.isCancelled) throw new Error('CANCELLED');
  const data = await FBAccessToken.getCurrentAccessToken();
  if (!data?.accessToken) throw new Error('NO_FB_TOKEN');
  const credential = authMod.FacebookAuthProvider.credential(data.accessToken);
  await authMod().signInWithCredential(credential);
}

// ─── Email magic-link (passwordless) sign-in ──────────────────────────────
// Firebase-native, NO backend. Flow:
//   1. sendEmailSignInLink(email) → Firebase emails a one-tap sign-in link; we
//      stash the email locally so we can finish on this device.
//   2. User taps the link → it lands on everlandapps.com/finishSignIn.html (a
//      tiny redirect page) → bounces to herbible://finishSignIn?<params> →
//      DeepLinkHandler → completeEmailSignIn(link).
// The redirect page + the app's existing custom scheme avoid Firebase Dynamic
// Links (deprecated) and Android App Links / SHA-256 setup entirely.
// REQUIRES in Firebase Console: Authentication → Sign-in method → Email/Password
// → "Email link (passwordless sign-in)" ENABLED, and Authentication → Settings →
// Authorized domains includes `everlandapps.com`.
const EMAIL_LINK_CONTINUE_URL = 'https://everlandapps.com/finishSignIn.html';
const PENDING_EMAIL_KEY = 'auth:emailLink:pendingEmail';

export function emailAuthAvailable(): boolean { return !!authMod; }

// App language → the locale Firebase looks up a template under. Firebase keys
// its per-language templates by BCP-47-ish codes; Chinese needs the script
// subtag or both variants collapse to one template.
const EMAIL_LOCALE: Record<string, string> = {
  en: 'en',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  de: 'de',
  fr: 'fr',
  es: 'es',
  pt: 'pt-BR',
};

/**
 * Tell Firebase which language to send the sign-in email in.
 *
 * This is REQUIRED once the templates are customised: Firebase auto-localises
 * only its stock templates — a customised one is sent verbatim, in whatever
 * language that template was written, unless the request carries a language
 * code. Without this every user gets the English template no matter what
 * language they picked in the app.
 *
 * Never throws: a wrong/unsupported code just falls back to the default
 * template, which is strictly better than failing the send.
 */
export async function setEmailLanguage(appLanguage: string): Promise<void> {
  if (!authMod) return;
  try {
    // setLanguageCode, NOT the `languageCode` setter: RNFB's setter calls this
    // same async method without awaiting or catching, so a native rejection
    // escapes as an unhandled promise rejection that our try/catch can't see,
    // and the send below could in principle race the write.
    await authMod().setLanguageCode(EMAIL_LOCALE[appLanguage] ?? 'en');
  } catch { /* unsupported locale / older SDK → stock template */ }
}

export async function sendEmailSignInLink(email: string, appLanguage?: string): Promise<void> {
  if (!authMod) throw new Error('FIREBASE_AUTH_UNAVAILABLE');
  const clean = email.trim();
  if (appLanguage) await setEmailLanguage(appLanguage);
  await authMod().sendSignInLinkToEmail(clean, {
    handleCodeInApp: true,
    url: EMAIL_LINK_CONTINUE_URL,
  });
  try { await AsyncStorage.setItem(PENDING_EMAIL_KEY, clean); } catch {}
}

export function isEmailSignInLink(link: string): boolean {
  if (!authMod) return false;
  try { return !!authMod().isSignInWithEmailLink(link); } catch { return false; }
}

export async function getPendingEmail(): Promise<string | null> {
  try { return await AsyncStorage.getItem(PENDING_EMAIL_KEY); } catch { return null; }
}

// `link` must be the original https sign-in link (carrying the oobCode), which
// the caller reconstructs from the herbible:// redirect. `fallbackEmail` covers
// the rare case where the link is opened on a device with no stored email.
export async function completeEmailSignIn(link: string, fallbackEmail?: string): Promise<void> {
  if (!authMod) throw new Error('FIREBASE_AUTH_UNAVAILABLE');
  const email = (await getPendingEmail()) || (fallbackEmail ?? '').trim();
  if (!email) throw new Error('NO_PENDING_EMAIL');
  await authMod().signInWithEmailLink(email, link);
  try { await AsyncStorage.removeItem(PENDING_EMAIL_KEY); } catch {}
}

export async function firebaseSignOut(): Promise<void> {
  try { if (GoogleSignin) await GoogleSignin.signOut(); } catch {}
  try { if (authMod) await authMod().signOut(); } catch {}
}

// Permanently delete the signed-in Firebase account (Apple App Store Guideline
// 5.1.1(v) requires in-app account deletion). Firebase blocks delete() on a
// stale session with `auth/requires-recent-login`; we transparently re-auth the
// Google provider (the common case + the reviewer's demo path) and retry. For
// other providers we surface REQUIRES_RECENT_LOGIN so the UI can ask the user to
// sign in again. Returns quietly if there is no Firebase user (e.g. the legacy
// Apple/local path has no server account — the caller still clears local data).
export async function deleteAccount(): Promise<void> {
  if (!authMod) throw new Error('FIREBASE_AUTH_UNAVAILABLE');
  const user = authMod().currentUser;
  if (!user) return;   // no server-side account to delete
  try {
    await user.delete();
  } catch (e: any) {
    if (e?.code !== 'auth/requires-recent-login') throw e;
    const providerId = user.providerData?.[0]?.providerId;
    if (providerId === 'google.com' && GoogleSignin) {
      // Re-authenticate with a fresh Google credential, then delete.
      ensureConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      const idToken = result?.data?.idToken ?? result?.idToken;
      if (!idToken) throw new Error('REQUIRES_RECENT_LOGIN');
      const credential = authMod.GoogleAuthProvider.credential(idToken);
      await user.reauthenticateWithCredential(credential);
      await user.delete();
      return;
    }
    throw new Error('REQUIRES_RECENT_LOGIN');
  }
}

// Subscribe to Firebase auth state. Calls back with a mapped AuthUser or null.
// Returns an unsubscribe function. No-ops (and reports null once) if the native
// auth module isn't present.
export function onAuthChanged(cb: (user: AuthUser | null) => void): () => void {
  if (!authMod) { cb(null); return () => {}; }
  return authMod().onAuthStateChanged((u: any) => cb(mapFirebaseUser(u)));
}
