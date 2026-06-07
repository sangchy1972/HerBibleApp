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

let configured = false;
function ensureConfigured(): void {
  if (configured || !GoogleSignin) return;
  // `webClientId: 'autoDetect'` reads the `default_web_client_id` string
  // resource that the Firebase Gradle plugin generates from google-services.json
  // (the Web OAuth client). No need to hard-code the ID anywhere.
  GoogleSignin.configure({ webClientId: 'autoDetect', offlineAccess: false });
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
  await authMod().signInWithCredential(credential);
}

export function facebookAuthAvailable(): boolean {
  return !!authMod && !!FBLoginManager && !!FBAccessToken;
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

export async function firebaseSignOut(): Promise<void> {
  try { if (GoogleSignin) await GoogleSignin.signOut(); } catch {}
  try { if (authMod) await authMod().signOut(); } catch {}
}

// Subscribe to Firebase auth state. Calls back with a mapped AuthUser or null.
// Returns an unsubscribe function. No-ops (and reports null once) if the native
// auth module isn't present.
export function onAuthChanged(cb: (user: AuthUser | null) => void): () => void {
  if (!authMod) { cb(null); return () => {}; }
  return authMod().onAuthStateChanged((u: any) => cb(mapFirebaseUser(u)));
}
