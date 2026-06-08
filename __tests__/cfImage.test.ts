import { cfImage } from '../src/services/cfImage';

// cfImage rewrites covers.everlandapps.com URLs into Cloudflare resize
// variants, snapping width to buckets (×DPR, capped 3x). Stub RN PixelRatio=3.

const COVERS = 'https://covers.everlandapps.com/v1/covers/anger.webp';

describe('cfImage', () => {
  test('rewrites a covers URL to a /cdn-cgi/image variant with bucketed width', () => {
    const out = cfImage(COVERS, 118); // 118 * 3 = 354 -> bucket 384
    expect(out).toContain('/cdn-cgi/image/');
    expect(out).toContain('width=384');
    expect(out).toContain('format=auto');
    expect(out.endsWith('/v1/covers/anger.webp')).toBe(true);
  });

  test('snaps small render widths up to the nearest bucket', () => {
    expect(cfImage(COVERS, 40)).toContain('width=128'); // 120 -> 128
    expect(cfImage(COVERS, 110)).toContain('width=384'); // 330 -> 384
  });

  test('caps at the largest bucket for full-screen widths', () => {
    expect(cfImage(COVERS, 1200)).toContain('width=1440');
  });

  test('leaves non-allowlisted hosts untouched', () => {
    const audio = 'https://audio.everlandapps.com/x/genesis_001.mp3';
    expect(cfImage(audio, 300)).toBe(audio);
    const jsdelivr = 'https://cdn.jsdelivr.net/gh/foo/bar@sha/x.json';
    expect(cfImage(jsdelivr, 300)).toBe(jsdelivr);
  });

  test('does not double-wrap an already-transformed URL', () => {
    const already = 'https://covers.everlandapps.com/cdn-cgi/image/width=256/v1/covers/x.webp';
    expect(cfImage(already, 300)).toBe(already);
  });

  test('returns input unchanged on malformed url', () => {
    expect(cfImage('not-a-url', 300)).toBe('not-a-url');
  });
});
