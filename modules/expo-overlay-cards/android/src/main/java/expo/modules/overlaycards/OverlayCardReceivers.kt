package expo.modules.overlaycards

import android.app.ActivityManager
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

// The alarm lands here — possibly in a process the OS just cold-started, with
// no React, no JS, no Activity. Everything it needs was written ahead of time
// by OverlayCardStore. The rule set, in firing order:
//
//   1. ALWAYS re-arm tomorrow first. A crash below must not kill the schedule.
//   2. Overlay permission gone, or no card configured, or already shown today
//      → done (no retry; none of those heal within a retry window).
//   3. Screen off / keyguard up → retry in 8 min (max 5). This is what makes
//      the card meet her when she PICKS UP the phone rather than firing into a
//      dark pocket — the same behaviour the reference app shows (its 12:31 and
//      12:46 screenshots are the same daily card catching two unlocks).
//   4. Our own app is foreground → retry too. The in-app nudge system owns
//      that surface; a system-window card over our own UI would double up.
class OverlayCardAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val ctx = context.applicationContext
    val slot = intent.getStringExtra("slot") ?: return
    val card = OverlayCardStore.cardForSlot(ctx, slot) ?: return

    OverlayCardScheduler.armNext(ctx, card)
    // Daily heartbeat for the unlock listener — brings the service back after
    // an OEM kill even if the app is never opened.
    OverlayCardService.ensure(ctx)

    if (!canDrawOverlays(ctx)) return

    if (!screenUsable(ctx) || OverlayCardGate.ownAppForeground(ctx)) {
      // The unlock listener normally catches the next pickup; the short retry
      // ladder stays as the belt for the window where the service was killed
      // and its heartbeat hasn't landed yet.
      if (OverlayCardStore.bumpRetry(ctx, slot, OverlayCardScheduler.RETRY_MAX)) {
        OverlayCardScheduler.armRetry(ctx, slot)
      }
      return
    }

    // The alarm is just an anchor moment — the rotation decides WHAT shows
    // (least-shown eligible card; owner 2026-08-21). recordShow happens inside,
    // BEFORE the window goes up, so a mid-addView throw costs a phantom count
    // rather than a retry loop over a half-built window.
    OverlayCardGate.attemptShow(ctx)
  }

  private fun canDrawOverlays(ctx: Context): Boolean = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(ctx) else true
  } catch (e: Throwable) { false }

  private fun screenUsable(ctx: Context): Boolean = try {
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val km = ctx.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    (pm?.isInteractive == true) && (km?.isKeyguardLocked != true)
  } catch (e: Throwable) { false }

}

// AlarmManager forgets everything on power-off. The app may not be opened for
// days after a reboot, so the schedule must come back on its own.
class OverlayCardBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val ctx = context.applicationContext
    val cards = OverlayCardStore.readCards(ctx)
    if (cards.isNotEmpty()) {
      OverlayCardScheduler.rescheduleAll(ctx, cards)
      OverlayCardService.ensure(ctx)
    }
  }
}
