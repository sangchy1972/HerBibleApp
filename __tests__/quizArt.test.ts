// The puzzle art registry, and the reward maths that indexes it.
//
// The interesting bug here is off-by-one. The results screen shows the board as
// it will be AFTER the set commits, and rings the tile that set earned — so it
// works with `completedSets + 1` while `puzzleView` is written against
// completed counts. Getting that wrong rings the previous tile, or none.

import {
  QUIZ_ART, QUIZ_ART_COUNT, artworkAt, artUrl, artThumbUrl, artSource,
  artTitle, artDesc, artArtist, artCaption, artThumbSource,
  FIRST_ART_LOCAL, FIRST_ART_ID,
} from '../src/constants/quizArt';
import { TRANSLATIONS, type LanguageCode } from '../src/state/TranslationsContext';
import { rewardPreview as rawPreview, TILES_PER_PAINTING } from '../src/state/quizProgress';

const rewardPreview = (before: number) => rawPreview(before, QUIZ_ART_COUNT);
const LANGS: LanguageCode[] = TRANSLATIONS.map(t => t.code);

describe('art registry', () => {
  it('has unique, stable ids', () => {
    // Ids address a user's collected paintings. A duplicate would make two
    // entries indistinguishable in analytics and in React keys.
    const ids = QUIZ_ART.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes a count that matches the list', () => {
    expect(QUIZ_ART_COUNT).toBe(QUIZ_ART.length);
    // 32 four-tile boards plus a two-tile diptych = 130 sets, which is exactly
    // what a 650-question bank yields. The source set held 74; the rest were
    // saints, apocrypha and donor Madonnas, not Bible scenes.
    // The arithmetic itself is pinned in quizLifecycle.test.ts.
    expect(QUIZ_ART_COUNT).toBe(33);
  });

  it('credits every painting in every language the app ships', () => {
    // Title and artist are shown to the user. Partly because it is the decent
    // thing to do with somebody's Caravaggio, and partly because they ARE the
    // reward — she collected a painting that has a name, not a texture.
    //
    // Asserting against TRANSLATIONS rather than a literal list means adding a
    // 8th app language fails HERE, at the registry, instead of silently
    // serving her English captions inside an otherwise translated screen.
    for (const a of QUIZ_ART) {
      expect(`${a.id}:artist:${a.artist.length > 0}`).toBe(`${a.id}:artist:true`);
      for (const lang of LANGS) {
        expect(`${a.id}:${lang}:title`).toBe(
          artTitle(a, lang).length > 0 ? `${a.id}:${lang}:title` : `${a.id}:${lang}:TITLE MISSING`,
        );
        expect(`${a.id}:${lang}:desc`).toBe(
          artDesc(a, lang).length > 0 ? `${a.id}:${lang}:desc` : `${a.id}:${lang}:DESC MISSING`,
        );
      }
    }
  });

  it('cites a scripture reference for every painting', () => {
    // The curation rule: if she cannot look the scene up, it does not belong in
    // a Bible app. A blank ref is how a saint's legend sneaks back in.
    for (const a of QUIZ_ART) {
      expect(`${a.id}:${a.ref}`).toMatch(/^\d{3}:(\d )?[A-Z][a-z]+ \d+(:\d+(-\d+)?)?$/);
    }
  });

  it('falls back to English rather than to blank', () => {
    // A half-translated locale should render a real caption in the wrong
    // language. A blank one reads as a bug and looks like data loss.
    const stub = { ...QUIZ_ART[0], title: { en: 'T' }, desc: { en: 'D' }, artistCjk: undefined };
    expect(artTitle(stub, 'fr')).toBe('T');
    expect(artDesc(stub, 'fr')).toBe('D');
    expect(artArtist(stub, 'fr')).toBe(stub.artist);
  });

  it('uses the Latin artist name for Latin-script locales only', () => {
    for (const a of QUIZ_ART) {
      for (const lang of ['en', 'de', 'fr', 'es', 'pt'] as LanguageCode[]) {
        expect(artArtist(a, lang)).toBe(a.artist);
      }
      // CJK gets a transliteration; without it a Chinese caption reads half in
      // Chinese and half in Spanish.
      expect(artArtist(a, 'zh-Hans')).not.toBe(a.artist);
      expect(artArtist(a, 'zh-Hant')).not.toBe(a.artist);
    }
  });

  it('gives every painting a usable aspect ratio', () => {
    // The board takes its shape from this. A zero or a NaN would collapse the
    // height to nothing and the puzzle would be a 1px strip.
    for (const a of QUIZ_ART) {
      expect(Number.isFinite(a.aspect)).toBe(true);
      expect(a.aspect).toBeGreaterThan(0.3);
      expect(a.aspect).toBeLessThan(3);
    }
  });

  it('builds CDN urls from the id, with a separate thumbnail', () => {
    // A separate thumb file rather than a Cloudflare transform: the transform
    // host list in cfImage.ts covers the covers domain only, and a resize that
    // silently failed would push the full-size set into a 2-column grid.
    const a = QUIZ_ART[0];
    expect(artUrl(a)).toBe(`https://quiz.everlandapps.com/v1/art/full/${a.id}.jpg`);
    expect(artThumbUrl(a)).toBe(`https://quiz.everlandapps.com/v1/art/thumb/${a.id}.jpg`);
  });

  it('resolves the bundled asset to a number, as Metro does', () => {
    // PuzzleBoard branches on `typeof src === 'number'` to decide whether a
    // source can ever report onError. If a require() ever resolved to an object
    // that branch silently inverts and painting one locks forever.
    expect(typeof artSource(QUIZ_ART[0])).toBe('number');
  });

  it('serves painting one from the bundle and the rest from the CDN', () => {
    // The whole point of shipping one JPEG in the binary: a user who has never
    // had a network still finishes her first puzzle. If this ever regresses to
    // a URL, her first reward is four grey holes.
    expect(artSource(QUIZ_ART[0])).toBe(FIRST_ART_LOCAL);
    expect(artThumbSource(QUIZ_ART[0])).toBe(FIRST_ART_LOCAL);
    expect(QUIZ_ART[0].id).toBe(FIRST_ART_ID);
    for (const a of QUIZ_ART.slice(1)) {
      expect(artSource(a)).toEqual({ uri: artUrl(a) });
      expect(artThumbSource(a)).toEqual({ uri: artThumbUrl(a) });
    }
  });

  it('bundles exactly one painting, and it is the first one unlocked', () => {
    // Binary size. Every extra painting in the app is ~150 KB of download for
    // every user, including the ones who never open the quiz. One is enough:
    // painting 1 unlocks at set 4 with no network needed, and by set 5 -- the
    // first CDN request -- she has been in the app long enough to have had one.
    const local = QUIZ_ART.filter(a => typeof artSource(a) === 'number');
    expect(local.map(a => a.id)).toEqual([QUIZ_ART[0].id]);
    const remote = QUIZ_ART.filter(a => typeof artThumbSource(a) === 'number');
    expect(remote.map(a => a.id)).toEqual([QUIZ_ART[0].id]);
  });

  it('pins the unlock order', () => {
    // The user unlocks painting N at 4N completed sets, and `completedPaintings`
    // is stored as a COUNT, not as a list of ids -- so index 2 means "the third
    // entry in this array, whatever it is today". Reordering or inserting
    // silently changes which painting an existing user already owns, and she
    // would watch a finished picture turn into a different one.
    //
    // Appending is safe and is the only safe edit. If this test fails because
    // you added to the end, extend the literal. If it fails for any other
    // reason, stop.
    expect(QUIZ_ART.map(a => a.id)).toEqual([
    '051', '085', '024', '042', '084', '031', '005', '050', '039', '021',
    '001', '007', '091', '009', '002', '003', '047', '041', '088', '040',
    '023', '078', '004', '012',
    // v2, appended 2026-08-08. Chronological within this batch only — see the
    // banner in quizArt.ts for why they could not be merged into the sequence.
    '043', '011', '032', '022', '048', '027', '026', '016',
    // The finale, appended 2026-08-08. LAST in the array is load-bearing, not
    // incidental: LAST_ART_TILES applies to whichever painting is last, so
    // appending anything after this one silently turns Ivanov back into a 2x2
    // and makes the new arrival the diptych instead.
    '017',
    ]);
  });

  it('has ids that are safe as filenames', () => {
    for (const a of QUIZ_ART) expect(a.id).toMatch(/^\d{3}$/);
  });

  it('captions with the localized title and artist', () => {
    const a = QUIZ_ART[0];
    expect(artCaption(a, 'en')).toBe(`${artTitle(a, 'en')} — ${a.artist}, ${a.year}`);
    expect(artCaption(a, 'zh-Hans')).toContain(artArtist(a, 'zh-Hans'));
  });

  it('clamps instead of returning undefined', () => {
    // A reward screen is the last place an out-of-range index should land.
    expect(artworkAt(-3)).toBe(QUIZ_ART[0]);
    expect(artworkAt(0)).toBe(QUIZ_ART[0]);
    expect(artworkAt(9999)).toBe(QUIZ_ART[QUIZ_ART_COUNT - 1]);
    expect(artworkAt(NaN)).toBe(QUIZ_ART[0]);
  });
});

describe('reward preview', () => {
  it('rings the tile the finished set just earned', () => {
    // First ever set → first quadrant, one tile open.
    expect(rewardPreview(0)).toMatchObject({ freshTile: 0 });
    expect(rewardPreview(0).view.tilesUnlocked).toBe(1);

    expect(rewardPreview(1)).toMatchObject({ freshTile: 1 });
    expect(rewardPreview(2)).toMatchObject({ freshTile: 2 });
    expect(rewardPreview(3)).toMatchObject({ freshTile: 3 });
  });

  it('completes the painting on the 4th set, then starts the next', () => {
    const fourth = rewardPreview(3);          // completing set #4
    expect(fourth.view.tilesUnlocked).toBe(TILES_PER_PAINTING);
    expect(fourth.view.paintingIndex).toBe(0);

    const fifth = rewardPreview(4);           // completing set #5
    expect(fifth.view.paintingIndex).toBe(1);
    expect(fifth.view.tilesUnlocked).toBe(1);
    expect(fifth.freshTile).toBe(0);
  });

  it('never rings a tile once the art runs out', () => {
    // Past the last painting the board shows fully unlocked; ringing a tile
    // there would claim a reward that doesn't exist.
    const past = rewardPreview(QUIZ_ART_COUNT * TILES_PER_PAINTING + 10);
    expect(past.view.outOfArt).toBe(true);
    expect(past.freshTile).toBeNull();
    expect(past.view.paintingIndex).toBe(QUIZ_ART_COUNT - 1);
    expect(past.view.tilesUnlocked).toBe(TILES_PER_PAINTING);
  });

  it('keeps the painting index inside the registry for every reachable count', () => {
    for (let done = 0; done < QUIZ_ART_COUNT * TILES_PER_PAINTING + 20; done += 1) {
      const { view } = rewardPreview(done);
      expect(view.paintingIndex).toBeGreaterThanOrEqual(0);
      expect(view.paintingIndex).toBeLessThan(QUIZ_ART_COUNT);
      expect(view.tilesUnlocked).toBeGreaterThanOrEqual(0);
      expect(view.tilesUnlocked).toBeLessThanOrEqual(TILES_PER_PAINTING);
    }
  });
});
