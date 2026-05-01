// Help Center copy. Kept short and concrete on purpose — the reference design
// we were given was wordy and ended every answer with "God bless you" filler.
// Each section is structured so the answer screen can render headings,
// paragraphs, and bullets without parsing markdown.

export interface HelpSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface HelpItem {
  id: string;
  question: string;
  sections: HelpSection[];
}

export const HELP_ITEMS: HelpItem[] = [
  {
    id: 'getting-started',
    question: 'How do I start a daily prayer?',
    sections: [
      {
        paragraphs: [
          'Open the Prayer tab and tap Start Prayer. You\'ll move through a verse, a short meditation, an action step, and a guided prayer. Tap AMEN at the end to mark it complete.',
          'Morning prayer opens before 6 PM, evening prayer after 6 PM. Once both are done you\'ll see today\'s flame light up on your streak.',
        ],
      },
    ],
  },
  {
    id: 'notes-and-bookmarks',
    question: 'Where can I find my notes, highlights, and bookmarks?',
    sections: [
      {
        paragraphs: ['Everything saved while reading lives under Profile → My Notes. Tap any of the three tiles to see the full list:'],
        bullets: [
          'Notes — open a verse, tap Notes, write a reflection.',
          'Bookmarks — tap the bookmark icon in the chapter header.',
          'Highlights — tap a verse and pick a colour dot.',
        ],
      },
      {
        paragraphs: ['Tap any saved bookmark or highlight to jump straight back to that verse in the Bible tab.'],
      },
    ],
  },
  {
    id: 'share-verse',
    question: 'How do I share a verse with friends?',
    sections: [
      {
        paragraphs: [
          'While reading, tap a verse to open its tool bar, then tap Share. Pick one of three templates (Square, Portrait, or Story), then choose Facebook, WhatsApp, or Instagram.',
          'We render the image on the spot in your local language and hand it to the chosen app.',
        ],
      },
    ],
  },
  {
    id: 'remove-ads',
    question: 'Removing ads — what plans are available?',
    sections: [
      {
        paragraphs: ['Go to Profile → Remove Ads. Three plans are available, all priced in your local currency by Google Play:'],
        bullets: [
          'Lifetime — one-time purchase, never charged again.',
          'Annual — auto-renewing yearly subscription.',
          'Monthly — auto-renewing monthly subscription.',
        ],
      },
      {
        heading: 'Ads still showing after I paid?',
        paragraphs: [
          'Open the same Remove Ads screen and tap Restore. Make sure you\'re signed into the Google account that made the purchase. Sync usually completes within a minute.',
        ],
      },
    ],
  },
  {
    id: 'cancel-subscription',
    question: 'How do I cancel my subscription?',
    sections: [
      {
        paragraphs: [
          'Subscriptions are managed by Google Play, not the app. Open Play Store → tap your profile picture → Payments & subscriptions → Subscriptions, then pick Her Bible and choose Cancel.',
          'You\'ll keep ad-free access until the current billing period ends.',
        ],
      },
    ],
  },
  {
    id: 'switch-version',
    question: 'How do I switch the Bible version or language?',
    sections: [
      {
        paragraphs: [
          'Open Profile → Account → Bible versions. Pick a translation and download it once; afterwards you can read it fully offline. Only fully-downloaded versions can be set as your active translation.',
        ],
      },
    ],
  },
  {
    id: 'reminder-settings',
    question: 'Set or change my daily reminder time',
    sections: [
      {
        paragraphs: [
          'After finishing a prayer the reminder sheet appears — tap Set Time and pick the hour you\'d like to be reminded each day.',
          'You can change the time or silence reminders any time from your phone\'s system Settings → Notifications → Her Bible.',
        ],
      },
    ],
  },
];

// Re-export from aboutContent so there's only one place to change the address.
export { SUPPORT_EMAIL } from './aboutContent';
