import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import WidgetPreview from '../components/WidgetPreview';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import type { RootStackScreenProps } from '../navigation/types';

export default function AddWidgetScreen({ navigation }: RootStackScreenProps<'AddWidget'>) {
  const insets = useSafeAreaInsets();

  const onInstall = () => {
    // The real path here is the Android AppWidgetManager.requestPinAppWidget()
    // API, which can pin the widget directly on Android 8+. That requires:
    //   1. A native AppWidgetProvider class registered in AndroidManifest
    //   2. layout XML files for each widget size
    //   3. A small native module bridging requestPinAppWidget() to JS
    // Until those land, we surface the universal fallback: long-press the
    // home screen and add from the widget picker.
    Alert.alert(
      'Add the widget',
      Platform.OS === 'android'
        ? 'Touch and hold an empty area on your home screen, tap Widgets, then drag Her Bible to where you\'d like it.'
        : 'Touch and hold an empty area on your home screen, tap the + at the top, search for Her Bible, and pick a size.',
    );
  };

  const onLater = () => navigation.goBack();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn} hitSlop={10}>
          <Feather name="x" size={20} color={TXT} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 140 }]}
      >
        <Text style={styles.title}>Add a free widget to your{'\n'}Home Screen</Text>
        <Text style={styles.body}>
          A daily verse + your next prayer, one tap away. Pick a size below — you can always change it later.
        </Text>

        {/* All three previews share the same cell size, so 2×2 / 4×2 / 5×2
            render at proportional widths — exactly how they'd lay out next to
            each other on a real home screen. Cell size scales with screen
            width so 5×2 always fits even on iPhone SE. */}
        {(() => {
          const screenW = Dimensions.get('window').width;
          const cellSize = Math.min(70, Math.floor((screenW - 56) / 5));
          return (
            <>
              <View style={styles.previewBlock}>
                <SizeLabel text="Small · 2 × 2" />
                <View style={styles.previewCenter}>
                  <WidgetPreview size="2x2" width={cellSize * 2} />
                </View>
              </View>

              <View style={styles.previewBlock}>
                <SizeLabel text="Medium · 4 × 2" />
                <View style={styles.previewCenter}>
                  <WidgetPreview size="4x2" width={cellSize * 4} />
                </View>
              </View>

              <View style={styles.previewBlock}>
                <SizeLabel text="Wide · 5 × 2" />
                <View style={styles.previewCenter}>
                  <WidgetPreview size="5x2" width={cellSize * 5} />
                </View>
              </View>
            </>
          );
        })()}

        <View style={styles.howCard}>
          <Text style={styles.howTitle}>How to add</Text>
          <Step n={1} text="Touch and hold an empty spot on your Home Screen." />
          <Step n={2} text="Tap Widgets (or +) and search for Her Bible." />
          <Step n={3} text="Drag the size you want and let go." />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={onInstall} activeOpacity={0.85} style={styles.installBtn}>
          <Text style={styles.installText}>Install widget</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLater} hitSlop={10} style={styles.laterBtn}>
          <Text style={styles.laterText}>Remind me later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SizeLabel({ text }: { text: string }) {
  return <Text style={styles.sizeLabel}>{text}</Text>;
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: P,
    paddingBottom: 4,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  scroll: { paddingHorizontal: P + 4, paddingTop: 12 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: TXT,
    lineHeight: 34,
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    color: TXTSUB,
    marginBottom: 22,
  },
  previewBlock: { marginBottom: 22 },
  previewCenter: { alignItems: 'center' },
  sizeLabel: { fontSize: 13, fontWeight: '700', color: TXTSUB, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },
  howCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.06)',
    marginTop: 4,
  },
  howTitle: { fontSize: 17, fontWeight: '700', color: TXT, marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21, color: TXT },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: P + 4, paddingTop: 12,
    backgroundColor: '#FBF7F6',
    borderTopWidth: 1, borderTopColor: 'rgba(30,27,46,0.06)',
  },
  installBtn: {
    backgroundColor: ROSE,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  installText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  laterBtn: { paddingVertical: 12, alignItems: 'center' },
  laterText: { color: ROSE, fontSize: 16, fontWeight: '600' },
});
