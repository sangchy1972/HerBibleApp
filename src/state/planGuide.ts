// The plan-discovery guide's decision rules — pure, zero-import, unit-tested.
//
// Two ways in (owner spec):
//   'home'  — nudged: the user has NEVER opened the Plan tab, the home screen's
//             prayer CTA has gone quiet (prayed, or the slot is locked), and
//             the first-run tour is behind her. 3 steps: the Plan tab icon →
//             the Explore pill → the how-are-you-feeling row.
//   'self'  — she found the Plan tab on her own before we nudged: teach from
//             the Explore pill on. 2 steps.
// Either way the guide runs ONCE ever (done flag burns on display).

export type PlanGuideEntry = 'home' | 'self';
export type PlanGuideStep = 'tab' | 'explore' | 'mood';

export function planGuideSteps(entry: PlanGuideEntry): PlanGuideStep[] {
  return entry === 'home' ? ['tab', 'explore', 'mood'] : ['explore', 'mood'];
}

/** 1-based position + total for the bubble's "n of total" counter. */
export function planGuideCounter(entry: PlanGuideEntry, step: PlanGuideStep): { n: number; total: number } {
  const steps = planGuideSteps(entry);
  return { n: Math.max(1, steps.indexOf(step) + 1), total: steps.length };
}

/** May the HOME nudge offer itself? (The coordinator adds its own gates.) */
export function planGuideEligibleFromHome(done: boolean, planVisited: boolean, ctaQuiet: boolean): boolean {
  return !done && !planVisited && ctaQuiet;
}

/** May the self-discovery path start when the Plan tab gains focus? */
export function planGuideEligibleSelf(done: boolean): boolean {
  return !done;
}
