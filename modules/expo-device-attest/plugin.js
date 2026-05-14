/**
 * Expo config plugin for expo-device-attest.
 *
 * iOS:  injects the com.apple.developer.devicecheck.appattest-environment
 *       entitlement so DCAppAttestService is allowed in production builds.
 *
 * Android: nothing to do at config time. The Play Integrity library is wired
 *       in via this module's android/build.gradle, and the app must already
 *       be registered for Play Integrity in the Google Play Console (per the
 *       Cloud Project Number used at runtime).
 *
 * Usage in app.json:
 *   "plugins": [
 *     ["./modules/expo-device-attest/plugin", { "environment": "production" }]
 *   ]
 */

const { withEntitlementsPlist } = require('@expo/config-plugins');

const withAppAttestEntitlement = (config, props = {}) => {
  const environment = props.environment === 'development' ? 'development' : 'production';
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.devicecheck.appattest-environment'] = environment;
    return cfg;
  });
};

module.exports = withAppAttestEntitlement;
