import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { TXTSUB } from '../../constants/theme';

interface PillProps {
  children: string;
  active: boolean;
  ac: string;
  onPress: () => void;
}

export default function Pill({ children, active, ac, onPress }: PillProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.pill, { backgroundColor: active ? ac : 'transparent' }]}
      activeOpacity={0.8}
    >
      <Text style={[styles.text, { color: active ? '#fff' : TXTSUB }]}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 11,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
