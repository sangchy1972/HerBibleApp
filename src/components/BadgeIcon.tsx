import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { BadgeRarity } from '../constants/achievements';
import { BADGE_IMAGES } from '../constants/badgeImages';

// Per-rarity color tint for the placeholder circle. Once a PNG override is
// registered for a badge, the PNG fully replaces the placeholder — including
// any frame, glyph, or color — and these tints stop being visible for it.
const RARITY: Record<BadgeRarity, { tint: string; glyph: string }> = {
  common:    { tint: '#C4A882', glyph: '#8B6040' },
  rare:      { tint: '#5090C0', glyph: '#2E5E88' },
  epic:      { tint: '#9050C8', glyph: '#5E2A88' },
  legendary: { tint: '#D4922A', glyph: '#8C5808' },
};

interface Props {
  /** Achievement id. Used to look up a PNG override in BADGE_IMAGES. */
  id?: string;
  /** Feather glyph rendered inside the placeholder when no PNG exists. */
  iconKey: string;
  rarity: BadgeRarity;
  /** Outer width/height in px. Default 88. */
  size?: number;
  /** Desaturate / fade for unearned badges. */
  locked?: boolean;
  /** ×N pill for repeat earns. Hidden when 1 or undefined. */
  count?: number;
  /** Small numeric label inside the placeholder (e.g. "7", "30%"). PNG path ignores this. */
  label?: string | null;
}

export default function BadgeIcon({
  id, iconKey, rarity, size = 88, locked = false, count = 1, label = null,
}: Props) {
  const png = id ? BADGE_IMAGES[id] : undefined;
  const palette = RARITY[rarity];
  const iconName = (iconKey as keyof typeof Feather.glyphMap) in Feather.glyphMap
    ? (iconKey as keyof typeof Feather.glyphMap)
    : 'star';

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {png ? (
        // Locked rendering: 0.55 opacity (was 0.4 — a flat 0.4 multiplier
        // crushed pastel-palette badges like Anniversary Blessing or
        // Fifty Lights below the readability threshold while leaving
        // gold/saturated badges still legible. 0.55 keeps the "dimmed"
        // semantic clearly distinct from the earned 1.0 state and treats
        // every palette consistently). The `desaturate` overlay layers a
        // soft warm-white wash that further unifies the locked treatment
        // across hue families without killing the badge's identity.
        <View style={[styles.png, { width: size, height: size }]}>
          <Image
            source={png}
            style={{ width: size, height: size, opacity: locked ? 0.55 : 1 }}
            resizeMode="contain"
          />
          {locked && (
            <View
              pointerEvents="none"
              style={[styles.lockedWash, { width: size, height: size }]}
            />
          )}
        </View>
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: locked ? '#EDE9E5' : `${palette.tint}1F`,
              borderColor: locked ? '#C8C2BE' : palette.tint,
            },
          ]}
        >
          <Feather
            name={iconName}
            size={Math.round(size * 0.42)}
            color={locked ? '#9C9690' : palette.glyph}
          />
          {label ? (
            <Text
              style={[
                styles.label,
                { color: locked ? '#9C9690' : palette.glyph, fontSize: Math.max(9, size * 0.13) },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          ) : null}
        </View>
      )}
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
  png: { position: 'relative' },
  // Faint warm-white film over locked badges. Sits on top of the dimmed
  // image and pushes every palette toward a uniform "unowned" feel —
  // pastels don't disappear, saturated badges don't dominate.
  lockedWash: {
    position: 'absolute',
    top: 0, left: 0,
    backgroundColor: 'rgba(251,247,246,0.35)',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
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
