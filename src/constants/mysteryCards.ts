import type { LanguageCode } from "../state/TranslationsContext";

// Mystery cards — the reward behind the quiz's mystery counter.
//
// Every MYSTERY_EVERY completed sets the user draws one card from a face-down
// 2x2 spread. See docs/mystery-cards-spec.md for the full design.
//
// WHAT A CARD IS
// ==============
// Our own original writing in God's first person, ANCHORED to a named passage.
// It is NOT a Bible quote, and that is deliberate on two counts:
//
//   Licensing. KJV is public domain, but the modern translations this app uses
//   for zh-Hans/zh-Hant/de/fr/es/pt are under copyright. Shipping their verse
//   text inside a bundled constant is a rights problem in six of seven
//   languages. Original prose under a citation has no such exposure.
//
//   Register. A pasted verse reads like a lookup result. These have to talk TO
//   her — that needs writing, not quoting.
//
// The anchoring is what keeps the first-person voice defensible. Software
// inventing divine speech is something a meaningful share of readers consider
// presumption, and that reaction lands in store reviews rather than in a
// feedback form. Scripture already speaks in the first person at length, so
// anchoring costs nothing and makes every line answerable.
//
// EDITORIAL RULES (enforced in review, and by __tests__/mysteryCards.test.ts)
// - 35-60 words. Longer does not fit a phone card at a readable size.
// - No prosperity phrasing: never a promise of wealth or a specific outcome.
// - Nothing that reads as a substitute for medical or mental-health care. The
//   healing cards speak to grief and heartbreak only — never symptoms, never
//   cure — so none can be read as a reason to skip treatment.
// - Nothing implying she can command God or unlock him by asking correctly.
// - Must make sense to someone who never looks up the reference.
//
// WARNING: IDS ARE DURABLE
// ========================
// CardProgress stores collected ids. Renaming or deleting one silently empties
// part of a user's collection. APPEND ONLY — same rule as QUIZ_ART.
//
// Non-English text is filled in by the translation pass. `localizedCardBody`
// falls back to English, so a partially translated card ships safely rather
// than rendering blank.

export type CardTheme =
  | 'presence'
  | 'guidance'
  | 'rest'
  | 'courage'
  | 'companionship'
  | 'beloved'
  | 'waiting'
  | 'healing'
  | 'provision'
  | 'hope';

/** Display order and grouping in the collection. */
export const CARD_THEMES: readonly CardTheme[] = [
  'presence',
  'guidance',
  'rest',
  'courage',
  'companionship',
  'beloved',
  'waiting',
  'healing',
  'provision',
  'hope',
] as const;

export interface MysteryCard {
  /** Stable, durable, never reused. See the warning above. */
  id: string;
  theme: CardTheme;
  /** Canonical ENGLISH reference. Book names are localized at render time from
   *  the app's own book table, so this string stays stable across languages. */
  ref: string;
  /** 2-4 words. */
  title: Partial<Record<LanguageCode, string>>;
  /** 35-60 words in English; translations may vary but must stay card-sized. */
  body: Partial<Record<LanguageCode, string>>;
}

export const MYSTERY_CARDS: readonly MysteryCard[] = [
  {
    id: 'presence-1', theme: 'presence', ref: 'Psalm 139:7-10',
    title: { en: 'Nowhere Beyond Me' },
    body: { en: 'You could run to the far edge of the morning, and I would already be standing there. There is no room dark enough, no distance wide enough, to put you out of my reach. Even now, my hand is under you, holding what you cannot hold yourself.' },
  },
  {
    id: 'presence-2', theme: 'presence', ref: 'Exodus 33:14',
    title: { en: 'I Go With You' },
    body: { en: 'You keep asking whether I have gone quiet on you. I have not. My presence goes where you go — into the ordinary week, the crowded room, the drive home. I am not waiting at the end of the road. I am walking it beside you.' },
  },
  {
    id: 'presence-3', theme: 'presence', ref: 'Jeremiah 23:23-24',
    title: { en: 'Nearer Than You Think' },
    body: { en: 'Am I only a God far away, easy to doubt from a distance? I fill the room you are sitting in. I fill the sky over the house. You have been looking for proof out there, and I have been closer than the breath you just took.' },
  },
  {
    id: 'presence-4', theme: 'presence', ref: 'Matthew 28:20',
    title: { en: 'Every Ordinary Day' },
    body: { en: 'I am with you through every ordinary day, and I will still be with you when the days run out. Not only on the mornings your faith feels strong. Also on the ones when you say the words and feel nothing. My promise does not depend on your feeling it.' },
  },
  {
    id: 'guidance-1', theme: 'guidance', ref: 'Isaiah 30:21',
    title: { en: 'A Voice Behind You' },
    body: { en: 'When you come to the place where the road splits and you honestly cannot tell, listen. You will hear me behind you, quiet as a hand on your shoulder: this way. You do not have to see the whole route. You only have to take the next turn.' },
  },
  {
    id: 'guidance-2', theme: 'guidance', ref: 'Psalm 32:8',
    title: { en: 'I Will Show You' },
    body: { en: 'I will show you which way to walk, and my eye will stay on you the whole time you are walking it. You are not being handed a map and left alone. You are being led by someone who knows the ground and will not lose sight of you.' },
  },
  {
    id: 'guidance-3', theme: 'guidance', ref: 'Proverbs 3:5-6',
    title: { en: 'Hand It To Me' },
    body: { en: 'Stop trying to think your way out of this on your own. Bring me the decision before you have solved it — the messy version, the one you would be embarrassed to say out loud. Hand it to me, and I will straighten the path under your feet.' },
  },
  {
    id: 'guidance-4', theme: 'guidance', ref: 'Psalm 119:105',
    title: { en: 'Light For One Step' },
    body: { en: 'My word is a small lamp at your feet, not a floodlight over the whole valley. That is on purpose. You would be frightened by the distance. So I give you light for one step, then another, and I walk close enough to hand you the next one.' },
  },
  {
    id: 'rest-1', theme: 'rest', ref: 'Matthew 11:28-29',
    title: { en: 'Come To Me' },
    body: { en: 'Come to me, all of you worn through from carrying too much, and I will let you rest. Learn the way I work — gently, without hurry, without contempt for you. What I ask you to carry weighs less than what you have been dragging alone.' },
  },
  {
    id: 'rest-2', theme: 'rest', ref: 'Psalm 23:1-3',
    title: { en: 'Lie Down Here' },
    body: { en: 'You have been running as if stopping would cost you everything. Lie down here in the green grass. Let me walk you to the quiet water. I am the one keeping watch tonight, so you can put it down. I restore what is worn out in you, slowly.' },
  },
  {
    id: 'rest-3', theme: 'rest', ref: 'Psalm 127:2',
    title: { en: 'Sleep Is A Gift' },
    body: { en: 'You rise before light and sit up late, eating bread you earned with worry. It is not the working I mind — it is the fear underneath it. Sleep is something I give to those I love, not a reward you have to qualify for. Take it.' },
  },
  {
    id: 'rest-4', theme: 'rest', ref: 'Mark 6:31',
    title: { en: 'Come Away Awhile' },
    body: { en: 'Come away with me somewhere quiet, and rest. My own friends were so surrounded by need that they had no time to eat, and I took them out of it. The work will still be there. You are allowed to leave the room. Come and sit down.' },
  },
  {
    id: 'courage-1', theme: 'courage', ref: 'Isaiah 41:10',
    title: { en: 'Do Not Be Afraid' },
    body: { en: 'Do not be afraid — I am with you. Do not keep looking around for who will help; I am your God. I will make you strong for this. I will hold you steady. The hand under your arm right now is mine, and it will not let go.' },
  },
  {
    id: 'courage-2', theme: 'courage', ref: 'Joshua 1:9',
    title: { en: 'Be Strong Now' },
    body: { en: 'I am telling you the same thing I told Joshua before he crossed into unknown country: be strong, take heart, do not let fear decide for you. You are not walking in there alone. Wherever you set your foot, I have already gone ahead of you.' },
  },
  {
    id: 'courage-3', theme: 'courage', ref: 'Psalm 27:1',
    title: { en: 'Light And Rescue' },
    body: { en: 'I am your light in this, and the one who saves you. So who is left to be afraid of? I am the stronghold your life is built on. The thing frightening you is real — I am not asking you to pretend. I am asking you to look at me.' },
  },
  {
    id: 'courage-4', theme: 'courage', ref: 'John 14:27',
    title: { en: 'My Peace, Not Theirs' },
    body: { en: 'I am leaving you peace — mine, not the fragile kind the world hands out and then takes back. Let your heart stop pounding. You do not have to be brave by manufacturing calm. The peace is a gift; you only have to stop refusing it.' },
  },
  {
    id: 'companionship-1', theme: 'companionship', ref: 'Hebrews 13:5',
    title: { en: 'I Will Not Leave' },
    body: { en: 'I will never walk away from you. I will never let go of your hand and call it your fault. People have left, and you learned to expect it. I am not made that way. When the room empties out tonight, count me among those still here.' },
  },
  {
    id: 'companionship-2', theme: 'companionship', ref: 'Psalm 68:6',
    title: { en: 'A Family For You' },
    body: { en: 'I set lonely people inside families. I am not content to leave you at the edge of every room. Keep your door open a little; I am already moving people toward you. And in the meantime, I am not a placeholder — I am company, tonight, here.' },
  },
  {
    id: 'companionship-3', theme: 'companionship', ref: 'John 15:15',
    title: { en: 'I Call You Friend' },
    body: { en: 'I do not call you a servant, kept at a distance and told only what you need to know. I call you my friend. I tell you what is on my heart. You may speak to me the way you would speak to someone who stayed.' },
  },
  {
    id: 'companionship-4', theme: 'companionship', ref: 'Genesis 28:15',
    title: { en: 'Wherever You Go' },
    body: { en: 'Jacob fell asleep alone in open country with a stone for a pillow, and I stood over him and said: I am with you, wherever you go, and I will not leave you. He had run from everything. I said it anyway. I am saying it to you.' },
  },
  {
    id: 'beloved-1', theme: 'beloved', ref: 'Isaiah 43:1',
    title: { en: 'You Are Mine' },
    body: { en: 'I called you by your name, and the name I used was not the one you call yourself on bad days. You are mine. I paid for that and I do not regret it. Whatever you have decided you are worth, my valuation stands, and it is higher.' },
  },
  {
    id: 'beloved-2', theme: 'beloved', ref: 'Zephaniah 3:17',
    title: { en: 'I Sing Over You' },
    body: { en: 'I am here with you, and I am not disappointed. I take real delight in you — not in the version you keep trying to become. My love quiets you. If you could hear it, you would find me singing over you the way a mother hums over a sleeping child.' },
  },
  {
    id: 'beloved-3', theme: 'beloved', ref: 'Jeremiah 31:3',
    title: { en: 'Loved From Far Back' },
    body: { en: 'I have loved you from further back than you can remember, and that love has not thinned out with time. I drew you here with kindness, not with threats. You did not earn the beginning of this, and you cannot ruin the middle of it.' },
  },
  {
    id: 'beloved-4', theme: 'beloved', ref: 'Isaiah 49:15-16',
    title: { en: 'Written On My Hands' },
    body: { en: 'Can a mother forget the child at her breast? Even if she could, I could not forget you. Your name is cut into the palms of my hands, where I see it every time I open them. You are not someone I have to be reminded about.' },
  },
  {
    id: 'waiting-1', theme: 'waiting', ref: 'Isaiah 40:31',
    title: { en: 'Strength While Waiting' },
    body: { en: 'Those who wait for me get their strength traded in for new strength. I know the waiting has cost you years. It is not nothing to me. You will run again and not collapse; you will walk and not give out. Not yet, but truly.' },
  },
  {
    id: 'waiting-2', theme: 'waiting', ref: 'Habakkuk 2:3',
    title: { en: 'It Will Come' },
    body: { en: 'What I promised has an appointed hour, and it is moving toward it even on the days nothing visibly changes. If it seems slow, keep waiting for it. It will not be late. I am not testing how long you can hold out — I am preparing what comes.' },
  },
  {
    id: 'waiting-3', theme: 'waiting', ref: 'Psalm 40:1-2',
    title: { en: 'I Heard You' },
    body: { en: 'You waited a long time, and I want you to know I heard you. I did not miss one of those prayers. I am reaching into the mud you have been standing in, lifting you out, and setting your feet somewhere that will hold your weight.' },
  },
  {
    id: 'waiting-4', theme: 'waiting', ref: 'Lamentations 3:25-26',
    title: { en: 'Good To Wait' },
    body: { en: 'I am good to the woman who waits for me, good to the one who keeps looking my way. It is not wasted, this quiet waiting. Something is being made in you in the dark that could not have been made in a season of quick answers.' },
  },
  {
    id: 'healing-1', theme: 'healing', ref: 'Psalm 147:3',
    title: { en: 'I Bind The Wound' },
    body: { en: 'I heal hearts that have been broken, and I bandage the places that are still open. I do not rush you past the grief or tell you it was small. I sit with the wound. Healing in my hands is slow and gentle, but it is real.' },
  },
  {
    id: 'healing-2', theme: 'healing', ref: 'Psalm 34:18',
    title: { en: 'Closest When Breaking' },
    body: { en: 'I am closest to people whose hearts are in pieces. I do not stand back from crying. If you feel further from me than ever, you may have the distance exactly backwards — this is the ground where I come nearest, and I am here now.' },
  },
  {
    id: 'healing-3', theme: 'healing', ref: 'Revelation 21:4',
    title: { en: 'Every Tear Counted' },
    body: { en: 'There is a day coming when I will wipe the tears off your face with my own hand. Death will be finished. Mourning will be finished. This particular ache will be finished, and the old order with it. Until then I keep count; not one tear has gone unnoticed.' },
  },
  {
    id: 'healing-4', theme: 'healing', ref: 'Isaiah 61:1-3',
    title: { en: 'Beauty For Ashes' },
    body: { en: 'I was sent to bind up hearts that broke, to trade a crown of beauty for the ashes you are sitting in, and gladness for grief. I am not asking you to be finished mourning. I am telling you what I intend to do with the ruins.' },
  },
  {
    id: 'provision-1', theme: 'provision', ref: 'Matthew 6:31-33',
    title: { en: 'I Know Your Need' },
    body: { en: 'Stop lying awake asking what you will eat, what you will wear, how the month will close. Your Father knows what you need before you say it. Give your attention to me and my kingdom first; the rest I will take care of in my own way.' },
  },
  {
    id: 'provision-2', theme: 'provision', ref: 'Isaiah 58:11',
    title: { en: 'Water In Drought' },
    body: { en: 'Even in scorched country I will satisfy what you need. I will put strength back into your bones. You will be like a watered garden, like a spring that does not run dry — not because you finally found the source, but because I am the source, and I am not far off.' },
  },
  {
    id: 'provision-3', theme: 'provision', ref: '1 Kings 17:14',
    title: { en: 'The Jar Will Hold' },
    body: { en: 'A widow once had a handful of flour and no plan past that day. I told her the jar would not empty until the rain came, and it did not. I am not promising you abundance on demand. I am promising that what you have will not run out before I move.' },
  },
  {
    id: 'provision-4', theme: 'provision', ref: 'Luke 12:32',
    title: { en: 'Little Flock' },
    body: { en: 'Do not be afraid, small flock. It gives my Father real pleasure to hand you the kingdom — not because you argued for it, but because that is what he is like. If he means to give you that, you can trust him with what this month is asking of you.' },
  },
  {
    id: 'hope-1', theme: 'hope', ref: 'Jeremiah 29:11',
    title: { en: 'A Future For You' },
    body: { en: 'I know the plans I hold for you. They are for your good and not for harm — a future, and something to hope toward. You cannot see it from where you are standing. That is not evidence it is missing. It is only evidence you are human.' },
  },
  {
    id: 'hope-2', theme: 'hope', ref: 'Isaiah 43:19',
    title: { en: 'Something New' },
    body: { en: 'Look — I am starting something new. It is already breaking ground; can you not see it yet? I cut roads through wilderness and put rivers where there has only been sand. Where your life looks like dead ground, that is exactly where I like to begin.' },
  },
  {
    id: 'hope-3', theme: 'hope', ref: 'Ezekiel 37:5',
    title: { en: 'Breath In Dry Bones' },
    body: { en: 'I once stood a prophet in a valley of dry bones and asked him whether they could live. He would not guess. Then I breathed on them and they stood up. Nothing in your life is further gone than that valley was. Wait for my breath. It comes.' },
  },
  {
    id: 'hope-4', theme: 'hope', ref: 'Joel 2:25',
    title: { en: 'The Years Returned' },
    body: { en: 'I will give back the years the locusts ate — the ones you count up late at night and call wasted. I do not work only forward. I go back into what was lost and redeem it. What was eaten is not the final word on your life.' },
  },
] as const;

/** Total pool. 40 draws = 120 completed sets — she meets a repeated QUESTION
 *  long before a repeated CARD, which is the right way round. */
export const MYSTERY_CARD_COUNT = MYSTERY_CARDS.length;

const byId = new Map(MYSTERY_CARDS.map(c => [c.id, c]));

/** Never throws and never returns undefined — a reward screen is the last place
 *  a missing lookup should land. Falls back to the first card. */
export function cardById(id: string): MysteryCard {
  return byId.get(id) ?? MYSTERY_CARDS[0];
}

export function localizedCardTitle(c: MysteryCard, lang: LanguageCode): string {
  return c.title[lang] || c.title.en || '';
}

export function localizedCardBody(c: MysteryCard, lang: LanguageCode): string {
  return c.body[lang] || c.body.en || '';
}
