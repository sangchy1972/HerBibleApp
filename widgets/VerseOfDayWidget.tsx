import React from 'react';
import {
  FlexWidget, ImageWidget, OverlapWidget, SvgWidget, TextWidget,
  type ImageWidgetSource,
} from 'react-native-android-widget';

// Native Android home-screen widget. Uses the react-native-android-widget
// primitives (FlexWidget / TextWidget / ImageWidget / OverlapWidget / SvgWidget)
// — these compile down to Android RemoteViews, NOT regular RN components, so do
// NOT import View / Text / Image from 'react-native' here.
//
// Visual: today's verse — the SAME verse + the SAME background image the home
// (Prayer) screen shows on its hero card — on a full-bleed background that
// follows the time of day. `bgUri` carries the live CDN image the card uses
// (covers.everlandapps.com/backgrounds/<slot>/…), so the widget mirrors the
// card exactly and renders at full resolution (no compression). If it's absent
// (offline / first run before the manifest loads) we fall back to the bundled
// sunrise/dusk art so the widget is never blank. A dark scrim keeps the white
// verse copy legible; the brand eyebrow + segment icon sit top, the reference
// + a faux "Amen" pill sit bottom.
//
// The widget is locked to a 4×2 footprint (see app.json), so typography is
// tuned for that single size.
//
// Click target — the whole widget has clickAction="OPEN_APP", so a tap
// anywhere (including the Amen pill, an intentional decoy CTA) launches the
// app onto the Prayer home screen where today's verse lives.

const MORNING_BG = require('../assets/widget/bg-morning.webp');
const EVENING_BG = require('../assets/widget/bg-evening.webp');

const WHITE = '#FFFFFF';
const ROSE = '#E8619A';

// Time-of-day floor gradient, shown behind the image while a remote bg is
// still downloading (or if it ever fails) — the widget is never a gray box.
const BASE_GRADIENT = {
  morning: { from: '#F6C19A' as const, to: '#5E8FC7' as const },
  evening: { from: '#3C5A8C' as const, to: '#1A2740' as const },
};

// Vector segment marks (no icon font needed — SvgWidget renders inline SVG).
const SUN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="4" fill="#FFFFFF"/>' +
  '<line x1="12" y1="2.5" x2="12" y2="4.8"/><line x1="12" y1="19.2" x2="12" y2="21.5"/>' +
  '<line x1="2.5" y1="12" x2="4.8" y2="12"/><line x1="19.2" y1="12" x2="21.5" y2="12"/>' +
  '<line x1="5.1" y1="5.1" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="18.9" y2="18.9"/>' +
  '<line x1="5.1" y1="18.9" x2="6.7" y2="17.3"/><line x1="17.3" y1="6.7" x2="18.9" y2="5.1"/>' +
  '</g></svg>';
const MOON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<path fill="#FFFFFF" d="M20.5 14.8A8.2 8.2 0 1 1 9.2 3.5 6.4 6.4 0 0 0 20.5 14.8z"/></svg>';
const HEART_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<path fill="#E8619A" d="M12 20.6S3.7 15.3 3.7 9.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.3 1.7c0 6-8.3 11.3-8.3 11.3z"/></svg>';

interface Props {
  verse?: string | null;
  reference?: string | null;
  // Live background image URL the home card uses (CDN). Falls back to bundled
  // sunrise/dusk art when null/empty.
  bgUri?: string | null;
  segment?: 'morning' | 'evening';
  amenLabel?: string | null;
  // Widget size in dp (from the task handler's widgetInfo) — drives the
  // background ImageWidget dimensions.
  width?: number;
  height?: number;
}

export function VerseOfDayWidget({
  verse,
  reference,
  bgUri,
  segment = 'morning',
  amenLabel,
  width = 280,
  height = 140,
}: Props) {
  const w = Math.max(120, Math.round(width));
  const h = Math.max(80, Math.round(height));

  // Locked 4×2 → one tuned type scale. (+15% over the first cut, per design.)
  const eyebrowSize = 13;
  const bodySize = 17.5;
  const refSize = 14;
  const iconSize = 20;
  const pad = 15;

  // Amen pill — bumped ~20% larger than the first cut, then widened ~15%
  // more (horizontal padding only; height/font/radius held constant) so it
  // stays in step with the in-app WidgetPreview's pill.
  const amenFont = 14.5;
  const heartSize = 17;
  const pillPadH = 20;
  const pillPadV = 7;
  const pillRadius = 22;

  const useRemote = typeof bgUri === 'string' && bgUri.length > 0;
  const imageSrc = (useRemote ? bgUri : segment === 'evening' ? EVENING_BG : MORNING_BG) as ImageWidgetSource;
  const base = BASE_GRADIENT[segment === 'evening' ? 'evening' : 'morning'];

  const bodyText = verse ?? 'For I know the plans I have for you, declares the LORD.';
  const refText = reference ?? 'Jeremiah 29:11';
  const amen = amenLabel ?? 'Amen';

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      style={{ width: 'match_parent', height: 'match_parent', borderRadius: 22 }}
    >
      {/* 1 — time-of-day floor color (always renders; covers remote-load gap) */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          borderRadius: 22,
          backgroundGradient: { from: base.from, to: base.to, orientation: 'TOP_BOTTOM' },
        }}
      />

      {/* 2 — background image: the SAME photo the home card shows (CDN), or
          bundled sunrise/dusk art as fallback */}
      <ImageWidget image={imageSrc} imageWidth={w} imageHeight={h} radius={22} />

      {/* 3 — legibility scrim, darker toward the bottom where the reference sits */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          borderRadius: 22,
          backgroundGradient: { from: 'rgba(15, 18, 38, 0.32)', to: 'rgba(15, 18, 38, 0.66)', orientation: 'TOP_BOTTOM' },
        }}
      />

      {/* 4 — content */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          padding: pad,
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Top cluster: eyebrow + verse, anchored high over the calmer sky. */}
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginBottom: 7 }}>
            <FlexWidget style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: ROSE, marginRight: 6 }} />
            <TextWidget
              text="HER BIBLE"
              style={{ fontSize: eyebrowSize, fontWeight: '700', color: WHITE, letterSpacing: 1.4 }}
            />
            <FlexWidget style={{ flex: 1, height: 1 }} />
            <SvgWidget svg={segment === 'evening' ? MOON_SVG : SUN_SVG} style={{ width: iconSize, height: iconSize }} />
          </FlexWidget>

          <TextWidget
            text={bodyText}
            maxLines={3}
            style={{ fontSize: bodySize, fontFamily: 'Lora_400Regular', color: WHITE }}
          />
        </FlexWidget>

        {/* Bottom row: reference (left) + faux Amen pill (right). */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
          <TextWidget
            text={refText}
            style={{ fontSize: refSize, fontWeight: '700', color: WHITE, letterSpacing: 0.3 }}
          />
          <FlexWidget style={{ flex: 1, height: 1 }} />
          <FlexWidget
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: pillRadius,
              paddingHorizontal: pillPadH,
              paddingVertical: pillPadV,
            }}
          >
            <SvgWidget svg={HEART_SVG} style={{ width: heartSize, height: heartSize }} />
            <TextWidget
              text={amen}
              style={{ fontSize: amenFont, fontWeight: '700', color: ROSE, marginLeft: 6 }}
            />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
}
