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

import { PLANS_API_BASE } from './plansApi';

// Local AsyncStorage cache tag. Bump on a schema/shape change to discard
// every device's stale parsed copy. Not part of the URL anymore.
export const DAILY_VERSES_VERSION = 'v1';

export function dailyVersesUrl(lang: string): string {
  return `${PLANS_API_BASE}/v1/verses/${lang}.json`;
}
