import { useEffect, useRef } from 'react';
import { useDailyVerses } from '../state/DailyVersesContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useT } from '../i18n/useT';
import { syncVerseWidget } from '../../widgets/syncVerseWidget';

// Mirrors today's verse to the home-screen widget so it shows EXACTLY what the
// Prayer hero card shows: both segments' verse + reference, the live CDN
// background URL the card uses (imageFor), and the localized Amen label. The
// widget then picks the segment by clock and renders that segment's verse + bg.
//
// Mounted low in the provider tree because it needs BOTH DailyVerses (verse)
// and PrayerBackgrounds (the card image). `imageFor` re-memoizes when the bg
// manifest resolves, so the CDN URLs get written as soon as they're known. The
// serialized-payload guard avoids redundant writes. Renders nothing; no-op on
// iOS (syncVerseWidget short-circuits). Failures are swallowed.
export default function WidgetSync() {
  const { getVerse, todayDay } = useDailyVerses();
  const { widgetBgUrlFor, loaded } = usePrayerBackgrounds();
  const t = useT();
  const last = useRef('');

  useEffect(() => {
    // Widget-specific bg: an HTTPS, cover-cropped-to-landscape url (or null →
    // the widget uses its bundled landscape art). NOT imageFor — that returns a
    // portrait file:// the ImageWidget can't read and would stretch anyway.
    const bgFor = (slot: 'morning' | 'evening'): string | null => widgetBgUrlFor(slot);
    const seg = (slot: 'morning' | 'evening') => {
      const v = getVerse(todayDay, slot);
      return v ? { verse: v.modernText, reference: v.reference.full_reference, bg: bgFor(slot) } : null;
    };
    const m = seg('morning');
    const e = seg('evening');
    if (!m && !e) return;
    const cache = { morning: m, evening: e, amenLabel: t('widget.amen') };
    const ser = JSON.stringify(cache);
    if (ser === last.current) return;
    last.current = ser;
    void syncVerseWidget(cache);
  }, [getVerse, todayDay, widgetBgUrlFor, loaded, t]);

  return null;
}
