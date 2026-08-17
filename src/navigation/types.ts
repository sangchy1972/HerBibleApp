import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

export type TabId = 'prayer' | 'bible' | 'plan' | 'profile';

export type BibleFocus = {
  bookSlug: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
};

export type TabParamList = {
  prayer: undefined;
  // `focus` is a one-shot directive: when present, the reader jumps to that
  // chapter and dims everything outside the verse range. BibleScreen consumes
  // and clears it immediately, so plain re-entries to the tab read normally.
  bible: { focus?: BibleFocus } | undefined;
  // `reset` is a one-shot directive (a timestamp from the caller). When
  // present, PlanScreen forces tab → 'current', scrolls the page to the
  // top, and replays its fade-in. Used by the Profile "My Plan" tile so
  // the entry always lands at the same starting point. Undefined → the
  // user just tabbed in normally; preserve their current state.
  plan: { reset?: number; tab?: 'current' | 'explore' | 'completed' } | undefined;
  profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Streak: undefined;
  PrayerFlow: { kind: 'morning' | 'evening'; day?: number };
  GospelPsalm: { slot: 'morning' | 'evening' };
  MoodDashboard: undefined;
  // `proactive` marks the post-ad pitch (RemoveAdsPromptHost) as opposed to the
  // Profile banner — analytics only; the screen behaves identically.
  RemoveAds: { proactive?: boolean } | undefined;
  HelpCenter: undefined;
  HelpAnswer: { id: string };
  AddWidget: undefined;
  AboutUs: undefined;
  Policy: { id: 'terms' | 'privacy' | 'content' | 'acknowledgments' };
  Settings: undefined;
  Notifications: undefined;
  OtherNotifications: undefined;
  Achievement: undefined;
  /** Full-screen Bible quiz. No params: the set is whatever the ladder says,
   *  and a "replay set N" deep link would need the session logic to accept an
   *  override it does not have. */
  Quiz: undefined;
  /** Puzzle collection — every artwork the quiz has earned. */
  PuzzleCollection: undefined;
  /** Mystery cards she has drawn. Its own route, not a band on the puzzle
   *  screen: that screen stores nothing and this list is stored + filterable. */
  CardCollection: undefined;
  /** Quiz standing — every number derived, nothing stored. */
  QuizProgress: undefined;
  Reflections: undefined;
  PastVerses: undefined;
  FeaturedPlanDetail: { slug: string };
  PlanCategory: { primary: string; secondary?: string; title: string };
  PlanDayWalk: { slug: string; day: number };
  // PlanDayVerses route retired — the verse_wall now renders as inline
  // pages inside PlanDayWalk (one page per verse_wall verse, per the
  // Jan 2026 redesign). Removed from the param list to prevent code
  // accidentally navigating to a dead screen.
  PlanVerseRead: { focus: BibleFocus; planSlug: string; day: number };
  PlanDayDone: { slug: string; day: number; firstOfDay?: boolean };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
