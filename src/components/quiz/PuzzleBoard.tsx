import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Svg, { Defs, ClipPath, Path, Image as SvgImage, G } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import { INK_06, INK_28, TXT, TXTSUB, FONTS } from '../../constants/theme';
import { TILES_PER_PAINTING } from '../../state/quizProgress';
import { artworkAt, artSource, artTitle, artArtist, type QuizArtwork } from '../../constants/quizArt';
import { useTranslation } from '../../state/TranslationsContext';
import { jigsawPaths } from '../../services/jigsaw';

// The 2x2 jigsaw board.
//
// THE PICTURE IS DRAWN FOUR TIMES, each copy clipped to one piece — not cut
// into four images. Four separately-scaled crops would each round their own
// edges and the seams would not line up; one source clipped four ways keeps
// every piece registered to the same pixel grid.
//
// The tab and its socket are ONE curve, generated once in services/jigsaw.ts
// and walked backwards by whichever piece traverses it in reverse. Generating
// each side independently leaves a hairline of background along the seam, which
// on a photograph reads as a rendering fault rather than as a puzzle.
//
// Locked pieces render as a soft ink fill with a lock glyph — not as a blurred
// or greyed copy of the art. Showing her the picture she has not earned yet
// removes the reason to earn it.

export default function PuzzleBoard({
  paintingIndex, tilesUnlocked, size, newTile, showCaption = false,
}: {
  paintingIndex: number;
  tilesUnlocked: number;
  /** Board WIDTH. Height comes from the painting's own aspect. */
  size: number;
  /** Piece just unlocked, or null. Gets a ring so the reward is legible. */
  newTile?: number | null;
  showCaption?: boolean;
}) {
  const { current } = useTranslation();
  const lang = current.code;
  const art = artworkAt(paintingIndex);
  const w = Math.max(1, size);
  const h = Math.max(1, Math.round(w / (art.aspect || 1)));
  const unlocked = Math.max(0, Math.min(TILES_PER_PAINTING, Math.floor(tilesUnlocked) || 0));

  const paths = useMemo(() => jigsawPaths(w, h), [w, h]);
  const src = artSource(art);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Reset when the board is recycled onto a different painting, or a single
  // failure would stick for every later one.
  useEffect(() => { setFailed(false); setLoaded(false); }, [art.id]);

  return (
    <View style={{ width: w }}>
      {/* Warms the OS image cache and tells us whether the fetch worked at all.
          SvgImage gives no onError, so a dead CDN would otherwise show four
          empty holes with no way to fall back. */}
      <Image
        source={src}
        style={styles.probe}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />

      <Svg width={w} height={h} style={styles.board}>
        <Defs>
          {paths.map((d, i) => (
            <ClipPath key={`c${i}`} id={`piece-${art.id}-${i}`}>
              <Path d={d} />
            </ClipPath>
          ))}
        </Defs>

        {paths.map((d, i) => {
          // Until the bitmap lands, an "unlocked" piece would draw nothing at
          // all — SvgImage has no placeholder — so the whole celebration could
          // be a dark scrim over a blank rectangle on a slow connection.
          const open = i < unlocked && loaded && !failed;
          if (!open) {
            return (
              <Path
                key={`l${i}`}
                d={d}
                fill={open ? INK_06 : 'rgba(30,27,46,0.07)'}
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={1}
              />
            );
          }
          return (
            <G key={`p${i}`} clipPath={`url(#piece-${art.id}-${i})`}>
              <SvgImage
                href={src}
                x={0}
                y={0}
                width={w}
                height={h}
                preserveAspectRatio="xMidYMid slice"
              />
            </G>
          );
        })}

        {/* Seams last, over the art, so the board still reads as four pieces
            once every one is open. */}
        {paths.map((d, i) => (
          <Path
            key={`s${i}`}
            d={d}
            fill="none"
            stroke={i === newTile ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'}
            strokeWidth={i === newTile ? 2.5 : 1}
          />
        ))}
      </Svg>

      {/* Lock glyphs sit outside the SVG: a Feather icon inside react-native-svg
          would need a second font registration for no gain. Kept when the image
          FAILS, so a dead CDN still reads as "not earned yet" rather than as a
          blank grey box with no explanation. */}
      {Array.from({ length: TILES_PER_PAINTING }, (_, i) => (
        i < unlocked && !failed ? null : (
          <View
            key={`k${i}`}
            pointerEvents="none"
            style={[
              styles.lock,
              {
                left: (i % 2) * (w / 2),
                top: Math.floor(i / 2) * (h / 2),
                width: w / 2,
                height: h / 2,
              },
            ]}
          >
            <Feather name="lock" size={Math.max(13, w * 0.055)} color={INK_28} />
          </View>
        )
      ))}

      {failed ? (
        <View pointerEvents="none" style={styles.offline}>
          <Feather name="cloud-off" size={14} color={TXTSUB} />
        </View>
      ) : null}

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
  lock: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
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
