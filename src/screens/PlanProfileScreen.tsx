import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import {
  usePlanProfile,
  LIFE_STAGE_OPTIONS,
  SPIRITUAL_STAGE_OPTIONS,
  EMOTIONAL_STATE_OPTIONS,
} from '../state/PlanProfileContext';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Three-question profile capture. Shown the first time the user opens the Plan
// tab, but reachable any time from Profile → "Personalize your plans".
//
// All answers are optional. The "Skip" button on each step stores skipped=true
// so we don't keep nagging.
export default function PlanProfileScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { saveProfile, skip } = usePlanProfile();

  const [step, setStep] = useState(0);
  const [lifeStage, setLifeStage] = useState<string | null>(null);
  const [spiritualStage, setSpiritualStage] = useState<string | null>(null);
  const [emotional, setEmotional] = useState<string[]>([]);

  const finish = async () => {
    await saveProfile({
      life_stage: lifeStage,
      spiritual_stage: spiritualStage,
      emotional_state: emotional,
    });
    nav.goBack();
  };

  const doSkip = async () => {
    await skip();
    nav.goBack();
  };

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => Math.max(0, s - 1));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.nav}>
        {step > 0 ? (
          <TouchableOpacity onPress={back} hitSlop={8} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color={TXT} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <Text style={styles.progress}>{step + 1} / 3</Text>
        <TouchableOpacity onPress={doSkip} hitSlop={8} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <>
            <Text style={styles.heading}>What season of life are you in?</Text>
            <Text style={styles.sub}>This helps us suggest plans that meet you where you are.</Text>
            {LIFE_STAGE_OPTIONS.map(o => (
              <OptionRow
                key={o.id}
                label={o.label}
                selected={lifeStage === o.id}
                onPress={() => setLifeStage(prev => prev === o.id ? null : o.id)}
              />
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.heading}>How would you describe your walk with God?</Text>
            <Text style={styles.sub}>There's a plan for every step of the journey.</Text>
            {SPIRITUAL_STAGE_OPTIONS.map(o => (
              <OptionRow
                key={o.id}
                label={o.label}
                selected={spiritualStage === o.id}
                onPress={() => setSpiritualStage(prev => prev === o.id ? null : o.id)}
              />
            ))}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.heading}>How are you feeling right now?</Text>
            <Text style={styles.sub}>Pick any that apply — you can change this anytime.</Text>
            {EMOTIONAL_STATE_OPTIONS.map(o => {
              const sel = emotional.includes(o.id);
              return (
                <OptionRow
                  key={o.id}
                  label={o.label}
                  selected={sel}
                  onPress={() => setEmotional(prev =>
                    prev.includes(o.id) ? prev.filter(x => x !== o.id) : [...prev, o.id]
                  )}
                />
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step < 2 ? (
          <TouchableOpacity onPress={next} style={styles.primaryBtn} activeOpacity={0.85}>
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={finish} style={styles.primaryBtn} activeOpacity={0.85}>
            <Text style={styles.primaryText}>Finish</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
      {selected && <Feather name="check" size={18} color="#fff" />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: P, marginBottom: 18 },
  backBtn: {
    width: 39, height: 39, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  progress: { fontSize: 14, fontWeight: '600', color: TXTSUB, letterSpacing: 0.5 },
  skipBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  skipText: { fontSize: 14, fontWeight: '600', color: TXTSUB },
  scroll: { paddingHorizontal: P, paddingBottom: 24 },
  heading: { fontSize: 25, fontWeight: '500', color: TXT, lineHeight: 32, marginBottom: 8 },
  sub: { fontSize: 15, color: TXTSUB, lineHeight: 22, marginBottom: 24 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    marginBottom: 10,
  },
  optionSelected: { backgroundColor: ROSE, borderColor: ROSE },
  optionText: { fontSize: 16, fontWeight: '600', color: TXT },
  optionTextSelected: { color: '#fff' },
  footer: { paddingHorizontal: P, paddingTop: 12 },
  primaryBtn: {
    height: 55, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ROSE,
  },
  primaryText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
});
