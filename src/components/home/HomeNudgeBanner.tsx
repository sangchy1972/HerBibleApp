import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, FONTS } from '../../constants/theme';

// One home-screen nudge banner (presentational). PrayerScreen maps the picked
// banner kind → icon/title/cta/action and renders this.
export default function HomeNudgeBanner({
  icon, title, ctaLabel, onPress, onDismiss,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  ctaLabel?: string;
  onPress: () => void;
  onDismiss: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.banner}>
      <TouchableOpacity style={styles.main} activeOpacity={0.85} onPress={onPress}>
        <View style={styles.iconWrap}>
          <Feather name={icon} size={18} color={ROSE} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {ctaLabel ? <Text style={styles.cta}>{ctaLabel} ›</Text> : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} hitSlop={10} style={styles.x}>
        <Feather name="x" size={16} color={TXTSUB} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginHorizontal: 8, marginTop: 6, marginBottom: 4,
    paddingLeft: 12, paddingRight: 6, paddingVertical: 10,
    borderWidth: 1, borderColor: `${ROSE}26`,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: `${ROSE}14`, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14.5, fontWeight: '600', color: TXT, fontFamily: FONTS.lato, lineHeight: 19 },
  cta: { fontSize: 13, fontWeight: '700', color: ROSE, marginTop: 2, fontFamily: FONTS.latoBold },
  x: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
