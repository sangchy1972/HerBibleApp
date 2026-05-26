import type { UILanguageCode } from '../state/UILanguageContext';

// Map our internal UI-language code → the BCP-47 locale tag accepted by
// `Date#toLocaleDateString`, `Intl.NumberFormat`, etc. Without this every
// `toLocaleDateString('en-US', ...)` call rendered dates as "May 26" /
// "Sept 3" even for users with their UI language set to Chinese, German,
// or any other supported tongue — the wrong default leaked through the
// entire app (plan day strips, prayer header, mood calendar, etc.).
//
// Choices:
//   • en       → en-US — US format is the most familiar default for the
//                English UI ("May 26" not "26 May").
//   • zh-Hans  → zh-CN — Mainland Chinese conventions ("5月26日").
//   • zh-Hant  → zh-TW — Taiwan / HK conventions, same character set
//                as the UI strings.
//   • de       → de-DE — Standard German.
//   • fr       → fr-FR — Metropolitan French (matches the app's
//                tutoyer register).
//   • es       → es-ES — Peninsular Spanish. Most strings in the UI
//                catalog use Spain conventions ("Acceso", "Ajustes").
//   • pt       → pt-BR — Brazilian Portuguese; the catalog uses BR
//                vocab ("salvar"/"tela" rather than "guardar"/"ecrã").
const BCP47: Record<UILanguageCode, string> = {
  'en':      'en-US',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  'de':      'de-DE',
  'fr':      'fr-FR',
  'es':      'es-ES',
  'pt':      'pt-BR',
};

export function localeFor(lang: UILanguageCode): string {
  return BCP47[lang] || 'en-US';
}
