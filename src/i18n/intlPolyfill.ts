// Patch React Native's Hermes JS engine so `Date#toLocaleDateString`,
// `Intl.DateTimeFormat`, etc. actually work for the 6 non-English UI
// languages we support.
//
// **Why this exists.** Hermes ships only the `en-US` ICU locale by
// default on Android. `toLocaleDateString('zh-CN', ...)` silently falls
// back to `en-US`, producing English dates ("May 26", "Tuesday") even
// after the rest of the i18n pipeline is correctly localized. Visible
// symptom: PrayerScreen header reads "TUESDAY, MAY 26" while the rest
// of the chrome is in zh-Hans. iOS Hermes has full Intl, but ours is a
// cross-platform app — fix at the JS layer once.
//
// **What we do.** FormatJS polyfills replace the partial native impls
// with a JS implementation backed by CLDR locale data. Each `require`
// of `/locale-data/<lang>` registers that language's month names,
// weekday names, and format patterns with the polyfilled
// Intl.DateTimeFormat constructor.
//
// **Cost.** ~150 KB of locale data added to the JS bundle (split across
// 6 small `require()` calls). Worth it for correct localized dates
// app-wide — every `toLocaleDateString` / `toLocaleString` call we
// already shipped now just works.
//
// Import this file ONCE, as early as possible — `index.ts` runs it
// before `registerRootComponent(App)` so even the first paint has the
// polyfill in place.

import '@formatjs/intl-getcanonicallocales/polyfill';
import '@formatjs/intl-locale/polyfill';
import '@formatjs/intl-datetimeformat/polyfill';

// Required runtime data — without these, `new Intl.DateTimeFormat()`
// throws a "missing locale data" error. We add UTC by default; specific
// timezones (e.g. America/Los_Angeles) can be added later if any screen
// ever needs to format relative to a fixed TZ rather than the device's.
import '@formatjs/intl-datetimeformat/add-all-tz';

// Per-language locale data — month names, weekday names, day-period
// names, format patterns. Order matters only for tie-breaking when the
// user's locale tag is ambiguous; alphabetical is fine here.
import '@formatjs/intl-datetimeformat/locale-data/de';
import '@formatjs/intl-datetimeformat/locale-data/en';
import '@formatjs/intl-datetimeformat/locale-data/es';
import '@formatjs/intl-datetimeformat/locale-data/fr';
import '@formatjs/intl-datetimeformat/locale-data/pt';
import '@formatjs/intl-datetimeformat/locale-data/zh';
import '@formatjs/intl-datetimeformat/locale-data/zh-Hant';
