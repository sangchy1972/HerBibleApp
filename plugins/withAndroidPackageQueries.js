// Adds <queries><package /></queries> entries to AndroidManifest.xml so that
// Linking.canOpenURL('whatsapp://...') etc. resolves true on Android 11+.
// Replaces the (invalid) "android.queries" field that was sitting in app.json.
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGES = [
  'com.facebook.katana',
  'com.whatsapp',
  'com.instagram.android',
];

module.exports = function withAndroidPackageQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries ?? [];
    let queries = manifest.queries[0];
    if (!queries) {
      queries = { package: [] };
      manifest.queries.push(queries);
    }
    queries.package = queries.package ?? [];
    for (const name of PACKAGES) {
      const exists = queries.package.some((p) => p?.$?.['android:name'] === name);
      if (!exists) queries.package.push({ $: { 'android:name': name } });
    }
    return cfg;
  });
};
