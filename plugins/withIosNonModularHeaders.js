// Companion Podfile patch for building @react-native-firebase on iOS with
// static frameworks on Expo SDK 54 / RN 0.81 (the "prebuilt React Native core"
// era). The PRIMARY fix lives in app.json:
//   expo-build-properties → ios.forceStaticLinking: [RNFBApp, RNFBAuth,
//   RNFBAnalytics, RNFBCrashlytics]
// which force-static-links the RNFB pods so they work with the prebuilt
// React-Core. See react-native-firebase #8657 / expo #39607.
//
// This plugin adds the documented companion workaround (expo #39607): set
//   CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES
// on every Pods target, which clears the
//   "include of non-modular header inside framework module 'RNFBApp...'
//    '.../React-Core/React/RCTConvert.h' [-Wnon-modular-include-in-framework-module]"
// error that static frameworks otherwise raise on React-Core's headers.
//
// expo-build-properties has no hook for an arbitrary Pods build setting, so we
// patch the generated Podfile during prebuild (before `pod install`).
// Idempotent via a marker. Pattern mirrors the other custom plugins here.

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const POST_INSTALL_ANCHOR = 'post_install do |installer|';
const ALLOW_MARKER = 'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES';
const ALLOW_BODY = [
  '    installer.pods_project.targets.each do |target|',
  '      target.build_configurations.each do |bc|',
  "        bc.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
  '      end',
  '    end',
].join('\n');

module.exports = function withIosNonModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (!contents.includes(ALLOW_MARKER) && contents.includes(POST_INSTALL_ANCHOR)) {
        contents = contents.replace(POST_INSTALL_ANCHOR, `${POST_INSTALL_ANCHOR}\n${ALLOW_BODY}`);
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);
};
