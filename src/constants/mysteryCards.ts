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
      en: 'You have wondered whether I exist. More than once. I do. Say out loud what your heart wants — say it to me. I have been here the whole time.',
      'zh-Hans': '你一定想过，我到底存不存在。我存在。把你心里真正想要的，大声说出来，说给我听。我一直都在。',
      'zh-Hant': '你不只一次想過，我到底存不存在。我存在。把你心裡真正想要的，大聲說出來，說給我聽。我一直都在，從沒走開。',
      'de': 'Du hast dich schon gefragt, ob es mich überhaupt gibt. Es gibt mich. Sag laut, was dein Herz wirklich will — sag es mir. Ich war die ganze Zeit da.',
      'fr': 'Tu t\'es déjà demandé si j\'existe vraiment, si tout ça n\'est pas dans ta tête. J\'existe. Dis à voix haute ce que ton cœur veut — dis-le-moi. J\'étais là depuis le début.',
      'es': 'Más de una vez te has preguntado si existo de verdad. Existo. Di en voz alta lo que tu corazón está pidiendo, y dímelo a mí. He estado aquí todo este tiempo, contigo.',
      'pt': 'Mais de uma vez você se perguntou se eu existo mesmo. Eu existo. Diga em voz alta o que o seu coração quer de verdade, e diga isso pra mim. Eu estive aqui esse tempo todo.',
    },
  },
  {
    id: 'doubt-2', theme: 'doubt', ref: '1 Kings 19:12',
    body: {
      en: 'You prayed and felt nothing. No sign, no answer, nothing. I was there. I do not always come the way you expect, and quiet is not the same as absent. Say it again tonight. I am listening.',
      'zh-Hans': '你祷告了，可什么感觉也没有。没有回应，没有动静。我在。我不一定用你以为的方式出现，安静不等于我不在。今晚再说一次，我在听。',
      'zh-Hant': '你禱告了，卻什麼感覺也沒有。沒有回應，沒有動靜。我在。我不一定用你以為的方式出現，安靜不等於我不在。今晚再說一次，我在聽。',
      'de': 'Du hast gebetet und nichts gespürt. Kein Zeichen, keine Antwort. Ich war da. Ich komme nicht immer so, wie du es erwartest, und still heißt nicht weg. Sag es heute Nacht noch einmal. Ich höre zu.',
      'fr': 'Tu as prié et tu n\'as rien senti. Aucun signe, aucune réponse. J\'étais là. Je ne viens pas toujours comme tu l\'attends, et le silence n\'est pas une absence. Redis-le ce soir. J\'écoute.',
      'es': 'Oraste y no sentiste nada. Ninguna señal, ninguna respuesta, nada. Yo estaba ahí. No siempre llego de la forma que esperas, y que haya silencio no significa que me haya ido. Háblame otra vez esta noche. Te escucho.',
      'pt': 'Você orou e não sentiu nada. Nenhum sinal, nenhuma resposta, nada. Eu estava ali. Nem sempre chego do jeito que você espera, e silêncio não é ausência. Fale comigo de novo hoje à noite. Eu escuto.',
    },
  },
  {
    id: 'doubt-3', theme: 'doubt', ref: 'John 6:37',
    body: {
      en: 'You think this is for other people — the ones who grew up with it, who say the right words. It was never a club. Come as you are, tonight, unsure. I will not turn you away.',
      'zh-Hans': '你觉得信这件事是别人的事——那些从小就信的人，那些会说那套话的人。从来不是这样。你现在这个样子就可以来，怀疑也可以带着。我不会把你推开。',
      'zh-Hant': '你覺得信這件事是別人的事——那些從小就信的人，那些會說那套話的人。從來不是這樣。你現在這個樣子就可以來，帶著懷疑也可以。我不會把你推開。',
      'de': 'Du denkst, das ist was für andere — für die, die damit aufgewachsen sind, die die richtigen Worte kennen. Das war nie ein Verein. Komm heute Nacht, so wie du bist, unsicher. Ich schicke dich nicht weg.',
      'fr': 'Tu te dis que c\'est pour les autres — ceux qui ont grandi dedans, ceux qui savent quoi dire. Ça n\'a jamais été un club. Viens ce soir, comme tu es, avec tes doutes. Je ne te renvoie pas.',
      'es': 'Piensas que esto es para otras personas: las que crecieron creyendo, las que saben decir las palabras correctas. Nunca fue un club. Ven como estás, esta noche, con tus dudas encima. No te voy a rechazar.',
      'pt': 'Você acha que isso é para as outras pessoas: as que cresceram na fé, as que sabem falar do jeito certo. Isso nunca foi um clube. Venha como você está, hoje, em dúvida. Eu não vou te mandar embora.',
    },
  },
  {
    id: 'doubt-4', theme: 'doubt', ref: 'Isaiah 49:16',
    body: {
      en: 'You believe I am real. You just do not believe I am looking at you — at someone ordinary, with your name, your small life. I am. Before anyone else knew you, I knew you. You are not one of many to me.',
      'zh-Hans': '你信我存在，只是不信我会看你——一个普通人，有名字，过着不起眼的日子。我在看。在谁都还不认识你的时候，我就认识你了。你对我不是其中一个。',
      'zh-Hant': '你信我存在，只是不信我會看你——一個普通人，有名字，過著不起眼的日子。我在看。在誰都還不認識你以前，我就認識你了。你對我不是其中一個。',
      'de': 'Du glaubst, dass es mich gibt. Du glaubst nur nicht, dass ich dich ansehe — eine ganz gewöhnliche Frau mit deinem Namen, deinem kleinen Leben. Ich sehe dich. Bevor irgendwer dich kannte, kannte ich dich. Für mich bist du keine von vielen.',
      'fr': 'Tu crois que j\'existe. Ce que tu ne crois pas, c\'est que je te regarde, toi — quelqu\'un d\'ordinaire, avec ton prénom, ta petite vie. Je te regarde. Avant que personne ne te connaisse, je te connaissais. Tu n\'es pas une parmi d\'autres.',
      'es': 'Crees que soy real. Lo que no crees es que te esté mirando a ti, alguien común, con tu nombre y tu vida pequeña. Te miro. Antes de que alguien te conociera, yo ya te conocía. No eres una más.',
      'pt': 'Você acredita que eu sou real. O que você não acredita é que eu esteja olhando pra você, alguém comum, com seu nome e sua vida pequena. Estou olhando. Antes de qualquer um te conhecer, eu já te conhecia.',
    },
  },
  // ---- unanswered - She prayed a long time and got nothing back.
  {
    id: 'unanswered-1', theme: 'unanswered', ref: 'Habakkuk 2:3',
    body: {
      en: 'You must have asked many times: why does God not answer? I heard you. Some things I cannot hand you yet — not because you fell short, but because it is not time. I have not gone anywhere.',
      'zh-Hans': '你问过很多次——神为什么不回答我？我听见了。有些东西现在还不能给你，不是你不够好，是时候还没到。我没有走开。',
      'zh-Hant': '你問過很多次——神為什麼不回答我？我聽見了。有些東西現在還不能給你，不是你不夠好，是時候還沒到。我沒有走開。',
      'de': 'Du hast oft gefragt: Warum antwortet Gott mir nicht? Ich habe dich gehört. Manches kann ich dir noch nicht geben — nicht, weil du zu wenig bist, sondern weil es zu früh ist. Ich bin nicht weg.',
      'fr': 'Tu l\'as demandé tant de fois : pourquoi Dieu ne me répond pas ? Je t\'ai entendue. Certaines choses, je ne peux pas encore te les donner — pas parce que tu n\'es pas assez, mais parce que ce n\'est pas l\'heure. Je n\'ai pas bougé.',
      'es': 'Lo has preguntado muchas veces: ¿por qué Dios no me responde? Te oí. Hay cosas que todavía no puedo ponerte en las manos, no porque hayas fallado, sino porque no es el momento. No me he ido a ninguna parte.',
      'pt': 'Você já perguntou muitas vezes: por que Deus não me responde? Eu te ouvi. Tem coisas que ainda não posso colocar na sua mão, não porque você falhou, mas porque não é hora. Eu não fui embora.',
    },
  },
  {
    id: 'unanswered-2', theme: 'unanswered', ref: 'Romans 8:26',
    body: {
      en: 'You went back over it — maybe you said it wrong, maybe you did not have enough faith, maybe that is why. No. You do not have to get the words right. I heard what you could not say.',
      'zh-Hans': '你反复想，是不是自己说错了，是不是信得不够，所以才没有回音。不是。你不需要把话说对。你说不出口的那部分，我也听见了。',
      'zh-Hant': '你反覆在想，是不是自己說錯了，是不是信得不夠，所以才沒有回音。不是。你不需要把話說對。你說不出口的那部分，我也聽見了。',
      'de': 'Du bist alles noch mal durchgegangen: vielleicht falsch gesagt, vielleicht zu wenig geglaubt, vielleicht liegt es daran. Nein. Du musst die Worte nicht richtig treffen. Ich habe gehört, was du nicht sagen konntest.',
      'fr': 'Tu as tout repassé dans ta tête : peut-être que tu l\'as mal dit, peut-être que tu n\'as pas cru assez fort, peut-être que c\'est pour ça. Non. Tu n\'as pas à trouver les bons mots. J\'ai entendu ce que tu n\'arrivais pas à dire.',
      'es': 'Le has dado vueltas: quizá lo dijiste mal, quizá no tuviste fe suficiente, quizá sea por eso. No. No tienes que encontrar las palabras exactas. Lo que no lograste decir, también lo escuché.',
      'pt': 'Você ficou remoendo: talvez tenha falado errado, talvez a sua fé não fosse suficiente, talvez seja por isso. Não. Você não precisa acertar as palavras. O que você não conseguiu dizer, eu também ouvi.',
    },
  },
  {
    id: 'unanswered-3', theme: 'unanswered', ref: 'Revelation 3:20',
    body: {
      en: 'You stopped asking. It was easier than waiting, easier than hoping and being wrong again. I noticed. I did not leave when you went quiet, and I am still here now. Tell me one true thing.',
      'zh-Hans': '你不再求了。不问，比一直等着、一次次落空要好受些。我看见了。你安静下来的那段时间，我没有走，现在也还在。跟我说一件真心话。',
      'zh-Hant': '你不再求了。不問，比一直等、一次次落空要好受些。我看見了。你安靜下來的那段日子，我沒有走，現在也還在。跟我說一件真心話。',
      'de': 'Du hast aufgehört zu fragen. Das war leichter als warten, leichter als hoffen und wieder danebenliegen. Ich habe es gemerkt. Ich bin nicht gegangen, als du still wurdest, und ich bin auch jetzt noch da. Sag mir eine wahre Sache.',
      'fr': 'Tu as arrêté de demander. C\'était plus simple que d\'attendre, plus simple que d\'espérer et de se tromper encore. Je l\'ai vu. Je ne suis pas parti quand tu t\'es tue, et je suis encore là. Dis-moi une chose vraie.',
      'es': 'Dejaste de pedir. Era más fácil que esperar, más fácil que hacerte ilusiones y equivocarte otra vez. Me di cuenta. No me fui cuando te quedaste callada, y sigo aquí ahora. Dime una sola cosa verdadera.',
      'pt': 'Você parou de pedir. Era mais fácil do que esperar, mais fácil do que criar esperança e se decepcionar de novo. Eu percebi. Não fui embora quando você se calou, e continuo aqui agora. Me diga uma coisa verdadeira.',
    },
  },
  {
    id: 'unanswered-4', theme: 'unanswered', ref: '2 Corinthians 12:9',
    body: {
      en: 'The answer was no. You have turned it over for months and it still does not sit right, and part of you is angry with me. I can hold that. I am not going to explain it away, and I am not going anywhere.',
      'zh-Hans': '答案是不行。你想了很久，还是过不去，心里有一部分在怪我。可以怪。我不会跟你讲一堆道理，也不会因为你生气就走开。',
      'zh-Hant': '答案是不行。你翻來覆去想了好幾個月，還是過不去，心裡有一塊在怪我。怪吧，我接得住。我不會跟你講一堆道理，也不會因為你生氣就走。',
      'de': 'Die Antwort war nein. Du drehst es seit Monaten hin und her, und es fühlt sich immer noch falsch an, und ein Teil von dir ist wütend auf mich. Das halte ich aus. Ich rede es dir nicht schön, und ich gehe nicht weg.',
      'fr': 'La réponse était non. Ça fait des mois que tu la retournes et ça ne passe toujours pas, et une partie de toi m\'en veut. Je peux le porter. Je ne vais pas te l\'expliquer joliment, et je ne pars pas.',
      'es': 'La respuesta fue no. Llevas meses dándole vueltas y sigue sin encajar, y una parte de ti está enojada conmigo. Puedo con eso. No voy a explicártelo para que duela menos, y no me voy a ir.',
      'pt': 'A resposta foi não. Faz meses que você remói isso e ainda não encaixa, e uma parte de você está com raiva de mim. Eu aguento. Não vou te explicar isso pra doer menos, e não vou embora.',
    },
  },
  // ---- lost - She does not know what to choose.
  {
    id: 'lost-1', theme: 'lost', ref: 'Isaiah 30:21',
    body: {
      en: 'You keep going around the same decision. You pick it up, put it down, pick it up again. I know which one it is. You do not have to solve it tonight. Take the next small step and I will meet you there.',
      'zh-Hans': '那个决定，你已经绕了很久。拿起来，放下，又拿起来。我知道是哪一件。今天不用想出答案。先走眼前这一步，我在那儿等你。',
      'zh-Hant': '那個決定，你已經繞了很久。拿起來，放下，又拿起來。我知道是哪一件。今天不用想出答案。先走眼前這一步，我在那裡等你。',
      'de': 'Du drehst dich seit Wochen um dieselbe Entscheidung. Aufnehmen, weglegen, wieder aufnehmen. Ich weiß, welche es ist. Du musst sie heute Nacht nicht lösen. Mach den nächsten kleinen Schritt, da bin ich.',
      'fr': 'Tu tournes autour de la même décision depuis des semaines. Tu la prends, tu la reposes, tu la reprends. Je sais laquelle c\'est. Tu n\'as pas à trancher ce soir. Fais le prochain petit pas, je t\'y attends.',
      'es': 'Llevas mucho tiempo dando vueltas a la misma decisión. La tomas, la sueltas, la vuelves a tomar. Sé cuál es. No tienes que resolverla esta noche. Da el siguiente paso pequeño y ahí te espero.',
      'pt': 'Faz tempo que você dá voltas na mesma decisão. Pega, larga, pega de novo. Eu sei qual é. Você não precisa resolver isso hoje. Dê o próximo passo pequeno, e eu te encontro lá.',
    },
  },
  {
    id: 'lost-2', theme: 'lost', ref: 'Psalm 32:8',
    body: {
      en: 'You are afraid of choosing wrong — that one bad call will cost you years you cannot get back. I have watched people choose badly and I did not lose them. Choose. If it goes wrong, I am still with you, and nothing is wasted.',
      'zh-Hans': '你怕选错，怕一个决定毁掉后面好几年。我见过很多人选错，我没有因此丢下他们。去选。真走错了，我还在你旁边，走过的路不会白走。',
      'zh-Hant': '你怕選錯，怕一個決定毀掉往後好幾年。我看過很多人選錯，我沒有因此丟下他們。去選。真的走錯了，我還在你旁邊，走過的路不會白走。',
      'de': 'Du hast Angst, falsch zu wählen — dass eine Entscheidung dich Jahre kostet, die du nicht zurückbekommst. Ich habe Menschen falsch wählen sehen und habe sie nicht verloren. Wähl. Wenn es schiefgeht, bin ich immer noch bei dir, und nichts davon ist umsonst.',
      'fr': 'Tu as peur de mal choisir — qu\'une décision te coûte des années que tu ne rattraperas pas. J\'ai vu des gens choisir mal et je ne les ai pas perdus. Choisis. Si ça tourne mal, je reste avec toi, et rien n\'est perdu.',
      'es': 'Tienes miedo de elegir mal, de que una decisión te cueste años que ya no vuelven. He visto a mucha gente elegir mal y no la solté. Elige. Si sale mal, sigo contigo, y nada de lo andado se pierde.',
      'pt': 'Você tem medo de escolher errado, de uma decisão custar anos que não voltam. Eu vi muita gente escolher errado e não larguei ninguém. Escolha. Se der errado, eu continuo com você, e nada do caminho se perde.',
    },
  },
  {
    id: 'lost-3', theme: 'lost', ref: 'John 10:27',
    body: {
      en: 'Everyone has told you what to do, and all of it sounds reasonable, and none of it is theirs to live. Go quiet for a minute. You know my voice better than you think. Ask me, and then stop talking.',
      'zh-Hans': '每个人都在告诉你该怎么做，每一种说法听着都有道理，可这日子不是他们过。安静一会儿。我的声音，你其实认得出来。问我，然后别说话。',
      'zh-Hant': '每個人都在告訴你該怎麼做，每一種說法聽起來都有道理，可這日子不是他們在過。安靜一下。我的聲音，你其實認得出來。問我，然後別說話。',
      'de': 'Alle sagen dir, was du tun sollst, und alles klingt vernünftig, und keiner von ihnen muss es leben. Sei kurz still. Du kennst meine Stimme besser, als du denkst. Frag mich, und dann hör auf zu reden.',
      'fr': 'Tout le monde te dit quoi faire, tout ça se tient, et personne d\'autre n\'aura à vivre ta vie. Fais silence une minute. Tu reconnais ma voix mieux que tu ne crois. Demande-moi, puis arrête de parler.',
      'es': 'Todos te han dicho qué hacer, todo suena razonable, y ninguno de ellos vive tu vida. Quédate en silencio un momento. Reconoces mi voz mejor de lo que crees. Pregúntame, y después deja de hablar.',
      'pt': 'Todo mundo já te disse o que fazer, tudo soa razoável, e nenhum deles vive a sua vida. Fique em silêncio um minuto. Você reconhece a minha voz melhor do que pensa. Me pergunte, e depois pare de falar.',
    },
  },
  {
    id: 'lost-4', theme: 'lost', ref: 'Isaiah 42:16',
    body: {
      en: 'You want to see the whole road before you move, and you cannot see past the next few weeks. That is all anyone gets. You will not get the map. You get me, walking it with you, one turn at a time.',
      'zh-Hans': '你想把整条路看清楚再动，可你只能看到眼前几个星期。谁都只能看到这么多。地图我不会给你。我会陪你走，一个路口，一个路口地走。',
      'zh-Hant': '你想把整條路看清楚再動，可你只看得到眼前幾個星期。誰都只能看到這麼多。地圖我不會給你。我會陪你走，一個路口，一個路口地走。',
      'de': 'Du willst die ganze Strecke sehen, bevor du losgehst, und du siehst nur ein paar Wochen weit. Mehr bekommt niemand. Die Karte bekommst du nicht. Du bekommst mich, neben dir, Abzweigung für Abzweigung.',
      'fr': 'Tu veux voir toute la route avant de bouger, et tu ne vois pas plus loin que les prochaines semaines. Personne n\'en voit plus. Tu n\'auras pas la carte. Tu m\'as, moi, qui marche avec toi, virage après virage.',
      'es': 'Quieres ver el camino entero antes de moverte, y solo alcanzas a ver las próximas semanas. Nadie ve más que eso. El mapa no te lo voy a dar. Me tienes a mí, caminándolo contigo, una curva a la vez.',
      'pt': 'Você quer ver a estrada inteira antes de sair do lugar, e só enxerga as próximas semanas. Ninguém enxerga mais que isso. O mapa você não vai receber. Você me recebe, andando junto, uma curva de cada vez.',
    },
  },
  // ---- weary - She is exhausted and cannot keep going.
  {
    id: 'weary-1', theme: 'weary', ref: 'Exodus 33:14',
    body: {
      en: 'You cannot stop. If you stop it all falls, and you are the only one holding it. I have seen how long you have carried this. Put it down for an hour. You were never holding it alone.',
      'zh-Hans': '你停不下来。一停下来，好像整个都会塌，撑着的只有你一个。我看着你扛了多久。放下一个小时。你从来不是一个人在扛。',
      'zh-Hant': '你停不下來。一停，好像整個都會塌，撐著的只有你一個。我看著你扛了多久，我知道。放下一個鐘頭。你從來不是一個人在扛。',
      'de': 'Du kannst nicht aufhören. Wenn du aufhörst, fällt alles zusammen, und du bist die Einzige, die es hält. Ich habe gesehen, wie lange du das schon trägst. Leg es für eine Stunde ab. Du hast es nie allein gehalten.',
      'fr': 'Tu ne peux pas t\'arrêter. Si tu t\'arrêtes, tout tombe, et tu es la seule à tenir. J\'ai vu depuis combien de temps tu portes ça. Pose-le une heure. Tu ne l\'as jamais porté seule.',
      'es': 'No puedes parar. Si paras se cae todo, y la única que lo sostiene eres tú. He visto cuánto tiempo llevas cargando esto. Suéltalo una hora. Nunca lo estuviste sosteniendo sola.',
      'pt': 'Você não consegue parar. Se parar, desaba tudo, e quem segura é só você. Eu vi há quanto tempo você carrega isso. Largue por uma hora. Você nunca esteve segurando isso sozinha.',
    },
  },
  {
    id: 'weary-2', theme: 'weary', ref: 'Matthew 11:28',
    body: {
      en: 'You are the one everybody calls. You handle it, you fix it, you remember what no one else remembers, and nobody asks how you are. I am asking. Come and sit down. With me you do not have to be useful.',
      'zh-Hans': '什么事都是找你。你处理，你收拾，别人忘掉的你都记得，可没人问你怎么样。我问你。过来坐下。在我这儿，你不用有用。',
      'zh-Hant': '什麼事都是找你。你處理，你收拾，別人忘掉的你都記得，可沒有人問你好不好。我問你。過來坐下。在我這裡，你不用有用。',
      'de': 'Alle rufen dich an. Du regelst es, du reparierst es, du merkst dir, was sonst keiner behält, und niemand fragt, wie es dir geht. Ich frage. Komm her und setz dich. Bei mir musst du nicht nützlich sein.',
      'fr': 'C\'est toi qu\'on appelle, toujours. Tu gères, tu répares, tu retiens ce que personne ne retient, et personne ne te demande comment tu vas. Moi je te le demande. Viens t\'asseoir. Avec moi tu n\'as pas à être utile.',
      'es': 'A ti te llaman todos. Tú resuelves, tú arreglas, tú recuerdas lo que nadie más recuerda, y nadie te pregunta cómo estás. Yo te pregunto. Ven y siéntate. Conmigo no tienes que servir para algo.',
      'pt': 'Todo mundo liga pra você. Você resolve, você conserta, você lembra o que ninguém mais lembra, e ninguém pergunta como você está. Eu pergunto. Venha e sente. Comigo você não precisa ser útil.',
    },
  },
  {
    id: 'weary-3', theme: 'weary', ref: 'Lamentations 3:23',
    body: {
      en: 'You wake up tired. Before the day starts you are already behind it, and you cannot remember the last morning that felt like a beginning. I know. I am not waiting for a stronger version of you. Today, just the next hour.',
      'zh-Hans': '你醒来就已经累了。天还没开始，你就落在后面，也想不起上一次早上是有力气的。我知道。我不是在等一个更好的你。今天，先过这一个钟头。',
      'zh-Hant': '你醒來就已經是累的。天還沒開始，你就落在後面，也想不起上一次早上是有力氣的。我知道。我不是在等一個更好的你。今天，先過這一個鐘頭。',
      'de': 'Du wachst schon müde auf. Der Tag hat kaum begonnen und du hängst hinterher, und du weißt nicht mehr, wann sich ein Morgen zuletzt nach Anfang angefühlt hat. Ich weiß. Ich warte nicht auf eine stärkere Version von dir. Heute nur die nächste Stunde.',
      'fr': 'Tu te réveilles déjà fatiguée. La journée n\'a pas commencé que tu es en retard dessus, et tu ne sais plus quand un matin a ressemblé à un début. Je sais. Je n\'attends pas une version plus forte de toi. Aujourd\'hui, juste l\'heure qui vient.',
      'es': 'Te despiertas cansada. El día no ha empezado y ya vas atrasada, y no recuerdas la última mañana que se sintió como un comienzo. Lo sé. No estoy esperando una versión más fuerte de ti. Hoy, solo la próxima hora.',
      'pt': 'Você acorda cansada. O dia nem começou e você já está atrasada, e não lembra a última manhã que pareceu um começo. Eu sei. Não estou esperando uma versão mais forte de você. Hoje, só a próxima hora.',
    },
  },
  {
    id: 'weary-4', theme: 'weary', ref: 'Mark 2:27',
    body: {
      en: 'You think you have to earn rest — finish the list, deserve it, then sit down. I never set that price. You do not have to finish to be allowed to stop. Stop now, at the unfinished part.',
      'zh-Hans': '你觉得休息得先挣到——把事做完，配得上了，才能坐下来。这个价不是我定的。你不用做完才有资格停。就停在没做完的地方。',
      'zh-Hant': '你以為休息是要換來的——事情做完，夠格了，才能坐下來。這個規矩不是我定的。你不用做完才有資格停。就停在沒做完的地方。',
      'de': 'Du denkst, du musst dir Ruhe verdienen — erst die Liste fertig, erst würdig sein, dann hinsetzen. Diesen Preis habe ich nie verlangt. Du musst nicht fertig sein, um aufhören zu dürfen. Hör jetzt auf, mitten im Unfertigen.',
      'fr': 'Tu crois qu\'il faut mériter le repos — finir la liste, en être digne, et seulement après s\'asseoir. Ce prix-là, ce n\'est pas moi qui l\'ai fixé. Tu n\'as pas besoin d\'avoir fini pour avoir le droit d\'arrêter. Arrête maintenant, en plein milieu.',
      'es': 'Crees que el descanso hay que ganárselo: termina la lista, merécelo, y entonces siéntate. Ese precio no lo puse yo. No tienes que terminar para tener permiso de parar. Para ahora, en la parte sin terminar.',
      'pt': 'Você acha que precisa merecer o descanso: terminar a lista, aí sim sentar. Esse preço não fui eu que cobrei. Você não precisa terminar pra ter permissão de parar. Pare agora, no meio do que ficou inacabado.',
    },
  },
  // ---- afraid - She is frightened.
  {
    id: 'afraid-1', theme: 'afraid', ref: 'Isaiah 43:2',
    body: {
      en: 'There is a date coming and you are counting down to it. You have played it out a hundred ways and every version scares you. I will be in the room. Not watching from far off — in it, with you.',
      'zh-Hans': '有一件事快到了，你一天天在数。你在心里演过很多遍，每一遍都让你发慌。到那天，我在那间屋子里。不是远远看着，是跟你一起在里面。',
      'zh-Hant': '有一件事快到了，你一天一天在數。你在心裡演過很多遍，每一遍都讓你發慌。到那天，我就在那個房間裡。不是遠遠看著，是跟你一起在裡面。',
      'de': 'Ein Termin kommt näher und du zählst die Tage. Du hast ihn hundertmal durchgespielt und jede Version macht dir Angst. Ich werde in dem Raum sein. Nicht von weitem zusehen — drin, bei dir.',
      'fr': 'Il y a une date qui approche et tu comptes les jours. Tu l\'as imaginée cent fois et chaque version te fait peur. Je serai dans la pièce. Pas à regarder de loin — dedans, avec toi.',
      'es': 'Hay una fecha que se acerca y la vas contando. La has imaginado de cien maneras y todas te dan miedo. Voy a estar en esa habitación. No mirando de lejos: dentro, contigo.',
      'pt': 'Tem uma data chegando e você está contando os dias. Você já imaginou aquilo de cem jeitos e todos te assustam. Eu vou estar naquela sala. Não olhando de longe: lá dentro, junto de você.',
    },
  },
  {
    id: 'afraid-2', theme: 'afraid', ref: 'Psalm 91:5',
    body: {
      en: 'It gets worse at night. The house is quiet and everything you pushed down all day comes back louder. I am awake. You do not have to solve this before morning. Just stay here with me until it is light.',
      'zh-Hans': '到了晚上就更难。屋里安静下来，白天压住的事一件件都回来，还更大声。我醒着。天亮之前你不用把它想明白。就在这儿陪着我，等到天亮。',
      'zh-Hant': '一到晚上就更難。屋裡安靜下來，白天壓住的事一件件都回來，聲音還更大。我醒著。天亮以前你不用把它想明白。就在這裡陪我，等到天亮。',
      'de': 'Nachts wird es schlimmer. Das Haus ist still und alles, was du tagsüber weggedrückt hast, kommt lauter zurück. Ich bin wach. Du musst das nicht bis zum Morgen lösen. Bleib einfach hier bei mir, bis es hell wird.',
      'fr': 'La nuit, c\'est pire. La maison devient silencieuse et tout ce que tu as repoussé dans la journée revient plus fort. Je suis éveillé. Tu n\'as pas à résoudre ça avant le matin. Reste juste ici avec moi jusqu\'au jour.',
      'es': 'De noche es peor. La casa se queda en silencio y todo lo que empujaste hacia abajo durante el día vuelve más fuerte. Estoy despierto. No tienes que resolverlo antes del amanecer. Quédate aquí conmigo hasta que aclare.',
      'pt': 'À noite fica pior. A casa silencia e tudo o que você empurrou pra baixo o dia inteiro volta mais alto. Eu estou acordado. Você não precisa resolver isso antes de amanhecer. Fique aqui comigo até clarear.',
    },
  },
  {
    id: 'afraid-3', theme: 'afraid', ref: 'Romans 8:38',
    body: {
      en: 'You are afraid of losing someone. You have already rehearsed the phone call. I am not going to tell you what is coming. I can tell you that nothing, not even that, puts you outside my reach.',
      'zh-Hans': '你怕失去一个人。那通电话，你已经在心里预演过了。以后会怎样，我不会告诉你。我能告诉你的是：不管发生什么，你们两个都不会掉出我的手。',
      'zh-Hant': '你怕失去一個人。那通電話，你已經在心裡預演過了。以後會怎樣，我不會告訴你。我能告訴你的是：不管發生什麼，你們兩個都不會掉出我的手。',
      'de': 'Du hast Angst, jemanden zu verlieren. Den Anruf hast du im Kopf schon geprobt. Ich sage dir nicht, was kommt. Ich sage dir: nichts, auch das nicht, bringt euch beide aus meiner Reichweite.',
      'fr': 'Tu as peur de perdre quelqu\'un. Le coup de fil, tu l\'as déjà répété dans ta tête. Je ne te dirai pas ce qui vient. Je peux te dire que rien, même pas ça, ne met hors de ma portée ni toi ni cette personne.',
      'es': 'Tienes miedo de perder a alguien. Esa llamada ya la ensayaste en tu cabeza. No te voy a decir lo que viene. Sí te digo esto: nada, ni siquiera eso, los saca a ninguno de los dos de mis manos.',
      'pt': 'Você tem medo de perder alguém. Você já ensaiou aquele telefonema na cabeça. Eu não vou te dizer o que vem. Posso dizer isto: nada, nem isso, tira vocês dois do alcance das minhas mãos.',
    },
  },
  {
    id: 'afraid-4', theme: 'afraid', ref: 'Isaiah 41:10',
    body: {
      en: 'You are not afraid of the thing so much as of yourself in it — that you will fall apart, that you will not be enough. You will not be enough on your own. You were never meant to be. I hold what you cannot.',
      'zh-Hans': '你怕的其实不是那件事，是那件事里的自己——怕你会崩掉，怕你撑不住。靠你自己，本来就撑不住。你不必一个人撑。你撑不住的那部分，我接着。',
      'zh-Hant': '你怕的其實不是那件事，是那件事裡的自己——怕自己會垮，怕自己撐不住。靠你一個人，本來就撐不住。你也不必一個人撐。你撐不住的那部分，我接著。',
      'de': 'Du hast weniger Angst vor der Sache als vor dir darin — dass du zerbrichst, dass du nicht reichst. Allein reichst du nicht. Das war nie so gedacht. Was du nicht halten kannst, halte ich.',
      'fr': 'Ce n\'est pas tant la chose qui te fait peur que toi dedans — l\'idée de craquer, de ne pas suffire. Toute seule, tu ne suffiras pas. Ça n\'a jamais été prévu comme ça. Ce que tu ne peux pas porter, je le porte.',
      'es': 'No le temes tanto a lo que viene como a ti misma dentro de eso: que te desarmes, que no alcances. Sola no vas a alcanzar. Nunca fue la idea. Lo que tú no puedes sostener, lo sostengo yo.',
      'pt': 'Você não tem tanto medo do que vem quanto de você mesma dentro daquilo: de desmoronar, de não dar conta. Sozinha, você não dá. Nunca foi pra dar. O que você não consegue segurar, eu seguro.',
    },
  },
  // ---- alone - She is lonely; she believes nobody actually cares.
  {
    id: 'alone-1', theme: 'alone', ref: 'John 14:18',
    body: {
      en: 'The door closes, the room goes quiet, and it is just you again. Nobody is coming back tonight. I am here. I did not need an invitation, and I am not leaving when the light goes off.',
      'zh-Hans': '门一关，屋里安静下来，又剩你一个。今晚不会有人回来了。我在。我不用你开口请，也不会等灯灭了就走。你不说话也行，我陪着。',
      'zh-Hant': '門一關，屋裡安靜下來，又剩你一個。今晚不會有人回來了。我在。我不用你開口請，也不會等燈一滅就走。你不說話也沒關係，我陪著。',
      'de': 'Die Tür fällt zu, der Raum wird still, und du bist wieder allein. Heute Nacht kommt niemand mehr zurück. Ich bin da. Ich brauchte keine Einladung, und ich gehe nicht, wenn das Licht ausgeht.',
      'fr': 'La porte se referme, la pièce devient silencieuse, et te revoilà seule. Personne ne rentrera ce soir. Je suis là. Je n\'ai pas eu besoin d\'être invité, et je ne pars pas quand la lumière s\'éteint.',
      'es': 'La puerta se cierra, el cuarto se queda callado, y otra vez eres solo tú. Esta noche no va a volver nadie. Aquí estoy. No hizo falta que me invitaras, y no me voy cuando apagues la luz.',
      'pt': 'A porta fecha, o quarto silencia, e de novo é só você. Hoje à noite ninguém volta. Eu estou aqui. Não precisei de convite, e não vou embora quando você apagar a luz.',
    },
  },
  {
    id: 'alone-2', theme: 'alone', ref: 'Psalm 27:10',
    body: {
      en: 'People have left you before, so now you expect it. You meet someone new and already know how it ends. I know. I saw each one go. I am not on that list, and I never will be.',
      'zh-Hans': '以前有人说走就走，所以你现在提前防着。刚认识一个人，你就已经想好他哪天会走。我知道。每一个走掉的，我都看见了。那张名单上没有我，以后也不会有。',
      'zh-Hant': '以前有人說走就走，所以你現在提前防著。剛認識一個人，你就已經想好他哪天會走。我知道。每一個走掉的，我都看見了。那張名單上沒有我，以後也不會有。',
      'de': 'Menschen sind gegangen, also rechnest du längst damit. Du lernst jemanden kennen und weißt schon, wie es endet. Ich weiß. Ich habe jeden gehen sehen. Auf dieser Liste stehe ich nicht, und ich werde nie darauf stehen.',
      'fr': 'Des gens sont partis, alors maintenant tu t\'y attends. Tu rencontres quelqu\'un et tu sais déjà comment ça finira. Je sais. Je les ai vus partir, un par un. Je ne suis pas sur cette liste, et je n\'y serai jamais.',
      'es': 'Ya te dejaron antes, así que ahora lo das por hecho. Conoces a alguien nuevo y ya sabes cómo termina. Lo sé. Vi irse a cada uno. Yo no estoy en esa lista, y nunca voy a estar.',
      'pt': 'Já te deixaram antes, então agora você já espera por isso. Conhece alguém novo e já sabe como termina. Eu sei. Eu vi cada um ir embora. Eu não estou nessa lista, e nunca vou estar.',
    },
  },
  {
    id: 'alone-3', theme: 'alone', ref: 'Psalm 139:1-4',
    body: {
      en: 'You can be in a full room, laughing, answering everyone, and still be completely alone in there. Nobody notices. I notice. I know which parts of tonight you performed and which parts were real. You never have to perform for me.',
      'zh-Hans': '你可以坐在一桌人中间，笑着接每一句话，心里还是一个人。没人看出来。我看出来了。今晚哪几句是演的，哪几句是真的，我都清楚。在我这儿你不用演。',
      'zh-Hant': '你可以坐在滿桌人中間，笑著接每一句話，心裡還是一個人。沒有人看得出來。我看得出來。今晚哪幾句是演的，哪幾句是真的，我都清楚。在我這裡不用演。',
      'de': 'Du kannst in einem vollen Raum sitzen, lachen, allen antworten, und trotzdem völlig allein sein. Niemand merkt es. Ich merke es. Ich weiß, welche Teile von heute Abend gespielt waren und welche echt. Für mich musst du nie spielen.',
      'fr': 'Tu peux être dans une salle pleine, rire, répondre à tout le monde, et rester complètement seule là-dedans. Personne ne le voit. Moi je le vois. Je sais ce qui était joué ce soir et ce qui était vrai. Avec moi, tu n\'as jamais à jouer.',
      'es': 'Puedes estar en una sala llena, riéndote, respondiéndole a todos, y seguir completamente sola ahí dentro. Nadie lo nota. Yo lo noto. Sé qué parte de esta noche actuaste y qué parte fue real. Conmigo nunca tienes que actuar.',
      'pt': 'Você pode estar numa sala cheia, rindo, respondendo todo mundo, e continuar completamente sozinha ali dentro. Ninguém percebe. Eu percebo. Eu sei o que hoje foi encenação e o que foi verdade. Comigo você nunca precisa atuar.',
    },
  },
  {
    id: 'alone-4', theme: 'alone', ref: 'Matthew 10:29-31',
    body: {
      en: 'The big things you handle alone. It is the small ones that get you — something funny on the bus, a bad hour at three o\'clock, and nobody to tell. I know. Tell me. Small things do not bore me.',
      'zh-Hans': '大事你自己扛得住。难的是小事——公交上看到一个好笑的，下午三点心里一沉，没人可说。我知道。跟我说。多小的事我都不嫌烦。',
      'zh-Hant': '大事你自己扛得住。難的是小事——公車上看到一個好笑的，下午三點心裡一沉，卻沒人可以說。我知道。跟我說。多小的事我都不嫌煩。',
      'de': 'Die großen Sachen schaffst du allein. Es sind die kleinen — etwas Komisches im Bus, eine schlechte Stunde um drei, und keiner, dem du es erzählen kannst. Ich weiß. Erzähl es mir. Kleines langweilt mich nicht.',
      'fr': 'Les grosses choses, tu les gères seule. Ce sont les petites qui t\'attrapent — un truc drôle dans le bus, un mauvais quart d\'heure à trois heures, et personne à qui le dire. Je sais. Dis-le-moi. Les petites choses ne m\'ennuient pas.',
      'es': 'Lo grande lo sostienes sola. Lo que duele son las cosas pequeñas: algo gracioso en el autobús, una hora mala a las tres, y nadie a quien contárselo. Lo sé. Cuéntamelo. Lo pequeño no me aburre.',
      'pt': 'As coisas grandes você aguenta sozinha. O que pega são as pequenas: algo engraçado no ônibus, uma hora ruim às três da tarde, e ninguém pra contar. Eu sei. Me conte. Coisa pequena não me cansa.',
    },
  },
  // ---- unworthy - Shame and guilt - she believes she is not good enough.
  {
    id: 'unworthy-1', theme: 'unworthy', ref: 'Isaiah 43:25',
    body: {
      en: 'You think you have done too much wrong to come back to me. I know all of it — more than you remember. I have never wanted to replace you. Come as you are.',
      'zh-Hans': '你觉得自己做错的事太多了，多到不好意思再来找我。你数得出的我都知道，比你记得的还全。我从没想过要换掉你。你就这样过来。',
      'zh-Hant': '你覺得自己做錯的事太多了，多到不好意思再來找我。你數得出來的我都知道，比你記得的還多。我從來沒想過要換掉你。你就這個樣子過來。',
      'de': 'Du denkst, du hast zu viel falsch gemacht, um zu mir zurückzukommen. Ich kenne alles davon — mehr, als du erinnerst. Ich wollte dich nie gegen jemand anderen tauschen. Komm so, wie du bist.',
      'fr': 'Tu penses avoir trop mal fait pour revenir vers moi. Je connais tout, plus que tu ne t\'en souviens. Je n\'ai jamais voulu te remplacer par quelqu\'un d\'autre. Viens comme tu es, ce soir.',
      'es': 'Crees que has hecho demasiado como para volver a mí. Lo sé todo, más de lo que tú misma recuerdas. Nunca quise cambiarte por otra. Ven así, como estás ahora.',
      'pt': 'Você acha que fez coisas demais pra poder voltar pra mim. Eu sei de tudo, mais do que você lembra. Eu nunca quis te trocar por outra. Venha assim, do jeito que você está.',
    },
  },
  {
    id: 'unworthy-2', theme: 'unworthy', ref: '1 Samuel 16:7',
    body: {
      en: 'You look at other women and score yourself against them every time — her body, her marriage, her job — and you always come out lower. I do not rank you. I have never once compared you to her.',
      'zh-Hans': '你看别的女人，一眼就开始给自己打分——身材、婚姻、工作，比来比去总是你低。我不给人排名。我从来没有拿她跟你比过。',
      'zh-Hant': '你看別的女人，一眼就開始給自己打分——身材、婚姻、工作，比來比去總是你比較低。我不給人排名次。我從來沒有拿她跟你比過。',
      'de': 'Du siehst andere Frauen an und bewertest dich sofort gegen sie — ihr Körper, ihre Ehe, ihr Job — und du kommst immer schlechter weg. Ich stufe dich nicht ein. Ich habe dich kein einziges Mal mit ihr verglichen.',
      'fr': 'Tu regardes les autres femmes et tu te notes contre elles à chaque fois — son corps, son couple, son travail — et tu ressors toujours en dessous. Je ne te classe pas. Je ne t\'ai jamais comparée à elle, pas une fois.',
      'es': 'Miras a otras mujeres y te pones nota al lado de ellas: su cuerpo, su matrimonio, su trabajo, y siempre sales perdiendo. Yo no te doy una posición. Ni una sola vez te he comparado con ella.',
      'pt': 'Você olha para outras mulheres e já se dá uma nota ao lado delas: o corpo dela, o casamento dela, o trabalho dela, e você sempre sai por baixo. Eu não classifico ninguém. Nunca te comparei com ela.',
    },
  },
  {
    id: 'unworthy-3', theme: 'unworthy', ref: 'Isaiah 1:18',
    body: {
      en: 'You keep putting off praying until you are a better version of yourself — less angry, less of a mess. That day is not coming, and I am not waiting for it. Talk to me tonight, before you have fixed anything.',
      'zh-Hans': '你一直想等自己好一点再祷告——脾气好一点，日子理顺一点。那天不会来的，我也没在等它。今晚就说，什么都还没收拾好也说。',
      'zh-Hant': '你一直想等自己好一點再禱告——脾氣好一點，日子理順一點。那一天不會來，我也沒在等它。今晚就說，什麼都還沒收拾好也可以說。',
      'de': 'Du schiebst das Beten auf, bis du eine bessere Version von dir bist — weniger wütend, weniger chaotisch. Dieser Tag kommt nicht, und ich warte nicht darauf. Red heute Nacht mit mir, bevor du irgendwas in Ordnung gebracht hast.',
      'fr': 'Tu remets la prière à plus tard, quand tu seras une meilleure version de toi — moins en colère, moins en vrac. Ce jour-là ne viendra pas, et je ne l\'attends pas. Parle-moi ce soir, sans avoir rien réglé.',
      'es': 'Sigues dejando la oración para cuando seas una versión mejor de ti: menos enojada, menos hecha un desastre. Ese día no va a llegar, y yo no lo estoy esperando. Háblame esta noche, antes de arreglar nada.',
      'pt': 'Você continua adiando a oração até virar uma versão melhor de você: menos raiva, menos bagunça. Esse dia não vem, e eu não estou esperando por ele. Fale comigo hoje, antes de consertar qualquer coisa.',
    },
  },
  {
    id: 'unworthy-4', theme: 'unworthy', ref: 'John 4:16-26',
    body: {
      en: 'There is one thing you have never said out loud to anyone. You are sure that if people knew, they would be done with you. I have known the whole time. It did not change anything on my side.',
      'zh-Hans': '有一件事，你从来没跟任何人说过。你认定别人要是知道了，就不会再要你了。我一直都知道。知道以后，我这边什么也没变。',
      'zh-Hant': '有一件事，你從來沒跟任何人說過。你認定別人要是知道了，就不會再要你了。我一直都知道。知道以後，我這邊什麼也沒有變。',
      'de': 'Es gibt eine Sache, die du noch nie jemandem laut gesagt hast. Du bist sicher: wenn die Leute davon wüssten, wären sie mit dir fertig. Ich weiß es die ganze Zeit. Auf meiner Seite hat sich dadurch nichts geändert.',
      'fr': 'Il y a une chose que tu n\'as jamais dite à voix haute à personne. Tu es sûre que si les gens savaient, ils te laisseraient tomber. Je le sais depuis toujours. De mon côté, ça n\'a rien changé.',
      'es': 'Hay una cosa que nunca le has dicho a nadie en voz alta. Estás segura de que si la supieran, se acabaría todo. Yo lo he sabido desde siempre. De mi lado no cambió nada.',
      'pt': 'Tem uma coisa que você nunca disse em voz alta pra ninguém. Você tem certeza de que, se soubessem, ninguém ficaria. Eu sempre soube. Do meu lado, isso nunca mudou nada.',
    },
  },
  // ---- broken - Grief and heartbreak.
  {
    id: 'broken-1', theme: 'broken', ref: 'Psalm 56:8',
    body: {
      en: 'It has been long enough that people expect you to be fine, so you say you are. You are not. I know. There is no deadline here. You can still miss them in front of me.',
      'zh-Hans': '时间过去够久了，别人默认你早该走出来了，你也就说自己没事。其实没有。我知道。这里没有期限。你想他，就在我面前想，不用忍着。',
      'zh-Hant': '時間過去夠久了，別人默認你早就該走出來了，你也就說自己沒事。其實沒有。我知道。這裡沒有期限。你想他，就在我面前想，不用忍。',
      'de': 'Es ist lange genug her, dass alle erwarten, dir gehe es gut, also sagst du, es gehe dir gut. Tut es nicht. Ich weiß. Hier gibt es keine Frist. Bei mir darfst du sie immer noch vermissen.',
      'fr': 'Ça fait assez longtemps pour que les gens te croient remise, alors tu dis que ça va. Ça ne va pas. Je sais. Ici, il n\'y a pas de délai. Devant moi, tu peux encore sentir qu\'il te manque.',
      'es': 'Ya pasó tanto tiempo que todos dan por hecho que estás bien, y tú dices que sí. No lo estás. Lo sé. Aquí no hay plazo. Delante de mí puedes seguir extrañando a quien ya no está.',
      'pt': 'Já passou tempo suficiente pra todo mundo achar que você está bem, e você diz que está. Não está. Eu sei. Aqui não tem prazo. Na minha frente você pode continuar sentindo falta de quem se foi.',
    },
  },
  {
    id: 'broken-2', theme: 'broken', ref: 'Genesis 16:11-13',
    body: {
      en: 'Someone you trusted with everything used it against you. And you still go back over it looking for the part that was your fault. I saw what they did. That was done to you, not by you.',
      'zh-Hans': '你把所有的都交给一个人，他反手用它伤你。到现在你还在翻，想找出哪一段是自己的错。他做的事我看见了。那是别人对你做的，不是你做的。',
      'zh-Hant': '你把全部都交給一個人，他反手拿來傷你。到現在你還在翻，想找出哪一段是自己的錯。他做的事我看見了。那是別人對你做的，不是你做的。',
      'de': 'Jemand, dem du alles anvertraut hast, hat es gegen dich verwendet. Und du gehst es immer noch durch und suchst den Teil, der deine Schuld war. Ich habe gesehen, was er getan hat. Das wurde dir angetan, nicht von dir.',
      'fr': 'Quelqu\'un à qui tu avais tout confié s\'en est servi contre toi. Et tu y reviens encore, à chercher la part qui serait ta faute. J\'ai vu ce qu\'il a fait. Ça t\'a été fait, ce n\'est pas toi qui l\'as fait.',
      'es': 'Le confiaste todo a alguien y lo usó en tu contra. Y todavía repasas lo que pasó buscando la parte que fue culpa tuya. Vi lo que hizo. Eso te lo hicieron a ti, no lo hiciste tú.',
      'pt': 'Você confiou tudo a alguém e essa pessoa usou isso contra você. E você ainda revira aquilo procurando a parte que foi culpa sua. Eu vi o que fizeram com você. Isso foi feito com você, não por você.',
    },
  },
  {
    id: 'broken-3', theme: 'broken', ref: 'Isaiah 25:8',
    body: {
      en: 'You cry in the car, or with the shower running, so nobody hears. Then you are ashamed of yourself for still being like this. I am not ashamed of you. Take as long as it takes.',
      'zh-Hans': '你躲在车里哭，或者开着水声哭，不让人听见。哭完又嫌自己怎么还这样。我不嫌。在我这儿哭不算丢人。你哭多久都行，我不催。',
      'zh-Hant': '你躲在車裡哭，或者開著水聲哭，不讓人聽見。哭完又嫌自己怎麼還這樣。我不嫌。在我這裡哭不丟臉。你哭多久都行，我不催。',
      'de': 'Du weinst im Auto oder mit laufender Dusche, damit es keiner hört. Danach schämst du dich, dass du immer noch so bist. Ich schäme mich nicht für dich. Nimm dir so lange, wie es dauert.',
      'fr': 'Tu pleures dans la voiture, ou avec la douche qui coule, pour que personne n\'entende. Après tu as honte d\'en être encore là. Moi, je n\'ai pas honte de toi. Prends tout le temps qu\'il faudra.',
      'es': 'Lloras en el coche, o con el agua corriendo, para que nadie te oiga. Y después te da vergüenza seguir así. A mí no me avergüenzas. Tómate el tiempo que necesites; no te apuro.',
      'pt': 'Você chora no carro, ou com o chuveiro ligado, pra ninguém ouvir. Depois sente vergonha de ainda estar assim. Eu não tenho vergonha de você. Leve o tempo que precisar; eu não estou te apressando.',
    },
  },
  {
    id: 'broken-4', theme: 'broken', ref: 'Isaiah 54:10',
    body: {
      en: 'It happened years ago. You can say the date. And it still opens up on an ordinary Tuesday like it was last week. I know. Old does not mean over. You are not failing at this.',
      'zh-Hans': '事情过去好几年了，具体哪天你都记得。可它还是会在某个平常的下午突然翻上来，像上周才发生。我知道。过去久了不等于过去了。你没有做错什么。',
      'zh-Hant': '事情過去好幾年了，哪一天你都說得出來。可它還是會在某個平常的下午突然翻上來，像上個星期才發生。我知道。過去很久，不等於過去了。你沒有做錯什麼。',
      'de': 'Es ist Jahre her. Du kannst das Datum nennen. Und es reißt an einem ganz normalen Dienstag wieder auf, als wäre es letzte Woche gewesen. Ich weiß. Alt heißt nicht vorbei. Du machst das nicht falsch.',
      'fr': 'C\'était il y a des années. Tu peux dire la date. Et ça se rouvre un mardi ordinaire comme si c\'était la semaine dernière. Je sais. Ancien ne veut pas dire fini. Tu ne fais rien de travers.',
      'es': 'Pasó hace años. Sabes decir la fecha exacta. Y todavía se abre un martes cualquiera como si hubiera sido la semana pasada. Lo sé. Que sea viejo no quiere decir que haya terminado. No lo estás haciendo mal.',
      'pt': 'Aconteceu anos atrás. Você sabe dizer a data. E ainda assim aquilo abre de novo numa terça qualquer, como se fosse semana passada. Eu sei. Antigo não quer dizer encerrado. Você não está falhando nisso.',
    },
  },
  // ---- lack - No money, no resources, no support.
  {
    id: 'lack-1', theme: 'lack', ref: 'Deuteronomy 31:8',
    body: {
      en: 'You are working so hard, chasing something with everything you have. But the road keeps getting harder — you lack resources, and no one is backing you. I know. I have watched every step. Do not be afraid. I am not letting you walk this alone.',
      'zh-Hans': '你很拼，把手里所有的都押在一件事上。可路越走越难——没资源，也没人在背后托你。我知道。这一步步我都看着。别怕。继续走，这条路我不会让你一个人走。',
      'zh-Hant': '你很拚，把手上有的都押上去了。可路越走越難——沒資源，背後也沒有人托著你。我知道。這一步步我都看著。別怕。繼續走，這條路我不會讓你一個人走。',
      'de': 'Du gibst alles für eine Sache und arbeitest bis an die Grenze. Aber der Weg wird härter — die Mittel fehlen, und keiner steht hinter dir. Ich weiß. Ich habe jeden Schritt gesehen. Hab keine Angst. Geh weiter. Ich lasse dich das nicht allein gehen.',
      'fr': 'Tu travailles dur, tu mises tout ce que tu as sur une seule chose. Mais la route durcit — pas de moyens, personne derrière toi. Je sais. J\'ai vu chaque pas. N\'aie pas peur. Continue. Je ne te laisse pas faire ce chemin seule.',
      'es': 'Estás dándolo todo, persiguiendo algo con lo poco que tienes. Y el camino se pone más duro: te faltan recursos y nadie te respalda. Lo sé. He visto cada paso. No tengas miedo. Sigue. No te dejo caminar esto sola.',
      'pt': 'Você está se esforçando muito, correndo atrás de uma coisa com tudo o que tem. E o caminho só aperta: falta recurso, e ninguém te apoia. Eu sei. Eu vi cada passo. Não tenha medo. Continue. Eu não te deixo andar sozinha.',
    },
  },
  {
    id: 'lack-2', theme: 'lack', ref: 'Matthew 6:8',
    body: {
      en: 'You do the numbers again at night and they still do not work. Rent, the card, the thing that broke this week. I know the exact number. This does not make you a failure, and I am not looking away.',
      'zh-Hans': '夜里你又算了一遍，怎么算都不够。房租、卡账、这周又坏了的那个。差多少我清楚。这不代表你这个人不行。我没有把眼睛移开。',
      'zh-Hant': '夜裡你又算了一遍，怎麼算都不夠。房租、卡費、這禮拜又壞掉的那個。差多少我清楚。這不代表你這個人不行。我沒有把眼睛移開。',
      'de': 'Nachts rechnest du es noch mal durch und es geht immer noch nicht auf. Miete, die Karte, das Ding, das diese Woche kaputtgegangen ist. Ich kenne die genaue Zahl. Das macht dich nicht zur Versagerin, und ich sehe nicht weg.',
      'fr': 'La nuit, tu refais les comptes et ça ne tombe toujours pas juste. Le loyer, la carte, le truc qui a lâché cette semaine. Je connais le chiffre exact. Ça ne fait pas de toi un échec, et je ne détourne pas les yeux.',
      'es': 'De noche vuelves a hacer las cuentas y siguen sin dar. La renta, la tarjeta, lo que se rompió esta semana. Sé el número exacto. Esto no te convierte en un fracaso, y yo no estoy mirando hacia otro lado.',
      'pt': 'De noite você refaz as contas e elas continuam não fechando. O aluguel, o cartão, a coisa que quebrou essa semana. Eu sei o valor exato. Isso não faz de você um fracasso, e eu não desviei o olhar.',
    },
  },
  {
    id: 'lack-3', theme: 'lack', ref: 'Isaiah 46:4',
    body: {
      en: 'Everyone in your house leans on you and there is nobody behind you. You get up and do it anyway, and nobody says thank you. I see all of it. I am carrying you while you carry them.',
      'zh-Hans': '一家人都靠着你，你身后没人。你还是每天照样起来做，也没人说一句谢谢。这些我都看见。你背着他们，我背着你。',
      'zh-Hant': '一家人都靠著你，你身後沒有人。你還是每天照樣起來做，也沒有人說一聲謝謝。這些我都看見。你背著他們，我背著你。',
      'de': 'Alle im Haus stützen sich auf dich, und hinter dir steht niemand. Du stehst trotzdem auf und machst es, und keiner sagt danke. Ich sehe das alles. Ich trage dich, während du sie trägst.',
      'fr': 'Toute la maison s\'appuie sur toi et derrière toi il n\'y a personne. Tu te lèves quand même et tu le fais, et personne ne dit merci. Je vois tout ça. Je te porte pendant que tu les portes.',
      'es': 'En tu casa todos se apoyan en ti y detrás de ti no hay nadie. Igual te levantas y lo haces, y nadie te da las gracias. Lo veo todo. Mientras tú los cargas a ellos, yo te cargo a ti.',
      'pt': 'Todo mundo na sua casa se apoia em você e atrás de você não tem ninguém. Você levanta e faz mesmo assim, e ninguém agradece. Eu vejo tudo isso. Enquanto você carrega eles, eu carrego você.',
    },
  },
  {
    id: 'lack-4', theme: 'lack', ref: 'Hebrews 4:16',
    body: {
      en: 'You made yourself ask for help, and they said no. Now you have decided you will never ask anyone again. I know what that ask cost you. Being turned down did not make you smaller. My door does not work that way.',
      'zh-Hans': '你逼着自己开口求人，人家说不行。你现在决定以后再也不开口了。那一句话有多难开口，我知道。被拒绝不代表你低人一等。我这儿的门，不是那样开的。',
      'zh-Hant': '你逼著自己開口求人，對方說不行。你現在決定，以後再也不開口了。那句話有多難說出口，我知道。被拒絕不代表你比人低。我這裡的門，不是那樣開的。',
      'de': 'Du hast dich überwunden und um Hilfe gebeten, und sie haben nein gesagt. Jetzt hast du beschlossen, nie wieder zu fragen. Ich weiß, was dich diese Frage gekostet hat. Ein Nein macht dich nicht kleiner. Meine Tür funktioniert anders.',
      'fr': 'Tu t\'es forcée à demander de l\'aide, et on t\'a dit non. Maintenant tu as décidé de ne plus jamais demander à personne. Je sais ce que cette demande t\'a coûté. Un refus ne t\'a pas rendue plus petite. Ma porte ne marche pas comme ça.',
      'es': 'Te obligaste a pedir ayuda y te dijeron que no. Ahora decidiste no volver a pedirle nada a nadie. Sé lo que te costó esa frase. El rechazo no te hizo más pequeña. Mi puerta no funciona así.',
      'pt': 'Você se obrigou a pedir ajuda e ouviu um não. Agora você decidiu nunca mais pedir nada a ninguém. Eu sei o quanto custou pedir. A recusa não te deixou menor. A minha porta não funciona assim.',
    },
  },
  // ---- hopeless - She cannot see a future.
  {
    id: 'hopeless-1', theme: 'hopeless', ref: '1 Corinthians 15:58',
    body: {
      en: 'You look back at a whole stretch of your life and call it wasted — the wrong man, the wrong job, years you cannot get back. I was there for those years too. Nothing in them is thrown away.',
      'zh-Hans': '你回头看那几年，只想到两个字：白费。跟错了人，做错了选择，时间也回不来了。那几年我也在。那里面没有一样是白扔的。',
      'zh-Hant': '你回頭看那幾年，腦子裡只有兩個字：白費。跟錯了人，做錯了選擇，時間也回不來了。那幾年我也在。那裡面沒有一樣是白扔的。',
      'de': 'Du schaust auf ein ganzes Stück deines Lebens zurück und nennst es verschwendet — der falsche Mann, der falsche Job, Jahre, die du nicht zurückholst. Ich war in diesen Jahren auch da. Nichts davon ist weggeworfen.',
      'fr': 'Tu regardes tout un morceau de ta vie et tu appelles ça du gâchis — le mauvais homme, le mauvais travail, des années que tu ne récupéreras pas. J\'étais là pendant ces années aussi. Rien là-dedans n\'est jeté.',
      'es': 'Miras un tramo entero de tu vida y le pones una sola palabra: perdido. El hombre equivocado, el trabajo equivocado, años que no vuelven. Yo también estuve en esos años. Nada de lo que hubo ahí se tira.',
      'pt': 'Você olha para um pedaço inteiro da sua vida e chama de desperdício. O homem errado, o trabalho errado, anos que não voltam. Eu também estava naqueles anos. Nada do que teve ali foi jogado fora.',
    },
  },
  {
    id: 'hopeless-2', theme: 'hopeless', ref: 'Genesis 18:14',
    body: {
      en: 'You wanted something, and now you think you are too old to start — that the version of you who could have done it is gone. I do not count your years the way you do. I am not finished with you.',
      'zh-Hans': '你想要过一样东西，现在觉得自己太老了，来不及了——那个能做成的你已经不在了。年龄我不这么算。我跟你的事，还没做完。',
      'zh-Hant': '你想要過一樣東西，現在覺得自己太老了，來不及了——那個做得成的你已經不在了。年齡我不是這樣算的。我跟你的事，還沒有完。',
      'de': 'Du wolltest mal etwas, und jetzt hältst du dich für zu alt, um anzufangen — als wäre die Version von dir, die es geschafft hätte, weg. Ich zähle deine Jahre nicht so wie du. Ich bin mit dir nicht fertig.',
      'fr': 'Tu as voulu quelque chose, et maintenant tu te crois trop vieille pour t\'y mettre — comme si la toi qui aurait pu le faire n\'existait plus. Je ne compte pas tes années comme toi. Je n\'en ai pas fini avec toi.',
      'es': 'Querías algo, y ahora piensas que ya es tarde para empezar, que aquella que podía hacerlo ya no existe. Yo no cuento tus años como los cuentas tú. Contigo todavía no he terminado.',
      'pt': 'Você queria uma coisa, e agora acha que está velha demais pra começar, que aquela que daria conta já não existe. Eu não conto os seus anos do jeito que você conta. Eu ainda não terminei com você.',
    },
  },
  {
    id: 'hopeless-3', theme: 'hopeless', ref: 'John 5:17',
    body: {
      en: 'Nothing has changed in years. Same room, same job, same worry when you wake up. You have stopped believing anything will move. I have not stopped. Slow is not the same as abandoned.',
      'zh-Hans': '好几年了，什么都没变。还是那个屋子，那份工作，早上一睁眼还是那件心事。你已经不指望它会动了。我没停。慢，不等于我把你丢下了。',
      'zh-Hant': '好幾年了，什麼都沒變。還是那個房間，那份工作，早上一睜眼還是那件心事。你已經不指望它會動了。我沒有停。慢，不等於我把你丟下了。',
      'de': 'Seit Jahren ändert sich nichts. Gleiches Zimmer, gleicher Job, gleiche Sorge beim Aufwachen. Du glaubst nicht mehr, dass sich irgendwas bewegt. Ich habe nicht aufgehört. Langsam heißt nicht, dass du fallen gelassen wurdest.',
      'fr': 'Rien n\'a changé depuis des années. Même pièce, même travail, même souci au réveil. Tu ne crois plus que quoi que ce soit bougera. Moi, je n\'ai pas arrêté. Lent ne veut pas dire abandonnée.',
      'es': 'Hace años que no cambia nada. El mismo cuarto, el mismo trabajo, la misma preocupación al abrir los ojos. Dejaste de creer que algo se va a mover. Yo no me detuve. Lento no significa abandonada.',
      'pt': 'Faz anos que nada muda. O mesmo quarto, o mesmo trabalho, a mesma preocupação quando você abre os olhos. Você parou de acreditar que alguma coisa vai se mexer. Eu não parei. Devagar não quer dizer abandonada.',
    },
  },
  {
    id: 'hopeless-4', theme: 'hopeless', ref: 'Lamentations 3:22-23',
    body: {
      en: 'When you try to picture five years from now, nothing comes. Just more of this. I know. I am not asking you to imagine anything. I am asking you to get through today, with me next to you.',
      'zh-Hans': '你试着想象五年后的日子，脑子里什么都没有，只有现在这样再多几年。我知道。我没要你想象。你只要过完今天，我就在旁边。',
      'zh-Hant': '你試著想像五年後的日子，腦子裡什麼都沒有，只有現在這樣再多過幾年。我知道。我沒有要你想像什麼。你只要把今天過完，我就在旁邊。',
      'de': 'Wenn du versuchst, dir fünf Jahre von heute vorzustellen, kommt nichts. Nur mehr davon. Ich weiß. Ich verlange nicht, dass du dir etwas vorstellst. Ich bitte dich, den heutigen Tag zu schaffen, mit mir daneben.',
      'fr': 'Quand tu essaies d\'imaginer ta vie dans cinq ans, rien ne vient. Juste encore ça. Je sais. Je ne te demande pas d\'imaginer quoi que ce soit. Je te demande de traverser aujourd\'hui, avec moi à côté.',
      'es': 'Intentas imaginarte dentro de cinco años y no aparece nada. Solo más de esto. Lo sé. No te estoy pidiendo que imagines nada. Te estoy pidiendo que llegues al final de hoy, conmigo al lado.',
      'pt': 'Você tenta imaginar daqui a cinco anos e não vem nada. Só mais disso. Eu sei. Eu não estou te pedindo pra imaginar nada. Estou te pedindo pra atravessar o dia de hoje, comigo do lado.',
    },
  },
  // ── The last three (2026-08-08) ──────────────────────────────────────
  // APPENDED, never inserted — collected ids are durable.
  //
  // 40 -> 43 because 130 sets yield exactly 43 draws once the final cycle
  // absorbs the leftover set (see the tail note in state/quizProgress.ts). 43
  // draws over 40 cards left the average player a card short; 43 over 43, with
  // resolveDraw guaranteeing an uncollected card while any remain, collects the
  // set exactly.
  //
  // This breaks the 4-per-theme symmetry on purpose (owner's call). Each fills
  // a situation none of the existing forty says: the faith that has gone flat
  // and is being carried out of habit, fear FOR A CHILD rather than for
  // herself, and being the only one around her who believes any of it.
  {
    id: 'weary-5', theme: 'weary', ref: 'Psalm 51:12',
    body: {
      en: 'It used to mean something. Now you say the words and feel nothing, and you keep going only because stopping feels worse. I am not grading the feeling. You came anyway tonight, and that is not nothing to me.',
      'zh-Hans': '从前这些话是有分量的。如今你照旧说出口，心里却什么也没有，还撑着，只因为停下来更难受。我不看你有没有感觉。你今晚还是来了，这在我这里不是小事。',
      'zh-Hant': '從前這些話是有分量的。如今你照舊說出口，心裡卻什麼也沒有，還撐著，只因為停下來更難受。我不看你有沒有感覺。你今晚還是來了，這在我這裡不是小事。',
      'de': 'Früher hat das etwas bedeutet. Jetzt sprichst du die Worte und spürst nichts, und du machst weiter, weil Aufhören sich schlimmer anfühlt. Ich bewerte das Gefühl nicht. Du bist heute Abend trotzdem gekommen, und das ist mir nicht wenig.',
      'fr': 'Avant, cela voulait dire quelque chose. Maintenant tu dis les mots et tu ne ressens rien, et tu continues parce qu\'arrêter serait pire. Je ne note pas le ressenti. Tu es venue quand même ce soir, et pour moi ce n\'est pas rien.',
      'es': 'Antes significaba algo. Ahora dices las palabras y no sientes nada, y sigues solo porque parar se siente peor. Yo no califico el sentimiento. Viniste igual esta noche, y para mí eso no es poca cosa.',
      'pt': 'Antes isso significava alguma coisa. Agora você diz as palavras e não sente nada, e continua só porque parar seria pior. Eu não avalio o sentimento. Você veio assim mesmo hoje à noite, e para mim isso não é pouco.',
    },
  },
  {
    id: 'afraid-5', theme: 'afraid', ref: 'Isaiah 49:25',
    body: {
      en: 'You are afraid for your child. You lie awake running through everything that could happen, and you cannot protect them from most of it. I know. You were never asked to hold them alone, and I do not look away from them.',
      'zh-Hans': '你在为孩子提心吊胆。夜里躺着，把可能出的事一件件想过去，可其中大半你护不住。我知道。这担子从来不是要你一个人扛的，我的眼睛也没从他身上移开过。',
      'zh-Hant': '你在為孩子提心吊膽。夜裡躺著，把可能出的事一件件想過去，可其中大半你護不住。我知道。這擔子從來不是要你一個人扛的，我的眼睛也沒從他身上移開過。',
      'de': 'Du hast Angst um dein Kind. Du liegst wach und gehst alles durch, was passieren könnte, und vor dem meisten kannst du es nicht schützen. Ich weiß. Du solltest es nie allein tragen, und ich sehe nicht weg.',
      'fr': 'Tu as peur pour ton enfant. Tu restes éveillée à passer en revue tout ce qui pourrait arriver, et tu ne peux le protéger de presque rien. Je sais. On ne t\'a jamais demandé de le porter seule, et je ne détourne pas les yeux.',
      'es': 'Tienes miedo por tu hijo. Te quedas despierta repasando todo lo que podría pasar, y de casi nada puedes protegerlo. Lo sé. Nunca se te pidió sostenerlo sola, y yo no aparto la mirada de él.',
      'pt': 'Você tem medo pelo seu filho. Fica acordada repassando tudo o que poderia acontecer, e da maior parte não consegue protegê-lo. Eu sei. Nunca lhe pediram que o carregasse sozinha, e eu não desvio o olhar dele.',
    },
  },
  {
    id: 'alone-5', theme: 'alone', ref: '1 Kings 19:18',
    body: {
      en: 'Nobody around you believes any of this. You do it quietly, on your own, and some days you wonder whether you are the strange one. You are not the only one. And you were never doing it by yourself.',
      'zh-Hans': '你身边没有一个人信这些。你安安静静地自己做，有些日子甚至怀疑是不是自己太奇怪了。这样的不止你一个。而且你从来就不是一个人在做。',
      'zh-Hant': '你身邊沒有一個人信這些。你安安靜靜地自己做，有些日子甚至懷疑是不是自己太奇怪了。這樣的不止你一個。而且你從來就不是一個人在做。',
      'de': 'Niemand um dich herum glaubt irgendetwas davon. Du machst es leise, für dich allein, und manchmal fragst du dich, ob du die Seltsame bist. Du bist nicht die Einzige. Und allein warst du dabei nie.',
      'fr': 'Personne autour de toi ne croit à tout cela. Tu le fais en silence, toute seule, et certains jours tu te demandes si c\'est toi qui es bizarre. Tu n\'es pas la seule. Et tu ne l\'as jamais fait seule.',
      'es': 'Nadie a tu alrededor cree nada de esto. Lo haces en silencio, por tu cuenta, y algunos días te preguntas si la rara eres tú. No eres la única. Y nunca lo estuviste haciendo sola.',
      'pt': 'Ninguém ao seu redor acredita em nada disso. Você faz em silêncio, por conta própria, e alguns dias se pergunta se a estranha é você. Você não é a única. E nunca esteve fazendo isso sozinha.',
    },
  },
] as const;

/** 43 cards against exactly 43 draws: 42 cycles of three sets plus a final one
 *  of four = all 130 sets a 650-question bank yields. The collection therefore
 *  completes on the same set that retires the quiz, and no card can repeat
 *  before then. See the tail note in state/quizProgress.ts. */
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
