// AdMob mediation adapters — one table, one plugin.
//
// Every third-party demand source (Liftoff, Pangle, InMobi, Meta, …) is wired in
// as an AdMob MEDIATION ADAPTER, never as a second ad SDK. That means:
//   • no extra SDK to initialize, no hand-rolled waterfall in JS,
//   • services/ads.ts, the US waterfall controller and the frequency caps are
//     untouched — AdMob decides per request who fills the interstitial,
//   • BIDDING and WATERFALL use the SAME adapter. The difference is entirely in
//     the AdMob console (how you configure the ad source in the mediation group);
//     there is no code-level distinction. So "add Pangle bidding" == flip the
//     `enabled` flag below + configure the group in AdMob.
//
// A vendor's own dashboard will tell you to download their SDK zip and follow
// their integration guide. That is the DIRECT-integration path. Ignore it — it
// doesn't apply to mediation, and their zips can't be dropped into an Expo/CNG
// project anyway (android/ and ios/ are prebuild-generated and gitignored, which
// is exactly why every native change has to live in a config plugin like this).
//
// ─── TO ADD A NETWORK ───────────────────────────────────────────────────────
//   1. Flip its `enabled` to true below (or add a new entry to the table).
//   2. `npx expo prebuild --clean` and rebuild. An adapter that is compiled in
//      but not configured in AdMob simply never receives a request — harmless,
//      but it does add a few MB, so leave the ones you're not using off.
//   3. In AdMob → Mediation, add the ad source to the interstitial mediation
//      group with the network's App ID / Placement ID / reporting key.
//
// ─── ⚠️ VERSION COUPLING — THE ONE RULE ─────────────────────────────────────
// Every adapter is compiled against a SPECIFIC major of the Google Mobile Ads
// SDK, and react-native-google-mobile-ads pins that SDK EXACTLY (its
// package.json → sdkVersions). Bumping one side without the other breaks in two
// different, equally nasty ways:
//   • iOS fails LOUDLY — the adapter's podspec constrains Google-Mobile-Ads-SDK
//     (e.g. `~> 13.3`); if the RN package pins something outside that range,
//     `pod install` can't resolve and the build dies.
//   • Android fails QUIETLY — Gradle's highest-version-wins silently drags GMA
//     up through the adapter's transitive dependency, while the RN package's
//     Java is still compiled against the OLD one. GMA 25 deleted mediation
//     classes the RN package calls (VersionInfo, the old onFailure(String)
//     callbacks) → runtime NoClassDefFoundError, only on real devices, only
//     when an ad loads. We already walked into this once.
// So: whenever you bump react-native-google-mobile-ads, re-check every adapter
// version in this table against its changelog, and vice-versa.
//
// Pinned for react-native-google-mobile-ads@16.4.0
//   → Android GMA 25.4.0 / UMP 4.0.0,  iOS GMA 13.5.0 / UMP 3.1.0.
// All versions below verified against Google's mediation docs + the adapter
// changelogs + the published podspecs on 2026-07-12.
const {
  withAppBuildGradle, withProjectBuildGradle, withInfoPlist, withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'withAdMobMediation';

const ADAPTERS = [
  {
    key: 'liftoff',
    label: 'Liftoff Monetize (Vungle)',
    enabled: true,
    // Android 7.7.4.0 is the newest RELEASED build (7.7.4.1 is still "in
    // progress"); built/tested with GMA 25.2.0, fine on our 25.4.0.
    androidDep: 'com.google.ads.mediation:vungle:7.7.4.0',
    // podspec: Google-Mobile-Ads-SDK ~> 13.3 → satisfied by 13.5.0.
    iosPod: 'GoogleMobileAdsMediationVungle',
    iosPodVersion: '7.7.4.0',
    skAdNetworkIds: ['gta9lk7p23.skadnetwork'],
    // Interstitial: bidding ✅  waterfall ✅
  },
  {
    key: 'pangle',
    label: 'Pangle',
    enabled: false,
    // Built/tested with GMA 25.1.0. (8.1.0.3.0 is "in progress" — don't use.)
    androidDep: 'com.google.ads.mediation:pangle:8.0.0.5.0',
    // Pangle's SDK is NOT on Maven Central — this repo is mandatory or the build
    // fails to resolve. It's the only network in this table that needs one.
    androidMavenRepos: ['https://artifact.bytedance.com/repository/pangle/'],
    // ⚠️ PIN THIS. iOS 8.2.0.3.0 was ROLLED BACK and its podspec depends on
    // `Ads-Global-Beta` (a beta SDK pod). 8.1.0.6.0 is the last good one;
    // podspec: Google-Mobile-Ads-SDK ~> 13.3 → satisfied by 13.5.0.
    iosPod: 'GoogleMobileAdsMediationPangle',
    iosPodVersion: '8.1.0.6.0',
    skAdNetworkIds: ['238da6jt44.skadnetwork', '22mmun2rn5.skadnetwork'],
    // Interstitial: bidding ✅  waterfall ✅
    // If you turn R8/ProGuard on, add Pangle's keep rules (Google's doc defers
    // to https://www.pangleglobal.com/integration/integrate-pangle-sdk-for-android).
  },
  {
    key: 'inmobi',
    label: 'InMobi',
    enabled: false,
    // Built/tested with GMA 25.2.0. SDK is on Maven Central — no extra repo.
    androidDep: 'com.google.ads.mediation:inmobi:11.3.0.0',
    // podspec: Google-Mobile-Ads-SDK ~> 13.3 → satisfied by 13.5.0.
    iosPod: 'GoogleMobileAdsMediationInMobi',
    iosPodVersion: '11.3.0.0.1',
    // InMobi is the only one that needs -ObjC in OTHER_LDFLAGS.
    iosNeedsObjCLinkerFlag: true,
    skAdNetworkIds: ['wzmmz9fp6w.skadnetwork'],
    // Interstitial: bidding ✅  waterfall ✅
    // Optional Android permissions (ACCESS_FINE_LOCATION / *_WIFI_STATE) improve
    // fill. Deliberately NOT added: they'd force a new Play data-safety
    // disclosure for a marginal gain. Add them consciously if you want them.
  },
  {
    key: 'meta',
    label: 'Meta Audience Network',
    // ⚠️ Placement IDs are registered in docs/ad-unit-ids.md. App ID
    //    1020655230368479; the one that matters is Interstitial #2
    //    (1020655230368479_1026027013164634) — this app renders interstitials
    //    only, so the banner / native / rewarded placements can never fill.
    //    Pasting them into AdMob while this flag is false gets you a bidding
    //    source that cannot respond: the adapter isn't in the binary.
    // ✅ Enabled 2026-07-26. The iOS advertiser-tracking prerequisite is wired
    //    (plugins/withMetaAdvertiserTracking.js), app-ads.txt carries the Meta
    //    line, and the Interstitial placement is registered in AdMob.
    enabled: true,
    // Built/tested with GMA 25.2.0.
    androidDep: 'com.google.ads.mediation:facebook:6.21.0.3',
    // podspec: Google-Mobile-Ads-SDK ~> 13.4 → satisfied by 13.5.0.
    iosPod: 'GoogleMobileAdsMediationFacebook',
    iosPodVersion: '6.21.1.1.1',
    skAdNetworkIds: ['v9wttpbfk9.skadnetwork', 'n38lu8286q.skadnetwork'],
    // ⚠️ Interstitial: bidding ✅  waterfall ❌ — Meta has been BIDDING-ONLY for
    //    interstitial since 2021. Don't waste time trying to set an eCPM floor
    //    for it in a waterfall group; it has to go in as a bidding source.
    // ⚠️ No Facebook App ID needed (that's the Login/Core SDK, not Audience
    //    Network) — no manifest entry, no CFBundleURLTypes, no fb<id> scheme.
    //    It's configured entirely by the Placement ID you paste into AdMob.
    // ✅ iOS advertiser tracking is wired — FBAdSettings.setAdvertiserTrackingEnabled
    //    is injected into AppDelegate by plugins/withMetaAdvertiserTracking.js,
    //    resolved through the ObjC runtime so it costs nothing when Meta is off.
    // ⚠️ Meta also requires its own entries in app-ads.txt, and the Facebook app
    //    must be installed + logged in on the device to see test ads.
  },
];

const on = () => ADAPTERS.filter(a => a.enabled);

// ── Android: dependencies ──────────────────────────────────────────────────
function withAndroidDeps(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    const lines = on()
      .filter(a => !cfg.modResults.contents.includes(a.androidDep))
      .map(a => `    implementation '${a.androidDep}' // ${MARKER}: ${a.label}`);
    if (!lines.length) return cfg;
    // The app module has exactly one TOP-LEVEL `dependencies {` (the regex
    // anchors on a newline, so nested blocks can't match).
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(\ndependencies\s*\{\n)/,
      `$1${lines.join('\n')}\n`,
    );
    return cfg;
  });
}

// ── Android: extra maven repos (Pangle only, so far) ───────────────────────
function withAndroidRepos(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    const urls = [...new Set(on().flatMap(a => a.androidMavenRepos ?? []))]
      .filter(u => !cfg.modResults.contents.includes(u));
    if (!urls.length) return cfg;
    const lines = urls.map(u => `    maven { url "${u}" } // ${MARKER}`);
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(allprojects\s*\{\s*\n\s*repositories\s*\{\s*\n)/,
      `$1${lines.join('\n')}\n`,
    );
    return cfg;
  });
}

// ── iOS: pods ──────────────────────────────────────────────────────────────
function withIosPods(config) {
  return withDangerousMod(config, ['ios', (cfg) => {
    const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
    let contents = fs.readFileSync(podfile, 'utf8');
    const lines = on()
      .filter(a => !contents.includes(`pod '${a.iosPod}'`))
      .map(a => `  pod '${a.iosPod}', '${a.iosPodVersion}' # ${MARKER}: ${a.label}`);
    if (lines.length) {
      // `use_expo_modules!` is the one anchor inside the app target that's stable
      // across Expo SDK versions.
      contents = contents.replace(/(\n\s*use_expo_modules!\n)/, `$1${lines.join('\n')}\n`);
    }
    // InMobi needs -ObjC. Adding it in post_install is the CocoaPods-safe spot:
    // it survives `pod install` regenerating the project.
    if (on().some(a => a.iosNeedsObjCLinkerFlag) && !contents.includes(`${MARKER}-objc`)) {
      const block = [
        `    # ${MARKER}-objc — InMobi's adapter requires -ObjC in OTHER_LDFLAGS.`,
        '    installer.pods_project.targets.each do |t|',
        '      t.build_configurations.each do |c|',
        "        flags = c.build_settings['OTHER_LDFLAGS'] || ['$(inherited)']",
        '        flags = [flags] if flags.is_a?(String)',
        "        c.build_settings['OTHER_LDFLAGS'] = flags | ['-ObjC']",
        '      end',
        '    end',
      ].join('\n');
      contents = contents.replace(/(\n\s*post_install do \|installer\|\n)/, `$1${block}\n`);
    }
    fs.writeFileSync(podfile, contents);
    return cfg;
  }]);
}

// ── iOS: SKAdNetwork ────────────────────────────────────────────────────────
// react-native-google-mobile-ads' own plugin writes AdMob's standard 50-ID list
// from app.json. We only MERGE in whatever an enabled adapter needs on top of
// that (deduped), so the two plugins can't fight over the array.
function withIosSkAdNetwork(config) {
  return withInfoPlist(config, (cfg) => {
    const needed = [...new Set(on().flatMap(a => a.skAdNetworkIds ?? []))];
    if (!needed.length) return cfg;
    const list = cfg.modResults.SKAdNetworkItems ?? [];
    const have = new Set(list.map(i => i.SKAdNetworkIdentifier));
    for (const id of needed) {
      if (!have.has(id)) list.push({ SKAdNetworkIdentifier: id });
    }
    cfg.modResults.SKAdNetworkItems = list;
    return cfg;
  });
}

module.exports = function withAdMobMediation(config) {
  return withIosSkAdNetwork(withIosPods(withAndroidRepos(withAndroidDeps(config))));
};

// Exported for the unit test, which guards the invariants that actually bite:
// every enabled adapter has both platforms filled in, versions are pinned (never
// floating), and Pangle can't be enabled without its maven repo.
module.exports.ADAPTERS = ADAPTERS;
