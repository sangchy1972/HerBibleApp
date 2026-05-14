import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { PlanCover as PlanCoverData } from '../services/plansService';

interface Props {
  cover: PlanCoverData;
  width?: number | string;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

// Plan cover — pure gradient + icon placeholder. The previous AI-generated
// photographic covers are retired; everything renders from the plan's
// two-stop palette (cover.color_primary → cover.color_secondary).
export default function PlanCover({ cover, width, height, radius = 10, style }: Props) {
  const iconSize = Math.max(20, Math.min(typeof width === 'number' ? width : height, height) * 0.35);
  return (
    <View style={[{ width: width as any, height, borderRadius: radius, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[cover?.color_primary || '#E6D9C2', cover?.color_secondary || '#5A4A3A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Feather name="book-open" size={iconSize} color="rgba(255,255,255,0.85)" />
      </View>
    </View>
  );
}
