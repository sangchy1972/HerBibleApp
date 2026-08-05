// Android ad-request spec v1.0 — the pure selection layer, pinned test by test
// to the spec's own worked-example table plus every owner clarification from
// the 2026-08-05 Q&A. If a tier, an id or a boundary rule changes, something
// here goes red before a build does.

import {
  US_LADDER, T2_LADDER, WW_LADDER, LADDERS,
  NEWBIE_UNIT, SPLASH_0, WW_0, PROBE_UNIT, NEW_USER_NET, LADDER_NO_FLOOR,
  T2_COUNTRIES, classifyRegion, pickPrimary, pickSecondary, planLayers, priorityOf,
} from '../src/services/adLadders';

describe('ladder integrity', () => {
  it('US: splash_2..25, $40..$500 step $20', () => {
    expect(US_LADDER).toHaveLength(24);
    expect(US_LADDER[0]).toMatchObject({ name: 'HB_int_splash_2', floor: 40 });
    expect(US_LADDER[23]).toMatchObject({ name: 'HB_int_splash_25', floor: 500 });
    US_LADDER.forEach((u, i) => expect(u.floor).toBe(40 + 20 * i));
  });

  it('T2: splash_27..50, $15..$130 step $5', () => {
    expect(T2_LADDER).toHaveLength(24);
    expect(T2_LADDER[0]).toMatchObject({ name: 'HB_int_splash_27', floor: 15 });
    expect(T2_LADDER[23]).toMatchObject({ name: 'HB_int_splash_50', floor: 130 });
    T2_LADDER.forEach((u, i) => expect(u.floor).toBe(15 + 5 * i));
  });

  it('WW: ww_2..25, $8..$54 step $2', () => {
    expect(WW_LADDER).toHaveLength(24);
    expect(WW_LADDER[0]).toMatchObject({ name: 'HB_int_splash_ww_2', floor: 8 });
    expect(WW_LADDER[23]).toMatchObject({ name: 'HB_int_splash_ww_25', floor: 54 });
    WW_LADDER.forEach((u, i) => expect(u.floor).toBe(8 + 2 * i));
  });

  it('every unit id is unique and well-formed', () => {
    const all = [
      NEWBIE_UNIT, SPLASH_0, WW_0,
      ...Object.values(PROBE_UNIT), ...US_LADDER, ...T2_LADDER, ...WW_LADDER,
    ];
    const ids = all.map(u => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^ca-app-pub-4656643588243987\/\d{10}$/);
  });

  it('spot-checks ids against the spec appendix', () => {
    expect(NEWBIE_UNIT.id).toContain('5004598985');
    expect(SPLASH_0.id).toContain('3482477831');
    expect(WW_0.id).toContain('5238876625');
    expect(PROBE_UNIT.US.id).toContain('7490462459');       // splash_1 $300
    expect(PROBE_UNIT.T2.id).toContain('9566739108');       // splash_26 $100
    expect(PROBE_UNIT.WW.id).toContain('5585139793');       // ww_1 $80
    expect(US_LADDER[4].id).toContain('4806634966');        // splash_6 $120
    expect(T2_LADDER[23].id).toContain('3473981778');       // splash_50 $130
    expect(WW_LADDER[1].id).toContain('8975388760');        // ww_3 $10
  });
});

describe('region classification', () => {
  it('US wins outright', () => {
    expect(classifyRegion(true, 'DE')).toBe('US');
    expect(classifyRegion(true, null)).toBe('US');
  });
  it('T2 = Europe + AU/NZ', () => {
    for (const c of ['PT', 'DE', 'GB', 'FR', 'AU', 'NZ', 'XK', 'VA']) {
      expect(classifyRegion(false, c)).toBe('T2');
    }
  });
  it('the deliberate exclusions land in WW (the safe, cheaper direction)', () => {
    for (const c of ['TR', 'CY', 'GE', 'AM', 'AZ', 'KZ']) {
      expect(classifyRegion(false, c)).toBe('WW');
    }
  });
  it('unknown / undetectable → WW', () => {
    expect(classifyRegion(false, null)).toBe('WW');
    expect(classifyRegion(false, 'BR')).toBe('WW');
    expect(classifyRegion(false, 'JP')).toBe('WW');
  });
  it('lower-case iso still matches', () => {
    expect(classifyRegion(false, 'pt')).toBe('T2');
  });
});

// ── The spec's worked-example table, verbatim ───────────────────────────────
describe('pickPrimary / pickSecondary — spec examples', () => {
  it('US regular: last2 raw $0.10/$0.08 → target $117 eCPM → splash_6 ($120)', () => {
    const target = ((0.10 + 0.08) / 2) * 1000 * 1.3;
    expect(target).toBeCloseTo(117);
    const { primary, alsoRequest } = pickPrimary('US', target);
    expect(primary.name).toBe('HB_int_splash_6');
    expect(alsoRequest).toBeUndefined();
  });

  it('US secondary: last raw $0.08 → tierOf splash_4 ($80) → splash_3 ($60)', () => {
    expect(pickSecondary('US', 0.08 * 1000).name).toBe('HB_int_splash_3');
  });

  it('T2 over-cap borrows the US ladder: target $180 → splash_9', () => {
    const { primary } = pickPrimary('T2', 180);
    expect(primary.name).toBe('HB_int_splash_9');
    expect(primary.floor).toBe(180);
  });

  it('WW over-cap borrows the US ladder: target $60 → splash_3', () => {
    const { primary } = pickPrimary('WW', 60);
    expect(primary.name).toBe('HB_int_splash_3');
  });

  it('above the global cap: target $620 → splash_25 from any region', () => {
    expect(pickPrimary('US', 620).primary.name).toBe('HB_int_splash_25');
    expect(pickPrimary('T2', 620).primary.name).toBe('HB_int_splash_25');
    expect(pickPrimary('WW', 620).primary.name).toBe('HB_int_splash_25');
  });

  it('floor case: WW target $5 → ww_2 ($8) PLUS the no-floor unit', () => {
    const { primary, alsoRequest } = pickPrimary('WW', 5);
    expect(primary.name).toBe('HB_int_splash_ww_2');
    expect(alsoRequest?.name).toBe('HB_int_splash_ww_0');
  });

  it('secondary at the bottom tier: US last $42 → the no-floor unit', () => {
    expect(pickSecondary('US', 42).name).toBe('HB_int_splash_0');
  });

  it('secondary over the top: US last $700 → capped at splash_25 → splash_24', () => {
    expect(pickSecondary('US', 700).name).toBe('HB_int_splash_24');
  });

  it('exact-floor boundary is inclusive: target $120 → splash_6, not splash_7', () => {
    expect(pickPrimary('US', 120).primary.name).toBe('HB_int_splash_6');
  });

  it('secondary below the bottom floor → no-floor unit', () => {
    expect(pickSecondary('WW', 3).name).toBe('HB_int_splash_ww_0');
  });
});

describe('the T2 safety-net asymmetry (owner override of the spec appendix)', () => {
  it('new-user net: US/T2 → splash_0, WW → ww_0', () => {
    expect(NEW_USER_NET.US.name).toBe('HB_int_splash_0');
    expect(NEW_USER_NET.T2.name).toBe('HB_int_splash_0');
    expect(NEW_USER_NET.WW.name).toBe('HB_int_splash_ww_0');
  });
  it('ladder no-floor: US → splash_0, T2/WW → ww_0', () => {
    expect(LADDER_NO_FLOOR.US.name).toBe('HB_int_splash_0');
    expect(LADDER_NO_FLOOR.T2.name).toBe('HB_int_splash_ww_0');
    expect(LADDER_NO_FLOOR.WW.name).toBe('HB_int_splash_ww_0');
  });
  it('…and cross-region borrowing never touches the secondary or the net', () => {
    // T2 user with a huge last value: secondary caps INSIDE the T2 ladder.
    expect(pickSecondary('T2', 700).name).toBe('HB_int_splash_49');
    const plan = planLayers('T2', 5, 10, [0.2, 0.2, 0.2]);   // target $260 → US borrow
    expect(plan.primary!.name).toBe('HB_int_splash_13');      // $260, borrowed
    expect(plan.secondary!.name).toBe('HB_int_splash_49');    // T2's own ($125)
    expect(plan.net.name).toBe('HB_int_splash_ww_0');         // T2's own net
  });
});

// ── The blended layer matrix (owner Q12) ────────────────────────────────────
describe('planLayers — who requests what, when', () => {
  const last0: number[] = [];
  const last1 = [0.05];
  const last3 = [0.10, 0.10, 0.08];

  it('imps < 2 → newbie + probe + always-on net (any day)', () => {
    for (const day of [0, 2, 5, 500]) {
      for (const [imps, last] of [[0, last0], [1, last1]] as const) {
        const p = planLayers('US', day, imps, last);
        expect(p.newbie).toBe(true);
        expect(p.probe?.name).toBe('HB_int_splash_1');
        expect(p.primary).toBeNull();
        expect(p.secondary).toBeNull();
        expect(p.netAlwaysOn).toBe(true);
        expect(p.net.name).toBe('HB_int_splash_0');
      }
    }
  });

  it('imps ≥ 2, day ≤ 2 → BLENDED: newbie + ladder, probe gone, net on cache-0 only', () => {
    const p = planLayers('US', 1, 2, [0.10, 0.08]);
    expect(p.newbie).toBe(true);
    expect(p.probe).toBeNull();
    expect(p.primary!.name).toBe('HB_int_splash_6');   // target $117 → $120
    expect(p.secondary!.name).toBe('HB_int_splash_3'); // last $80 → tier−1
    expect(p.netAlwaysOn).toBe(false);
  });

  it('imps ≥ 2, day ≥ 3 → old user proper: newbie exits', () => {
    const p = planLayers('US', 3, 2, [0.10, 0.08]);
    expect(p.newbie).toBe(false);
    expect(p.primary!.name).toBe('HB_int_splash_6');
  });

  it('newbie exit boundary is day≥3 AND imps≥2 exactly', () => {
    expect(planLayers('US', 2, 99, last3).newbie).toBe(true);   // day 2 → still on
    expect(planLayers('US', 3, 1, last1).newbie).toBe(true);    // 1 imp → still on
    expect(planLayers('US', 3, 2, [0.1, 0.1]).newbie).toBe(false);
  });

  it('floor case flows through: WW old user with tiny values', () => {
    const p = planLayers('WW', 10, 5, [0.003, 0.002, 0.002]);   // target $2.6
    expect(p.primary!.name).toBe('HB_int_splash_ww_2');
    expect(p.extraNoFloor?.name).toBe('HB_int_splash_ww_0');
    expect(p.secondary!.name).toBe('HB_int_splash_ww_0');       // last $2 < bottom
  });

  it('degenerate guard: imps ≥ 2 but window short → new-user flow, never NaN', () => {
    const p = planLayers('US', 5, 7, [0.05]);
    expect(p.probe?.name).toBe('HB_int_splash_1');
    expect(p.primary).toBeNull();
  });
});

describe('priority (owner Q10: highest floor first, no-floor always last)', () => {
  it('floors > newbie > no-floor', () => {
    expect(priorityOf(US_LADDER[0])).toBeGreaterThan(priorityOf(NEWBIE_UNIT));
    expect(priorityOf(WW_LADDER[0])).toBeGreaterThan(priorityOf(NEWBIE_UNIT));
    expect(priorityOf(NEWBIE_UNIT)).toBeGreaterThan(priorityOf(SPLASH_0));
    expect(priorityOf(SPLASH_0)).toBe(priorityOf(WW_0));
  });
  it('within floors, higher floor wins', () => {
    expect(priorityOf(US_LADDER[10])).toBeGreaterThan(priorityOf(US_LADDER[2]));
    expect(priorityOf(PROBE_UNIT.US)).toBeGreaterThan(priorityOf(PROBE_UNIT.WW));
  });
});

describe('completeness self-check (spec §⑤-4)', () => {
  it('pickPrimary has a unique output for every target in [0, ∞)', () => {
    for (const region of ['US', 'T2', 'WW'] as const) {
      for (let t = 0; t <= 700; t += 1) {
        const { primary } = pickPrimary(region, t);
        expect(primary).toBeDefined();
        expect(primary.floor === 0 ? Infinity : primary.floor).toBeGreaterThan(0);
      }
    }
  });
  it('pickSecondary has a unique output for every lastValue', () => {
    for (const region of ['US', 'T2', 'WW'] as const) {
      for (let v = 0; v <= 700; v += 1) {
        expect(pickSecondary(region, v)).toBeDefined();
      }
    }
  });
  it('T2 list has no US and none of the excluded countries', () => {
    expect(T2_COUNTRIES.has('US')).toBe(false);
    for (const c of ['TR', 'CY', 'GE', 'AM', 'AZ', 'KZ']) expect(T2_COUNTRIES.has(c)).toBe(false);
    expect(T2_COUNTRIES.size).toBe(54);   // 52 Europe + AU + NZ
  });
  it('every region ladder is strictly ascending (find/findLast assumptions)', () => {
    for (const ladder of Object.values(LADDERS)) {
      for (let i = 1; i < ladder.length; i += 1) {
        expect(ladder[i].floor).toBeGreaterThan(ladder[i - 1].floor);
      }
    }
  });
});
