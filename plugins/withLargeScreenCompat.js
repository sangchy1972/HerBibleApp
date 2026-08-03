const { withAndroidManifest } = require('expo/config-plugins');

// Keep portrait on tablets and foldables for one more SDK level.
//
// Apps targeting Android 16 (API 36) have their orientation, aspect-ratio and
// resizability restrictions IGNORED on any display whose smallest width is
// >= 600dp. `app.json`'s `"orientation": "portrait"` therefore stops applying
// on tablets and unfolded foldables the moment this build ships, and every
// screen in this app is laid out for a phone (CLAUDE.md: iPhone SE → Pro Max).
// The reward art, the jigsaw board and the centred nudge cards would all be
// stretched across a landscape tablet nobody designed for.
//
// PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY is Google's documented opt-out.
//
// ⚠️ IT DIES AT API 37. Google removes the opt-out entirely for apps targeting
// 37+, at which point the layouts have to actually be adaptive. This buys one
// release cycle, not a solution. Same deadline as the predictive-back opt-out
// in `android.predictiveBackGestureEnabled` — revisit both together.
const PROPERTY = 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY';

module.exports = function withLargeScreenCompat(config) {
  return withAndroidManifest(config, cfg => {
    const app = cfg.modResults?.manifest?.application?.[0];
    // Fail soft. A manifest shape we do not recognise must not take the whole
    // prebuild down on build day; losing the opt-out only affects tablets.
    if (!app) return cfg;
    app.property = (app.property || []).filter(
      p => p?.$?.['android:name'] !== PROPERTY,
    );
    app.property.push({ $: { 'android:name': PROPERTY, 'android:value': 'true' } });
    return cfg;
  });
};
