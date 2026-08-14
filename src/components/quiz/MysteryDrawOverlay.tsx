import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback, StyleSheet,
  BackHandler, useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROSE, BTN_RADIUS, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { useQuiz } from '../../state/QuizContext';
import { useUILanguage } from '../../state/UILanguageContext';
import { localizedCardBody, MYSTERY_CARD_COUNT, type MysteryCard } from '../../constants/mysteryCards';
import type { UILanguageCode } from '../../state/UILanguageContext';
import { MysteryCardBack, MysteryCardFront, CARD_RADIUS } from './MysteryCardFace';
import MysteryCardArt, { CARD_SHARE_WIDTH } from './MysteryCardArt';
import { shareCard, saveCard } from '../../services/cardShare';

// The mystery card draw.
//
// Reanimated SHARED VALUES throughout, never layout `entering` — this repo has
// been bitten by layout animations replaying on remount.
//
// TIMING IS DELIBERATELY SLOW (~7s tap-to-readable), after two rounds of the
// owner asking for slower. A draw costs three completed sets, so the ceremony
// is proportionate to what it took. It is still fully skippable, because the
// same person sees it about once a day, and 43 times in total before the quiz
// retires against today's bank.
//
// Phases:
//   spread   4 face-down cards, waiting for a pick
//   reveal   the others fade out, the chosen one widens and flips
//   read     typewriter, then the actions

const DEAL_STAGGER = 120;
const DEAL_AT = 680;
const PROMPT_AT = 1240;
const EXPAND_AT = 320;
const FLIP_AT = 1120;
const FLIP_MS = 2080;
const TYPE_AT = 3320;

type Phase = 'spread' | 'reveal' | 'read';

export default function MysteryDrawOverlay({
  onDone, blocked = false,
}: {
  onDone: () => void;
  /** Another overlay is on top. Back must fall through to it. */
  blocked?: boolean;
}) {
  const t = useT();
  const { lang } = useUILanguage();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { drawSpread, resolveDrawPick, drawCard, likeCard, cardIsLiked, logCardShare, collectedCards } = useQuiz();
  const collectedCount = collectedCards.length;
  const shotRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Measured, not fixed. A hardcoded height clips the longest cards — the pool
  // runs 30-46 words (against a 27-48 band) and the tallest need 7 lines at this
  // width, so a 210pt box
  // cuts the last sentence off mid-word after a 7-second reveal. The measuring
  // copy renders off-screen at the final width and reports its intrinsic
  // height; until it lands, `null` keeps the reveal from animating to a size we
  // have not confirmed.
  const [finalH, setFinalH] = useState<number | null>(null);

  const [phase, setPhase] = useState<Phase>('spread');
  const [chosen, setChosen] = useState<MysteryCard | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState(false);

  // Frozen on mount. `drawSpread` recomputes the moment the card is collected —
  // reading it live would swap the four faces out from under the reveal.
  //
  // STATE, not a ref, because the tapped position may be rewritten once: when
  // the table has been topped up with cards she already holds, resolveDraw
  // hands her a missing one instead, and it has to appear at the position her
  // finger is on. Nothing else is ever revealed, so nothing else can disagree.
  const [spread, setSpread] = useState<MysteryCard[]>(() => drawSpread);
  // Which POSITION flips. Not `chosen?.id === card.id`: after the rewrite the
  // same card can sit at two positions, and an id comparison would flip both.
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);

  const scrim = useSharedValue(0);
  const prompt = useSharedValue(0);
  const actions = useSharedValue(0);

  useEffect(() => {
    // 0.82 → 0.93 (owner 2026-08-14): the review screen's own copy was reading
    // straight through the dimmer between the cards, which made the whole
    // overlay look broken rather than layered.
    scrim.value = withTiming(0.93, { duration: 640, easing: Easing.out(Easing.quad) });
    prompt.value = withDelay(PROMPT_AT, withTiming(1, { duration: 400 }));
  }, [scrim, prompt]);

  // Leaving mid-draw is allowed and NOT destructive: pendingDraw is only spent
  // by drawCard, so backing out returns her to the same spread later.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // BackHandler runs subscriptions last-registered-first, and the painting
      // celebration mounts BEFORE this one — so without this guard the hidden
      // draw overlay swallowed Back on the completion screen and ejected her
      // from the quiz mid-celebration.
      if (blocked) return false;
      if (phase === 'spread') { onDone(); return true; }
      skip();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, onDone, blocked]);

  const geom = useMemo(() => {
    const gutter = 15;
    const gap = 14;
    const w = Math.min(140, (width - gutter * 2 - gap) / 2);
    const h = Math.round(w * 1.12);
    return { gutter, gap, w, h, finalW: width - gutter * 2 };
  }, [width]);

  // A REF, not `phase`. `phase` in this closure is a render behind, so two taps
  // landing in the same frame both pass a state check — drawCard would then
  // correctly collect only the first card while setChosen ran twice, and the
  // SECOND card is what flips over, gets typed out, and receives her heart.
  // She would like a card her collection does not contain.
  const picked = useRef(false);
  const pick = useCallback((index: number) => {
    if (picked.current) return;
    const card = resolveDrawPick(index);
    if (!card) return;
    picked.current = true;
    setSpread(prev => prev.map((c, i) => (i === index ? card : c)));
    setChosenIndex(index);
    setPhase('reveal');
    setChosen(card);
    drawCard(card.id);
  }, [drawCard, resolveDrawPick]);

  // Any tap during reveal or typing jumps to the end state. She will see this
  // 43 times in all; an animation with no way out becomes the thing she dreads about
  // finishing a set. The tap target is the whole screen, not just a button —
  // wherever her thumb lands should work.
  const skip = useCallback(() => {
    if (phase === 'spread') return;
    setTyping(false);
    setTyped(true);
    setPhase('read');
  }, [phase]);

  useEffect(() => {
    if (phase !== 'reveal') return;
    const h = setTimeout(() => { setPhase('read'); setTyping(true); }, TYPE_AT);
    return () => clearTimeout(h);
  }, [phase]);

  useEffect(() => {
    if (typed) actions.value = withTiming(1, { duration: 250 });
  }, [typed, actions]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  const onShare = useCallback(async () => {
    if (busy || !chosen) return;
    setBusy(true);
    // Log BEFORE the sheet opens. The OS gives no reliable "she actually sent
    // it" callback, so the event means intent-to-share — which is the number
    // that is comparable across the app, since the verse and badge sheets log
    // at the same point.
    logCardShare(chosen.id, 'system');
    // A false return means the sheet never opened (no share provider). Without
    // this she taps, nothing happens, and there is no way to tell whether it
    // worked.
    // Silent on 'cancelled' — she changed her mind, that is not an error.
    const r = await shareCard(shotRef.current, t('quiz.card.share'));
    if (r === 'unavailable' || r === 'failed') showToast(t('error.couldNotShare'));
    setBusy(false);
  }, [busy, chosen, logCardShare, showToast, t]);

  const onSave = useCallback(async () => {
    if (busy || !chosen) return;
    setBusy(true);
    logCardShare(chosen.id, 'save');
    await saveCard(
      shotRef.current,
      () => showToast(t('shareVerse.saveAlert.title')),
      { failTitle: t('error.couldNotSave'), tryAgain: t('common.tryAgain') },
    );
    setBusy(false);
  }, [busy, chosen, logCardShare, showToast, t]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const promptStyle = useAnimatedStyle(() => ({ opacity: phase === 'spread' ? prompt.value : 0 }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actions.value }));

  const liked = chosen ? cardIsLiked(chosen.id) : false;

  return (
    <View style={StyleSheet.absoluteFill}>
      <TouchableWithoutFeedback onPress={skip} accessible={false}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
      </TouchableWithoutFeedback>

      <Animated.Text style={[styles.prompt, promptStyle]} pointerEvents="none" maxFontSizeMultiplier={1.2}>
        {t('quiz.card.chooseOne')}
      </Animated.Text>

      {/* Escape hatch. The scrim covers the screen's own close button and its
          onPress is deliberately inert while she is choosing, so without this
          iOS has NO way out of the spread — Android would have the hardware
          back and iOS would have nothing. pendingDraw is untouched, so the same
          spread is waiting for her next time. */}
      {phase === 'spread' ? (
        <TouchableOpacity
          style={[styles.close, { top: insets.top + 8 }]}
          onPress={onDone}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Feather name="x" size={22} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
      ) : null}

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {spread.map((card, i) => (
          <DrawCard
            key={i}
            card={card}
            index={i}
            geom={geom}
            lang={lang}
            phase={phase}
            isChosen={chosenIndex === i}
            typing={typing}
            finalH={finalH}
            onPress={() => pick(i)}
            onTypingDone={() => setTyped(true)}
          />
        ))}
      </View>

      {/* Measuring copy: the real front at the real width, laid out off-screen
          so its intrinsic height can be read once. */}
      {chosen && finalH == null ? (
        <View style={styles.offscreen} pointerEvents="none">
          <View
            style={{ width: geom.finalW }}
            onLayout={e => setFinalH(Math.round(e.nativeEvent.layout.height))}
          >
            <MysteryCardFront body={localizedCardBody(chosen, lang)} inline />
          </View>
        </View>
      ) : null}

      {/* Off-screen capture source. Rendered at full resolution and parked far
          outside the viewport rather than hidden with opacity or display:none —
          a node that is not laid out captures blank on Android. */}
      {chosen ? (
        <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
          <View ref={shotRef} collapsable={false}>
            <MysteryCardArt body={localizedCardBody(chosen, lang)} width={CARD_SHARE_WIDTH} />
          </View>
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </View>
      ) : null}

      {chosen ? (
        <Animated.View
          style={[styles.actions, { bottom: Math.max(28, insets.bottom + 16) }, actionsStyle]}
          pointerEvents={typed ? 'auto' : 'none'}
        >
          <View style={styles.iconRow}>
            <IconAction
              icon={liked ? 'heart' : 'heart'}
              filled={liked}
              label={t('quiz.card.like')}
              onPress={() => likeCard(chosen.id, 'draw')}
            />
            <IconAction icon="share-2" label={t('quiz.card.share')} onPress={onShare} />
            <IconAction icon="download" label={t('quiz.card.save')} onPress={onSave} />
          </View>
          {/* Where it went. Without this the collection is invisible to anyone
              who never opens Profile, and by the spec's own argument the draw
              degrades back into a notification. */}
          <Text style={styles.saved} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {t('quiz.card.savedTo', { n: collectedCount, total: MYSTERY_CARD_COUNT })}
          </Text>
          <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={onDone} accessibilityRole="button">
            <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {t('quiz.card.collect')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </View>
  );
}

function IconAction({
  icon, label, onPress, filled = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  filled?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.iconAction} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.iconDisc, filled && styles.iconDiscOn]}>
        <Feather name={icon} size={21} color="#FFFFFF" />
      </View>
      <Text style={styles.iconLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
    </TouchableOpacity>
  );
}

function DrawCard({
  card, index, geom, lang, phase, isChosen, typing, finalH, onPress, onTypingDone,
}: {
  card: MysteryCard;
  index: number;
  geom: { gutter: number; gap: number; w: number; h: number; finalW: number };
  lang: UILanguageCode;
  phase: Phase;
  isChosen: boolean;
  typing: boolean;
  /** Measured intrinsic height of the revealed card, or null while measuring. */
  finalH: number | null;
  onPress: () => void;
  onTypingDone: () => void;
}) {
  const { height } = useWindowDimensions();
  const col = index % 2;
  const row = Math.floor(index / 2);

  const startLeft = geom.gutter + col * (geom.w + geom.gap);
  const startTop = height * 0.26 + row * (geom.h + geom.gap);
  const grownH = Math.max(210, finalH ?? 210);
  // Centre the grown card on the same band the spread occupied, so it does not
  // jump up or down as it widens.
  const finalTop = Math.max(height * 0.14, height * 0.42 - grownH / 2);

  const enter = useSharedValue(0);
  const grow = useSharedValue(0);
  const flip = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    enter.value = withDelay(DEAL_AT + index * DEAL_STAGGER, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [enter, index]);

  useEffect(() => {
    if (phase === 'spread') return;
    if (isChosen) {
      grow.value = withDelay(EXPAND_AT, withTiming(1, { duration: 840, easing: Easing.out(Easing.cubic) }));
      flip.value = withDelay(FLIP_AT, withTiming(1, { duration: FLIP_MS, easing: Easing.bezier(0.42, 0.02, 0.26, 1) }));
    } else {
      fade.value = withTiming(0, { duration: 440, easing: Easing.in(Easing.quad) });
    }
  }, [phase, isChosen, grow, flip, fade]);

  // Skipping: the phase jumps to 'read' before the timers land, so snap.
  useEffect(() => {
    if (phase !== 'read') return;
    if (isChosen) { grow.value = withTiming(1, { duration: 160 }); flip.value = withTiming(1, { duration: 200 }); }
    else fade.value = withTiming(0, { duration: 120 });
  }, [phase, isChosen, grow, flip, fade]);

  const box = useAnimatedStyle(() => ({
    left: interpolate(grow.value, [0, 1], [startLeft, geom.gutter]),
    top: interpolate(grow.value, [0, 1], [startTop, finalTop]),
    width: interpolate(grow.value, [0, 1], [geom.w, geom.finalW]),
    height: interpolate(grow.value, [0, 1], [geom.h, grownH]),
    opacity: fade.value * enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [24, 0]) },
      { scale: interpolate(enter.value, [0, 1], [0.92, 1]) },
    ],
  }));

  // Two faces, each hidden when turned away — but NOT by backfaceVisibility
  // alone. On new-architecture Android that flag is unreliable (shipped bug,
  // 2026-08-14: the face-down spread showed the FRONT's text, mirrored, on
  // every card — the rotated front simply painted over the satin back). The
  // opacity flip below is the guarantee: each face exists only on its own half
  // of the rotation, swapping at 90° where the card is edge-on and the cut is
  // invisible. backfaceVisibility stays for clean edges where it does work.
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1100 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 0 : 1,
    transform: [{ perspective: 1100 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  const body = localizedCardBody(card, lang);

  return (
    <Animated.View style={[styles.card, box]} pointerEvents={phase === 'spread' ? 'auto' : 'none'}>
      <TouchableWithoutFeedback onPress={onPress} accessibilityRole="button">
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>
            <MysteryCardBack />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
            <MysteryCardFront body={body} typing={typing && isChosen} onTypingDone={onTypingDone} />
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: '#000000' },
  // "CHOOSE ONE" — doubled from 13 and painted ROSE (owner 2026-08-14: it was
  // unreadably small and anonymous white). Letterspacing eased down with the
  // size: 1.6 at 26pt reads gappy in the all-caps languages.
  prompt: {
    position: 'absolute', top: '15%', left: 0, right: 0,
    textAlign: 'center', color: ROSE,
    fontFamily: FONTS.latoBold, fontWeight: '700', fontSize: 26, letterSpacing: 1.1,
    paddingHorizontal: 24,
  },
  card: { position: 'absolute', borderRadius: CARD_RADIUS },
  actions: { position: 'absolute', left: 22, right: 22 },
  close: { position: 'absolute', right: 14, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconRow: { flexDirection: 'row', justifyContent: 'center', gap: 34, marginBottom: 22 },
  iconAction: { alignItems: 'center', gap: 6 },
  iconDisc: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconDiscOn: { backgroundColor: ROSE },
  iconLabel: { color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.lato, fontSize: 11 },
  saved: {
    color: 'rgba(255,255,255,0.55)', fontFamily: FONTS.lato, fontSize: 12,
    textAlign: 'center', marginBottom: 12, letterSpacing: 0.2,
  },
  cta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontFamily: FONTS.latoBold, fontSize: 17.5, color: '#FFFFFF', letterSpacing: 0.4 },   // CTA size unified at 17.5 (was 16.5) — per user
  offscreen: { position: 'absolute', left: -9999, top: 0 },
  toast: {
    position: 'absolute', left: 40, right: 40, bottom: 190,
    backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  toastText: { color: '#FFFFFF', fontFamily: FONTS.lato, fontSize: 14, textAlign: 'center' },
});
