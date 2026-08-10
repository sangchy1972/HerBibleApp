import {
  listenGuideReason, noteListenGuideShown, noteListened, noteFlowComplete,
  LISTEN_GUIDE_DEFAULT, LISTEN_GUIDE_MAX_SHOWS, LISTEN_GUIDE_FLOW_GAP,
} from '../src/state/listenGuide';

const S = LISTEN_GUIDE_DEFAULT;

describe('listenGuideReason', () => {
  it('first-ever flow gets the guide', () => {
    expect(listenGuideReason(S, true)).toBe('first_flow');
  });

  it('a returning user does NOT get it until four flows have passed', () => {
    for (let n = 0; n < LISTEN_GUIDE_FLOW_GAP; n += 1) {
      expect(listenGuideReason({ ...S, flowsSinceListen: n }, false)).toBeNull();
    }
    expect(listenGuideReason({ ...S, flowsSinceListen: LISTEN_GUIDE_FLOW_GAP }, false)).toBe('four_flows');
  });

  it('never more than twice in a lifetime', () => {
    const twice = { ...S, shownCount: LISTEN_GUIDE_MAX_SHOWS, flowsSinceListen: 99 };
    expect(listenGuideReason(twice, false)).toBeNull();
    expect(listenGuideReason(twice, true)).toBeNull();
  });

  it('retires for good once she has listened', () => {
    const listened = { ...S, everListened: true, flowsSinceListen: 99 };
    expect(listenGuideReason(listened, false)).toBeNull();
    expect(listenGuideReason(listened, true)).toBeNull();
  });

  it('the first-flow offer can only ever be the FIRST show', () => {
    // A wiped PrayerContext or a cloud restore can report "first ever" again;
    // without the guard that would burn both lifetime shows back to back.
    expect(listenGuideReason({ ...S, shownCount: 1 }, true)).toBeNull();
  });

  it('the two shows can never land on consecutive flows', () => {
    // Show one, then complete a flow without listening: still short of the gap.
    let s = noteListenGuideShown(S);
    expect(s.flowsSinceListen).toBe(0);
    s = noteFlowComplete(s, false);
    expect(listenGuideReason(s, false)).toBeNull();
  });
});

describe('transitions', () => {
  it('a flow without narration counts toward the gap; one with it retires the guide', () => {
    let s = noteFlowComplete(S, false);
    expect(s.flowsSinceListen).toBe(1);
    expect(s.everListened).toBe(false);
    s = noteFlowComplete(s, true);
    expect(s.everListened).toBe(true);
    expect(s.flowsSinceListen).toBe(0);
  });

  it('listening mid-flow retires it immediately, before the flow even completes', () => {
    const s = noteListened({ ...S, flowsSinceListen: 3 });
    expect(listenGuideReason(s, false)).toBeNull();
  });

  it('four consecutive silent flows reach exactly the threshold', () => {
    let s = S;
    for (let i = 0; i < LISTEN_GUIDE_FLOW_GAP; i += 1) s = noteFlowComplete(s, false);
    expect(listenGuideReason(s, false)).toBe('four_flows');
  });

  it('all transitions are pure', () => {
    const before = JSON.stringify(S);
    noteListenGuideShown(S); noteListened(S); noteFlowComplete(S, true); noteFlowComplete(S, false);
    expect(JSON.stringify(S)).toBe(before);
  });
});
