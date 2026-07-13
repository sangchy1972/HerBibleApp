// Pins the ROOT kotlin-gradle-plugin classpath to an explicit version.
//
// Why: react-native-google-mobile-ads 16.4+ pulls play-services-ads 25.4.0,
// whose Kotlin metadata is 2.3.0. RN 0.81's gradle plugin resolves the
// template's version-less `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')`
// to its own pinned Kotlin 2.1.20, whose compiler cannot read 2.3.0 metadata —
// every non-Expo native module (RNGMA included) then fails with "Module was
// compiled with an incompatible version of Kotlin". expo-build-properties'
// android.kotlinVersion only reaches Expo modules (ExpoRootProjectPlugin ext),
// NOT this root classpath, so the pin must be written into the generated
// build.gradle at prebuild time (local run:android AND EAS).
// 2.2.x readers accept 2.3.0 metadata; 2.2.20 matches the Expo-side
// kotlinVersion set in app.json's expo-build-properties config.
const { withProjectBuildGradle } = require('expo/config-plugins');

const KOTLIN = '2.2.20';

module.exports = function withKotlinGradlePlugin(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[\d.]+)?['"]\)/,
      `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN}')`,
    );
    return cfg;
  });
};
