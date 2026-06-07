import React from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ROSE, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';

export type WidgetSize = '2x2' | '4x2' | '5x2';

const ASPECTS: Record<WidgetSize, number> = {
  '2x2': 1.0,
  '4x2': 2.0,
  '5x2': 2.5,
};

const MORNING_BG = require('../../assets/widget/bg-morning.webp');
const EVENING_BG = require('../../assets/widget/bg-evening.webp');

interface Props {
  size: WidgetSize;
  width?: number;
  /** Real verse text + reference; defaults to localized mock content. */
  body?: string;
  reference?: string;
  segment?: 'morning' | 'evening';
  /** The live card background (imageFor result: {uri} or require number). */
  bgSource?: any;
}

// Faithful preview of the home-screen widget: today's verse on the SAME
// background the Prayer hero card uses, with the brand eyebrow, reference, and
// the faux "Amen" pill. Type scale mirrors the live widget (text +15%, pill
// +20% over the first cut).
export default function WidgetPreview({ size, width, body, reference, segment = 'morning', bgSource }: Props) {
  const t = useT();
  const resolvedBody = body ?? t('widgetPreview.sampleBody');
  const resolvedReference = reference ?? t('widgetPreview.sampleRef');
  const compact = size === '2x2';
  const src = bgSource ?? (segment === 'evening' ? EVENING_BG : MORNING_BG);
  const bodySize = compact ? 14 : size === '5x2' ? 18 : 16;

  return (
    <View style={[styles.shell, { aspectRatio: ASPECTS[size], width: width ?? '100%' }]}>
      <ImageBackground source={src} resizeMode="cover" style={styles.fill} imageStyle={styles.img}>
        <LinearGradient
          colors={['rgba(15,18,38,0.30)', 'rgba(15,18,38,0.66)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.content, { padding: compact ? 12 : 15 }]}>
          <View>
            <View style={styles.eyebrowRow}>
              <View style={styles.dot} />
              <Text style={styles.eyebrow}>HER BIBLE</Text>
              <View style={styles.spacer} />
              <Feather name={segment === 'evening' ? 'moon' : 'sun'} size={compact ? 15 : 19} color="#FFFFFF" />
            </View>
            <Text style={[styles.body, { fontSize: bodySize }]} numberOfLines={3}>
              {resolvedBody}
            </Text>
          </View>

          <View style={styles.bottomRow}>
            <Text style={[styles.reference, { fontSize: compact ? 12 : 14 }]} numberOfLines={1}>
              {resolvedReference}
            </Text>
            <View style={styles.spacer} />
            <View style={styles.amenPill}>
              <Ionicons name="heart" size={compact ? 13 : 15} color={ROSE} />
              <Text style={styles.amenText}>{t('widget.amen')}</Text>
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
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ROSE, marginRight: 6 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1.4 },
  spacer: { flex: 1 },
  body: { color: '#FFFFFF', fontFamily: FONTS.lora },
  bottomRow: { flexDirection: 'row', alignItems: 'center' },
  reference: { fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },
  amenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    paddingHorizontal: 20,                      // 13 → 20: widen the pill ~15% (width only; height/font unchanged)
    paddingVertical: 7,
    gap: 5,
  },
  amenText: { fontWeight: '700', color: ROSE, fontSize: 14.5 },
});
