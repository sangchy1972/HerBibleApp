import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import BadgeIcon from '../components/BadgeIcon';
import { ACHIEVEMENTS, achievementUi, localizedAchievementName, localizedAchievementRule, type Achievement } from '../constants/achievements';
import { useAchievements } from '../state/AchievementsContext';
import { useTranslation } from '../state/TranslationsContext';
import { useAuth } from '../state/AuthContext';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import type { RootStackScreenProps } from '../navigation/types';

// Pull a small numeric "label" from the badge condition so the inset reads
// "7", "30", "100%" etc. without having to ship extra fields per badge.
function labelFor(a: Achievement): string | null {
  const c = a.condition;
  switch (c.kind) {
    case 'prayerStreak':
    case 'readingStreak':
    case 'earlyBirdStreak':
    case 'allThreeStreaks':
    case 'activeYears':
      return String(c.days);
    case 'prayerCount':
    case 'chaptersRead':
    case 'notesCount':
    case 'highlightsCount':
    case 'highlightedBooks':
    case 'planCount':
    case 'shareCount':
      return String(c.total);
    case 'planInWindow':
      return String(c.total);
    case 'readPercent':
      return `${c.percent}%`;
    default:
      return null;
  }
}

export default function AchievementScreen({ navigation }: RootStackScreenProps<'Achievement'>) {
  const insets = useSafeAreaInsets();
  const { earned } = useAchievements();
  const { current: translation } = useTranslation();
  const { user } = useAuth();
  const ui = achievementUi(translation.code);
  const [detail, setDetail] = useState<Achievement | null>(null);

  const earnedList = useMemo(() => ACHIEVEMENTS.filter(a => !!earned[a.id]), [earned]);
  const lockedList = useMemo(() => ACHIEVEMENTS.filter(a => !earned[a.id]), [earned]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{ui.title}</Text>
        <View style={styles.headerBtn} />
      </View>

      {!user && (
        <View style={styles.signInBar}>
          <Text style={styles.signInText} numberOfLines={2}>Sign in to save your Bible data permanently</Text>
          <TouchableOpacity style={styles.signInBtn} activeOpacity={0.85}>
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <SectionHeader title={ui.awarded} count={earnedList.length} accent />
        {earnedList.length === 0 ? (
          <Text style={styles.emptyHint}>Keep going — your first badge is on the way.</Text>
        ) : (
          <View style={styles.grid}>
            {earnedList.map(a => (
              <BadgeTile
                key={a.id}
                badge={a}
                count={earned[a.id]?.count || 1}
                locked={false}
                lang={translation.code}
                onPress={() => setDetail(a)}
              />
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />

        <SectionHeader title={ui.toCollect} count={lockedList.length} />
        <View style={styles.grid}>
          {lockedList.map(a => (
            <BadgeTile
              key={a.id}
              badge={a}
              count={1}
              locked
              lang={translation.code}
              onPress={() => setDetail(a)}
            />
          ))}
        </View>
      </ScrollView>

      {detail && (
        <DetailSheet
          badge={detail}
          earnedAt={earned[detail.id]?.firstAwardedAt ?? null}
          count={earned[detail.id]?.count || 0}
          onClose={() => setDetail(null)}
          lang={translation.code}
        />
      )}
    </View>
  );
}

function SectionHeader({ title, count, accent }: { title: string; count: number; accent?: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHr} />
      <Text style={styles.sectionTitle}>
        {title}
        <Text style={[styles.sectionCount, accent && { color: '#7B9F4A' }]}>  ·  {count}</Text>
      </Text>
      <View style={styles.sectionHr} />
    </View>
  );
}

function BadgeTile({ badge, count, locked, lang, onPress }: {
  badge: Achievement;
  count: number;
  locked: boolean;
  lang: ReturnType<typeof useTranslation>['current']['code'];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.tile}>
      <BadgeIcon
        iconKey={badge.iconKey}
        rarity={badge.rarity}
        size={88}
        locked={locked}
        count={count}
        label={labelFor(badge)}
      />
      <Text style={[styles.tileName, locked && styles.tileNameLocked]} numberOfLines={2}>
        {localizedAchievementName(badge, lang)}
      </Text>
    </TouchableOpacity>
  );
}

function DetailSheet({ badge, earnedAt, count, onClose, lang }: {
  badge: Achievement;
  earnedAt: number | null;
  count: number;
  onClose: () => void;
  lang: ReturnType<typeof useTranslation>['current']['code'];
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.sheetBackdrop}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(360)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}
      >
        <View style={styles.sheetHandle} />
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <BadgeIcon
            iconKey={badge.iconKey}
            rarity={badge.rarity}
            size={108}
            locked={!earnedAt}
            count={count}
            label={labelFor(badge)}
          />
        </View>
        <Text style={styles.sheetName}>{localizedAchievementName(badge, lang)}</Text>
        <Text style={styles.sheetRule}>{localizedAchievementRule(badge, lang)}</Text>
        {earnedAt ? (
          <Text style={styles.sheetEarned}>
            Earned {new Date(earnedAt).toLocaleDateString()}{count > 1 ? `  ·  ×${count}` : ''}
          </Text>
        ) : (
          <Text style={styles.sheetEarnedLocked}>Locked</Text>
        )}
        <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.sheetClose}>
          <Text style={styles.sheetCloseText}>Close</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingVertical: 12,
    backgroundColor: '#F5C2D5',
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: TXT, letterSpacing: 0.5 },
  signInBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBEEEE',
    paddingHorizontal: P,
    paddingVertical: 12,
    gap: 12,
  },
  signInText: { flex: 1, fontSize: 13, color: ROSE },
  signInBtn: { backgroundColor: ROSE, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22 },
  signInBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scroll: { paddingHorizontal: P, paddingTop: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
    marginTop: 4,
  },
  sectionHr: {
    width: 18,
    height: 1,
    backgroundColor: 'rgba(196,140,90,0.5)',
  },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: TXT, letterSpacing: 0.4 },
  sectionCount: { color: TXTSUB, fontSize: 16, fontWeight: '700' },
  emptyHint: {
    textAlign: 'center',
    color: TXTSUB,
    fontSize: 14,
    paddingVertical: 24,
    paddingHorizontal: 30,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 22,
  },
  tile: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  tileName: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: TXT,
    textAlign: 'center',
    lineHeight: 18,
  },
  tileNameLocked: { color: TXTSUB, fontWeight: '500' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,16,28,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: '#FBF7F6',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 44, height: 5, borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.18)',
    alignSelf: 'center', marginBottom: 6,
  },
  sheetName: {
    marginTop: 16, textAlign: 'center',
    fontSize: 22, fontWeight: '700', color: TXT,
  },
  sheetRule: {
    marginTop: 8, textAlign: 'center',
    fontSize: 15, color: TXTSUB, lineHeight: 22, paddingHorizontal: 6,
  },
  sheetEarned: { marginTop: 14, textAlign: 'center', fontSize: 13, color: ROSE, fontWeight: '600' },
  sheetEarnedLocked: { marginTop: 14, textAlign: 'center', fontSize: 13, color: TXTSUB, fontStyle: 'italic' },
  sheetClose: {
    marginTop: 22,
    backgroundColor: ROSE,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sheetCloseText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
