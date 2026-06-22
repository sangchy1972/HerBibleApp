// Fixes the iOS build errors that come from @react-native-firebase requiring
// STATIC FRAMEWORKS on iOS (expo-build-properties ios.useFrameworks = "static").
//
// Two distinct symptoms, two Podfile patches (both applied here during prebuild,
// before `pod install`; idempotent via markers):
//
//  1. "include of non-modular header inside framework module 'RNFBApp...'
//      '.../React-Core/React/RCTConvert.h' [-Wnon-modular-include-in-framework-module]"
//     → set CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES on every
//       Pods target via the post_install hook.
//
//  2. "declaration of 'RCTBridgeModule' must be imported from module
//      'RNFBApp.RNFBAppModule' before it is required" + RCT_EXPORT_METHOD macro
//      expansion errors (implicit int / expected ')' / param 'crash' not declared)
//     → set the global `$RNFirebaseAsStaticFramework = true`, which makes the
//       react-native-firebase pods build as proper static-framework MODULES so
//       their bridge macros resolve. This is the canonical rnfirebase.io fix for
//       use_frameworks!.
//
// expo-build-properties exposes neither setting, so we patch the generated
// Podfile ourselves. Pattern mirrors the other custom plugins in this folder.

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const GLOBAL_FLAG = '$RNFirebaseAsStaticFramework = true';
const TARGET_ANCHOR_RE = /^target ['"].+['"] do$/m;

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

      // (2) Build RN Firebase as static framework modules — insert the global
      // flag just above the first `target ... do` block so it's set before the
      // RNFB pods are resolved.
      if (!contents.includes(GLOBAL_FLAG)) {
        contents = contents.replace(TARGET_ANCHOR_RE, (m) => `${GLOBAL_FLAG}\n\n${m}`);
      }

      // (1) Allow the non-modular React-Core includes inside framework modules.
      if (!contents.includes(ALLOW_MARKER) && contents.includes(POST_INSTALL_ANCHOR)) {
        contents = contents.replace(POST_INSTALL_ANCHOR, `${POST_INSTALL_ANCHOR}\n${ALLOW_BODY}`);
      }

      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
