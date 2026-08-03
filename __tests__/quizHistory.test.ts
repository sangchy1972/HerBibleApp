// Daily quiz history.
//
// This is the only store in the app that can answer "when". It is append-only
// and cannot be backfilled, so a bug here is not recoverable by a later fix —
// whatever it fails to record is gone.

import {
  HISTORY_DAYS, INITIAL_HISTORY, recordSet, lastNDays, summarize, parseHistory,
  type QuizHistoryV1,
} from '../src/state/quizHistory';

const h = (...days: Array<[string, number, number, number]>): QuizHistoryV1 => ({
  v: 1,
  days: days.map(([ymd, sets, questions, firstPassWrong]) => ({ ymd, sets, questions, firstPassWrong })),
});

describe('recordSet', () => {
  it('accumulates same-day sets into one entry', () => {
    let x = recordSet(INITIAL_HISTORY, '2026-08-02', { questions: 5, firstPassWrong: 1 });
    x = recordSet(x, '2026-08-02', { questions: 5, firstPassWrong: 0 });
    expect(x.days).toEqual([{ ymd: '2026-08-02', sets: 2, questions: 10, firstPassWrong: 1 }]);
  });

  it('keeps days ascending even when the clock goes backwards', () => {
    // A device whose timezone or clock moved can hand us an earlier date after
    // a later one. Charts index by position, so out-of-order days would draw
    // the month scrambled.
    let x = recordSet(INITIAL_HISTORY, '2026-08-05', { questions: 5, firstPassWrong: 0 });
    x = recordSet(x, '2026-08-01', { questions: 5, firstPassWrong: 2 });
    expect(x.days.map(d => d.ymd)).toEqual(['2026-08-01', '2026-08-05']);
  });

  it('caps at HISTORY_DAYS, keeping the most recent', () => {
    let x: QuizHistoryV1 = INITIAL_HISTORY;
    for (let i = 0; i < HISTORY_DAYS + 30; i += 1) {
      const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
      x = recordSet(x, d, { questions: 5, firstPassWrong: 0 });
    }
    expect(x.days).toHaveLength(HISTORY_DAYS);
    expect(x.days[x.days.length - 1].ymd).toBe(
      new Date(Date.UTC(2025, 0, 1) + (HISTORY_DAYS + 29) * 86400000).toISOString().slice(0, 10),
    );
  });

  it('ignores a malformed date instead of poisoning the array', () => {
    for (const bad of ['', 'today', '2026-8-2', '20260802']) {
      expect(recordSet(INITIAL_HISTORY, bad, { questions: 5, firstPassWrong: 0 })).toBe(INITIAL_HISTORY);
    }
  });

  it('never records more wrong than were asked', () => {
    const x = recordSet(INITIAL_HISTORY, '2026-08-02', { questions: 5, firstPassWrong: 99 });
    expect(x.days[0].firstPassWrong).toBe(5);
  });
});

describe('lastNDays', () => {
  it('fills the gaps — a chart needs the days she did nothing', () => {
    const x = h(['2026-08-01', 1, 5, 0], ['2026-08-03', 2, 10, 1]);
    const w = lastNDays(x, '2026-08-03', 3);
    expect(w.map(d => [d.ymd, d.sets])).toEqual([
      ['2026-08-01', 1], ['2026-08-02', 0], ['2026-08-03', 2],
    ]);
  });

  it('steps in UTC so a DST boundary cannot repeat or skip a day', () => {
    // Stepping a local-midnight Date by 24h lands at 23:00 or 01:00 across a
    // DST change, and .slice(0,10) then yields the same day twice.
    const w = lastNDays(INITIAL_HISTORY, '2026-03-31', 5);
    expect(w.map(d => d.ymd)).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
    expect(new Set(w.map(d => d.ymd)).size).toBe(5);
  });

  it('returns nothing rather than throwing on bad input', () => {
    expect(lastNDays(INITIAL_HISTORY, 'nope', 7)).toEqual([]);
    expect(lastNDays(INITIAL_HISTORY, '2026-08-02', 0)).toEqual([]);
  });
});

describe('summarize', () => {
  it('does not break the streak just because today has not happened yet', () => {
    // THE bug this guards: counting back from today and stopping at the first
    // empty day collapses the streak to 0 at every midnight, recovering only
    // once she plays. She would watch a 12-day streak vanish overnight.
    const x = h(['2026-07-31', 1, 5, 0], ['2026-08-01', 1, 5, 0]);
    expect(summarize(x, '2026-08-02').streak).toBe(2);
  });

  it('counts today when she has played', () => {
    const x = h(['2026-08-01', 1, 5, 0], ['2026-08-02', 1, 5, 0]);
    expect(summarize(x, '2026-08-02').streak).toBe(2);
  });

  it('breaks on a real gap', () => {
    const x = h(['2026-07-28', 1, 5, 0], ['2026-07-31', 1, 5, 0], ['2026-08-01', 1, 5, 0]);
    const s = summarize(x, '2026-08-02');
    expect(s.streak).toBe(2);
    expect(s.bestStreak).toBe(2);
  });

  it('reports the best run anywhere in the window', () => {
    const x = h(
      ['2026-07-20', 1, 5, 0], ['2026-07-21', 1, 5, 0], ['2026-07-22', 1, 5, 0],
      ['2026-08-01', 1, 5, 0],
    );
    expect(summarize(x, '2026-08-02').bestStreak).toBe(3);
  });

  it('computes first-pass accuracy, and null rather than NaN when empty', () => {
    const x = h(['2026-08-01', 2, 10, 2]);
    expect(summarize(x, '2026-08-02').accuracy).toBeCloseTo(0.8);
    expect(summarize(INITIAL_HISTORY, '2026-08-02').accuracy).toBeNull();
  });

  it('windows 7 and 30 days independently of the retained history', () => {
    const x = h(['2026-07-01', 5, 25, 0], ['2026-08-01', 3, 15, 0], ['2026-08-02', 1, 5, 0]);
    const s = summarize(x, '2026-08-02');
    expect(s.setsLast7).toBe(4);
    expect(s.setsLast30).toBe(4);
    expect(s.activeDays).toBe(3);
  });
});

describe('parseHistory', () => {
  it('round-trips', () => {
    const x = h(['2026-08-01', 1, 5, 0], ['2026-08-02', 2, 10, 3]);
    expect(parseHistory(JSON.stringify(x))).toEqual(x);
  });

  it('drops only the bad entries, never the whole record', () => {
    // History is irreplaceable — discarding it over one malformed row would
    // lose months that cannot be re-derived.
    const raw = JSON.stringify({
      v: 1,
      days: [
        { ymd: '2026-08-01', sets: 1, questions: 5, firstPassWrong: 0 },
        { ymd: 'garbage', sets: 9, questions: 9, firstPassWrong: 0 },
        { ymd: '2026-08-01', sets: 4, questions: 20, firstPassWrong: 0 },
        { ymd: '2026-08-02', sets: 'x', questions: null, firstPassWrong: -3 },
      ],
    });
    const p = parseHistory(raw);
    expect(p.days.map(d => d.ymd)).toEqual(['2026-08-01', '2026-08-02']);
    expect(p.days[1]).toEqual({ ymd: '2026-08-02', sets: 0, questions: 0, firstPassWrong: 0 });
  });

  it('sorts and caps whatever it is handed', () => {
    const raw = JSON.stringify({
      v: 1,
      days: [{ ymd: '2026-08-05', sets: 1, questions: 5, firstPassWrong: 0 },
             { ymd: '2026-08-01', sets: 1, questions: 5, firstPassWrong: 0 }],
    });
    expect(parseHistory(raw).days.map(d => d.ymd)).toEqual(['2026-08-01', '2026-08-05']);
  });

  it('never throws on garbage', () => {
    for (const raw of [null, '', 'not json', '[]', '{"v":2}', '{"v":1}']) {
      expect(parseHistory(raw as string | null)).toEqual(INITIAL_HISTORY);
    }
  });
});
