import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Image, Pressable, Platform, Linking, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as StoreReview from 'expo-store-review';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { TXT, TXTSUB, ROSE, INK_06, BTN_RADIUS, FONTS } from '../constants/theme';
import { suppressNextHotStart } from '../services/adFrequency';
import { useRatePrompt } from '../state/RatePromptContext';
import { useT } from '../i18n/useT';

// Bottom-sheet rate prompt (slides up from the bottom). Shown on the HOME
// screen by RatePromptHost — never over the prayer-end scene anymore, so the
// praying-hands Lottie can no longer bleed through behind it.
const EMOJI = require('../../assets/rate-emoji.png');
// How far the sheet starts below its resting position.
const SHEET_TRAVEL = 420;

// ── Emoji badge geometry ────────────────────────────────────────────────────
// MEASURED off the PNG (512² canvas), not eyeballed: the smallest circle that
// contains every opaque pixel — the face AND all three sparkles — is centred at
// (256.2, 220.3) with r = 227.5. Scaled to the rendered box that is centre
// (66.0, 56.8) with r = 58.6, so 118 is the minimum disc that covers the whole
// artwork; 124 leaves ~3dp of white all round.
// The old disc was 100.8 wide and centred 8dp too LOW, so the sparkles hung off
// its top and sides while its bottom edge — and its drop shadow — ran straight
// through the title. Per user: the disc must fully cover the emoji, and the
// title must not touch it.
//
// 2026-08-08, per user: 124 → 105.4 (-15 %), shrunk DOWNWARD — the bottom edge
// stays where it was (124-disc bottom = 57 + 62 = 119 = 66.3 + 52.7), so the
// FACE (y 35–112, x 31–103 in box coords, measured) stays fully inside while
// the sparkles now clear the top edge on purpose.
const EMOJI_BOX = 132;
const DISC = 105.4;
const DISC_CX = 66;                                    // in EMOJI_BOX coordinates
const DISC_CY = 66.3;
const BADGE_LIFT = 58;                                 // box's top edge, above the sheet's
const DISC_TOP = DISC_CY - DISC / 2 - BADGE_LIFT;      // -63 → how far the disc peeks above
const DISC_BOTTOM = DISC_CY + DISC / 2 - BADGE_LIFT;   // +61 → how far it reaches INTO the sheet
// The title clears the DISC's bottom, not the emoji's: the disc is white-on-white
// down there, but its shadow is not.
const SHEET_TOP_PAD = DISC_BOTTOM + 22;

const PACKAGE_ID = 'com.holy.bible.kjv.audio.prayer';
// Play's own review surface for this listing. `market://` hands off to the Play
// app; the https form covers a device without it (or an OEM that blocks the
// custom scheme).
const PLAY_REVIEW = `market://details?id=${PACKAGE_ID}&showAllReviews=true`;
const PLAY_REVIEW_WEB = `https://play.google.com/store/apps/details?id=${PACKAGE_ID}&showAllReviews=true`;

// iOS has no bundle-id deep link and the numeric App Store id doesn't exist
// until the app is published — so resolve it from Apple's public lookup endpoint
// at request time. Only ever hit on the fallback path (TestFlight, or a failed
// in-app panel), so it costs nothing in the normal case, and it can't go stale
// the way a hardcoded id would.
async function appleReviewUrl(): Promise<string | null> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${PACKAGE_ID}`, { signal: ctl.signal });
    const json = await res.json();
    const id = json?.results?.[0]?.trackId;
    return typeof id === 'number' ? `https://apps.apple.com/app/id${id}?action=write-review` : null;
  } catch { return null; } finally { clearTimeout(to); }
}

/**
 * Settled, failed, or still running after `ms`. Never rejects and never leaves an
 * unhandled rejection behind, so a late failure can't surface as a redbox.
 */
async function outcomeOf(p: Promise<unknown>, ms: number): Promise<'settled' | 'failed' | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>(res => { timer = setTimeout(() => res('timeout'), ms); });
  const settled: Promise<'settled' | 'failed'> = p.then(() => 'settled' as const, () => 'failed' as const);
  try { return await Promise.race([settled, timeout]); } finally { clearTimeout(timer); }
}

/** Last resort: the store's own write-a-review page. True if we got there. */
async function openStoreReviewPage(): Promise<boolean> {
  // NEVER launch the store from the background. The user pressed Home / took a
  // call inside our handoff window: on Android 10+ the activity start is blocked
  // anyway — and it still resolves, so we would have recorded a review that
  // never happened — while on iOS it would yank them out of whatever they
  // switched to, seconds after they left.
  if (AppState.currentState !== 'active') return false;
  // Positive per-platform tests: an `!== 'android'` fallthrough would send an
  // unbuilt web target to the App Store.
  const urls = Platform.OS === 'ios' ? [await appleReviewUrl()]
    : Platform.OS === 'android' ? [PLAY_REVIEW, PLAY_REVIEW_WEB]
    : [];
  for (const url of urls) {
    if (!url) continue;
    // openURL, never canOpenURL: on Android 11+ the latter needs a <queries>
    // manifest entry to answer truthfully and would falsely report "can't".
    try { await Linking.openURL(url); return true; } catch { /* try the next one */ }
  }
  return false;
}

export default function RatePromptSheet({ onClose }: { onClose: () => void }) {
  const { markYes, markNo, markRated } = useRatePrompt();
  const t = useT();
  const insets = useSafeAreaInsets();

  // Shared-value entrance (see the note in the JSX for why this cannot be
  // `entering=`). The watchdog snaps the sheet into place if the timing is
  // dropped, so a saturated UI thread can never leave it off-screen.
  const dim = useSharedValue(0);
  const ty = useSharedValue(SHEET_TRAVEL);
  useEffect(() => {
    dim.value = withTiming(1, { duration: 250 });
    ty.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) });
    const wd = setTimeout(() => { dim.value = 1; ty.value = 0; }, 900);
    return () => clearTimeout(wd);
  }, [dim, ty]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  // Yes was tapped → the sheet's Modal is torn down on the very next render
  // (nothing may sit over the app while we talk to the store), but this component
  // stays MOUNTED, so the nudge coordinator keeps the `rate` slot. Releasing it
  // here instead would let the next prompt in the queue present its own Modal
  // into the handoff gap — `rate` is the lowest-priority nudge, and moodCheckIn /
  // achievementUnlock both bypass the per-open budget, so one of them really can
  // win the slot within a frame. Play's review panel would then be presented
  // BEHIND that Modal: invisible, and the per-user quota spent for nothing.
  const [handingOff, setHandingOff] = useState(false);
  // One handoff per prompt, ever. Without this, a double-tap on YES! (the sheet
  // is still on screen for a frame) queues two store launches.
  const busyRef = useRef(false);
  const closedRef = useRef(false);
  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  const onYes = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    // markYes() deliberately does NOT fire here. `choice: 'yes'` silences the
    // prompt forever, so recording it up front meant one offline tap — no
    // network for the Apple lookup, no Play on the device — permanently retired
    // the only prompt we have AND got no review. It is recorded once the handoff
    // actually lands; a failure falls back to the dismissed cadence and asks
    // again in a few days.
    setHandingOff(true);
  };

  const onNo = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    markNo();          // "Not really" deliberately launches NOTHING.
    finish();
  };

  // Context callbacks are re-created on every state write, so they must NOT be
  // effect deps — the effect would re-run and hand off twice.
  const api = useRef({ markYes, markRated, finish });
  api.current = { markYes, markRated, finish };

  useEffect(() => {
    if (!handingOff) return;
    let cancelled = false;
    // Give the Modal's native window a beat to actually go away: Play's panel
    // attaches to the Activity BELOW it. Classic RN + ReviewManager pitfall.
    const handoff = setTimeout(async () => {
      // Preferred path: the in-app panel (Play In-App Review on Android,
      // SKStoreReview / AppStore.requestReview on iOS) — rates without leaving
      // the app, and the only path Apple permits when it is available.
      //
      // It fails for reasons we can neither predict nor detect: an install that
      // didn't come from Play (sideloaded AAB, `adb install`), Play's per-user
      // quota, TestFlight on iOS (isAvailableAsync is false there by design), no
      // foreground scene on iOS. The old code swallowed that rejection, which is
      // exactly why tapping Yes did NOTHING on the user's device. Any failure now
      // falls through to the store's own write-a-review page.
      //
      // iOS CAVEAT, so nobody trusts `done` more than it deserves: Apple's API
      // has no completion handler, so requestReview() resolves immediately
      // whether or not the panel appeared (it silently declines once the
      // 3-per-365-days quota is spent). Our cadence asks at most once per
      // install, so exhausting that quota isn't reachable in practice — but on
      // iOS a resolve means "asked", never "shown".
      let done = false;
      if (AppState.currentState === 'active') {
        // She is about to leave the app on our errand — don't let the hot-start
        // interstitial be what greets her when she comes back from writing it.
        suppressNextHotStart();
        try {
          if (await StoreReview.isAvailableAsync()) {
            // BOUNDED. On Android the module settles this promise from inside
            // Play's completion listener, via appContext.throwingActivity — and
            // if our Activity is gone by then ("don't keep activities", a config
            // change) that getter THROWS inside the listener and the promise is
            // never settled at all. An unbounded await would swallow the tap
            // forever.
            //
            // The window is "did the panel appear", not "did she finish": on
            // Android the flow settles only when the panel CLOSES, and it runs in
            // Play's own Activity, so ours has paused. A timeout while we are no
            // longer foreground therefore means it DID show — treat that as done
            // and never open the store page on top of an open panel.
            //
            // THE SILENT NO-OP (owner-reported "Yes does nothing"): Play is
            // ALLOWED to complete launchReviewFlow without showing anything —
            // quota spent (one test consumes it), install not from Play — and
            // there is no API to ask whether it displayed. But a real panel
            // pauses our Activity (AppState leaves 'active') and takes the user
            // seconds; the no-op resolves in tens of ms with focus never lost.
            // So on ANDROID a resolve only counts as shown if we lost focus or
            // it took visibly long — otherwise we fall through to the market://
            // write-review page, which always produces something on screen.
            // iOS keeps trusting the resolve (Apple's API gives nothing else).
            const t0 = Date.now();
            let leftActive = false;
            const probe = AppState.addEventListener('change', st => {
              if (st !== 'active') leftActive = true;
            });
            let outcome: 'settled' | 'timeout' | 'failed';
            try {
              outcome = await outcomeOf(StoreReview.requestReview(), 5000);
            } finally {
              // finally: requestReview can throw SYNCHRONOUSLY on a runtime without
              // the native module, and that leaked one AppState listener per Yes.
              probe.remove();
            }
            const elapsed = Date.now() - t0;
            done = outcome === 'timeout'
              ? (leftActive || AppState.currentState !== 'active')
              : outcome === 'settled'
                && (Platform.OS !== 'android' || leftActive || elapsed > 1500);
          }
        } catch { /* fall through to the store page */ }
      }
      if (done) { api.current.markYes(); api.current.markRated(); api.current.finish(); return; }
      // Gave up on this prompt already (watchdog / returned from the store) —
      // do not launch anything late.
      if (cancelled) { api.current.finish(); return; }
      if (await openStoreReviewPage()) { api.current.markYes(); api.current.markRated(); }
      api.current.finish();
    }, 400);

    // Two independent releases so the slot can NEVER be held forever by a promise
    // that doesn't settle: (a) we went out to the store and came back — the
    // handoff is over by definition; (b) a plain 60s backstop.
    let leftApp = false;
    let backTimer: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') { leftApp = true; return; }
      if (!leftApp) return;
      // Settle a beat after the return so we don't release on the same frame the
      // app is still restoring.
      backTimer = setTimeout(() => api.current.finish(), 600);
    });
    const watchdog = setTimeout(() => api.current.finish(), 60_000);

    return () => {
      cancelled = true;
      clearTimeout(handoff);
      clearTimeout(watchdog);
      if (backTimer) clearTimeout(backTimer);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handingOff]);

  // Modal gone, component still mounted → slot held, zero touch surface.
  if (handingOff) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {/* CRITICAL: entrances are driven by SHARED VALUES, never `entering=`.
            Reanimated LAYOUT animations do not reliably run inside an RN Modal
            on the new architecture (see CommentsSheet + PrayerFlow, which hit
            this before) — and a Modal is a native window that swallows every
            touch in the app. When these two `entering` animations didn't run,
            this sheet was up over the whole app with 100% transparent content
            and NO touch target anywhere: home rendered perfectly and nothing
            responded, with no escape on iOS at all. `useAnimatedStyle` DOES
            work inside a Modal, so that is what we use.
            The dismiss Pressable also sits OUTSIDE any animated wrapper now,
            so even a total animation failure leaves a blind tap that closes. */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.dim, dimStyle]} pointerEvents="none" />

        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 35 }, sheetStyle]}   // +15 per user — taller card below Not really
        >
          {/* Emoji badge — a white disc overlapping the sheet's top edge with
              the sparkly smiley on top (sparkles overflow the disc). */}
          <View style={styles.emojiWrap} pointerEvents="none">
            <View style={styles.emojiCircle} />
            <Image source={EMOJI} style={styles.emojiImg} resizeMode="contain" />
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10} activeOpacity={0.7}>
            <Feather name="x" size={20} color="rgba(30,27,46,0.45)" />
          </TouchableOpacity>

          <Text style={styles.title}>{t('rate.title')}</Text>
          <Text style={styles.body}>{t('rate.body')}</Text>

          {/* Yes is the primary (rose, uppercase); "Not really" is deliberately
              de-emphasised — a light ink wash with muted, regular-weight text —
              so the two never read as equal-weight choices. */}
          <TouchableOpacity onPress={onYes} activeOpacity={0.9} style={[styles.btn, styles.btnYes]}>
            <Text style={styles.btnTextYes}>{t('rate.yes')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNo} activeOpacity={0.7} style={[styles.btn, styles.btnNo]}>
            <Text style={styles.btnTextNo}>{t('rate.no')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: 'rgba(20,16,28,0.5)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: SHEET_TOP_PAD,
    paddingHorizontal: 24,
  },
  // The artwork box, floating above the sheet's top edge.
  emojiWrap: {
    position: 'absolute', top: -BADGE_LIFT, alignSelf: 'center',
    width: EMOJI_BOX, height: EMOJI_BOX, alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  // Sized/centred from the artwork's measured enclosing circle (see above), so
  // no part of the emoji can hang outside the white.
  emojiCircle: {
    position: 'absolute',
    left: DISC_CX - DISC / 2, top: DISC_CY - DISC / 2,
    width: DISC, height: DISC, borderRadius: DISC / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 4,
  },
  emojiImg: { width: EMOJI_BOX, height: EMOJI_BOX },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.05)',
  },
  title: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 22, color: TXT,
    textAlign: 'center', lineHeight: 30, marginBottom: 8, paddingHorizontal: 8,
  },
  // 15 → 16.5 (+10 % per user), line height scaled with it.
  body: {
    fontFamily: FONTS.lato, fontSize: 16.5, color: 'rgba(30,27,46,0.55)',
    textAlign: 'center', lineHeight: 24, marginBottom: 24,
  },
  // Two stacked full-width CTAs — no shadow (per user).
  btn: { height: 54, borderRadius: BTN_RADIUS, alignItems: 'center', justifyContent: 'center' },
  btnYes: { backgroundColor: ROSE },
  btnNo: { marginTop: 10, backgroundColor: INK_06 },
  btnTextYes: {
    color: '#FFFFFF', fontFamily: FONTS.sansBold, fontWeight: '700', fontSize: 18,
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  // Muted + regular weight, and NOT uppercased: the decline reads as the quiet
  // option next to YES!.
  btnTextNo: { color: TXTSUB, fontFamily: FONTS.sans, fontSize: 17, letterSpacing: 0.3 },
});
