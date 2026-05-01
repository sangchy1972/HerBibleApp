// OAuth client IDs for social sign-in.
//
// These are PUBLIC identifiers — safe to commit (the client secret is what's
// sensitive, and OAuth public clients on mobile don't carry one).
//
// To wire real sign-in:
//
// 1. Google
//    a. Visit https://console.cloud.google.com/apis/credentials
//    b. Create three "OAuth 2.0 Client IDs":
//       - iOS  → bundle ID:   com.holy.bible.kjv.audio.prayer
//       - Android → package:  com.holy.bible.kjv.audio.prayer
//                  + SHA-1 of your Android signing cert
//       - Web → for Expo Go testing & EAS preview links
//    c. Paste the three values below.
//
// 2. Facebook
//    a. Visit https://developers.facebook.com/apps  →  create an app  →
//       add "Facebook Login" product.
//    b. iOS bundle ID:   com.holy.bible.kjv.audio.prayer
//       Android package: com.holy.bible.kjv.audio.prayer
//    c. Paste the App ID below.
//
// While these are blank ("YOUR_...") the buttons render but tapping them shows
// a "Sign-in not yet configured" toast. The rest of the app keeps working.

export const GOOGLE_CLIENT_IDS = {
  ios:     'YOUR_GOOGLE_IOS_CLIENT_ID.apps.googleusercontent.com',
  android: 'YOUR_GOOGLE_ANDROID_CLIENT_ID.apps.googleusercontent.com',
  web:     'YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com',
};

export const FACEBOOK_APP_ID = 'YOUR_FACEBOOK_APP_ID';

// Helper to detect whether at least one usable client ID exists for a provider.
export const isConfigured = {
  google: () =>
    !GOOGLE_CLIENT_IDS.ios.startsWith('YOUR_') ||
    !GOOGLE_CLIENT_IDS.android.startsWith('YOUR_') ||
    !GOOGLE_CLIENT_IDS.web.startsWith('YOUR_'),
  facebook: () => !FACEBOOK_APP_ID.startsWith('YOUR_'),
};
