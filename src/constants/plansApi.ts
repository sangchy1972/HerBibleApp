// Pinned configuration for the Cloudflare-Worker-backed plans pipeline.
// Bumping SUMMARY_VERSION invalidates every device's cached summaries — use
// when the schema or content of summaries/plans changes meaningfully.

export const PLANS_API_BASE = 'https://plans.everlandapps.com';
export const PLANS_SUMMARY_VERSION = '1.0.0';

// Google Cloud Project number for Play Integrity (find it in the GCP console:
// IAM & Admin → Settings → "Project number"). Required on Android. Set to 0
// to opt out (the dev bypass on the Worker still has to be on).
export const PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER = 312250019928;

// Cache keys (suffixed with version so a bump auto-invalidates).
export const plansTokenKey = () => `plans:token`;
export const plansSummaryKey = (lang: string) => `plans:summary:${PLANS_SUMMARY_VERSION}:${lang}`;
export const plansFullKey = (lang: string, slug: string) => `plans:full:${PLANS_SUMMARY_VERSION}:${lang}:${slug}`;
export const planProfileKey = () => `plans:profile:v1`;
export const planBehaviorKey = () => `plans:behavior:v1`;

// The 5 sections that hold real plans. Featured is computed, not stored.
export const PLAN_SECTIONS = [
  'emotions',
  'walking-with-god',
  'personal-growth',
  'roles-identity',
  'life-seasons',
] as const;
export type PlanSectionId = typeof PLAN_SECTIONS[number];

// UI labels per section (overrides what's stored in data so we control the
// "How Are You Feeling Today?" wording etc.). Used as fallback when summary
// section_label is missing or generic.
export const PLAN_SECTION_LABELS: Record<PlanSectionId, string> = {
  'emotions': 'How Are You Feeling Today?',
  'walking-with-god': 'Walking with God',
  'personal-growth': 'Personal Growth',
  'roles-identity': 'Roles & Identity',
  'life-seasons': 'Life Seasons',
};

export const PLAN_SECTION_DESC: Record<PlanSectionId, string> = {
  'emotions': 'Anxiety, grief, joy, fear — meet God where you are',
  'walking-with-god': 'Prayer, devotion & spiritual rhythms',
  'personal-growth': 'Identity, courage & wisdom',
  'roles-identity': 'Womanhood, marriage & motherhood',
  'life-seasons': 'Singleness, transitions & waiting',
};

// "How Are You Feeling Today?" tags on the Plan tab. Each tag's `secondary`
// is the slug PlanCategoryScreen will preselect when tapped — it must match a
// real `secondary` value present in the cloud `emotions` section, otherwise
// the screen falls back to its empty state. Sibling secondaries (e.g.
// `anxiety-fear`) remain accessible as adjacent pills inside PlanCategory.
export interface EmotionTag {
  label: string;
  color: string;
  secondary: string;
}

export const EMOTION_TAGS: EmotionTag[] = [
  { label: 'ANXIETY',     color: '#A8C0E0', secondary: 'anxiety' },
  { label: 'FEAR',        color: '#9AAAC0', secondary: 'fear' },
  { label: 'ANGER',       color: '#D9762A', secondary: 'anger' },
  { label: 'BITTERNESS',  color: '#88C2B9', secondary: 'bitterness' },
  { label: 'GRIEF',       color: '#B6A6E0', secondary: 'grief' },
  { label: 'JOY',         color: '#F0CC85', secondary: 'joy' },
  { label: 'WEARINESS',   color: '#F4AC93', secondary: 'weariness' },
  { label: 'LONELINESS',  color: '#C9B8E5', secondary: 'loneliness' },
  { label: 'FORGIVENESS', color: '#A5C9AE', secondary: 'forgiveness' },
  { label: 'SHAME',       color: '#E5B5B0', secondary: 'shame' },
  { label: 'COMPARISON',  color: '#D4C5A0', secondary: 'comparison' },
  { label: 'HEALING',     color: '#F2A6BF', secondary: 'soul-care' },
];
