// Policy documents — stored as i18n catalog keys, not raw English. Each
// `*Key` field resolves to the localized string at render time via the
// `t()` lookup in PolicyScreen. English source lives in
// `src/i18n/sourceCatalog.ts`; translations in `strings.ts`.
//
// The `[LEGAL-TEXT]` flag on those catalog entries marks them as needing
// human-lawyer review before launch.

export type PolicyId = 'terms' | 'privacy' | 'content' | 'acknowledgments';

export interface PolicySection {
  /** i18n key for the section heading (optional). */
  headingKey?: string;
  /** i18n keys for body paragraphs in order. */
  paragraphKeys?: string[];
  /** i18n keys for bullet items in order. */
  bulletKeys?: string[];
}

export interface PolicyDoc {
  /** i18n key for the document title. */
  titleKey: string;
  updatedOn: string;            // ISO date string
  sections: PolicySection[];
}

// Single source of truth for the support email — referenced by helpContent
// and any other surface that contacts the user-facing inbox.
export const SUPPORT_EMAIL = 'support@everlandapps.com';

export const POLICIES: Record<PolicyId, PolicyDoc> = {
  terms: {
    titleKey: 'policy.terms.title',
    updatedOn: '2026-04-30',
    sections: [
      { headingKey: 'policy.terms.welcome.h',       paragraphKeys: ['policy.terms.welcome.p']     },
      { headingKey: 'policy.terms.eligibility.h',   paragraphKeys: ['policy.terms.eligibility.p'] },
      { headingKey: 'policy.terms.account.h',       paragraphKeys: ['policy.terms.account.p']     },
      { headingKey: 'policy.terms.bibles.h',        paragraphKeys: ['policy.terms.bibles.p']      },
      {
        headingKey: 'policy.terms.content.h',
        paragraphKeys: ['policy.terms.content.p1', 'policy.terms.content.p2'],
      },
      {
        headingKey: 'policy.terms.subscriptions.h',
        paragraphKeys: ['policy.terms.subscriptions.p1', 'policy.terms.subscriptions.p2'],
      },
      { headingKey: 'policy.terms.ads.h', paragraphKeys: ['policy.terms.ads.p'] },
      {
        headingKey: 'policy.terms.acceptable.h',
        bulletKeys: ['policy.terms.acceptable.b1', 'policy.terms.acceptable.b2', 'policy.terms.acceptable.b3'],
      },
      { headingKey: 'policy.terms.termination.h', paragraphKeys: ['policy.terms.termination.p'] },
      { headingKey: 'policy.terms.disclaimers.h', paragraphKeys: ['policy.terms.disclaimers.p'] },
      { headingKey: 'policy.terms.liability.h',   paragraphKeys: ['policy.terms.liability.p']   },
      { headingKey: 'policy.terms.changes.h',     paragraphKeys: ['policy.terms.changes.p']     },
      { headingKey: 'policy.terms.contact.h',     paragraphKeys: ['policy.terms.contact.p']     },
    ],
  },

  privacy: {
    titleKey: 'policy.privacy.title',
    updatedOn: '2026-04-30',
    sections: [
      { headingKey: 'policy.privacy.promise.h', paragraphKeys: ['policy.privacy.promise.p'] },
      {
        headingKey: 'policy.privacy.collect.h',
        bulletKeys: [
          'policy.privacy.collect.b1',
          'policy.privacy.collect.b2',
          'policy.privacy.collect.b3',
          'policy.privacy.collect.b4',
        ],
      },
      {
        headingKey: 'policy.privacy.use.h',
        bulletKeys: [
          'policy.privacy.use.b1',
          'policy.privacy.use.b2',
          'policy.privacy.use.b3',
          'policy.privacy.use.b4',
        ],
      },
      {
        headingKey: 'policy.privacy.never.h',
        bulletKeys: [
          'policy.privacy.never.b1',
          'policy.privacy.never.b2',
          'policy.privacy.never.b3',
        ],
      },
      { headingKey: 'policy.privacy.storage.h', paragraphKeys: ['policy.privacy.storage.p'] },
      {
        headingKey: 'policy.privacy.thirdParty.h',
        bulletKeys: [
          'policy.privacy.thirdParty.b1',
          'policy.privacy.thirdParty.b2',
          'policy.privacy.thirdParty.b3',
          'policy.privacy.thirdParty.b4',
        ],
      },
      { headingKey: 'policy.privacy.rights.h',   paragraphKeys: ['policy.privacy.rights.p']   },
      { headingKey: 'policy.privacy.children.h', paragraphKeys: ['policy.privacy.children.p'] },
      { headingKey: 'policy.privacy.changes.h',  paragraphKeys: ['policy.privacy.changes.p']  },
      { headingKey: 'policy.privacy.contact.h',  paragraphKeys: ['policy.privacy.contact.p']  },
    ],
  },

  content: {
    titleKey: 'policy.content.title',
    updatedOn: '2026-04-30',
    sections: [
      {
        headingKey: 'policy.content.scripture.h',
        paragraphKeys: ['policy.content.scripture.p1', 'policy.content.scripture.p2'],
      },
      { headingKey: 'policy.content.ugc.h', paragraphKeys: ['policy.content.ugc.p'] },
      {
        headingKey: 'policy.content.community.h',
        paragraphKeys: ['policy.content.community.p'],
        bulletKeys: [
          'policy.content.community.b1',
          'policy.content.community.b2',
          'policy.content.community.b3',
          'policy.content.community.b4',
        ],
      },
      { headingKey: 'policy.content.reporting.h', paragraphKeys: ['policy.content.reporting.p'] },
      { headingKey: 'policy.content.removal.h',   paragraphKeys: ['policy.content.removal.p']   },
    ],
  },

  acknowledgments: {
    titleKey: 'policy.acknowledgments.title',
    updatedOn: '2026-05-11',
    sections: [
      {
        headingKey: 'policy.ack.explanations.h',
        paragraphKeys: [
          'policy.ack.explanations.p1',
          'policy.ack.explanations.p2',
          'policy.ack.explanations.p3',
          'policy.ack.explanations.p4',
        ],
      },
      {
        headingKey: 'policy.ack.scripture.h',
        paragraphKeys: ['policy.ack.scripture.p'],
      },
    ],
  },
};
