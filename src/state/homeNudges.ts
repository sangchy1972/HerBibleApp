// Pure selector for the single home-screen nudge banner. Exactly ONE banner
// shows at a time (priority-ordered) so the home screen never turns into a wall
// of nags. State-derived banners self-clear when the underlying action is done;
// a manual dismiss hides that kind for the rest of the session (in-memory).

export type HomeBannerKind = 'coachPray' | 'completeStreak' | 'notPrayed' | 'gospel' | 'planRec';

export interface HomeBannerInput {
  daysSinceFirstLaunch: number;
  everPrayed: boolean;
  mDone: boolean;
  eDone: boolean;
  hour: number;              // 0-23
  gospelReady: boolean;
  gospelSlotDone: boolean;   // today's current-slot Gospel & Psalm read?
  hasAnyPlan: boolean;
  hasSuggestablePlan: boolean;
  dismissed: readonly HomeBannerKind[];
}

export function pickHomeBanner(i: HomeBannerInput): HomeBannerKind | null {
  const evening = i.hour >= 18;
  const dis = (k: HomeBannerKind) => i.dismissed.includes(k);
  // 1) Brand-new user who hasn't prayed → coach the first prayer.
  if (!dis('coachPray') && i.daysSinceFirstLaunch <= 1 && !i.everPrayed) return 'coachPray';
  // 2) Evening, morning done but evening pending → finish to complete the day.
  if (!dis('completeStreak') && evening && i.mDone && !i.eDone) return 'completeStreak';
  // 3) Evening, nothing done → gentle "haven't prayed today".
  if (!dis('notPrayed') && evening && !i.mDone && !i.eDone) return 'notPrayed';
  // 4) Today's Gospel & Psalm still unread.
  if (!dis('gospel') && i.gospelReady && !i.gospelSlotDone) return 'gospel';
  // 5) No plan started yet (past day 1) → recommend one.
  if (!dis('planRec') && i.daysSinceFirstLaunch >= 2 && !i.hasAnyPlan && i.hasSuggestablePlan) return 'planRec';
  return null;
}
