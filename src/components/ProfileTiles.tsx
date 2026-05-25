import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';

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

// Wider 3-up tile used for both the "My Notes" row (Notes / Bookmarks /
// Highlight) and the "Learning Bible" row (My Plan / Quiz / Did You Know).
// The shared treatment is a clean white card with a centered icon + label —
// no rose-tinted icon background, no extra chrome — so the two rows look
// like siblings rather than competing styles.
//
// Layout: a flex-1 icon slot on top + a fixed-height (34 px = 2 lines @
// lineHeight 17) label slot at the bottom. Splitting into two slots keeps
// every tile's icon at the same Y regardless of whether the label wraps
// to one line ("Notes") or two ("Saved Verses" / "Did you know"). Without
// this, `justifyContent: 'center'` makes the whole group center as a unit
// — so a 2-line group sits ~9 px higher than a 1-line group, and the
// row-of-tiles reads as misaligned.
export function NotesTile({
  label,
  icon,
  badge,
  onPress,
}: {
  label: string;
  icon: FeatherIcon;
  /** Tiny red pip in the top-right corner — used for "new / unseen" hints. */
  badge?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.notesTile} activeOpacity={0.8}>
      <View style={styles.notesIconSlot}>
        <Feather name={icon} size={24} color={ROSE} />
      </View>
      <View style={styles.notesLabelSlot}>
        <Text style={styles.notesLabel} numberOfLines={2}>{label}</Text>
      </View>
      {badge && <View style={styles.notesTileBadge} />}
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
    borderRadius: 11.2,                                                          // 14 → 16 → 11.2 (-30 % per user)
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,                                                         // 0.04 → 0.05 (matches notesTile)
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
    fontFamily: FONTS.lato,                                                      // per user — all card text on Profile uses Lato
  },
  notesTile: {
    width: '31%',
    // Height locked to 92 px per user — same as every other main Profile
    // card (statCard, achievementPreview, widgetBanner, removeAdsBanner) so
    // the whole screen reads with one rhythm. Was aspectRatio 4 / 3
    // (≈ 79 px) — bumped to a hard 92 to unify with the rest.
    height: 92,
    backgroundColor: '#FFFFFF',
    borderRadius: 11.2,                                                          // 16 → 11.2 (-30 % per user) — keeps the unified Profile card look
    // Border removed per user — Profile cards now use shadow alone.
    paddingVertical: 9,                   // 12 → 9, proportional to height shrink
    paddingHorizontal: 6,
    alignItems: 'stretch',                // children fill horizontal — needed so the
                                          // label slot can centre 2-line text properly
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  // Upper slot — icon hugs the BOTTOM of its slot (toward the label),
  // then `paddingBottom: 8` lifts it back up by 8 px (was 5; bumped +3
  // per user feedback that the icon sat too far from the top of the
  // card). Net: icon top ≈ 12 px from card top, icon-label visual gap
  // ≈ 10 px. Cross-tile icon-Y alignment still holds because every
  // tile's icon-slot bottom edge is at the same Y.
  notesIconSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,                     // 12 → 4 — give the label slot more vertical room now that it accommodates 2 full lines for longer translations (pt "Versículos salvos" / de "Gespeicherte Verse" both wrap to 2)
  },
  // Bottom slot sized to 2 full lines @ lineHeight 16 + a 2 px buffer so
  // descenders never clip. The earlier 26 px height assumed English-only
  // labels and clipped the second line of pt "Versículos salvos" / de
  // "Gespeicherte Verse". Label still hugs the TOP of the slot (close to
  // the icon); slot-top Y stays fixed across tiles so the row reads
  // aligned regardless of which tiles wrap.
  notesLabelSlot: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  notesLabel: {
    fontSize: 13,                                                                // 14 → 13 — longer translations (pt/de/fr) need more horizontal room before they wrap or truncate
    color: TXT,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
    fontFamily: FONTS.latoBold,                                                  // per user — all card text on Profile uses Lato
  },
  notesTileBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#FF4D4D',
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
