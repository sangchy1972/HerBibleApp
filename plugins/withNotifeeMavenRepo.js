// Adds Notifee's bundled local maven repo to the ROOT android/build.gradle.
//
// @notifee/react-native ships its core AAR (app.notifee:core) inside the npm
// package at android/libs — it exists in NO public repository. Notifee's own
// module build.gradle tries to inject the repo via `rootProject.allprojects`,
// but on this project's Gradle (8.14 / AGP from Expo SDK 54) that injection
// runs too late and :app dependency resolution fails with
// "Could not find any matches for app.notifee:core:+" (reproduced locally
// 2026-07-11; adding the repo at the root level fixes the build).
//
// Since /android is prebuild-generated (CNG) and gitignored, the fix must be
// applied by a config plugin so BOTH local `expo run:android` and EAS builds
// get it after every fresh prebuild.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = 'withNotifeeMavenRepo';
const REPO_LINE = `    maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" } // ${MARKER}`;

module.exports = function withNotifeeMavenRepo(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;       // only patch Groovy build.gradle
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    // Insert into the allprojects { repositories { ... } } block, right after
    // its opening line — the template always contains this block.
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(allprojects\s*\{\s*\n\s*repositories\s*\{\s*\n)/,
      `$1${REPO_LINE}\n`,
    );
    return cfg;
  });
};
