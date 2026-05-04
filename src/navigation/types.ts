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
  plan: undefined;
  profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Streak: undefined;
  PrayerFlow: { kind: 'morning' | 'evening' };
  MoodFlow: undefined;
  MoodCalendar: undefined;
  RemoveAds: undefined;
  HelpCenter: undefined;
  HelpAnswer: { id: string };
  AddWidget: undefined;
  AboutUs: undefined;
  Policy: { id: 'terms' | 'privacy' | 'content' };
  Notifications: undefined;
  Achievement: undefined;
  Reflections: undefined;
  PastVerses: undefined;
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
