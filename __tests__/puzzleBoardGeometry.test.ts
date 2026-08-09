// Where the puzzle pieces actually sit on the board.
//
// WHY THIS FILE EXISTS. `tileRect` shipped returning tile INDICES (0 or 1)
// where every caller multiplied by the full board width — so each offset came
// out 2x too large and `overflow: 'hidden'` silently ate tiles 1, 2 and 3. On
// all 33 paintings only the top-left quarter was ever washed or locked, the
// other three quarters showed at full colour unearned, and the fresh-tile ring
// and reveal beat played off-canvas for three sets in every four. Nothing
// caught it: tsc sees `number` everywhere, and PuzzleBoard is a component this
// repo's node-environment jest cannot render.
//
// The geometry therefore moved into state/quizProgress.ts, where the rest of the
// tile model already lives. The component renders; the arithmetic is testable.

import { tileRect, TILES_PER_PAINTING } from '../src/state/quizProgress';
import { LAST_ART_TILES } from '../src/constants/quizArt';

/** Board sizes across the range the app actually renders at. */
const BOARDS: Array<[number, number]> = [
  [345, 240],   // iPhone SE, width - 30
  [360, 250],
  [400, 279],   // Pro Max
  [153, 107],   // collection grid thumbnail
  [1, 1],       // degenerate, must not produce NaN
];

const LAYOUTS = [TILES_PER_PAINTING, LAST_ART_TILES];   // 4 and 2 — the real shipped shapes

describe('tileRect', () => {
  it('returns FRACTIONS, never indices', () => {
    // The whole bug in one assertion: every field must be inside 0..1, so that
    // `fx * w` is a position rather than a multiple of the board.
    for (const count of LAYOUTS) {
      for (let i = 0; i < count; i += 1) {
        const r = tileRect(i, count);
        for (const [k, v] of Object.entries(r)) {
          expect(`${count}:${i}:${k}:${v >= 0 && v <= 1}`).toBe(`${count}:${i}:${k}:true`);
        }
      }
    }
  });

  describe.each(BOARDS)('on a %ix%i board', (w, h) => {
    it.each(LAYOUTS)('keeps all %i pieces inside the board', count => {
      for (let i = 0; i < count; i += 1) {
        const { fx, fy, fw, fh } = tileRect(i, count);
        const [L, T, W, H] = [fx * w, fy * h, fw * w, fh * h];
        expect(`${i}:left:${L >= 0}`).toBe(`${i}:left:true`);
        expect(`${i}:top:${T >= 0}`).toBe(`${i}:top:true`);
        expect(`${i}:right:${L + W <= w + 1e-9}`).toBe(`${i}:right:true`);
        expect(`${i}:bottom:${T + H <= h + 1e-9}`).toBe(`${i}:bottom:true`);
        expect(`${i}:w>0:${W > 0}`).toBe(`${i}:w>0:true`);
        expect(`${i}:h>0:${H > 0}`).toBe(`${i}:h>0:true`);
      }
    });

    it.each(LAYOUTS)('tiles the board exactly with %i pieces — no gap, no overlap', count => {
      // Sum of areas === board area is necessary; pairwise non-intersection is
      // what makes it sufficient. A locked wash that overlapped its neighbour
      // would double-darken a seam; a gap would leave an unearned strip lit.
      const rects = Array.from({ length: count }, (_, i) => {
        const { fx, fy, fw, fh } = tileRect(i, count);
        return { x: fx * w, y: fy * h, w: fw * w, h: fh * h };
      });
      const area = rects.reduce((a, r) => a + r.w * r.h, 0);
      expect(Math.abs(area - w * h)).toBeLessThan(1e-6);

      for (let a = 0; a < rects.length; a += 1) {
        for (let b = a + 1; b < rects.length; b += 1) {
          const ra = rects[a]!; const rb = rects[b]!;
          const overlap = Math.max(0, Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x))
            * Math.max(0, Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y));
          expect(`${a}v${b}:${overlap}`).toBe(`${a}v${b}:0`);
        }
      }
    });
  });

  it('lays the 2x2 out left-to-right, top-to-bottom', () => {
    // Positional, matching the tile ORDINAL the reducer hands out: tile 0 is
    // top-left and tile 3 is bottom-right, so the board fills in reading order.
    expect(tileRect(0, 4)).toEqual({ fx: 0, fy: 0, fw: 0.5, fh: 0.5 });
    expect(tileRect(1, 4)).toEqual({ fx: 0.5, fy: 0, fw: 0.5, fh: 0.5 });
    expect(tileRect(2, 4)).toEqual({ fx: 0, fy: 0.5, fw: 0.5, fh: 0.5 });
    expect(tileRect(3, 4)).toEqual({ fx: 0.5, fy: 0.5, fw: 0.5, fh: 0.5 });
  });

  it('splits the diptych left/right at FULL height, never stacked', () => {
    // A diptych is a hinged pair, side by side. Stacked halves would read as a
    // 2x2 board with two quarters missing.
    expect(tileRect(0, 2)).toEqual({ fx: 0, fy: 0, fw: 0.5, fh: 1 });
    expect(tileRect(1, 2)).toEqual({ fx: 0.5, fy: 0, fw: 0.5, fh: 1 });
  });

  it('treats any count that is not 2 as the standard 2x2', () => {
    // The component clamps to 2 or 4 before calling this, but the fallback must
    // not produce a NaN rect if that ever slips.
    for (const odd of [0, 1, 3, 5, NaN]) {
      const r = tileRect(0, odd as number);
      expect(Number.isFinite(r.fx + r.fy + r.fw + r.fh)).toBe(true);
    }
  });
});
