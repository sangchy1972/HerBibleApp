import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { ROSE, LAV, TXT, TXTSUB } from '../constants/theme';

export type WidgetSize = '2x2' | '4x2' | '5x2';

// Standard Android widget cell ≈ 70 dp. We render previews at full container
// width and scale internal padding/typography by the widget's aspect ratio.
const ASPECTS: Record<WidgetSize, number> = {
  '2x2': 1.0,
  '4x2': 2.0,
  '5x2': 2.5,
};

interface Props {
  size: WidgetSize;
  width?: number;        // optional override; defaults to fill parent
  /** Mock content. Real widget will pull today's verse + active prayer slot. */
  title?: string;
  body?: string;
  reference?: string;
}

// Home-screen widgets on Android/iOS launch the app on tap — they don't host
// in-widget actions. So no "Pray now" button here; that would imply a
// behavior the OS-level widget can't actually deliver. The preview shows the
// content the widget will surface (segment label, verse, reference) and a
// small brand mark so users recognize it on their home screen.
export default function WidgetPreview({
  size,
  width,
  title = 'Morning Prayer',
  body = 'Just pray and everything will be okay.',
  reference = 'Psalm 23:1',
}: Props) {
  const isSquare = size === '2x2';
  const showImage = size !== '2x2';
  // 4×2 → square thumb (1:1); 5×2 → wider 4:3 thumb. Image height fills the
  // content row, width derives from the aspect ratio so it never stretches.
  const imageAspect = size === '4x2' ? 1 : 4 / 3;

  return (
    <View style={[styles.shell, { aspectRatio: ASPECTS[size], width: width ?? '100%' }]}>
      <LinearGradient
        colors={['#FFFFFF', `${ROSE}14`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.canvas}
      >
        <View style={styles.contentRow}>
          <View style={styles.textCol}>
            <Text style={[styles.title, isSquare && styles.titleSm]} numberOfLines={1}>{title}</Text>
            <Text
              style={[styles.body, isSquare && styles.bodySm]}
              numberOfLines={isSquare ? 3 : 4}
            >
              {body}
            </Text>
          </View>

          {showImage && (
            <View style={[styles.image, { aspectRatio: imageAspect }]}>
              <LinearGradient
                colors={[`${ROSE}55`, `${LAV}55`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Feather name="image" size={22} color="rgba(255,255,255,0.85)" />
            </View>
          )}
        </View>

        {/* Reference line + brand mark — passive surface, not a button. */}
        <View style={styles.footer}>
          <Text style={[styles.reference, isSquare && styles.referenceSm]} numberOfLines={1}>
            {reference}
          </Text>
          <View style={styles.brandDot} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  canvas: { flex: 1, padding: 12 },
  contentRow: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  textCol: { flex: 1, justifyContent: 'flex-start' },
  title: { fontSize: 16, fontWeight: '700', color: TXT, marginBottom: 4 },
  titleSm: { fontSize: 14, marginBottom: 3 },
  body: { fontSize: 13, lineHeight: 18, color: TXTSUB },
  bodySm: { fontSize: 11, lineHeight: 15 },
  image: {
    marginLeft: 12,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reference: { fontSize: 12, fontWeight: '600', color: ROSE, letterSpacing: 0.3 },
  referenceSm: { fontSize: 10 },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ROSE,
    opacity: 0.7,
  },
});
