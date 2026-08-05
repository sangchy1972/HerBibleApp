import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Svg, { Line, Rect, Path } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, INK_06, TXT, TXTSUB, FONTS } from '../../constants/theme';
import { TILES_PER_PAINTING } from '../../state/quizProgress';
import { artworkAt, artSource, artTitle, artArtist } from '../../constants/quizArt';
import { useUILanguage } from '../../state/UILanguageContext';

// The 2x2 puzzle board.
//
// Straight quarters split by DASHED seams — not jigsaw-shaped pieces. The tabbed
// pieces looked clever but read badly at this size (per user); the reference
// design's dashes say "four parts, three to go" instantly.
//
// The WHOLE painting is always underneath. Locked quarters show it through a
// heavy white wash — present but unmistakably not hers yet, the way the
// reference does it — with a solid lock sitting on each. (This deliberately
// replaces the old ink-fill-hides-the-art approach, per user.)

/** Solid lock — filled shackle + rounded body with a cross on the face, the
 *  reference design's shape rendered in the app's accent. Not a line icon. */
function LockBadge({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={styles.lockShadow}>
      {/* Shackle */}
      <Path d="M7.4 11 V7.8 a4.6 4.6 0 0 1 9.2 0 V11" stroke={ROSE} strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* Body */}
      <Rect x={4} y={9.8} width={16} height={12.4} rx={3.4} fill={ROSE} />
      {/* Cross punched out of the face */}
      <Rect x={10.95} y={12.1} width={2.1} height={7.4} rx={1.05} fill="#FFFFFF" />
      <Rect x={8.6} y={14.2} width={6.8} height={2.1} rx={1.05} fill="#FFFFFF" />
    </Svg>
  );
}

export default function PuzzleBoard({
  paintingIndex, tilesUnlocked, size, newTile, showCaption = false,
}: {
  paintingIndex: number;
  tilesUnlocked: number;
  /** Board WIDTH. Height comes from the painting's own aspect. */
  size: number;
  /** Piece just unlocked, or null. Ringed so the reward is legible. */
  newTile?: number | null;
  showCaption?: boolean;
}) {
  // UI language, NOT the Bible edition -- the two are chosen separately.
  const { lang } = useUILanguage();
  const art = artworkAt(paintingIndex);
  const w = Math.max(1, size);
  const h = Math.max(1, Math.round(w / (art.aspect || 1)));
  const unlocked = Math.max(0, Math.min(TILES_PER_PAINTING, Math.floor(tilesUnlocked) || 0));

  const src = artSource(art);
  // A require()d asset is already in the binary. Starting it `loaded` matters
  // because a bundled source can never fire onError either, so a missed onLoad
  // would leave the board locked forever with no cloud-off icon and no retry --
  // and the offline first puzzle is the whole reason the file is bundled.
  const isLocal = typeof src === 'number';
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(isLocal);
  // Reset when the board is recycled onto a different painting, or a single
  // failure would stick for every later one.
  useEffect(() => { setFailed(false); setLoaded(isLocal); }, [art.id, isLocal]);

  const showArt = loaded && !failed;
  const lockSize = Math.max(30, Math.min(46, w * 0.115));

  return (
    <View style={{ width: w }}>
      <View style={[styles.board, { width: w, height: h }]}>
        {showArt ? (
          <Image
            source={src}
            style={{ width: w, height: h }}
            resizeMode="cover"
            onError={() => setFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          // Probe: warms the cache and reports the fetch outcome while the
          // board shows its neutral base.
          <Image
            source={src}
            style={styles.probe}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            accessibilityIgnoresInvertColors
          />
        )}

        {/* Heavy white wash over each quarter not yet earned — the art stays
            faintly visible under it. */}
        {Array.from({ length: TILES_PER_PAINTING }, (_, i) => (
          i < unlocked ? null : (
            <View
              key={`w${i}`}
              pointerEvents="none"
              style={[styles.wash, {
                left: (i % 2) * (w / 2),
                top: Math.floor(i / 2) * (h / 2),
                width: w / 2,
                height: h / 2,
              }]}
            />
          )
        ))}

        {/* Dashed cross dividing the quarters, plus the fresh piece's ring. */}
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Line x1={w / 2} y1={0} x2={w / 2} y2={h} stroke="rgba(30,27,46,0.32)" strokeWidth={1.5} strokeDasharray="7 7" />
          <Line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(30,27,46,0.32)" strokeWidth={1.5} strokeDasharray="7 7" />
          {newTile != null && newTile >= 0 && newTile < TILES_PER_PAINTING ? (
            <Rect
              x={(newTile % 2) * (w / 2) + 2.5}
              y={Math.floor(newTile / 2) * (h / 2) + 2.5}
              width={w / 2 - 5}
              height={h / 2 - 5}
              rx={8}
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth={2.5}
            />
          ) : null}
        </Svg>

        {/* Locks over the quarters still to earn. Kept when the image FAILS, so
            a dead CDN still reads as "not earned yet" rather than as a blank
            grey box with no explanation. */}
        {Array.from({ length: TILES_PER_PAINTING }, (_, i) => (
          i < unlocked && !failed ? null : (
            <View
              key={`k${i}`}
              pointerEvents="none"
              style={[styles.lockCell, {
                left: (i % 2) * (w / 2),
                top: Math.floor(i / 2) * (h / 2),
                width: w / 2,
                height: h / 2,
              }]}
            >
              <LockBadge size={lockSize} />
            </View>
          )
        ))}

        {failed ? (
          <View pointerEvents="none" style={styles.offline}>
            <Feather name="cloud-off" size={14} color={TXTSUB} />
          </View>
        ) : null}
      </View>

      {showCaption ? (
        <View style={styles.caption}>
          <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {artTitle(art, lang)}
          </Text>
          <Text style={styles.artist} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {art.year ? `${artArtist(art, lang)} · ${art.year}` : artArtist(art, lang)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  probe: { width: 1, height: 1, opacity: 0, position: 'absolute' },
  board: { borderRadius: 14, overflow: 'hidden', backgroundColor: INK_06 },
  // Light enough that the painting reads through, heavy enough that "not yet"
  // is unmistakable.
  wash: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.84)' },
  lockCell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  // Feathered drop under the lock so it sits ON the washed art instead of
  // floating in it. (Shadow props on an Svg root work on iOS; Android simply
  // ignores them, which is fine — the solid fill carries the shape there.)
  lockShadow: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.16, shadowRadius: 3,
  },
  offline: { position: 'absolute', right: 8, top: 8, opacity: 0.8 },
  caption: { marginTop: 12, alignItems: 'center' },
  title: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 16.5,
    color: TXT, textAlign: 'center', letterSpacing: 0.2,
  },
  artist: {
    fontFamily: FONTS.lato, fontSize: 12.5, color: TXTSUB,
    textAlign: 'center', marginTop: 3, letterSpacing: 0.2,
  },
});
