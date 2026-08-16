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
