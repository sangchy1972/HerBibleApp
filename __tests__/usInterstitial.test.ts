import {
  startIndexFromValue,
  makeWindow,
  climbWindow,
  descendBoth,
  descendOne,
  floorOf,
  netBackoffBase,
  unit0BackoffBase,
  ladderRetryBase,
  isNetworkError,
} from '../src/services/usInterstitial';

describe('US interstitial — value routing (spec §1)', () => {
  it('maps V to the tier just above it (lo = ⌊V/20⌋+1)', () => {
    expect(startIndexFromValue(200)).toBe(11);  // → $220 / $240
    expect(startIndexFromValue(85)).toBe(5);    // → $100 / $120
    expect(startIndexFromValue(160)).toBe(9);   // → $180 / $200 (yesterday avg3 example)
  });

  it('clamps the low end to unit2 ($40)', () => {
    expect(startIndexFromValue(0)).toBe(2);
    expect(startIndexFromValue(30)).toBe(2);
    expect(startIndexFromValue(39.99)).toBe(2);
    expect(startIndexFromValue(40)).toBe(3);    // band boundary → $60 main tier
  });

  it('caps the high end at unit25 ($500)', () => {
    expect(startIndexFromValue(480)).toBe(25);
    expect(startIndexFromValue(500)).toBe(25);
    expect(startIndexFromValue(99999)).toBe(25);
  });
});

describe('US interstitial — window construction', () => {
  it('builds a 2-tier window, collapsing hi at the cap', () => {
    expect(makeWindow(11)).toEqual({ lo: 11, hi: 12 });
    expect(makeWindow(24)).toEqual({ lo: 24, hi: 25 });
    expect(makeWindow(25)).toEqual({ lo: 25, hi: null });
    expect(makeWindow(1)).toEqual({ lo: 2, hi: 3 });   // clamp up
  });
});

describe('US interstitial — window movement (spec §6)', () => {
  it('climbs one tier when the top fills', () => {
    expect(climbWindow({ lo: 11, hi: 12 })).toEqual({ lo: 12, hi: 13 });
    expect(climbWindow({ lo: 24, hi: 25 })).toEqual({ lo: 25, hi: null });
    expect(climbWindow({ lo: 25, hi: null })).toEqual({ lo: 25, hi: null }); // stays at cap
  });

  it('descends two tiers when both no-fill 3× ($220/$240 → $180/$200)', () => {
    expect(descendBoth({ lo: 11, hi: 12 })).toEqual({ lo: 9, hi: 10 });
    expect(descendBoth({ lo: 3, hi: 4 })).toEqual({ lo: 2, hi: 3 });        // clamp at floor
  });

  it('descends one tier when the top fails but the floor holds', () => {
    expect(descendOne({ lo: 11, hi: 12 })).toEqual({ lo: 10, hi: 11 });
    expect(descendOne({ lo: 2, hi: 3 })).toEqual({ lo: 2, hi: 3 });         // clamp at floor
  });
});

describe('US interstitial — ladder floors', () => {
  it('matches the spreadsheet floors', () => {
    expect(floorOf(0)).toBe(0);     // no floor
    expect(floorOf(1)).toBe(300);   // new-user probe
    expect(floorOf(2)).toBe(40);
    expect(floorOf(11)).toBe(220);
    expect(floorOf(25)).toBe(500);
  });

  it('routes each xlsx value band to the correct main tier', () => {
    // (V band lower bound) → main tier index from the routing sheet
    const bands: Array<[number, number]> = [
      [0, 2], [40, 3], [60, 4], [80, 5], [100, 6], [180, 10], [200, 11], [480, 25],
    ];
    for (const [v, idx] of bands) expect(startIndexFromValue(v)).toBe(idx);
  });
});

describe('US interstitial — backoff schedules (spec §5)', () => {
  it('network backoff is exponential, capped at 60s', () => {
    expect(netBackoffBase(1)).toBe(5000);
    expect(netBackoffBase(2)).toBe(10000);
    expect(netBackoffBase(3)).toBe(20000);
    expect(netBackoffBase(4)).toBe(40000);
    expect(netBackoffBase(5)).toBe(60000);   // cap
    expect(netBackoffBase(9)).toBe(60000);   // stays capped
  });

  it('unit0 safety-net backoff is capped at 10s', () => {
    expect(unit0BackoffBase(1)).toBe(3000);
    expect(unit0BackoffBase(2)).toBe(6000);
    expect(unit0BackoffBase(3)).toBe(10000); // min(12000, 10000)
    expect(unit0BackoffBase(8)).toBe(10000); // stays capped
  });

  it('ladder real-no-fill retry spacing is 2s then 4s', () => {
    expect(ladderRetryBase(1)).toBe(2000);
    expect(ladderRetryBase(2)).toBe(4000);
  });
});

describe('US interstitial — network vs no-fill classification', () => {
  it('treats network/timeout codes as network errors', () => {
    expect(isNetworkError({ code: 'googleMobileAds/network-error' })).toBe(true);
    expect(isNetworkError({ code: 'ERROR_CODE_NETWORK_ERROR' })).toBe(true);
    expect(isNetworkError({ message: 'Request timeout' })).toBe(true);
  });

  it('treats no-fill / other codes as NOT network errors (counts toward window)', () => {
    expect(isNetworkError({ code: 'googleMobileAds/no-fill' })).toBe(false);
    expect(isNetworkError({ code: 'internal-error' })).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});
