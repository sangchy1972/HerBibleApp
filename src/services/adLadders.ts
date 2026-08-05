// Android ad-request spec v1.0 — the PURE half: unit tables, region grouping,
// layer planning and tier selection. No React Native imports, no I/O, fully
// unit-tested (__tests__/adLadders.test.ts). The runtime half (cache, cadence,
// circuit breakers) lives in services/adEngine.ts.
//
// UNITS OF MONEY — read this before touching any formula:
//   • Stored values (last3Values, ltv, …) are RAW per-impression USD revenue,
//     exactly as the paid event delivers them (e.g. 0.09). Per owner: storage
//     is always true revenue, never eCPM.
//   • Ladder floors are eCPM (per-1000, USD) — that is what AdMob's console
//     floor settings mean. So every comparison converts AT THE BOUNDARY:
//     targetEcpm = avg(last 2 raw) × 1000 × 1.3. Storage never changes scale.
//
// The three ladders (floors ascending):
//   US : splash_2..25   $40..$500 step $20   floor(n) = 40 + 20·(n−2)
//   T2 : splash_27..50  $15..$130 step $5    floor(n) = 15 + 5·(n−27)
//   WW : ww_2..25       $8..$54  step $2     floor(n) = 8 + 2·(n−2)
//
// Cross-region borrowing happens ONLY in primary selection (target above the
// local cap → borrow the US ladder). Secondary and safety net always stay on
// the local region's own units.

export type Region = 'US' | 'T2' | 'WW';

export interface AdUnit {
  /** Console name, e.g. 'HB_int_splash_6' — used verbatim in analytics. */
  name: string;
  /** Full AdMob unit id. */
  id: string;
  /** eCPM floor in USD. 0 = no floor. -1 = backend-dynamic (newbie unit). */
  floor: number;
}

const PUB = 'ca-app-pub-4656643588243987';
const u = (name: string, suffix: string, floor: number): AdUnit =>
  ({ name, id: `${PUB}/${suffix}`, floor });

// ── Special-role units ───────────────────────────────────────────────────────
/** New-user route 1, always requested while the user is "new". Floor is
 *  AdMob's Optimized Floor: High — backend-dynamic, invisible to the client. */
export const NEWBIE_UNIT = u('HB_newbie_splash_text_00', '5004598985', -1);
export const SPLASH_0 = u('HB_int_splash_0', '3482477831', 0);
export const WW_0 = u('HB_int_splash_ww_0', '5238876625', 0);

/** New-user route 2 — the probe layer, by region. */
export const PROBE_UNIT: Record<Region, AdUnit> = {
  US: u('HB_int_splash_1', '7490462459', 300),
  T2: u('HB_int_splash_26', '9566739108', 100),
  WW: u('HB_int_splash_ww_1', '5585139793', 80),
};

// Safety nets differ between the new-user flow and the ladder (old-user) flow
// — per owner 2026-08-05, OVERRIDING the spec document's appendix:
//   new-user route 3:  US → splash_0, T2 → splash_0, WW → ww_0
//   ladder no-floor:   US → splash_0, T2 → ww_0,     WW → ww_0
export const NEW_USER_NET: Record<Region, AdUnit> = { US: SPLASH_0, T2: SPLASH_0, WW: WW_0 };
export const LADDER_NO_FLOOR: Record<Region, AdUnit> = { US: SPLASH_0, T2: WW_0, WW: WW_0 };

// ── Ladders ──────────────────────────────────────────────────────────────────
const US_SUFFIX = [
  '8088924338', '7843861841', '1388088535', '8847472238', '4806634966', '6221308891',
  '7458368943', '1854992392', '5010783513', '5418399088', '3697701843', '4105317418',
  '2792235742', '2903494925', '8375313451', '5749150119', '9085759893', '3192902443',
  '9305251745', '3496154776', '6132714959', '1879820771', '7992170076', '6679088408',
];
export const US_LADDER: AdUnit[] = US_SUFFIX.map((s, i) =>
  u(`HB_int_splash_${i + 2}`, s, 40 + 20 * i));

const T2_SUFFIX = [
  '4843684014', '7772678223', '8253657434', '5757989054', '4444907382', '8326019051',
  '5699855717', '1808712167', '9342788494', '9747901613', '8182548821', '6716625158',
  '5403543481', '4195202351', '6821365693', '9804576084', '8205800793', '2352471790',
  '8726308456', '7413226788', '4787063445', '6898221465', '9374165395', '3473981778',
];
export const T2_LADDER: AdUnit[] = T2_SUFFIX.map((s, i) =>
  u(`HB_int_splash_${i + 27}`, s, 15 + 5 * i));

const WW_SUFFIX = [
  '2160900103', '8975388760', '3330829744', '7338623447', '5833970087', '1703153382',
  '5259255019', '6189193304', '2142137082', '2456731776', '6617789907', '8047969801',
  '5039763161', '4987792275', '1048547265', '2222028135', '9052381551', '8212721413',
  '5586558079', '1647313066', '8021149729', '4193585350', '1455741370', '5203414691',
];
export const WW_LADDER: AdUnit[] = WW_SUFFIX.map((s, i) =>
  u(`HB_int_splash_ww_${i + 2}`, s, 8 + 2 * i));

export const LADDERS: Record<Region, AdUnit[]> = { US: US_LADDER, T2: T2_LADDER, WW: WW_LADDER };

// ── Region grouping ──────────────────────────────────────────────────────────
// T2 = Europe (UN M49 "Europe") + Australia / New Zealand. Deliberately absent:
// TR, CY, GE/AM/AZ, KZ — UN files them under Asia, and the safe failure
// direction is DOWN (an uncertain country lands in WW's cheaper ladder, never
// in a pricier one it can't fill).
export const T2_COUNTRIES: ReadonlySet<string> = new Set([
  'AD', 'AL', 'AT', 'AX', 'BA', 'BE', 'BG', 'BY', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FO', 'FR', 'GB', 'GG', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LI', 'LT',
  'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE',
  'SI', 'SJ', 'SK', 'SM', 'UA', 'VA', 'XK',
  'AU', 'NZ',
]);

/** Pure classifier — the runtime feeds it isUsUser() + deviceRegion(). */
export function classifyRegion(isUs: boolean, countryIso: string | null): Region {
  if (isUs) return 'US';
  if (countryIso && T2_COUNTRIES.has(countryIso.toUpperCase())) return 'T2';
  return 'WW';
}

// ── Tier selection (spec §④, with the owner's worked examples as tests) ─────
export interface PrimaryPick { primary: AdUnit; alsoRequest?: AdUnit }

/**
 * Primary = the LOWEST local tier whose floor ≥ targetEcpm.
 *  • below the local bottom → bottom tier + the region's no-floor unit;
 *  • above the local cap → US: stay on splash_25; T2/WW: borrow the US ladder
 *    (lowest US tier ≥ target), and past $500 everyone caps at splash_25.
 */
export function pickPrimary(region: Region, targetEcpm: number): PrimaryPick {
  const ladder = LADDERS[region];
  if (targetEcpm < ladder[0].floor) {
    return { primary: ladder[0], alsoRequest: LADDER_NO_FLOOR[region] };
  }
  const hit = ladder.find(t => t.floor >= targetEcpm);
  if (hit) return { primary: hit };
  if (region === 'US') return { primary: US_LADDER[US_LADDER.length - 1] };
  const usHit = US_LADDER.find(t => t.floor >= targetEcpm);
  return { primary: usHit ?? US_LADDER[US_LADDER.length - 1] };
}

/**
 * Secondary = one tier BELOW the tier the last shown value sits in (tierOf =
 * highest local tier with floor ≤ lastEcpm). At or below the bottom tier →
 * the region's no-floor unit. Above the cap → capped at the top, then −1.
 * Never borrows across regions.
 */
export function pickSecondary(region: Region, lastEcpm: number): AdUnit {
  const ladder = LADDERS[region];
  let idx = -1;
  for (let i = ladder.length - 1; i >= 0; i -= 1) {
    if (ladder[i].floor <= lastEcpm) { idx = i; break; }
  }
  if (idx <= 0) return LADDER_NO_FLOOR[region];
  return ladder[idx - 1];
}

// ── Layer planning (the blended new/old composition, per owner Q12) ─────────
// newbie runs while (dayIndex ≤ 2 OR imps < 2); it exits only when
// dayIndex ≥ 3 AND imps ≥ 2. The ladder starts as soon as 2 values exist —
// target needs avg(last 2) — regardless of day. The probe runs only while
// imps < 2. So:
//   imps < 2             → newbie + probe + net(always-on, NEW_USER_NET)
//   imps ≥ 2 ∧ day ≤ 2   → newbie + primary + secondary + net(cache-0 only)
//   imps ≥ 2 ∧ day ≥ 3   → primary + secondary + net(cache-0 only)
export interface LayerPlan {
  newbie: boolean;
  probe: AdUnit | null;
  primary: AdUnit | null;
  secondary: AdUnit | null;
  /** The no-floor unit requested ALONGSIDE the bottom tier when target is
   *  below the local minimum (spec §④ ①). */
  extraNoFloor: AdUnit | null;
  net: AdUnit;
  /** true → route-3 style, always requesting; false → only while cache = 0. */
  netAlwaysOn: boolean;
}

export function planLayers(
  region: Region, dayIndex: number, imps: number, last3: readonly number[],
): LayerPlan {
  const ladderActive = imps >= 2 && last3.length >= 2;
  const newbie = dayIndex <= 2 || imps < 2;
  if (!ladderActive) {
    return {
      newbie: true, probe: PROBE_UNIT[region],
      primary: null, secondary: null, extraNoFloor: null,
      net: NEW_USER_NET[region], netAlwaysOn: true,
    };
  }
  const last2 = last3.slice(-2);
  const targetEcpm = ((last2[0] + last2[1]) / 2) * 1000 * 1.3;
  const lastEcpm = last3[last3.length - 1] * 1000;
  const { primary, alsoRequest } = pickPrimary(region, targetEcpm);
  return {
    newbie,
    probe: null,
    primary,
    secondary: pickSecondary(region, lastEcpm),
    extraNoFloor: alsoRequest ?? null,
    net: LADDER_NO_FLOOR[region],
    netAlwaysOn: false,
  };
}

/**
 * Show / keep / cancel priority (per owner Q10): highest floor first, no-floor
 * always last. The newbie unit's floor is backend-dynamic (-1 in the table),
 * so it slots between real-floored tiers and the no-floor nets: any explicit
 * floor beats it, and it beats a no-floor unit.
 */
export function priorityOf(unit: Pick<AdUnit, 'floor'>): number {
  if (unit.floor > 0) return unit.floor;
  if (unit.floor === -1) return 0.5;      // newbie
  return 0;                               // no-floor nets
}
