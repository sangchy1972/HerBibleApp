// Jigsaw piece geometry — pure SVG path maths.
//
// PURE: no React, no react-native-svg, no image. It takes a box and returns
// four `d` strings. Same split as quizSets.ts vs the components, and the reason
// the shapes are unit-testable in this repo's node-environment jest.
//
// THE SHAPE
// =========
// A 2x2 board has exactly four interior half-edges, and each is shared by two
// pieces:
//
//     +-----+-----+        A: TL|TR, vertical, top half
//     | TL  A TR  |        B: BL|BR, vertical, bottom half
//     +--C--+--D--+        C: TL|BL, horizontal, left half
//     | BL  B BR  |        D: TR|BR, horizontal, right half
//     +-----+-----+
//
// Each carries one tab. The two pieces sharing an edge must trace the SAME
// curve — a tab and its socket are one line, not two shapes that happen to
// look complementary. So every shared edge is generated once, in a canonical
// direction, and the piece that walks it backwards gets the reversed segment
// list. Generating it twice with a flipped normal would produce two curves
// that differ by a rounding error, and the seam would show a hairline gap.
//
// The outer border stays straight: a puzzle whose outside edge is also knobbly
// reads as a sticker, not as a picture cut into pieces.

export interface Seg {
  /** Cubic control points and endpoint, absolute. */
  c1: [number, number];
  c2: [number, number];
  p: [number, number];
}

/** Fraction of the edge length the tab sticks out. Bigger reads as a toy. */
const TAB = 0.19;

/**
 * One shared edge as a list of cubic segments, from `from` to `to`.
 *
 * `out` picks which side the tab bulges toward — the LEFT of the direction of
 * travel when true. Callers pass a fixed value per edge so the four pieces
 * interlock rather than all bulging the same way.
 */
export function edgeSegments(
  from: [number, number],
  to: [number, number],
  out: boolean,
): Seg[] {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Left normal. Flipping `out` mirrors the tab through the edge.
  const s = out ? 1 : -1;
  const nx = -uy * s;
  const ny = ux * s;

  /** Point at `a` along the edge, offset `b` (both as fractions of length). */
  const P = (a: number, b: number): [number, number] => [
    x0 + ux * len * a + nx * len * b,
    y0 + uy * len * a + ny * len * b,
  ];

  const k = TAB / 0.3;   // nominal scale. The bulb's cubic actually peaks at
                       // 0.335, so the true protrusion is ~0.212 of the edge,
                       // not TAB. Frozen: changing it reshapes every board.
  const o = (b: number) => b * k;

  return [
    // Approach, then the neck out to the bulb, the bulb, and the neck back.
    { c1: P(0.20, 0), c2: P(0.30, 0), p: P(0.38, 0) },
    { c1: P(0.36, o(0.06)), c2: P(0.29, o(0.16)), p: P(0.33, o(0.26)) },
    { c1: P(0.37, o(0.36)), c2: P(0.63, o(0.36)), p: P(0.67, o(0.26)) },
    { c1: P(0.71, o(0.16)), c2: P(0.64, o(0.06)), p: P(0.62, 0) },
    { c1: P(0.70, 0), c2: P(0.80, 0), p: P(1, 0) },
  ];
}

/** Walk a segment list backwards — control points swap, endpoints shift. */
export function reverseSegments(segs: Seg[], start: [number, number]): Seg[] {
  const out: Seg[] = [];
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const prev = i === 0 ? start : segs[i - 1].p;
    out.push({ c1: segs[i].c2, c2: segs[i].c1, p: prev });
  }
  return out;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const cubic = (s: Seg) => `C${fmt(s.c1[0])},${fmt(s.c1[1])} ${fmt(s.c2[0])},${fmt(s.c2[1])} ${fmt(s.p[0])},${fmt(s.p[1])}`;

function path(start: [number, number], parts: Array<Seg[] | [number, number]>): string {
  let d = `M${fmt(start[0])},${fmt(start[1])}`;
  for (const part of parts) {
    if (Array.isArray(part) && typeof part[0] === 'number') {
      const [x, y] = part as [number, number];
      d += `L${fmt(x)},${fmt(y)}`;
    } else {
      for (const s of part as Seg[]) d += cubic(s);
    }
  }
  return `${d}Z`;
}

/**
 * The four piece outlines for a `w` x `h` board, in reading order:
 * top-left, top-right, bottom-left, bottom-right.
 *
 * Index order matters and is load-bearing: `puzzleView` unlocks tiles 0..3 in
 * this order, so a user watches the picture fill left-to-right, top-to-bottom.
 */
export function jigsawPaths(w: number, h: number): [string, string, string, string] {
  const cx = w / 2;
  const cy = h / 2;

  // Canonical directions: A and B run downward, C and D run rightward.
  // The `out` flags alternate along each axis, so the two halves of the centre
  // line bulge opposite ways and the board does not read as striped.
  const A = edgeSegments([cx, 0], [cx, cy], true);     // tab bulges into TL
  const B = edgeSegments([cx, cy], [cx, h], false);    // ...into BR
  const C = edgeSegments([0, cy], [cx, cy], false);    // ...into TL
  const D = edgeSegments([cx, cy], [w, cy], true);     // ...into BR

  const tl = path([0, 0], [
    [cx, 0] as [number, number],
    A,
    reverseSegments(C, [0, cy]),
    [0, 0] as [number, number],
  ]);

  const tr = path([cx, 0], [
    [w, 0] as [number, number],
    [w, cy] as [number, number],
    reverseSegments(D, [cx, cy]),
    reverseSegments(A, [cx, 0]),
  ]);

  const bl = path([0, cy], [
    C,
    B,
    [0, h] as [number, number],
    [0, cy] as [number, number],
  ]);

  const br = path([cx, cy], [
    D,
    [w, h] as [number, number],
    [cx, h] as [number, number],
    reverseSegments(B, [cx, cy]),
  ]);

  return [tl, tr, bl, br];
}
