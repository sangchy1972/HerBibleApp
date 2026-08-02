import React from 'react';
import { View, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { INK_28 } from '../../constants/theme';
import { TILES_PER_PAINTING } from '../../state/quizProgress';
import { artworkAt } from '../../constants/quizArt';
import PuzzleArt from './PuzzleArt';

// The 2×2 puzzle board.
//
// The artwork is drawn ONCE at full size and the locked tiles are frosted
// panels laid on top. Cutting the picture into four separately-rendered
// quadrants would be the obvious implementation and is wrong: each piece would
// scale independently, so the seams wouldn't line up and the reveal wouldn't
// read as one picture coming into view. One image, four covers.
//
// `newTile` is the quadrant unlocked by the set the user just finished. It gets
// a ring so the reward is legible in the half-second she looks at it — without
// it, "one of four squares is now slightly less grey" is easy to miss entirely.

export default function PuzzleBoard({
  paintingIndex, tilesUnlocked, size, newTile,
}: {
  paintingIndex: number;
  tilesUnlocked: number;
  size: number;
  /** Quadrant index just unlocked, or null. */
  newTile?: number | null;
}) {
  const art = artworkAt(paintingIndex);
  const half = size / 2;
  const unlocked = Math.max(0, Math.min(TILES_PER_PAINTING, Math.floor(tilesUnlocked) || 0));

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <PuzzleArt art={art} size={size} />

      {Array.from({ length: TILES_PER_PAINTING }, (_, i) => {
        const isOpen = i < unlocked;
        const row = Math.floor(i / 2);
        const col = i % 2;
        const box = { left: col * half, top: row * half, width: half, height: half };

        if (isOpen) {
          return i === newTile ? (
            <View key={i} pointerEvents="none" style={[styles.tile, box, styles.fresh]} />
          ) : null;
        }
        return (
          <View key={i} pointerEvents="none" style={[styles.tile, box, styles.locked]}>
            <Feather name="lock" size={Math.max(12, size * 0.07)} color={INK_28} />
          </View>
        );
      })}

      {/* Hairline cross, above the covers, so the board still reads as four
          pieces once every tile is open. */}
      <View pointerEvents="none" style={[styles.seam, { left: half - 0.5, top: 0, width: 1, height: size }]} />
      <View pointerEvents="none" style={[styles.seam, { left: 0, top: half - 0.5, width: size, height: 1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 18, overflow: 'hidden', position: 'relative' },
  tile: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  // Frosted, not opaque: a hint of the picture behind a locked tile is what
  // makes the next one worth unlocking.
  locked: { backgroundColor: 'rgba(255,255,255,0.86)' },
  fresh: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  seam: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.55)' },
});
