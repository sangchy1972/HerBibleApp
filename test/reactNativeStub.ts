// Minimal react-native stub for pure-logic unit tests. Only the APIs our
// tested modules touch are provided. Extend as needed.
export const PixelRatio = {
  get: () => 3, // simulate a 3x device by default; tests can override via jest.spyOn
};
export const Dimensions = {
  get: () => ({ width: 390, height: 844 }),
};
// Modules that pick per-platform values at import time (e.g. the ad-unit ladder
// in services/usInterstitial) touch Platform.OS at module load. Default to
// 'android' for tests; the pure helpers under test don't depend on the choice.
export const Platform = {
  OS: 'android' as 'ios' | 'android' | string,
  select: (obj: any) => (obj ? (obj.android ?? obj.default) : undefined),
};
