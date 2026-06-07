// i18n NOTE: the `label` fields on EMOTION_TAGS, SUBTAB_OVERRIDE / SUBTAB_ORDER,
// and the values of PLAN_SECTION_LABELS are CATALOG KEYS (e.g.
// 'plansMeta.section.emotions'), not pre-localized strings — every render site
// must pass them through `t(...)` from `useT()`, else the raw key shows.

// Pinned configuration for the Cloudflare-Worker-backed plans pipeline.
// Bumping SUMMARY_VERSION invalidates every device's cached summaries — use
// when the schema or content of summaries/plans changes meaningfully.

// NOTE: pointed at the Worker's *.workers.dev host (not the plans.everlandapps.com
// custom domain) on purpose. The Worker's dev-bypass for attestation only fires
// when DEV_BYPASS_ATTEST=1 AND the request host is a "dev host" — and its
// isDevHost() treats any *.workers.dev hostname as a dev host. Routing the app
// through this URL lets attest mint a session token from just { platform } (no
// Play Integrity), which is what unblocks plan-day content. Revert to
// 'https://plans.everlandapps.com' once real Play Integrity attestation is wired
// (requires Expo SDK 55+, where @expo/app-integrity is available).
export const PLANS_API_BASE = 'https://herbible-plans-7languages.sangchy1972.workers.dev';
// 1.1.0 — day_outlines gains `scripture_refs: string[]` and cover.image_url
// is now null (AI covers retired in favour of gradient + icon).
export const PLANS_SUMMARY_VERSION = '1.1.0';

// CDN base for plan-cover images. URLs are constructed client-side as
// `${PLAN_COVER_CDN_BASE}/<plan-slug>.webp` so the app doesn't need to
// reissue the plans summary every time the cover library changes. Point
// this at your R2 bucket's public domain (or the existing plans Worker
// proxy) once the 113 WebP covers are uploaded under that prefix.
//
// Hosted on R2 directly: free egress, ~$0/month at any realistic scale
// (see `_plan-covers-staging/` for the 9 MB ready-to-upload payload).
//
// While the URL is unreachable / 404s, PlanCover falls back to the
// existing gradient + book-icon placeholder, so swapping this constant
// is the only line change required at switch-over time.
//
// Connected to the `herbible-audio-7languages` R2 bucket via the
// covers.everlandapps.com custom domain (Cloudflare-managed SSL).
// Bucket key layout: v1/covers/<plan-slug>.webp.
export const PLAN_COVER_CDN_BASE = 'https://covers.everlandapps.com/v1/covers';

// Google Cloud Project number for Play Integrity (find it in the GCP console:
// IAM & Admin → Settings → "Project number"). Required on Android. Set to 0
// to opt out (the dev bypass on the Worker still has to be on).
export const PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER = 312250019928;

// Session-token cache key for the attest flow.
export const plansTokenKey = () => `plans:token`;

// The 5 sections that hold real plans. Featured is computed, not stored.
export const PLAN_SECTIONS = [
  'emotions',
  'walking-with-god',
  'personal-growth',
  'roles-identity',
  'life-seasons',
] as const;
export type PlanSectionId = typeof PLAN_SECTIONS[number];

// UI labels per section — values are i18n catalog KEYS (resolve with `t(...)`
// at render time). Used as fallback when summary section_label is missing or
// generic. The emotions section's canonical title is the question prompt
// "How Are You Feeling Today?" — PlanCategoryScreen shortens it to "Emotions"
// using its own dedicated key once routed into the category view.
export const PLAN_SECTION_LABELS: Record<PlanSectionId, string> = {
  'emotions': 'plansMeta.section.emotions',
  'walking-with-god': 'plansMeta.section.walking',
  'personal-growth': 'plansMeta.section.growth',
  'roles-identity': 'plansMeta.section.roles',
  'life-seasons': 'plansMeta.section.seasons',
};

// "How Are You Feeling Today?" tags on the Plan tab. Each tag's `secondary`
// is the slug PlanCategoryScreen will preselect when tapped — it must match a
// real `secondary` value present in the cloud `emotions` section, otherwise
// the screen falls back to its empty state. Sibling secondaries (e.g.
// `anxiety-fear`) remain accessible as adjacent pills inside PlanCategory.
interface EmotionTag {
  /** i18n catalog key — resolve with `t(label)` at the render site. */
  label: string;
  color: string;
  secondary: string;
}

// Macaron-inspired emotion palette — softer, creamier hues with warm undertones
// (think Ladurée box). Lightness sits at ~55-65 % so each pill reads as a
// powdery pastel rather than a saturated swatch, while still keeping white
// 800-weight 12.65 pt text at ~3.0 WCAG AA Large contrast.
// 9 emotion themes after user-driven consolidation:
//   焦虑 / 愤怒 / 悲伤 / 孤独 / 喜乐 / 疲惫 / 恐惧 / 羞愧 / 饶恕
// COMPARISON tag retired — its plan `the-comparison-cage` folds into ANXIETY.
// DEVOTION tag retired — its plan `after-a-painful-season` folds into GRIEF.
// `secondary` here doubles as the sub-tab pill id in `SUBTAB_OVERRIDE.emotions`
// below, so a tap on the mood pill on Plan tab routes into PlanCategoryScreen
// and lands on the matching sub-tab (the override branch picks `activeTab`
// from `initialSecondary`). Keep these in sync if either side is renamed.
// Palette nudged toward richer macaron tones per user — saturation up ~15 %,
// lightness down ~5 % so each pill reads with a bit more conviction while
// staying in the same warm pastel family. White 800-weight 12.65 pt label
// still clears WCAG AA Large (≥ 3.0 contrast) on every swatch.
export const EMOTION_TAGS: EmotionTag[] = [
  { label: 'plansMeta.emotion.anxiety',     color: '#4D8AC8', secondary: 'anxiety' },        // 焦虑 — bolder ocean blue
  { label: 'plansMeta.emotion.anger',       color: '#DD7A5E', secondary: 'anger' },          // 愤怒 — richer terracotta
  { label: 'plansMeta.emotion.grief',       color: '#A085C9', secondary: 'grief' },          // 悲伤 — deeper lilac (now visibly distinct from LONELINESS below)
  { label: 'plansMeta.emotion.loneliness',  color: '#7A6BC4', secondary: 'loneliness' },     // 孤独 — deeper blue-lavender
  { label: 'plansMeta.emotion.joy',         color: '#F08C3A', secondary: 'joy' },            // 喜乐 — bright orange (was saffron; user wanted a punchier hot-orange)
  { label: 'plansMeta.emotion.weariness',   color: '#E06478', secondary: 'weariness' },      // 疲惫 — coral red-pink (was salmon; pushed toward the pink-red family per user)
  { label: 'plansMeta.emotion.fear',        color: '#74859E', secondary: 'fear' },           // 恐惧 — deeper steel blue
  { label: 'plansMeta.emotion.shame',       color: '#DC7295', secondary: 'shame' },          // 羞愧 — rose pink (was peachy rose; brighter pink per user, distinct from WEARINESS's red-pink)
  { label: 'plansMeta.emotion.forgiveness', color: '#6FAB6C', secondary: 'forgiveness' },    // 饶恕 — richer sage
];

// Per-section sub-tab override: real_slug → { id, label }. Originally
// authored from `计划结构总览_113.md` (113 plans · 4 non-emotion sections
// × N sub-tabs); the emotions section was added later to align its 11
// sub-tabs with the mood pill grid on the Plan tab (the CDN ships 16
// distinct emotion secondaries, which would otherwise expand the strip
// inside PlanCategoryScreen to 16+ pills and break parity with the 11
// pills outside). Drives the pill strip on PlanCategoryScreen; replaces
// whatever `secondary` the CDN happens to carry so the front-end controls
// the taxonomy.
//
// `label` values are i18n catalog KEYS — resolve with `t(label)` at the
// render site (PlanCategoryScreen pill strip). Consumers that read `id`
// only (e.g. routing / filtering) need no change.
export const SUBTAB_OVERRIDE: Record<string, Record<string, { id: string; label: string }>> = {
  'walking-with-god': {
    'gift-of-sabbath':              { id: 'draw-near',     label: 'plansMeta.sub.drawNear' },
    'rhythms-of-prayer':            { id: 'draw-near',     label: 'plansMeta.sub.drawNear' },
    'scripture-memory-14-days':     { id: 'draw-near',     label: 'plansMeta.sub.drawNear' },
    'fasting-women-who-fasted':     { id: 'draw-near',     label: 'plansMeta.sub.drawNear' },
    'discover-your-gifts':          { id: 'living-faith',  label: 'plansMeta.sub.livingFaith' },
    'proverbs-31-days':             { id: 'living-faith',  label: 'plansMeta.sub.livingFaith' },
    'walking-with-jesus-in-luke':   { id: 'her-story',     label: 'plansMeta.sub.herStory' },
    'women-of-scripture-90-days':   { id: 'her-story',     label: 'plansMeta.sub.herStory' },
    'his-presence-in-lament':       { id: 'gods-presence', label: 'plansMeta.sub.godsPresence' },
    'walking-through-psalms':       { id: 'gods-presence', label: 'plansMeta.sub.godsPresence' },
    'walking-with-the-spirit':      { id: 'gods-presence', label: 'plansMeta.sub.godsPresence' },
  },
  'personal-growth': {
    'body-as-temple':              { id: 'body-and-identity',           label: 'plansMeta.sub.bodyIdentity' },
    'meeting-a-better-self':       { id: 'body-and-identity',           label: 'plansMeta.sub.bodyIdentity' },
    'true-beauty':                 { id: 'body-and-identity',           label: 'plansMeta.sub.bodyIdentity' },
    'learning-to-receive':         { id: 'relationships-and-formation', label: 'plansMeta.sub.relsFormation' },
    'healthy-boundaries':          { id: 'relationships-and-formation', label: 'plansMeta.sub.relsFormation' },
    'shaped-by-the-spirit':        { id: 'relationships-and-formation', label: 'plansMeta.sub.relsFormation' },
    'the-power-of-words':          { id: 'relationships-and-formation', label: 'plansMeta.sub.relsFormation' },
    'a-wise-steward-of-finances':  { id: 'calling-and-stewardship',     label: 'plansMeta.sub.callingStew' },
    'living-on-mission':           { id: 'calling-and-stewardship',     label: 'plansMeta.sub.callingStew' },
    'finding-your-calling':        { id: 'calling-and-stewardship',     label: 'plansMeta.sub.callingStew' },
    'resting-place-for-the-soul':  { id: 'soul-care',                   label: 'plansMeta.sub.soulCare' },
    'from-victim-to-steward':      { id: 'soul-care',                   label: 'plansMeta.sub.soulCare' },
  },
  'roles-identity': {
    'she-leads':                          { id: 'daughter-of-god',          label: 'plansMeta.sub.daughterOfGod' },
    'beloved-daughter-of-god':            { id: 'daughter-of-god',          label: 'plansMeta.sub.daughterOfGod' },
    'becoming-who-god-says':              { id: 'daughter-of-god',          label: 'plansMeta.sub.daughterOfGod' },
    'peeling-off-the-labels':             { id: 'daughter-of-god',          label: 'plansMeta.sub.daughterOfGod' },
    'no-more-comparison':                 { id: 'daughter-of-god',          label: 'plansMeta.sub.daughterOfGod' },
    'wisdom-in-dating':                   { id: 'love-and-dating',          label: 'plansMeta.sub.loveDating' },
    'anchor-for-your-heart':              { id: 'love-and-dating',          label: 'plansMeta.sub.loveDating' },
    'building-love-on-solid-ground':      { id: 'love-and-dating',          label: 'plansMeta.sub.loveDating' },
    'dont-settle-for-less-than-love':     { id: 'love-and-dating',          label: 'plansMeta.sub.loveDating' },
    'newlywed-spring':                    { id: 'marriage-and-wifehood',    label: 'plansMeta.sub.marriageWifehood' },
    'journey-of-loves-rebirth':           { id: 'marriage-and-wifehood',    label: 'plansMeta.sub.marriageWifehood' },
    'finding-each-other-again':           { id: 'marriage-and-wifehood',    label: 'plansMeta.sub.marriageWifehood' },
    'gentle-words-strong-love':           { id: 'marriage-and-wifehood',    label: 'plansMeta.sub.marriageWifehood' },
    'holding-on-to-yourself-in-marriage': { id: 'marriage-and-wifehood',    label: 'plansMeta.sub.marriageWifehood' },
    'stepmothers-courage':                { id: 'motherhood',               label: 'plansMeta.sub.motherhood' },
    'first-time-mother':                  { id: 'motherhood',               label: 'plansMeta.sub.motherhood' },
    'mothers-heart':                      { id: 'motherhood',               label: 'plansMeta.sub.motherhood' },
    'not-perfect-still-good-mom':         { id: 'motherhood',               label: 'plansMeta.sub.motherhood' },
    'motherhood-begins-with-trust':       { id: 'motherhood',               label: 'plansMeta.sub.motherhood' },
    'perfect-mom-trap':                   { id: 'motherhood',               label: 'plansMeta.sub.motherhood' },
    'calling-at-work':                    { id: 'work-and-calling',         label: 'plansMeta.sub.workCalling' },
    'redefining-success':                 { id: 'work-and-calling',         label: 'plansMeta.sub.workCalling' },
    'faith-in-the-room':                  { id: 'work-and-calling',         label: 'plansMeta.sub.workCalling' },
    'free-from-people-pleasing':          { id: 'work-and-calling',         label: 'plansMeta.sub.workCalling' },
    'whole-in-singleness':                { id: 'single-and-whole',         label: 'plansMeta.sub.singleWhole' },
    'sacred-adventure-singleness':        { id: 'single-and-whole',         label: 'plansMeta.sub.singleWhole' },
    'gift-of-solitude':                   { id: 'single-and-whole',         label: 'plansMeta.sub.singleWhole' },
    'whole-while-you-wait':               { id: 'single-and-whole',         label: 'plansMeta.sub.singleWhole' },
    'a-covenant-of-sisters':              { id: 'sisterhood-and-friendship', label: 'plansMeta.sub.sisterhood' },
    'friendship-sharpens-strengthens':    { id: 'sisterhood-and-friendship', label: 'plansMeta.sub.sisterhood' },
    'healing-jealousy-friendship':        { id: 'sisterhood-and-friendship', label: 'plansMeta.sub.sisterhood' },
    'spiritual-companions':               { id: 'sisterhood-and-friendship', label: 'plansMeta.sub.sisterhood' },
    'daughter-and-mother':                { id: 'as-a-daughter',            label: 'plansMeta.sub.asADaughter' },
    'caring-for-aging-parents':           { id: 'as-a-daughter',            label: 'plansMeta.sub.asADaughter' },
  },
  'life-seasons': {
    'spring-of-youth':                { id: 'early-light',       label: 'plansMeta.sub.earlyLight' },
    'first-job-spiritual-guide':      { id: 'early-light',       label: 'plansMeta.sub.earlyLight' },
    'hearing-his-voice':              { id: 'early-light',       label: 'plansMeta.sub.earlyLight' },
    'different-kind-of-twenties':     { id: 'early-light',       label: 'plansMeta.sub.earlyLight' },
    'summer-choices':                 { id: 'full-bloom',        label: 'plansMeta.sub.fullBloom' },
    'blooming-under-pressure':        { id: 'full-bloom',        label: 'plansMeta.sub.fullBloom' },
    'grace-on-balance-beam':          { id: 'full-bloom',        label: 'plansMeta.sub.fullBloom' },
    'wisdom-for-everyday-life':       { id: 'full-bloom',        label: 'plansMeta.sub.fullBloom' },
    'golden-depths':                  { id: 'harvest-season',    label: 'plansMeta.sub.harvestSeason' },
    'new-chapter-empty-nest':         { id: 'harvest-season',    label: 'plansMeta.sub.harvestSeason' },
    'body-changes-life-changes':      { id: 'harvest-season',    label: 'plansMeta.sub.harvestSeason' },
    'midlife-reset':                  { id: 'harvest-season',    label: 'plansMeta.sub.harvestSeason' },
    'what-took-time-still-beautiful': { id: 'harvest-season',    label: 'plansMeta.sub.harvestSeason' },
    'the-gift-of-retirement':         { id: 'evening-grace',     label: 'plansMeta.sub.eveningGrace' },
    'evening-wisdom':                 { id: 'evening-grace',     label: 'plansMeta.sub.eveningGrace' },
    'growing-older-with-grace':       { id: 'evening-grace',     label: 'plansMeta.sub.eveningGrace' },
    'still-becoming-later-years':     { id: 'evening-grace',     label: 'plansMeta.sub.eveningGrace' },
    'life-ripened-by-grace':          { id: 'evening-grace',     label: 'plansMeta.sub.eveningGrace' },
    'walking-through-loss':           { id: 'threshold-seasons', label: 'plansMeta.sub.thresholdSeasons' },
    'longing-for-a-child':            { id: 'threshold-seasons', label: 'plansMeta.sub.thresholdSeasons' },
    'her-cross-cultural-journey':     { id: 'threshold-seasons', label: 'plansMeta.sub.thresholdSeasons' },
    'hope-in-waiting':                { id: 'threshold-seasons', label: 'plansMeta.sub.thresholdSeasons' },
    'old-life-no-longer-fits':        { id: 'threshold-seasons', label: 'plansMeta.sub.thresholdSeasons' },
    'starting-over-not-from-zero':    { id: 'threshold-seasons', label: 'plansMeta.sub.thresholdSeasons' },
    'holy-work-of-beginning-again':   { id: 'threshold-seasons', label: 'plansMeta.sub.thresholdSeasons' },
  },
  // Emotions — 31 plans collapsed into the 11-theme taxonomy authored by the
  // user (focused single-word categories). CDN ships 16 distinct `secondary`
  // tokens (anxiety / anxiety-fear / weariness-burnout / grief-disappointment
  // / …) which the fallback path would expand into 16+ sub-tab pills; this
  // override is what reconciles them with the 11 mood tags on the Plan tab
  // so the inside count always matches the outside count. Pill ids must
  // equal `EMOTION_TAGS[*].secondary` so a tap on a mood pill routes into
  // the matching sub-tab.
  'emotions': {
    // 焦虑 (absorbs the retired "comparison" plan `the-comparison-cage`)
    'overcoming-anxiety':              { id: 'anxiety',     label: 'plansMeta.subEmotion.anxiety' },
    'letting-go-of-control':           { id: 'anxiety',     label: 'plansMeta.subEmotion.anxiety' },
    'anxiety-closing-in':              { id: 'anxiety',     label: 'plansMeta.subEmotion.anxiety' },
    'thoughts-keep-me-up':             { id: 'anxiety',     label: 'plansMeta.subEmotion.anxiety' },
    'the-comparison-cage':             { id: 'anxiety',     label: 'plansMeta.subEmotion.anxiety' },
    // 愤怒 (folds in former "anger-bitterness" cohort)
    'hurt-cannot-swallow':             { id: 'anger',       label: 'plansMeta.subEmotion.anger' },
    'unspoken-hurt-hardens-heart':     { id: 'anger',       label: 'plansMeta.subEmotion.anger' },
    'do-not-let-hurt-stay':            { id: 'anger',       label: 'plansMeta.subEmotion.anger' },
    // 悲伤 (absorbs the retired "devotion" plan `after-a-painful-season`)
    'tears-are-also-a-prayer':         { id: 'grief',       label: 'plansMeta.subEmotion.grief' },
    'permission-to-lament':            { id: 'grief',       label: 'plansMeta.subEmotion.grief' },
    'tears-become-prayer':             { id: 'grief',       label: 'plansMeta.subEmotion.grief' },
    'life-not-turn-out':               { id: 'grief',       label: 'plansMeta.subEmotion.grief' },
    'hope-feels-delayed':              { id: 'grief',       label: 'plansMeta.subEmotion.grief' },
    'after-a-painful-season':          { id: 'grief',       label: 'plansMeta.subEmotion.grief' },
    // 孤独
    'through-the-valley-of-loneliness':{ id: 'loneliness',  label: 'plansMeta.subEmotion.loneliness' },
    'no-one-understands':              { id: 'loneliness',  label: 'plansMeta.subEmotion.loneliness' },
    'heart-empty-after':               { id: 'loneliness',  label: 'plansMeta.subEmotion.loneliness' },
    'empty-places-back-to-god':        { id: 'loneliness',  label: 'plansMeta.subEmotion.loneliness' },
    // 喜乐
    'daily-breath-of-gratitude':       { id: 'joy',         label: 'plansMeta.subEmotion.joy' },
    'discovering-everyday-miracles':   { id: 'joy',         label: 'plansMeta.subEmotion.joy' },
    'return-heart-to-gratitude':       { id: 'joy',         label: 'plansMeta.subEmotion.joy' },
    'joy-gratitude-daily-life':        { id: 'joy',         label: 'plansMeta.subEmotion.joy' },
    // 疲惫
    'restored-from-burnout':           { id: 'weariness',   label: 'plansMeta.subEmotion.weariness' },
    'courage-to-be-still':             { id: 'weariness',   label: 'plansMeta.subEmotion.weariness' },
    'right-to-disconnect':             { id: 'weariness',   label: 'plansMeta.subEmotion.weariness' },
    'set-down-heavy-wings':            { id: 'weariness',   label: 'plansMeta.subEmotion.weariness' },
    'slow-to-hear-god':                { id: 'weariness',   label: 'plansMeta.subEmotion.weariness' },
    // 恐惧
    'sitting-with-fear':               { id: 'fear',        label: 'plansMeta.subEmotion.fear' },
    'reclaiming-heart-from-fear':      { id: 'fear',        label: 'plansMeta.subEmotion.fear' },
    // 羞愧
    'unbinding-shame':                 { id: 'shame',       label: 'plansMeta.subEmotion.shame' },
    // 饶恕
    'freedom-of-forgiveness':          { id: 'forgiveness', label: 'plansMeta.subEmotion.forgiveness' },
  },
};

// Sub-tab pill order per section. `label` values are i18n catalog KEYS —
// resolve with `t(label)` at the render site (PlanCategoryScreen).
export const SUBTAB_ORDER: Record<string, Array<{ id: string; label: string }>> = {
  'walking-with-god': [
    { id: 'draw-near',     label: 'plansMeta.sub.drawNear' },
    { id: 'living-faith',  label: 'plansMeta.sub.livingFaith' },
    { id: 'her-story',     label: 'plansMeta.sub.herStory' },
    { id: 'gods-presence', label: 'plansMeta.sub.godsPresence' },
  ],
  'personal-growth': [
    { id: 'body-and-identity',            label: 'plansMeta.sub.bodyIdentity' },
    { id: 'relationships-and-formation',  label: 'plansMeta.sub.relsFormation' },
    { id: 'calling-and-stewardship',      label: 'plansMeta.sub.callingStew' },
    { id: 'soul-care',                    label: 'plansMeta.sub.soulCare' },
  ],
  'roles-identity': [
    { id: 'daughter-of-god',           label: 'plansMeta.sub.daughterOfGod' },
    { id: 'love-and-dating',           label: 'plansMeta.sub.loveDating' },
    { id: 'marriage-and-wifehood',     label: 'plansMeta.sub.marriageWifehood' },
    { id: 'motherhood',                label: 'plansMeta.sub.motherhood' },
    { id: 'work-and-calling',          label: 'plansMeta.sub.workCalling' },
    { id: 'single-and-whole',          label: 'plansMeta.sub.singleWhole' },
    { id: 'sisterhood-and-friendship', label: 'plansMeta.sub.sisterhood' },
    { id: 'as-a-daughter',             label: 'plansMeta.sub.asADaughter' },
  ],
  'life-seasons': [
    { id: 'early-light',       label: 'plansMeta.sub.earlyLight' },
    { id: 'full-bloom',        label: 'plansMeta.sub.fullBloom' },
    { id: 'harvest-season',    label: 'plansMeta.sub.harvestSeason' },
    { id: 'evening-grace',     label: 'plansMeta.sub.eveningGrace' },
    { id: 'threshold-seasons', label: 'plansMeta.sub.thresholdSeasons' },
  ],
  // Emotions sub-tab order — same 9-theme order as EMOTION_TAGS so the strip
  // on PlanCategoryScreen reads left-to-right in the same order users see on
  // the Plan tab's mood grid. (Comparison + Devotion retired; their single
  // plans were folded into Anxiety / Grief respectively.)
  'emotions': [
    { id: 'anxiety',     label: 'plansMeta.subEmotion.anxiety' },
    { id: 'anger',       label: 'plansMeta.subEmotion.anger' },
    { id: 'grief',       label: 'plansMeta.subEmotion.grief' },
    { id: 'loneliness',  label: 'plansMeta.subEmotion.loneliness' },
    { id: 'joy',         label: 'plansMeta.subEmotion.joy' },
    { id: 'weariness',   label: 'plansMeta.subEmotion.weariness' },
    { id: 'fear',        label: 'plansMeta.subEmotion.fear' },
    { id: 'shame',       label: 'plansMeta.subEmotion.shame' },
    { id: 'forgiveness', label: 'plansMeta.subEmotion.forgiveness' },
  ],
};
