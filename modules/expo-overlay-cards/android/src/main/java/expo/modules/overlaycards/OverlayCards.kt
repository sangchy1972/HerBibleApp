package expo.modules.overlaycards

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

// Store + scheduler for the daily overlay cards. Everything in this file is a
// plain `object` on purpose: the alarm fires into a BroadcastReceiver in a COLD
// process — no React context, no module instance, no JS — so nothing here may
// depend on expo-modules machinery. JS writes the day's content ahead of time
// (pre-localized, image already a local file path); the receiver only reads.

/** One scheduled card. `slot` doubles as the alarm identity. */
data class OverlayCard(
  val slot: String,            // "morning" (verse card) | "night" (quiz card)
  val hour: Int,
  val minute: Int,
  val kind: String,            // "verse" | "quiz"
  val deepLink: String,        // herbible://… opened on tap
  // verse kind:
  val verseText: String,
  val verseRef: String,
  val ctaLabel: String,        // the Amen pill
  val imagePath: String,       // absolute file path, may be "" → gradient fallback
  // quiz kind:
  val badge: String,           // "Daily Bible Quiz" (localized; ✦ added at draw time)
  val question: String,
  val options: List<String>,   // 2 → stacked like the reference, 4 → 2×2 grid
)

object OverlayCardStore {
  private const val PREFS = "her_bible_overlay_cards"
  private const val KEY_CONFIG = "config"
  private const val KEY_EVENTS = "events"
  private const val KEY_APP_NAME = "app_name"

  fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun writeConfig(ctx: Context, json: String) {
    // Parse-validate BEFORE persisting, so a malformed payload can never brick
    // the receiver path — the old config keeps serving.
    val parsed = parseCards(json) ?: return
    prefs(ctx).edit()
      .putString(KEY_CONFIG, json)
      .putString(KEY_APP_NAME, JSONObject(json).optString("appName", ""))
      .apply()
    OverlayCardScheduler.rescheduleAll(ctx, parsed)
  }

  fun clearConfig(ctx: Context) {
    prefs(ctx).edit().remove(KEY_CONFIG).apply()
    OverlayCardScheduler.cancelAll(ctx)
  }

  fun appName(ctx: Context): String {
    val stored = prefs(ctx).getString(KEY_APP_NAME, "") ?: ""
    if (stored.isNotEmpty()) return stored
    return try { ctx.packageManager.getApplicationLabel(ctx.applicationInfo).toString() } catch (e: Throwable) { "" }
  }

  fun readCards(ctx: Context): List<OverlayCard> {
    val json = prefs(ctx).getString(KEY_CONFIG, null) ?: return emptyList()
    return parseCards(json) ?: emptyList()
  }

  fun cardForSlot(ctx: Context, slot: String): OverlayCard? =
    readCards(ctx).firstOrNull { it.slot == slot }

  private fun parseCards(json: String): List<OverlayCard>? = try {
    val root = JSONObject(json)
    val arr = root.getJSONArray("cards")
    val out = ArrayList<OverlayCard>(arr.length())
    for (i in 0 until arr.length()) {
      val c = arr.getJSONObject(i)
      val opts = ArrayList<String>()
      c.optJSONArray("options")?.let { oa -> for (j in 0 until oa.length()) opts.add(oa.getString(j)) }
      out.add(
        OverlayCard(
          slot = c.getString("slot"),
          hour = c.getInt("hour"),
          minute = c.getInt("minute"),
          kind = c.getString("kind"),
          deepLink = c.getString("deepLink"),
          verseText = c.optString("verseText", ""),
          verseRef = c.optString("verseRef", ""),
          ctaLabel = c.optString("ctaLabel", ""),
          imagePath = c.optString("imagePath", ""),
          badge = c.optString("badge", ""),
          question = c.optString("question", ""),
          options = opts,
        ),
      )
    }
    out
  } catch (e: Throwable) { null }

  // ── Once-per-day + retry bookkeeping ──────────────────────────────────────
  fun todayYmd(): String {
    val c = Calendar.getInstance()
    return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
  }

  fun shownToday(ctx: Context, slot: String): Boolean =
    prefs(ctx).getString("shown:$slot", "") == todayYmd()

  fun markShown(ctx: Context, slot: String) {
    prefs(ctx).edit().putString("shown:$slot", todayYmd()).putInt("retry:$slot", 0).apply()
  }

  /** Bump today's retry counter; true while another retry is allowed. */
  fun bumpRetry(ctx: Context, slot: String, max: Int): Boolean {
    val key = "retry:$slot"
    val dayKey = "retryDay:$slot"
    val p = prefs(ctx)
    val n = (if (p.getString(dayKey, "") == todayYmd()) p.getInt(key, 0) else 0) + 1
    p.edit().putInt(key, n).putString(dayKey, todayYmd()).apply()
    return n <= max
  }

  // ── Overlay-entry stamp ───────────────────────────────────────────────────
  // Written the instant a card is tapped, BEFORE the app is opened. The ad
  // layer reads it synchronously at hot-start-decision time, so "she tapped a
  // devotional card and got an interstitial first" can never race an event —
  // apply() makes the stamp visible to every same-process reader immediately
  // (disk write is async, which is fine: a killed process cold-starts with
  // bgAt == null and cannot fire the hot-start ad at all).
  fun stampTap(ctx: Context) {
    prefs(ctx).edit().putLong("lastTapAt", System.currentTimeMillis()).apply()
  }

  fun msSinceTap(ctx: Context): Double {
    val t = prefs(ctx).getLong("lastTapAt", 0L)
    return if (t <= 0L) -1.0 else (System.currentTimeMillis() - t).toDouble()
  }

  // ── Analytics hand-off ────────────────────────────────────────────────────
  // The receiver runs without Firebase JS, so events queue in prefs and the app
  // drains them into logEvent() on its next open. Capped so an app never opened
  // again can't grow the file forever.
  fun queueEvent(ctx: Context, name: String, params: Map<String, String>) {
    try {
      val p = prefs(ctx)
      val arr = JSONArray(p.getString(KEY_EVENTS, "[]") ?: "[]")
      if (arr.length() >= 100) return
      arr.put(JSONObject().put("n", name).put("t", System.currentTimeMillis()).put("p", JSONObject(params as Map<*, *>)))
      p.edit().putString(KEY_EVENTS, arr.toString()).apply()
    } catch (e: Throwable) { /* analytics must never break the card */ }
  }

  fun drainEvents(ctx: Context): String {
    val p = prefs(ctx)
    val out = p.getString(KEY_EVENTS, "[]") ?: "[]"
    p.edit().putString(KEY_EVENTS, "[]").apply()
    return out
  }
}

object OverlayCardScheduler {
  // Stable request codes per slot — reusing them is what makes re-scheduling
  // replace instead of accumulate.
  private fun requestCode(slot: String) = if (slot == "morning") 1001 else 1002
  const val RETRY_MAX = 5
  private const val RETRY_MS = 8 * 60 * 1000L

  private fun pending(ctx: Context, slot: String): PendingIntent {
    val i = Intent(ctx, OverlayCardAlarmReceiver::class.java).putExtra("slot", slot)
    return PendingIntent.getBroadcast(
      ctx, requestCode(slot), i,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun alarmManager(ctx: Context): AlarmManager? =
    ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

  private fun nextOccurrence(hour: Int, minute: Int): Long {
    val c = Calendar.getInstance()
    c.set(Calendar.HOUR_OF_DAY, hour)
    c.set(Calendar.MINUTE, minute)
    c.set(Calendar.SECOND, 0)
    c.set(Calendar.MILLISECOND, 0)
    if (c.timeInMillis <= System.currentTimeMillis()) c.add(Calendar.DAY_OF_YEAR, 1)
    return c.timeInMillis
  }

  private fun setAlarm(ctx: Context, at: Long, pi: PendingIntent) {
    val am = alarmManager(ctx) ?: return
    try {
      // Exact when the special access allows it (SCHEDULE_EXACT_ALARM is
      // declared; default-granted below 13, user-grantable above). Otherwise a
      // 10-minute window — a popup at 20:04 instead of 20:00 changes nothing.
      val exactOk = Build.VERSION.SDK_INT < 31 || alarmManager(ctx)?.canScheduleExactAlarms() == true
      if (exactOk) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      else am.setWindow(AlarmManager.RTC_WAKEUP, at, 10 * 60 * 1000L, pi)
    } catch (e: Throwable) {
      try { am.set(AlarmManager.RTC, at, pi) } catch (e2: Throwable) { /* give up quietly */ }
    }
  }

  fun rescheduleAll(ctx: Context, cards: List<OverlayCard>) {
    for (slot in listOf("morning", "night")) {
      val card = cards.firstOrNull { it.slot == slot }
      if (card == null) {
        try { alarmManager(ctx)?.cancel(pending(ctx, slot)) } catch (e: Throwable) { }
      } else {
        setAlarm(ctx, nextOccurrence(card.hour, card.minute), pending(ctx, slot))
      }
    }
  }

  fun cancelAll(ctx: Context) {
    for (slot in listOf("morning", "night")) {
      try { alarmManager(ctx)?.cancel(pending(ctx, slot)) } catch (e: Throwable) { }
    }
  }

  /** Arm tomorrow's occurrence for this slot (called on every fire, first thing). */
  fun armNext(ctx: Context, card: OverlayCard) =
    setAlarm(ctx, nextOccurrence(card.hour, card.minute), pending(ctx, card.slot))

  /** Short retry while the screen is off / locked / our app is foreground. */
  fun armRetry(ctx: Context, slot: String) =
    setAlarm(ctx, System.currentTimeMillis() + RETRY_MS, pending(ctx, slot))
}
