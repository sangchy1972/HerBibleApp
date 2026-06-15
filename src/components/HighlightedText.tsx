import React, { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { buildSegments, isSegmentActive, type SentenceTiming } from '../services/verseHighlight';

interface Props {
  text: string;
  timings?: SentenceTiming[] | null;
  /** Current narration time (s). Pass a negative number when not narrating. */
  time: number;
  /** Whether THIS block is the one being narrated right now. */
  active: boolean;
  style?: StyleProp<TextStyle>;
  /** Style applied to the sentence currently being spoken. */
  highlightStyle?: StyleProp<TextStyle>;
}

// Renders `text` verbatim, wrapping the sentence currently being spoken in a
// highlight style. When `active` is false (not narrating this block) or there
// are no timings, it renders as a plain <Text> — identical to before, so the
// non-listening experience is unchanged.
function HighlightedTextImpl({ text, timings, time, active, style, highlightStyle }: Props) {
  const segs = useMemo(() => buildSegments(text, timings), [text, timings]);

  if (!active || segs.length <= 1) {
    return <Text style={style}>{text}</Text>;
  }
  return (
    <Text style={style}>
      {segs.map((s, i) => (
        <Text key={i} style={isSegmentActive(s, time) ? highlightStyle : undefined}>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

// Re-render only when the spoken sentence could change. Comparing `active` and
// a coarse `time` bucket avoids a re-render on every 16ms status tick while
// still updating ~4x/sec — smooth enough for sentence-level highlight.
export default React.memo(HighlightedTextImpl, (prev, next) => (
  prev.text === next.text &&
  prev.timings === next.timings &&
  prev.active === next.active &&
  Math.round(prev.time * 4) === Math.round(next.time * 4)
));
