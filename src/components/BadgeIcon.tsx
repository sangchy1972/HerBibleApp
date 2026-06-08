import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import type { BadgeRarity } from '../constants/achievements';
import { BADGE_IMAGES } from '../constants/badgeImages';
import { useBadges } from '../state/BadgesContext';

// Per-rarity palette. The placeholder now renders as a filled medallion
// (two-stop gradient bg + white glyph + thin highlight ring at the top),
// so each tier reads as an intentional design rather than a "missing
// image" fallback. Tone choices:
//   • common    — warm sand → caramel (humble, grounded)
//   • rare      — sky → ocean (fresh, hopeful)
//   • epic      — lilac → plum (reflective, mystical)
//   • legendary — gold → bronze (celebratory, the brightest tier)
// Once a PNG override is registered for a badge, the PNG fully replaces
// this medallion — these gradients are only seen on un-arted badges.
const RARITY: Record<BadgeRarity, { grad: [string, string]; ring: string }> = {
  common:    { grad: ['#D9BB91', '#9E7A52'], ring: 'rgba(255,255,255,0.45)' },
  rare:      { grad: ['#7AB6E0', '#3B6DA0'], ring: 'rgba(255,255,255,0.50)' },
  epic:      { grad: ['#B79CE4', '#6F4AB0'], ring: 'rgba(255,255,255,0.50)' },
  legendary: { grad: ['#F2C661', '#B57215'], ring: 'rgba(255,255,255,0.55)' },
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
  // Art source, in priority order: a bundled override (BADGE_IMAGES, normally
  // empty — the binary ships art-free) → the CDN-cached PNG on disk → none,
  // in which case the gradient medallion placeholder renders.
  const { badgeUri } = useBadges();
  const bundled = id ? BADGE_IMAGES[id] : undefined;
  const remoteUri = id ? badgeUri(id) : null;
  const source = bundled ?? (remoteUri ? { uri: remoteUri } : undefined);
  const palette = RARITY[rarity];
  const iconName = (iconKey as keyof typeof Feather.glyphMap) in Feather.glyphMap
    ? (iconKey as keyof typeof Feather.glyphMap)
    : 'star';

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {source ? (
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
            source={source}
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
        // Designed medallion fallback — filled gradient body + white
        // glyph + a soft highlight arc at the top so it reads as a real
        // badge silhouette, not an empty placeholder circle. Sized + tinted
        // by rarity. Locked variant desaturates to a neutral gray gradient
        // and dims the glyph; earned variant fully colored.
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <LinearGradient
            colors={locked ? ['#D9D5D0', '#A09995'] : palette.grad}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
          />
          {/* Top-half highlight ring — a thin lighter arc that reads as
              specular light catching the medallion edge. Pure cosmetic. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: size * 0.04, left: size * 0.04, right: size * 0.04,
              height: size * 0.46,
              borderTopLeftRadius: size / 2,
              borderTopRightRadius: size / 2,
              borderTopWidth: 1,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: locked ? 'rgba(255,255,255,0.20)' : palette.ring,
            }}
          />
          <Feather
            name={iconName}
            size={Math.round(size * 0.5)}
            color={locked ? 'rgba(255,255,255,0.55)' : '#fff'}
            style={{ marginBottom: label ? 2 : 0 }}
          />
          {label ? (
            <Text
              style={[
                styles.label,
                { color: '#fff', opacity: locked ? 0.55 : 1, fontSize: Math.max(9, size * 0.13) },
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
    overflow: 'hidden',
    // Subtle drop shadow lifts the medallion off the page so the
    // collection grid reads as physical chips rather than flat dots.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  label: { fontWeight: '800', marginTop: 2, letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
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
