package expo.modules.overlaycards

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

// Draws one card as a TYPE_APPLICATION_OVERLAY window — over the launcher or
// whatever app is open, exactly like the reference screenshots. Reachable from
// a cold BroadcastReceiver, so: application context only, no expo machinery.
//
// Window discipline copied from ExpoSettingsCoachModule, which learned it the
// hard way: hold the WindowManager we ADDED with, clear references only after a
// removal that did not throw, and give the window a hard self-destruct — it
// outlives every Activity, so nothing else will ever take it down.
object OverlayCardWindowController {
  private val main = Handler(Looper.getMainLooper())
  private var overlay: View? = null
  private var addedWith: WindowManager? = null
  private var autoHide: Runnable? = null

  // Palette — mirrors src/constants/theme.ts (native code can't import it).
  // `val`, not `const val`: .toInt() is a runtime call, which const rejects.
  private val ROSE = 0xFFE63F69.toInt()
  private val INK = 0xFF1E1B2E.toInt()
  private val PARCH_BG = 0xFFFBF3E4.toInt()
  private val PARCH_LINE = 0xFFDCC9A5.toInt()
  private val PARCH_INK = 0xFF241F1A.toInt()
  private val PARCH_SUB = 0xFF43372B.toInt()
  private val PILL_TAN = 0xFFB79B76.toInt()
  // NOTE: postDelayed runs on the UPTIME clock, which pauses in deep sleep —
  // a card shown at 20:00 on a phone that dozes all night can still be there
  // at the morning unlock, until the next slot's fire replaces it. Accepted
  // (swarm review 2026-08-17): the content is the day's own verse/quiz, taps
  // behave normally, and closing the gap would need an unlock listener or an
  // alarm — heavier than the staleness it prevents.
  private const val SELF_DESTRUCT_MS = 30 * 60 * 1000L

  fun show(context: Context, card: OverlayCard) {
    val ctx = context.applicationContext
    // Decode the verse art OFF main before anything else (swarm review
    // 2026-08-17): the cached file is a Cloudflare variant at screen-width
    // pixels, so decodeSampled's halving loop never actually downsamples —
    // every show was a full 0.6-1.6MP decode ON MAIN, 20-100ms (tail ~200ms)
    // at the exact unlock moment. View building and addView stay on main, as
    // the window manager requires; only the bitmap work moves.
    Thread {
      val cardW = ctx.resources.displayMetrics.widthPixels - dp(ctx, 28f)
      val bmp = if (card.kind == "verse") decodeSampled(card.imagePath, cardW - dp(ctx, 24f)) else null
      showWithBitmap(ctx, card, cardW, bmp)
    }.start()
  }

  private fun showWithBitmap(ctx: Context, card: OverlayCard, cardW: Int, bmp: Bitmap?) {
    main.post {
      try {
        // If the old window could not be removed AND may still be attached,
        // adding a second one and overwriting the refs would orphan it on
        // screen until process death (swarm r2). Skip this show instead —
        // the old card is still up and self-destructing on its own timer.
        if (!remove()) return@post
        // The card's width lives on the WINDOW params — addView overwrites the
        // root view's own layoutParams with these, so putting a width anywhere
        // else silently degrades to wrap-content.
        val view = buildCard(ctx, card, cardW, bmp)
        val lp = WindowManager.LayoutParams(
          cardW,
          WindowManager.LayoutParams.WRAP_CONTENT,
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
          else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
          // NOT_FOCUSABLE: taps work, but we never take keyboard focus and the
          // back key stays with the app below — the X is the way out, which is
          // the behaviour the owner asked to replicate. No NOT_TOUCHABLE here
          // (unlike the settings coach): this card IS interactive.
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
          PixelFormat.TRANSLUCENT,
        )
        lp.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        lp.y = dp(ctx, 8f)
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return@post
        wm.addView(view, lp)
        addedWith = wm
        overlay = view
        // Slide in from above, like a notification arriving.
        view.translationY = -dp(ctx, 48f).toFloat()
        view.alpha = 0f
        view.animate().translationY(0f).alpha(1f).setDuration(280).setInterpolator(DecelerateInterpolator()).start()
        armSelfDestruct()
        OverlayCardStore.queueEvent(ctx, "overlay_card_shown", mapOf("slot" to card.slot, "kind" to card.kind))
      } catch (e: Throwable) {
        overlay = null
        addedWith = null
      }
    }
  }

  fun dismiss() { main.post { remove() } }

  /** True while a card window is up — the gate skips re-shows over it. */
  fun isShowing(): Boolean = overlay != null

  private fun armSelfDestruct() {
    autoHide?.let { main.removeCallbacks(it) }
    val r = Runnable { remove() }
    autoHide = r
    main.postDelayed(r, SELF_DESTRUCT_MS)
  }

  // Clear references only after a removeView that did not throw (see header).
  // Returns false only on the keep-refs path: the window may still be attached
  // and a caller about to add a new one must back off.
  private fun remove(): Boolean {
    val v = overlay ?: run {
      autoHide?.let { main.removeCallbacks(it) }
      autoHide = null
      return true
    }
    try {
      addedWith?.removeViewImmediate(v)
    } catch (e: IllegalArgumentException) {
      // "View not attached": the system already tore the window down (e.g.
      // overlay permission revoked while up). Clearing is safe by definition —
      // holding on pinned a bitmap-sized tree in a cached process (swarm
      // review 2026-08-17). The conservative keep-refs path below stays for
      // every OTHER throwable, where the window may genuinely still be up.
    } catch (e: Throwable) { return false }
    overlay = null
    addedWith = null
    autoHide?.let { main.removeCallbacks(it) }
    autoHide = null
    return true
  }

  private fun openApp(ctx: Context, deepLink: String) {
    try {
      val i = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink))
        .setPackage(ctx.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(i)
    } catch (e: Throwable) {
      try {
        ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
          it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          ctx.startActivity(it)
        }
      } catch (e2: Throwable) { /* stay on the launcher */ }
    }
  }

  private fun tap(ctx: Context, card: OverlayCard, link: String, extra: Map<String, String>) {
    OverlayCardStore.queueEvent(ctx, "overlay_card_tap", mapOf("slot" to card.slot, "kind" to card.kind) + extra)
    // Tapping through IS engagement — this slot is done for the day.
    OverlayCardStore.markEngaged(ctx, card.slot)
    // Stamp BEFORE opening: adFrequency reads this synchronously on the
    // foreground return and skips the hot-start interstitial for this entry.
    OverlayCardStore.stampTap(ctx)
    openApp(ctx, link)
    remove()
  }

  // ── View building ──────────────────────────────────────────────────────────
  private fun dp(ctx: Context, v: Float): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics).toInt()

  private fun rounded(color: Int, radiusPx: Float, strokePx: Int = 0, strokeColor: Int = 0) =
    GradientDrawable().apply {
      cornerRadius = radiusPx
      setColor(color)
      if (strokePx > 0) setStroke(strokePx, strokeColor)
    }

  private fun clipRounded(v: View, radiusPx: Float) {
    v.outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setRoundRect(0, 0, view.width, view.height, radiusPx)
      }
    }
    v.clipToOutline = true
  }

  private fun buildCard(ctx: Context, card: OverlayCard, cardW: Int, bmp: Bitmap?): View {
    val root = LinearLayout(ctx)
    root.orientation = LinearLayout.VERTICAL
    root.background = rounded(Color.WHITE, dp(ctx, 22f).toFloat())
    root.elevation = dp(ctx, 12f).toFloat()
    clipRounded(root, dp(ctx, 22f).toFloat())

    // Header: our icon, our name, X. Same chrome as the reference card.
    val header = LinearLayout(ctx)
    header.orientation = LinearLayout.HORIZONTAL
    header.gravity = Gravity.CENTER_VERTICAL
    header.setPadding(dp(ctx, 14f), dp(ctx, 12f), dp(ctx, 10f), dp(ctx, 10f))
    val icon = ImageView(ctx)
    try { icon.setImageDrawable(ctx.packageManager.getApplicationIcon(ctx.packageName)) } catch (e: Throwable) { }
    header.addView(icon, LinearLayout.LayoutParams(dp(ctx, 30f), dp(ctx, 30f)))
    val name = TextView(ctx)
    name.text = OverlayCardStore.appName(ctx)
    name.setTextColor(INK)
    name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
    name.typeface = Typeface.DEFAULT_BOLD
    val nameLp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    nameLp.leftMargin = dp(ctx, 10f)
    header.addView(name, nameLp)
    val close = XView(ctx, 0x73000000)
    val closeWrap = FrameLayout(ctx)
    closeWrap.background = rounded(0x0D000000, dp(ctx, 15f).toFloat())
    closeWrap.addView(close, FrameLayout.LayoutParams(dp(ctx, 14f), dp(ctx, 14f), Gravity.CENTER))
    closeWrap.setOnClickListener {
      OverlayCardStore.queueEvent(ctx, "overlay_card_dismiss", mapOf("slot" to card.slot, "kind" to card.kind))
      // The X is an explicit "not today" — honoured absolutely: no re-shows
      // for this slot until tomorrow. Load-bearing for the review defense.
      OverlayCardStore.markEngaged(ctx, card.slot)
      remove()
    }
    header.addView(closeWrap, LinearLayout.LayoutParams(dp(ctx, 30f), dp(ctx, 30f)))
    root.addView(header)

    // The body's HEIGHT rides on this lp — addView(lp) replaces whatever the
    // child set on itself, so the verse card's fixed image height must be
    // decided here. Quiz wraps its own content.
    val innerW = cardW - dp(ctx, 24f)
    val bodyH = if (card.kind == "quiz") ViewGroup.LayoutParams.WRAP_CONTENT else (innerW * 0.78f).toInt()
    root.addView(
      if (card.kind == "quiz") buildQuizBody(ctx, card) else buildVerseBody(ctx, card, bmp),
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bodyH).apply {
        leftMargin = dp(ctx, 12f); rightMargin = dp(ctx, 12f); bottomMargin = dp(ctx, 14f)
      },
    )
    return root
  }

  // Verse card: today's verse composed over the day's background art, with the
  // Amen pill riding the bottom-right edge — the reference layout, our content.
  private fun buildVerseBody(ctx: Context, card: OverlayCard, bmp: Bitmap?): View {
    val frame = FrameLayout(ctx)
    clipRounded(frame, dp(ctx, 16f).toFloat())

    val img = ImageView(ctx)
    img.scaleType = ImageView.ScaleType.CENTER_CROP
    // Decoded off-main in show(); null → gradient fallback below.
    if (bmp != null) {
      img.setImageBitmap(bmp)
    } else {
      // No cached art (fresh install, purged cache) — a dusk-rose wash keeps
      // the white serif verse legible instead of showing a broken frame.
      img.setImageDrawable(GradientDrawable(
        GradientDrawable.Orientation.TL_BR, intArrayOf(0xFFD98BA3.toInt(), 0xFF8C5E77.toInt()),
      ))
    }
    frame.addView(img, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

    // Bottom scrim so the reference line never dissolves into a bright image.
    val scrim = View(ctx)
    scrim.background = GradientDrawable(
      GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0x00000000, 0x59000000),
    )
    frame.addView(scrim, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

    val textCol = LinearLayout(ctx)
    textCol.orientation = LinearLayout.VERTICAL
    textCol.gravity = Gravity.CENTER_HORIZONTAL
    textCol.setPadding(dp(ctx, 18f), dp(ctx, 14f), dp(ctx, 18f), dp(ctx, 58f))
    val verse = TextView(ctx)
    verse.text = card.verseText
    verse.setTextColor(Color.WHITE)
    verse.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
    verse.typeface = Typeface.SERIF
    verse.gravity = Gravity.CENTER
    verse.maxLines = 7
    verse.ellipsize = android.text.TextUtils.TruncateAt.END
    verse.setLineSpacing(0f, 1.18f)
    verse.setShadowLayer(6f, 0f, 1f, 0x80000000.toInt())
    textCol.addView(verse)
    val ref = TextView(ctx)
    ref.text = card.verseRef
    ref.setTextColor(0xE6FFFFFF.toInt())
    ref.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    ref.typeface = Typeface.create(Typeface.SERIF, Typeface.ITALIC)
    ref.setShadowLayer(5f, 0f, 1f, 0x80000000.toInt())
    val refLp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    refLp.topMargin = dp(ctx, 8f)
    textCol.addView(ref, refLp)
    val textLp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
    frame.addView(textCol, textLp)

    // Amen pill, bottom-right, riding over the art like the reference card.
    val cta = TextView(ctx)
    cta.text = "${card.ctaLabel}  ›"
    cta.setTextColor(Color.WHITE)
    cta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    cta.typeface = Typeface.DEFAULT_BOLD
    cta.gravity = Gravity.CENTER
    cta.setPadding(dp(ctx, 22f), 0, dp(ctx, 22f), 0)
    cta.background = rounded(ROSE, dp(ctx, 22f).toFloat())
    val ctaLp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(ctx, 44f), Gravity.BOTTOM or Gravity.END)
    ctaLp.rightMargin = dp(ctx, 12f)
    ctaLp.bottomMargin = dp(ctx, 12f)
    frame.addView(cta, ctaLp)

    val open = View.OnClickListener { tap(ctx, card, card.deepLink, emptyMap()) }
    frame.setOnClickListener(open)
    cta.setOnClickListener(open)
    return frame
  }

  // Quiz card: parchment panel, ✦ badge ✦, the question, then the options —
  // 2 stacked full-width pills (the reference layout) or 4 in a 2×2 grid.
  private fun buildQuizBody(ctx: Context, card: OverlayCard): View {
    val panel = LinearLayout(ctx)
    panel.orientation = LinearLayout.VERTICAL
    panel.background = rounded(PARCH_BG, dp(ctx, 16f).toFloat(), dp(ctx, 1.5f), PARCH_LINE)
    panel.setPadding(dp(ctx, 16f), dp(ctx, 16f), dp(ctx, 16f), dp(ctx, 16f))

    val badge = TextView(ctx)
    badge.text = "✦ ${card.badge} ✦"      // ✦ … ✦ — glyphs, not emoji
    badge.setTextColor(PARCH_INK)
    badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19f)
    badge.typeface = Typeface.DEFAULT_BOLD
    badge.gravity = Gravity.CENTER
    panel.addView(badge, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

    val q = TextView(ctx)
    q.text = card.question
    q.setTextColor(PARCH_SUB)
    q.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16.5f)
    q.typeface = Typeface.DEFAULT_BOLD
    q.gravity = Gravity.CENTER
    q.setLineSpacing(0f, 1.15f)
    val qLp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    qLp.topMargin = dp(ctx, 12f)
    panel.addView(q, qLp)

    val letters = listOf("A", "B", "C", "D")
    fun pill(i: Int, textSize: Float, centered: Boolean): View {
      val f = FrameLayout(ctx)
      f.background = rounded(PILL_TAN, dp(ctx, 23f).toFloat())
      val prefix = TextView(ctx)
      prefix.text = "${letters[i]}:"
      prefix.setTextColor(Color.WHITE)
      prefix.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSize)
      prefix.typeface = Typeface.DEFAULT_BOLD
      val preLp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.START or Gravity.CENTER_VERTICAL)
      preLp.leftMargin = dp(ctx, 16f)
      f.addView(prefix, preLp)
      val label = TextView(ctx)
      label.text = card.options[i]
      label.setTextColor(Color.WHITE)
      label.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSize)
      label.typeface = Typeface.DEFAULT_BOLD
      label.gravity = Gravity.CENTER
      label.maxLines = 2
      label.ellipsize = android.text.TextUtils.TruncateAt.END
      val labLp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
      // Keep the centered text clear of the prefix on narrow cells.
      labLp.leftMargin = dp(ctx, if (centered) 30f else 34f)
      labLp.rightMargin = dp(ctx, if (centered) 10f else 14f)
      f.addView(label, labLp)
      f.setOnClickListener { tap(ctx, card, "${card.deepLink}&opt=$i", mapOf("option" to i.toString())) }
      return f
    }

    if (card.options.size <= 2) {
      // Two options — full-width pills stacked, the reference layout verbatim.
      for (i in card.options.indices) {
        val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(ctx, 46f))
        lp.topMargin = dp(ctx, if (i == 0) 14f else 10f)
        panel.addView(pill(i, 16f, false), lp)
      }
    } else {
      // Four options — 2×2 (owner spec: the stacked layout doesn't fit four).
      for (row in 0 until 2) {
        val rowLl = LinearLayout(ctx)
        rowLl.orientation = LinearLayout.HORIZONTAL
        for (col in 0 until 2) {
          val i = row * 2 + col
          if (i >= card.options.size) break
          val lp = LinearLayout.LayoutParams(0, dp(ctx, 46f), 1f)
          if (col == 1) lp.leftMargin = dp(ctx, 8f)
          rowLl.addView(pill(i, 13.5f, true), lp)
        }
        val rowLp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        rowLp.topMargin = dp(ctx, if (row == 0) 14f else 8f)
        panel.addView(rowLl, rowLp)
      }
    }
    return panel
  }

  private fun decodeSampled(path: String, targetW: Int): Bitmap? {
    if (path.isEmpty() || targetW <= 0) return null
    return try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(path, bounds)
      if (bounds.outWidth <= 0) return null
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= targetW) sample *= 2
      BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
    } catch (e: Throwable) { null }
  }

  // A crisp ✕ drawn with strokes — no glyph, no emoji, always monochrome.
  private class XView(ctx: Context, private val color: Int) : View(ctx) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      strokeWidth = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 1.8f, ctx.resources.displayMetrics)
      this.color = this@XView.color
    }
    override fun onDraw(canvas: Canvas) {
      val w = width.toFloat(); val h = height.toFloat()
      canvas.drawLine(0f, 0f, w, h, paint)
      canvas.drawLine(w, 0f, 0f, h, paint)
    }
  }
}
