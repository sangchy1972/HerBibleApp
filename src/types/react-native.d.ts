// Module augmentation for `fontVariationSettings`. React Native 0.74+
// supports this prop at runtime on iOS and Android (it forwards opsz/wght
// axes to the native text renderer for variable fonts), but the
// TypeScript types in `react-native@0.81` don't include it yet. Declaring
// it here lets `StyleSheet.create({ … fontVariationSettings: [...] })`
// type-check correctly without falling back to `as any` at every call site.
//
// Drop this file once react-native ships the types upstream.
import 'react-native';

declare module 'react-native' {
  interface TextStyle {
    fontVariationSettings?: ReadonlyArray<{ axis: string; value: number }>;
  }
}
