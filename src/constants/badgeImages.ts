import type { ImageSourcePropType } from 'react-native';

// Optional PNG override per badge id. Drop a file at
// `assets/badges/<id>.png` and add an entry below to make BadgeIcon render
// the image instead of the Feather-icon placeholder.
//
// React Native's `require()` only accepts a string literal, so this map has
// to enumerate each id explicitly. To add a badge:
//   1. Save the PNG at `assets/badges/<id>.png` (recommended ≥256×256, transparent).
//   2. Add `'<id>': require('../../assets/badges/<id>.png'),` below.
//
// File names use the achievement `id` verbatim (e.g. `prayer.streak7`,
// `milestone.crown`). The dot is fine in a filename — `prayer.streak7.png`.
//
// Image inventory after the v2.3 expansion (72 badges total):
//   • 46 IDs have shipped PNGs (carried over from the v1 set; no churn).
//   • 27 new IDs added in v2.3 do NOT have images yet — they fall back to
//     the Feather-icon placeholder until you source artwork. The list is
//     printed in the v2.3 implementation summary.

export const BADGE_IMAGES: Record<string, ImageSourcePropType> = {
  // ───── Prayer (8/8 with images) ─────────────────────────────────────────
  'prayer.first':     require('../../assets/badges/prayer.first.png'),
  'prayer.streak3':   require('../../assets/badges/prayer.streak3.png'),
  'prayer.streak7':   require('../../assets/badges/prayer.streak7.png'),
  'prayer.streak14':  require('../../assets/badges/prayer.streak14.png'),
  'prayer.streak30':  require('../../assets/badges/prayer.streak30.png'),
  'prayer.streak90':  require('../../assets/badges/prayer.streak90.png'),
  'prayer.streak100': require('../../assets/badges/prayer.streak100.png'),
  'prayer.streak365': require('../../assets/badges/prayer.streak365.png'),

  // ───── Scripture (9/10 with images — `scripture.streak3` is new) ────────
  'scripture.first':     require('../../assets/badges/scripture.first.png'),
  'scripture.read5':     require('../../assets/badges/scripture.read5.png'),
  'scripture.read10':    require('../../assets/badges/scripture.read10.png'),
  'scripture.read25':    require('../../assets/badges/scripture.read25.png'),
  'scripture.read50':    require('../../assets/badges/scripture.read50.png'),
  'scripture.read75':    require('../../assets/badges/scripture.read75.png'),
  'scripture.read100':   require('../../assets/badges/scripture.read100.png'),
  'scripture.streak7':   require('../../assets/badges/scripture.streak7.png'),
  'scripture.streak30':  require('../../assets/badges/scripture.streak30.png'),
  // MISSING: 'scripture.streak3' (Three Reading Days)

  // ───── Plans (9/14 with images — 5 new tiers added in v2.3) ─────────────
  'plan.first':         require('../../assets/badges/plan.first.png'),
  'plan.count3':        require('../../assets/badges/plan.count3.png'),
  'plan.count7':        require('../../assets/badges/plan.count7.png'),
  'plan.count15':       require('../../assets/badges/plan.count15.png'),
  'plan.count30':       require('../../assets/badges/plan.count30.png'),
  'plan.speed3in7':     require('../../assets/badges/plan.speed3in7.png'),
  'plan.speed5in30':    require('../../assets/badges/plan.speed5in30.png'),
  'plan.speed10in30':   require('../../assets/badges/plan.speed10in30.png'),
  'plan.deepRoots':     require('../../assets/badges/plan.deepRoots.png'),
  // MISSING: plan.count2, plan.count10, plan.count12, plan.count20, plan.count25

  // ───── Notes & Highlights + Books (10/31 with images — book ids moved
  //       from scripture, 21 new note/highlight tiers need artwork) ───────
  'note.first':           require('../../assets/badges/note.first.png'),
  'highlight.first':      require('../../assets/badges/highlight.first.png'),
  'note.count10':         require('../../assets/badges/note.count10.png'),
  'highlight.count50':    require('../../assets/badges/highlight.count50.png'),
  'note.count100':        require('../../assets/badges/note.count100.png'),
  'highlight.count300':   require('../../assets/badges/highlight.count300.png'),
  // Books — moved to "note" category in v2.3, file names unchanged (still
  // `scripture.books*.png`) since the id didn't churn.
  'scripture.books10':    require('../../assets/badges/scripture.books10.png'),
  'scripture.books20':    require('../../assets/badges/scripture.books20.png'),
  'scripture.books30':    require('../../assets/badges/scripture.books30.png'),
  'scripture.books50':    require('../../assets/badges/scripture.books50.png'),
  // MISSING (21): highlight.count10, note.count15, highlight.count15,
  //   note.count20, highlight.count20, note.count25, highlight.count25,
  //   note.count30, highlight.count30, note.count40, highlight.count40,
  //   note.count50, note.count75, highlight.count100, note.count150,
  //   highlight.count150, note.count200, highlight.count200, note.count250,
  //   highlight.count250, note.count300
  // DROPPED: note.count500 (no longer in v2.3 — image file orphaned, kept on disk)

  // ───── Milestones (9/9 with images) ─────────────────────────────────────
  'milestone.dawn7':       require('../../assets/badges/milestone.dawn7.png'),
  'milestone.triple':      require('../../assets/badges/milestone.triple.png'),
  'milestone.share1':      require('../../assets/badges/milestone.share1.png'),
  'milestone.share3':      require('../../assets/badges/milestone.share3.png'),
  'milestone.share5':      require('../../assets/badges/milestone.share5.png'),
  'milestone.anniversary': require('../../assets/badges/milestone.anniversary.png'),
  'milestone.river30':     require('../../assets/badges/milestone.river30.png'),
  'milestone.fullYear':    require('../../assets/badges/milestone.fullYear.png'),
  'milestone.crown':       require('../../assets/badges/milestone.crown.png'),
};
