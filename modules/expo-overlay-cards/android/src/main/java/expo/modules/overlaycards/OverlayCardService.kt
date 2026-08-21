package expo.modules.overlaycards

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.provider.Settings

// The unlock listener — what turns the daily cards from a timed lottery into
// the reference app's "it meets me when I pick up the phone" behaviour
// (owner decision 2026-08-18, Option A, costs accepted).
//
// ACTION_USER_PRESENT is not delivered to manifest receivers on modern
// Android; hearing it requires a live process, which means a foreground
// service with a visible notification. The service does NOTHING except hold
// this receiver: no polling, no wake locks, no timers — idle cost is the
// notification row. Every stability-playbook rule applies: the unlock handler
// reads a small already-loaded prefs file and delegates the heavy work
// (bitmap decode) to show()'s own background thread.
//
// Lifecycle: started by the module on configure() (master switch on + cards
// written), by BootReceiver after reboot, and re-ensured by every alarm fire
// (daily heartbeat against OEM kills). It stops itself whenever the feature
// can no longer show anything (switch off → cancelAll, SAW revoked, no cards).
// Background-start legality on 12+: holding SYSTEM_ALERT_WINDOW — which this
// whole feature requires — is one of the documented exemptions for starting
// an FGS from the background.
class OverlayCardService : Service() {
  private var receiver: BroadcastReceiver? = null
  private var lastWakeAt = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    startInForeground()
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_USER_PRESENT)   // keyguard dismissed — the unlock
      addAction(Intent.ACTION_SCREEN_ON)      // no-keyguard devices never send USER_PRESENT
    }
    val r = object : BroadcastReceiver() {
      override fun onReceive(c: Context, i: Intent) { onWake(c.applicationContext) }
    }
    receiver = r
    try {
      // System-sent protected broadcasts reach NOT_EXPORTED receivers.
      if (Build.VERSION.SDK_INT >= 33) registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
      else @Suppress("UnspecifiedRegisterReceiverFlag") registerReceiver(r, filter)
    } catch (e: Throwable) { /* no receiver → alarms still work as before */ }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!canDraw() || OverlayCardStore.readCards(this).isEmpty()) {
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    receiver?.let { try { unregisterReceiver(it) } catch (e: Throwable) { } }
    receiver = null
    super.onDestroy()
  }

  private fun onWake(ctx: Context) {
    try {
      // SCREEN_ON and USER_PRESENT arrive as a pair on unlock — collapse them.
      val now = SystemClock.elapsedRealtime()
      if (now - lastWakeAt < 5_000) return
      lastWakeAt = now

      if (!canDraw()) { stopSelf(); return }
      val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      if (km?.isKeyguardLocked == true) return   // SCREEN_ON with the lock still up
      if (OverlayCardGate.ownAppForeground(ctx)) return

      for (card in OverlayCardGate.dueCards(ctx)) {
        if (OverlayCardGate.mayShow(ctx, card.slot)) {
          OverlayCardStore.recordShow(ctx, card.slot)
          OverlayCardWindowController.show(ctx, card)
          break                                  // one card per unlock
        }
      }
    } catch (e: Throwable) { /* a bad unlock must never crash the service */ }
  }

  private fun canDraw(): Boolean = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(this) else true
  } catch (e: Throwable) { false }

  private fun startInForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    if (Build.VERSION.SDK_INT >= 26 && nm != null) {
      // MIN importance: silent, collapsed — present because the OS requires a
      // visible anchor for the service, not because we want attention here.
      val ch = NotificationChannel(CHANNEL_ID, OverlayCardStore.serviceTitle(this), NotificationManager.IMPORTANCE_MIN)
      ch.setShowBadge(false)
      nm.createNotificationChannel(ch)
    }
    val tap: PendingIntent? = try {
      packageManager.getLaunchIntentForPackage(packageName)?.let {
        PendingIntent.getActivity(this, 2001, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      }
    } catch (e: Throwable) { null }
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName)
      .takeIf { it != 0 } ?: applicationInfo.icon
    val builder =
      if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID)
      else @Suppress("DEPRECATION") Notification.Builder(this).setPriority(Notification.PRIORITY_MIN)
    val notif = builder
      .setSmallIcon(icon)
      .setContentTitle(OverlayCardStore.serviceTitle(this))
      .setContentText(OverlayCardStore.serviceText(this))
      .setOngoing(true)
      .apply { tap?.let { setContentIntent(it) } }
      .build()
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIF_ID, notif)
      }
    } catch (e: Throwable) {
      // ForegroundServiceStartNotAllowed and friends: degrade to the alarm
      // path rather than crash — the cards keep their pre-service behaviour.
      stopSelf()
    }
  }

  companion object {
    private const val CHANNEL_ID = "overlay_cards_service"
    private const val NOTIF_ID = 2101

    /** Idempotent: safe to call from configure, boot, and every alarm fire. */
    fun ensure(ctx: Context) {
      try {
        if (OverlayCardStore.readCards(ctx).isEmpty()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) return
        val i = Intent(ctx, OverlayCardService::class.java)
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
      } catch (e: Throwable) { /* background-start denied → next ensure retries */ }
    }

    fun stop(ctx: Context) {
      try { ctx.stopService(Intent(ctx, OverlayCardService::class.java)) } catch (e: Throwable) { }
    }
  }
}
