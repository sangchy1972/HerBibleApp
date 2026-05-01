import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as StoreReview from 'expo-store-review';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { TXT, ROSE } from '../constants/theme';
import { useRatePrompt } from '../state/RatePromptContext';

interface Props {
  onClose: () => void;
}

export default function RatePromptSheet({ onClose }: Props) {
  const { markYes, markNo, markRated } = useRatePrompt();

  const onYes = async () => {
    markYes();
    try {
      // Tries Play in-app review on Android, SKStoreReview on iOS. Returns
      // immediately on devices that don't support it (e.g. simulators, web).
      const ok = await StoreReview.hasAction();
      if (ok) {
        await StoreReview.requestReview();
        // Best-effort: Play / Apple don't tell us whether the user actually
        // submitted a rating. We assume completion and stop prompting forever.
        markRated();
      }
    } catch {
      // swallow — never block the user from continuing
    }
    onClose();
  };

  const onNo = () => {
    markNo();
    onClose();
  };

  return (
    <View style={styles.overlay}>
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic))}
        style={styles.card}
      >
        <Text style={styles.title}>Hello, are you enjoying Her Bible?</Text>
        <Text style={styles.body}>
          Your honest feedback helps us improve the experience for women everywhere.
        </Text>
        <View style={styles.divider} />
        <View style={styles.row}>
          <TouchableOpacity onPress={onNo} style={styles.btn} activeOpacity={0.7}>
            <Text style={styles.btnNo}>No</Text>
          </TouchableOpacity>
          <View style={styles.vDivider} />
          <TouchableOpacity onPress={onYes} style={styles.btn} activeOpacity={0.7}>
            <Text style={styles.btnYes}>Yes I like</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 250 },
  card: {
    width: '85%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingTop: 30,
    paddingHorizontal: 24,
    paddingBottom: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: TXT,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 14,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(30,27,46,0.65)',
    textAlign: 'center',
    marginBottom: 24,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(30,27,46,0.10)',
    marginHorizontal: -24,
  },
  row: { flexDirection: 'row' },
  btn: { flex: 1, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  vDivider: { width: 1, backgroundColor: 'rgba(30,27,46,0.10)' },
  btnNo: { fontSize: 17, fontWeight: '700', color: TXT },
  btnYes: { fontSize: 17, fontWeight: '700', color: ROSE },
});
