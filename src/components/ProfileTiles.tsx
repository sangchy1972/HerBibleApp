import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB } from '../constants/theme';

type FeatherIcon = keyof typeof Feather.glyphMap;

// 4×2 grid tile used in "Learning Bible" and "Account".
export function GridTile({
  label,
  icon,
  badge,
  onPress,
}: {
  label: string;
  icon: FeatherIcon;
  badge?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.tile} activeOpacity={0.8}>
      <View style={styles.tileIconWrap}>
        <View style={styles.tileIconBg}>
          <Feather name={icon} size={20} color={ROSE} />
        </View>
        {badge && <View style={styles.tileBadge} />}
      </View>
      <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

// Wider 3-up tile for the "My Notes" row (Notes / Bookmarks / Highlight).
export function NotesTile({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: FeatherIcon;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.notesTile} activeOpacity={0.8}>
      <Feather name={icon} size={28} color={ROSE} />
      <Text style={styles.notesLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// "First Prayer awarded on YYYY-MM-DD" badge card.
export function FaithBadgeCard({
  title,
  awardedOn,
  onPress,
}: {
  title: string;
  awardedOn: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.badgeCard}>
      <View style={styles.badgeWrap}>
        <BadgeHex />
        <View style={styles.badgeDot} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.badgeTitle}>{title}</Text>
        <Text style={styles.badgeDate}>awarded on {awardedOn}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={TXTSUB} />
    </TouchableOpacity>
  );
}

function BadgeHex() {
  // Hexagonal coin: dark red field, gold ring, simple praying-hands glyph,
  // "AMEN" text, and a row of stars at the bottom.
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64">
      <Polygon points="32,3 58,18 58,46 32,61 6,46 6,18" fill="#C75A4E" />
      <Polygon points="32,9 53,21 53,43 32,55 11,43 11,21" fill="#7E2A22" />
      {/* Praying hands — leaf pair */}
      <Path
        d="M30 18 C28 19, 27 22, 27 25 L27 31 C27 33, 26 34, 25 35 L25 36 L31 36 Z"
        fill="#F4DCC0"
      />
      <Path
        d="M34 18 C36 19, 37 22, 37 25 L37 31 C37 33, 38 34, 39 35 L39 36 L33 36 Z"
        fill="#F4DCC0"
      />
      {/* AMEN ribbon */}
      <Path d="M16 39 L48 39 L48 46 L32 50 L16 46 Z" fill="#E8A85C" />
      <Path d="M21 41 L43 41 L43 46 L32 49 L21 46 Z" fill="#9C6B30" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  tile: {
    // 3-up Learning Bible row — three of these per row with space-between
    // gives ~3.5 % gaps, matching the visual rhythm of the stats row above.
    width: '31%',
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  tileIconWrap: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  tileIconBg: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: `${ROSE}1A`,        // soft rose tint, theme-consistent
    alignItems: 'center', justifyContent: 'center',
  },
  tileBadge: {
    position: 'absolute', top: -2, right: -2,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#FF4D4D',
  },
  tileLabel: {
    fontSize: 12, color: TXT,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 15,
  },
  notesTile: {
    width: '31%',
    aspectRatio: 1.25,                  // -20 % height: width / 0.8 = 1.25
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  notesLabel: {
    fontSize: 14, color: TXT, fontWeight: '600',
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8C893',
    backgroundColor: '#FBF1DE',
  },
  badgeWrap: { position: 'relative' },
  badgeDot: {
    position: 'absolute', top: -2, right: -2,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#FF4D4D',
  },
  badgeTitle: {
    fontSize: 17, fontWeight: '700', color: TXT,
    marginBottom: 2,
  },
  badgeDate: {
    fontSize: 14, color: TXTSUB,
  },
});
