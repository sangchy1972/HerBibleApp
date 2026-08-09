package expo.modules.settingscoach

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// A coach card drawn ON TOP of the system Settings app, so the hand-off from
// "turn on reminders" to the switch she has to flip is guided instead of
// abandoned. Owner asked for this explicitly after seeing a competitor do it.
//
// This is the ONLY way to put anything over another app's UI: a WindowManager
// window of TYPE_APPLICATION_OVERLAY, which needs SYSTEM_ALERT_WINDOW ("Appear
// on top"). That permission is not granted by a runtime dialog — the user flips
// it on a Settings page — so JS must check canDrawOverlays() and route
// accordingly. Nothing here ever throws into JS: an overlay we cannot show must
// degrade to the in-app card, never to a crash.
//
// TWO LIMITS THAT ARE NOT BUGS, both by OS design:
//   • From Android 12 an app can call Window#setHideOverlayWindows(true), and
//     Settings does exactly that on some permission screens to block overlay
//     tapjacking. Where it does, this card is hidden and there is nothing we can
//     do about it. It still shows on the screens that don't set the flag, which
//     is what the competitor's own screenshots show on One UI.
//   • The card is PURE DECORATION: NOT_FOCUSABLE so it can never take keyboard
//     focus, and NOT_TOUCHABLE so every touch inside its rect passes straight
//     through to Settings. Both matter. An earlier version had only
//     NOT_FOCUSABLE, and since none of the views below is clickable, taps landing
//     on the card were delivered to our window and silently dropped — a
//     full-width dead strip at the bottom of the Settings screen for up to 25 s,
//     which is also the exact shape Android's tapjacking mitigations exist to
//     stop. There is no close button and there must not be one: it cannot be
//     tapped, so the auto-hide and the JS hide() are the only ways it goes away.
//
// SELF-DESTRUCT. This window lives outside our Activity's lifecycle, so nothing
// that normally tears our UI down applies to it. It gets a hard timeout AND an
// explicit hide() from JS on foreground — a card stranded over the user's phone
// would be far worse than never showing one.
class ExpoSettingsCoachModule : Module() {
  private var overlay: View? = null
  private val main = Handler(Looper.getMainLooper())
  private var autoHide: Runnable? = null
  private var knobAnim: ObjectAnimator? = null

  // The WindowManager we ADDED with, held strongly for as long as a window is up.
  //
  // Not a convenience. `appContext` and `reactContext` are both weak references
  // (RuntimeContext holds a WeakReference<ReactApplicationContext>, and appContext
  // itself throws once collected), so resolving the service again at REMOVE time
  // can fail exactly when we most need it to work — during teardown, which is one
  // of the paths that removes the window. A window we cannot remove has no
  // reference and no timer left anywhere in the process, i.e. it sits over the
  // user's phone until the process dies. It comes from the application context,
  // so holding it costs no leak.
  private var addedWith: WindowManager? = null

  private val wm: WindowManager?
    get() = try {
      appContext.reactContext?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    } catch (e: Throwable) {
      null
    }

  override fun definition() = ModuleDefinition {
    Name("ExpoSettingsCoach")

    // Has the user granted "Appear on top"? Below API 23 the permission is
    // implicit, but the whole flow is gated on modern Android anyway.
    Function("canDrawOverlays") {
      val ctx = appContext.reactContext ?: return@Function false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(ctx) else true
      } catch (e: Throwable) {
        false
      }
    }

    // The "Appear on top" page, scoped to this app with the package: URI so the
    // system lands on OUR row rather than the full list.
    Function("openOverlaySettings") {
      val ctx = appContext.reactContext ?: return@Function false
      try {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${ctx.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
        true
      } catch (e: Throwable) {
        // Some OEMs do not expose the per-app page; the caller falls back to the
        // app's own settings screen.
        false
      }
    }

    // Show the card. Every string comes from JS so the copy stays translated by
    // the app's own i18n — this module owns no text.
    // Returns whether we are ALLOWED to show, decided here on the JS thread.
    //
    // It used to declare a `var ok`, assign it inside the posted block and return
    // it — which is always false, because a sync Function body runs on the JS
    // thread and Handler.post always enqueues rather than running inline. A return
    // value that is structurally always false is worse than none: the first
    // `if (showSettingsCoach(...))` anyone writes silently takes the failure path.
    // The permission is the only thing the caller can act on anyway.
    Function("show") { title: String, body: String, switchLabel: String, timeoutMs: Int ->
      val ctx = appContext.reactContext ?: return@Function false
      val allowed = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(ctx) else true
      } catch (e: Throwable) {
        false
      }
      if (!allowed) return@Function false
      // addView and Animator.start MUST be on the UI thread.
      main.post {
        try {
          removeOverlay()
          val view = buildCard(ctx, title, body, switchLabel)
          val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
          } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
          }
          val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            // NOT_FOCUSABLE: never takes keyboard focus. NOT_TOUCHABLE: every
            // touch inside our rect passes through to Settings, so the card
            // cannot eat her taps (see the header). No LAYOUT_IN_SCREEN — with
            // bottom gravity that lays the window out against the PHYSICAL screen
            // edge, i.e. behind the navigation bar; the default respects the
            // decorations, which is what a bottom-anchored card wants.
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
              WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            android.graphics.PixelFormat.TRANSLUCENT,
          )
          lp.gravity = Gravity.BOTTOM
          val manager = wm ?: return@post
          manager.addView(view, lp)
          addedWith = manager
          overlay = view
          armAutoHide(timeoutMs)
        } catch (e: Throwable) {
          overlay = null
          addedWith = null
        }
      }
      true
    }

    // Explicit Unit — Handler.post returns a Boolean, and letting that be the
    // function's value would tell JS something meaningless.
    Function("hide") {
      main.post { removeOverlay() }
      Unit
    }

    // The window outlives our Activity, so tearing the module down must take it
    // with us — a JS reload or a killed Activity must not leave it floating.
    OnDestroy { main.post { removeOverlay() } }
  }

  private fun armAutoHide(timeoutMs: Int) {
    autoHide?.let { main.removeCallbacks(it) }
    val ms = if (timeoutMs in 1000..120000) timeoutMs.toLong() else 25000L
    val r = Runnable { removeOverlay() }
    autoHide = r
    main.postDelayed(r, ms)
  }

  // Order matters. The view reference and the manager are cleared ONLY after a
  // removal that did not throw — clearing first (which is what this did) means a
  // failed removal leaves a window nobody holds a reference to and no armed timer:
  // unremovable for the life of the process. On failure we keep both and leave the
  // timer armed so the auto-hide gets another attempt.
  private fun removeOverlay() {
    val v = overlay ?: run {
      autoHide?.let { main.removeCallbacks(it) }
      autoHide = null
      return
    }
    val manager = addedWith ?: wm
    try {
      manager?.removeViewImmediate(v)
    } catch (e: Throwable) {
      return   // keep overlay + timer: something still has to take this window down
    }
    knobAnim?.cancel()
    knobAnim = null
    overlay = null
    addedWith = null
    autoHide?.let { main.removeCallbacks(it) }
    autoHide = null
  }

  private fun dp(ctx: Context, v: Float): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics).toInt()

  // Built in code rather than XML so the module stays a single file and cannot
  // drift from the app's own card styling — the values mirror
  // components/PermissionCoachOverlay (radius 20, ROSE #E63F69, TXT #1E1B2E).
  private fun buildCard(ctx: Context, title: String, body: String, switchLabel: String): View {
    val rose = Color.parseColor("#E63F69")
    val ink = Color.parseColor("#1E1B2E")
    val sub = Color.parseColor("#8A8695")

    val outer = FrameLayout(ctx)
    outer.setPadding(dp(ctx, 12f), 0, dp(ctx, 12f), dp(ctx, 16f))

    val card = LinearLayout(ctx)
    card.orientation = LinearLayout.VERTICAL
    card.background = GradientDrawable().apply {
      cornerRadius = dp(ctx, 20f).toFloat()
      setColor(Color.WHITE)
    }
    card.elevation = dp(ctx, 10f).toFloat()
    card.setPadding(dp(ctx, 18f), dp(ctx, 18f), dp(ctx, 18f), dp(ctx, 16f))

    // Header: our icon + our name, so she can match the row in the list.
    val header = LinearLayout(ctx)
    header.orientation = LinearLayout.HORIZONTAL
    header.gravity = Gravity.CENTER_VERTICAL
    val icon = ImageView(ctx)
    try { icon.setImageDrawable(ctx.packageManager.getApplicationIcon(ctx.packageName)) } catch (e: Throwable) { }
    val iconSize = dp(ctx, 34f)
    header.addView(icon, LinearLayout.LayoutParams(iconSize, iconSize))
    val name = TextView(ctx)
    name.text = try {
      ctx.packageManager.getApplicationLabel(ctx.applicationInfo).toString()
    } catch (e: Throwable) { "" }
    name.setTextColor(ink)
    name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    name.setTypeface(name.typeface, android.graphics.Typeface.BOLD)
    val nameLp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    nameLp.leftMargin = dp(ctx, 10f)
    header.addView(name, nameLp)

    // The mock switch — animated, never interactive. A switch that looks live
    // and changes nothing reads as broken (the same rule the in-app card keeps).
    val knobTrack = FrameLayout(ctx)
    knobTrack.background = GradientDrawable().apply {
      cornerRadius = dp(ctx, 11f).toFloat()
      setColor(Color.parseColor("#22000000"))
    }
    val knob = View(ctx)
    knob.background = GradientDrawable().apply {
      cornerRadius = dp(ctx, 9f).toFloat()
      setColor(rose)
    }
    val knobLp = FrameLayout.LayoutParams(dp(ctx, 18f), dp(ctx, 18f))
    knobLp.setMargins(dp(ctx, 2f), dp(ctx, 2f), 0, 0)
    knobTrack.addView(knob, knobLp)
    header.addView(knobTrack, LinearLayout.LayoutParams(dp(ctx, 40f), dp(ctx, 22f)))
    card.addView(header)

    val titleTv = TextView(ctx)
    titleTv.text = title
    titleTv.setTextColor(ink)
    titleTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
    titleTv.setTypeface(titleTv.typeface, android.graphics.Typeface.BOLD)
    val titleLp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    titleLp.topMargin = dp(ctx, 14f)
    card.addView(titleTv, titleLp)

    val bodyTv = TextView(ctx)
    bodyTv.text = body
    bodyTv.setTextColor(sub)
    bodyTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    val bodyLp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    bodyLp.topMargin = dp(ctx, 6f)
    card.addView(bodyTv, bodyLp)

    val switchTv = TextView(ctx)
    switchTv.text = switchLabel
    switchTv.setTextColor(rose)
    switchTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    switchTv.setTypeface(switchTv.typeface, android.graphics.Typeface.BOLD)
    val switchLp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    switchLp.topMargin = dp(ctx, 10f)
    card.addView(switchTv, switchLp)

    outer.addView(
      card,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
      ),
    )

    // The knob slides on and off, ~1.6 s a cycle — the "flip this" gesture the
    // in-app card makes with a finger. Infinite, and the auto-hide is what stops
    // it; an animator left running on a removed view is harmless but the window
    // is gone with it either way.
    val travel = dp(ctx, 18f).toFloat()
    // Held in a field so removeOverlay() can cancel it. ObjectAnimator keeps its
    // target weakly and self-cancels once the view is collected, so this is
    // hygiene rather than a leak — but until then it keeps asking for frames.
    knobAnim?.cancel()
    knobAnim = ObjectAnimator.ofFloat(knob, "translationX", 0f, travel).apply {
      duration = 620
      startDelay = 400
      repeatCount = ValueAnimator.INFINITE
      repeatMode = ValueAnimator.REVERSE
      start()
    }

    return outer
  }
}
