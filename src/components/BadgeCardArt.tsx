import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import BadgeIcon from './BadgeIcon';
import Logo from './shared/Logo';
import type { BadgeRarity } from '../constants/achievements';
import { ROSE, TXT, FONTS } from '../constants/theme';

// The pink "New Achievement" card — the single shareable visual, used BOTH
// on-screen inside the unlock screen AND (at full pixel width, off-screen) as
// the node captured to an image for sharing / saving. Every dimension is
// derived from `width` so the same component renders crisp at any size: pass
// the on-screen card width for the live view, and a large width (e.g. 1080)
// for the capture. Deliberately self-contained + free of animation so a
// view-shot capture is deterministic. The share button is NOT part of this
// card (it is overlaid separately) so it never appears in the exported image.

const CARD_BG = '#FCE7EF';        // light rose card surface
// Footer bar sits a step LIGHTER than ROSE (#E63F69). At full brand rose the
// app icon — itself rose with a white book — sank into the bar and read as a
// flat blob; the lighter ground plus the white keyline below separates them.
const BRAND_BG = '#F0648A';
const NEW_ACH = 'rgba(30,27,46,0.42)';
const DESC = 'rgba(30,27,46,0.62)';

function Hexagon({ size, color }: { size: number; color: string }) {
  const c = size / 2;
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);   // pointy-top hexagon
    pts.push(`${c + c * Math.cos(a)},${c + c * Math.sin(a)}`);
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Polygon points={pts.join(' ')} fill={color} />
    </Svg>
  );
}

export default function BadgeCardArt({
  badgeId, iconKey, rarity, name, description, newAchievementLabel, width, glow,
}: {
  badgeId?: string;
  iconKey: string;
  rarity: BadgeRarity;
  name: string;
  description: string;
  newAchievementLabel: string;
  width: number;
  /**
   * Optional decorative layer painted BEHIND the badge (the rotating light
   * rays on the unlock screen). Passed in rather than built here so this
   * component stays animation-free: the off-screen capture copy renders
   * WITHOUT it, keeping the exported image deterministic.
   */
  glow?: React.ReactNode;
}) {
  const W = width;
  // The app mark gets a white keyline so it reads as a distinct object against
  // the rose bar instead of melting into it.
  const logoSize = Math.round(W * 0.078);
  const logoRing = Math.max(2, Math.round(W * 0.006));
  return (
    <View style={[styles.card, { width: W, borderRadius: W * 0.075 }]}>
      <View style={{ paddingHorizontal: W * 0.075, paddingTop: W * 0.06 }}>
        <View style={styles.topRow}>
          <Hexagon size={W * 0.052} color={ROSE} />
          <Text style={[styles.newAch, { fontSize: W * 0.046, marginLeft: W * 0.028 }]}>
            {newAchievementLabel}
          </Text>
        </View>

        <View style={{ alignItems: 'center', marginTop: W * 0.055, marginBottom: W * 0.055 }}>
          {/* Rays sit under the badge and must never intercept a tap. */}
          {glow ? (
            <View style={styles.glowLayer} pointerEvents="none">{glow}</View>
          ) : null}
          <BadgeIcon id={badgeId} iconKey={iconKey} rarity={rarity} size={Math.round(W * 0.42)} label={null} />
        </View>

        <Text style={[styles.name, { fontSize: W * 0.088, lineHeight: W * 0.106 }]}>{name}</Text>
        <Text style={[styles.desc, { fontSize: W * 0.052, lineHeight: W * 0.074, marginTop: W * 0.028 }]}>
          {description}
        </Text>
      </View>

      <View style={[styles.brandBar, { marginTop: W * 0.075, paddingVertical: W * 0.05, paddingHorizontal: W * 0.075, gap: W * 0.03 }]}>
        <View style={{
          borderWidth: logoRing,
          borderColor: '#FFFFFF',
          borderRadius: logoSize * 0.28 + logoRing,
          overflow: 'hidden',
        }}>
          <Logo size={logoSize} />
        </View>
        <Text style={[styles.brandText, { fontSize: W * 0.05 }]}>HER BIBLE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: CARD_BG, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  // Centred on the badge without affecting layout, so adding the glow can't
  // shift the card's height (which would change the capture geometry).
  glowLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  newAch: { fontFamily: FONTS.sansSemiBold, fontWeight: '600', color: NEW_ACH, letterSpacing: 0.4 },
  name: { fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT, letterSpacing: 0.2 },
  desc: { fontFamily: FONTS.lato, color: DESC, letterSpacing: 0.2 },
  // Deeper-rose footer bar with the app mark + wordmark. loraBold MUST pair
  // with '600' or Android silently drops Lora to system sans.
  brandBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND_BG },
  brandText: { color: '#FFFFFF', fontFamily: FONTS.loraBold, fontWeight: '600', letterSpacing: 1 },
});
