// Daily verses are served by the SAME attested Worker as plans
// (plans.everlandapps.com), reading from a PRIVATE
// herbible-verses-7languages R2 bucket (public access disabled). Access
// requires a device-attestation Bearer token — the same gate plans use —
// so the content can't be trivially scraped from a public URL.
//
// Unlike plans (AES-encrypted at rest), verse files are plaintext JSON in
// the bucket: they're free core content, and keeping them plaintext lets
// them be drag-drop uploaded without an encryption step. The protection
// is attestation + private bucket, not at-rest encryption.
//
// The Worker route is `/v1/verses/<lang>.json`; the client reaches it via
// authedFetch (see dailyVersesService). DAILY_VERSES_VERSION no longer
// lives in the URL (the Worker + R2 ETags handle HTTP cache freshness) —
// it survives only as the local AsyncStorage cache tag, so bumping it
// forces every device to re-parse after a shape change.
//
// Publish steps (drag-drop, no encryption):
//   1. node scripts/gen_cdn_verses.mjs ./_incoming_verses ./_cdn_ready
//   2. Upload the seven _cdn_ready/verses_<lang>.json to the ROOT of the
//      herbible-verses-7languages bucket (drag-drop in the R2 dashboard,
//      or ./scripts/upload_daily_verses_r2.sh).
//   3. Bump DAILY_VERSES_VERSION below only if the JSON SHAPE changed
//      (not for routine content edits — ETag handles those).

// Local AsyncStorage cache tag. Bump on a schema/shape change to discard
// every device's stale parsed copy.
export const DAILY_VERSES_VERSION = 'v4';

// ⚠️ CONTENT-BATCH PATH VERSION — the hard lesson of batch 2 (2026-08-30):
// shipped builds re-fetch this bucket on EVERY cold start
// (DailyVersesContext's language effect → fetchAndCacheDailyVerses), so
// overwriting the same keys with a batch an old build cannot render would
// break LIVE users instantly (batch 2 ships modern.text empty; the old
// slim() accepted it and would render 840 blank verse pages). Every
// content-breaking batch therefore gets its own key prefix; old builds keep
// reading their own files forever. Same-key overwrite + ETag remains fine
// ONLY for shape-compatible fixes within a batch.
export const DAILY_VERSES_PATH = 'v4';

// Daily verses are served PUBLICLY + R2-direct from the dedicated
// herbible-verses-7languages bucket, exposed via its own R2 Custom Domain
// `verses.everlandapps.com`. (The attested herbible-plans Worker never had a
// /v1/verses/ route, so the old attested URL silently 404'd and the app fell
// back to the 3-day bundle.) Verses are free core content, so public is fine.
// Files live at the BUCKET ROOT keeping their uploaded name `verses_<lang>.json`
// — no re-upload needed, the bucket just gained a public custom domain.
//   e.g. https://verses.everlandapps.com/verses_en.json
// NOTE: if you bind a different subdomain, update VERSES_HOST below.
const VERSES_HOST = 'https://verses.everlandapps.com';
export function dailyVersesUrl(lang: string): string {
  return `${VERSES_HOST}/${DAILY_VERSES_PATH}/verses_${lang}.json`;
}

// Holiday daily-verse override files. Served PUBLICLY + R2-direct (no Worker,
// no attestation) from the herbible-plans-7languages bucket behind
// covers.everlandapps.com — the herbible-verses bucket is private/Worker-gated
// and we don't redeploy that Worker from the app repo. Holiday verses are free
// core content + only ~20 entries, so a plain public path is the cheaper,
// simpler home (zero egress on R2 direct). Path-versioned `/v1/` for cache-bust.
export function holidayVersesUrl(lang: string): string {
  return `https://covers.everlandapps.com/v1/holiday-verses/${lang}.json`;
}
