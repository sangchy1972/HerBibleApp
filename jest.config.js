// Lightweight ts-jest setup for PURE-logic unit tests (no React Native
// runtime). We deliberately scope `testMatch` to the __tests__ folder and map
// `react-native` to a tiny stub so modules that only touch PixelRatio/Dimensions
// (e.g. services/cfImage) are testable without the full RN/Expo jest preset.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // RN injects __DEV__ at build time; services/ads.ts reads it at module scope to
  // pick test vs live ad units. Tests run outside the RN runtime, so define it.
  globals: { __DEV__: true },
  moduleNameMapper: {
    '^react-native$': '<rootDir>/test/reactNativeStub.ts',
    // MoodEmoji imports react-native-svg only for its (never-rendered in tests)
    // SVG faces; the pure exports we test don't need it.
    '^react-native-svg$': '<rootDir>/test/reactNativeSvgStub.ts',
    // expo-file-system ships as untranspiled ESM that jest can't parse, and
    // node_modules aren't transformed. Modules under test transitively import
    // it but never run its filesystem code, so a no-op stub lets the suite load.
    '^expo-file-system$': '<rootDir>/test/expoFileSystemStub.ts',
    // services/adRevenue persists its daily accumulators; an in-memory map is
    // all the tests need and keeps them free of the native module.
    '^@react-native-async-storage/async-storage$': '<rootDir>/test/asyncStorageStub.ts',
    // constants/quizArt require()s the bundled first painting so puzzle one
    // works offline. Metro turns that into an asset id; node would try to parse
    // JPEG bytes as JavaScript, so tests get a plain number instead.
    '\\.(jpg|jpeg|png|gif|webp)$': '<rootDir>/test/assetStub.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: false, esModuleInterop: true, jsx: 'react' } }],
  },
};
