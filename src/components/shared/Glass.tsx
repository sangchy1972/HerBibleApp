import React from 'react';
import { View, ViewStyle, StyleProp, TouchableOpacity } from 'react-native';

interface GlassProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export default function Glass({ children, style, onPress }: GlassProps) {
  const base: ViewStyle = {
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderRadius: 20,                    // unified card radius (per user)
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  };

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[base, style]}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[base, style]}>{children}</View>;
}
