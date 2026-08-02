// The mystery card pool.
//
// Most of these assertions guard EDITORIAL rules, not code. That is deliberate:
// this is the one place in the app where we write in God's first person, and a
// card that drifts into prosperity-gospel phrasing or reads as a reason to skip
// medical care is a far worse defect than a crash — it ships, it looks fine in
// review, and the damage is to a reader who trusted it.
//
// The mechanical rules (ids, counts, lengths) protect the draw logic, which
// addresses cards by id and lays them out on a phone-sized card.

import {
  MYSTERY_CARDS, MYSTERY_CARD_COUNT, CARD_THEMES, cardById,
  localizedCardTitle, localizedCardBody,
} from '../src/constants/mysteryCards';
import { MYSTERY_EVERY } from '../src/state/quizProgress';

const words = (s: string) => s.trim().split(/\s+/).length;

describe('pool shape', () => {
  it('has 40 cards, 4 per theme', () => {
    // 40 draws x 3 sets = 120 completed sets before a card repeats, against 65
    // sets per bank cycle — she meets a repeated QUESTION long before a
    // repeated CARD, which is the right way round since the card is the reward.
    expect(MYSTERY_CARD_COUNT).toBe(40);
    expect(CARD_THEMES).toHaveLength(10);
    for (const theme of CARD_THEMES) {
      expect(MYSTERY_CARDS.filter(c => c.theme === theme)).toHaveLength(4);
    }
  });

  it('outlasts a full bank cycle by a wide margin', () => {
    const setsToExhaust = MYSTERY_CARD_COUNT * MYSTERY_EVERY;
    expect(setsToExhaust).toBeGreaterThan(65);   // sets per quiz bank cycle
  });

  it('has unique ids', () => {
    // Ids are the durable key in CardProgress.collected. A duplicate would make
    // two cards indistinguishable in a user's collection.
    const ids = MYSTERY_CARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never repeats a scripture reference', () => {
    // Two cards on the same passage would feel like a duplicate draw even
    // though the ids differ.
    const refs = MYSTERY_CARDS.map(c => c.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('ids are lowercase, hyphenated, and start with their theme', () => {
    for (const c of MYSTERY_CARDS) {
      expect(c.id).toMatch(/^[a-z]+-\d+$/);
      expect(c.id.startsWith(`${c.theme}-`)).toBe(true);
    }
  });
});

describe('card copy fits a phone card', () => {
  it('keeps every English body between 35 and 60 words', () => {
    for (const c of MYSTERY_CARDS) {
      const n = words(c.body.en!);
      expect(`${c.id}:${n >= 35 && n <= 60}`).toBe(`${c.id}:true`);
    }
  });

  it('keeps every title to 2-4 words', () => {
    for (const c of MYSTERY_CARDS) {
      const n = words(c.title.en!);
      expect(`${c.id}:${n}`).toBe(`${c.id}:${Math.min(4, Math.max(2, n))}`);
    }
  });

  it('always has English, since every localizer falls back to it', () => {
    for (const c of MYSTERY_CARDS) {
      expect(c.title.en && c.title.en.length).toBeTruthy();
      expect(c.body.en && c.body.en.length).toBeTruthy();
    }
  });

  it('cites a book chapter:verse reference', () => {
    for (const c of MYSTERY_CARDS) {
      expect(c.ref).toMatch(/^[1-3]? ?[A-Z][a-z]+ \d+:\d+(-\d+)?$/);
    }
  });
});

describe('editorial guardrails', () => {
  const bodies = MYSTERY_CARDS.map(c => ({ id: c.id, text: c.body.en!.toLowerCase() }));

  it('never promises wealth or material increase', () => {
    // The provision theme is where this drifts. Cards there deliberately say
    // "I am not promising you abundance on demand" and "satisfy what you need"
    // rather than anything resembling a return on faith.
    const banned = ['rich', 'riches', 'wealth', 'wealthy', 'prosper', 'prosperity', 'financial breakthrough'];
    for (const { id, text } of bodies) {
      for (const w of banned) {
        expect(`${id}:${w}:${new RegExp(`\\b${w}\\b`).test(text)}`).toBe(`${id}:${w}:false`);
      }
    }
  });

  it('never touches physical illness or cure', () => {
    // The healing cards speak to grief and heartbreak ONLY. Anything that could
    // be read as a promise of physical healing risks being read as a reason to
    // delay treatment.
    const banned = ['cure', 'cured', 'disease', 'illness', 'cancer', 'symptom', 'diagnosis', 'medicine'];
    for (const { id, text } of bodies) {
      for (const w of banned) {
        expect(`${id}:${w}:${new RegExp(`\\b${w}\\b`).test(text)}`).toBe(`${id}:${w}:false`);
      }
    }
  });

  it('does not shout', () => {
    // Register check. These are meant to be read as someone speaking quietly to
    // one tired woman; exclamation marks turn that into cheerleading.
    for (const { id, text } of bodies) {
      expect(`${id}:${text.includes('!')}`).toBe(`${id}:false`);
    }
  });

  it('speaks to her directly', () => {
    // Every card must contain second-person address. A card written about her
    // rather than to her has missed the entire brief.
    for (const { id, text } of bodies) {
      expect(`${id}:${/\byou\b|\byour\b/.test(text)}`).toBe(`${id}:true`);
    }
  });
});

describe('lookup helpers', () => {
  it('never returns undefined for an unknown id', () => {
    // A reward screen is the last place a missing lookup should land.
    expect(cardById('does-not-exist')).toBe(MYSTERY_CARDS[0]);
    expect(cardById('')).toBe(MYSTERY_CARDS[0]);
  });

  it('resolves a known id', () => {
    expect(cardById('courage-1').ref).toBe('Isaiah 41:10');
  });

  it('falls back to English for an untranslated language', () => {
    // Translations land per language over time; a half-translated pool must
    // render English rather than blank.
    const c = MYSTERY_CARDS[0];
    expect(localizedCardTitle(c, 'de')).toBe(c.title.en);
    expect(localizedCardBody(c, 'de')).toBe(c.body.en);
  });
});
