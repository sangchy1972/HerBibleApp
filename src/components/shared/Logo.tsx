// Minimal stub. Original was lost when a worktree was deleted (never
// committed). The brand asset (assets/icon.png) still exists, so this
// renders it at the requested size. Per project memory, callers expect
// `<Logo size={N} />`.
import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface Props {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export default function Logo({ size = 64, style }: Props) {
  return (
    <Image
      source={require('../../../assets/icon.png')}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
}
