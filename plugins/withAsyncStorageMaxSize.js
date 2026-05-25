// Ensures `AsyncStorage_db_size_in_MB=50` lives in `android/gradle.properties`
// after every `expo prebuild`. Without this, the default 6 MB SQLite cap on
// @react-native-async-storage/async-storage raises SQLITE_FULL[13] once any
// of the larger Bible translations is cached client-side (KJV English alone
// runs ~5-8 MB uncompressed once all chapters land in `bible:ch:*` keys).
// See `src/services/bibleService.ts:40-48` for the matching code-side note.
//
// expo-build-properties has no generic "set arbitrary gradle property" hook,
// so we write our own. Pattern mirrors `withAndroidPackageQueries.js`.

const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'AsyncStorage_db_size_in_MB';
const VALUE = '50';

module.exports = function withAsyncStorageMaxSize(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    // Drop any prior entry first so we don't accumulate duplicates over
    // repeated prebuilds.
    const idx = props.findIndex((p) => p.type === 'property' && p.key === KEY);
    if (idx >= 0) props.splice(idx, 1);
    props.push({ type: 'property', key: KEY, value: VALUE });
    return cfg;
  });
};
