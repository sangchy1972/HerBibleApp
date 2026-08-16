package expo.modules.overlaycards

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JS-facing API for the daily overlay cards. All heavy lifting lives in the
// static objects (OverlayCardStore / Scheduler / WindowController) because the
// alarm path runs without any module instance — this class is only the bridge.
class OverlayCardsModule : Module() {
  private val ctx: Context?
    get() = try { appContext.reactContext?.applicationContext } catch (e: Throwable) { null }

  override fun definition() = ModuleDefinition {
    Name("ExpoOverlayCards")

    // "Appear on top" — granted on a Settings page, never via a runtime dialog.
    Function("canDrawOverlays") {
      val c = ctx ?: return@Function false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(c) else true
      } catch (e: Throwable) { false }
    }

    Function("openOverlaySettings") {
      val c = ctx ?: return@Function false
      try {
        c.startActivity(
          Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${c.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
      } catch (e: Throwable) { false }
    }

    // Persist today's pre-localized content + (re)arm the two daily alarms.
    // Validation happens inside writeConfig — a bad payload leaves the previous
    // config serving rather than half-applying.
    Function("configure") { json: String ->
      val c = ctx ?: return@Function false
      try { OverlayCardStore.writeConfig(c, json); true } catch (e: Throwable) { false }
    }

    Function("cancelAll") {
      val c = ctx ?: return@Function false
      try { OverlayCardStore.clearConfig(c); OverlayCardWindowController.dismiss(); true } catch (e: Throwable) { false }
    }

    // ── MIUI extras ──────────────────────────────────────────────────────────
    // Xiaomi/Redmi/POCO additionally gate overlays shown from the background
    // behind their own "Display pop-up windows while running in the background"
    // permission (MIUI permission editor, not an Android one). Owner 2026-08-16:
    // ask for it. The JS side decides WHEN (device check + funnel); these two
    // just open the page and best-effort read the state.

    // MIUI's per-app permission editor. Two known activity names across MIUI
    // versions; falls back to the app-details page rather than failing.
    Function("openMiuiPermissionEditor") {
      val c = ctx ?: return@Function false
      val attempts = listOf(
        "com.miui.securitycenter" to "com.miui.permcenter.permissions.PermissionsEditorActivity",
        "com.miui.securitycenter" to "com.miui.permcenter.permissions.AppPermissionsEditorActivity",
      )
      var opened = false
      for ((pkg, cls) in attempts) {
        if (opened) break
        try {
          c.startActivity(
            Intent("miui.intent.action.APP_PERM_EDITOR")
              .setClassName(pkg, cls)
              .putExtra("extra_pkgname", c.packageName)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
          opened = true
        } catch (e: Throwable) { /* try the next known activity */ }
      }
      if (!opened) {
        try {
          c.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${c.packageName}"))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
          opened = true
        } catch (e: Throwable) { }
      }
      opened
    }

    // MIUI "background pop-up" state via AppOps op 10021 (MIUI-private), read
    // reflectively. 1 = allowed, 0 = denied, -1 = unknown (non-MIUI, blocked
    // reflection, anything) — callers must treat -1 as "show the step".
    Function("miuiBackgroundPopupAllowed") {
      val c = ctx ?: return@Function -1
      try {
        val ops = c.getSystemService(Context.APP_OPS_SERVICE) ?: return@Function -1
        val m = ops.javaClass.getMethod(
          "checkOpNoThrow",
          Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, String::class.java,
        )
        val mode = m.invoke(ops, 10021, android.os.Process.myUid(), c.packageName) as Int
        if (mode == 0) 1 else 0     // AppOpsManager.MODE_ALLOWED == 0
      } catch (e: Throwable) { -1 }
    }

    // Milliseconds since a card was last tapped, -1 if never. Read by the ad
    // layer at hot-start-decision time — an entry that BEGAN on a devotional
    // card must not open with an interstitial.
    Function("msSinceLastOverlayTap") {
      val c = ctx ?: return@Function -1.0
      try { OverlayCardStore.msSinceTap(c) } catch (e: Throwable) { -1.0 }
    }

    // Analytics queued by the cold receiver path, JSON array — the app drains
    // this on foreground and feeds logEvent().
    Function("drainEvents") {
      val c = ctx ?: return@Function "[]"
      try { OverlayCardStore.drainEvents(c) } catch (e: Throwable) { "[]" }
    }

    // Show one card immediately, bypassing schedule + shown-today guards (but
    // not the permission). Drives the dev preview and lets the owner demo it.
    Function("preview") { slot: String ->
      val c = ctx ?: return@Function false
      val allowed = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(c) else true
      } catch (e: Throwable) { false }
      if (!allowed) return@Function false
      val card = OverlayCardStore.cardForSlot(c, slot) ?: return@Function false
      OverlayCardWindowController.show(c, card)
      true
    }

    // A JS reload or Activity teardown must not strand a card mid-animation;
    // the scheduled path re-creates its own windows without any module alive.
    OnDestroy { OverlayCardWindowController.dismiss() }
  }
}
