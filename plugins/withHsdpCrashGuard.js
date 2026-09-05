// Guard against a crash inside Google's Play "hsdp" library (bundled
// transitively by the Google Mobile Ads SDK; we do not reference it ourselves).
//
// Crashlytics issue 80e49a5e (seen on 1.4.2 (32), 2026-08-31):
//   IllegalStateException: targetPackageName is null
//     at com.google.android.play.core.hsdp.service.HsdpShimActivity.zzd(hsdp@@2.0.1)
//     at HsdpShimActivity.onAttachedToWindow
//
// The shim activity is launched (by the ads/Play install flow) and validates
// `intent.getStringExtra("target_package_name")` only at window-attach time;
// null → throw → process death. There is nothing to upgrade our way out of:
// GMA 25.4.0 (latest) still pins hsdp 2.0.1, and disassembly of hsdp 2.1.0
// (latest) shows the identical unguarded throw (verified 2026-09-05, javap
// diff of both AARs). The launching side lives in Play/GMA, outside our APK.
//
// Fix: mirror Google's own null-check one step earlier. In onActivityCreated —
// which runs before the first window traversal — detect the shim launched
// without its required extra (the 100%-crash configuration) and finish() it,
// so onAttachedToWindow never runs. Launches that carry the extra proceed
// untouched; a doomed launch now closes silently instead of killing the app.
//
// android/ is CNG-generated — this plugin is the durable home, never the .kt.
const { withMainApplication } = require('expo/config-plugins');

const ANCHOR = 'super.onCreate()';
const MARKER = 'withHsdpCrashGuard#finish';
const SNIPPET = `
    // ${MARKER}: Google's HsdpShimActivity (Play hsdp lib, pulled in by the ads
    // SDK) throws "targetPackageName is null" in onAttachedToWindow when its
    // launch intent lacks the extra — unfixable upstream as of hsdp 2.1.0.
    // Finish that doomed launch before the window attaches; see
    // plugins/withHsdpCrashGuard.js for the full receipt.
    registerActivityLifecycleCallbacks(object : android.app.Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: android.app.Activity, savedInstanceState: android.os.Bundle?) {
        if (activity.javaClass.name == "com.google.android.play.core.hsdp.service.HsdpShimActivity") {
          val target = try { activity.intent?.getStringExtra("target_package_name") } catch (_: Throwable) { null }
          if (target == null) activity.finish()
        }
      }
      override fun onActivityStarted(activity: android.app.Activity) = Unit
      override fun onActivityResumed(activity: android.app.Activity) = Unit
      override fun onActivityPaused(activity: android.app.Activity) = Unit
      override fun onActivityStopped(activity: android.app.Activity) = Unit
      override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: android.os.Bundle) = Unit
      override fun onActivityDestroyed(activity: android.app.Activity) = Unit
    })`;

module.exports = function withHsdpCrashGuard(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') return cfg; // template is Kotlin; bail on java
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;
    const at = src.indexOf(ANCHOR);
    if (at === -1) {
      throw new Error(`withHsdpCrashGuard: "${ANCHOR}" not found in MainApplication — template changed, re-anchor the plugin`);
    }
    const insertAt = at + ANCHOR.length;
    cfg.modResults.contents = src.slice(0, insertAt) + SNIPPET + src.slice(insertAt);
    return cfg;
  });
};
