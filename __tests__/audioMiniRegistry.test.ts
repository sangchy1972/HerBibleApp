// AudioMini player-registry ordering (state/AudioMiniContext).
//
// WHY THIS EXISTS
// ───────────────
// Crashlytics, 1.0.0 (19): a FATAL JavascriptException —
//   "The 1st argument cannot be cast to type expo.modules.audio.AudioPlayer
//    (received class java.lang.Integer)
//    → Caused by: Cannot use shared object that was already released"
//   at PlayingProbe ← AudioMiniHost
//
// expo-audio's useAudioPlayer holds the player in `useReleasingSharedObject`,
// so changing the source RELEASES the previous native object. BibleScreen
// changes the source on every chapter, book and translation change. The floating
// pill renders the player it got from THIS registry, and if the registry is a
// render behind, the pill calls useAudioPlayerStatus on a player whose native
// half is already gone — `player.currentStatus` throws and the app dies.
//
// The registry's job is therefore to track player identity EXACTLY, with no
// render lag. This file pins that ordering contract. The real code decides
// against a ref for the same reason this harness uses a plain variable: the
// decision has to be synchronous.
//
// NOTE: the ultimate safety net is the error boundary around the probe in
// AudioMiniHost, which cannot be unit-tested here — this repo's jest setup is
// pure-logic (no React renderer, react-native is a stub). What IS testable is
// the ordering below, which is what removes the common path into that boundary.

type Player = { name: string };

/** Mirrors register/unregister/dropPlayer in state/AudioMiniContext.
 *  Keep in sync with that file. */
function makeRegistry() {
  let current: Player | null = null;
  let label: string | null = null;
  let generation = 0;

  return {
    register(p: Player, l: string) {
      if (current !== p) {
        current = p;
        generation += 1;
      }
      label = l;
    },
    unregister(p: Player) {
      if (current !== p) return;      // stale cleanup → ignore
      current = null;
      label = null;
    },
    drop() {
      current = null;
      label = null;
    },
    get state() {
      return { player: current, label, generation };
    },
  };
}

const A: Player = { name: 'John 3' };
const B: Player = { name: 'John 4' };

describe('player identity + generation', () => {
  it('bumps the generation when a different player is registered', () => {
    const r = makeRegistry();
    r.register(A, 'John 3');
    expect(r.state.generation).toBe(1);
    r.register(B, 'John 4');
    // The consumer keys its status subscription on this, so a new player must
    // produce a new generation or the probe would keep a subscription bound to
    // the released one.
    expect(r.state.generation).toBe(2);
  });

  it('does not bump on a re-register of the SAME player', () => {
    const r = makeRegistry();
    r.register(A, 'John 3');
    r.register(A, 'John 3');
    r.register(A, 'John 3');
    // BibleScreen re-registers on every render (onOpen closes over navigation).
    // Bumping here would remount the probe constantly and tear down a healthy
    // subscription several times a second.
    expect(r.state.generation).toBe(1);
  });

  it('tracks a label change without a new generation', () => {
    const r = makeRegistry();
    r.register(A, 'John 3');
    r.register(A, 'John 3 (cont.)');
    expect(r.state.label).toBe('John 3 (cont.)');
    expect(r.state.generation).toBe(1);
  });
});

describe('chapter change — cleanup(old) then setup(new)', () => {
  it('ends up holding the NEW player', () => {
    const r = makeRegistry();
    r.register(A, 'John 3');
    // This is the order React uses when the effect's deps change.
    r.unregister(A);
    r.register(B, 'John 4');
    expect(r.state.player).toBe(B);
    expect(r.state.generation).toBe(2);
  });

  it('survives the reversed order without dropping the live player', () => {
    // If setup ever lands before cleanup, the stale cleanup must NOT wipe the
    // player that was just registered — that would strand the pill on audio
    // that is still playing, or (worse) leave a released player in place.
    const r = makeRegistry();
    r.register(A, 'John 3');
    r.register(B, 'John 4');   // setup first
    r.unregister(A);           // stale cleanup arrives late
    expect(r.state.player).toBe(B);
    expect(r.state.label).toBe('John 4');
  });

  it('ignores a duplicate unregister', () => {
    const r = makeRegistry();
    r.register(A, 'John 3');
    r.unregister(A);
    r.unregister(A);
    expect(r.state.player).toBeNull();
  });

  it('clears when the owning screen unregisters the current player', () => {
    const r = makeRegistry();
    r.register(A, 'John 3');
    r.unregister(A);
    expect(r.state.player).toBeNull();
    expect(r.state.label).toBeNull();
  });
});

describe('drop after a released-player throw', () => {
  it('forgets the player so nothing resubscribes to it', () => {
    const r = makeRegistry();
    r.register(A, 'John 3');
    r.drop();
    expect(r.state.player).toBeNull();
    expect(r.state.label).toBeNull();
  });

  it('lets the owning screen register a fresh player afterwards', () => {
    const r = makeRegistry();
    r.register(A, 'John 3');
    r.drop();
    r.register(B, 'John 4');
    expect(r.state.player).toBe(B);
    // New generation → a fresh error boundary, so one failure can't
    // permanently suppress the pill.
    expect(r.state.generation).toBe(2);
  });
});
