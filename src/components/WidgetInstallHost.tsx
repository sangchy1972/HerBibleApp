import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { usePrayer } from '../state/PrayerContext';
import { useAchievements } from '../state/AchievementsContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { useT } from '../i18n/useT';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

// One-time proactive nudge to add the home-screen widget — for engaged users
// (prayed at least once) around day 3+. Coordinator-managed (priority 60) so it
// never stacks; shown once ever, then never again.
const SHOWN_KEY = 'nudge:widgetInstall:shown:v1';

export default function WidgetInstallHost() {
  const t = useT();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const { everMorning } = usePrayer();
  const { daysSinceFirstLaunch } = useAchievements();
  const coord = useNudgeCoordinator();
  const [shown, setShown] = useState<boolean | null>(null);   // null = loading

  useEffect(() => { AsyncStorage.getItem(SHOWN_KEY).then(v => setShown(!!v)).catch(() => setShown(false)); }, []);

  // Android ONLY. iOS has no API to programmatically add a home-screen widget,
  // and the app ships no iOS WidgetKit widget — so nudging iOS users to "add the
  // widget" leads nowhere. Gated off on iOS until a real iOS widget exists.
  // Timing (per user): only AFTER she has completed at least one MORNING prayer.
  // `everPrayed` also counted an evening-only user, so the dialog could land on a
  // quiet evening home screen with her morning steps still untouched — it read as
  // an interruption rather than a reward. A finished morning prayer is the moment
  // the widget's promise ("today's verse and your next prayer on your home
  // screen") is actually something she has experienced. The day-3 floor stays, and
  // the nudge coordinator still serialises this against every other prompt.
  const eligible = Platform.OS === 'android' && shown === false && daysSinceFirstLaunch >= 3 && everMorning;

  // `eligible` contains `shown === false`, and the effect below sets `shown`
  // true the moment the slot is granted — so without the `if (active) return`
  // guard this effect immediately releases the slot it was just given and the
  // card unmounts inside its own fade-in. It has been doing exactly that: a
  // one-time nudge that marks itself shown, spends the budget, and is never
  // seen. `canShow` reads a ref for the same reason. Copied from
  // RatePromptHost, which had this right from the start.
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('widgetInstall');

  useEffect(() => {
    if (active) return;
    if (eligible) {
      coord.requestSlot({ id: 'widgetInstall', priority: NUDGE_PRIORITY.widgetInstall, canShow: () => eligibleRef.current });
    } else {
      coord.releaseSlot('widgetInstall');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, active]);
  // `coord.releaseSlot`, NOT `coord`. The context value is memoized on
  // `activeId` (NudgeCoordinatorContext), so `coord`'s identity changes on the
  // very transition that GRANTS this host its slot — and an effect keyed on
  // `[coord]` then runs its cleanup one frame later and releases it. That is the
  // self-cancel this whole file was rewritten to remove, reintroduced by the
  // cleanup that was supposed to be the safe part. releaseSlot is a stable
  // useCallback, so capturing the function pins the dependency.
  const release = coord.releaseSlot;
  useEffect(() => () => release('widgetInstall'), [release]);
  const markedRef = useRef(false);
  useEffect(() => {
    if (active && !markedRef.current) {
      markedRef.current = true;
      setShown(true);   // one-time: mark shown the moment it appears
      AsyncStorage.setItem(SHOWN_KEY, '1').catch(() => {});
    }
    if (!active) markedRef.current = false;
  }, [active]);

  if (!active) return null;

  const dismiss = () => { coord.notifyDismissed('widgetInstall'); coord.releaseSlot('widgetInstall'); };
  const onAdd = () => { dismiss(); setTimeout(() => { try { nav.navigate('AddWidget'); } catch { /* route may not be mounted */ } }, 60); };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
      <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
        <View style={styles.icon}><Feather name="grid" size={26} color={ROSE} /></View>
        <Text style={styles.title}>{t('nudge.widget.title')}</Text>
        <Text style={styles.body}>{t('nudge.widget.body')}</Text>
        <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={onAdd}>
          <Text style={styles.ctaText}>{t('nudge.widget.cta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={dismiss} hitSlop={8}>
          <Text style={styles.laterText}>{t('nudge.widget.later')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, backgroundColor: 'rgba(20,12,24,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 22, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },   // 22 → 28.6 (+30 % card radius per user)
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: `${ROSE}16`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, textAlign: 'center', fontFamily: FONTS.lato, letterSpacing: 0.4, marginBottom: 20 },
  cta: { alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '700', letterSpacing: 0.3 },
  later: { marginTop: 10, paddingVertical: 8 },
  laterText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },
});
