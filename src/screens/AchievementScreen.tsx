import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import BadgeIcon from '../components/BadgeIcon';
import SignInSheet from '../components/SignInSheet';
import { ACHIEVEMENTS, achievementUi, localizedAchievementName, localizedAchievementRule, type Achievement } from '../constants/achievements';
import { useAchievements } from '../state/AchievementsContext';
import { useBadges } from '../state/BadgesContext';
import { useTranslation } from '../state/TranslationsContext';
import { useAuth } from '../state/AuthContext';
import { useT } from '../i18n/useT';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
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
  const t = useT();
  const { earned } = useAchievements();
  const { prefetchAll } = useBadges();
  const { current: translation } = useTranslation();

  // First visit to this screen → pull all badge art from the CDN into the
  // local cache (the binary ships without it). No-op once cached / per launch.
  useEffect(() => { prefetchAll(); }, [prefetchAll]);
  const { user } = useAuth();
  const ui = achievementUi(translation.code);
  const [detail, setDetail] = useState<Achievement | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);

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
          <Text style={styles.signInText} numberOfLines={2}>{t('achievement.signInBar')}</Text>
          <TouchableOpacity style={styles.signInBtn} activeOpacity={0.85} onPress={() => setShowSignIn(true)}>
            <Text style={styles.signInBtnText}>{t('achievement.signInBtn')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <SectionHeader title={ui.awarded} count={earnedList.length} accent />
        {earnedList.length === 0 ? (
          <Text style={styles.emptyHint}>{t('achievement.emptyHint')}</Text>
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

      {showSignIn && <SignInSheet onClose={() => setShowSignIn(false)} />}
    </View>
  );
}

function SectionHeader({ title, count, accent }: { title: string; count: number; accent?: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {title}
        <Text style={[styles.sectionCount, accent && { color: '#7B9F4A' }]}>  ·  {count}</Text>
      </Text>
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
        id={badge.id}
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
  const t = useT();
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
            id={badge.id}
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
            {count > 1
              ? t('achievement.earnedOnCount', { date: new Date(earnedAt).toLocaleDateString(), count })
              : t('achievement.earnedOn', { date: new Date(earnedAt).toLocaleDateString() })}
          </Text>
        ) : (
          <Text style={styles.sheetEarnedLocked}>{t('achievement.locked')}</Text>
        )}
        <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.sheetClose}>
          <Text style={styles.sheetCloseText}>{t('achievement.close')}</Text>
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
  // Mirrors PlanScreen.heading ("My Plans") 1:1 per user — Lora bold @ 25.31.
  headerTitle: { fontSize: 25.31, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
  signInBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBEEEE',
    paddingHorizontal: P,
    paddingVertical: 12,
    gap: 12,
  },
  signInText: { flex: 1, fontSize: 13, color: ROSE, fontFamily: FONTS.lato },
  signInBtn: { backgroundColor: ROSE, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22 },
  signInBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: FONTS.latoBold },
  scroll: { paddingHorizontal: P, paddingTop: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 4,
    // Decorative side hairlines removed per user — title sits flush left now.
  },
  // Mirrors ProfileScreen.sectionTitle (Faith Achievement / My Notes) 1:1.
  sectionTitle: { fontSize: 19.85, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
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
    fontWeight: '400',                          // Lato regular per user
    color: TXT,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: FONTS.lato,
  },
  tileNameLocked: { color: TXTSUB },             // weight stays regular; locked state only shifts color
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
    width: 54, height: 4.5, borderRadius: 4,                                    // width +10 / height -10 % / marginTop -7 per user
    backgroundColor: 'rgba(30,27,46,0.18)',
    alignSelf: 'center', marginTop: -7, marginBottom: 6,
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
