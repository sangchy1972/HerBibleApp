import React, { useState } from 'react';
import {
  View, Text, StyleSheet, StatusBar,
} from 'react-native';
import { useFonts } from 'expo-font';
import { RobotoSerif_400Regular, RobotoSerif_600SemiBold } from '@expo-google-fonts/roboto-serif';
import { NotoSansSC_400Regular, NotoSansSC_500Medium, NotoSansSC_700Bold } from '@expo-google-fonts/noto-sans-sc';
import PrayerScreen from './src/screens/PrayerScreen';
import BibleScreen from './src/screens/BibleScreen';
import PlanScreen from './src/screens/PlanScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PrayerFlow from './src/screens/PrayerFlow';
import StreakScreen from './src/screens/StreakScreen';
import TabBar from './src/components/shared/TabBar';

type TabId = 'prayer' | 'bible' | 'plan' | 'profile';

export default function App() {
  const [fontsLoaded] = useFonts({
    RobotoSerif_400Regular,
    RobotoSerif_600SemiBold,
    NotoSansSC_400Regular,
    NotoSansSC_500Medium,
    NotoSansSC_700Bold,
  });

  const hr = new Date().getHours();
  const [tab, setTab] = useState<TabId>('prayer');
  const [morning, setMorning] = useState(hr >= 5 && hr < 17);
  const [mDone, setMDone] = useState(false);
  const [eDone, setEDone] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [flow, setFlow] = useState<{ kind: 'morning' | 'evening' } | null>(null);

  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const completeFlow = () => {
    if (flow?.kind === 'morning') setMDone(true);
    else setEDone(true);
    setFlow(null);
  };

  if (!fontsLoaded) return null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FBF7F6" />

      {/* Phone frame */}
      <View style={styles.phone}>
        {/* Notch */}
        <View style={styles.notch} />

        {/* Status bar */}
        <View style={styles.statusBar}>
          <Text style={styles.statusTime}>{time}</Text>
          <View style={styles.statusIcons}>
            <Text style={styles.statusIcon}>●●●</Text>
            <Text style={styles.statusIcon}>WiFi</Text>
            <Text style={styles.statusIcon}>🔋</Text>
          </View>
        </View>

        {/* Content area */}
        <View style={styles.content}>
          {tab === 'prayer' && (
            <PrayerScreen
              mDone={mDone}
              eDone={eDone}
              morning={morning}
              setMorning={setMorning}
              onOpenStreak={() => setStreakOpen(true)}
              onOpenBible={() => setTab('bible')}
              openFlow={(kind) => setFlow({ kind })}
            />
          )}
          {tab === 'bible' && <BibleScreen />}
          {tab === 'plan' && <PlanScreen />}
          {tab === 'profile' && <ProfileScreen />}
        </View>

        {/* Tab bar */}
        <TabBar active={tab} onChange={setTab} />

        {/* Overlays */}
        {streakOpen && (
          <StreakScreen
            onBack={() => setStreakOpen(false)}
            mDone={mDone}
            eDone={eDone}
          />
        )}

        {flow && (
          <PrayerFlow
            morning={flow.kind === 'morning'}
            visible={!!flow}
            onComplete={completeFlow}
            onClose={() => setFlow(null)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDE8F4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  phone: {
    width: 390,
    height: 844,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: '#FBF7F6',
    position: 'relative',
    shadowColor: 'rgba(150,100,180,0.22)',
    shadowOffset: { width: 0, height: 40 },
    shadowOpacity: 1,
    shadowRadius: 90,
    elevation: 30,
  },
  notch: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -75,
    width: 150,
    height: 28,
    backgroundColor: '#0a0a10',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    zIndex: 80,
  },
  statusBar: {
    position: 'relative',
    zIndex: 70,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 10,
    height: 50,
  },
  statusTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B2E',
    letterSpacing: 0.2,
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    opacity: 0.7,
  },
  statusIcon: {
    fontSize: 10,
    color: '#1E1B2E',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    marginBottom: 0,
  },
});
