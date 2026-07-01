// Lightweight ts-jest setup for PURE-logic unit tests (no React Native
// runtime). We deliberately scope `testMatch` to the __tests__ folder and map
// `react-native` to a tiny stub so modules that only touch PixelRatio/Dimensions
// (e.g. services/cfImage) are testable without the full RN/Expo jest preset.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/test/reactNativeStub.ts',
    // MoodEmoji imports react-native-svg only for its (never-rendered in tests)
    // SVG faces; the pure exports we test don't need it.
    '^react-native-svg$': '<rootDir>/test/reactNativeSvgStub.ts',
    // expo-file-system ships as untranspiled ESM that jest can't parse, and
    // node_modules aren't transformed. Modules under test transitively import
    // it but never run its filesystem code, so a no-op stub lets the suite load.
    '^expo-file-system$': '<rootDir>/test/expoFileSystemStub.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: false, esModuleInterop: true, jsx: 'react' } }],
  },
};
