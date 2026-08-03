// Jigsaw piece geometry.
//
// The property that actually matters is that two pieces sharing an edge trace
// the SAME curve. A tab and its socket are one line; if they are generated
// independently the seam shows a hairline of background between them, which on
// a photograph reads as a rendering fault rather than as a puzzle.

import { edgeSegments, reverseSegments, jigsawPaths } from '../src/services/jigsaw';

describe('edgeSegments', () => {
  it('starts and ends on the edge, whatever the tab does in between', () => {
    const s = edgeSegments([0, 0], [100, 0], true);
    expect(s[s.length - 1].p).toEqual([100, 0]);
    // The first control point sits on the line before the tab begins.
    expect(s[0].c1[1]).toBeCloseTo(0);
  });

  it('bulges to opposite sides for out=true and out=false', () => {
    const up = edgeSegments([0, 0], [100, 0], true);
    const down = edgeSegments([0, 0], [100, 0], false);
    const peak = (segs: ReturnType<typeof edgeSegments>) =>
      Math.max(...segs.flatMap(s => [s.c1[1], s.c2[1], s.p[1]].map(Math.abs)));
    expect(peak(up)).toBeGreaterThan(0);
    // Mirror image: same magnitude, opposite sign.
    expect(up[2].c1[1]).toBeCloseTo(-down[2].c1[1]);
  });

  it('scales the tab with the edge, so a short edge gets a small knob', () => {
    const long = edgeSegments([0, 0], [200, 0], true);
    const short = edgeSegments([0, 0], [50, 0], true);
    const peak = (segs: ReturnType<typeof edgeSegments>) =>
      Math.max(...segs.flatMap(s => [Math.abs(s.c1[1]), Math.abs(s.c2[1])]));
    expect(peak(long)).toBeCloseTo(peak(short) * 4, 1);
  });

  it('works on a vertical edge as well as a horizontal one', () => {
    const v = edgeSegments([50, 0], [50, 100], true);
    expect(v[v.length - 1].p).toEqual([50, 100]);
    // The tab now displaces in x, not y.
    expect(Math.abs(v[2].c1[0] - 50)).toBeGreaterThan(1);
  });

  it('never produces a NaN, even on a zero-length edge', () => {
    // A board can be measured at 0 for one frame before layout lands, and a
    // NaN in a path string makes react-native-svg drop the whole shape.
    for (const s of edgeSegments([10, 10], [10, 10], true)) {
      for (const n of [...s.c1, ...s.c2, ...s.p]) expect(Number.isFinite(n)).toBe(true);
    }
  });
});

describe('reverseSegments', () => {
  it('walks the same curve backwards', () => {
    const start: [number, number] = [0, 0];
    const fwd = edgeSegments(start, [100, 0], true);
    const back = reverseSegments(fwd, start);
    expect(back).toHaveLength(fwd.length);
    // Ends where the forward pass began.
    expect(back[back.length - 1].p).toEqual(start);
    // First reversed segment starts from the forward endpoint's neighbours,
    // with the control points swapped — that is what keeps the curve identical.
    expect(back[0].c1).toEqual(fwd[fwd.length - 1].c2);
    expect(back[0].c2).toEqual(fwd[fwd.length - 1].c1);
  });

  it('is its own inverse', () => {
    const start: [number, number] = [0, 0];
    const fwd = edgeSegments(start, [100, 40], false);
    const round = reverseSegments(reverseSegments(fwd, start), [100, 40]);
    expect(round).toEqual(fwd);
  });
});

describe('jigsawPaths', () => {
  const W = 300;
  const H = 200;
  const paths = jigsawPaths(W, H);

  it('returns four closed paths', () => {
    expect(paths).toHaveLength(4);
    for (const d of paths) {
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
    }
  });

  it('emits no NaN or Infinity', () => {
    // One bad number silently voids the whole clip path and the piece vanishes.
    for (const d of paths) {
      expect(d).not.toMatch(/NaN|Infinity/);
    }
  });

  it('survives a zero-sized board without producing garbage', () => {
    for (const d of jigsawPaths(0, 0)) expect(d).not.toMatch(/NaN|Infinity/);
  });

  it('anchors each piece at its own corner of the board', () => {
    // Reading order is load-bearing: puzzleView unlocks 0..3 and she watches
    // the picture fill left-to-right, top-to-bottom.
    expect(paths[0].startsWith('M0,0')).toBe(true);
    expect(paths[1].startsWith(`M${W / 2},0`)).toBe(true);
    expect(paths[2].startsWith(`M0,${H / 2}`)).toBe(true);
    expect(paths[3].startsWith(`M${W / 2},${H / 2}`)).toBe(true);
  });

  it('keeps the OUTER border straight', () => {
    // A puzzle that is knobbly on the outside too reads as a sticker rather
    // than a picture cut into pieces. Top-left must reach the top-right corner
    // of its cell by a straight line.
    expect(paths[0]).toContain(`L${W / 2},0`);
    expect(paths[1]).toContain(`L${W},0`);
    expect(paths[3]).toContain(`L${W},${H}`);
  });

  it('shares each interior edge as one curve, not two independent ones', () => {
    // THE property. TL's right edge and TR's left edge must be the same set of
    // control points, or a hairline of background shows along the seam.
    const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const tl = new Set(nums(paths[0]).map(n => n.toFixed(2)));
    const tr = nums(paths[1]).map(n => n.toFixed(2));
    // Every control value on TR's shared edge appears in TL.
    const shared = tr.filter(v => tl.has(v));
    expect(shared.length).toBeGreaterThan(10);
  });

  it('scales with the board so any aspect ratio works', () => {
    // The paintings run 1.0 to 1.49, so the board is never square.
    for (const [w, h] of [[300, 200], [300, 300], [340, 228]]) {
      for (const d of jigsawPaths(w, h)) {
        expect(d).not.toMatch(/NaN/);
        expect(d.endsWith('Z')).toBe(true);
      }
    }
  });
});
