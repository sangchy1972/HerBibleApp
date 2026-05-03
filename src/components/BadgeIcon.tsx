import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Polygon, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import type { BadgeRarity } from '../constants/achievements';

// Hexagon-framed badge. The shape, color scheme, and rays match the gallery
// reference images: bright rarity-tinted frame around an inset darker
// background with a centered icon glyph. Locked state desaturates everything
// to grayscale so the user can see what's still ahead without being misled
// into thinking the badge is owned.

const RARITY: Record<BadgeRarity, {
  outer: string; inner: string; bg: string; ring: string; glyph: string;
}> = {
  common:    { outer: '#C4A882', inner: '#A08060', bg: '#1F1A24', ring: '#8B6040', glyph: '#F0D8A0' },
  rare:      { outer: '#8AB8D8', inner: '#5090C0', bg: '#0E1E30', ring: '#4878A8', glyph: '#C0E0FF' },
  epic:      { outer: '#C090E0', inner: '#9050C8', bg: '#1A0E28', ring: '#8040B0', glyph: '#E0C0FF' },
  legendary: { outer: '#F0C84A', inner: '#D4922A', bg: '#1E0E04', ring: '#C8801A', glyph: '#FFE890' },
};

interface Props {
  iconKey: string;          // a Feather icon name; falls back to 'star' if unknown
  rarity: BadgeRarity;
  size?: number;            // outer width in px (default 88)
  locked?: boolean;         // gray-out for unearned badges
  count?: number;           // ×N badge for repeat earns (omit or 1 to hide)
  label?: string | null;    // small numeric label inside (e.g. "7", "30%") — omit to hide
}

export default function BadgeIcon({
  iconKey, rarity, size = 88, locked = false, count = 1, label = null,
}: Props) {
  const palette = RARITY[rarity];
  const w = size;
  const h = size * 1.12;            // flat-top hex aspect
  const gradId = `bg_${rarity}_${size}_${locked ? 'l' : 'u'}`;
  const outer = locked ? '#C8C2BE' : palette.outer;
  const inner = locked ? '#9C9690' : palette.inner;
  const bg    = locked ? '#7A736E' : palette.bg;
  const glyph = locked ? '#E8E2DD' : palette.glyph;
  const iconName = (iconKey as keyof typeof Feather.glyphMap) in Feather.glyphMap
    ? (iconKey as keyof typeof Feather.glyphMap) : 'star';
  const iconSize = Math.round(size * 0.38);

  return (
    <View style={[styles.wrap, { width: w, height: h }]}>
      <Svg width={w} height={h} viewBox="0 0 100 112">
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={outer} stopOpacity="1" />
            <Stop offset="1" stopColor={inner} stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        {/* Outer hex frame */}
        <Polygon points="50,4 96,28 96,84 50,108 4,84 4,28" fill={`url(#${gradId})`} />
        {/* Inset darker background */}
        <Polygon points="50,11 89,32 89,80 50,101 11,80 11,32" fill={bg} />
      </Svg>
      <View style={styles.iconCenter}>
        <Feather name={iconName} size={iconSize} color={glyph} />
        {label ? (
          <Text style={[styles.label, { color: glyph, fontSize: Math.max(9, size * 0.13) }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
      {count > 1 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>×{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  iconCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  countBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
    backgroundColor: 'rgba(196,140,90,0.95)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});
