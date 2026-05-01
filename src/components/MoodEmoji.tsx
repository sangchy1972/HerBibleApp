import React from 'react';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Circle, Path, Ellipse, G, Rect } from 'react-native-svg';

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

interface Props { mood: Mood; size?: number }

export default function MoodEmoji({ mood, size = 56 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <RadialGradient id="happyG"   cx="32" cy="28" r="28" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FFE680" /><Stop offset="100%" stopColor="#F4A93C" />
        </RadialGradient>
        <RadialGradient id="angryG"   cx="32" cy="28" r="28" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FFB36B" /><Stop offset="100%" stopColor="#E94060" />
        </RadialGradient>
        <RadialGradient id="weakG"    cx="32" cy="28" r="28" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#9EE7C9" /><Stop offset="100%" stopColor="#6FB6E2" />
        </RadialGradient>
        <RadialGradient id="anxiousG" cx="32" cy="28" r="28" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FFE680" /><Stop offset="100%" stopColor="#F09333" />
        </RadialGradient>
        <RadialGradient id="fearfulG" cx="32" cy="28" r="28" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#C8F1B4" /><Stop offset="100%" stopColor="#9C84E0" />
        </RadialGradient>
        <RadialGradient id="sadG"     cx="32" cy="28" r="28" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FFE08A" /><Stop offset="100%" stopColor="#E59644" />
        </RadialGradient>
        <RadialGradient id="calmG"    cx="32" cy="28" r="28" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FFE08A" /><Stop offset="100%" stopColor="#F09042" />
        </RadialGradient>
        <RadialGradient id="blessedG" cx="32" cy="28" r="28" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FFE680" /><Stop offset="100%" stopColor="#F4A93C" />
        </RadialGradient>
        <LinearGradient id="palmG" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#F8C99B" /><Stop offset="100%" stopColor="#E29A6B" />
        </LinearGradient>
      </Defs>
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
const Face = ({ fill }: { fill: string }) => (
  <Circle cx={32} cy={32} r={26} fill={fill} />
);
const EyeDot = ({ cx, cy }: { cx: number; cy: number }) => (
  <Circle cx={cx} cy={cy} r={2.4} fill="#1F1A2E" />
);

// Mood components ──────────────────────────────────────────────────────────────
function Angry() {
  return (
    <G>
      <Face fill="url(#angryG)" />
      {/* furrowed brows */}
      <Path d="M16 22 L26 27" stroke="#3A1F2E" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M48 22 L38 27" stroke="#3A1F2E" strokeWidth={2.4} strokeLinecap="round" />
      <EyeDot cx={23} cy={32} /><EyeDot cx={41} cy={32} />
      {/* frown */}
      <Path d="M22 46 Q32 38 42 46" stroke="#1F1A2E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Weak() {
  return (
    <G>
      <Face fill="url(#weakG)" />
      {/* eyebrows tired */}
      <Path d="M18 22 Q22 19 26 21" stroke="#1F1A2E" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M46 22 Q42 19 38 21" stroke="#1F1A2E" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <EyeDot cx={23} cy={28} /><EyeDot cx={41} cy={28} />
      {/* mask */}
      <Path d="M14 36 L50 36 L50 54 L14 54 Z" fill="#FFFFFF" />
      <Path d="M14 36 L50 36" stroke="#D6E5DA" strokeWidth={1.4} />
      <Path d="M22 44 H42" stroke="#D6E5DA" strokeWidth={1.2} />
      {/* mask straps */}
      <Path d="M14 38 Q6 42 14 50" stroke="#D6E5DA" strokeWidth={1.6} fill="none" />
      <Path d="M50 38 Q58 42 50 50" stroke="#D6E5DA" strokeWidth={1.6} fill="none" />
    </G>
  );
}

function Anxious() {
  return (
    <G>
      <Face fill="url(#anxiousG)" />
      {/* X eyes */}
      <Path d="M19 28 L27 36 M27 28 L19 36" stroke="#1F1A2E" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M37 28 L45 36 M45 28 L37 36" stroke="#1F1A2E" strokeWidth={2.4} strokeLinecap="round" />
      {/* zigzag mouth */}
      <Path d="M22 46 L26 43 L30 47 L34 43 L38 47 L42 43" stroke="#1F1A2E" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* sweat drop */}
      <Path d="M50 18 Q54 24 53 28 Q50 30 47 28 Q46 24 50 18 Z" fill="#7CC8F2" />
      <Circle cx={49} cy={24} r={1.2} fill="#FFFFFF" opacity={0.7} />
    </G>
  );
}

function Fearful() {
  return (
    <G>
      <Face fill="url(#fearfulG)" />
      {/* big round eyes (whites + pupil) */}
      <Circle cx={23} cy={30} r={5} fill="#FFFFFF" />
      <Circle cx={41} cy={30} r={5} fill="#FFFFFF" />
      <Circle cx={23} cy={31} r={2.2} fill="#1F1A2E" />
      <Circle cx={41} cy={31} r={2.2} fill="#1F1A2E" />
      {/* small open mouth */}
      <Ellipse cx={32} cy={46} rx={3} ry={4} fill="#1F1A2E" />
    </G>
  );
}

function Faithful() {
  return (
    <G>
      {/* Praying hands instead of a face — "Faithful" reads better as gesture. */}
      <Path
        d="M26 6 C22 8, 20 14, 20 22 L20 36 C20 42, 18 46, 12 50 L12 54 C12 56, 14 58, 16 58 L26 58 L30 58 L30 6 Z"
        fill="url(#palmG)"
      />
      <Path
        d="M38 6 C42 8, 44 14, 44 22 L44 36 C44 42, 46 46, 52 50 L52 54 C52 56, 50 58, 48 58 L38 58 L34 58 L34 6 Z"
        fill="url(#palmG)"
      />
      {/* simple highlight */}
      <Path d="M30 12 L30 56 M34 12 L34 56" stroke="#A66E45" strokeWidth={0.6} opacity={0.5} />
    </G>
  );
}

function Sad() {
  return (
    <G>
      <Face fill="url(#sadG)" />
      {/* eyebrows angled up */}
      <Path d="M18 24 L26 22" stroke="#1F1A2E" strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M46 24 L38 22" stroke="#1F1A2E" strokeWidth={1.8} strokeLinecap="round" />
      <EyeDot cx={23} cy={30} /><EyeDot cx={41} cy={30} />
      {/* tear */}
      <Path d="M40 36 Q43 40 42 44 Q40 45 38 44 Q37 40 40 36 Z" fill="#7CC8F2" />
      {/* frown */}
      <Path d="M24 48 Q32 42 40 48" stroke="#1F1A2E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Calm() {
  return (
    <G>
      <Face fill="url(#calmG)" />
      {/* closed peaceful eyes */}
      <Path d="M18 30 Q23 34 28 30" stroke="#1F1A2E" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Path d="M36 30 Q41 34 46 30" stroke="#1F1A2E" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {/* small content smile */}
      <Path d="M24 44 Q32 50 40 44" stroke="#1F1A2E" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {/* faint cheek blush */}
      <Circle cx={18} cy={40} r={3} fill="#F58FA8" opacity={0.45} />
      <Circle cx={46} cy={40} r={3} fill="#F58FA8" opacity={0.45} />
    </G>
  );
}

function Happy() {
  return (
    <G>
      <Face fill="url(#happyG)" />
      {/* squinted joyful eyes */}
      <Path d="M18 28 Q22 24 28 28" stroke="#1F1A2E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M36 28 Q42 24 46 28" stroke="#1F1A2E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {/* big open smile with teeth */}
      <Path d="M18 38 Q32 56 46 38 Z" fill="#3A1F2E" />
      <Path d="M20 39 H44 L42 42 L22 42 Z" fill="#FFFFFF" />
    </G>
  );
}

function Blessed() {
  return (
    <G>
      <Face fill="url(#blessedG)" />
      {/* squinted smile eyes */}
      <Path d="M18 28 Q22 24 28 28" stroke="#1F1A2E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M36 28 Q42 24 46 28" stroke="#1F1A2E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M22 42 Q32 50 42 42" stroke="#1F1A2E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {/* hearts */}
      <Heart x={4}  y={20} s={6} />
      <Heart x={50} y={16} s={7} />
      <Heart x={48} y={42} s={5} />
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
