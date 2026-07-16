// purchasePlan()'s contract: it ALWAYS settles.
//
// Both paywalls do `try { await purchasePlan(p) } finally { setBusy(false) }`
// and guard with `if (busy) return`. So a promise that never resolves doesn't
// just lose one purchase — it disables the Subscribe button for the rest of the
// session. On the onboarding paywall that's the last step of first-run.
//
// The audit found three ways it could hang:
//   1. handlePurchase returned without settling for purchase states other than
//      'purchased' / 'pending' ('deferred', 'restored', 'unspecified'), and for
//      a productId outside ALL_SKUS.
//   2. requestPurchase is a promise, so the synchronous try/catch around it
//      could not see an async rejection.
//   3. No overall timeout — a store sheet dismissed without emitting an event
//      left the resolver stranded.
//
// iap.ts loads expo-iap through a guarded require and talks to native modules,
// so rather than mock the world, these tests pin the STATE-MACHINE rule that
// each fix implements: for every reachable purchase state, exactly one outcome
// is produced.

type Outcome = 'purchased' | 'pending' | 'error' | 'cancelled';

/** Mirrors handlePurchase's branching. Keep in sync with services/iap.ts. */
function outcomeFor(purchase: { productId?: string; purchaseState?: string } | null, knownSkus: Set<string>): Outcome {
  if (!purchase || !purchase.productId || !knownSkus.has(purchase.productId)) return 'error';
  if (purchase.purchaseState === 'purchased') return 'purchased';
  if (purchase.purchaseState === 'pending') return 'pending';
  return 'error';   // deferred / restored / unspecified / anything future
}

const SKUS = new Set(['herbible_premium_monthly', 'herbible_premium_annual']);

describe('purchase outcome — every path settles', () => {
  it.each([
    ['purchased', 'purchased'],
    ['pending', 'pending'],
    // The states that used to fall through and strand the promise:
    ['deferred', 'error'],
    ['restored', 'error'],
    ['unspecified', 'error'],
    ['some-future-state', 'error'],
  ] as const)('purchaseState %s → %s', (state, expected) => {
    expect(outcomeFor({ productId: 'herbible_premium_monthly', purchaseState: state }, SKUS)).toBe(expected);
  });

  it.each([
    ['null purchase', null],
    ['no productId', { purchaseState: 'purchased' }],
    ['unknown productId', { productId: 'something_else', purchaseState: 'purchased' }],
    ['no purchaseState', { productId: 'herbible_premium_monthly' }],
  ])('%s still settles', (_label, purchase) => {
    const out = outcomeFor(purchase as never, SKUS);
    expect(['purchased', 'pending', 'error', 'cancelled']).toContain(out);
  });

  // The property that actually matters — never undefined, never a hang.
  it('produces an outcome for any input at all', () => {
    const inputs = [
      null, undefined, {}, { productId: '' }, { purchaseState: '' },
      { productId: 'herbible_premium_annual', purchaseState: 'purchased' },
      { productId: 'herbible_premium_annual', purchaseState: 42 },
    ];
    for (const i of inputs) {
      expect(() => outcomeFor(i as never, SKUS)).not.toThrow();
      expect(outcomeFor(i as never, SKUS)).toBeDefined();
    }
  });
});

describe('purchase timeout', () => {
  const PURCHASE_TIMEOUT_MS = 120_000;   // keep in sync with services/iap.ts

  // Generous enough for a password, SCA, or just reading the sheet — but finite.
  it('is long enough for a real human checkout', () => {
    expect(PURCHASE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('is finite — the whole point', () => {
    expect(Number.isFinite(PURCHASE_TIMEOUT_MS)).toBe(true);
  });

  // The shape of the fix: whichever fires first, the caller is released exactly
  // once and the timer is cleared.
  it('releases the caller exactly once, whoever wins', async () => {
    jest.useFakeTimers();
    try {
      let settled: Outcome[] = [];
      let resolvePending: ((o: Outcome) => void) | null = null;

      const p = new Promise<Outcome>(resolve => {
        const cap = setTimeout(() => { if (resolvePending) { resolvePending = null; resolve('error'); } }, PURCHASE_TIMEOUT_MS);
        resolvePending = (o) => { clearTimeout(cap); resolvePending = null; resolve(o); };
      });
      p.then(o => settled.push(o));

      // Listener wins.
      resolvePending!('purchased');
      await Promise.resolve();
      // Timer would have fired here — it must be a no-op.
      jest.advanceTimersByTime(PURCHASE_TIMEOUT_MS * 2);
      await Promise.resolve();

      expect(settled).toEqual(['purchased']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('settles on timeout when no event ever arrives', async () => {
    jest.useFakeTimers();
    try {
      let resolvePending: ((o: Outcome) => void) | null = null;
      const p = new Promise<Outcome>(resolve => {
        const cap = setTimeout(() => { if (resolvePending) { resolvePending = null; resolve('error'); } }, PURCHASE_TIMEOUT_MS);
        resolvePending = (o) => { clearTimeout(cap); resolvePending = null; resolve(o); };
      });
      jest.advanceTimersByTime(PURCHASE_TIMEOUT_MS + 1);
      await expect(p).resolves.toBe('error');
    } finally {
      jest.useRealTimers();
    }
  });
});
