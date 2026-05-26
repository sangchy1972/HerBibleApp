import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

// Native Android home-screen widget. Uses the react-native-android-widget
// primitives (FlexWidget / TextWidget / etc.) — these compile down to
// Android RemoteViews, NOT regular React Native components, so do NOT
// import `View` / `Text` from 'react-native' here.
//
// Cell sizing — Android sends an `info.width` / `info.height` in dp via
// the task handler; we derive `cellWidth` / `cellHeight` (≈ # of 70-dp
// grid cells) so the widget can adapt typography. A 4×2 widget gets
// ~280×140 dp on most devices; a 2×2 lands around 140×140 dp; a 5×2
// extends to ~350×140 dp.
//
// Click target — the root FlexWidget has `clickAction="OPEN_APP"` so any
// tap launches the app via the package's main launcher intent. The
// DeepLinkHandler component then picks up `Linking.getInitialURL()` and
// can route based on the herbible:// scheme if we expand later. Today
// "open the app" is enough — once open, the user lands on the home
// (Prayer) screen which is exactly where they want to be after seeing
// today's verse.

interface Props {
  verse?: string | null;
  reference?: string | null;
  cellWidth?: number;
  cellHeight?: number;
}

const BRAND_ROSE = '#E8619A';
const SURFACE = '#FFFFFF';
const TEXT_DARK = '#1E1B2E';
const TEXT_SUB = '#5A526E';
const PINK_TINT = '#FBE9F1';

export function VerseOfDayWidget({
  verse,
  reference,
  cellWidth = 4,
}: Props) {
  // Compact vs full layout: a single-column 2×2 squeezes content; 4×2 and
  // 5×2 give us room for a generous body line + reference footer. Switch
  // the body line cap and font sizes by cell width.
  const compact = cellWidth <= 2;
  const titleSize = compact ? 12 : 13;
  const bodySize = compact ? 13 : 15;
  const refSize = compact ? 10 : 11;
  const bodyLines = compact ? 4 : 3;

  const bodyText = verse ?? 'The Lord is my shepherd.';
  const refText = reference ?? 'Psalm 23:1';

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: SURFACE,
        borderRadius: 18,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Top eyebrow — brand label so the widget is identifiable at a
          glance on a crowded home screen. */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <FlexWidget
          style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: BRAND_ROSE, marginRight: 6,
          }}
        />
        <TextWidget
          text="HER BIBLE"
          style={{ fontSize: titleSize, fontWeight: '700', color: BRAND_ROSE, letterSpacing: 1.0 }}
        />
      </FlexWidget>

      {/* Verse body — the actual content the user pinned the widget for. */}
      <TextWidget
        text={bodyText}
        maxLines={bodyLines}
        style={{
          fontSize: bodySize,
          fontWeight: '400',
          color: TEXT_DARK,
          marginTop: compact ? 2 : 4,
        }}
      />

      {/* Footer: reference pill (filled tint so it reads as a chip, not
          a passive label). */}
      <FlexWidget
        style={{
          marginTop: compact ? 4 : 6,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <FlexWidget
          style={{
            backgroundColor: PINK_TINT,
            borderRadius: 10,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <TextWidget
            text={refText}
            style={{ fontSize: refSize, fontWeight: '700', color: BRAND_ROSE, letterSpacing: 0.3 }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Body color tap-hint for screen-readers (no visual). The label
          is for TalkBack/accessibility; react-native-android-widget
          ignores style props it can't translate to RemoteViews so this
          is a no-op visually. */}
      <TextWidget
        text=""
        style={{ fontSize: 1, color: TEXT_SUB }}
      />
    </FlexWidget>
  );
}
