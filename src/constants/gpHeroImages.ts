// Per-chapter hero art for the Gospels & Psalms reader (owner 2026-09-05:
// replace the shared prayer-background hero with the reading's own picture).
//
// 241 pieces live on the covers domain under backgrounds/gp/v1/ — one per
// Gospel chapter (Matthew 28, Mark 16, Luke 24, John 21 = 89) and one per
// Psalm (150), plus TWO range-specific pieces for Psalm 18's split days
// (plan days 29/30 read Ps 18:1–25 / 26–50). Filenames mirror the owner's
// source set, converted PNG → 1280px q72 JPEG by scripts/upload_gp_heroes.sh:
//   gp_gospel_<slug>_<NN>.jpg      NN = chapter, 2-digit
//   gp_psalm_<NNN>.jpg             NNN = psalm, 3-digit
//   gp_psalm_018_v001-025.jpg      the only two range pieces that exist
//
// Split psalms WITHOUT their own range art (105, 106, 119) fall back to the
// whole-psalm piece — every range renders SOME correct picture. If more
// range art ships later, upload it and extend RANGE_ART; nothing else moves.
//
// The path is versioned (/v1/) — the covers domain is bound to the bucket
// root and Cloudflare caches hard, so a re-cut set goes under /v2/, never a
// same-name overwrite (CLAUDE.md R2 rule).
import type { GospelRef, PsalmRef } from './gospelsPsalmsPlan';

export const GP_HERO_BASE = 'https://covers.everlandapps.com/backgrounds/gp/v1';

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');

// Ranges that have their own dedicated artwork on the CDN.
const RANGE_ART = new Set(['018_v001-025', '018_v026-050']);

export function gpGospelHeroUrl(g: GospelRef): string {
  return `${GP_HERO_BASE}/gp_gospel_${g.bookSlug}_${pad2(g.chapter)}.jpg`;
}

export function gpPsalmHeroUrl(p: PsalmRef): string {
  if (p.vStart != null && p.vEnd != null) {
    const key = `${pad3(p.chapter)}_v${pad3(p.vStart)}-${pad3(p.vEnd)}`;
    if (RANGE_ART.has(key)) return `${GP_HERO_BASE}/gp_psalm_${key}.jpg`;
  }
  return `${GP_HERO_BASE}/gp_psalm_${pad3(p.chapter)}.jpg`;
}
