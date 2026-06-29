import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { TXT, TXTSUB, ROSE, FONTS } from '../constants/theme';
import { VERSE_COMMENTS, COMMENT_NAMES } from '../constants/verseComments';
import { useUILanguage } from '../state/UILanguageContext';
import { useT } from '../i18n/useT';

// Bottom-sheet of decorative "community" reactions on the daily verse. The
// comments + names are canned (see constants/verseComments.ts) — NOT real user
// data, purely social-proof encouragement. Each open shows a fresh random 5–25
// of them (the component remounts per open, so the useMemo re-rolls). Localized
// to the active UI language.

const AVATAR_COLORS = ['#E8619A', '#7B6CF6', '#F2A65A', '#3FAE6A', '#5B8DEF', '#E36588', '#46B3A6', '#C9772E'];
const SCREEN_H = Dimensions.get('window').height;

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '🙂';
}
function hashIdx(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}
// Fisher–Yates, returns the first n of a shuffled copy.
function sample<T>(arr: readonly T[], n: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

interface Row { id: number; name: string; text: string; ago: string; likes: number }

export default function CommentsSheet({ onClose }: { onClose: () => void }) {
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
  }, [backdropO, sheetTY]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));
  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTY.value }] }));

  const rows = useMemo<Row[]>(() => {
    const pool = VERSE_COMMENTS[lang] || VERSE_COMMENTS.en;
    const count = 5 + Math.floor(Math.random() * 21);            // 5..25
    const texts = sample(pool, count);
    const names = sample(COMMENT_NAMES, texts.length);           // distinct names where possible
    return texts.map((text, i) => {
      const mins = 1 + Math.floor(Math.random() * 4000);         // up to ~2.7 days ago
      const ago = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
      return {
        id: i,
        name: names[i] ?? COMMENT_NAMES[i % COMMENT_NAMES.length],
        text,
        ago,
        likes: Math.floor(Math.random() * 240),
      };
    });
  }, [lang]);

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
            <CommentRow key={r.id} row={r} />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// One comment row with a tappable like-heart. Tapping toggles a filled rose
// heart + bumps the count, with a quick pop animation so the tap clearly
// registers (the heart had no interaction feedback before — user-reported).
function CommentRow({ row }: { row: Row }) {
  const [liked, setLiked] = useState(false);
  const scale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const toggle = () => {
    setLiked((l) => !l);
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
          <Text style={styles.name}>{row.name}</Text>
          <Text style={styles.ago}>· {row.ago}</Text>
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
  name: { fontSize: 14, fontWeight: '700', color: TXT },
  ago: { fontSize: 12, color: TXTSUB },
  text: { fontSize: 15, lineHeight: 21, color: TXT, fontFamily: FONTS.lato },
  likeCol: { alignItems: 'center', gap: 2, paddingTop: 2 },
  likeCount: { fontSize: 11, color: TXTSUB },
});
