// Cross-language content parity.
//
// Both corpora in this app address content BY POSITION or BY SLUG and assume
// every language ships the same set in the same order. Nothing enforced that
// until now — it was a content-ops convention, and the one time it broke
// (two quiz questions whose ANSWER changed under translation) it was caught by
// hand, not by CI.
//
// The failure mode is nasty precisely because it is silent and partial: the app
// works perfectly in six languages and is subtly wrong in the seventh, for the
// subset of users who switched. These tests turn that into a red build.

import fs from 'fs';
import path from 'path';
import { FEATURED_PLANS_SUMMARY } from '../src/constants/featuredPlansSummary';
import { QUIZ_LANGS, QUIZ_BANK_VERSION } from '../src/constants/bibleQuiz';

const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'] as const;

describe('featured plans — every language ships the same plans', () => {
  const base = FEATURED_PLANS_SUMMARY.en;

  it('publishes all 7 languages', () => {
    for (const l of LANGS) {
      expect(Array.isArray((FEATURED_PLANS_SUMMARY as any)[l])).toBe(true);
      expect((FEATURED_PLANS_SUMMARY as any)[l].length).toBeGreaterThan(0);
    }
  });

  it.each(LANGS.filter(l => l !== 'en'))('%s has the same slug SET as en', lang => {
    // A slug present in en but missing here means: the user browses a plan in
    // English, switches language, and FeaturedPlanDetail's `if (!summary)`
    // branch drops her onto a "plan not found" dead end — with her completion
    // records still pointing at it.
    const other = (FEATURED_PLANS_SUMMARY as any)[lang] as typeof base;
    expect(new Set(other.map(p => p.slug))).toEqual(new Set(base.map(p => p.slug)));
  });

  it.each(LANGS.filter(l => l !== 'en'))('%s agrees with en on every duration', lang => {
    // Duration drives the day strip and the completion ladder. A plan that is
    // 7 days in en and 5 in de would mark a user "done" or strand her two days
    // short of the end, depending on which way she switched.
    const other = (FEATURED_PLANS_SUMMARY as any)[lang] as typeof base;
    const byslug = new Map(other.map(p => [p.slug, p]));
    for (const p of base) {
      const q = byslug.get(p.slug);
      expect(q).toBeDefined();
      expect(`${p.slug}:${q!.duration}`).toBe(`${p.slug}:${p.duration}`);
    }
  });

  it.each(LANGS)('%s has no duplicate slugs', lang => {
    const arr = (FEATURED_PLANS_SUMMARY as any)[lang] as typeof base;
    expect(new Set(arr.map(p => p.slug)).size).toBe(arr.length);
  });
});

// The published banks live in docs/quiz-bank and are uploaded to R2 by
// scripts/upload_quiz_r2.sh. They are NOT bundled into the app, so this guards
// the content pipeline rather than the binary — which is the point: the bad
// upload is what reaches users.
const BANK_DIR = path.join(__dirname, '..', 'docs', 'quiz-bank');
const bankFor = (lang: string) =>
  JSON.parse(fs.readFileSync(path.join(BANK_DIR, `quiz-${lang}.json`), 'utf8'));

describe('quiz banks — id order must be identical across languages', () => {
  const en = bankFor('en');

  it('covers exactly the languages the app will request', () => {
    expect([...QUIZ_LANGS].sort()).toEqual([...LANGS].sort());
  });

  it.each(LANGS)('%s declares the shipped bank version', lang => {
    // A file whose bankVersion disagrees with the constant is rejected wholesale
    // by parseBankFile — the card would vanish in that language only.
    expect(bankFor(lang).bankVersion).toBe(QUIZ_BANK_VERSION);
  });

  it.each(LANGS)('%s stamps its own language code', lang => {
    // parseBankFile also rejects a file whose `lang` doesn't match what was
    // requested — the classic copy-paste-the-wrong-file upload.
    expect(bankFor(lang).lang).toBe(lang);
  });

  it.each(LANGS.filter(l => l !== 'en'))('%s has the same ids in the same ORDER as en', lang => {
    // Set composition indexes the bank by POSITION. Same ids in a different
    // order means position 7 is a different question per language: a user who
    // switches mid-set would have her stored answers graded against questions
    // she never saw. sessionAlignsWith() catches that at runtime and throws the
    // set away — this test stops it ever shipping.
    expect(bankFor(lang).questions.map((q: any) => q.id))
      .toEqual(en.questions.map((q: any) => q.id));
  });

  it.each(LANGS)('%s has a valid answerIndex on every question', lang => {
    for (const q of bankFor(lang).questions) {
      expect(Number.isInteger(q.answerIndex)).toBe(true);
      expect(q.answerIndex).toBeGreaterThanOrEqual(0);
      expect(q.answerIndex).toBeLessThan(q.options.length);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(LANGS.filter(l => l !== 'en'))('%s keeps the same option COUNT per question as en', lang => {
    // The bank mixes 2-option (true/false) and 4-option questions. A translation
    // that merged or split options would shift the answer key.
    expect(bankFor(lang).questions.map((q: any) => q.options.length))
      .toEqual(en.questions.map((q: any) => q.options.length));
  });

  it.each(LANGS)('%s has no blank question or option text', lang => {
    for (const q of bankFor(lang).questions) {
      expect(String(q.question).trim().length).toBeGreaterThan(0);
      for (const o of q.options) expect(String(o).trim().length).toBeGreaterThan(0);
    }
  });
});
