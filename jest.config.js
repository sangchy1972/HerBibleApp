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
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: false, esModuleInterop: true, jsx: 'react' } }],
  },
};
