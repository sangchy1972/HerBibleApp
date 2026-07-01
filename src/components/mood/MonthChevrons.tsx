import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { TXT } from '../../constants/theme';

// Month-nav chevrons drawn as inline SVG (NOT an icon font). The icon font can
// load late on some production builds, leaving nav buttons empty; an SVG path
// has no font dependency so it always renders.
const CHEVRON_D: Record<'left' | 'right' | 'up' | 'down', string> = {
  left:  'M15 18 L9 12 L15 6',
  right: 'M9 18 L15 12 L9 6',
  up:    'M6 15 L12 9 L18 15',
  down:  'M6 9 L12 15 L18 9',
};

export function Chevron({ dir, small, color = TXT }: { dir: 'left' | 'right' | 'up' | 'down'; small?: boolean; color?: string }) {
  const s = small ? 15 : 22;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d={CHEVRON_D[dir]} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Double chevron («  ») — fast year jump (single = month, double = year).
export function DoubleChevron({ dir, color = TXT }: { dir: 'left' | 'right'; color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      {dir === 'left' ? (
        <>
          <Path d="M11 18 L5 12 L11 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M18 18 L12 12 L18 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <Path d="M6 18 L12 12 L6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M13 18 L19 12 L13 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}
