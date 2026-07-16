// The banner slot→verse mapping. This is the exact thing that broke in
// production: every banner carried the DAY's card verse, of which there are only
// two, so a user's tray filled with seven identical copies of John 10:10. These
// tests pin the property that failure violated — consecutive slots must not
// repeat — so it can't regress silently.
//
// bannerVerseForSlot itself is async and reaches for AsyncStorage + the verse
// cache, so the pure index maths is replicated here and asserted directly. Keep
// the formula in sync with notifVerse.bannerVerseForSlot.

const STRIDE = 7;   // must match bannerVerseForSlot

function slotIndex(elapsedDays: number, slot: number, poolSize: number): number {
  return (elapsedDays + slot * STRIDE) % poolSize;
}

// The real schedule: 8 banners a day.
const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7];

describe('banner slot → verse index', () => {
  it('gives all 8 slots of a day DIFFERENT verses', () => {
    for (const pool of [30, 60, 90, 100, 150, 365]) {
      for (let day = 0; day < 40; day++) {
        const idx = SLOTS.map(s => slotIndex(day, s, pool));
        expect(new Set(idx).size).toBe(SLOTS.length);
      }
    }
  });

  // The bug the user actually saw: John 10:10 at 17:30, 18:30, 19:30, 20:30,
  // 21:30, 22:30 — six in a row, identical.
  it('never repeats a verse in consecutive slots', () => {
    for (const pool of [30, 90, 365]) {
      for (let day = 0; day < 30; day++) {
        for (let s = 1; s < SLOTS.length; s++) {
          expect(slotIndex(day, s, pool)).not.toBe(slotIndex(day, s - 1, pool));
        }
      }
    }
  });

  // Re-syncs happen constantly (foreground, settings change, language switch).
  // If the mapping weren't deterministic, every re-sync would reshuffle what's
  // already queued and the user could see the same verse twice anyway.
  it('is deterministic — the same day+slot always resolves to the same verse', () => {
    for (const [day, slot, pool] of [[5, 3, 90], [0, 0, 30], [364, 7, 365]] as const) {
      const a = slotIndex(day, slot, pool);
      const b = slotIndex(day, slot, pool);
      expect(a).toBe(b);
    }
  });

  it('advances every slot when the day rolls over', () => {
    const pool = 90;
    for (const s of SLOTS) {
      expect(slotIndex(1, s, pool)).not.toBe(slotIndex(0, s, pool));
    }
  });

  it('stays in range for any pool size', () => {
    for (const pool of [1, 2, 7, 8, 14, 90]) {
      for (let day = 0; day < 20; day++) {
        for (const s of SLOTS) {
          const i = slotIndex(day, s, pool);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(pool);
        }
      }
    }
  });

  // A pool that is a multiple of the stride collapses slots onto each other —
  // 7 verses × stride 7 means every slot lands on the same index. The shipped
  // libraries are far larger, but this documents the constraint so nobody
  // "tidies" the stride into something that shares a factor with the pool.
  it('documents the degenerate case: pool size divisible by the stride', () => {
    const idx = SLOTS.map(s => slotIndex(0, s, 7));
    expect(new Set(idx).size).toBe(1);   // all identical — the failure mode to avoid
  });
});
