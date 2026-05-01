// Plain-language draft policies tailored to Her Bible. They cover the actual
// surface area of the app — public-domain scripture, optional sign-in, prayer
// + mood + notes + bookmarks, free-with-ads + IAP to remove ads — and are
// written readably rather than as legalese. Have a lawyer review before
// publishing if you operate in regulated regions.

export type PolicyId = 'terms' | 'privacy' | 'content';

export interface PolicySection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface PolicyDoc {
  title: string;
  updatedOn: string;            // ISO date string
  sections: PolicySection[];
}

// Single source of truth for the support email — referenced by helpContent
// and any other surface that contacts the user-facing inbox.
export const SUPPORT_EMAIL = 'support@everlandapps.com';

export const POLICIES: Record<PolicyId, PolicyDoc> = {
  terms: {
    title: 'Terms of Service',
    updatedOn: '2026-04-30',
    sections: [
      {
        heading: 'Welcome to Her Bible',
        paragraphs: [
          'These Terms govern your use of the Her Bible app. By installing or using the app, you agree to them. If you don\'t agree, please don\'t use the app.',
        ],
      },
      {
        heading: 'Who can use Her Bible',
        paragraphs: [
          'You must be at least 13 years old, or the minimum age of digital consent in your country, whichever is higher. If you\'re a minor, please use the app with a parent or guardian.',
        ],
      },
      {
        heading: 'Your account',
        paragraphs: [
          'You can use Her Bible without signing in. Signing in with Google or Facebook is optional and lets us sync your prayer streak, notes, highlights, and bookmarks across devices. Keep your sign-in credentials safe — we can\'t recover access on your behalf.',
        ],
      },
      {
        heading: 'Bible translations',
        paragraphs: [
          'We ship seven public-domain translations: KJV 1769, Lutherbibel 1912, Louis Segond 1910, Reina-Valera 1909, João Ferreira de Almeida, 和合本 1919 繁體 and 简体. They\'re yours to read, share, and quote — for personal, non-commercial use within the app.',
        ],
      },
      {
        heading: 'Your content',
        paragraphs: [
          'Notes, reflections, mood check-ins, and any text you write inside the app belong to you. To run the app for you we need a limited licence to store, display, and (if you sign in) sync that content. We will never sell it or use it for advertising.',
          'Don\'t use the app to post or share content that\'s unlawful, hateful, harassing, sexually explicit, or that infringes someone else\'s rights.',
        ],
      },
      {
        heading: 'Subscriptions and purchases',
        paragraphs: [
          'Removing ads is available as a one-time Lifetime purchase or as a Monthly or Annual subscription. All purchases are processed by Google Play or the App Store in your local currency, and they handle billing, taxes, refunds, and currency conversion.',
          'Subscriptions auto-renew until you cancel. Cancel any time from Play Store → Subscriptions or App Store → Subscriptions. If you cancel, you keep ad-free access until the end of the current billing period.',
        ],
      },
      {
        heading: 'Ads',
        paragraphs: [
          'The free tier of Her Bible shows ads. Ads are served by reputable ad networks and never appear during the prayer flow itself. If ads ever feel inappropriate to the app\'s purpose, please use the Help Center to flag them.',
        ],
      },
      {
        heading: 'Acceptable use',
        bullets: [
          'Don\'t reverse-engineer, decompile, or redistribute the app.',
          'Don\'t scrape, bulk-download, or rehost the Bible content from inside the app.',
          'Don\'t use the app for any unlawful purpose.',
        ],
      },
      {
        heading: 'Termination',
        paragraphs: [
          'You can stop using the app at any time. We may suspend or end access if you breach these Terms. To delete your account and stored data, contact us at the email below.',
        ],
      },
      {
        heading: 'Disclaimers',
        paragraphs: [
          'Her Bible is provided "as is". We work hard to keep scripture text accurate, but typos can happen — please report any you find. Spiritual content in the app is not a substitute for professional medical, legal, or financial advice.',
        ],
      },
      {
        heading: 'Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by law, Her Bible and its team are not liable for any indirect or consequential damages arising from your use of the app.',
        ],
      },
      {
        heading: 'Changes to these Terms',
        paragraphs: [
          'We may update these Terms as the app evolves. When we make material changes we\'ll surface a notice in the app. Continued use after changes means you accept the updated Terms.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`Questions about these Terms? Write to ${SUPPORT_EMAIL}.`],
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    updatedOn: '2026-04-30',
    sections: [
      {
        heading: 'Our promise',
        paragraphs: [
          'Your scripture journey is personal. We collect only what we need to make the app work and to make it better, and we never sell your data.',
        ],
      },
      {
        heading: 'What we collect',
        bullets: [
          'Technical info: device model, OS version, app version, language. This helps us debug crashes and ship the right defaults.',
          'Optional sign-in info: name, email, and profile picture from Google or Facebook — only if you choose to sign in.',
          'Usage data: completed prayers, mood picks, notes, highlights, bookmarks, last-read chapter. Stored locally; synced to your account if signed in.',
          'Anonymous diagnostics: crash logs and aggregated usage counters that help us improve performance.',
        ],
      },
      {
        heading: 'How we use it',
        bullets: [
          'To provide the app — your streak, your notes, your reading position.',
          'To sync your data across devices when you sign in.',
          'To debug crashes and improve performance.',
          'To deliver ads on the free tier (see "Third parties" below).',
        ],
      },
      {
        heading: 'What we don\'t do',
        bullets: [
          'We don\'t sell your personal data — ever.',
          'We don\'t use your notes, highlights, or mood picks to build advertising profiles.',
          'We don\'t share scripture-search history with anyone outside Her Bible.',
        ],
      },
      {
        heading: 'Where your data lives',
        paragraphs: [
          'Most data stays on your device in the app\'s private storage. If you sign in, your synced items live on encrypted cloud storage hosted by reputable providers.',
        ],
      },
      {
        heading: 'Third parties we rely on',
        bullets: [
          'Google Sign-In and Facebook Login — authentication, only when you opt in.',
          'Google Play Billing / Apple App Store — subscription and one-time purchases.',
          'jsDelivr — public CDN that delivers our public-domain Bible files.',
          'Google AdMob (free tier only) — for in-app ads.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          `You can request a copy of your data, correct it, or delete your account at any time by emailing ${SUPPORT_EMAIL}. EU/UK and California residents have additional rights under GDPR and CCPA — we honour them on request.`,
        ],
      },
      {
        heading: 'Children',
        paragraphs: [
          'Her Bible is not directed at children under 13. We don\'t knowingly collect data from minors. If you believe a minor has signed up, contact us and we\'ll remove the account.',
        ],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: [
          'When we make meaningful changes we\'ll surface a notice in the app and update the date at the top of this page.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`Privacy questions or data requests: ${SUPPORT_EMAIL}.`],
      },
    ],
  },

  content: {
    title: 'Content Policy',
    updatedOn: '2026-04-30',
    sections: [
      {
        heading: 'Scripture we ship',
        paragraphs: [
          'Her Bible uses public-domain Bible translations sourced from open repositories. They\'re free of copyright and stay free for everyone — that\'s why we picked editions like KJV 1769, Lutherbibel 1912, Louis Segond 1910, Reina-Valera 1909, Almeida, and 和合本 1919.',
          'If you spot a typo or mistranslation in any verse, please report it through Help Center → "I found an error". We ship corrections in regular updates.',
        ],
      },
      {
        heading: 'Your content',
        paragraphs: [
          'Notes, reflections, and mood check-ins are yours. We need a limited licence to store and display them inside the app on your behalf, and (if you sign in) to sync them to your account. We will never publish or share your content publicly without your explicit consent.',
        ],
      },
      {
        heading: 'Community standards',
        paragraphs: [
          'Her Bible is a community of women growing in faith. When you contribute content that touches anyone other than yourself — for example, sharing a verse image — please follow these standards:',
        ],
        bullets: [
          'Be kind. No harassment, hate speech, or personal attacks.',
          'No sexually explicit, violent, or graphic content.',
          'No spam, scams, or unsolicited promotion.',
          'No content that violates intellectual property or privacy rights.',
        ],
      },
      {
        heading: 'Reporting',
        paragraphs: [
          `If you encounter content (yours, someone else\'s, an ad, or a Bible passage) that violates this policy, please email ${SUPPORT_EMAIL} with the details. We review every report.`,
        ],
      },
      {
        heading: 'Our removal rights',
        paragraphs: [
          'We may remove content that violates this policy, applicable laws, or the Terms of Service. For repeated violations we may suspend the account.',
        ],
      },
    ],
  },
};
