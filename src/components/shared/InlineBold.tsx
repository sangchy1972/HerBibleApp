import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

// Renders a localized string with **bold** spans. The markers live in the
// CATALOG STRINGS, because the bolded phrase sits in a different position in
// every language — splitting the sentence into separate keys would force every
// translation into English word order.
//
// Only ** is understood, deliberately: this is emphasis for coach-marks, not a
// markdown engine. An unbalanced marker renders its tail as plain text rather
// than eating it.

export default function InlineBold({
  text, style, boldStyle,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
}) {
  const parts = text.split('**');
  if (parts.length < 3) return <Text style={style}>{text.split('**').join('')}</Text>;
  return (
    <Text style={style}>
      {parts.map((chunk, i) => (
        // Odd indexes sit BETWEEN a marker pair → bold.
        i % 2 === 1 && i < parts.length - (parts.length % 2 === 0 ? 1 : 0)
          ? <Text key={i} style={boldStyle}>{chunk}</Text>
          : <Text key={i}>{chunk}</Text>
      ))}
    </Text>
  );
}
