import type { Mood } from '../components/MoodEmoji';
import type { UILanguageCode } from '../state/UILanguageContext';

// Per-mood "verse for how you feel" mapping. Each mood resolves to a verse
// reference + the verse text in every UI language using the canonical
// translation for that language (KJV, 和合本, Luther 1912, Louis Segond,
// Reina-Valera 1909, Almeida RC). EN texts come from the NIV-compatible
// public-domain WEB rendering so the wording is gender-neutral and modern.
//
// Refs are localized too — book names follow the convention of the language
// (e.g. "John" → "约翰福音", "Romanos" in pt, "Jean" in fr).
//
// Falls back to en if a language code is unrecognized.

export interface MoodVerse { ref: string; text: string }

type MoodVerseTable = Record<Mood, MoodVerse>;

const MOOD_VERSES_EN: MoodVerseTable = {
  angry: {
    ref: 'James 1:19-20',
    text: 'Be quick to listen, slow to speak and slow to become angry, because human anger does not produce the righteousness that God desires.',
  },
  weak: {
    ref: '2 Corinthians 12:9',
    text: 'My grace is sufficient for you, for my power is made perfect in weakness.',
  },
  anxious: {
    ref: 'Philippians 4:6-7',
    text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.',
  },
  fearful: {
    ref: 'Isaiah 41:10',
    text: 'So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you.',
  },
  faithful: {
    ref: 'Hebrews 11:1',
    text: 'Now faith is confidence in what we hope for and assurance about what we do not see.',
  },
  sad: {
    ref: 'Psalm 34:18',
    text: 'The Lord is close to the brokenhearted and saves those who are crushed in spirit.',
  },
  calm: {
    ref: 'Psalm 46:10',
    text: 'Be still, and know that I am God.',
  },
  happy: {
    ref: 'John 16:24',
    text: 'So far you haven\'t asked for anything in my name. Ask and you will receive so that you can be completely happy.',
  },
  blessed: {
    ref: 'Numbers 6:24-26',
    text: 'The Lord bless you and keep you; the Lord make his face shine on you and be gracious to you.',
  },
};

const MOOD_VERSES_ZH_HANS: MoodVerseTable = {
  angry: {
    ref: '雅各书 1:19-20',
    text: '你们各人要快快地听，慢慢地说，慢慢地动怒，因为人的怒气并不成就神的义。',
  },
  weak: {
    ref: '哥林多后书 12:9',
    text: '我的恩典够你用的，因为我的能力是在人的软弱上显得完全。',
  },
  anxious: {
    ref: '腓立比书 4:6-7',
    text: '应当一无挂虑，只要凡事藉着祷告、祈求和感谢，将你们所要的告诉神。',
  },
  fearful: {
    ref: '以赛亚书 41:10',
    text: '你不要害怕，因为我与你同在；不要惊惶，因为我是你的神。我必坚固你，我必帮助你。',
  },
  faithful: {
    ref: '希伯来书 11:1',
    text: '信就是所望之事的实底，是未见之事的确据。',
  },
  sad: {
    ref: '诗篇 34:18',
    text: '耶和华靠近伤心的人，拯救灵性痛悔的人。',
  },
  calm: {
    ref: '诗篇 46:10',
    text: '你们要休息，要知道我是神。',
  },
  happy: {
    ref: '约翰福音 16:24',
    text: '向来你们没有奉我的名求什么，如今你们求就必得着，叫你们的喜乐可以满足。',
  },
  blessed: {
    ref: '民数记 6:24-26',
    text: '愿耶和华赐福给你，保护你；愿耶和华使他的脸光照你，赐恩给你。',
  },
};

const MOOD_VERSES_ZH_HANT: MoodVerseTable = {
  angry: {
    ref: '雅各書 1:19-20',
    text: '你們各人要快快地聽，慢慢地說，慢慢地動怒，因為人的怒氣並不成就神的義。',
  },
  weak: {
    ref: '哥林多後書 12:9',
    text: '我的恩典夠你用的，因為我的能力是在人的軟弱上顯得完全。',
  },
  anxious: {
    ref: '腓立比書 4:6-7',
    text: '應當一無掛慮，只要凡事藉著禱告、祈求和感謝，將你們所要的告訴神。',
  },
  fearful: {
    ref: '以賽亞書 41:10',
    text: '你不要害怕，因為我與你同在；不要驚惶，因為我是你的神。我必堅固你，我必幫助你。',
  },
  faithful: {
    ref: '希伯來書 11:1',
    text: '信就是所望之事的實底，是未見之事的確據。',
  },
  sad: {
    ref: '詩篇 34:18',
    text: '耶和華靠近傷心的人，拯救靈性痛悔的人。',
  },
  calm: {
    ref: '詩篇 46:10',
    text: '你們要休息，要知道我是神。',
  },
  happy: {
    ref: '約翰福音 16:24',
    text: '向來你們沒有奉我的名求甚麼，如今你們求就必得著，叫你們的喜樂可以滿足。',
  },
  blessed: {
    ref: '民數記 6:24-26',
    text: '願耶和華賜福給你，保護你；願耶和華使他的臉光照你，賜恩給你。',
  },
};

const MOOD_VERSES_DE: MoodVerseTable = {
  angry: {
    ref: 'Jakobus 1,19-20',
    text: 'Ein jeder Mensch sei schnell zum Hören, langsam zum Reden, langsam zum Zorn. Denn des Menschen Zorn tut nicht, was vor Gott recht ist.',
  },
  weak: {
    ref: '2. Korinther 12,9',
    text: 'Lass dir an meiner Gnade genügen; denn meine Kraft ist in den Schwachen mächtig.',
  },
  anxious: {
    ref: 'Philipper 4,6-7',
    text: 'Sorgt euch um nichts, sondern in allen Dingen lasst eure Bitten in Gebet und Flehen mit Danksagung vor Gott kundwerden.',
  },
  fearful: {
    ref: 'Jesaja 41,10',
    text: 'Fürchte dich nicht, ich bin mit dir; weiche nicht, denn ich bin dein Gott. Ich stärke dich, ich helfe dir auch.',
  },
  faithful: {
    ref: 'Hebräer 11,1',
    text: 'Es ist aber der Glaube eine feste Zuversicht des, das man hofft, und ein Nichtzweifeln an dem, das man nicht sieht.',
  },
  sad: {
    ref: 'Psalm 34,19',
    text: 'Der Herr ist nahe denen, die zerbrochenen Herzens sind, und hilft denen, die ein zerschlagenes Gemüt haben.',
  },
  calm: {
    ref: 'Psalm 46,11',
    text: 'Seid stille und erkennet, dass ich Gott bin.',
  },
  happy: {
    ref: 'Johannes 16,24',
    text: 'Bisher habt ihr nichts gebeten in meinem Namen. Bittet, so werdet ihr nehmen, dass eure Freude vollkommen sei.',
  },
  blessed: {
    ref: '4. Mose 6,24-26',
    text: 'Der Herr segne dich und behüte dich; der Herr lasse sein Angesicht leuchten über dir und sei dir gnädig.',
  },
};

const MOOD_VERSES_FR: MoodVerseTable = {
  angry: {
    ref: 'Jacques 1:19-20',
    text: 'Que tout homme soit prompt à écouter, lent à parler, lent à se mettre en colère ; car la colère de l\'homme n\'accomplit pas la justice de Dieu.',
  },
  weak: {
    ref: '2 Corinthiens 12:9',
    text: 'Ma grâce te suffit, car ma puissance s\'accomplit dans la faiblesse.',
  },
  anxious: {
    ref: 'Philippiens 4:6-7',
    text: 'Ne vous inquiétez de rien ; mais en toute chose faites connaître vos besoins à Dieu par des prières et des supplications, avec des actions de grâces.',
  },
  fearful: {
    ref: 'Ésaïe 41:10',
    text: 'Ne crains rien, car je suis avec toi ; ne promène pas des regards inquiets, car je suis ton Dieu ; je te fortifie, je viens à ton secours.',
  },
  faithful: {
    ref: 'Hébreux 11:1',
    text: 'Or la foi est une ferme assurance des choses qu\'on espère, une démonstration de celles qu\'on ne voit pas.',
  },
  sad: {
    ref: 'Psaume 34:18',
    text: 'L\'Éternel est près de ceux qui ont le cœur brisé, et il sauve ceux qui ont l\'esprit abattu.',
  },
  calm: {
    ref: 'Psaume 46:10',
    text: 'Arrêtez, et sachez que je suis Dieu.',
  },
  happy: {
    ref: 'Jean 16:24',
    text: 'Jusqu\'à présent vous n\'avez rien demandé en mon nom. Demandez, et vous recevrez, afin que votre joie soit parfaite.',
  },
  blessed: {
    ref: 'Nombres 6:24-26',
    text: 'Que l\'Éternel te bénisse, et qu\'il te garde ! Que l\'Éternel fasse luire sa face sur toi, et qu\'il t\'accorde sa grâce !',
  },
};

const MOOD_VERSES_ES: MoodVerseTable = {
  angry: {
    ref: 'Santiago 1:19-20',
    text: 'Todo hombre sea pronto para oír, tardo para hablar, tardo para airarse; porque la ira del hombre no obra la justicia de Dios.',
  },
  weak: {
    ref: '2 Corintios 12:9',
    text: 'Bástate mi gracia; porque mi potencia en la flaqueza se perfecciona.',
  },
  anxious: {
    ref: 'Filipenses 4:6-7',
    text: 'Por nada estéis afanosos; sino sean notorias vuestras peticiones delante de Dios en toda oración y ruego, con hacimiento de gracias.',
  },
  fearful: {
    ref: 'Isaías 41:10',
    text: 'No temas, que yo soy contigo; no desmayes, que yo soy tu Dios que te esfuerzo: siempre te ayudaré.',
  },
  faithful: {
    ref: 'Hebreos 11:1',
    text: 'Es, pues, la fe la sustancia de las cosas que se esperan, la demostración de las cosas que no se ven.',
  },
  sad: {
    ref: 'Salmos 34:18',
    text: 'Cercano está Jehová a los quebrantados de corazón; y salvará a los contritos de espíritu.',
  },
  calm: {
    ref: 'Salmos 46:10',
    text: 'Estad quietos, y conoced que yo soy Dios.',
  },
  happy: {
    ref: 'Juan 16:24',
    text: 'Hasta ahora nada habéis pedido en mi nombre: pedid, y recibiréis, para que vuestro gozo sea cumplido.',
  },
  blessed: {
    ref: 'Números 6:24-26',
    text: 'Jehová te bendiga, y te guarde; Haga resplandecer Jehová su rostro sobre ti, y haya de ti misericordia.',
  },
};

const MOOD_VERSES_PT: MoodVerseTable = {
  angry: {
    ref: 'Tiago 1:19-20',
    text: 'Todo o homem seja pronto para ouvir, tardio para falar, tardio para se irar. Porque a ira do homem não opera a justiça de Deus.',
  },
  weak: {
    ref: '2 Coríntios 12:9',
    text: 'A minha graça te basta, porque o meu poder se aperfeiçoa na fraqueza.',
  },
  anxious: {
    ref: 'Filipenses 4:6-7',
    text: 'Não estejais inquietos por coisa alguma; antes as vossas petições sejam em tudo conhecidas diante de Deus pela oração e súplicas, com ação de graças.',
  },
  fearful: {
    ref: 'Isaías 41:10',
    text: 'Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te fortaleço, e te ajudo.',
  },
  faithful: {
    ref: 'Hebreus 11:1',
    text: 'Ora, a fé é o firme fundamento das coisas que se esperam, e a prova das coisas que se não veem.',
  },
  sad: {
    ref: 'Salmo 34:18',
    text: 'Perto está o Senhor dos que têm o coração quebrantado, e salva os contritos de espírito.',
  },
  calm: {
    ref: 'Salmo 46:10',
    text: 'Aquietai-vos, e sabei que eu sou Deus.',
  },
  happy: {
    ref: 'João 16:24',
    text: 'Até agora nada pedistes em meu nome; pedi, e recebereis, para que o vosso gozo se cumpra.',
  },
  blessed: {
    ref: 'Números 6:24-26',
    text: 'O Senhor te abençoe e te guarde; o Senhor faça resplandecer o seu rosto sobre ti, e tenha misericórdia de ti.',
  },
};

const MOOD_VERSES_BY_LANG: Record<UILanguageCode, MoodVerseTable> = {
  en: MOOD_VERSES_EN,
  'zh-Hans': MOOD_VERSES_ZH_HANS,
  'zh-Hant': MOOD_VERSES_ZH_HANT,
  de: MOOD_VERSES_DE,
  fr: MOOD_VERSES_FR,
  es: MOOD_VERSES_ES,
  pt: MOOD_VERSES_PT,
};

export function getMoodVerse(mood: Mood, lang: UILanguageCode): MoodVerse {
  return (MOOD_VERSES_BY_LANG[lang] || MOOD_VERSES_EN)[mood];
}

// Kept for any legacy callers that don't have the active UI language at
// hand. Prefer `getMoodVerse(mood, lang)`.
export const MOOD_VERSES = MOOD_VERSES_EN;

