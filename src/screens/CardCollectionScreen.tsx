import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { BG, TXT, TXTSUB, ROSE, INK_06, FONTS, P } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useQuiz } from '../state/QuizContext';
import { useUILanguage } from '../state/UILanguageContext';
import {
  MYSTERY_CARD_COUNT, localizedCardBody, type MysteryCard,
} from '../constants/mysteryCards';
import { MysteryCardFront, CARD_RADIUS } from '../components/quiz/MysteryCardFace';
import MysteryCardArt, { CARD_SHARE_WIDTH } from '../components/quiz/MysteryCardArt';
import { shareCard, saveCard } from '../services/cardShare';
import type { RootStackScreenProps } from '../navigation/types';

// Everything the mystery draw has given her.
//
// ITS OWN SCREEN, not a band under the paintings on PuzzleCollectionScreen.
// That screen's whole correctness argument is that nothing there is stored and
// every pixel derives from `completedSets`; this list is stored, likeable and
// filterable, and bolting it on would destroy the invariant.
//
// The product reason matters more: a card she read once and can never find
// again is a notification, not a reward.
//
// NO LOCKED SLOTS. 30-odd grey rectangles reframe a gift as a checklist — and
// this is comfort written for someone in distress, so each empty slot is a
// reminder of what she did not get. One "N of 40" line carries the same
// progress signal at no emotional cost.
//
// NO TITLES, because cards have none: the whole design premise is that the body
// stands alone. A row is the first line of the body, truncated. `theme` is
// backend-only — it drives analytics, never a label she reads.

/** Below this the "Liked only" toggle is hidden. A filter over four items is
 *  furniture, not a feature. */
const FILTER_MIN = 6;

export default function CardCollectionScreen({ navigation }: RootStackScreenProps<'CardCollection'>) {
  const t = useT();
  const { lang } = useUILanguage();
  const insets = useSafeAreaInsets();
  const { collectedCards, cardIsLiked, logCardOpen } = useQuiz();
  const [likedOnly, setLikedOnly] = useState(false);
  const [detail, setDetail] = useState<MysteryCard | null>(null);

  const canFilter = collectedCards.length >= FILTER_MIN;
  const rows = useMemo(
    () => (likedOnly && canFilter ? collectedCards.filter(c => cardIsLiked(c.id)) : collectedCards),
    [collectedCards, likedOnly, canFilter, cardIsLiked],
  );

  const openCard = useCallback((c: MysteryCard) => {
    logCardOpen(c.id);
    setDetail(c);
  }, [logCardOpen]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="x" size={24} color={TXT} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('quiz.cards.title')}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.count} maxFontSizeMultiplier={1.3}>
          {t('quiz.cards.count', { n: collectedCards.length, total: MYSTERY_CARD_COUNT })}
        </Text>

        {canFilter ? (
          <TouchableOpacity
            style={[styles.filter, likedOnly && styles.filterOn]}
            onPress={() => setLikedOnly(v => !v)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: likedOnly }}
          >
            <Feather name="heart" size={14} color={likedOnly ? '#FFFFFF' : TXTSUB} />
            <Text style={[styles.filterText, likedOnly && styles.filterTextOn]} maxFontSizeMultiplier={1.2}>
              {t('quiz.cards.likedOnly')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {collectedCards.length === 0 ? (
          <Text style={styles.empty} maxFontSizeMultiplier={1.3}>{t('quiz.cards.empty')}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty} maxFontSizeMultiplier={1.3}>{t('quiz.cards.noneLiked')}</Text>
        ) : (
          rows.map(c => (
            <CardRow
              key={c.id}
              body={localizedCardBody(c, lang as never)}
              liked={cardIsLiked(c.id)}
              onPress={() => openCard(c)}
            />
          ))
        )}
      </ScrollView>

      {detail ? <CardDetail card={detail} onClose={() => setDetail(null)} /> : null}
    </View>
  );
}

function CardRow({ body, liked, onPress }: { body: string; liked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Text style={styles.rowText} numberOfLines={2} maxFontSizeMultiplier={1.4}>
        {body}
      </Text>
      {liked ? <Feather name="heart" size={16} color={ROSE} style={styles.rowHeart} /> : null}
    </TouchableOpacity>
  );
}

/** Full card, plus the same three actions the draw overlay offers. */
function CardDetail({ card, onClose }: { card: MysteryCard; onClose: () => void }) {
  const t = useT();
  const { lang } = useUILanguage();
  const { width } = useWindowDimensions();
  const { likeCard, cardIsLiked, logCardShare } = useQuiz();
  const shotRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const body = localizedCardBody(card, lang as never);
  const liked = cardIsLiked(card.id);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 1600); };

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    logCardShare(card.id, 'system');
    await shareCard(shotRef.current, t('quiz.card.share'));
    setBusy(false);
  };

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    logCardShare(card.id, 'save');
    await saveCard(
      shotRef.current,
      () => showToast(t('shareVerse.saveAlert.title')),
      { failTitle: t('error.couldNotSave'), tryAgain: t('common.tryAgain') },
    );
    setBusy(false);
  };

  return (
    <View style={styles.detail}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} accessibilityLabel={t('common.close')} />

      {/* Height is intrinsic, clamped: the pool ranges from ~28 to ~48 words and
          a fixed box would either clip the long ones or leave the short ones
          swimming. */}
      <View style={[styles.detailCard, { width: width - P * 2 }]}>
        <MysteryCardFront body={body} inline />
      </View>

      <View style={styles.detailActions}>
        <IconAction
          icon="heart" filled={liked} label={t('quiz.card.like')}
          onPress={() => likeCard(card.id, 'collection')}
        />
        <IconAction icon="share-2" label={t('quiz.card.share')} onPress={onShare} />
        <IconAction icon="download" label={t('quiz.card.save')} onPress={onSave} />
      </View>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </View>
      ) : null}

      {/* Off-screen capture source — laid out for real, parked outside the
          viewport. A node hidden with opacity or display:none captures blank
          on Android. */}
      <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
        <View ref={shotRef} collapsable={false}>
          <MysteryCardArt body={body} width={CARD_SHARE_WIDTH} />
        </View>
      </View>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 18,
    color: TXT, letterSpacing: 0.3,
  },
  scroll: { paddingHorizontal: P, paddingTop: 6 },
  count: {
    fontFamily: FONTS.lato, fontSize: 13.5, color: TXTSUB,
    letterSpacing: 0.2, marginBottom: 14,
  },
  filter: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 13, borderRadius: 20,
    backgroundColor: INK_06, marginBottom: 16,
  },
  filterOn: { backgroundColor: ROSE },
  filterText: { fontFamily: FONTS.lato, fontSize: 13, color: TXTSUB },
  filterTextOn: { color: '#FFFFFF' },
  empty: {
    fontFamily: FONTS.lato, fontSize: 13.5, color: TXTSUB,
    lineHeight: 21, letterSpacing: 0.2, marginTop: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10,
  },
  rowText: {
    flex: 1, fontFamily: FONTS.merriweather, fontSize: 14,
    lineHeight: 22, color: TXT,
  },
  rowHeart: { marginLeft: 12 },

  detail: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center' },
  detailCard: { borderRadius: CARD_RADIUS, overflow: 'hidden' },
  detailActions: { flexDirection: 'row', justifyContent: 'center', gap: 34, marginTop: 34 },
  iconAction: { alignItems: 'center', gap: 6 },
  iconDisc: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconDiscOn: { backgroundColor: ROSE },
  iconLabel: { color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.lato, fontSize: 11 },
  toast: {
    position: 'absolute', left: 40, right: 40, bottom: 90,
    backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  toastText: { color: '#FFFFFF', fontFamily: FONTS.lato, fontSize: 14, textAlign: 'center' },
  offscreen: { position: 'absolute', left: -9999, top: 0 },
});
