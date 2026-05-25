// Help Center copy — stored as i18n catalog keys, not raw English. Each
// `*Key` resolves to the localized string at render time via the `t()`
// lookup in HelpCenterScreen / HelpAnswerScreen. English source-of-truth
// lives in `src/i18n/sourceCatalog.ts`.

export interface HelpSection {
  headingKey?: string;
  paragraphKeys?: string[];
  bulletKeys?: string[];
}

export interface HelpItem {
  id: string;
  /** i18n key for the FAQ question label. */
  questionKey: string;
  sections: HelpSection[];
}

export const HELP_ITEMS: HelpItem[] = [
  {
    id: 'getting-started',
    questionKey: 'help.q.gettingStarted',
    sections: [
      {
        paragraphKeys: ['help.a.gettingStarted.p1', 'help.a.gettingStarted.p2'],
      },
    ],
  },
  {
    id: 'notes-and-bookmarks',
    questionKey: 'help.q.notesAndBookmarks',
    sections: [
      {
        paragraphKeys: ['help.a.notesAndBookmarks.p1'],
        bulletKeys: [
          'help.a.notesAndBookmarks.b1',
          'help.a.notesAndBookmarks.b2',
          'help.a.notesAndBookmarks.b3',
        ],
      },
      {
        paragraphKeys: ['help.a.notesAndBookmarks.p2'],
      },
    ],
  },
  {
    id: 'share-verse',
    questionKey: 'help.q.shareVerse',
    sections: [
      {
        paragraphKeys: ['help.a.shareVerse.p1', 'help.a.shareVerse.p2'],
      },
    ],
  },
  {
    id: 'remove-ads',
    questionKey: 'help.q.removeAds',
    sections: [
      {
        paragraphKeys: ['help.a.removeAds.p1'],
        bulletKeys: ['help.a.removeAds.b1', 'help.a.removeAds.b2', 'help.a.removeAds.b3'],
      },
      {
        headingKey: 'help.a.removeAds.h2',
        paragraphKeys: ['help.a.removeAds.p2'],
      },
    ],
  },
  {
    id: 'cancel-subscription',
    questionKey: 'help.q.cancelSubscription',
    sections: [
      {
        paragraphKeys: ['help.a.cancelSubscription.p1', 'help.a.cancelSubscription.p2'],
      },
    ],
  },
  {
    id: 'switch-version',
    questionKey: 'help.q.switchVersion',
    sections: [
      {
        paragraphKeys: ['help.a.switchVersion.p1'],
      },
    ],
  },
  {
    id: 'reminder-settings',
    questionKey: 'help.q.reminderSettings',
    sections: [
      {
        paragraphKeys: ['help.a.reminderSettings.p1', 'help.a.reminderSettings.p2'],
      },
    ],
  },
];

// Re-export from aboutContent so there's only one place to change the address.
export { SUPPORT_EMAIL } from './aboutContent';
