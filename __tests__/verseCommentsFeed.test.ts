import { buildCommentFeed, dailyCount, mulberry32, hashStr } from '../src/state/verseCommentsFeed';
import { VERSE_COMMENTS, COMMENT_NAMES } from '../src/constants/verseComments';

describe('buildCommentFeed', () => {
  const base = { ymd: '2026-07-12', slot: 'morning' as const, lang: 'en' as const, count: 40 };

  it('is deterministic — identical args produce an identical feed', () => {
    expect(buildCommentFeed(base)).toEqual(buildCommentFeed(base));
  });

  it('varies by slot and by day', () => {
    const morning = buildCommentFeed(base);
    const evening = buildCommentFeed({ ...base, slot: 'evening', count: 40 });
    const nextDay = buildCommentFeed({ ...base, ymd: '2026-07-13' });
    expect(morning).not.toEqual(evening);
    expect(morning).not.toEqual(nextDay);
  });

  it('renders exactly count rows, clamped to the pool', () => {
    expect(buildCommentFeed(base)).toHaveLength(40);
    const huge = buildCommentFeed({ ...base, count: 9999 });
    expect(huge).toHaveLength(Math.min(VERSE_COMMENTS.en.length, COMMENT_NAMES.length));
  });

  it('language switch keeps ids/names/ages/likes, swaps texts to the new pool', () => {
    const en = buildCommentFeed(base);
    const zh = buildCommentFeed({ ...base, lang: 'zh-Hans' as const });
    expect(zh.map(r => [r.id, r.name, r.agoLabel, r.likes]))
      .toEqual(en.map(r => [r.id, r.name, r.agoLabel, r.likes]));
    zh.forEach(r => expect(VERSE_COMMENTS['zh-Hans']).toContain(r.text));
  });

  it('ago labels are m/h only and sorted newest-first; ids are 0..n-1', () => {
    const rows = buildCommentFeed(base);
    const toMin = (l: string) => l.endsWith('m') ? parseInt(l) : parseInt(l) * 60;
    rows.forEach((r, i) => {
      expect(r.agoLabel).toMatch(/^\d+(m|h)$/);
      expect(r.id).toBe(i);
      if (i > 0) expect(toMin(rows[i - 1].agoLabel)).toBeLessThanOrEqual(toMin(r.agoLabel) + 59); // hour rounding slack
    });
  });
});

describe('dailyCount', () => {
  it('reproduces the legacy inline sin formula (badge numbers must not jump)', () => {
    // Legacy: seed = y*10000 + m*100 + d + salt*137 over new Date()
    const legacy = (y: number, m: number, d: number, salt: number, min: number, range: number) =>
      min + Math.floor(Math.abs(Math.sin(y * 10000 + m * 100 + d + salt * 137)) * range);
    expect(dailyCount('2026-07-12', 3, 36, 20)).toBe(legacy(2026, 7, 12, 3, 36, 20));
    expect(dailyCount('2026-01-01', 1, 1001, 4000)).toBe(legacy(2026, 1, 1, 1, 1001, 4000));
  });

  it('stays within [min, min+range)', () => {
    for (let d = 1; d <= 28; d++) {
      const v = dailyCount(`2026-03-${String(d).padStart(2, '0')}`, 4, 36, 20);
      expect(v).toBeGreaterThanOrEqual(36);
      expect(v).toBeLessThan(56);
    }
  });
});

describe('prng primitives', () => {
  it('mulberry32 is deterministic per seed and in [0,1)', () => {
    const a = mulberry32(hashStr('2026-07-12|morning'));
    const b = mulberry32(hashStr('2026-07-12|morning'));
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
