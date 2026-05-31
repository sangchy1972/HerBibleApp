import { StyleSheet } from 'react-native';
import { ROSE, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';

// Single source of truth for the plan-detail page layout. Both the demo
// PlanDetail (inline in PlanScreen.tsx, keyed off the placeholder
// "Identity in Christ") and the corpus-backed FeaturedPlanDetail import
// from here so every margin / font-size tweak ripples to both screens.
//
// If you change one number, you've changed it for every plan detail —
// that is intentional. Don't fork a copy in either screen.
export const detailStyles = StyleSheet.create({
  scroll: { paddingHorizontal: P, paddingBottom: 115, paddingTop: 0 },
  nav: { paddingTop: 7, marginBottom: 16 },
  backBtn: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22.5,                                                              // 25 → 22.5 (-10 % per user)
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    lineHeight: 29,                                                              // 32 → 29 (proportional to fontSize)
    marginBottom: 6,                                                             // 16 → 6 — `planInfo` now sits below the title and supplies the breathing room before the hero
  },
  // "N days · M min/day" — the meta line directly under the title, above
  // the hero. Lightweight Lato so it reads as a caption and doesn't
  // compete with the title.
  planInfo: {
    fontSize: 14,
    fontFamily: FONTS.lato,
    color: TXTSUB,
    marginBottom: 16,
  },
  // Real CDN cover image — `heroPlaceholder` (dashed border + "HERO IMAGE"
  // label) is retired; the wrapper now holds a PlanCover that fetches the
  // 281×173 webp keyed on slug and falls back to the plan's gradient pair
  // while loading or on 404.
  heroWrap: {
    width: '100%',
    height: 230,
    borderRadius: 17,
    overflow: 'hidden',
    marginBottom: 18,
  },
  subtitle: { fontSize: 18, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, marginBottom: 6, lineHeight: 26 },
  goal: { fontSize: 17, fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY, color: TXTSUB, lineHeight: 26, marginBottom: 25 },
  dailyPlanLabel: { fontSize: 18, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, marginBottom: 12 },
  dayStrip: { marginHorizontal: -P, marginBottom: 0 },
  dayStripContent: { paddingHorizontal: P, gap: 9, paddingBottom: 7, marginBottom: 23 },
  dayBtn: {
    flexShrink: 0,
    width: 72,
    paddingVertical: 12,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    position: 'relative',
  },
  dayNum: { fontSize: 20, fontWeight: '700', fontFamily: FONTS.latoBold, lineHeight: 25 },
  dayDate: { fontSize: 13, fontFamily: FONTS.lato, marginTop: 2 },
  // Tiny check pip in the top-right of completed day cells. Subtle enough
  // not to disrupt the day strip's visual rhythm; only renders for corpus
  // plans (the demo doesn't track completion).
  dayCheck: {
    position: 'absolute', top: 3, right: 3,
    width: 18, height: 18, borderRadius: 9,                                     // 14 → 18 (enlarged per user)
    alignItems: 'center', justifyContent: 'center',
  },
  dayContent: { marginBottom: 18, marginTop: 15 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  // Identical to dailyPlanLabel (18 / 600 / loraBold) per user — "Day N of M"
  // now matches the "Daily Plan" header exactly. (Also fixes the Lora-700
  // Android fallback: loraBold must pair with 600, never 700.)
  dayTitle: { fontSize: 18, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT },
  timeBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 15.4 }, // 11 → 15.4 (+40 % per user)
  timeBadgeText: { fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.5 },  // Lato (latoBold)
  walkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 13,
    marginBottom: 9,
  },
  walkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  walkMeta: { flex: 1 },
  walkCaption: { fontSize: 13, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  walkTitle: { fontSize: 17, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT },
  verseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 13,
    marginBottom: 9,
  },
  verseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(30,27,46,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  verseName: { flex: 1, fontSize: 17, fontWeight: '500', fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY, color: TXT },
  startReadingBtn: {
    height: 55,
    borderRadius: 28,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 46,
  },
  startReadingText: { color: '#fff', fontSize: 18, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.3 },
  loading: { paddingVertical: 36, alignItems: 'center', justifyContent: 'center' },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 15, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 13, marginBottom: 9,
  },
  errorText: { flex: 1, fontSize: 14, fontFamily: FONTS.lato, color: TXTSUB, lineHeight: 20 },

  // "Not today's reading" confirm dialog — custom card (replaces the OS Alert)
  // styled like an iOS-style sheet: dim backdrop, rounded white card, bold
  // serif body, then a divided two-button row (No on the left, Yes on the right).
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,16,28,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 44,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 26,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  dialogBody: {
    fontSize: 18,
    fontWeight: '600',                       // loraBold pairs with 600 (700 drops Lora on Android)
    fontFamily: FONTS.loraBold,
    color: TXT,
    textAlign: 'center',
    lineHeight: 25,
    paddingHorizontal: 24,
    marginBottom: 22,
  },
  dialogDivider: { height: 1, backgroundColor: 'rgba(30,27,46,0.12)' },
  dialogActions: { flexDirection: 'row' },
  dialogBtn: { flex: 1, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  dialogVDivider: { width: 1, backgroundColor: 'rgba(30,27,46,0.12)' },
  dialogBtnNo: { fontSize: 17, fontWeight: '600', color: TXTSUB, fontFamily: FONTS.lato },
  dialogBtnYes: { fontSize: 17, fontWeight: '700', color: ROSE, fontFamily: FONTS.latoBold },
});
