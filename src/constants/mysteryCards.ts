import type { LanguageCode } from '../state/TranslationsContext';

// Mystery cards - the reward behind the quiz's mystery counter.
//
// Every MYSTERY_EVERY completed sets she draws one card from a face-down 2x2
// spread. It flips over slowly and the text types itself out. Full design in
// docs/mystery-cards-spec.md.
//
// THE FORMULA - the whole thing lives or dies here
// ================================================
//   1. State her problem AS A FACT. Do not ask her about it. The card assumes
//      it already knows what she is thinking and says it out loud for her -
//      she reads the first line and thinks 'that is me'. An 'Are you...?'
//      opener interrogates her instead, and the first draft was rejected for
//      exactly that: too poetic, too indirect.
//   2. God answers immediately and plainly. 'I know.' 'I heard you.' 'I am.'
//   3. One concrete thing. Then stop. Cut every ornamental word.
//
// NOT A BIBLE QUOTE, AND NO REFERENCE IS EVER SHOWN
// =================================================
// Each card is our own writing, anchored to a passage recorded in the `ref`
// field for internal provenance ONLY. It is never rendered - not on the card,
// not on the share image.
//
// Both halves matter. Printing a citation under words we wrote would imply
// they ARE that verse, misattributing our prose to scripture. And shipping the
// verse text itself is a licensing problem: KJV is public domain, but the
// modern translations this app uses for the other six languages are not.
//
// The consequence: every line must stand COMPLETELY alone. She gets this
// sentence and nothing else - no title, no reference, no context.
//
// GUARDRAILS (enforced by __tests__/mysteryCards.test.ts)
// ======================================================
// - No promise of a specific outcome. Never 'keep going and I will give you
//   what you want', never wealth, never a guaranteed rescue. Promise presence,
//   sufficiency, and that nothing is wasted. `lack` is where this drifts, and
//   the tests guard it hardest.
// - `broken` speaks to grief and heartbreak ONLY - never symptoms, illness or
//   cure, so no card can be read as a reason to delay medical care.
// - No exclamation marks. No interrogative openers.
// - The Chinese never uses the words for God as the SUBJECT of his own speech;
//   that is a third-person self-reference and it breaks the voice instantly.
//   The one exception is quoting HER question back at her (unanswered-1).
//
// WARNING: IDS ARE DURABLE
// ========================
// CardProgress stores collected ids. Renaming or deleting one silently empties
// part of a user's collection. APPEND ONLY - same rule as QUIZ_ART.

export type CardTheme =
  | 'doubt'
  | 'unanswered'
  | 'lost'
  | 'weary'
  | 'afraid'
  | 'alone'
  | 'unworthy'
  | 'broken'
  | 'lack'
  | 'hopeless';

/** Display order in the collection. Each theme is a concern she actually has. */
export const CARD_THEMES: readonly CardTheme[] = [
  'doubt',              // She is not sure God is real.
  'unanswered',              // She prayed a long time and got nothing back.
  'lost',              // She does not know what to choose.
  'weary',              // She is exhausted and cannot keep going.
  'afraid',              // She is frightened.
  'alone',              // She is lonely; she believes nobody actually cares.
  'unworthy',              // Shame and guilt - she believes she is not good enough.
  'broken',              // Grief and heartbreak.
  'lack',              // No money, no resources, no support.
  'hopeless',              // She cannot see a future.
] as const;

export interface MysteryCard {
  /** Stable, durable, never reused. See the warning above. */
  id: string;
  theme: CardTheme;
  /** Internal provenance ONLY - never rendered anywhere. */
  ref: string;
  /** 27-48 words in English, 38-65 characters in Chinese. */
  body: Partial<Record<LanguageCode, string>>;
}

export const MYSTERY_CARDS: readonly MysteryCard[] = [
  // ---- doubt - She is not sure God is real.
  {
    id: 'doubt-1', theme: 'doubt', ref: 'Jeremiah 29:13',
    body: {
      en: 'Have you ever wondered whether I exist? I do. Say out loud what your heart wants — say it to me. I have been here the whole time.',
      'zh-Hans': '你一定想过，我到底存不存在。我存在。把你心里真正想要的，大声说出来，说给我听。我一直都在。',
    },
  },
  {
    id: 'doubt-2', theme: 'doubt', ref: '1 Kings 19:12',
    body: {
      en: 'You prayed and felt nothing. No sign, no answer, nothing. I was there. I do not always come the way you expect, and quiet is not the same as absent. Say it again tonight. I am listening.',
      'zh-Hans': '你祷告了，可什么感觉也没有。没有回应，没有动静。我在。我不一定用你以为的方式出现，安静不等于我不在。今晚再说一次，我在听。',
    },
  },
  {
    id: 'doubt-3', theme: 'doubt', ref: 'John 6:37',
    body: {
      en: 'You think this is for other people — the ones who grew up with it, who say the right words. It was never a club. Come as you are, tonight, unsure. I will not turn you away.',
      'zh-Hans': '你觉得信这件事是别人的事——那些从小就信的人，那些会说那套话的人。从来不是这样。你现在这个样子就可以来，怀疑也可以带着。我不会把你推开。',
    },
  },
  {
    id: 'doubt-4', theme: 'doubt', ref: 'Isaiah 49:16',
    body: {
      en: 'You believe I am real. You just do not believe I am looking at you — at someone ordinary, with your name, your small life. I am. Before anyone else knew you, I knew you. You are not one of many to me.',
      'zh-Hans': '你信我存在，只是不信我会看你——一个普通人，有名字，过着不起眼的日子。我在看。在谁都还不认识你的时候，我就认识你了。你对我不是其中一个。',
    },
  },
  // ---- unanswered - She prayed a long time and got nothing back.
  {
    id: 'unanswered-1', theme: 'unanswered', ref: 'Habakkuk 2:3',
    body: {
      en: 'You must have asked many times: why does God not answer? I heard you. Some things I cannot hand you yet — not because you fell short, but because it is not time. I have not gone anywhere.',
      'zh-Hans': '你问过很多次——神为什么不回答我？我听见了。有些东西现在还不能给你，不是你不够好，是时候还没到。我没有走开。',
    },
  },
  {
    id: 'unanswered-2', theme: 'unanswered', ref: 'Romans 8:26',
    body: {
      en: 'You went back over it — maybe you said it wrong, maybe you did not have enough faith, maybe that is why. No. You do not have to get the words right. I heard what you could not say.',
      'zh-Hans': '你反复想，是不是自己说错了，是不是信得不够，所以才没有回音。不是。你不需要把话说对。你说不出口的那部分，我也听见了。',
    },
  },
  {
    id: 'unanswered-3', theme: 'unanswered', ref: 'Revelation 3:20',
    body: {
      en: 'You stopped asking. It was easier than waiting, easier than hoping and being wrong again. I noticed. I did not leave when you went quiet, and I am still here now. Tell me one true thing.',
      'zh-Hans': '你不再求了。不问，比一直等着、一次次落空要好受些。我看见了。你安静下来的那段时间，我没有走，现在也还在。跟我说一件真心话。',
    },
  },
  {
    id: 'unanswered-4', theme: 'unanswered', ref: '2 Corinthians 12:9',
    body: {
      en: 'The answer was no. You have turned it over for months and it still does not sit right, and part of you is angry with me. I can hold that. I am not going to explain it away, and I am not going anywhere.',
      'zh-Hans': '答案是不行。你想了很久，还是过不去，心里有一部分在怪我。可以怪。我不会跟你讲一堆道理，也不会因为你生气就走开。',
    },
  },
  // ---- lost - She does not know what to choose.
  {
    id: 'lost-1', theme: 'lost', ref: 'Isaiah 30:21',
    body: {
      en: 'You keep going around the same decision. You pick it up, put it down, pick it up again. I know which one it is. You do not have to solve it tonight. Take the next small step and I will meet you there.',
      'zh-Hans': '那个决定，你已经绕了很久。拿起来，放下，又拿起来。我知道是哪一件。今天不用想出答案。先走眼前这一步，我在那儿等你。',
    },
  },
  {
    id: 'lost-2', theme: 'lost', ref: 'Psalm 32:8',
    body: {
      en: 'You are afraid of choosing wrong — that one bad call will cost you years you cannot get back. I have watched people choose badly and I did not lose them. Choose. If it goes wrong, I am still with you, and nothing is wasted.',
      'zh-Hans': '你怕选错，怕一个决定毁掉后面好几年。我见过很多人选错，我没有因此丢下他们。去选。真走错了，我还在你旁边，走过的路不会白走。',
    },
  },
  {
    id: 'lost-3', theme: 'lost', ref: 'John 10:27',
    body: {
      en: 'Everyone has told you what to do, and all of it sounds reasonable, and none of it is theirs to live. Go quiet for a minute. You know my voice better than you think. Ask me, and then stop talking.',
      'zh-Hans': '每个人都在告诉你该怎么做，每一种说法听着都有道理，可这日子不是他们过。安静一会儿。我的声音，你其实认得出来。问我，然后别说话。',
    },
  },
  {
    id: 'lost-4', theme: 'lost', ref: 'Isaiah 42:16',
    body: {
      en: 'You want to see the whole road before you move, and you cannot see past the next few weeks. That is all anyone gets. You will not get the map. You get me, walking it with you, one turn at a time.',
      'zh-Hans': '你想把整条路看清楚再动，可你只能看到眼前几个星期。谁都只能看到这么多。地图我不会给你。我会陪你走，一个路口，一个路口地走。',
    },
  },
  // ---- weary - She is exhausted and cannot keep going.
  {
    id: 'weary-1', theme: 'weary', ref: 'Exodus 33:14',
    body: {
      en: 'You cannot stop. If you stop it all falls, and you are the only one holding it. I have seen how long you have carried this. Put it down for an hour. You were never holding it alone.',
      'zh-Hans': '你停不下来。一停下来，好像整个都会塌，撑着的只有你一个。我看着你扛了多久。放下一个小时。你从来不是一个人在扛。',
    },
  },
  {
    id: 'weary-2', theme: 'weary', ref: 'Matthew 11:28',
    body: {
      en: 'You are the one everybody calls. You handle it, you fix it, you remember what no one else remembers, and nobody asks how you are. I am asking. Come and sit down. With me you do not have to be useful.',
      'zh-Hans': '什么事都是找你。你处理，你收拾，别人忘掉的你都记得，可没人问你怎么样。我问你。过来坐下。在我这儿，你不用有用。',
    },
  },
  {
    id: 'weary-3', theme: 'weary', ref: 'Lamentations 3:23',
    body: {
      en: 'You wake up tired. Before the day starts you are already behind it, and you cannot remember the last morning that felt like a beginning. I know. I am not waiting for a stronger version of you. Today, just the next hour.',
      'zh-Hans': '你醒来就已经累了。天还没开始，你就落在后面，也想不起上一次早上是有力气的。我知道。我不是在等一个更好的你。今天，先过这一个钟头。',
    },
  },
  {
    id: 'weary-4', theme: 'weary', ref: 'Mark 2:27',
    body: {
      en: 'You think you have to earn rest — finish the list, deserve it, then sit down. I never set that price. You do not have to finish to be allowed to stop. Stop now, at the unfinished part.',
      'zh-Hans': '你觉得休息得先挣到——把事做完，配得上了，才能坐下来。这个价不是我定的。你不用做完才有资格停。就停在没做完的地方。',
    },
  },
  // ---- afraid - She is frightened.
  {
    id: 'afraid-1', theme: 'afraid', ref: 'Isaiah 43:2',
    body: {
      en: 'There is a date coming and you are counting down to it. You have played it out a hundred ways and every version scares you. I will be in the room. Not watching from far off — in it, with you.',
      'zh-Hans': '有一件事快到了，你一天天在数。你在心里演过很多遍，每一遍都让你发慌。到那天，我在那间屋子里。不是远远看着，是跟你一起在里面。',
    },
  },
  {
    id: 'afraid-2', theme: 'afraid', ref: 'Psalm 91:5',
    body: {
      en: 'It gets worse at night. The house is quiet and everything you pushed down all day comes back louder. I am awake. You do not have to solve this before morning. Just stay here with me until it is light.',
      'zh-Hans': '到了晚上就更难。屋里安静下来，白天压住的事一件件都回来，还更大声。我醒着。天亮之前你不用把它想明白。就在这儿陪着我，等到天亮。',
    },
  },
  {
    id: 'afraid-3', theme: 'afraid', ref: 'Romans 8:38',
    body: {
      en: 'You are afraid of losing someone. You have already rehearsed the phone call. I am not going to tell you what is coming. I can tell you that nothing, not even that, puts either of you outside my reach.',
      'zh-Hans': '你怕失去一个人。那通电话，你已经在心里预演过了。以后会怎样，我不会告诉你。我能告诉你的是：不管发生什么，你们两个都不会掉出我的手。',
    },
  },
  {
    id: 'afraid-4', theme: 'afraid', ref: 'Isaiah 41:10',
    body: {
      en: 'You are not afraid of the thing so much as of yourself in it — that you will fall apart, that you will not be enough. You will not be enough on your own. You were never meant to be. I hold what you cannot.',
      'zh-Hans': '你怕的其实不是那件事，是那件事里的自己——怕你会崩掉，怕你撑不住。靠你自己，本来就撑不住。你不必一个人撑。你撑不住的那部分，我接着。',
    },
  },
  // ---- alone - She is lonely; she believes nobody actually cares.
  {
    id: 'alone-1', theme: 'alone', ref: 'John 14:18',
    body: {
      en: 'The door closes, the room goes quiet, and it is just you again. Nobody is coming back tonight. I am here. I did not need an invitation, and I am not leaving when the light goes off.',
      'zh-Hans': '门一关，屋里安静下来，又剩你一个。今晚不会有人回来了。我在。我不用你开口请，也不会等灯灭了就走。你不说话也行，我陪着。',
    },
  },
  {
    id: 'alone-2', theme: 'alone', ref: 'Psalm 27:10',
    body: {
      en: 'People have left you before, so now you expect it. You meet someone new and already know how it ends. I know. I saw each one go. I am not on that list, and I never will be.',
      'zh-Hans': '以前有人说走就走，所以你现在提前防着。刚认识一个人，你就已经想好他哪天会走。我知道。每一个走掉的，我都看见了。那张名单上没有我，以后也不会有。',
    },
  },
  {
    id: 'alone-3', theme: 'alone', ref: 'Psalm 139:1-4',
    body: {
      en: 'You can be in a full room, laughing, answering everyone, and still be completely alone in there. Nobody notices. I notice. I know which parts of tonight you performed and which parts were real. You never have to perform for me.',
      'zh-Hans': '你可以坐在一桌人中间，笑着接每一句话，心里还是一个人。没人看出来。我看出来了。今晚哪几句是演的，哪几句是真的，我都清楚。在我这儿你不用演。',
    },
  },
  {
    id: 'alone-4', theme: 'alone', ref: 'Matthew 10:29-31',
    body: {
      en: 'The big things you handle alone. It is the small ones that get you — something funny on the bus, a bad hour at three o\'clock, and nobody to tell. I know. Tell me. Small things do not bore me.',
      'zh-Hans': '大事你自己扛得住。难的是小事——公交上看到一个好笑的，下午三点心里一沉，没人可说。我知道。跟我说。多小的事我都不嫌烦。',
    },
  },
  // ---- unworthy - Shame and guilt - she believes she is not good enough.
  {
    id: 'unworthy-1', theme: 'unworthy', ref: 'Isaiah 43:25',
    body: {
      en: 'You think you have done too much wrong to come back to me. I know all of it — more than you remember. I have never wanted to replace you. Come as you are.',
      'zh-Hans': '你觉得自己做错的事太多了，多到不好意思再来找我。你数得出的我都知道，比你记得的还全。我从没想过要换掉你。你就这样过来。',
    },
  },
  {
    id: 'unworthy-2', theme: 'unworthy', ref: '1 Samuel 16:7',
    body: {
      en: 'You look at other women and score yourself against them every time — her body, her marriage, her job — and you always come out lower. I do not rank you. I have never once compared you to her.',
      'zh-Hans': '你看别的女人，一眼就开始给自己打分——身材、婚姻、工作，比来比去总是你低。我不给人排名。我从来没有拿她跟你比过。',
    },
  },
  {
    id: 'unworthy-3', theme: 'unworthy', ref: 'Isaiah 1:18',
    body: {
      en: 'You keep putting off praying until you are a better version of yourself — less angry, less of a mess. That day is not coming, and I am not waiting for it. Talk to me tonight, before you have fixed anything.',
      'zh-Hans': '你一直想等自己好一点再祷告——脾气好一点，日子理顺一点。那天不会来的，我也没在等它。今晚就说，什么都还没收拾好也说。',
    },
  },
  {
    id: 'unworthy-4', theme: 'unworthy', ref: 'John 4:16-26',
    body: {
      en: 'There is one thing you have never said out loud to anyone. You are sure that if people knew, they would be done with you. I have known the whole time. It did not change anything on my side.',
      'zh-Hans': '有一件事，你从来没跟任何人说过。你认定别人要是知道了，就不会再要你了。我一直都知道。知道以后，我这边什么也没变。',
    },
  },
  // ---- broken - Grief and heartbreak.
  {
    id: 'broken-1', theme: 'broken', ref: 'Psalm 56:8',
    body: {
      en: 'It has been long enough that people expect you to be fine, so you say you are. You are not. I know. There is no deadline here. You can still miss them in front of me.',
      'zh-Hans': '时间过去够久了，别人默认你早该走出来了，你也就说自己没事。其实没有。我知道。这里没有期限。你想他，就在我面前想，不用忍着。',
    },
  },
  {
    id: 'broken-2', theme: 'broken', ref: 'Genesis 16:11-13',
    body: {
      en: 'Someone you trusted with everything used it against you. And you still go back over it looking for the part that was your fault. I saw what they did. That was done to you, not by you.',
      'zh-Hans': '你把所有的都交给一个人，他反手用它伤你。到现在你还在翻，想找出哪一段是自己的错。他做的事我看见了。那是别人对你做的，不是你做的。',
    },
  },
  {
    id: 'broken-3', theme: 'broken', ref: 'Isaiah 25:8',
    body: {
      en: 'You cry in the car, or with the shower running, so nobody hears. Then you are ashamed of yourself for still being like this. I am not ashamed of you. Take as long as it takes.',
      'zh-Hans': '你躲在车里哭，或者开着水声哭，不让人听见。哭完又嫌自己怎么还这样。我不嫌。在我这儿哭不算丢人。你哭多久都行，我不催。',
    },
  },
  {
    id: 'broken-4', theme: 'broken', ref: 'Isaiah 54:10',
    body: {
      en: 'It happened years ago. You can say the date. And it still opens up on an ordinary Tuesday like it was last week. I know. Old does not mean over. You are not failing at this.',
      'zh-Hans': '事情过去好几年了，具体哪天你都记得。可它还是会在某个平常的下午突然翻上来，像上周才发生。我知道。过去久了不等于过去了。你没有做错什么。',
    },
  },
  // ---- lack - No money, no resources, no support.
  {
    id: 'lack-1', theme: 'lack', ref: 'Deuteronomy 31:8',
    body: {
      en: 'You are working so hard, chasing something with everything you have. But the road keeps getting harder — you lack resources, and no one is backing you. I know. I have watched every step. Do not be afraid. Keep going. I am not letting you walk this alone.',
      'zh-Hans': '你很拼，把手里所有的都押在一件事上。可路越走越难——没资源，也没人在背后托你。我知道。这一步步我都看着。别怕。继续走，这条路我不会让你一个人走。',
    },
  },
  {
    id: 'lack-2', theme: 'lack', ref: 'Matthew 6:8',
    body: {
      en: 'You do the numbers again at night and they still do not work. Rent, the card, the thing that broke this week. I know the exact number. This does not make you a failure, and I am not looking away.',
      'zh-Hans': '夜里你又算了一遍，怎么算都不够。房租、卡账、这周又坏了的那个。差多少我清楚。这不代表你这个人不行。我没有把眼睛移开。',
    },
  },
  {
    id: 'lack-3', theme: 'lack', ref: 'Isaiah 46:4',
    body: {
      en: 'Everyone in your house leans on you and there is nobody behind you. You get up and do it anyway, and nobody says thank you. I see all of it. I am carrying you while you carry them.',
      'zh-Hans': '一家人都靠着你，你身后没人。你还是每天照样起来做，也没人说一句谢谢。这些我都看见。你背着他们，我背着你。',
    },
  },
  {
    id: 'lack-4', theme: 'lack', ref: 'Hebrews 4:16',
    body: {
      en: 'You made yourself ask for help, and they said no. Now you have decided you will never ask anyone again. I know what that ask cost you. Being turned down did not make you smaller. My door does not work that way.',
      'zh-Hans': '你逼着自己开口求人，人家说不行。你现在决定以后再也不开口了。那一句话有多难开口，我知道。被拒绝不代表你低人一等。我这儿的门，不是那样开的。',
    },
  },
  // ---- hopeless - She cannot see a future.
  {
    id: 'hopeless-1', theme: 'hopeless', ref: '1 Corinthians 15:58',
    body: {
      en: 'You look back at a whole stretch of your life and call it wasted — the wrong man, the wrong job, years you cannot get back. I was there for those years too. Nothing in them is thrown away.',
      'zh-Hans': '你回头看那几年，只想到两个字：白费。跟错了人，做错了选择，时间也回不来了。那几年我也在。那里面没有一样是白扔的。',
    },
  },
  {
    id: 'hopeless-2', theme: 'hopeless', ref: 'Genesis 18:14',
    body: {
      en: 'You wanted something, and now you think you are too old to start — that the version of you who could have done it is gone. I do not count your years the way you do. I am not finished with you.',
      'zh-Hans': '你想要过一样东西，现在觉得自己太老了，来不及了——那个能做成的你已经不在了。年龄我不这么算。我跟你的事，还没做完。',
    },
  },
  {
    id: 'hopeless-3', theme: 'hopeless', ref: 'John 5:17',
    body: {
      en: 'Nothing has changed in years. Same room, same job, same worry when you wake up. You have stopped believing anything will move. I have not stopped. Slow is not the same as abandoned.',
      'zh-Hans': '好几年了，什么都没变。还是那个屋子，那份工作，早上一睁眼还是那件心事。你已经不指望它会动了。我没停。慢，不等于我把你丢下了。',
    },
  },
  {
    id: 'hopeless-4', theme: 'hopeless', ref: 'Lamentations 3:22-23',
    body: {
      en: 'When you try to picture five years from now, nothing comes. Just more of this. I know. I am not asking you to imagine anything. I am asking you to get through today, with me next to you.',
      'zh-Hans': '你试着想象五年后的日子，脑子里什么都没有，只有现在这样再多几年。我知道。我没要你想象。你只要过完今天，我就在旁边。',
    },
  },
] as const;

/** 40 draws x 3 sets = 120 completed sets before a card can repeat, against 65
 *  sets per quiz bank cycle - she meets a repeated QUESTION long before a
 *  repeated CARD, which is the right way round since the card is the reward. */
export const MYSTERY_CARD_COUNT = MYSTERY_CARDS.length;

const byId = new Map(MYSTERY_CARDS.map(c => [c.id, c]));

/** Never throws, never returns undefined - a reward screen is the last place a
 *  missing lookup should land. Falls back to the first card. */
export function cardById(id: string): MysteryCard {
  return byId.get(id) ?? MYSTERY_CARDS[0];
}

/** Falls back to English so a half-translated pool renders rather than blanks. */
export function localizedCardBody(c: MysteryCard, lang: LanguageCode): string {
  return c.body[lang] || c.body.en || '';
}
