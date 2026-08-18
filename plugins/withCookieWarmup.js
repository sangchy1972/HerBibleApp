// Two layers of cold-start WebView/cookie hygiene, injected into
// MainApplication.onCreate. Both exist because of trace-confirmed Play ANRs.
//
// LAYER 1 — remove the trigger (added 2026-08-17, ANR batch traces 1/4):
// React Native wires a WebView-backed cookie jar into EVERY fetch, so the
// process's first fetch does the first-touch WebView initialization on an
// OkHttp thread:
//
//   okhttp3 BridgeInterceptor → ReactCookieJarContainer → ForwardingCookieHandler
//     → CookieManager.getInstance → WebViewFactory.getProvider
//     → ContextImpl.createApplicationContext → getDisplayId
//     → DisplayManagerGlobal.getDisplayInfo   ← takes the process-wide DMG lock
//     → binder IDisplayManager.getDisplayInfo ← hung >5s on a busy system_server
//
// While that binder call hung, the OkHttp thread HELD the DisplayManagerGlobal
// lock — and the main thread, running ReactRootView's layout-time orientation
// check (Display.getRotation), blocked on the same lock → ANR.
//
// This app needs NO cookies in the RN fetch layer (CDN is public, Cloudflare
// Access is header-based, Firebase is native-SDK networking, no WebSockets, no
// clearCookies anywhere — audited 2026-08-17). So the factory below hands RN an
// OkHttp client with CookieJar.NO_COOKIES: the cookie hop disappears from the
// request path entirely, on every device, regardless of timing. Safe because
// RN 0.81's NetworkingModule does `if (cookieJar is CookieJarContainer)` — a
// checked cast — and `cookieJarContainer?.` no-ops when it isn't one. The
// builder mirrors RN's own createClientBuilder(context) (10MB cache included).
//
// LAYER 2 — pre-warm what's left (original fix 2026-08-14): other WebView
// consumers still exist (UMP's consent form IS a WebView; WebSettings
// .getDefaultUserAgent in its worker). Warm the provider once, on a throwaway
// thread, at process start, so their first touch is a cheap cached lookup.
//
// Residual risk, stated: a device whose system_server stalls >5s can still ANR
// anything that touches the DMG lock; these remove OUR standing triggers, they
// do not fix broken system servers.
//
// android/ is CNG-generated — this plugin is the durable home, never the .kt.
const { withMainApplication } = require('expo/config-plugins');

const ANCHOR = 'super.onCreate()';

// Injected AFTER super.onCreate(): the app context must exist, and the factory
// must be installed before React creates its NetworkingModule (which happens
// at JS load, long after onCreate).
// NOT okhttp3.CookieJar.NO_COOKIES — that was a guaranteed cold-start crash
// (caught by the 2026-08-17 swarm review before it ever shipped): the factory
// client feeds EVERY OkHttpClientProvider consumer, and two of them cast the
// jar UNCHECKED — FrescoModule.kt:161 `client.cookieJar() as CookieJarContainer`
// (needsEagerInit, runs during React startup) and ExpoFetchModule.kt:31/47
// (every Expo app registers it; OnCreate forces the lazy). Only
// NetworkingModule type-checks. So the jar must IMPLEMENT CookieJarContainer:
// the casts succeed, setCookieJar() silently discards the WebView-backed
// JavaNetCookieJar all three try to wire in, and loadForRequest returns empty
// without ever touching ForwardingCookieHandler → the WebView cookie hop is
// gone from RN fetch AND Fresco image requests alike.
const MARKER_JAR = 'withCookieWarmup#inertjar';
const SNIPPET_JAR = `
    // ${MARKER_JAR}: RN fetches carry no cookies in this app — hand React a
    // cookie-inert client so the first fetch can never do first-touch WebView
    // init on an OkHttp thread (Play ANR batch 2026-08-17). The jar implements
    // CookieJarContainer because FrescoModule and ExpoFetchModule cast it
    // UNCHECKED at startup; setCookieJar discards the WebView-backed jar they
    // try to install. ONE client, built once: every OkHttpClientProvider
    // consumer (NetworkingModule, Fresco images, ExpoFetch) shares it, so the
    // 10MB disk cache exists exactly once — stock RN already ran two Cache
    // instances over the same http-cache directory, and a fresh-per-call
    // factory made it three (DiskLruCache journal contention; swarm r2).
    // Consumers that need extras derive via newBuilder(), which shares the
    // same Cache object — the supported pattern.
    val cookieInertClient = com.facebook.react.modules.network.OkHttpClientProvider
      .createClientBuilder(applicationContext)
      .cookieJar(object : com.facebook.react.modules.network.CookieJarContainer {
        override fun loadForRequest(url: okhttp3.HttpUrl): List<okhttp3.Cookie> = emptyList()
        override fun saveFromResponse(url: okhttp3.HttpUrl, cookies: List<okhttp3.Cookie>) = Unit
        override fun setCookieJar(cookieJar: okhttp3.CookieJar) = Unit
        override fun removeCookieJar() = Unit
      })
      .build()
    com.facebook.react.modules.network.OkHttpClientProvider.setOkHttpClientFactory { cookieInertClient }`;

const MARKER_WARM = 'withCookieWarmup#warm';
const SNIPPET_WARM = `
    // ${MARKER_WARM}: first-touch WebView/CookieManager init OFF the main thread
    // for the WebView consumers that remain (UMP consent form et al.) —
    // Play ANR 2026-08-14, see plugins/withCookieWarmup.js.
    Thread {
      try {
        android.webkit.CookieManager.getInstance()
      } catch (_: Throwable) {
        // No WebView on this device — everything above no-ops the same way.
      }
    }.start()`;

module.exports = function withCookieWarmup(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') return cfg;      // template is Kotlin; bail on java
    let src = cfg.modResults.contents;
    // Independent idempotency per layer, so a template that already carries one
    // still gains the other.
    for (const [marker, snippet] of [[MARKER_WARM, SNIPPET_WARM], [MARKER_JAR, SNIPPET_JAR]]) {
      if (src.includes(marker)) continue;
      const at = src.indexOf(ANCHOR);
      if (at === -1) {
        throw new Error(`withCookieWarmup: "${ANCHOR}" not found in MainApplication — template changed, re-anchor the plugin`);
      }
      const insertAt = at + ANCHOR.length;
      src = src.slice(0, insertAt) + snippet + src.slice(insertAt);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
