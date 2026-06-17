// Includes native debug symbols in the release AAB so Google Play can
// symbolicate NATIVE (NDK) crash + ANR stacks (Play Console → Android vitals).
//
// These symbols live under BUNDLE-METADATA/com.android.tools.build.debugsymbols
// and are uploaded ONLY for Play's symbolication — they are NEVER delivered to
// users, so this has ZERO impact on the app download size. It only enlarges the
// uploaded AAB (~a few MB at SYMBOL_TABLE level). Worth it: it clears the Play
// "App Bundle contains native code … no debug symbols" warning and makes native
// crash reports actionable.
//
// `SYMBOL_TABLE` keeps function names (good stacks) while staying much smaller
// than `FULL` (which also embeds line numbers). Bump to 'FULL' if you need
// line-level native traces.
//
// expo-build-properties has no option for this, so we append a release `ndk`
// block. Gradle merges multiple `android { }` closures, so appending is safe.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'withNativeDebugSymbols';
const SNIPPET = `
// ${MARKER}: bundle native debug symbols for Play crash symbolication
// (not delivered to users — zero download-size impact).
android {
    buildTypes {
        release {
            ndk {
                debugSymbolLevel 'SYMBOL_TABLE'
            }
        }
    }
}
`;

module.exports = function withNativeDebugSymbols(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;       // only patch Groovy build.gradle
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
