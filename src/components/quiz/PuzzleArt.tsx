import React from 'react';
import { View, Image } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle, G } from 'react-native-svg';
import type { QuizArtwork } from '../../constants/quizArt';

// Renders one puzzle artwork at any size.
//
// Two modes, chosen per artwork: a bundled vector composition (today) or a
// remote image (once real art is commissioned). Everything downstream — the
// tile maths, the collection grid — is size-agnostic and doesn't care which.
//
// The vector path is not a stand-in for "nothing": it has to look finished,
// because a user who completes four sets and is handed an obvious placeholder
// learns the reward isn't worth chasing. Line art on a soft wash, one motif per
// painting, drawn in a 100×100 viewBox so it scales cleanly from a 60 px
// collection thumbnail to a full-width board.

export default function PuzzleArt({ art, size }: { art: QuizArtwork; size: number }) {
  if (art.url) {
    return (
      <Image
        source={{ uri: art.url }}
        style={{ width: size, height: size }}
        resizeMode="cover"
        // The wash shows through while the image loads, so the board never
        // flashes white inside an unlocked tile.
        accessibilityIgnoresInvertColors
      />
    );
  }

  const gid = `g-${art.id}`;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={art.bg[0]} />
            <Stop offset="1" stopColor={art.bg[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${gid})`} />
        <Motif art={art} />
      </Svg>
    </View>
  );
}

// Stroke-only line art: `vectorEffect` isn't reliable across platforms in
// react-native-svg, so the strokes are sized in viewBox units and scale with
// the drawing — which is what we want here (a thumbnail reads as a miniature,
// not as the same hairline on a smaller picture).
function Motif({ art }: { art: QuizArtwork }) {
  const s = { stroke: art.ink, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const soft = art.ink + '33';   // 20 % — the wash behind the line work

  switch (art.motif) {
    case 'lily':
      return (
        <G>
          <Circle cx="50" cy="44" r="26" fill={soft} />
          <Path {...s} d="M50 68 V38" />
          <Path {...s} d="M50 38 C42 26 32 26 30 34 C28 42 40 44 50 38 Z" />
          <Path {...s} d="M50 38 C58 26 68 26 70 34 C72 42 60 44 50 38 Z" />
          <Path {...s} d="M50 40 C46 28 54 28 50 40 Z" />
          <Path {...s} d="M50 60 C40 58 34 64 36 70 C44 72 48 66 50 60 Z" />
        </G>
      );
    case 'dove':
      return (
        <G>
          <Circle cx="50" cy="48" r="27" fill={soft} />
          <Path {...s} d="M30 56 C34 40 50 32 64 36 C72 38 74 46 68 50 C62 54 56 50 58 44" />
          <Path {...s} d="M34 54 C42 50 52 52 56 60 C50 66 40 64 34 54 Z" />
          <Path {...s} d="M64 40 L72 36" />
          <Circle cx="62" cy="41" r="1.4" fill={art.ink} stroke="none" />
        </G>
      );
    case 'lamp':
      return (
        <G>
          <Circle cx="50" cy="46" r="26" fill={soft} />
          <Path {...s} d="M50 30 C48 34 46 36 46 39 C46 42 48 44 50 44 C52 44 54 42 54 39 C54 36 52 34 50 30 Z" />
          <Path {...s} d="M38 58 C38 52 44 48 50 48 C56 48 62 52 62 58 Z" />
          <Path {...s} d="M34 58 H66" />
          <Path {...s} d="M50 62 V70" />
          <Path {...s} d="M42 70 H58" />
        </G>
      );
    case 'vine':
      return (
        <G>
          <Circle cx="50" cy="48" r="27" fill={soft} />
          <Path {...s} d="M50 74 C50 60 46 50 38 42" />
          <Path {...s} d="M50 62 C56 58 62 48 62 38" />
          <Path {...s} d="M38 42 C30 44 28 34 36 32 C42 31 44 38 38 42 Z" />
          <Path {...s} d="M62 38 C70 40 72 30 64 28 C58 27 56 34 62 38 Z" />
          <Path {...s} d="M50 52 C44 48 44 40 50 36 C56 40 56 48 50 52 Z" />
        </G>
      );
    case 'crown':
      return (
        <G>
          <Circle cx="50" cy="48" r="26" fill={soft} />
          <Path {...s} d="M32 62 L36 38 L44 50 L50 34 L56 50 L64 38 L68 62 Z" />
          <Path {...s} d="M32 66 H68" />
          <Circle cx="36" cy="35" r="2" fill={art.ink} stroke="none" />
          <Circle cx="50" cy="31" r="2" fill={art.ink} stroke="none" />
          <Circle cx="64" cy="35" r="2" fill={art.ink} stroke="none" />
        </G>
      );
    case 'sunrise':
    default:
      return (
        <G>
          <Circle cx="50" cy="52" r="27" fill={soft} />
          <Circle {...s} cx="50" cy="56" r="13" />
          <Path {...s} d="M26 70 H74" />
          <Path {...s} d="M50 33 V27" />
          <Path {...s} d="M33 40 L29 36" />
          <Path {...s} d="M67 40 L71 36" />
          <Path {...s} d="M28 56 H22" />
          <Path {...s} d="M72 56 H78" />
        </G>
      );
  }
}
