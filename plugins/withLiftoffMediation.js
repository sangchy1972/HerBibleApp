// Liftoff Monetize (Vungle) as an AdMob MEDIATION adapter.
//
// We do NOT integrate the raw Vungle SDK. The app already serves ads through
// AdMob (react-native-google-mobile-ads); Liftoff is wired in as one more demand
// source behind AdMob's mediation, which means:
//   • no second ad SDK to initialize, no hand-rolled waterfall in JS,
//   • the ad units in services/ads.ts and services/appOpenAd.ts stay untouched —
//     AdMob decides per request whether Google or Liftoff fills it,
//   • eCPM floors / waterfall order / bidding are configured in the AdMob console
//     (Mediation → mediation group), not in code.
//
// The Liftoff dashboard's "download the SDK zip and follow these instructions"
// flow is the DIRECT-integration path. It doesn't apply here and its zip can't
// be dropped into an Expo/CNG project anyway.
//
// Console side (done by hand, once — see the notes handed to the user):
//   AdMob → Mediation → new/edit group → add Liftoff Monetize as an ad source,
//   entering the Liftoff App ID + Placement Reference ID and the Reporting API
//   key. Nothing below reads those; the adapter picks them up from AdMob.
//
// SKAdNetwork: Vungle's ID (gta9lk7p23.skadnetwork) is already in the
// skAdNetworkItems list in app.json, so iOS attribution needs no extra work.
//
// Versions per Google's integration guide (checked 2026-07-12):
//   Android  com.google.ads.mediation:vungle:7.7.4.0
//   iOS      pod 'GoogleMobileAdsMediationVungle'   (CocoaPods resolves the
//            latest build compatible with the GMA SDK the RN package pins)
//
// ⚠️ VERSION COUPLING — do not bump one side without the other.
// The adapter is compiled against a SPECIFIC major of the Google Mobile Ads SDK,
// and react-native-google-mobile-ads pins that SDK exactly (package.json →
// sdkVersions). Adapter 7.7.4.0 needs **GMA 25.x on Android / 13.x on iOS**,
// which is what react-native-google-mobile-ads@16.4.0 pins (Android 25.4.0,
// iOS 13.5.0). It does NOT work on the 15.x line (Android 24.6.0 / iOS 12.11.0):
//   • iOS fails LOUDLY — the adapter's podspec requires `Google-Mobile-Ads-SDK
//     ~> 13.3` while the RN podspec pins 12.11.0, so `pod install` can't resolve.
//   • Android fails QUIETLY — Gradle's highest-version-wins drags GMA up to 25.x
//     via the adapter's transitive dependency, but the RN package's Java is built
//     against 24.6.0, and GMA 25 DELETED the mediation classes it uses
//     (VersionInfo, the old onFailure(String) callbacks) → runtime
//     NoClassDefFoundError / NoSuchMethodError.
// If you ever need to go back to react-native-google-mobile-ads 15.x, the last
// adapter that supports GMA 24.x is 7.7.0.1 (Android) / 7.6.3.1 (iOS).
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'withLiftoffMediation';
const ANDROID_DEP = `    implementation 'com.google.ads.mediation:vungle:7.7.4.0' // ${MARKER}`;
const IOS_POD = `  pod 'GoogleMobileAdsMediationVungle' # ${MARKER}`;

function withAndroid(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    // Drop it into the app module's dependencies block. The Expo template always
    // has exactly one top-level `dependencies {` in android/app/build.gradle.
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(\ndependencies\s*\{\n)/,
      `$1${ANDROID_DEP}\n`,
    );
    return cfg;
  });
}

function withIos(config) {
  return withDangerousMod(config, ['ios', (cfg) => {
    const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
    let contents = fs.readFileSync(podfile, 'utf8');
    if (contents.includes(MARKER)) return cfg;
    // `use_expo_modules!` sits at the top of the app target in every Expo
    // Podfile — the one anchor that's stable across SDK versions.
    contents = contents.replace(/(\n\s*use_expo_modules!\n)/, `$1${IOS_POD}\n`);
    fs.writeFileSync(podfile, contents);
    return cfg;
  }]);
}

module.exports = function withLiftoffMediation(config) {
  return withIos(withAndroid(config));
};
