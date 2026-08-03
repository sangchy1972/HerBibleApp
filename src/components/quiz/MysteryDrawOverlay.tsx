import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback, StyleSheet,
  BackHandler, useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, BTN_RADIUS, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { useQuiz } from '../../state/QuizContext';
import { useUILanguage } from '../../state/UILanguageContext';
import { localizedCardBody, type MysteryCard } from '../../constants/mysteryCards';
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
// same person sees it ~120 times a year.
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

export default function MysteryDrawOverlay({ onDone }: { onDone: () => void }) {
  const t = useT();
  const { lang } = useUILanguage();
  const { width } = useWindowDimensions();
  const { drawSpread, drawCard, likeCard, cardIsLiked, logCardShare } = useQuiz();
  const shotRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('spread');
  const [chosen, setChosen] = useState<MysteryCard | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState(false);

  // Frozen on mount. `drawSpread` recomputes the moment the card is collected —
  // reading it live would swap the four faces out from under the reveal.
  const spread = useRef(drawSpread).current;

  const scrim = useSharedValue(0);
  const prompt = useSharedValue(0);
  const actions = useSharedValue(0);

  useEffect(() => {
    scrim.value = withTiming(0.82, { duration: 640, easing: Easing.out(Easing.quad) });
    prompt.value = withDelay(PROMPT_AT, withTiming(1, { duration: 400 }));
  }, [scrim, prompt]);

  // Leaving mid-draw is allowed and NOT destructive: pendingDraw is only spent
  // by drawCard, so backing out returns her to the same spread later.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'spread') { onDone(); return true; }
      skip();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, onDone]);

  const geom = useMemo(() => {
    const gutter = 15;
    const gap = 14;
    const w = Math.min(140, (width - gutter * 2 - gap) / 2);
    const h = Math.round(w * 1.12);
    return { gutter, gap, w, h, finalW: width - gutter * 2 };
  }, [width]);

  const pick = useCallback((card: MysteryCard) => {
    if (phase !== 'spread') return;
    setPhase('reveal');
    setChosen(card);
    drawCard(card.id);
  }, [phase, drawCard]);

  // Any tap during reveal or typing jumps to the end state. She will see this
  // ~120 times; an animation with no way out becomes the thing she dreads about
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);

  const onShare = useCallback(async () => {
    if (busy || !chosen) return;
    setBusy(true);
    // Log BEFORE the sheet opens. The OS gives no reliable "she actually sent
    // it" callback, so the event means intent-to-share — which is the number
    // that is comparable across the app, since the verse and badge sheets log
    // at the same point.
    logCardShare(chosen.id, 'system');
    await shareCard(shotRef.current, t('quiz.card.share'));
    setBusy(false);
  }, [busy, chosen, logCardShare, t]);

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

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {spread.map((card, i) => (
          <DrawCard
            key={card.id}
            card={card}
            index={i}
            geom={geom}
            lang={lang}
            phase={phase}
            isChosen={chosen?.id === card.id}
            typing={typing}
            onPress={() => pick(card)}
            onTypingDone={() => setTyped(true)}
          />
        ))}
      </View>

      {/* Off-screen capture source. Rendered at full resolution and parked far
          outside the viewport rather than hidden with opacity or display:none —
          a node that is not laid out captures blank on Android. */}
      {chosen ? (
        <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
          <View ref={shotRef} collapsable={false}>
            <MysteryCardArt body={localizedCardBody(chosen, lang as never)} width={CARD_SHARE_WIDTH} />
          </View>
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </View>
      ) : null}

      {chosen ? (
        <Animated.View style={[styles.actions, actionsStyle]} pointerEvents={typed ? 'auto' : 'none'}>
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
  card, index, geom, lang, phase, isChosen, typing, onPress, onTypingDone,
}: {
  card: MysteryCard;
  index: number;
  geom: { gutter: number; gap: number; w: number; h: number; finalW: number };
  lang: string;
  phase: Phase;
  isChosen: boolean;
  typing: boolean;
  onPress: () => void;
  onTypingDone: () => void;
}) {
  const { height } = useWindowDimensions();
  const col = index % 2;
  const row = Math.floor(index / 2);

  const startLeft = geom.gutter + col * (geom.w + geom.gap);
  const startTop = height * 0.26 + row * (geom.h + geom.gap);
  const finalTop = height * 0.28;
  const finalH = 210;

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
    height: interpolate(grow.value, [0, 1], [geom.h, finalH]),
    opacity: fade.value * enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [24, 0]) },
      { scale: interpolate(enter.value, [0, 1], [0.92, 1]) },
    ],
  }));

  // Two faces, each hidden when turned away. Rotating one container and
  // swapping children at 90deg is the alternative and it tears on Android.
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1100 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1100 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  const body = localizedCardBody(card, lang as never);

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
  prompt: {
    position: 'absolute', top: '17%', left: 0, right: 0,
    textAlign: 'center', color: 'rgba(255,255,255,0.8)',
    fontFamily: FONTS.latoBold, fontSize: 13, letterSpacing: 1.6,
  },
  card: { position: 'absolute', borderRadius: CARD_RADIUS },
  actions: { position: 'absolute', left: 22, right: 22, bottom: 36 },
  iconRow: { flexDirection: 'row', justifyContent: 'center', gap: 34, marginBottom: 22 },
  iconAction: { alignItems: 'center', gap: 6 },
  iconDisc: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconDiscOn: { backgroundColor: ROSE },
  iconLabel: { color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.lato, fontSize: 11 },
  cta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontFamily: FONTS.latoBold, fontSize: 16.5, color: '#FFFFFF', letterSpacing: 0.4 },
  offscreen: { position: 'absolute', left: -9999, top: 0 },
  toast: {
    position: 'absolute', left: 40, right: 40, bottom: 190,
    backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  toastText: { color: '#FFFFFF', fontFamily: FONTS.lato, fontSize: 14, textAlign: 'center' },
});
