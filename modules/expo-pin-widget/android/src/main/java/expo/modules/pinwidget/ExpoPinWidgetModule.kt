package expo.modules.pinwidget

import android.appwidget.AppWidgetManager
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Pins the app's home-screen widget via AppWidgetManager.requestPinAppWidget
// (Android 8.0+, supported launchers). This is the ONLY sanctioned way to add
// a widget programmatically — the launcher shows ITS OWN confirmation before
// placing it, so the user always opts in. Fully Google Play compliant: we
// never silently modify the home screen.
//
// The app ships a single widget provider (verseOfDay, registered 4×2 by
// react-native-android-widget), so we just resolve this app's own installed
// provider rather than hard-coding a class name.
class ExpoPinWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoPinWidget")

    // True only on API 26+ AND a launcher that accepts pin requests
    // (Pixel/One UI/most modern launchers do; some don't).
    Function("isPinSupported") {
      val ctx = appContext.reactContext
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && ctx != null) {
        AppWidgetManager.getInstance(ctx)?.isRequestPinAppWidgetSupported ?: false
      } else {
        false
      }
    }

    // Fires the system pin dialog for this app's widget. Resolves true if the
    // request was accepted by the launcher, false otherwise (unsupported /
    // older OS / no provider / error) so JS can fall back to manual steps.
    AsyncFunction("requestPin") { promise: Promise ->
      try {
        val ctx = appContext.reactContext
        val mgr = if (ctx != null) AppWidgetManager.getInstance(ctx) else null
        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          mgr?.isRequestPinAppWidgetSupported == true
        if (ctx != null && mgr != null && supported) {
          val mine = mgr.installedProviders.firstOrNull {
            it.provider.packageName == ctx.packageName
          }
          if (mine != null) {
            promise.resolve(mgr.requestPinAppWidget(mine.provider, null, null))
          } else {
            promise.resolve(false)
          }
        } else {
          promise.resolve(false)
        }
      } catch (e: Throwable) {
        promise.resolve(false)
      }
    }
  }
}
