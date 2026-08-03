// The mystery card draw.
//
// The two properties that actually matter here are (1) she cannot reroll by
// force-quitting, and (2) the pool lasts 40 draws rather than 10. Both are easy
// to break with a change that looks like a simplification.

import {
  CANDIDATES_PER_DRAW, INITIAL_CARD_PROGRESS, mulberry32,
  candidatesFor, availableIndexes, spreadFor, collectCard, grantDraw,
  drawEarnedAt, parseCardProgress, type CardProgressV1,
  INITIAL_CARD_LIKES, isLiked, toggleLike, parseCardLikes,
} from '../src/state/cardDraw';
import { MYSTERY_CARDS, MYSTERY_CARD_COUNT } from '../src/constants/mysteryCards';
import { MYSTERY_EVERY } from '../src/state/quizProgress';

const IDS = MYSTERY_CARDS.map(c => c.id);
const fresh = (): CardProgressV1 => ({ ...INITIAL_CARD_PROGRESS, collected: [] });

describe('mulberry32', () => {
  it('is deterministic and stays in [0,1)', () => {
    const a = mulberry32(99); const b = mulberry32(99);
    for (let i = 0; i < 30; i += 1) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('candidatesFor', () => {
  const all = IDS.map((_, i) => i);

  it('lays out four DISTINCT cards', () => {
    // Distinct is the point: the choice is real, so two identical faces would
    // make one of the four a decoy.
    const c = candidatesFor(0, all);
    expect(c).toHaveLength(CANDIDATES_PER_DRAW);
    expect(new Set(c).size).toBe(CANDIDATES_PER_DRAW);
  });

  it('is stable for a given draw index — she cannot reroll by force-quitting', () => {
    // THE anti-reroll property. If this ever returns something different on a
    // second call, anyone who dislikes the spread can kill the app and try
    // again, and the "choice" becomes theatre.
    for (const n of [0, 1, 7, 39, 250]) {
      expect(candidatesFor(n, all)).toEqual(candidatesFor(n, all));
    }
  });

  it('gives a different spread per draw', () => {
    expect(candidatesFor(0, all)).not.toEqual(candidatesFor(1, all));
    expect(candidatesFor(1, all)).not.toEqual(candidatesFor(2, all));
  });

  it('only ever offers cards that are actually available', () => {
    const avail = [3, 9, 14, 27, 31];
    for (const x of candidatesFor(5, avail)) expect(avail).toContain(x);
  });

  it('degrades gracefully when fewer than four are left', () => {
    expect(candidatesFor(0, [2, 5])).toHaveLength(2);
    expect(candidatesFor(0, [7])).toEqual([7]);
    expect(candidatesFor(0, [])).toEqual([]);
  });

  it('clamps a negative or non-finite draw index instead of throwing', () => {
    expect(candidatesFor(-4, all)).toEqual(candidatesFor(0, all));
    expect(candidatesFor(NaN, all)).toEqual(candidatesFor(0, all));
  });
});

describe('pool economics', () => {
  it('lasts 40 draws, not 10 — only the CHOSEN card is consumed', () => {
    // The bug this guards: consuming all four candidates per draw burns the
    // pool at 4x and caps the feature at 10 draws. Walk the whole pool and
    // assert it takes 40.
    let p = fresh();
    let draws = 0;
    while (p.collected.length < MYSTERY_CARD_COUNT && draws < 200) {
      const { candidates } = spreadFor(p, IDS);
      expect(candidates.length).toBeGreaterThan(0);
      p = collectCard(p, IDS[candidates[0]]);
      draws += 1;
    }
    expect(draws).toBe(MYSTERY_CARD_COUNT);
    expect(new Set(p.collected).size).toBe(MYSTERY_CARD_COUNT);
  });

  it('never re-offers a card she already holds, until the pool resets', () => {
    let p = fresh();
    for (let i = 0; i < 20; i += 1) {
      const { candidates } = spreadFor(p, IDS);
      for (const idx of candidates) expect(p.collected).not.toContain(IDS[idx]);
      p = collectCard(p, IDS[candidates[0]]);
    }
  });

  it('resets rather than dead-ends once everything is collected', () => {
    // A reward counter that counts down to nothing is worse than a repeat.
    const p: CardProgressV1 = { v: 1, collected: [...IDS], drawsTaken: 40, pendingDraw: true };
    const s = spreadFor(p, IDS);
    expect(s.poolExhausted).toBe(true);
    expect(s.candidates).toHaveLength(CANDIDATES_PER_DRAW);
    expect(new Set(s.candidates).size).toBe(CANDIDATES_PER_DRAW);
  });

  it('reports the pool as not exhausted while anything is left', () => {
    expect(spreadFor(fresh(), IDS).poolExhausted).toBe(false);
    const nearly: CardProgressV1 = { v: 1, collected: IDS.slice(0, 39), drawsTaken: 39, pendingDraw: true };
    expect(spreadFor(nearly, IDS).poolExhausted).toBe(false);
  });
});

describe('availableIndexes', () => {
  it('excludes what she holds', () => {
    expect(availableIndexes([IDS[0], IDS[2]], IDS)).not.toContain(0);
    expect(availableIndexes([IDS[0], IDS[2]], IDS)).not.toContain(2);
    expect(availableIndexes([IDS[0]], IDS)).toHaveLength(IDS.length - 1);
  });

  it('ignores ids that are not in the pool', () => {
    // A card removed from a later build would otherwise shrink the pool by one
    // for anyone who had collected it.
    expect(availableIndexes(['retired-card'], IDS)).toHaveLength(IDS.length);
  });
});

describe('collectCard', () => {
  it('spends the pending draw', () => {
    // Cleared HERE and nowhere else, so dismissing the overlay afterwards can
    // never hand her a second card.
    const p = collectCard(grantDraw(fresh()), IDS[3]);
    expect(p.pendingDraw).toBe(false);
    expect(p.collected).toEqual([IDS[3]]);
    expect(p.drawsTaken).toBe(1);
  });

  it('counts a repeat as a draw without duplicating the collection entry', () => {
    let p = collectCard(fresh(), IDS[1]);
    p = collectCard(p, IDS[1]);
    expect(p.collected).toEqual([IDS[1]]);
    expect(p.drawsTaken).toBe(2);
  });

  it('ignores an empty id rather than recording a blank', () => {
    const p = fresh();
    expect(collectCard(p, '')).toBe(p);
  });
});

describe('grantDraw / drawEarnedAt', () => {
  it('is idempotent — two grants do not stack two draws', () => {
    const once = grantDraw(fresh());
    expect(grantDraw(once)).toBe(once);
  });

  it('earns a draw every MYSTERY_EVERY sets, starting at the third', () => {
    expect(drawEarnedAt(1, MYSTERY_EVERY)).toBe(false);
    expect(drawEarnedAt(2, MYSTERY_EVERY)).toBe(false);
    expect(drawEarnedAt(3, MYSTERY_EVERY)).toBe(true);
    expect(drawEarnedAt(6, MYSTERY_EVERY)).toBe(true);
    expect(drawEarnedAt(7, MYSTERY_EVERY)).toBe(false);
  });

  it('never earns one at zero sets', () => {
    // 0 % 3 === 0, so a naive modulo hands a brand-new user a card before she
    // has answered anything.
    expect(drawEarnedAt(0, MYSTERY_EVERY)).toBe(false);
    expect(drawEarnedAt(-3, MYSTERY_EVERY)).toBe(false);
  });

  it('survives a zero interval instead of dividing by zero', () => {
    expect(drawEarnedAt(5, 0)).toBe(true);
  });
});

describe('parseCardProgress', () => {
  it('round-trips', () => {
    const p: CardProgressV1 = { v: 1, collected: [IDS[0], IDS[5]], drawsTaken: 4, pendingDraw: true };
    expect(parseCardProgress(JSON.stringify(p))).toEqual(p);
  });

  it('de-dupes on read', () => {
    // A cloud merge unions the arrays; a duplicate would inflate her count.
    const raw = JSON.stringify({ v: 1, collected: [IDS[0], IDS[0], IDS[1]], drawsTaken: 2, pendingDraw: false });
    expect(parseCardProgress(raw).collected).toEqual([IDS[0], IDS[1]]);
  });

  it('keeps the collection when one field is malformed', () => {
    // Never discard the whole record — losing her collection over an odd
    // integer would be indefensible.
    const raw = JSON.stringify({ v: 1, collected: [IDS[2]], drawsTaken: 'x', pendingDraw: 1 });
    const p = parseCardProgress(raw);
    expect(p.collected).toEqual([IDS[2]]);
    expect(p.drawsTaken).toBe(1);
    expect(p.pendingDraw).toBe(false);
  });

  it('never throws on garbage', () => {
    for (const raw of [null, '', 'not json', '[]', '{"v":2}', '{}']) {
      expect(parseCardProgress(raw as string | null)).toEqual(INITIAL_CARD_PROGRESS);
    }
  });
});

describe('likes', () => {
  it('toggles both ways — a mis-tap has to be recoverable', () => {
    // Analytics only ever sees a like; there is no unlike event. The CONTROL is
    // still two-way, because a heart she cannot un-tap is worse than a slightly
    // inflated like count.
    let l = toggleLike(INITIAL_CARD_LIKES, 'weary-2');
    expect(isLiked(l, 'weary-2')).toBe(true);
    l = toggleLike(l, 'weary-2');
    expect(isLiked(l, 'weary-2')).toBe(false);
  });

  it('keeps the list sorted so the cloud union merger is stable', () => {
    let l = toggleLike(INITIAL_CARD_LIKES, 'weary-2');
    l = toggleLike(l, 'alone-1');
    l = toggleLike(l, 'hopeless-4');
    expect(l.liked).toEqual([...l.liked].sort());
  });

  it('returns the same object for an empty id, so callers can skip the write', () => {
    expect(toggleLike(INITIAL_CARD_LIKES, '')).toBe(INITIAL_CARD_LIKES);
  });

  it('de-dupes and sorts on read', () => {
    const raw = JSON.stringify({ v: 1, liked: ['b', 'a', 'b', '', 7] });
    expect(parseCardLikes(raw).liked).toEqual(['a', 'b']);
  });

  it('never throws on garbage', () => {
    for (const raw of [null, '', 'not json', '{"v":2}', '{"v":1}', '{"v":1,"liked":5}']) {
      expect(parseCardLikes(raw as string | null)).toEqual(INITIAL_CARD_LIKES);
    }
  });
});
