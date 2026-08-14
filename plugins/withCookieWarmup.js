// Pre-warms the WebView CookieManager on a BACKGROUND thread at process start.
//
// WHY (Play ANR, trace-confirmed 2026-08-14, Android 11, issue
// "ForwardingCookieHandler.getCookies"): React Native wires a cookie jar into
// EVERY fetch. The first fetch of the process therefore does the FIRST-TOUCH
// WebView initialization on an OkHttp thread:
//
//   okhttp3 BridgeInterceptor → ReactCookieJarContainer → ForwardingCookieHandler
//     → CookieManager.getInstance → WebViewFactory.getProvider
//     → ContextImpl.createApplicationContext → getDisplayId
//     → DisplayManagerGlobal.getDisplayInfo   ← takes the process-wide DMG lock
//     → binder IDisplayManager.getDisplayInfo ← hung >5s on a busy system_server
//
// While that binder call hung, the OkHttp thread HELD the DisplayManagerGlobal
// lock — and the main thread, running ReactRootView's layout-time orientation
// check (Display.getRotation), blocked on the same lock. Input dispatch timed
// out: ANR. The trigger fetch was the ad-config refresh (everlandapps.com),
// but any first fetch reproduces it.
//
// The fix: make the first touch happen HERE, on a throwaway thread, in
// Application.onCreate — before React attaches its root view and its layout
// listener starts taking display locks on the main thread. getInstance()
// caches the provider process-wide, so every later fetch's cookie hop becomes
// a cheap map lookup and never enters WebViewFactory again. If the binder is
// slow at startup, the background thread eats the wait harmlessly.
//
// Residual risk, stated: a device whose system_server stalls >5s can still ANR
// anything that touches the DMG lock; this removes OUR standing trigger, it
// does not fix broken system servers.
//
// android/ is CNG-generated — this plugin is the durable home, never the .kt.
const { withMainApplication } = require('expo/config-plugins');

const MARKER = 'withCookieWarmup';
// Injected AFTER super.onCreate(): the app context must exist, and nothing
// else in onCreate depends on cookies, so the thread races nobody.
const ANCHOR = 'super.onCreate()';
const SNIPPET = `
    // ${MARKER}: first-touch WebView/CookieManager init OFF the main thread and
    // OFF the request path (Play ANR 2026-08-14 — see plugins/withCookieWarmup.js).
    Thread {
      try {
        android.webkit.CookieManager.getInstance()
      } catch (_: Throwable) {
        // No WebView on this device — RN's cookie jar will no-op the same way.
      }
    }.start()`;

module.exports = function withCookieWarmup(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') return cfg;      // template is Kotlin; bail on java
    const src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;                  // idempotent across prebuilds
    const at = src.indexOf(ANCHOR);
    if (at === -1) {
      throw new Error(`withCookieWarmup: "${ANCHOR}" not found in MainApplication — template changed, re-anchor the plugin`);
    }
    const insertAt = at + ANCHOR.length;
    cfg.modResults.contents = src.slice(0, insertAt) + SNIPPET + src.slice(insertAt);
    return cfg;
  });
};
