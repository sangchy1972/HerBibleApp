import React from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ROSE, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';

export type WidgetSize = '2x2' | '4x2' | '5x2';

// Standard Android widget cell ≈ 70 dp. We render previews at full container
// width and scale internal typography by the widget's aspect ratio.
const ASPECTS: Record<WidgetSize, number> = {
  '2x2': 1.0,
  '4x2': 2.0,
  '5x2': 2.5,
};

const MORNING_BG = require('../../assets/widget/bg-morning.webp');

interface Props {
  size: WidgetSize;
  width?: number;        // optional override; defaults to fill parent
  /** Mock content. Real widget pulls today's verse + reference. */
  body?: string;
  reference?: string;
}

// Faithful preview of the home-screen widget: today's verse on the scenic
// sunrise background, with the brand eyebrow, reference, and the faux "Amen"
// pill — exactly what the OS widget renders. All copy defaults to localized
// mock content via useT() so the preview follows the UI language.
export default function WidgetPreview({ size, width, body, reference }: Props) {
  const t = useT();
  const resolvedBody = body ?? t('widgetPreview.sampleBody');
  const resolvedReference = reference ?? t('widgetPreview.sampleRef');
  const compact = size === '2x2';
  const bodySize = compact ? 12 : size === '5x2' ? 16 : 14;

  return (
    <View style={[styles.shell, { aspectRatio: ASPECTS[size], width: width ?? '100%' }]}>
      <ImageBackground source={MORNING_BG} resizeMode="cover" style={styles.fill} imageStyle={styles.img}>
        <LinearGradient
          colors={['rgba(15,18,38,0.30)', 'rgba(15,18,38,0.66)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.content, { padding: compact ? 11 : 14 }]}>
          <View style={styles.topCol}>
            <View style={styles.eyebrowRow}>
              <View style={styles.dot} />
              <Text style={styles.eyebrow}>HER BIBLE</Text>
              <View style={styles.spacer} />
              <Feather name="sun" size={compact ? 13 : 16} color="#FFFFFF" />
            </View>
            <Text style={[styles.body, { fontSize: bodySize }]} numberOfLines={compact ? 4 : 3}>
              {resolvedBody}
            </Text>
          </View>

          <View style={styles.bottomRow}>
            <Text style={[styles.reference, { fontSize: compact ? 10.5 : 12 }]} numberOfLines={1}>
              {resolvedReference}
            </Text>
            <View style={styles.spacer} />
            <View style={[styles.amenPill, { paddingHorizontal: compact ? 8 : 10 }]}>
              <Ionicons name="heart" size={compact ? 10 : 12} color={ROSE} />
              <Text style={[styles.amenText, { fontSize: compact ? 10.5 : 12 }]}>{t('widget.amen')}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#2D3A5A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  fill: { flex: 1 },
  img: { borderRadius: 18 },
  content: { flex: 1, justifyContent: 'space-between' },
  topCol: {},
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ROSE, marginRight: 6 },
  eyebrow: { fontSize: 10.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1.3 },
  spacer: { flex: 1 },
  body: { color: '#FFFFFF', fontFamily: FONTS.lora, lineHeight: undefined },
  bottomRow: { flexDirection: 'row', alignItems: 'center' },
  reference: { fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },
  amenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 16,
    paddingVertical: 5,
    gap: 4,
  },
  amenText: { fontWeight: '700', color: ROSE },
});
