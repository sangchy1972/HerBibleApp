// Minimal react-native stub for pure-logic unit tests. Only the APIs our
// tested modules touch are provided. Extend as needed.
export const PixelRatio = {
  get: () => 3, // simulate a 3x device by default; tests can override via jest.spyOn
};
export const Dimensions = {
  get: () => ({ width: 390, height: 844 }),
};
