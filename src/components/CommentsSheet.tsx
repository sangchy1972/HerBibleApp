import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useSheetSurface } from '../state/promptSurface';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { TXT, TXTSUB, ROSE, FONTS } from '../constants/theme';
import { useUILanguage } from '../state/UILanguageContext';
import { useT } from '../i18n/useT';
import { buildCommentFeed, type FeedComment, type VerseSlot } from '../state/verseCommentsFeed';
import { getLikedIds, toggleCommentLike } from '../state/verseCommentLikes';

// Bottom-sheet of decorative "community" reactions on the daily verse. The
// comments + names are canned (see constants/verseComments.ts) — NOT real user
// data, purely social-proof encouragement. The feed is DETERMINISTIC per
// (ymd, slot): reopening shows the identical thread, and the user's likes
// persist (verseCommentLikes, AsyncStorage) — a liked comment stays liked all
// day (user-reported: "liked one, reopened, everything changed"). `count`
// comes from the verse card's badge (same per-day formula), so the badge and
// the list always match. Localized to the active UI language: switching
// mid-day swaps only the texts; names/ages/likes/order/ids stay put.

const AVATAR_COLORS = ['#E63F69', '#7B6CF6', '#F2A65A', '#3FAE6A', '#5B8DEF', '#E36588', '#46B3A6', '#C9772E'];
const SCREEN_H = Dimensions.get('window').height;

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '🙂';
}
function hashIdx(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

export default function CommentsSheet({ ymd, slot, count, onClose }: {
  ymd: string; slot: VerseSlot; count: number; onClose: () => void;
}) {
  // These sheets live INSIDE their screen, but the root-mounted nudges are later
  // siblings of the navigator — so a nudge's zIndex 60 beats this sheet's 200 and
  // would land on top, orphaning it behind a second scrim. Claiming the surface
  // holds every blocking prompt back for as long as this is mounted.
  useSheetSurface(true);
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang } = useUILanguage();

  // Entrance via shared values (NOT reanimated `entering`) — layout-entering
  // animations don't reliably run inside a RN <Modal> on the new architecture,
  // which left the sheet stuck off-screen (its SlideInDown start), so tapping
  // the comment button "did nothing". useAnimatedStyle DOES work in a Modal.
  const backdropO = useSharedValue(0);
  const sheetTY = useSharedValue(SCREEN_H);
  useEffect(() => {
    backdropO.value = withTiming(1, { duration: 220 });
    sheetTY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    // Watchdog. Shared values are far more reliable than `entering=` in a Modal,
    // but a cancelled timing would still leave an invisible backdrop over a
    // sheet that is off-screen — inside a native window, so the whole app would
    // be untappable with the dismiss target in an opacity-0 subtree.
    const wd = setTimeout(() => { backdropO.value = 1; sheetTY.value = 0; }, 900);
    return () => clearTimeout(wd);
  }, [backdropO, sheetTY]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));
  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTY.value }] }));

  // Deterministic feed — same (ymd, slot) → identical thread every open.
  // All inputs are frozen at open (the sheet remounts per open), so this
  // never re-rolls while visible; a language change swaps texts only.
  const rows = useMemo<FeedComment[]>(
    () => buildCommentFeed({ ymd, slot, lang, count }),
    [ymd, slot, lang, count],
  );

  // The user's likes, lifted to the sheet + persisted (survive reopen AND
  // app restart within the day). Synchronous read — no flicker.
  const [likedIds, setLikedIds] = useState<Set<number>>(() => getLikedIds(ymd, slot));
  const onToggleLike = (id: number) => setLikedIds(new Set(toggleCommentLike(ymd, slot, id)));

  return (
    <View style={styles.overlay}>
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 10 }, sheetAnim]}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{t('comments.title')}</Text>
          <Text style={styles.count}>{rows.length}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Feather name="x" size={20} color={TXTSUB} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
          {rows.map(r => (
            <CommentRow key={r.id} row={r} liked={likedIds.has(r.id)} onToggle={() => onToggleLike(r.id)} />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// One comment row with a tappable like-heart. Controlled: the sheet owns the
// liked set (persisted per day/slot); the row keeps only the pop animation so
// the tap clearly registers.
function CommentRow({ row, liked, onToggle }: { row: FeedComment; liked: boolean; onToggle: () => void }) {
  const scale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const toggle = () => {
    onToggle();
    scale.value = withSequence(
      withTiming(1.35, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
    );
  };
  const likes = row.likes + (liked ? 1 : 0);
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[hashIdx(row.name, AVATAR_COLORS.length)] }]}>
        <Text style={styles.avatarTxt}>{initialOf(row.name)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.name} numberOfLines={1}>{row.name}</Text>
          <Text style={styles.ago} numberOfLines={1}>· {row.agoLabel}</Text>
        </View>
        <Text style={styles.text}>{row.text}</Text>
      </View>
      <TouchableOpacity style={styles.likeCol} onPress={toggle} activeOpacity={0.7} hitSlop={12}>
        <Animated.View style={heartStyle}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={17} color={liked ? ROSE : TXTSUB} />
        </Animated.View>
        <Text style={[styles.likeCount, liked && { color: ROSE, fontWeight: '700' }]}>{likes}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 200 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '82%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    width: 40, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center', marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '700', color: TXT, fontFamily: FONTS.loraBold },
  count: { fontSize: 15, fontWeight: '600', color: TXTSUB },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,27,46,0.05)' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 17 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  body: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { fontSize: 14, fontWeight: '700', color: TXT, flexShrink: 1 },
  ago: { fontSize: 12, color: TXTSUB, flexShrink: 0 },
  text: { fontSize: 15, lineHeight: 21, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.4 },
  likeCol: { alignItems: 'center', gap: 2, paddingTop: 2 },
  likeCount: { fontSize: 11, color: TXTSUB },
});
