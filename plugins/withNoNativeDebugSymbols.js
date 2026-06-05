// Keeps native debug symbols (the ~25 MB of `*.so.sym` under
// BUNDLE-METADATA/com.android.tools.build.debugsymbols) OUT of the release AAB.
//
// Those symbols are uploaded only so Play can symbolicate NATIVE crash stacks —
// they are never delivered to users. We already ship Crashlytics for crash
// reporting, so dropping them shaves the AAB file with ZERO runtime impact.
//
// expo-build-properties has no option for this, so we append a release `ndk`
// block. Gradle merges multiple `android { }` closures, so appending is additive
// and safe. Pattern mirrors the repo's other config plugins.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'withNoNativeDebugSymbols';
const SNIPPET = `
// ${MARKER}: do not bundle native debug symbols into the release AAB (~25 MB).
android {
    buildTypes {
        release {
            ndk {
                debugSymbolLevel 'none'
            }
        }
    }
}
`;

module.exports = function withNoNativeDebugSymbols(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;       // only patch Groovy build.gradle
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
