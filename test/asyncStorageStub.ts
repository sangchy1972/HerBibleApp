// In-memory AsyncStorage for pure-logic unit tests. Enough surface for the
// services under test (get/set/remove/clear); extend as needed.
const store = new Map<string, string>();

const AsyncStorage = {
  getItem: async (k: string): Promise<string | null> => (store.has(k) ? store.get(k)! : null),
  setItem: async (k: string, v: string): Promise<void> => { store.set(k, v); },
  removeItem: async (k: string): Promise<void> => { store.delete(k); },
  clear: async (): Promise<void> => { store.clear(); },
  /** Test helper — not part of the real API. */
  __store: store,
};

export default AsyncStorage;
