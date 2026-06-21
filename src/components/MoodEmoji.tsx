import React from 'react';
import Svg, { Circle, Path, Ellipse, G } from 'react-native-svg';

export type Mood =
  | 'angry' | 'weak' | 'anxious' | 'fearful' | 'faithful'
  | 'sad' | 'calm' | 'happy' | 'blessed';

export const MOOD_LIST: Mood[] = [
  'angry', 'weak', 'anxious',
  'fearful', 'faithful', 'sad',
  'calm', 'happy', 'blessed',
];

export const MOOD_LABEL: Record<Mood, string> = {
  angry: 'Angry', weak: 'Weak', anxious: 'Anxious',
  fearful: 'Fearful', faithful: 'Faithful', sad: 'Sad',
  calm: 'Calm', happy: 'Happy', blessed: 'Blessed',
};

// Soft, flat pastel palette — the "cute" look the user asked for (vs the old
// harsh saturated gradients). Each face is one calm pastel + a glossy highlight
// + rosy cheeks, with simple rounded features.
const C = {
  angry:   '#F2978E',   // soft coral
  weak:    '#A6D6C5',   // soft mint (under the weather)
  anxious: '#F7C46B',   // warm amber
  fearful: '#C6BBEA',   // soft lavender
  sad:     '#AEB8E6',   // periwinkle
  calm:    '#F7CDB4',   // peach
  happy:   '#F7C85F',   // sunny yellow
  blessed: '#F4A6C0',   // rose
  palm:    '#F2C39C',   // praying-hands skin tone
};

const INK = '#3A3147';   // soft near-black for features (cuter than pure black)

interface Props { mood: Mood; size?: number }

export default function MoodEmoji({ mood, size = 56 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {render(mood)}
    </Svg>
  );
}

function render(m: Mood) {
  switch (m) {
    case 'angry':    return <Angry />;
    case 'weak':     return <Weak />;
    case 'anxious':  return <Anxious />;
    case 'fearful':  return <Fearful />;
    case 'faithful': return <Faithful />;
    case 'sad':      return <Sad />;
    case 'calm':     return <Calm />;
    case 'happy':    return <Happy />;
    case 'blessed':  return <Blessed />;
  }
}

// Common pieces ────────────────────────────────────────────────────────────────
// Flat pastel face + a soft top-left sheen for a gentle "glossy" cuteness.
const Face = ({ fill }: { fill: string }) => (
  <G>
    <Circle cx={32} cy={32} r={26} fill={fill} />
    <Ellipse cx={24} cy={21} rx={11.5} ry={8} fill="#FFFFFF" opacity={0.16} />
  </G>
);
const EyeDot = ({ cx, cy, r = 2.8 }: { cx: number; cy: number; r?: number }) => (
  <Circle cx={cx} cy={cy} r={r} fill={INK} />
);
// Rosy cheeks — the signature cute touch.
const Cheeks = ({ cy = 39, color = '#EE7E97', opacity = 0.4 }: { cy?: number; color?: string; opacity?: number }) => (
  <G>
    <Circle cx={20} cy={cy} r={4.2} fill={color} opacity={opacity} />
    <Circle cx={44} cy={cy} r={4.2} fill={color} opacity={opacity} />
  </G>
);

// Mood components ──────────────────────────────────────────────────────────────
function Angry() {
  return (
    <G>
      <Face fill={C.angry} />
      {/* soft angled brows */}
      <Path d="M18 25 L27 28.5" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M46 25 L37 28.5" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <EyeDot cx={24} cy={34} /><EyeDot cx={40} cy={34} />
      {/* small pout */}
      <Path d="M27 46 Q32 42 37 46" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Cheeks cy={41} color="#D8595F" opacity={0.28} />
    </G>
  );
}

function Weak() {
  return (
    <G>
      <Face fill={C.weak} />
      {/* tired half-lidded eyes */}
      <Path d="M19 31 Q24 33.5 29 31" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M35 31 Q40 33.5 45 31" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {/* soft rounded face mask (under the weather) */}
      <Path d="M16 38 Q32 36 48 38 L48 49 Q32 58 16 49 Z" fill="#FFFFFF" />
      <Path d="M16 39 Q32 37 48 39" stroke="#D6E5DA" strokeWidth={1.4} fill="none" />
      <Path d="M23 45 Q32 46 41 45" stroke="#D6E5DA" strokeWidth={1.2} fill="none" />
      {/* mask straps */}
      <Path d="M16 40 Q8 44 15 51" stroke="#CFE0D6" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M48 40 Q56 44 49 51" stroke="#CFE0D6" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Anxious() {
  return (
    <G>
      <Face fill={C.anxious} />
      {/* worried raised brows */}
      <Path d="M19 26 Q23.5 23.5 28 26" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M36 26 Q40.5 23.5 45 26" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
      <EyeDot cx={24} cy={33} r={2.6} /><EyeDot cx={40} cy={33} r={2.6} />
      {/* small wavy worried mouth */}
      <Path d="M26 46 Q29 43.5 32 46 Q35 48.5 38 46" stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* sweat drop */}
      <Path d="M50 17 Q54 23 52.5 27 Q50 29 47.5 27 Q46 23 50 17 Z" fill="#7CC8F2" />
      <Circle cx={49} cy={23} r={1.1} fill="#FFFFFF" opacity={0.7} />
      <Cheeks cy={40} />
    </G>
  );
}

function Fearful() {
  return (
    <G>
      <Face fill={C.fearful} />
      {/* big startled round eyes */}
      <Circle cx={24} cy={31} r={5.4} fill="#FFFFFF" />
      <Circle cx={40} cy={31} r={5.4} fill="#FFFFFF" />
      <Circle cx={24} cy={32} r={2.5} fill={INK} />
      <Circle cx={40} cy={32} r={2.5} fill={INK} />
      {/* small worried "o" mouth */}
      <Ellipse cx={32} cy={46} rx={3} ry={3.6} fill={INK} />
      <Cheeks cy={42} color="#9C84E0" opacity={0.3} />
    </G>
  );
}

function Faithful() {
  return (
    <G>
      {/* Praying hands — "Faithful" reads better as a gesture than a face. */}
      <Path
        d="M26 6 C22 8, 20 14, 20 22 L20 36 C20 42, 18 46, 12 50 L12 54 C12 56, 14 58, 16 58 L26 58 L30 58 L30 6 Z"
        fill={C.palm}
      />
      <Path
        d="M38 6 C42 8, 44 14, 44 22 L44 36 C44 42, 46 46, 52 50 L52 54 C52 56, 50 58, 48 58 L38 58 L34 58 L34 6 Z"
        fill={C.palm}
      />
      <Path d="M30 12 L30 56 M34 12 L34 56" stroke="#C98F63" strokeWidth={0.7} opacity={0.5} />
      {/* a tiny sparkle of devotion */}
      <Path d="M48 12 l1.2 3 l3 1.2 l-3 1.2 l-1.2 3 l-1.2 -3 l-3 -1.2 l3 -1.2 Z" fill="#FBD36B" />
    </G>
  );
}

function Sad() {
  return (
    <G>
      <Face fill={C.sad} />
      {/* inner-up sad brows */}
      <Path d="M19 25 L27 27" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <Path d="M45 25 L37 27" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <EyeDot cx={24} cy={32} /><EyeDot cx={40} cy={32} />
      {/* tear */}
      <Path d="M40 36 Q43 40 42 44 Q40 45.5 38 44 Q37 40 40 36 Z" fill="#7CC8F2" />
      {/* gentle frown */}
      <Path d="M26 48 Q32 43.5 38 48" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Cheeks cy={41} color="#8C9AD8" opacity={0.32} />
    </G>
  );
}

function Calm() {
  return (
    <G>
      <Face fill={C.calm} />
      {/* peaceful closed eyes */}
      <Path d="M19 31 Q24 34.5 29 31" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M35 31 Q40 34.5 45 31" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {/* soft content smile */}
      <Path d="M26 43 Q32 48.5 38 43" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Cheeks cy={39} />
    </G>
  );
}

function Happy() {
  return (
    <G>
      <Face fill={C.happy} />
      {/* joyful upcurved eyes */}
      <Path d="M19 31 Q24 27 29 31" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M35 31 Q40 27 45 31" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      {/* big soft open smile (no harsh teeth — cuter) */}
      <Path d="M23 40 Q32 51 41 40 Q32 46 23 40 Z" fill="#6B4A57" />
      <Cheeks cy={42} />
    </G>
  );
}

function Blessed() {
  return (
    <G>
      <Face fill={C.blessed} />
      {/* smiling closed eyes */}
      <Path d="M19 31 Q24 27.5 29 31" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M35 31 Q40 27.5 45 31" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      {/* gentle grateful smile */}
      <Path d="M26 42 Q32 48 38 42" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Cheeks cy={40} color="#E27DA0" opacity={0.45} />
      {/* floating hearts */}
      <Heart x={4}  y={20} s={6} />
      <Heart x={50} y={16} s={7} />
      <Heart x={49} y={43} s={5} />
    </G>
  );
}

function Heart({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <Path
      d={`M ${x + s} ${y + s * 0.3}
         C ${x + s * 0.6} ${y - s * 0.2}, ${x} ${y + s * 0.2}, ${x + s} ${y + s * 1.6}
         C ${x + s * 2}  ${y + s * 0.2}, ${x + s * 1.4} ${y - s * 0.2}, ${x + s} ${y + s * 0.3} Z`}
      fill="#F4628A"
    />
  );
}
