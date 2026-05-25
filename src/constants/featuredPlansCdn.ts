// Where the full per-language Featured Plans JSON files live. Mirrors the
// daily-verses + bibles pattern: GitHub repo served via jsDelivr, pinned by
// commit SHA so AsyncStorage cache keys auto-invalidate on every bump.
//
// Upload steps (one-time, then on every content update):
//   1. Push the `featured_plans/<lang>/<slug>.json` files into the repo
//      below at path `featured-plans/<lang>/<slug>.json`.
//   2. Replace FEATURED_PLANS_COMMIT with the new commit SHA.
//   3. Bump scripts/build_plans_summary.mjs output too if any summary
//      fields changed.
//
// Until this commit is real, full-plan fetches will 404 — but the bundled
// summary still drives Explore + PlanDetail, and PlanDayWalk shows a
// "content unavailable" notice instead of crashing.

export const FEATURED_PLANS_REPO = 'sangchy1972/pd-text-corpus';

// 57201fc — initial featured-plans push: 54 × 7 languages + walking_with_god
//           supplementary set. Corpus is now serving real Day content from
//           CDN; PlanDayWalk no longer falls back to its empty state.
export const FEATURED_PLANS_COMMIT = '57201fca983bb2358bd7f920493d8d5c1a565cd7';

export function featuredPlanUrl(lang: string, slug: string): string {
  return `https://cdn.jsdelivr.net/gh/${FEATURED_PLANS_REPO}@${FEATURED_PLANS_COMMIT}/featured-plans/${lang}/${slug}.json`;
}
