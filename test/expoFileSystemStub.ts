// Stub for `expo-file-system` so the pure-logic unit tests can run under
// ts-jest. The real module ships as untranspiled ESM (export *), which jest
// can't parse, and node_modules aren't transformed. The tested code paths
// (e.g. verseHighlight's buildSegments / isSegmentActive) only IMPORT modules
// that transitively reference these symbols — they never execute the
// filesystem code — so no-op exports are sufficient.
export class File {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(..._args: unknown[]) {}
}
export class Directory {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(..._args: unknown[]) {}
}
export const Paths = { cache: '', document: '' } as Record<string, string>;
