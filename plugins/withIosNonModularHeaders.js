// Fixes the iOS build error:
//   include of non-modular header inside framework module 'RNFBApp...'
//   '.../React-Core/React/RCTConvert.h' [-Werror,-Wnon-modular-include-in-framework-module]
//
// Cause: @react-native-firebase REQUIRES static frameworks on iOS
// (expo-build-properties ios.useFrameworks = "static"), but with frameworks
// enabled Xcode treats React-Core's non-modular headers (which RNFBApp's
// Obj-C imports) as an error under -Werror. The canonical react-native-firebase
// fix is to set CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES on
// every Pods target via the Podfile post_install hook.
//
// expo-build-properties has no generic "set an arbitrary Pods build setting"
// option, so we patch the generated Podfile ourselves during prebuild (before
// `pod install`). Idempotent — guarded by a marker so repeated prebuilds don't
// inject twice. Pattern mirrors the other custom plugins in this folder.

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ANCHOR = 'post_install do |installer|';
const MARKER = 'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES';
const INJECT_BODY = [
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
      if (!contents.includes(MARKER) && contents.includes(ANCHOR)) {
        contents = contents.replace(ANCHOR, `${ANCHOR}\n${INJECT_BODY}`);
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);
};
