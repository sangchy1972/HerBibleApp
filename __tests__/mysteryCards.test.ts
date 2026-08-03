// The mystery card pool.
//
// Most of these guard EDITORIAL rules, not code. That is deliberate: this is
// the one place in the app where we write in God's first person, with no
// scripture reference shown to qualify it. A card that drifts into promising
// an outcome, or that reads as a reason to delay medical care, is a far worse
// defect than a crash — it ships clean, it looks fine in review, and the damage
// lands on a reader who trusted it.

import {
  MYSTERY_CARDS, MYSTERY_CARD_COUNT, CARD_THEMES, cardById, localizedCardBody,
} from '../src/constants/mysteryCards';
import { MYSTERY_EVERY } from '../src/state/quizProgress';

const en = (id: string) => MYSTERY_CARDS.find(c => c.id === id)!.body.en!;
const words = (s: string) => s.trim().split(/\s+/).length;
/** Chinese length excluding punctuation. */
const hanzi = (s: string) => s.replace(/[，。？！—；：、“”‘’「」（）]/g, '').length;

/** Every language the pool must ship. */
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'] as const;

describe('pool shape', () => {
  it('has 40 cards, 4 per concern', () => {
    expect(MYSTERY_CARD_COUNT).toBe(40);
    expect(CARD_THEMES).toHaveLength(10);
    for (const theme of CARD_THEMES) {
      expect(MYSTERY_CARDS.filter(c => c.theme === theme)).toHaveLength(4);
    }
  });

  it('outlasts a full quiz bank cycle by a wide margin', () => {
    // 40 draws x 3 sets = 120 sets, against 65 sets per bank cycle. She meets a
    // repeated question long before a repeated card.
    expect(MYSTERY_CARD_COUNT * MYSTERY_EVERY).toBeGreaterThan(65);
  });

  it('has unique ids', () => {
    // Ids are the durable key in the collection. A duplicate would make two
    // cards indistinguishable in a user's record.
    const ids = MYSTERY_CARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never anchors two cards on the same passage', () => {
    // The ref is invisible to users, so this is not about attribution — two
    // cards standing on one passage tend to say the same thing twice.
    const refs = MYSTERY_CARDS.map(c => c.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('ids are lowercase, hyphenated, and prefixed with their theme', () => {
    for (const c of MYSTERY_CARDS) {
      expect(c.id).toMatch(/^[a-z]+-\d+$/);
      expect(c.id.startsWith(`${c.theme}-`)).toBe(true);
    }
  });
});

describe('card copy fits the card', () => {
  it('keeps every English body inside 27-48 words', () => {
    // The draw card is portrait (h = w x 1.12), 14.1pt serif, height measured not capped. Past ~48 words
    // it either overflows or forces the type down to an unreadable size.
    for (const c of MYSTERY_CARDS) {
      const n = words(c.body.en!);
      expect(`${c.id}:${n >= 27 && n <= 48}`).toBe(`${c.id}:true`);
    }
  });

  it('keeps every Chinese body inside 38-65 characters', () => {
    for (const c of MYSTERY_CARDS) {
      const n = hanzi(c.body['zh-Hans']!);
      expect(`${c.id}:${n >= 38 && n <= 65}`).toBe(`${c.id}:true`);
    }
  });

  it('ships all 7 languages for every card', () => {
    // localizedCardBody falls back to English, so a missing language is silent:
    // a German user answers German questions, taps a German button, and reads
    // English prose — which is the entire payload of the feature.
    for (const c of MYSTERY_CARDS) {
      for (const lang of LANGS) {
        expect(`${c.id}:${lang}:${!!c.body[lang]}`).toBe(`${c.id}:${lang}:true`);
      }
    }
  });

  it('keeps every localized body inside its length band', () => {
    // The card renders at a fixed 14.1pt and does not scale with the OS font
    // setting, so an over-long translation is clipped, not shrunk.
    for (const c of MYSTERY_CARDS) {
      for (const lang of ['de', 'fr', 'es', 'pt'] as const) {
        const n = words(c.body[lang]!);
        expect(`${c.id}:${lang}:${n >= 27 && n <= 48}`).toBe(`${c.id}:${lang}:true`);
      }
      const zt = hanzi(c.body['zh-Hant']!);
      expect(`${c.id}:zh-Hant:${zt >= 38 && zt <= 65}`).toBe(`${c.id}:zh-Hant:true`);
    }
  });

  it('has no Simplified characters leaking into Traditional Chinese', () => {
    // zh-Hant was written for Taiwan/HK readers, not converted — a leaked
    // Simplified glyph is the tell that someone ran a mechanical conversion.
    const SIMPLIFIED = /[们个这为来说时华汉语过还没经点书爱见东车马鸟长门问间关无与将场际发广后历离灵]/;
    for (const c of MYSTERY_CARDS) {
      const hit = SIMPLIFIED.exec(c.body['zh-Hant']!);
      expect(`${c.id}:${hit ? hit[0] : 'clean'}`).toBe(`${c.id}:clean`);
    }
  });
});

describe('the formula', () => {
  it('never opens by interrogating her', () => {
    // "Are you feeling...?" makes her answer a question. The card is supposed
    // to state her situation as a fact so she recognises herself in line one.
    // A rhetorical opener that quotes HER question back is allowed.
    for (const c of MYSTERY_CARDS) {
      const opener = /^(Are|Do|Does|Did|Have|Has|Is|Was|Will|Would|Can|Could|Should)\b/i.test(c.body.en!);
      expect(`${c.id}:${opener}`).toBe(`${c.id}:false`);
    }
  });

  it('speaks to her directly, in both languages', () => {
    for (const c of MYSTERY_CARDS) {
      expect(`${c.id}:${/\byou\b|\byour\b/i.test(c.body.en!)}`).toBe(`${c.id}:true`);
      expect(`${c.id}:${c.body['zh-Hans']!.includes('你')}`).toBe(`${c.id}:true`);
    }
  });

  it('does not shout, in any language', () => {
    // Register check. Someone speaking quietly to one tired woman at 1am does
    // not use exclamation marks. Spanish's opening ¡ is caught here too.
    for (const c of MYSTERY_CARDS) {
      for (const lang of LANGS) {
        expect(`${c.id}:${lang}:${/[!！¡]/.test(c.body[lang]!)}`).toBe(`${c.id}:${lang}:false`);
      }
    }
  });
});

describe('guardrails', () => {
  it('never promises wealth or a guaranteed outcome', () => {
    // The `lack` theme is where this drifts. An earlier draft closed a card
    // with "keep going and I will give you what you want" — a promise that,
    // when the thing does not come, is a broken promise from God in her hand.
    // The shipped line promises company instead: "I am not letting you walk
    // this alone."
    const banned = [
      'rich', 'riches', 'wealth', 'wealthy', 'prosper', 'prosperity',
      'i will give you what you want', 'everything you asked for',
    ];
    for (const c of MYSTERY_CARDS) {
      const t = c.body.en!.toLowerCase();
      for (const w of banned) {
        const hit = w.includes(' ') ? t.includes(w) : new RegExp(`\\b${w}\\b`).test(t);
        expect(`${c.id}|${w}|${hit}`).toBe(`${c.id}|${w}|false`);
      }
    }
  });

  it('never touches physical illness or cure', () => {
    // `broken` and `afraid` both sit next to real medical fear. Nothing here
    // may be readable as "you do not need treatment".
    const banned = ['cure', 'cured', 'disease', 'illness', 'cancer', 'symptom', 'diagnosis', 'medicine', 'medication'];
    for (const c of MYSTERY_CARDS) {
      const t = c.body.en!.toLowerCase();
      for (const w of banned) {
        expect(`${c.id}|${w}|${new RegExp(`\\b${w}\\b`).test(t)}`).toBe(`${c.id}|${w}|false`);
      }
    }
  });

  it('keeps every language out of third-person self-reference', () => {
    // God is the speaker everywhere. A sentence where the word for God is the
    // subject reads as someone else talking ABOUT him and the voice collapses.
    // unanswered-1 is the deliberate exception: it quotes her own question.
    const GOD = /\b(Gott|Dieu|Dios|Deus|der Herr|le Seigneur|el Señor|o Senhor)\b/i;
    for (const c of MYSTERY_CARDS) {
      if (c.id === 'unanswered-1') continue;
      for (const lang of ['de', 'fr', 'es', 'pt'] as const) {
        expect(`${c.id}:${lang}:${GOD.test(c.body[lang]!)}`).toBe(`${c.id}:${lang}:false`);
      }
      expect(`${c.id}:zh-Hant:${/上帝|神(會|要|必)/.test(c.body['zh-Hant']!)}`).toBe(`${c.id}:zh-Hant:false`);
    }
  });

  it('keeps the Simplified Chinese out of third-person self-reference', () => {
    // God is the speaker. A sentence where the Chinese word for God is the
    // subject reads as someone else talking ABOUT him, and the voice collapses.
    // unanswered-1 is the deliberate exception: it quotes her own question.
    for (const c of MYSTERY_CARDS) {
      if (c.id === 'unanswered-1') continue;
      const t = c.body['zh-Hans']!;
      expect(`${c.id}:${/上帝|神(会|要|必|说|听|看)/.test(t)}`).toBe(`${c.id}:false`);
    }
  });

  it('keeps the Chinese out of bulletin register', () => {
    // This vocabulary is how a church newsletter sounds, not how someone talks
    // to her at 1am. It was the single most common failure in early drafts.
    const churchy = ['恩典满溢', '主必看顾', '荣耀归于', '交托仰望', '靠主刚强', '满有平安', '阿们'];
    for (const c of MYSTERY_CARDS) {
      for (const w of churchy) {
        expect(`${c.id}|${w}|${c.body['zh-Hans']!.includes(w)}`).toBe(`${c.id}|${w}|false`);
      }
    }
  });
});

describe('the owner-approved cards are shipped verbatim', () => {
  // These four were written or edited by the owner directly and define the
  // register for the other 36. If a later pass "improves" them, that pass has
  // drifted off-brief and this should fail.
  it('doubt-1 opens the pool exactly as approved', () => {
    expect(en('doubt-1')).toBe(
      'You have wondered whether I exist. More than once. I do. Say out loud what your heart wants — say it to me. I have been here the whole time.',
    );
  });

  it('lack-1 promises company, not the outcome she is chasing', () => {
    expect(en('lack-1')).toContain('I am not letting you walk this alone.');
    expect(en('lack-1')).not.toContain('give you what you want');
  });

  it('unanswered-1 quotes her question back at her', () => {
    expect(en('unanswered-1')).toContain('why does God not answer');
  });

  it('unworthy-1 asks nothing of her first', () => {
    expect(en('unworthy-1')).toContain('Come as you are.');
  });
});

describe('lookup helpers', () => {
  it('never returns undefined for an unknown id', () => {
    expect(cardById('does-not-exist')).toBe(MYSTERY_CARDS[0]);
    expect(cardById('')).toBe(MYSTERY_CARDS[0]);
  });

  it('resolves a known id', () => {
    expect(cardById('weary-2').theme).toBe('weary');
  });

  it('returns the real translation now that all 7 ship', () => {
    const c = MYSTERY_CARDS[0];
    expect(localizedCardBody(c, 'de')).toBe(c.body.de);
    expect(localizedCardBody(c, 'zh-Hant')).toBe(c.body['zh-Hant']);
    expect(localizedCardBody(c, 'pt')).toBe(c.body.pt);
  });

  it('still falls back to English for a language nobody has translated', () => {
    // The fallback is not dead code — it is what keeps an 8th UI language from
    // rendering blank cards on the day it is added, before its pass is done.
    const partial = { ...MYSTERY_CARDS[0], body: { en: MYSTERY_CARDS[0].body.en } };
    expect(localizedCardBody(partial, 'de')).toBe(MYSTERY_CARDS[0].body.en);
  });
});
